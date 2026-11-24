import { Archive, Inbox, Plus, Search, Star, Trash2, Vault as VaultIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router'
import { formatDate } from '../../components/format'
import { Alert, EmptyState, Spinner } from '../../components/ui'
import { useVault } from '../../features/vault/VaultProvider'
import { DEFAULT_FILTER, filterEntries, ITEM_TYPES, type ItemType, type VaultFilter } from '../../features/vault/model'

const VIEWS: { value: VaultFilter['view']; label: string; icon: typeof Inbox }[] = [
  { value: 'active', label: 'Toutes', icon: Inbox },
  { value: 'favorites', label: 'Favoris', icon: Star },
  { value: 'archived', label: 'Archives', icon: Archive },
  { value: 'trash', label: 'Corbeille', icon: Trash2 },
]

export function VaultListPage() {
  const { entries, categories, loading, error, unreadable } = useVault()
  const [filter, setFilter] = useState<VaultFilter>(DEFAULT_FILTER)
  const { uuid } = useParams()
  const { pathname } = useLocation()
  const visible = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const set = (patch: Partial<VaultFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const catName = (id: string | null) => categories.find((c) => c.uuid === id)?.name
  const showDetail = uuid !== undefined || pathname.endsWith('/nouveau')

  return (
    <div className={`split ${showDetail ? 'has-detail' : ''}`}>
      <section className="list-pane" aria-label="Entrées du coffre">
        <div className="list-head">
          <h1>Coffre</h1>
          <Link to="/coffre/nouveau" className="btn btn-primary btn-md">
            <Plus className="icon" aria-hidden /> Ajouter
          </Link>
        </div>

        <div className="search">
          <Search className="search-icon" aria-hidden />
          <input type="search" placeholder="Rechercher un titre, un identifiant, une note…" aria-label="Rechercher" value={filter.query} onChange={(e) => set({ query: e.target.value })} />
        </div>

        <div className="segmented" role="tablist" aria-label="Vue">
          {VIEWS.map(({ value, label, icon: Icon }) => (
            <button key={value} type="button" role="tab" aria-selected={filter.view === value} className={filter.view === value ? 'active' : ''} onClick={() => set({ view: value })}>
              <Icon className="icon-sm" aria-hidden /> {label}
            </button>
          ))}
        </div>

        <div className="filters">
          <select aria-label="Catégorie" value={filter.categoryUuid ?? ''} onChange={(e) => set({ categoryUuid: e.target.value === 'all' ? 'all' : e.target.value || null })}>
            <option value="all">Toutes les catégories</option>
            <option value="">Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.uuid} value={c.uuid}>
                {c.name}
              </option>
            ))}
          </select>
          <select aria-label="Type" value={filter.type} onChange={(e) => set({ type: e.target.value as ItemType | 'all' })}>
            <option value="all">Tous les types</option>
            {Object.entries(ITEM_TYPES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.label}
              </option>
            ))}
          </select>
          <select aria-label="Tri" value={filter.sort} onChange={(e) => set({ sort: e.target.value as VaultFilter['sort'] })}>
            <option value="updated">Modifiées récemment</option>
            <option value="created">Créées récemment</option>
            <option value="title">Titre (A → Z)</option>
          </select>
        </div>

        {error ? <Alert kind="error">{error}</Alert> : null}
        {unreadable > 0 ? <Alert kind="warning">{unreadable} entrée(s) illisible(s) avec vos clés actuelles.</Alert> : null}
        {loading ? <Spinner label="Déchiffrement du coffre…" /> : null}

        {!loading && visible.length === 0 ? (
          <EmptyState icon={filter.view === 'trash' ? Trash2 : VaultIcon} title={filter.query ? 'Aucun résultat' : filter.view === 'trash' ? 'Corbeille vide' : 'Aucune entrée'}>
            {filter.query ? 'Essayez d’autres mots-clés.' : filter.view === 'active' ? <Link to="/coffre/nouveau">Ajouter une première entrée</Link> : null}
          </EmptyState>
        ) : null}

        <ul className="item-list">
          {visible.map((e) => {
            const type = ITEM_TYPES[e.data.type]
            const Icon = type.icon
            return (
              <li key={e.uuid}>
                <Link to={`/coffre/${e.uuid}`} className={`item-row ${e.uuid === uuid ? 'selected' : ''}`}>
                  <span className={`item-icon type-${e.data.type}`} aria-hidden>
                    <Icon />
                  </span>
                  <span className="item-main">
                    <strong>
                      {e.data.title}
                      {e.favorite ? <Star className="icon-sm star" aria-label="Favori" /> : null}
                    </strong>
                    <small>
                      {e.data.fields.username || e.data.fields.company || type.label}
                      {catName(e.categoryUuid) ? ` · ${catName(e.categoryUuid)}` : ''}
                    </small>
                  </span>
                  <time className="item-date" dateTime={e.updatedAt}>
                    {formatDate(e.updatedAt)}
                  </time>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
      <section className="detail-pane">
        {showDetail ? (
          <Outlet />
        ) : (
          <EmptyState icon={VaultIcon} title="Sélectionnez une entrée">
            Son contenu est déchiffré uniquement sur cet appareil.
          </EmptyState>
        )}
      </section>
    </div>
  )
}
