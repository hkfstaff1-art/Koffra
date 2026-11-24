import { Archive, Check, Folder, FolderPlus, Inbox, Pencil, Plus, Search, ShieldAlert, Star, Trash2, Vault as VaultIcon, X } from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useParams, useSearchParams } from 'react-router'
import { useFeedback } from '../../components/feedback'
import { errorMessage, formatShortDate } from '../../components/format'
import { Alert, EmptyState, IconButton, Spinner } from '../../components/ui'
import { estimatePasswordStrength } from '../../crypto'
import { useVault } from '../../features/vault/VaultProvider'
import { DEFAULT_FILTER, filterEntries, ITEM_TYPES, type VaultEntry } from '../../features/vault/model'

/** Dossier sélectionné dans la colonne de gauche. */
type FolderId = 'all' | 'favorites' | 'archived' | 'trash' | 'weak' | `cat:${string}`

function weakOrReused(entries: VaultEntry[]): Set<string> {
  const active = entries.filter((e) => !e.deletedAt)
  const counts = new Map<string, number>()
  for (const e of active) if (e.data.fields.password) counts.set(e.data.fields.password, (counts.get(e.data.fields.password) ?? 0) + 1)
  return new Set(
    active
      .filter((e) => {
        const p = e.data.fields.password
        return p && (estimatePasswordStrength(p).label === 'faible' || (counts.get(p) ?? 0) > 1)
      })
      .map((e) => e.uuid),
  )
}

/**
 * Écran principal, organisé comme un bloc-notes :
 * dossiers (gauche) → liste des entrées (centre) → entrée ouverte (droite).
 */
