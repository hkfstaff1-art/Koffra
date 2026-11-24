import { FolderTree, KeyRound, Plus, ShieldAlert, ShieldCheck, Star, Trash2, Users, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { formatDate } from '../components/format'
import { Alert, EmptyState, PageHeader, Spinner } from '../components/ui'
import { estimatePasswordStrength } from '../crypto'
import { useSession } from '../app/session'
import { useVault } from '../features/vault/VaultProvider'
import { ITEM_TYPES } from '../features/vault/model'

function Stat({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number | string; label: string; tone: string }) {
  return (
    <div className="stat card">
      <span className={`stat-icon tone-${tone}`} aria-hidden>
        <Icon />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

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
      trash: entries.length - active.length,
      weak: active.filter((e) => e.data.fields.password && estimatePasswordStrength(e.data.fields.password).label === 'faible'),
      reused: active.filter((e) => e.data.fields.password && (counts.get(e.data.fields.password) ?? 0) > 1),
      recent: [...active].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
      byCategory: categories.map((c) => ({ ...c, count: active.filter((e) => e.categoryUuid === c.uuid).length })),
    }
  }, [entries, categories])

  if (loading) return <Spinner label="Déchiffrement du coffre…" />

  const firstName = me?.user.name.split(' ')[0]
  const healthy = stats.weak.length === 0 && stats.reused.length === 0

  return (
    <div className="stack-lg">
      <PageHeader
        title={`Bonjour ${firstName ?? ''}`}
        description="Vue d’ensemble de votre coffre-fort."
        actions={
          <Link to="/coffre/nouveau" className="btn btn-primary btn-md">
            <Plus className="icon" aria-hidden /> Nouvelle entrée
          </Link>
        }
      />

      <div className="stats">
        <Stat icon={KeyRound} value={stats.total} label="Entrées" tone="blue" />
        <Stat icon={Star} value={stats.favorites} label="Favoris" tone="amber" />
        <Stat icon={FolderTree} value={categories.length} label="Catégories" tone="green" />
        <Stat icon={Trash2} value={stats.trash} label="Corbeille" tone="gray" />
      </div>

      <section className="card stack" aria-labelledby="alerts-title">
        <div className="section-head">
          {healthy ? <ShieldCheck className="icon-lg tone-green-text" aria-hidden /> : <ShieldAlert className="icon-lg tone-amber-text" aria-hidden />}
          <h2 id="alerts-title">Santé des mots de passe</h2>
        </div>
        {healthy ? <Alert kind="success">Aucun mot de passe faible ni réutilisé.</Alert> : null}
        {stats.weak.length ? (
          <Alert kind="warning" title={`${stats.weak.length} mot(s) de passe faible(s)`}>
            {stats.weak.slice(0, 5).map((e, i) => (
              <span key={e.uuid}>
                {i ? ', ' : ''}
                <Link to={`/coffre/${e.uuid}`}>{e.data.title}</Link>
              </span>
            ))}
          </Alert>
        ) : null}
        {stats.reused.length ? (
          <Alert kind="warning" title={`${stats.reused.length} entrée(s) partagent un même mot de passe`}>
            {stats.reused.slice(0, 5).map((e, i) => (
              <span key={e.uuid}>
                {i ? ', ' : ''}
                <Link to={`/coffre/${e.uuid}`}>{e.data.title}</Link>
              </span>
            ))}
          </Alert>
        ) : null}
        <p className="muted small">
          <Users className="icon-sm" aria-hidden /> Administrateurs : {me?.limits.used_seats}/{me?.limits.max_accounts} (invitations en cours comprises), tous avec les privilèges complets.
        </p>
      </section>

      <div className="grid-2">
        <section className="card" aria-labelledby="recent-title">
          <h2 id="recent-title">Modifiées récemment</h2>
          {stats.recent.length === 0 ? (
            <EmptyState icon={KeyRound} title="Coffre vide">
              <Link to="/coffre/nouveau">Ajouter une première entrée</Link>
            </EmptyState>
          ) : (
            <ul className="link-list">
              {stats.recent.map((e) => {
                const Icon = ITEM_TYPES[e.data.type].icon
                return (
                  <li key={e.uuid}>
                    <Link to={`/coffre/${e.uuid}`}>
                      <span className={`item-icon sm type-${e.data.type}`} aria-hidden>
                        <Icon />
                      </span>
                      <span className="grow">{e.data.title}</span>
                      <small>{formatDate(e.updatedAt)}</small>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="cat-title">
          <h2 id="cat-title">Catégories</h2>
          {stats.byCategory.length === 0 ? (
            <EmptyState icon={FolderTree} title="Aucune catégorie">
              <Link to="/categories">Créer une catégorie</Link>
            </EmptyState>
          ) : (
            <ul className="link-list">
              {stats.byCategory.map((c) => (
                <li key={c.uuid}>
                  <span className="list-row">
                    <FolderTree className="icon muted" aria-hidden />
                    <span className="grow">{c.name}</span>
                    <span className="count">{c.count}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
