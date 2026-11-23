// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  changePassword,
  createAccountKeys,
  CryptoError,
  decryptCategoryName,
  decryptFile,
  decryptItem,
  derivePasswordKeys,
  encryptCategoryName,
  encryptFile,
  encryptItem,
  formatRecoveryKey,
  fromB64,
  generateKdfParams,
  generateRecoveryKey,
  generateVaultKey,
  lockAccount,
  MIN_KDF_COST,
  open,
  openSealedVaultKey,
  parseRecoveryKey,
  prepareLogin,
  prepareRecovery,
  publicKeyFingerprint,
  recoverAccount,
  reencryptItem,
  seal,
  sealVaultKeyFor,
  toB64,
  unlockAccount,
  unwrapVaultKey,
  wrapVaultKey,
  type Envelope,
  type KdfParams,
} from './index'

// Coût minimal autorisé pour garder des tests rapides (le plancher reste appliqué).
const FAST = MIN_KDF_COST
const USER_A = '0b1e8d6c-1111-4a5b-9c1d-aaaaaaaaaaaa'
const USER_B = '0b1e8d6c-2222-4a5b-9c1d-bbbbbbbbbbbb'
const ITEM = '5f0c2a4e-3333-4d6e-8f70-cccccccccccc'

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

async function expectCryptoError(promise: Promise<unknown>, code: CryptoError['code']) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(CryptoError)
  expect((error as CryptoError).code).toBe(code)
}

/** Modifie un octet d'une valeur base64url. */
async function flipByte(b64: string, index = 0): Promise<string> {
  const raw = await fromB64(b64)
  raw[index] = (raw[index] ?? 0) ^ 0x01
  return toB64(raw)
}

describe('AEAD XChaCha20-Poly1305', () => {
  const key = bytes(32, 1)

  it('chiffre et déchiffre (aller-retour)', async () => {
    const env = await seal(key, new TextEncoder().encode('secret'), 'ctx')
    expect(new TextDecoder().decode(await open(key, env, 'ctx'))).toBe('secret')
    expect(env.v).toBe(1)
  })

  it('rejette un ciphertext modifié (tag Poly1305)', async () => {
    const env = await seal(key, bytes(40), 'ctx')
    await expectCryptoError(open(key, { ...env, c: await flipByte(env.c, 5) }, 'ctx'), 'DECRYPT_FAILED')
  })

  it('rejette un tag modifié, un nonce modifié, une mauvaise clé ou de mauvaises données associées', async () => {
    const env = await seal(key, bytes(40), 'ctx')
    const raw = await fromB64(env.c)
    await expectCryptoError(open(key, { ...env, c: await flipByte(env.c, raw.length - 1) }, 'ctx'), 'DECRYPT_FAILED')
    await expectCryptoError(open(key, { ...env, n: await flipByte(env.n) }, 'ctx'), 'DECRYPT_FAILED')
    await expectCryptoError(open(bytes(32, 2), env, 'ctx'), 'DECRYPT_FAILED')
    await expectCryptoError(open(key, env, 'autre-ctx'), 'DECRYPT_FAILED')
  })

  it('utilise un nonce unique à chaque chiffrement', async () => {
    const nonces = new Set<string>()
    const ciphertexts = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const env = await seal(key, bytes(16), 'ctx')
      nonces.add(env.n)
      ciphertexts.add(env.c)
    }
    expect(nonces.size).toBe(500)
    expect(ciphertexts.size).toBe(500)
  })

  it('refuse une version inconnue ou une enveloppe malformée', async () => {
    const env = await seal(key, bytes(8), 'ctx')
    await expectCryptoError(open(key, { ...env, v: 2 } as unknown as Envelope, 'ctx'), 'UNSUPPORTED_VERSION')
    await expectCryptoError(open(key, { v: 1, n: 'x' } as unknown as Envelope, 'ctx'), 'INVALID_FORMAT')
    await expectCryptoError(open(key, { ...env, n: '!!!' }, 'ctx'), 'INVALID_FORMAT')
  })
})

