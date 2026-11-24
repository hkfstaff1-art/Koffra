import {
  FolderTree,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  MonitorSmartphone,
  ScrollText,
  Settings,
  Users,
  Vault,
  WandSparkles,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Alert } from '../components/ui'
import { useSession } from './session'

export const NAV: { to: string; label: string; short: string; icon: LucideIcon; end?: boolean; mobile?: boolean }[] = [
  { to: '/', label: 'Tableau de bord', short: 'Accueil', icon: LayoutDashboard, end: true, mobile: true },
  { to: '/coffre', label: 'Coffre', short: 'Coffre', icon: Vault, mobile: true },
  { to: '/generateur', label: 'Générateur', short: 'Générer', icon: WandSparkles, mobile: true },
  { to: '/categories', label: 'Catégories', short: 'Catégories', icon: FolderTree },
  { to: '/appareils', label: 'Appareils', short: 'Appareils', icon: MonitorSmartphone },
  { to: '/administrateurs', label: 'Administrateurs', short: 'Admins', icon: Users },
  { to: '/journal', label: 'Journal d’activité', short: 'Journal', icon: ScrollText },
  { to: '/parametres', label: 'Paramètres', short: 'Réglages', icon: Settings, mobile: true },
]

function initials(name: string | undefined): string {
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export function AppLayout() {
  const { me, lock, logout, vaultPending } = useSession()

  return (
    <div className="app">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>

      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <img src="/brand/koffra-logo-256.png" alt="" width={40} height={27} />
          <span>KOFFRA</span>
        </div>
        <nav className="nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon className="icon" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-card" title={me?.user.email}>
            <span className="avatar" aria-hidden>
              {initials(me?.user.name)}
            </span>
            <span className="user-meta">
              <strong>{me?.user.name}</strong>
              <small>Administrateur</small>
            </span>
          </div>
          <button type="button" className="nav-link" onClick={() => void lock()}>
            <Lock className="icon" aria-hidden />
            <span>Verrouiller</span>
          </button>
          <button type="button" className="nav-link" onClick={() => void logout()}>
            <LogOut className="icon" aria-hidden />
            <span>Se déconnecter</span>
          </button>
        </div>
      </aside>

      {/* Barre supérieure mobile */}
      <header className="topbar">
        <div className="brand">
          <img src="/brand/koffra-logo-256.png" alt="" width={34} height={23} />
          <span>KOFFRA</span>
        </div>
        <div className="row">
          <button type="button" className="topbar-btn" onClick={() => void lock()} aria-label="Verrouiller le coffre">
            <Lock className="icon" aria-hidden />
          </button>
          <button type="button" className="topbar-btn" onClick={() => void logout()} aria-label="Se déconnecter">
            <LogOut className="icon" aria-hidden />
          </button>
        </div>
      </header>

      <main id="contenu" className="content" tabIndex={-1}>
        {vaultPending ? (
          <Alert kind="warning" title="Accès au coffre en attente">
            Communiquez votre empreinte de sécurité (Paramètres) à un administrateur : il vous transmettra l’accès après vérification.
          </Alert>
        ) : null}
        <Outlet />
      </main>

      {/* Navigation mobile en bas d'écran */}
      <nav className="tabbar" aria-label="Navigation rapide">
        {NAV.filter((n) => n.mobile).map(({ to, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
            <Icon className="icon" aria-hidden />
            <span>{short}</span>
          </NavLink>
        ))}
        <NavLink to="/menu" className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          <Menu className="icon" aria-hidden />
          <span>Plus</span>
        </NavLink>
      </nav>
    </div>
  )
}
