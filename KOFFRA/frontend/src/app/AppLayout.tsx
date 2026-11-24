import { ChevronDown, Lock, LogOut, Settings, Vault } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { Alert } from '../components/ui'
import { useSession } from './session'

function initials(name: string | undefined): string {
  return (name ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

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
        </span>
        <span className="account-name">{me?.user.name}</span>
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

/** Structure de l'application : une barre en haut, deux écrans (Coffre, Paramètres). */
export function AppLayout() {
  const { lock, vaultPending } = useSession()

  return (
    <div className="app">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <header className="appbar">
        <NavLink to="/coffre" className="brand" aria-label="KOFFRA — coffre">
          <img src="/brand/koffra-logo-256.png" alt="" width={36} height={24} />
          <span>KOFFRA</span>
        </NavLink>
        <nav className="appnav" aria-label="Navigation principale">
          <NavLink to="/coffre" className={({ isActive }) => `appnav-link ${isActive ? 'active' : ''}`}>
            <Vault className="icon" aria-hidden />
            <span>Coffre</span>
          </NavLink>
          <NavLink to="/parametres" className={({ isActive }) => `appnav-link ${isActive ? 'active' : ''}`}>
            <Settings className="icon" aria-hidden />
            <span>Paramètres</span>
          </NavLink>
        </nav>
        <div className="appbar-end">
          <button type="button" className="lock-btn" onClick={() => void lock()} title="Verrouiller le coffre" aria-label="Verrouiller le coffre">
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
  )
}
