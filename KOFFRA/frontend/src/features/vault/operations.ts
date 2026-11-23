import {
  decryptCategoryName,
  decryptExport,
  decryptItem,
  encryptCategoryName,
  encryptExport,
  encryptItem,
  generateVaultKey,
  reencryptItem,
  sealVaultKeyFor,
  wrapVaultKey,
  type ExportFile,
  type UnlockedAccount,
  type VaultKey,
} from '../../crypto'
import { koffra, type AdminInfo } from '../../services/api/koffra'
import { normalizeItem, type ItemData } from './model'

/** Contenu (déchiffré) d'un export, avant re-chiffrement par la phrase d'export. */
export interface ExportContent {
  app: 'koffra'
  exported_at: string
  categories: { ref: string; name: string; icon: string | null }[]
  items: { category_ref: string | null; favorite: boolean; archived: boolean; data: ItemData }[]
  /** Les pièces jointes ne sont pas incluses (sauvegarde serveur) */
  attachments_included: false
}

/**
 * Export chiffré : l'API fournit les données chiffrées par la clé du coffre (réauth exigée),
 * le navigateur les déchiffre puis les re-chiffre avec la phrase d'export.
 */
export async function buildEncryptedExport(vaultKeys: ReadonlyMap<number, VaultKey>, passphrase: string, cost?: { ops: number; mem: number }): Promise<ExportFile> {
  const raw = await koffra.exportEncrypted()
  const keyFor = (v: number) => {
    const k = vaultKeys.get(v)
    if (!k) throw new Error('Clé du coffre manquante pour une version : rechargez la page.')
    return k
  }

  const content: ExportContent = { app: 'koffra', exported_at: raw.exported_at, categories: [], items: [], attachments_included: false }
  for (const c of raw.categories) {
    content.categories.push({ ref: c.uuid, name: await decryptCategoryName(keyFor(c.key_version), c.uuid, c.name), icon: c.icon })
  }
  for (const item of raw.items) {
    const data = normalizeItem(await decryptItem(keyFor(item.key_version), item.uuid, item.payload))
    content.items.push({ category_ref: item.category_uuid, favorite: item.favorite, archived: !!item.archived_at, data: { ...data, attachments: [] } })
  }
  return encryptExport(content, passphrase, cost)
}

/** Restauration d'un export dans le coffre courant (nouveaux identifiants, chiffrement avec la clé active). */
export async function importEncryptedExport(file: unknown, passphrase: string, key: VaultKey, onProgress?: (done: number, total: number) => void): Promise<{ items: number; categories: number }> {
  const content = (await decryptExport(file, passphrase)) as ExportContent
  if (content?.app !== 'koffra' || !Array.isArray(content.items)) throw new Error('Contenu d’export invalide.')

  const refs = new Map<string, string>()
  for (const c of content.categories ?? []) {
    const uuid = crypto.randomUUID()
    await koffra.createCategory({ uuid, key_version: key.version, name: await encryptCategoryName(key, uuid, c.name), icon: c.icon ?? undefined })
    refs.set(c.ref, uuid)
  }

  let done = 0
  for (const item of content.items) {
    const uuid = crypto.randomUUID()
    const data = normalizeItem(item.data as unknown as Record<string, unknown>)
    await koffra.createItem({
      uuid,
      key_version: key.version,
      payload: await encryptItem(key, uuid, { ...data, attachments: [] } as unknown as Record<string, unknown>),
      category_uuid: item.category_ref ? (refs.get(item.category_ref) ?? null) : null,
      favorite: !!item.favorite,
    })
    onProgress?.(++done, content.items.length)
  }
  return { items: done, categories: refs.size }
}

/**
 * Rotation de la clé du coffre (docs/09 §5.6) : nouvelle clé, enveloppes pour chaque admin ayant accès,
 * re-chiffrement de toutes les entrées et catégories, puis activation.
 */
export async function rotateVaultKey(
  account: UnlockedAccount,
  vaultKeys: ReadonlyMap<number, VaultKey>,
  currentVersion: number,
  admins: AdminInfo[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const newKey = await generateVaultKey(currentVersion + 1)
  const others = admins.filter((a) => !a.is_me && a.status === 'active' && a.vault_access !== 'none')

  await koffra.startRotation({
    version: newKey.version,
    own_grant: await wrapVaultKey(account, newKey),
    sealed_grants: await Promise.all(others.map(async (a) => ({ user_uuid: a.uuid, sealed_key: await sealVaultKeyFor(a.public_key, newKey) }))),
  })

  const items = (await koffra.allItems('with')).filter((i) => i.key_version < newKey.version)
  const { data: categories } = await koffra.categories()
  const total = items.length + categories.length
  let done = 0

  for (const item of items) {
    const old = vaultKeys.get(item.key_version)
    if (!old) throw new Error('Une entrée utilise une clé inconnue : rotation interrompue.')
    const payload = await reencryptItem(old, newKey, item.uuid, item.payload)
    await koffra.updateItem(item.uuid, { revision: item.revision, payload, key_version: newKey.version })
    onProgress?.(++done, total)
  }
  for (const c of categories.filter((c) => c.key_version < newKey.version)) {
    const old = vaultKeys.get(c.key_version)
    if (!old) throw new Error('Une catégorie utilise une clé inconnue : rotation interrompue.')
    const name = await decryptCategoryName(old, c.uuid, c.name)
    await koffra.updateCategory(c.uuid, { key_version: newKey.version, name: await encryptCategoryName(newKey, c.uuid, name) })
    onProgress?.(++done, total)
  }

  await koffra.activateRotation(newKey.version)
  return newKey.version
}
