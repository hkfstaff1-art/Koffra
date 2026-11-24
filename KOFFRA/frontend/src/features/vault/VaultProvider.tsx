import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  decryptCategoryName,
  decryptFile,
  decryptItem,
  encryptCategoryName,
  encryptFile,
  encryptItem,
  fromB64,
  sha256Hex,
  toB64,
} from '../../crypto'
import { useSession } from '../../app/session'
import { koffra, type ApiVaultItem } from '../../services/api/koffra'
import { normalizeItem, type AttachmentMeta, type ItemData, type VaultEntry } from './model'

export interface VaultCategory {
  uuid: string
  name: string
  icon: string | null
  sortOrder: number
}

interface VaultValue {
  entries: VaultEntry[]
  categories: VaultCategory[]
  loading: boolean
  error: string | null
  /** entrées impossibles à déchiffrer (clé manquante ou donnée altérée) */
  unreadable: number
  reload: () => Promise<void>
  save: (input: { existing: VaultEntry | null; data: ItemData; categoryUuid: string | null; favorite: boolean }) => Promise<VaultEntry>
  setFlags: (entry: VaultEntry, flags: { favorite?: boolean; archived?: boolean }) => Promise<void>
  trash: (entry: VaultEntry) => Promise<void>
  restore: (entry: VaultEntry) => Promise<void>
  destroy: (entry: VaultEntry) => Promise<void>
  addAttachment: (entry: VaultEntry, file: File) => Promise<void>
  openAttachment: (meta: AttachmentMeta) => Promise<Blob>
  removeAttachment: (entry: VaultEntry, meta: AttachmentMeta) => Promise<void>
  createCategory: (name: string, icon?: string) => Promise<string>
  /** Supprime définitivement des entrées déjà en corbeille (une seule réauthentification). */
  purge: (uuids: string[]) => Promise<void>
  renameCategory: (uuid: string, name: string) => Promise<void>
  deleteCategory: (uuid: string) => Promise<void>
}

const VaultContext = createContext<VaultValue | null>(null)
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