describe('Dérivation Argon2id', () => {
  it('est déterministe pour un même mot de passe et des sous-clés authKey/wrapKey distinctes', async () => {
    const params = await generateKdfParams(FAST)
    const a = await derivePasswordKeys('Correct Horse 42!', params)
    const b = await derivePasswordKeys('Correct Horse 42!', params)
    expect(a.authKey).toEqual(b.authKey)
    expect(a.wrapKey).toEqual(b.wrapKey)
    expect(a.authKey).not.toEqual(a.wrapKey)
    expect(a.authKey).toHaveLength(32)
  })

  it('produit des clés différentes avec un autre sel ou un autre mot de passe', async () => {
    const p1 = await generateKdfParams(FAST)
    const p2 = await generateKdfParams(FAST)
    expect(p1.salt).not.toBe(p2.salt)
    const a = await derivePasswordKeys('mot-de-passe', p1)
    expect((await derivePasswordKeys('mot-de-passe', p2)).authKey).not.toEqual(a.authKey)
    expect((await derivePasswordKeys('mot-de-passf', p1)).authKey).not.toEqual(a.authKey)
  })

  it('normalise l’Unicode (NFKC) : « é » composé ou décomposé donne la même clé', async () => {
    const params = await generateKdfParams(FAST)
    const composed = await derivePasswordKeys('café', params)
    const decomposed = await derivePasswordKeys('café', params)
    expect(composed.authKey).toEqual(decomposed.authKey)
  })

  it('refuse des paramètres trop faibles (serveur compromis) ou démesurés', async () => {
    const params = await generateKdfParams(FAST)
    await expectCryptoError(derivePasswordKeys('x', { ...params, ops: 1 }), 'WEAK_KDF_PARAMS')
    await expectCryptoError(derivePasswordKeys('x', { ...params, mem: 8 * 1024 * 1024 }), 'WEAK_KDF_PARAMS')
    await expectCryptoError(derivePasswordKeys('x', { ...params, mem: 4096 * 1024 * 1024 }), 'INVALID_FORMAT')
    await expectCryptoError(derivePasswordKeys('x', { ...params, salt: 'AAAA' }), 'INVALID_FORMAT')
    await expectCryptoError(
      derivePasswordKeys('x', { ...params, alg: 'argon2i13' } as unknown as KdfParams),
      'INVALID_FORMAT',
    )
    await expectCryptoError(generateKdfParams({ ops: 1, mem: MIN_KDF_COST.mem }), 'WEAK_KDF_PARAMS')
  })

  it('refuse un mot de passe vide', async () => {
    await expectCryptoError(derivePasswordKeys('', await generateKdfParams(FAST)), 'INVALID_FORMAT')
  })
})

describe('Clé de récupération', () => {
  it('se formate en groupes base32 et se relit (aller-retour)', async () => {
    const { key, formatted } = await generateRecoveryKey()
    expect(formatted).toMatch(/^([0-9A-HJKMNP-TV-Z]{5}-){10}[0-9A-HJKMNP-TV-Z]{5}$/)
    expect(await parseRecoveryKey(formatted)).toEqual(key)
  })

  it('tolère minuscules, espaces et confusions O/0, I/L/1', async () => {
    const key = bytes(32, 0)
    const formatted = await formatRecoveryKey(key) // ne contient que des « 0 » au début
    const messy = ` ${formatted.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o')} `
    expect(await parseRecoveryKey(messy)).toEqual(key)
  })

  it('détecte une faute de frappe (somme de contrôle) et une longueur incorrecte', async () => {
    const { formatted } = await generateRecoveryKey()
    const first = formatted[0] === 'A' ? 'B' : 'A'
    await expectCryptoError(parseRecoveryKey(first + formatted.slice(1)), 'INVALID_RECOVERY_KEY')
    await expectCryptoError(parseRecoveryKey(formatted.slice(0, -6)), 'INVALID_RECOVERY_KEY')
    await expectCryptoError(parseRecoveryKey(formatted + 'A'), 'INVALID_RECOVERY_KEY')
    await expectCryptoError(parseRecoveryKey('UUUUU'), 'INVALID_RECOVERY_KEY')
  })
})

