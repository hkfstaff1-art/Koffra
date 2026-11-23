import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Alert, Button, Spinner, errorMessage, formatDate } from '../components/ui'
import { useSession } from '../app/session'
import { koffra } from '../services/api/koffra'

export function DevicesPage() {
  const { logout } = useSession()
  const qc = useQueryClient()
  const devices = useQuery({ queryKey: ['devices'], queryFn: koffra.devices })
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      setMessage({ kind: 'success', text: ok })
      await qc.invalidateQueries({ queryKey: ['devices'] })
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
    }
  }

  return (
    <div className="card stack">
      <h1>Appareils et sessions</h1>
      <p className="field-hint">Un nouvel appareil doit être approuvé par un code envoyé à votre email. Révoquer un appareil coupe ses sessions immédiatement.</p>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}
      <Button variant="secondary" onClick={() => void run(koffra.logoutOthers, 'Toutes les autres sessions ont été fermées.')}>
        Déconnecter toutes mes autres sessions
      </Button>
      {devices.isPending ? <Spinner /> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Appareil</th>
            <th>Dernière activité</th>
            <th>IP (tronquée)</th>
            <th>État</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {devices.data?.data.map((d) => (
            <tr key={d.uuid}>
              <td>
                {d.label} {d.current ? <span className="badge">cet appareil</span> : null}
              </td>
              <td>{formatDate(d.last_seen_at)}</td>
              <td>{d.last_ip ?? '—'}</td>
              <td>{d.revoked_at ? `Révoqué le ${formatDate(d.revoked_at)}` : 'Approuvé'}</td>
              <td>
                {!d.revoked_at ? (
                  <Button
                    variant="danger"
                    className="btn-small"
                    onClick={() =>
                      window.confirm(`Révoquer « ${d.label} » ?`) &&
                      void run(async () => {
                        await koffra.revokeDevice(d.uuid)
                        if (d.current) await logout()
                      }, 'Appareil révoqué.')
                    }
                  >
                    Révoquer
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