export function VaultProvider({ children }: { children: ReactNode }) {
  const { vaultKeys, currentKey } = useSession()
  const [entries, setEntries] = useState<VaultEntry[]>([])
  const [categories, setCategories] = useState<VaultCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unreadable, setUnreadable] = useState(0)

  const decryptEntry = useCallback(
    async (item: ApiVaultItem): Promise<VaultEntry | null> => {
      const key = vaultKeys.get(item.key_version)
      if (!key) return null
      try {
        const data = normalizeItem(await decryptItem(key, item.uuid, item.payload))
        return {
          uuid: item.uuid,
          revision: item.revision,
          keyVersion: item.key_version,
          categoryUuid: item.category_uuid,
          favorite: item.favorite,
          archivedAt: item.archived_at,
          deletedAt: item.deleted_at,
          updatedAt: item.updated_at,
          createdAt: item.created_at,
          data,
          serverAttachments: item.attachments.map((a) => a.uuid),
        }
      } catch {
        return null
      }
    },
    [vaultKeys],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [items, cats] = await Promise.all([koffra.allItems('with'), koffra.categories()])
      const decrypted = await Promise.all(items.map(decryptEntry))
      setEntries(decrypted.filter((e): e is VaultEntry => e !== null))
      setUnreadable(decrypted.filter((e) => e === null).length)

      const names: VaultCategory[] = []
      for (const c of cats.data) {
        const key = vaultKeys.get(c.key_version)
        if (!key) continue
        try {
          names.push({ uuid: c.uuid, name: await decryptCategoryName(key, c.uuid, c.name), icon: c.icon, sortOrder: c.sort_order })
        } catch {
          /* catégorie illisible : ignorée */
        }
      }
      setCategories(names)
    } catch {
      setError('Impossible de charger le coffre.')
    } finally {
      setLoading(false)
    }
  }, [decryptEntry, vaultKeys])

  useEffect(() => {
    if (currentKey) void reload()
  }, [currentKey, reload])

  const requireKey = useCallback(() => {
    if (!currentKey) throw new Error('Coffre verrouillé')
    return currentKey
  }, [currentKey])

  const replace = useCallback(
    async (item: ApiVaultItem) => {
      const entry = await decryptEntry(item)
      if (!entry) return null
      setEntries((list) => [entry, ...list.filter((e) => e.uuid !== entry.uuid)])
      return entry
    },
    [decryptEntry],
  )

  const save = useCallback<VaultValue['save']>(
    async ({ existing, data, categoryUuid, favorite }) => {
      const key = requireKey()
      const uuid = existing?.uuid ?? crypto.randomUUID()
      const payload = await encryptItem(key, uuid, data as unknown as Record<string, unknown>)
      const res = existing
        ? await koffra.updateItem(uuid, { revision: existing.revision, payload, key_version: key.version, category_uuid: categoryUuid, favorite })
        : await koffra.createItem({ uuid, payload, key_version: key.version, category_uuid: categoryUuid, favorite })
      const entry = await replace(res.data)
      if (!entry) throw new Error('Entrée enregistrée mais illisible')
      return entry
    },
    [requireKey, replace],
  )

  const setFlags = useCallback<VaultValue['setFlags']>(
    async (entry, flags) => {
      const res = await koffra.updateItem(entry.uuid, { revision: entry.revision, ...flags })
      await replace(res.data)
    },
    [replace],
  )

  const trash = useCallback(async (entry: VaultEntry) => {
    await koffra.trashItem(entry.uuid)
    setEntries((list) => list.map((e) => (e.uuid === entry.uuid ? { ...e, deletedAt: new Date().toISOString() } : e)))
  }, [])

  const restore = useCallback(async (entry: VaultEntry) => {
    await koffra.restoreItem(entry.uuid)
    setEntries((list) => list.map((e) => (e.uuid === entry.uuid ? { ...e, deletedAt: null } : e)))
  }, [])

  const destroy = useCallback(async (entry: VaultEntry) => {
    await koffra.forceDeleteItem(entry.uuid)
    setEntries((list) => list.filter((e) => e.uuid !== entry.uuid))
  }, [])

  const purge = useCallback(async (uuids: string[]) => {
    if (uuids.length === 0) return
    await koffra.purgeItems(uuids)
    setEntries((list) => list.filter((e) => !uuids.includes(e.uuid)))
  }, [])

  const addAttachment = useCallback(
    async (entry: VaultEntry, file: File) => {
      if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('Fichier trop volumineux (10 Mo maximum).')
      const attachmentUuid = crypto.randomUUID()
      const { fileKey, data } = await encryptFile(new Uint8Array(await file.arrayBuffer()), attachmentUuid)
      await koffra.uploadAttachment(entry.uuid, attachmentUuid, data, await sha256Hex(data))
      const meta: AttachmentMeta = { uuid: attachmentUuid, name: file.name, mime: file.type || 'application/octet-stream', size: file.size, fileKey: await toB64(fileKey) }
      fileKey.fill(0)
      await save({ existing: entry, data: { ...entry.data, attachments: [...entry.data.attachments, meta] }, categoryUuid: entry.categoryUuid, favorite: entry.favorite })
    },
    [save],
  )

  const openAttachment = useCallback(async (meta: AttachmentMeta) => {
    const encrypted = await koffra.downloadAttachment(meta.uuid)
    const plain = await decryptFile(encrypted, await fromB64(meta.fileKey), meta.uuid)
    return new Blob([plain as BlobPart], { type: meta.mime })
  }, [])

  const removeAttachment = useCallback(
    async (entry: VaultEntry, meta: AttachmentMeta) => {
      await koffra.deleteAttachment(meta.uuid).catch(() => undefined)
      await save({
        existing: entry,
        data: { ...entry.data, attachments: entry.data.attachments.filter((a) => a.uuid !== meta.uuid) },
        categoryUuid: entry.categoryUuid,
        favorite: entry.favorite,
      })
    },
    [save],
  )

  const createCategory = useCallback(
    async (name: string, icon?: string) => {
      const key = requireKey()
      const uuid = crypto.randomUUID()
      await koffra.createCategory({ uuid, key_version: key.version, name: await encryptCategoryName(key, uuid, name), icon })
      setCategories((list) => [...list, { uuid, name, icon: icon ?? null, sortOrder: 0 }])
      return uuid
    },
    [requireKey],
  )

  const renameCategory = useCallback(
    async (uuid: string, name: string) => {
      const key = requireKey()
      await koffra.updateCategory(uuid, { key_version: key.version, name: await encryptCategoryName(key, uuid, name) })
      setCategories((list) => list.map((c) => (c.uuid === uuid ? { ...c, name } : c)))
    },
    [requireKey],
  )

  const deleteCategory = useCallback(async (uuid: string) => {
    await koffra.deleteCategory(uuid)
    setCategories((list) => list.filter((c) => c.uuid !== uuid))
    setEntries((list) => list.map((e) => (e.categoryUuid === uuid ? { ...e, categoryUuid: null } : e)))
  }, [])

  const value = useMemo<VaultValue>(
    () => ({
      entries,
      categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr')),
      loading,
      error,
      unreadable,
      reload,
      save,
      setFlags,
      trash,
      restore,
      destroy,
      purge,
      addAttachment,
      openAttachment,
      removeAttachment,
      createCategory,
      renameCategory,
      deleteCategory,
    }),
    [entries, categories, loading, error, unreadable, reload, save, setFlags, trash, restore, destroy, purge, addAttachment, openAttachment, removeAttachment, createCategory, renameCategory, deleteCategory],
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault(): VaultValue {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error('useVault hors de VaultProvider')
  return ctx
}
