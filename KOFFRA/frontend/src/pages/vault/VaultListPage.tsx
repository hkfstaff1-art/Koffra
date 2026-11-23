import { useMemo, useState } from 'react'
import { Link, Outlet, useParams } from 'react-router'
import { Alert, Spinner, formatDate } from '../../components/ui'
import { useVault } from '../../features/vault/VaultProvider'
import { DEFAULT_FILTER, filterEntries, ITEM_TYPES, type ItemType, type VaultFilter } from '../../features/vault/model'

export function VaultListPage() {
  const { entries, categories, loading, error, unreadable } = useVault()
  const [filter, setFilter] = useState<VaultFilter>(DEFAULT_FILTER)
  const { uuid } = useParams()
  const visible = useMemo(() => filterEntries(entries, filter), [entries, filter])
  const set = (patch: Partial<VaultFilter>) => setFilter((f) => ({ ...f, ...patch }))
  const catName = (id: string | null) => categories.find((c) => c.uuid === id)?.name

  return (
    <div className={`split ${uuid ? 'has-detail' : ''}`}>
      <section className="list-pane" aria-label="Entrées du coffre">
        <div className="pane-head">
          <h1>Coffre</h1>
          <Link to="/coffre/nouveau" className="btn btn-primary">
            + Ajouter
          </Link>
        </div>

        <div className="filters">
          <input type="search" placeholder="Rechercher (titre, identifiant, notes…)" aria-label="Rechercher" value={filter.query} onChange={(e) => set({ query: e.target.value })} />
          <div className="row wrap">
            <select aria-label="Vue" value={filter.view} onChange={(e) => set({ view: e.target.value as VaultFilter['view'] })}>
              <option value="active">Toutes les entrées</option>
              <option value="favorites">Favoris</option>
              <option value="archived">Archivées</option>
              <option value="trash">Corbeille</option>
            </select>
            <select aria-label="Catégorie" value={filter.categoryUuid ?? ''} onChange={(e) => set({ categoryUuid: e.target.value === 'all' ? 'all' : e.target.value || null })}>
              <option value="all">Toutes catégories</option>
              <option value="">Sans catégorie</option>
              {categories.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.name}
                </option>
              ))}
            </select>
            <select aria-label="Type" value={filter.type} onChange={(e) => set({ type: e.target.value as ItemType | 'all' })}>
              <option value="all">Tous types</option>
              {Object.entries(ITEM_TYPES).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.label}
                </option>
              ))}
            </select>
            <select aria-label="Tri" value={filter.sort} onChange={(e) => set({ sort: e.target.value as VaultFilter['sort'] })}>
              <option value="updated">Modifiées récemment</option>
              <option value="created">Créées récemment</option>
              <option value="title">Titre (A→Z)</option>
            </select>
          </div>
        </div>

        {error ? <Alert kind="error">{error}</Alert> : null}
        {unreadable > 0 ? <Alert kind="warning">{unreadable} entrée(s) illisible(s) avec vos clés actuelles.</Alert> : null}
        {loading ? <Spinner label="Déchiffrement du coffre…" /> : null}

        {!loading && visible.length === 0 ? <p className="empty">Aucune entrée.</p> : null}
        <ul className="item-list">
          {visible.map((e) => (
            <li key={e.uuid}>
              <Link to={`/coffre/${e.uuid}`} className={`item-row ${e.uuid === uuid ? 'selected' : ''}`}>
                <span className="item-icon" aria-hidden>
                  {ITEM_TYPES[e.data.type].icon}
                </span>
                <span className="item-main">
                  <strong>
                    {e.favorite ? '★ ' : ''}
                    {e.data.title}
                  </strong>
                  <small>
                    {e.data.fields.username || e.data.fields.company || ITEM_TYPES[e.data.type].label}
                    {catName(e.categoryUuid) ? ` · ${catName(e.categoryUuid)}` : ''}
                  </small>
                </span>
                <time className="item-date" dateTime={e.updatedAt}>
                  {formatDate(e.updatedAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="detail-pane">
        <Outlet />
      </section>
    </div>
  )
}
