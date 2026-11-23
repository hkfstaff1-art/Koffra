import { useMemo } from 'react'
import { Link } from 'react-router'
import { Alert, Spinner, formatDate } from '../components/ui'
import { estimatePasswordStrength } from '../crypto'
import { useSession } from '../app/session'
import { useVault } from '../features/vault/VaultProvider'
import { ITEM_TYPES } from '../features/vault/model'

/** Tableau de bord : volumes, catégories, éléments récents et alertes de sécurité (calculées localement). */
export function DashboardPage() {
  const { me } = useSession()
  const { entries, categories, loading } = useVault()

  const stats = useMemo(() => {
    const active = entries.filter((e) => !e.deletedAt)
    const passwords = active.map((e) => e.data.fields.password).filter((p): p is string => !!p)
    const counts = new Map<string, number>()
    for (const p of passwords) counts.set(p, (counts.get(p) ?? 0) + 1)
    return {
      total: active.filter((e) => !e.archivedAt).length,
      favorites: active.filter((e) => e.favorite).length,
      archived: active.filter((e) => e.archivedAt).length,
      trash: entries.length - active.length,
      weak: active.filter((e) => e.data.fields.password && estimatePasswordStrength(e.data.fields.password).label === 'faible'),
      reused: active.filter((e) => e.data.fields.password && (counts.get(e.data.fields.password) ?? 0) > 1),
      recent: [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
      byCategory: categories.map((c) => ({ ...c, count: active.filter((e) => e.categoryUuid === c.uuid).length })),
    }
  }, [entries, categories])

  if (loading) return <Spinner label="Déchiffrement du coffre…" />

  return (
    <div className="stack">
      <h1>Bonjour {me?.user.name}</h1>
      <div className="stats">
        <div className="stat card">
          <strong>{stats.total}</strong> entrées
        </div>
        <div className="stat card">
          <strong>{stats.favorites}</strong> favoris
        </div>
        <div className="stat card">
          <strong>{categories.length}</strong> catégories
        </div>
        <div className="stat card">
          <strong>{stats.trash}</strong> dans la corbeille
        </div>
      </div>

      <section className="card stack" aria-labelledby="alerts-title">
        <h2 id="alerts-title">Alertes de sécurité</h2>
        {stats.weak.length === 0 && stats.reused.length === 0 ? <Alert kind="success">Aucune alerte : pas de mot de passe faible ni réutilisé.</Alert> : null}
        {stats.weak.length ? (
          <Alert kind="warning">
            {stats.weak.length} mot(s) de passe faible(s) : {stats.weak.slice(0, 5).map((e) => e.data.title).join(', ')}
          </Alert>
        ) : null}
        {stats.reused.length ? (
          <Alert kind="warning">
            {stats.reused.length} entrée(s) partagent un même mot de passe : {stats.reused.slice(0, 5).map((e) => e.data.title).join(', ')}
          </Alert>
        ) : null}
        <p className="field-hint">
          Comptes administrateurs : {me?.limits.used_seats}/{me?.limits.max_accounts} (invitations en cours comprises). Tous ont les privilèges complets.
        </p>
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="recent-title">
          <h2 id="recent-title">Modifiées récemment</h2>
          <ul className="plain-list">
            {stats.recent.map((e) => (
              <li key={e.uuid}>
                <Link to={`/coffre/${e.uuid}`}>
                  {ITEM_TYPES[e.data.type].icon} {e.data.title}
                </Link>{' '}
                <small>{formatDate(e.updatedAt)}</small>
              </li>
            ))}
            {stats.recent.length === 0 ? (
              <li>
                Coffre vide. <Link to="/coffre/nouveau">Ajouter une première entrée</Link>
              </li>
            ) : null}
          </ul>
        </section>
        <section className="card" aria-labelledby="cat-title">
          <h2 id="cat-title">Catégories</h2>
          <ul className="plain-list">
            {stats.byCategory.map((c) => (
              <li key={c.uuid}>
                {c.name} <small>({c.count})</small>
              </li>
            ))}
            {stats.byCategory.length === 0 ? <li>Aucune catégorie.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  )
}
