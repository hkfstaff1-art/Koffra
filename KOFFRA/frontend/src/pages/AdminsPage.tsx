import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Alert, Button, Modal, Spinner, TextInput, errorMessage, formatDate } from '../components/ui'
import { publicKeyFingerprint, sealVaultKeyFor } from '../crypto'
import { useReauth } from '../app/reauth'
import { useSession } from '../app/session'
import { koffra, type AdminInfo } from '../services/api/koffra'

/** Administrateurs (rôle unique, privilèges complets, 5 comptes max) et partage de l'accès au coffre. */
export function AdminsPage() {
  const { me, currentKey, refresh } = useSession()
  const { withReauth } = useReauth()
  const qc = useQueryClient()
  const admins = useQuery({ queryKey: ['admins'], queryFn: koffra.admins })
  const invitations = useQuery({ queryKey: ['invitations'], queryFn: koffra.invitations })
  const [email, setEmail] = useState('')
  const [granting, setGranting] = useState<AdminInfo | null>(null)
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'warning'; text: string } | null>(null)

  const run = async (fn: () => Promise<unknown>, ok: string, kind: 'success' | 'warning' = 'success') => {
    setMessage(null)
    try {
      await withReauth(fn)
      setMessage({ kind, text: ok })
      await Promise.all([qc.invalidateQueries({ queryKey: ['admins'] }), qc.invalidateQueries({ queryKey: ['invitations'] }), refresh()])
      return true
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) })
      return false
    }
  }

  function invite(e: FormEvent) {
    e.preventDefault()
    void run(() => koffra.invite(email), `Invitation envoyée à ${email}.`).then((ok) => ok && setEmail(''))
  }

  const seatsLeft = (me?.limits.max_accounts ?? 5) - (me?.limits.used_seats ?? 0)

  return (
    <div className="stack">
      <h1>Administrateurs</h1>
      <Alert kind="info">
        KOFFRA n’a qu’un rôle : <strong>administrateur, avec tous les droits</strong> sur le coffre partagé. N’invitez que des personnes de confiance ({me?.limits.used_seats}/{me?.limits.max_accounts} comptes utilisés).
      </Alert>
      {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

      <section className="card stack">
        <h2>Comptes</h2>
        {admins.isPending ? <Spinner /> : null}
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Accès au coffre</th>
              <th>Dernière connexion</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {admins.data?.data.map((a) => (
              <tr key={a.uuid}>
                <td>
                  {a.name} {a.is_me ? <span className="badge">vous</span> : null}
                </td>
                <td>{a.email}</td>
                <td>{a.status === 'disabled' ? 'Désactivé' : a.vault_access === 'confirmed' ? 'Actif' : a.vault_access === 'pending_confirmation' ? 'Transmis (en attente)' : 'À transmettre'}</td>
                <td>{formatDate(a.last_login_at)}</td>
                <td className="row">
                  {!a.is_me && a.status === 'active' && a.vault_access === 'none' && currentKey ? (
                    <Button className="btn-small" onClick={() => setGranting(a)}>
                      Donner l’accès
                    </Button>
                  ) : null}
                  {!a.is_me && a.status === 'active' ? (
                    <Button
                      variant="danger"
                      className="btn-small"
                      onClick={() =>
                        window.confirm(`Désactiver ${a.name} ? Ses sessions seront fermées et son accès retiré.`) &&
                        void run(() => koffra.disableAdmin(a.uuid), 'Compte désactivé. Recommandé : effectuez une rotation de la clé du coffre (Paramètres).', 'warning')
                      }
                    >
                      Désactiver
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <h2>Inviter un administrateur</h2>
        <form onSubmit={invite} className="row align-end">
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={seatsLeft <= 0} />
          <Button type="submit" disabled={seatsLeft <= 0}>
            Inviter
          </Button>
        </form>
        {seatsLeft <= 0 ? <p className="field-hint">Nombre maximal de comptes atteint.</p> : null}
        <ul className="plain-list">
          {invitations.data?.data.map((i) => (
            <li key={i.uuid} className="row between">
              <span>
                {i.email} <small>— expire le {formatDate(i.expires_at)}</small>
              </span>
              <Button variant="ghost" className="btn-small" onClick={() => void run(() => koffra.revokeInvitation(i.uuid), 'Invitation annulée.')}>
                Annuler
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {granting && currentKey ? (
        <GrantModal
          admin={granting}
          onClose={() => setGranting(null)}
          onConfirm={async () => {
            const sealed = await sealVaultKeyFor(granting.public_key, currentKey)
            const ok = await run(() => koffra.grantVault(granting.uuid, currentKey.version, sealed), `Accès transmis à ${granting.name}.`)
            if (ok) setGranting(null)
          }}
        />
      ) : null}
    </div>
  )
}

/** Vérification hors bande de l'empreinte de la clé publique avant de sceller la clé du coffre. */
function GrantModal({ admin, onClose, onConfirm }: { admin: AdminInfo; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [fingerprint, setFingerprint] = useState('')
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void publicKeyFingerprint(admin.public_key).then(setFingerprint)
  }, [admin.public_key])

  return (
    <Modal title={`Donner l’accès au coffre à ${admin.name}`} onClose={onClose}>
      <div className="stack">
        <p>
          Appelez <strong>{admin.name}</strong> et faites-lui lire l’empreinte affichée sur son écran. Elle doit être <strong>identique</strong> à celle-ci :
        </p>
        <p className="fingerprint">{fingerprint}</p>
        <Alert kind="warning">Si elle diffère, n’accordez pas l’accès : quelqu’un pourrait intercepter le coffre.</Alert>
        <label className="checkbox">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> J’ai vérifié l’empreinte par un autre canal (téléphone, en personne).
        </label>
        <div className="row-end">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!checked}
            busy={busy}
            onClick={async () => {
              setBusy(true)
              await onConfirm()
              setBusy(false)
            }}
          >
            Transmettre l’accès
          </Button>
        </div>
      </div>
    </Modal>
  )
}
