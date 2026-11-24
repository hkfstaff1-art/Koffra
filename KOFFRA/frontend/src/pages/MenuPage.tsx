import { ChevronRight, Lock, LogOut } from 'lucide-react'
import { Link } from 'react-router'
import { NAV } from '../app/AppLayout'
import { useSession } from '../app/session'
import { PageHeader } from '../components/ui'

/** Menu complet pour le mobile (onglet « Plus »). */
export function MenuPage() {
  const { me, lock, logout } = useSession()
  return (
    <div className="stack">
      <PageHeader title="Menu" description={me?.user.email} />
      <ul className="menu-list card">
        {NAV.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link to={to}>
              <Icon className="icon" aria-hidden />
              <span>{label}</span>
              <ChevronRight className="icon chevron" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <ul className="menu-list card">
        <li>
          <button type="button" onClick={() => void lock()}>
            <Lock className="icon" aria-hidden />
            <span>Verrouiller le coffre</span>
          </button>
        </li>
        <li>
          <button type="button" className="danger" onClick={() => void logout()}>
            <LogOut className="icon" aria-hidden />
            <span>Se déconnecter</span>
          </button>
        </li>
      </ul>
    </div>
  )
}