describe('Compte : création, connexion, mot de passe, récupération', () => {
  const PASSWORD = 'Un mot de passe long & solide 2026'

  it('crée un compte puis le déverrouille avec le bon mot de passe', async () => {
    const created = await createAccountKeys(PASSWORD, USER_A, FAST)
    const login = await prepareLogin(PASSWORD, created.material.password.kdf)
    expect(login.authKey).toBe(created.material.password.authKey)

    const account = await unlockAccount(login.wrapKey, {
      userUuid: USER_A,
      encryptedUserKey: created.material.password.encryptedUserKey,
      publicKey: created.material.publicKey,
      encryptedPrivateKey: created.material.encryptedPrivateKey,
    })
    expect(account.userKey).toEqual(created.account.userKey)
    expect(account.privateKey).toEqual(created.account.privateKey)
    // la wrapKey est effacée après usage
    expect(login.wrapKey.every((b) => b === 0)).toBe(true)
  })

  it('n’envoie au serveur aucun secret en clair', async () => {
    const created = await createAccountKeys(PASSWORD, USER_A, FAST)
    const sent = JSON.stringify(created.material)
    expect(sent).not.toContain(PASSWORD)
    expect(sent).not.toContain(created.recoveryKey)
    expect(sent).not.toContain(created.recoveryKey.replace(/-/g, ''))
    expect(sent).not.toContain(await toB64(created.account.userKey))
    expect(sent).not.toContain(await toB64(created.account.privateKey))
    const { wrapKey } = await derivePasswordKeys(PASSWORD, created.material.password.kdf)
    expect(sent).not.toContain(await toB64(wrapKey))
  })

  it('refuse un mauvais mot de passe', async () => {
    const created = await createAccountKeys(PASSWORD, USER_A, FAST)
    const login = await prepareLogin('mauvais mot de passe', created.material.password.kdf)
    expect(login.authKey).not.toBe(created.material.password.authKey)
    await expectCryptoError(
      unlockAccount(login.wrapKey, {
        userUuid: USER_A,
        encryptedUserKey: created.material.password.encryptedUserKey,
        publicKey: created.material.publicKey,
        encryptedPrivateKey: created.material.encryptedPrivateKey,
      }),
      'DECRYPT_FAILED',
    )
  })

  it('refuse une enveloppe déplacée vers un autre utilisateur (données associées)', async () => {
    const created = await createAccountKeys(PASSWORD, USER_A, FAST)
    const { wrapKey } = await prepareLogin(PASSWORD, created.material.password.kdf)
    await expectCryptoError(
      unlockAccount(wrapKey, {
        userUuid: USER_B,
        encryptedUserKey: created.material.password.encryptedUserKey,
        publicKey: created.material.publicKey,
        encryptedPrivateKey: created.material.encryptedPrivateKey,
      }),
      'DECRYPT_FAILED',
    )
  })

  it('détecte une clé publique substituée par le serveur', async () => {
    const a = await createAccountKeys(PASSWORD, USER_A, FAST)
    const b = await createAccountKeys(PASSWORD, USER_B, FAST)
    const { wrapKey } = await prepareLogin(PASSWORD, a.material.password.kdf)
    await expectCryptoError(
      unlockAccount(wrapKey, {
        userUuid: USER_A,
        encryptedUserKey: a.material.password.encryptedUserKey,
        publicKey: b.material.publicKey,
        encryptedPrivateKey: a.material.encryptedPrivateKey,
      }),
      'KEY_MISMATCH',
    )
  })

  it('change le mot de passe sans changer la userKey', async () => {
    const created = await createAccountKeys(PASSWORD, USER_A, FAST)
    const updated = await changePassword(created.account, 'Nouveau mot de passe 2027', FAST)
    expect(updated.kdf.salt).not.toBe(created.material.password.kdf.salt)

    const stored = {
      userUuid: USER_A,
      encryptedUserKey: updated.encryptedUserKey,
      publicKey: created.material.publicKey,
      encryptedPrivateKey: created.material.encryptedPrivateKey,
    }
    const ok = await unlockAccount((await prepareLogin('Nouveau mot de passe 2027', updated.kdf)).wrapKey, stored)
    expect(ok.userKey).toEqual(created.account.userKey)
    await expectCryptoError(
      unlockAccount((await prepareLogin(PASSWORD, updated.kdf)).wrapKey, stored),
      'DECRYPT_FAILED',
    )
  })

  it('récupère le compte avec la clé de récupération et en émet une nouvelle', async () => {
    const created = await createAccountKeys(PASSWORD, USER_A, FAST)
    const proof = await prepareRecovery(created.recoveryKey.toLowerCase())
    expect(proof.authKey).toBe(created.material.recovery.authKey)
    expect(proof.fingerprint).toBe(created.material.recovery.fingerprint)

    const result = await recoverAccount(
      proof.wrapKey,
      {
        userUuid: USER_A,
        encryptedUserKey: created.material.password.encryptedUserKey,
        encryptedUserKeyByRecovery: created.material.recovery.encryptedUserKey,
        publicKey: created.material.publicKey,
        encryptedPrivateKey: created.material.encryptedPrivateKey,
      },
      'Mot de passe après récupération',
      FAST,
    )
    expect(result.account.userKey).toEqual(created.account.userKey)
    expect(result.recoveryKey).not.toBe(created.recoveryKey)
    expect(result.recovery.fingerprint).not.toBe(created.material.recovery.fingerprint)

    const relogin = await prepareLogin('Mot de passe après récupération', result.password.kdf)
    const account = await unlockAccount(relogin.wrapKey, {
      userUuid: USER_A,
      encryptedUserKey: result.password.encryptedUserKey,
      publicKey: created.material.publicKey,
      encryptedPrivateKey: created.material.encryptedPrivateKey,
    })
    expect(account.privateKey).toEqual(created.account.privateKey)
  })

  it('refuse une clé de récupération d’un autre compte', async () => {
    const a = await createAccountKeys(PASSWORD, USER_A, FAST)
    const b = await createAccountKeys(PASSWORD, USER_B, FAST)
    const proof = await prepareRecovery(b.recoveryKey)
    await expectCryptoError(
      recoverAccount(
        proof.wrapKey,
        {
          userUuid: USER_A,
          encryptedUserKey: a.material.password.encryptedUserKey,
          encryptedUserKeyByRecovery: a.material.recovery.encryptedUserKey,
          publicKey: a.material.publicKey,
          encryptedPrivateKey: a.material.encryptedPrivateKey,
        },
        'x',
        FAST,
      ),
      'DECRYPT_FAILED',
    )
  })

  it('efface les clés au verrouillage', async () => {
    const { account } = await createAccountKeys(PASSWORD, USER_A, FAST)
    await lockAccount(account)
    expect(account.userKey.every((b) => b === 0)).toBe(true)
    expect(account.privateKey.every((b) => b === 0)).toBe(true)
  })
})

