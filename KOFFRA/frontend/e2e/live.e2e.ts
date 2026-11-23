/**
 * Test de bout en bout RÉEL : module crypto + client API du frontend contre l'API Laravel lancée.
 * Prérequis : base vierge, `php artisan serve`, MAIL_MAILER=log (mail-dev.log).
 * Lancement : voir infra/scripts/e2e.sh (variables KOFFRA_E2E_URL, KOFFRA_E2E_TOKEN, KOFFRA_E2E_MAILLOG).
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createAccountKeys,
  decryptExport,
  decryptFile,
  decryptItem,
  encryptFile,
  encryptItem,
  generateVaultKey,
  MIN_KDF_COST,
  openSealedVaultKey,
  prepareLogin,
  publicKeyFingerprint,
  sealVaultKeyFor,
  sha256Hex,
  unlockAccount,
  unwrapVaultKey,
  wrapVaultKey,
  type Envelope,
  type UnlockedAccount,
  type VaultKey,
} from '../src/crypto'
import { koffra, toApiAccountMaterial, type MeResponse } from '../src/services/api/koffra'
import { buildEncryptedExport, rotateVaultKey } from '../src/features/vault/operations'

const BASE = process.env.KOFFRA_E2E_URL ?? 'http://127.0.0.1:8000'
const TOKEN = process.env.KOFFRA_E2E_TOKEN ?? ''
const MAILLOG = process.env.KOFFRA_E2E_MAILLOG ?? ''

// --- Navigateur simulé : un « pot à cookies » par utilisateur -----------------
type Jar = Map<string, string>
const jars: Record<string, Jar> = { owner: new Map(), invitee: new Map() }
let current: Jar = jars.owner!
const use = (name: 'owner' | 'invitee') => {
  current = jars[name]!
  syncDocumentCookie()
}
function syncDocumentCookie() {
  ;(globalThis as { document?: { cookie: string } }).document = { cookie: current.has('XSRF-TOKEN') ? `XSRF-TOKEN=${current.get('XSRF-TOKEN')}` : '' }
}

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const headers = new Headers(init.headers)
  headers.set('Cookie', [...current].map(([k, v]) => `${k}=${v}`).join('; '))
  headers.set('Referer', 'http://localhost:5173/')
  headers.set('Origin', 'http://localhost:5173')
  headers.set('Connection', 'close')
  const res = await realFetch(BASE + String(input), { ...init, headers })
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(';')
    const [k, ...v] = pair!.split('=')
    current.set(k!.trim(), v.join('='))
  }
  syncDocumentCookie()
  return res
}) as typeof fetch

const lastMail = (pattern: RegExp): string => {
  const matches = [...readFileSync(MAILLOG, 'utf8').matchAll(new RegExp(pattern, 'g'))]
  const value = matches.at(-1)?.[1]
  if (!value) throw new Error(`Email introuvable (${pattern})`)
  return value
}
const lastCode = () => lastMail(/code de vérification KOFFRA est : (\d{6})/)

async function unlockFrom(me: MeResponse, password: string): Promise<{ account: UnlockedAccount; keys: Map<number, VaultKey> }> {
  const { wrapKey } = await prepareLogin(password, me.keys.kdf_params)
  const account = await unlockAccount(wrapKey, {
    userUuid: me.user.uuid,
    encryptedUserKey: me.keys.encrypted_user_key,
    publicKey: me.keys.public_key,
    encryptedPrivateKey: me.keys.encrypted_private_key,
  })
  const keys = new Map<number, VaultKey>()
  for (const g of me.keys.vault_key_grants) {
    if (g.type === 'confirmed') keys.set(g.key_version, await unwrapVaultKey(account, g.encrypted_key as Envelope, g.key_version))
    else {
      const k = await openSealedVaultKey(account, g.encrypted_key as string, g.key_version)
      await koffra.confirmVault(g.key_version, await wrapVaultKey(account, k))
      keys.set(g.key_version, k)
    }
  }
  return { account, keys }
}

const OWNER_PASSWORD = 'Propriétaire : phrase de passe e2e 2026 !'
const INVITEE_PASSWORD = 'Invité : autre phrase de passe e2e 2026 ?'
const SECRET = 'Mot-de-passe-Bancaire-Ultra-Secret-987'
const itemUuid = crypto.randomUUID()
let owner: { account: UnlockedAccount; keys: Map<number, VaultKey> }
let ownerMe: MeResponse

describe('KOFFRA de bout en bout (API réelle + chiffrement réel)', () => {
  beforeAll(() => {
    if (!TOKEN || !MAILLOG) throw new Error('KOFFRA_E2E_TOKEN et KOFFRA_E2E_MAILLOG requis')
    use('owner')
  })

  it('installe le propriétaire : clés générées localement, code email, coffre v1', async () => {
    expect((await koffra.setupStatus()).installed).toBe(false)
    const start = await koffra.setupStart({ token: TOKEN, name: 'Propriétaire E2E', email: 'owner@koffra.test' })
    const created = await createAccountKeys(OWNER_PASSWORD, start.user_uuid, MIN_KDF_COST)
    const vk = await generateVaultKey(1)
    await koffra.setupComplete({ ...toApiAccountMaterial(created.material), vault_key: await wrapVaultKey(created.account, vk), code: lastCode(), device_label: 'E2E propriétaire' })

    ownerMe = await koffra.me()
    expect(ownerMe.user.email).toBe('owner@koffra.test')
    owner = await unlockFrom(ownerMe, OWNER_PASSWORD)
    expect(owner.keys.get(1)?.key).toEqual(vk.key)
  })

  it('enregistre une entrée chiffrée que le serveur ne peut pas lire', async () => {
    const key = owner.keys.get(1)!
    const data = { type: 'login', title: 'Banque E2E', fields: { username: 'compta', password: SECRET }, custom: [], notes: '', attachments: [] }
    await koffra.createItem({ uuid: itemUuid, key_version: 1, payload: await encryptItem(key, itemUuid, data), category_uuid: null, favorite: true })

    const items = await koffra.allItems()
    expect(JSON.stringify(items)).not.toContain(SECRET)
    expect(JSON.stringify(items)).not.toContain('Banque E2E')
    expect(await decryptItem(key, itemUuid, items[0]!.payload)).toEqual(data)
  })

  it('ajoute puis relit une pièce jointe chiffrée', async () => {
    const attUuid = crypto.randomUUID()
    const plain = new TextEncoder().encode('Contrat confidentiel E2E '.repeat(5000))
    const { fileKey, data } = await encryptFile(plain, attUuid)
    await koffra.uploadAttachment(itemUuid, attUuid, data, await sha256Hex(data))
    const downloaded = await koffra.downloadAttachment(attUuid)
    expect(new TextDecoder().decode(downloaded)).not.toContain('Contrat confidentiel')
    expect(await decryptFile(downloaded, fileKey, attUuid)).toEqual(plain)
  })

  it('invite un admin, vérifie son empreinte et lui transmet le coffre (sealed box)', async () => {
    const { authKey } = await prepareLogin(OWNER_PASSWORD, ownerMe.keys.kdf_params)
    await koffra.reauth(authKey)
    await koffra.invite('admin2@koffra.test')
    const token = lastMail(/invitation#([A-Za-z0-9_-]{43})/)

    use('invitee')
    const start = await koffra.invitationStart(token)
    const created = await createAccountKeys(INVITEE_PASSWORD, start.user_uuid, MIN_KDF_COST)
    await koffra.invitationAccept({ ...toApiAccountMaterial(created.material), name: 'Admin E2E', device_label: 'E2E invité' })
    const inviteeFingerprint = await publicKeyFingerprint(created.material.publicKey)
    await expect(koffra.allItems()).rejects.toMatchObject({ status: 403 }) // pas encore d'accès

    use('owner')
    const admin = (await koffra.admins()).data.find((a) => a.email === 'admin2@koffra.test')!
    expect(await publicKeyFingerprint(admin.public_key)).toBe(inviteeFingerprint) // comparaison « hors bande »
    await koffra.reauth(authKey)
    await koffra.grantVault(admin.uuid, 1, await sealVaultKeyFor(admin.public_key, owner.keys.get(1)!))

    use('invitee')
    const invitee = await unlockFrom(await koffra.me(), INVITEE_PASSWORD) // confirme l'accès scellé
    const items = await koffra.allItems()
    expect((await decryptItem(invitee.keys.get(1)!, itemUuid, items[0]!.payload)).fields).toMatchObject({ password: SECRET })
    expect((await koffra.me()).keys.vault_key_grants.map((g) => g.type)).toEqual(['confirmed'])
  })

  it('effectue la rotation de la clé : tout est re-chiffré et l’invité suit', async () => {
    use('owner')
    const { authKey } = await prepareLogin(OWNER_PASSWORD, ownerMe.keys.kdf_params)
    await koffra.reauth(authKey)
    const version = await rotateVaultKey(owner.account, owner.keys, 1, (await koffra.admins()).data)
    expect(version).toBe(2)
    expect((await koffra.vaultKeyStatus()).active_version).toBe(2)

    use('invitee')
    const invitee = await unlockFrom(await koffra.me(), INVITEE_PASSWORD)
    const item = (await koffra.allItems())[0]!
    expect(item.key_version).toBe(2)
    expect(((await decryptItem(invitee.keys.get(2)!, itemUuid, item.payload)).fields as Record<string, string>).password).toBe(SECRET)
  })

  it('produit un export chiffré relisible avec la seule phrase d’export', async () => {
    use('owner')
    ownerMe = await koffra.me()
    owner = await unlockFrom(ownerMe, OWNER_PASSWORD)
    const { authKey } = await prepareLogin(OWNER_PASSWORD, ownerMe.keys.kdf_params)
    await koffra.reauth(authKey)
    const file = await buildEncryptedExport(owner.keys, 'phrase d’export e2e très longue', MIN_KDF_COST)
    expect(JSON.stringify(file)).not.toContain(SECRET)
    const content = (await decryptExport(file, 'phrase d’export e2e très longue')) as { items: { data: { title: string } }[] }
    expect(content.items[0]!.data.title).toBe('Banque E2E')
  })

  it('consigne les actions au journal sans aucun secret', async () => {
    const log = JSON.stringify((await koffra.activity()).data)
    expect(log).toContain('vault.rotation_completed')
    expect(log).toContain('export.created')
    expect(log).not.toContain(SECRET)
  })
})
