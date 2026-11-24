import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, LogOut, ShieldOff, Smartphone } from 'lucide-react'
import { useFeedback } from '../components/feedback'
import { errorMessage, formatDate } from '../components/format'
import { Badge, Button, PageHeader, Spinner } from '../components/ui'
import { useSession } from '../app/session'
import { koffra } from '../services/api/koffra'

export function DevicesPage() {
  const { logout } = useSession()
  const { toast, confirm } = useFeedback()
  const qc = useQueryClient()
  const devices = useQuery({ queryKey: ['devices'], queryFn: koffra.devices })

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('success', ok)
      await qc.invalidateQueries({ queryKey: ['devices'] })
    } catch (err) {
      toast('error', errorMessage(err))
    }
  }

  return (
    <div className="stack-lg">
      <PageHeader
        title="Appareils et sessions"
        description="Un nouvel appareil doit être approuvé par un code envoyé à votre email. Révoquer un appareil coupe ses sessions immédiatement."
        actions={
          <Button
            variant="secondary"
            icon={LogOut}
            onClick={async () => {
              if (await confirm({ title: 'Déconnecter les autres sessions ?', message: 'Toutes vos sessions, sauf celle-ci, seront fermées.', confirmLabel: 'Déconnecter', tone: 'warning' })) {
                await run(koffra.logoutOthers, 'Toutes les autres sessions ont été fermées.')
              }
            }}
          >
            Déconnecter les autres sessions
          </Button>
        }
      />

      {devices.isPending ? <Spinner /> : null}
      <ul className="device-list">
        {devices.data?.data.map((d) => {
          const Icon = /Android|iOS/.test(d.label) ? Smartphone : Laptop
          return (
            <li key={d.uuid} className={`card device ${d.revoked_at ? 'revoked' : ''}`}>
              <span className="device-icon" aria-hidden>
                <Icon />
              </span>
              <div className="grow">
                <strong>
                  {d.label} {d.current ? <Badge tone="green">Cet appareil</Badge> : null} {d.revoked_at ? <Badge tone="red">Révoqué</Badge> : null}
                </strong>
                <small className="muted">
                  Dernière activité : {formatDate(d.last_seen_at)} · IP {d.last_ip ?? '—'} · approuvé le {formatDate(d.approved_at)}
                </small>
              </div>
              {!d.revoked_at ? (
                <Button
                  variant="danger"
                  size="sm"
                  icon={ShieldOff}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Révoquer « ${d.label} » ?`,
                        message: d.current ? 'C’est l’appareil que vous utilisez : vous serez déconnecté.' : 'Ses sessions seront coupées. Un code par email sera exigé pour le réutiliser.',
                        confirmLabel: 'Révoquer',
                        tone: 'danger',
                      })
                    ) {
                      await run(async () => {
                        await koffra.revokeDevice(d.uuid)
                        if (d.current) await logout()
                      }, 'Appareil révoqué.')
                    }
                  }}
                >
                  Révoquer
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