describe('Coffre partagé', () => {
  it('enveloppe la vaultKey pour son propriétaire et la relit', async () => {
    const { account } = await createAccountKeys('pw-a', USER_A, FAST)
    const vk = await generateVaultKey(1)
    const env = await wrapVaultKey(account, vk)
    expect((await unwrapVaultKey(account, env, 1)).key).toEqual(vk.key)
    await expectCryptoError(unwrapVaultKey(account, env, 2), 'DECRYPT_FAILED')
  })

  it('partage la vaultKey avec un admin invité (sealed box) qui la confirme ensuite', async () => {
    const owner = (await createAccountKeys('pw-a', USER_A, FAST)).account
    const invitee = await createAccountKeys('pw-b', USER_B, FAST)
    const vk = await generateVaultKey(3)

    const sealed = await sealVaultKeyFor(invitee.material.publicKey, vk)
    const received = await openSealedVaultKey(invitee.account, sealed, 3)
    expect(received.key).toEqual(vk.key)

    // version différente annoncée par le serveur → refus
    await expectCryptoError(openSealedVaultKey(invitee.account, sealed, 4), 'KEY_MISMATCH')
    // un tiers ne peut pas l'ouvrir
    await expectCryptoError(openSealedVaultKey(owner, sealed, 3), 'DECRYPT_FAILED')

    // confirmation : ré-enveloppe avec sa propre userKey
    const confirmed = await wrapVaultKey(invitee.account, received)
    expect((await unwrapVaultKey(invitee.account, confirmed, 3)).key).toEqual(vk.key)
  })

  it('affiche une empreinte de clé publique stable et lisible', async () => {
    const { material } = await createAccountKeys('pw', USER_A, FAST)
    const fp = await publicKeyFingerprint(material.publicKey)
    expect(fp).toMatch(/^([0-9A-F]{4} ){9}[0-9A-F]{4}$/)
    expect(await publicKeyFingerprint(material.publicKey)).toBe(fp)
  })

  it('chiffre une entrée, refuse son déplacement ou une mauvaise version de clé', async () => {
    const vk = await generateVaultKey(1)
    const payload = { type: 'login', title: 'Banque', username: 'jdupont', password: 'S3cr3t!' }
    const env = await encryptItem(vk, ITEM, payload)
    expect(JSON.stringify(env)).not.toContain('S3cr3t!')
    expect(await decryptItem(vk, ITEM, env)).toEqual(payload)

    await expectCryptoError(decryptItem(vk, '5f0c2a4e-9999-4d6e-8f70-cccccccccccc', env), 'DECRYPT_FAILED')
    await expectCryptoError(decryptItem({ version: 2, key: vk.key }, ITEM, env), 'DECRYPT_FAILED')
  })

  it('effectue la rotation de clé : la nouvelle clé lit, l’ancienne ne lit plus', async () => {
    const v1 = await generateVaultKey(1)
    const v2 = await generateVaultKey(2)
    const env1 = await encryptItem(v1, ITEM, { title: 'x', secret: 'y' })
    const env2 = await reencryptItem(v1, v2, ITEM, env1)
    expect(env2.n).not.toBe(env1.n)
    expect(await decryptItem(v2, ITEM, env2)).toEqual({ title: 'x', secret: 'y' })
    await expectCryptoError(decryptItem({ version: 2, key: v1.key }, ITEM, env2), 'DECRYPT_FAILED')
  })

  it('chiffre les noms de catégorie', async () => {
    const vk = await generateVaultKey(1)
    const env = await encryptCategoryName(vk, ITEM, 'Clés API')
    expect(await decryptCategoryName(vk, ITEM, env)).toBe('Clés API')
  })

  it('refuse une version de clé invalide', async () => {
    await expectCryptoError(generateVaultKey(0), 'INVALID_FORMAT')
    await expectCryptoError(generateVaultKey(1.5), 'INVALID_FORMAT')
  })
})

