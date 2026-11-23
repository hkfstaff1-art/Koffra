/**
 * Modèle des entrées du coffre (contenu du payload chiffré, docs/01 §3).
 * Tout ce qui est ici est chiffré avant de quitter le navigateur.
 */

export type ItemType = 'login' | 'email' | 'saas' | 'api' | 'contact' | 'bank' | 'note' | 'other'

export interface FieldDef {
  key: string
  label: string
  secret?: boolean
  multiline?: boolean
  inputType?: 'text' | 'email' | 'url' | 'tel'
}

export const ITEM_TYPES: Record<ItemType, { label: string; icon: string; fields: FieldDef[] }> = {
  login: {
    label: 'Compte et mot de passe',
    icon: '🔑',
    fields: [
      { key: 'url', label: 'Adresse du service', inputType: 'url' },
      { key: 'username', label: 'Identifiant' },
      { key: 'password', label: 'Mot de passe', secret: true },
      { key: 'totp', label: 'Clé TOTP (2FA)', secret: true },
    ],
  },
  email: {
    label: 'Email ou réseau social',
    icon: '✉️',
    fields: [
      { key: 'url', label: 'Adresse du service', inputType: 'url' },
      { key: 'username', label: 'Adresse ou identifiant' },
      { key: 'password', label: 'Mot de passe', secret: true },
      { key: 'recovery', label: 'Moyen de récupération' },
    ],
  },
  saas: {
    label: 'Accès professionnel / SaaS',
    icon: '🏢',
    fields: [
      { key: 'url', label: 'Adresse', inputType: 'url' },
      { key: 'username', label: 'Identifiant' },
      { key: 'password', label: 'Mot de passe', secret: true },
      { key: 'account', label: 'Compte / organisation' },
    ],
  },
  api: {
    label: 'Clé API, token, certificat',
    icon: '🧩',
    fields: [
      { key: 'service', label: 'Service' },
      { key: 'key_id', label: 'Identifiant de clé' },
      { key: 'secret', label: 'Secret / token', secret: true, multiline: true },
      { key: 'expires', label: 'Expiration' },
    ],
  },
  contact: {
    label: 'Contact client / fournisseur',
    icon: '👤',
    fields: [
      { key: 'company', label: 'Entreprise' },
      { key: 'phone', label: 'Téléphone', inputType: 'tel' },
      { key: 'email', label: 'Email', inputType: 'email' },
      { key: 'address', label: 'Adresse', multiline: true },
    ],
  },
  bank: {
    label: 'Référence bancaire (non sensible)',
    icon: '🏦',
    fields: [
      { key: 'bank', label: 'Banque / opérateur' },
      { key: 'holder', label: 'Titulaire' },
      { key: 'reference', label: 'Référence (IBAN, n° de compte)' },
      { key: 'card_last4', label: '4 derniers chiffres de carte' },
    ],
  },
  note: { label: 'Note privée', icon: '📝', fields: [] },
  other: { label: 'Autre', icon: '📦', fields: [] },
}

export interface CustomField {
  label: string
  value: string
  secret: boolean
}

export interface AttachmentMeta {
  uuid: string
  name: string
  mime: string
  size: number
  /** clé du fichier (base64url), chiffrée avec le reste du payload */
  fileKey: string
}

/** Payload déchiffré d'une entrée. */
export interface ItemData {
  type: ItemType
  title: string
  fields: Record<string, string>
  custom: CustomField[]
  notes: string
  attachments: AttachmentMeta[]
}

/** Entrée déchiffrée, telle qu'utilisée par l'interface (en mémoire uniquement). */
export interface VaultEntry {
  uuid: string
  revision: number
  keyVersion: number
  categoryUuid: string | null
  favorite: boolean
  archivedAt: string | null
  deletedAt: string | null
  updatedAt: string
  createdAt: string
  data: ItemData
  /** UUID des pièces jointes réellement présentes côté serveur */
  serverAttachments: string[]
}

export function emptyItem(type: ItemType = 'login'): ItemData {
  return { type, title: '', fields: {}, custom: [], notes: '', attachments: [] }
}

