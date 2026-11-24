import { ChevronDown, Download, LayoutDashboard, Lock, LogOut, Menu, Search, Settings, Users, LockKeyhole, X, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useInstallApp } from '../components/InstallPrompt'
import { Alert } from '../components/ui'
import { useSession } from './session'

function initials(name: string | undefined): string {
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/coffre', label: 'Coffre', icon: LockKeyhole },
  { to: '/administrateurs', label: 'Administrateurs', icon: Users },
  { to: '/parametres', label: 'Paramètres', icon: Settings },
]

/** Menu du compte (nom, verrouiller, se déconnecter). */
function AccountMenu() {
  const { me, lock, logout } = useSession()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="avatar sm" aria-hidden>
          {initials(me?.user.name)}
          <span className="presence" />
        </span>
        <span className="account-id">
          <strong>{me?.user.name}</strong>
          <small>Administrateur</small>
        </span>
        <ChevronDown className="icon-sm" aria-hidden />
      </button>
      {open ? (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <strong>{me?.user.name}</strong>
            <small>{me?.user.email}</small>
          </div>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), navigate('/parametres/compte'))}>
            <Settings className="icon" aria-hidden /> Mon compte
          </button>
          <button type="button" role="menuitem" onClick={() => void lock()}>
            <Lock className="icon" aria-hidden /> Verrouiller le coffre
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => void logout()}>
            <LogOut className="icon" aria-hidden /> Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Recherche globale : ouvre le coffre filtré sur les mots saisis. */
function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    navigate(`/coffre?q=${encodeURIComponent(q.trim())}`)
    setQ('')
  }
  return (
    <form className="topsearch" role="search" onSubmit={submit}>
      <Search className="search-icon" aria-hidden />
      <input type="search" placeholder="Rechercher dans le coffre…" aria-label="Rechercher dans le coffre" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  )
}

/** Structure : menu latéral (repliable sur mobile) + barre du haut + contenu. */
export function AppLayout() {
  const { lock, logout, vaultPending } = useSession()
  const { available: canInstall, install } = useInstallApp()
  const [drawer, setDrawer] = useState(false)
  const { pathname } = useLocation()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    // Le tiroir se referme après chaque navigation (mobile)
    setLastPath(pathname)
    setDrawer(false)
  }

  return (
    <div className={`shell ${drawer ? 'drawer-open' : ''}`}>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>

      <aside className="sidebar" aria-label="Menu principal">
        <div className="sidebar-head">
          <NavLink to="/" className="side-brand" aria-label="KOFFRA — tableau de bord">
            <img src="/pwa-192.png" alt="" width={34} height={34} />
            <span>KOFFRA</span>
          </NavLink>
          <button type="button" className="sidebar-close" onClick={() => setDrawer(false)} aria-label="Fermer le menu">
            <X className="icon" aria-hidden />
          </button>
        </div>
        <nav className="sidenav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `sidenav-link ${isActive ? 'active' : ''}`}>
              <Icon className="icon" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {canInstall ? (
            <button type="button" className="sidenav-link" onClick={() => void install()}>
              <Download className="icon" aria-hidden />
              <span>Installer l’application</span>
            </button>
          ) : null}
          <button type="button" className="sidenav-link logout" onClick={() => void logout()}>
            <LogOut className="icon" aria-hidden />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
      <div className="scrim" onClick={() => setDrawer(false)} aria-hidden />

      <div className="main">
        <header className="topbar">
          <button type="button" className="top-icon menu-btn" onClick={() => setDrawer(true)} aria-label="Ouvrir le menu">
            <Menu className="icon" aria-hidden />
          </button>
          <GlobalSearch />
          <div className="topbar-end">
            <button type="button" className="top-icon" onClick={() => void lock()} title="Verrouiller le coffre" aria-label="Verrouiller le coffre">
              <Lock className="icon" aria-hidden />
            </button>
            <AccountMenu />
          </div>
        </header>

        <main id="contenu" className="content" tabIndex={-1}>
          {vaultPending ? (
            <div className="content-pad">
              <Alert kind="warning" title="Accès au coffre en attente">
                Communiquez votre empreinte de sécurité (Paramètres → Mon compte) à un administrateur : il vous transmettra l’accès après vérification.
              </Alert>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