describe('Pièces jointes (secretstream)', () => {
  const ATT = '9a8b7c6d-4444-4e5f-a0b1-dddddddddddd'
  const sample = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31) % 251)

  it.each([0, 1, 65536, 65537, 200_000])('chiffre et déchiffre un fichier de %i octets', async (size) => {
    const plain = sample(size)
    const { fileKey, data } = await encryptFile(plain, ATT)
    expect(await decryptFile(data, fileKey, ATT)).toEqual(plain)
  })

  it('détecte une altération, une troncature, un ajout, une mauvaise clé ou un mauvais fichier', async () => {
    const plain = sample(150_000)
    const { fileKey, data } = await encryptFile(plain, ATT)

    const tampered = data.slice()
    tampered[100] = (tampered[100] ?? 0) ^ 1
    await expectCryptoError(decryptFile(tampered, fileKey, ATT), 'DECRYPT_FAILED')

    // suppression du dernier bloc (troncature propre à une frontière de bloc)
    const truncated = data.slice(0, 24 + 2 * (65536 + 17))
    await expectCryptoError(decryptFile(truncated, fileKey, ATT), 'DECRYPT_FAILED')

    const appended = new Uint8Array(data.length + 10)
    appended.set(data)
    await expectCryptoError(decryptFile(appended, fileKey, ATT), 'DECRYPT_FAILED')

    await expectCryptoError(decryptFile(data, new Uint8Array(32), ATT), 'DECRYPT_FAILED')
    await expectCryptoError(decryptFile(data, fileKey, '9a8b7c6d-0000-4e5f-a0b1-dddddddddddd'), 'DECRYPT_FAILED')
  })
})