export function VaultPage() {
  const vault = useVault()
  const { entries, categories, loading, error, unreadable } = vault
  const { uuid } = useParams()
  const { pathname } = useLocation()
  const [folder, setFolder] = useState<FolderId>('all')
  const [searchParams] = useSearchParams()
  const urlQuery = searchParams.get('q')
  const [query, setQuery] = useState(urlQuery ?? '')
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery)
  if (urlQuery !== lastUrlQuery) {
    // Nouvelle recherche lancée depuis la barre du haut
    setLastUrlQuery(urlQuery)
    setQuery(urlQuery ?? '')
    setFolder('all')
  }
  const editing = pathname.endsWith('/nouveau') || pathname.endsWith('/modifier')
  const hasDetail = uuid !== undefined || editing

  const toFix = useMemo(() => weakOrReused(entries), [entries])

  const visible = useMemo(() => {
    if (folder === 'weak') return filterEntries(entries, { ...DEFAULT_FILTER, query }).filter((e) => toFix.has(e.uuid))
    const base = { ...DEFAULT_FILTER, query }
    if (folder === 'favorites') return filterEntries(entries, { ...base, view: 'favorites' })
    if (folder === 'archived') return filterEntries(entries, { ...base, view: 'archived' })
    if (folder === 'trash') return filterEntries(entries, { ...base, view: 'trash' })
    if (folder.startsWith('cat:')) return filterEntries(entries, { ...base, categoryUuid: folder.slice(4) })
    return filterEntries(entries, base)
  }, [entries, folder, query, toFix])

  const count = (pred: (e: VaultEntry) => boolean) => entries.filter(pred).length
  const live = (e: VaultEntry) => !e.deletedAt && !e.archivedAt
  const folderTitle =
    folder === 'all'
      ? 'Toutes les entrées'
      : folder === 'favorites'
        ? 'Favoris'
        : folder === 'archived'
          ? 'Archives'
          : folder === 'trash'
            ? 'Corbeille'
            : folder === 'weak'
              ? 'Mots de passe à renforcer'
              : (categories.find((c) => `cat:${c.uuid}` === folder)?.name ?? 'Catégorie')

  return (
    <div className={`notebook ${hasDetail ? 'has-detail' : ''}`}>
      {/* ---------------- Dossiers ---------------- */}
      <aside className="folders" aria-label="Dossiers">
        <FolderButton id="all" current={folder} onSelect={setFolder} icon={Inbox} label="Toutes les entrées" count={count(live)} />
        <FolderButton id="favorites" current={folder} onSelect={setFolder} icon={Star} label="Favoris" count={count((e) => live(e) && e.favorite)} />
        {toFix.size > 0 ? <FolderButton id="weak" current={folder} onSelect={setFolder} icon={ShieldAlert} label="À renforcer" count={toFix.size} tone="warning" /> : null}
        <CategoryFolders current={folder} onSelect={setFolder} />
        <div className="folders-sep" />
        <FolderButton id="archived" current={folder} onSelect={setFolder} icon={Archive} label="Archives" count={count((e) => !e.deletedAt && !!e.archivedAt)} />
        <FolderButton id="trash" current={folder} onSelect={setFolder} icon={Trash2} label="Corbeille" count={count((e) => !!e.deletedAt)} />
      </aside>

      {/* ---------------- Liste ---------------- */}
      <section className="notes-list" aria-label={folderTitle}>
        <div className="notes-list-head">
          <h1>{folderTitle}</h1>
          <Link to="/coffre/nouveau" className="btn btn-primary btn-sm">
            <Plus className="icon" aria-hidden /> Nouvelle entrée
          </Link>
        </div>
        <div className="search">
          <Search className="search-icon" aria-hidden />
          <input type="search" placeholder="Rechercher…" aria-label="Rechercher dans le coffre" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        {error ? <Alert kind="error">{error}</Alert> : null}
        {unreadable > 0 ? <Alert kind="warning">{unreadable} entrée(s) illisible(s) avec vos clés actuelles.</Alert> : null}
        {folder === 'weak' ? <Alert kind="warning">Ces mots de passe sont faibles ou utilisés plusieurs fois : modifiez-les.</Alert> : null}
        {loading ? <Spinner label="Déchiffrement du coffre…" /> : null}

        {!loading && visible.length === 0 ? (
          <EmptyState icon={folder === 'trash' ? Trash2 : VaultIcon} title={query ? 'Aucun résultat' : folder === 'trash' ? 'Corbeille vide' : 'Aucune entrée ici'}>
            {query ? 'Essayez d’autres mots.' : folder === 'all' ? <Link to="/coffre/nouveau">Ajouter une première entrée</Link> : null}
          </EmptyState>
        ) : null}

        <ul className="notes-items">
          {visible.map((e) => {
            const type = ITEM_TYPES[e.data.type]
            const Icon = type.icon
            return (
              <li key={e.uuid}>
                <Link to={`/coffre/${e.uuid}`} className={`note-row ${e.uuid === uuid ? 'selected' : ''}`}>
                  <span className={`item-icon sm type-${e.data.type}`} aria-hidden>
                    <Icon />
                  </span>
                  <span className="note-main">
                    <strong>
                      {e.data.title}
                      {e.favorite ? <Star className="icon-sm star" aria-label="Favori" /> : null}
                    </strong>
                    <small>{e.data.fields.username || e.data.fields.email || e.data.fields.company || type.label}</small>
                  </span>
                  <time dateTime={e.updatedAt}>{formatShortDate(e.updatedAt)}</time>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ---------------- Entrée ouverte ---------------- */}
      <section className="note-view">
        {hasDetail ? (
          <Outlet />
        ) : (
          <EmptyState icon={VaultIcon} title="Aucune entrée ouverte">
            Choisissez une entrée dans la liste, ou <Link to="/coffre/nouveau">créez-en une</Link>.
            <br />
            Son contenu est déchiffré uniquement sur cet appareil.
          </EmptyState>
        )}
      </section>
    </div>
  )
}

function FolderButton({
  id,
  current,
  onSelect,
  icon: Icon,
  label,
  count,
  tone,
  actions,
}: {
  id: FolderId
  current: FolderId
  onSelect: (id: FolderId) => void
  icon: typeof Inbox
  label: string
  count?: number
  tone?: 'warning'
  actions?: ReactNode
}) {
  return (
    <div className={`folder ${current === id ? 'active' : ''} ${tone ? `tone-${tone}` : ''}`}>
      <button type="button" className="folder-btn" onClick={() => onSelect(id)} aria-current={current === id ? 'true' : undefined}>
        <Icon className="icon" aria-hidden />
        <span className="folder-label">{label}</span>
        {count !== undefined && count > 0 ? <span className="folder-count">{count}</span> : null}
      </button>
      {actions}
    </div>
  )
}

/** Catégories : création, renommage et suppression directement dans la colonne des dossiers. */
function CategoryFolders({ current, onSelect }: { current: FolderId; onSelect: (id: FolderId) => void }) {
  const { categories, entries, createCategory, renameCategory, deleteCategory } = useVault()
  const { toast, confirm } = useFeedback()
  const [manage, setManage] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<{ uuid: string; name: string } | null>(null)

  const exists = (n: string, except?: string) => categories.some((c) => c.uuid !== except && c.name.toLowerCase() === n.trim().toLowerCase())

  async function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setAdding(false)
    if (exists(n)) return toast('error', 'Cette catégorie existe déjà.')
    try {
      await createCategory(n)
      setName('')
      setAdding(false)
      toast('success', `Catégorie « ${n} » créée.`)
    } catch (err) {
      toast('error', errorMessage(err))
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault()
    if (!renaming) return
    const n = renaming.name.trim()
    if (!n || exists(n, renaming.uuid)) return toast('error', n ? 'Cette catégorie existe déjà.' : 'Saisissez un nom.')
    try {
      await renameCategory(renaming.uuid, n)
      setRenaming(null)
    } catch (err) {
      toast('error', errorMessage(err))
    }
  }

  return (
    <div className="folder-group">
      <div className="folder-group-head">
        <span>Catégories</span>
        {categories.length ? <IconButton icon={manage ? Check : Pencil} label={manage ? 'Terminer' : 'Gérer les catégories'} onClick={() => setManage((m) => !m)} /> : null}
        <IconButton icon={FolderPlus} label="Nouvelle catégorie" onClick={() => setAdding(true)} />
      </div>

      {categories.map((c) =>
        renaming?.uuid === c.uuid ? (
          <form key={c.uuid} className="folder-edit" onSubmit={rename}>
            <input aria-label="Nouveau nom" value={renaming.name} onChange={(e) => setRenaming({ uuid: c.uuid, name: e.target.value })} autoFocus maxLength={80} />
            <IconButton icon={Check} label="Enregistrer" type="submit" />
            <IconButton icon={X} label="Annuler" onClick={() => setRenaming(null)} />
          </form>
        ) : (
          <FolderButton
            key={c.uuid}
            id={`cat:${c.uuid}`}
            current={current}
            onSelect={onSelect}
            icon={Folder}
            label={c.name}
            count={entries.filter((e) => e.categoryUuid === c.uuid && !e.deletedAt && !e.archivedAt).length}
            actions={
              manage ? (
                <span className="folder-actions">
                  <IconButton icon={Pencil} label={`Renommer ${c.name}`} onClick={() => setRenaming({ uuid: c.uuid, name: c.name })} />
                  <IconButton
                    icon={Trash2}
                    label={`Supprimer ${c.name}`}
                    className="danger-hover"
                    onClick={async () => {
                      if (await confirm({ title: `Supprimer « ${c.name} » ?`, message: 'Les entrées de cette catégorie sont conservées, sans catégorie.', confirmLabel: 'Supprimer', tone: 'danger' })) {
                        try {
                          await deleteCategory(c.uuid)
                          if (current === `cat:${c.uuid}`) onSelect('all')
                          toast('success', 'Catégorie supprimée.')
                        } catch (err) {
                          toast('error', errorMessage(err))
                        }
                      }
                    }}
                  />
                </span>
              ) : null
            }
          />
        ),
      )}

      {adding ? (
        <form className="folder-edit" onSubmit={add}>
          <input aria-label="Nom de la nouvelle catégorie" placeholder="Nom de la catégorie" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} onBlur={() => !name && setAdding(false)} />
          <IconButton icon={Check} label="Créer" type="submit" />
        </form>
      ) : categories.length === 0 ? (
        <button type="button" className="folder-hint" onClick={() => setAdding(true)}>
          + Créer une catégorie
        </button>
      ) : null}
    </div>
  )
}
