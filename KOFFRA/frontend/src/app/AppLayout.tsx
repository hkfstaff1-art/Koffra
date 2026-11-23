import { NavLink, Outlet } from 'react-router'
import { Alert, Button } from '../components/ui'
import { useSession } from './session'

const NAV = [
  { to: '/', label: 'Tableau de bord', icon: '🏠', end: true },
  { to: '/coffre', label: 'Coffre', icon: '🔐' },
  { to: '/generateur', label: 'Générateur', icon: '🎲' },
  { to: '/categories', label: 'Catégories', icon: '🗂️' },
  { to: '/appareils', label: 'Appareils', icon: '💻' },
  { to: '/administrateurs', label: 'Administrateurs', icon: '👥' },
  { to: '/journal', label: 'Journal', icon: '📜' },
  { to: '/parametres', label: 'Paramètres', icon: '⚙️' },
]

export function AppLayout() {
  const { me, lock, logout, vaultPending } = useSession()

  return (
    <div className="app">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <aside className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <img src="/brand/koffra-logo-256.png" alt="" width={44} height={29} />
          <span>KOFFRA</span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span aria-hidden>{n.icon}</span> <span className="nav-label">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="user-chip" title={me?.user.email}>
            {me?.user.name}
          </p>
          <Button variant="secondary" onClick={() => void lock()}>
            🔒 Verrouiller
          </Button>
          <Button variant="ghost" onClick={() => void logout()}>
            Se déconnecter
          </Button>
        </div>
      </aside>
      <main id="contenu" className="content" tabIndex={-1}>
        {vaultPending ? (
          <Alert kind="warning">
            Votre accès au coffre n’est pas encore actif. Communiquez votre empreinte de sécurité (Paramètres) à un administrateur : il vous transmettra l’accès après vérification.
          </Alert>
        ) : null}
        <Outlet />
      </main>
    </div>
  )
}