/** Normalise un payload déchiffré (tolère d'anciennes versions ou des champs manquants). */
export function normalizeItem(raw: Record<string, unknown>): ItemData {
  const type = (typeof raw.type === 'string' && raw.type in ITEM_TYPES ? raw.type : 'other') as ItemType
  const fields: Record<string, string> = {}
  if (raw.fields && typeof raw.fields === 'object') {
    for (const [k, v] of Object.entries(raw.fields as Record<string, unknown>)) if (typeof v === 'string') fields[k] = v
  }
  const custom = Array.isArray(raw.custom)
    ? (raw.custom as unknown[]).filter((c): c is CustomField => typeof c === 'object' && c !== null && typeof (c as CustomField).label === 'string')
    : []
  const attachments = Array.isArray(raw.attachments) ? (raw.attachments as AttachmentMeta[]) : []
  return {
    type,
    title: typeof raw.title === 'string' ? raw.title : '(sans titre)',
    fields,
    custom: custom.map((c) => ({ label: c.label, value: String(c.value ?? ''), secret: Boolean(c.secret) })),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    attachments,
  }
}

/**
 * Données interdites (docs/01 §3) : PIN Mobile Money, CVV, codes OTP bancaires, mots de passe de paiement.
 * Renvoie la liste des champs suspects pour avertir l'utilisateur avant l'enregistrement.
 */
const FORBIDDEN = /\b(cvv|cvc|cvv2|pin|code\s*pin|code\s*secret\s*(carte|momo|mobile)|otp\s*bancaire|mot\s*de\s*passe\s*de\s*paiement)\b/i

export function forbiddenDataWarnings(data: ItemData): string[] {
  const warnings: string[] = []
  for (const c of data.custom) if (FORBIDDEN.test(c.label)) warnings.push(`Champ « ${c.label} »`)
  const last4 = data.fields.card_last4 ?? ''
  if (last4 && !/^\d{0,4}$/.test(last4.replace(/\s/g, ''))) warnings.push('Ne conservez que les 4 derniers chiffres de la carte')
  const ref = (data.fields.reference ?? '').replace(/\s/g, '')
  if (/^\d{15,19}$/.test(ref)) warnings.push('La référence ressemble à un numéro de carte complet')
  return warnings
}

export interface VaultFilter {
  query: string
  categoryUuid: string | null | 'all'
  type: ItemType | 'all'
  view: 'active' | 'favorites' | 'archived' | 'trash'
  sort: 'updated' | 'title' | 'created'
}

export const DEFAULT_FILTER: VaultFilter = { query: '', categoryUuid: 'all', type: 'all', view: 'active', sort: 'updated' }

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Recherche locale sur les données déchiffrées. Les champs secrets ne sont jamais indexés. */
export function filterEntries(entries: VaultEntry[], f: VaultFilter): VaultEntry[] {
  const terms = fold(f.query).split(/\s+/).filter(Boolean)

  const result = entries.filter((e) => {
    if (f.view === 'trash') {
      if (!e.deletedAt) return false
    } else {
      if (e.deletedAt) return false
      if (f.view === 'archived' && !e.archivedAt) return false
      if (f.view !== 'archived' && e.archivedAt) return false
      if (f.view === 'favorites' && !e.favorite) return false
    }
    if (f.categoryUuid !== 'all' && e.categoryUuid !== f.categoryUuid) return false
    if (f.type !== 'all' && e.data.type !== f.type) return false
    if (terms.length === 0) return true

    const defs = ITEM_TYPES[e.data.type].fields
    const haystack = fold(
      [
        e.data.title,
        e.data.notes,
        ...defs.filter((d) => !d.secret).map((d) => e.data.fields[d.key] ?? ''),
        ...e.data.custom.filter((c) => !c.secret).flatMap((c) => [c.label, c.value]),
      ].join(' '),
    )
    return terms.every((t) => haystack.includes(t))
  })

  return result.sort((a, b) => {
    if (f.sort === 'title') return a.data.title.localeCompare(b.data.title, 'fr')
    if (f.sort === 'created') return b.createdAt.localeCompare(a.createdAt)
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}
