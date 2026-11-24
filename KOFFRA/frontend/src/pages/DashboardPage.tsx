import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  KeyRound,
  LogIn,
  MonitorSmartphone,
  Plus,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  LockKeyhole,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useSession } from '../app/session'
import { formatDate } from '../components/format'
import { Spinner } from '../components/ui'
import { estimatePasswordStrength } from '../crypto'
import { DemoDataBanner } from '../features/vault/DemoData'
import { useVault } from '../features/vault/VaultProvider'
import { koffra } from '../services/api/koffra'
import { ACTIVITY_LABELS } from './ActivityPage'

/** Temps écoulé lisible : « il y a 5 min », « il y a 2 h », sinon la date. */
function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'à l’instant'
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  return formatDate(iso)
}

function eventIcon(event: string): { icon: LucideIcon; tone: string } {
  if (event.endsWith('failed')) return { icon: XCircle, tone: 'red' }
  if (event.startsWith('auth.')) return { icon: LogIn, tone: 'green' }
  if (event.startsWith('admin.') || event.startsWith('vault.access')) return { icon: Users, tone: 'blue' }
  if (event.startsWith('item.') || event.startsWith('category.') || event.startsWith('attachment.')) return { icon: KeyRound, tone: 'violet' }
  if (event.startsWith('device.')) return { icon: MonitorSmartphone, tone: 'blue' }
  return { icon: CheckCircle2, tone: 'green' }
}

function StatCard({ icon: Icon, tone, value, label, note }: { icon: LucideIcon; tone: string; value: string; label: string; note?: string }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon tone-${tone}`} aria-hidden>
        <Icon />
      </span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-label">
        {label}
        {note ? <em>{note}</em> : null}
      </span>
    </div>
  )
}

const QUICK: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/coffre/nouveau', label: 'Nouvelle entrée', icon: Plus },
  { to: '/administrateurs', label: 'Gérer les administrateurs', icon: Users },
  { to: '/coffre', label: 'Ouvrir le coffre', icon: LockKeyhole },
  { to: '/parametres/journal', label: 'Journal d’audit', icon: ScrollText },
  { to: '/parametres/appareils', label: 'Mes appareils', icon: MonitorSmartphone },
  { to: '/parametres/compte', label: 'Mon compte', icon: UserCog },
]

/** Tableau de bord : accueil, chiffres clés, activité récente et accès rapides. */
export function DashboardPage() {
  const { me } = useSession()
  const { entries, loading } = useVault()
  const activity = useQuery({ queryKey: ['activity', 1], queryFn: () => koffra.activity(1) })

  const stats = useMemo(() => {
    const live = entries.filter((e) => !e.deletedAt && !e.archivedAt)
    const passwords = live.map((e) => e.data.fields.password).filter((p): p is string => !!p)
    const counts = new Map<string, number>()
    for (const p of passwords) counts.set(p, (counts.get(p) ?? 0) + 1)
    const withPwd = passwords
    const good = passwords.filter((p) => estimatePasswordStrength(p).label !== 'faible' && counts.get(p) === 1)
    return { total: live.length, score: withPwd.length ? Math.round((good.length / withPwd.length) * 100) : 100, toFix: withPwd.length - good.length }
  }, [entries])

  const firstName = me?.user.name.split(/\s+/)[0] ?? ''
  const lastLogin = me?.user.last_login_at

  return (
    <div className="page dashboard">
      <DemoDataBanner />
      <section className="hero">
        <div className="hero-text">
          <h1>Bonjour, {firstName} !</h1>
          <p>Bienvenue dans votre espace KOFFRA. Vos mots de passe et documents sont chiffrés sur cet appareil : personne d’autre ne peut les lire.</p>
          <Link to="/coffre" className="btn btn-md btn-accent">
            <LockKeyhole className="icon" aria-hidden /> Ouvrir le coffre
          </Link>
        </div>
        <div className="hero-art" aria-hidden>
          <div className="hero-screen">
            <img src="/pwa-192.png" alt="" />
          </div>
          <span className="hero-shield">
            <ShieldCheck />
          </span>
        </div>
      </section>

      <section className="stats" aria-label="Chiffres clés">
        <StatCard icon={KeyRound} tone="green" value={loading ? '…' : String(stats.total)} label="Entrées dans le coffre" />
        <StatCard icon={Users} tone="blue" value={`${me?.limits.used_seats ?? 1}/${me?.limits.max_accounts ?? 5}`} label="Administrateurs" />
        <StatCard
          icon={stats.toFix ? ShieldAlert : ShieldCheck}
          tone={stats.toFix ? 'amber' : 'green'}
          value={loading ? '…' : `${stats.score} %`}
          label="Mots de passe sûrs"
          note={stats.toFix ? `${stats.toFix} à renforcer` : undefined}
        />
        <StatCard icon={CalendarClock} tone="violet" value={lastLogin ? ago(lastLogin).replace('il y a ', '') : 'Aujourd’hui'} label="Dernière connexion" />
      </section>

      <div className="dash-grid">
        <section className="card dash-card">
          <header className="dash-card-head">
            <h2>Activités récentes</h2>
            <Link to="/parametres/journal" className="see-all">
              Voir tout <ArrowRight className="icon-sm" aria-hidden />
            </Link>
          </header>
          {activity.isPending ? <Spinner /> : null}
          {activity.isError ? <p className="muted small">Journal indisponible pour le moment.</p> : null}
          <ul className="activity-list">
            {activity.data?.data.slice(0, 5).map((e) => {
              const { icon: Icon, tone } = eventIcon(e.event)
              return (
                <li key={e.id}>
                  <span className={`activity-icon tone-${tone}`} aria-hidden>
                    <Icon />
                  </span>
                  <span className="activity-main">
                    <strong>{ACTIVITY_LABELS[e.event] ?? e.event}</strong>
                    <small>
                      {ago(e.created_at)} — {e.user?.name ?? 'Système'}
                    </small>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="card dash-card">
          <header className="dash-card-head">
            <h2>Accès rapide</h2>
          </header>
          <div className="quick-grid">
            {QUICK.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className="quick-tile">
                <Icon aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
