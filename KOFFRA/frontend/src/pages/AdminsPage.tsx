import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Fingerprint, KeyRound, Mail, ShieldCheck, Trash2, UserMinus, UserPlus, Users } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { useFeedback } from '../components/feedback'
import { errorMessage, formatDate } from '../components/format'
import { Alert, Badge, Button, Checkbox, IconButton, Modal, PageHeader, Spinner, TextInput } from '../components/ui'
import { rules, validate } from '../components/validation'
import { publicKeyFingerprint, sealVaultKeyFor } from '../crypto'
import { useReauth } from '../app/reauth'
import { useSession } from '../app/session'
import { koffra, type AdminInfo } from '../services/api/koffra'

const inviteSchema = z.object({ email: rules.email })

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/** Administrateurs (rôle unique, privilèges complets, 5 comptes max) et partage de l'accès au coffre. */
export function AdminsPage() {
  const { me, currentKey, refresh } = useSession()
  const { withReauth } = useReauth()
  const { toast, confirm } = useFeedback()
  const qc = useQueryClient()
  const admins = useQuery({ queryKey: ['admins'], queryFn: koffra.admins })
  const invitations = useQuery({ queryKey: ['invitations'], queryFn: koffra.invitations })
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [granting, setGranting] = useState<AdminInfo | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<unknown>, ok: string, kind: 'success' | 'warning' = 'success') => {
    setBusy(true)
    try {
      await withReauth(fn)
      toast(kind, ok)
      await Promise.all([qc.invalidateQueries({ queryKey: ['admins'] }), qc.invalidateQueries({ queryKey: ['invitations'] }), refresh()])
      return true
    } catch (err) {
      toast('error', errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  function invite(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(inviteSchema, { email })
    setEmailError(invalid?.email ?? null)
    if (invalid) return
    void run(() => koffra.invite(email), `Invitation envoyée à ${email}.`).then((ok) => ok && setEmail(''))
  }

  const seatsLeft = (me?.limits.max_accounts ?? 5) - (me?.limits.used_seats ?? 0)

  return (
    <div className="stack-lg">
      <PageHeader title="Administrateurs" description={`${me?.limits.used_seats ?? 0} compte(s) utilisé(s) sur ${me?.limits.max_accounts ?? 5}, invitations en cours comprises.`} />
      <Alert kind="info" title="Un seul rôle : administrateur">
        Chaque administrateur a tous les droits sur le coffre partagé. N’invitez que des personnes de confiance.
      </Alert>

      <section className="card stack">
        <h2>
          <Users className="icon" aria-hidden /> Comptes
        </h2>
        {admins.isPending ? <Spinner /> : null}
        <ul className="list">
          {admins.data?.data.map((a) => (
            <li key={a.uuid} className="list-row admin-row">
              <span className="avatar" aria-hidden>
                {initials(a.name)}
              </span>
              <div className="grow">
                <strong>
                  {a.name} {a.is_me ? <Badge tone="blue">Vous</Badge> : null}
                </strong>
                <small className="muted">
                  {a.email} · dernière connexion : {formatDate(a.last_login_at)}
                </small>
              </div>
              {a.status === 'disabled' ? (
                <Badge tone="red">Désactivé</Badge>
              ) : a.vault_access === 'confirmed' ? (
                <Badge tone="green">Accès actif</Badge>
              ) : a.vault_access === 'pending_confirmation' ? (
                <Badge tone="amber">Accès transmis</Badge>
              ) : (
                <Badge tone="neutral">Sans accès</Badge>
              )}
              {!a.is_me && a.status === 'active' && a.vault_access === 'none' && currentKey ? (
                <Button size="sm" icon={KeyRound} onClick={() => setGranting(a)}>
                  Donner l’accès
                </Button>
              ) : null}
              {!a.is_me && a.status === 'active' ? (
                <IconButton
                  icon={UserMinus}
                  label={`Désactiver ${a.name}`}
                  className="danger-hover"
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Désactiver ${a.name} ?`,
                        message: 'Ses sessions seront fermées immédiatement et son accès au coffre retiré. Une rotation de la clé du coffre sera ensuite recommandée.',
                        confirmLabel: 'Désactiver',
                        tone: 'danger',
                        icon: UserMinus,
                      })
                    ) {
                      await run(() => koffra.disableAdmin(a.uuid), 'Compte désactivé. Recommandé : rotation de la clé du coffre (Paramètres).', 'warning')
                    }
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack">
        <h2>
          <UserPlus className="icon" aria-hidden /> Inviter un administrateur
        </h2>
        <form onSubmit={invite} className="inline-form" noValidate>
          <TextInput label="Adresse email" icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} disabled={seatsLeft <= 0} />
          <Button type="submit" icon={UserPlus} busy={busy} disabled={seatsLeft <= 0}>
            Inviter
          </Button>
        </form>
        {seatsLeft <= 0 ? <Alert kind="warning">Nombre maximal de comptes atteint.</Alert> : <p className="muted small">L’invité reçoit un lien valable 72 heures.</p>}
        {invitations.data?.data.length ? (
          <ul className="list">
            {invitations.data.data.map((i) => (
              <li key={i.uuid} className="list-row">
                <Mail className="icon muted" aria-hidden />
                <span className="grow">
                  {i.email} <small className="muted">— expire le {formatDate(i.expires_at)}</small>
                </span>
                <IconButton
                  icon={Trash2}
                  label={`Annuler l’invitation de ${i.email}`}
                  className="danger-hover"
                  onClick={async () => {
                    if (await confirm({ title: 'Annuler l’invitation ?', message: `Le lien envoyé à ${i.email} ne fonctionnera plus.`, confirmLabel: 'Annuler l’invitation', tone: 'danger' })) {
                      await run(() => koffra.revokeInvitation(i.uuid), 'Invitation annulée.')
                    }
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {granting && currentKey ? (
        <GrantModal
          admin={granting}
          onClose={() => setGranting(null)}
          onConfirm={async () => {
            const sealed = await sealVaultKeyFor(granting.public_key, currentKey)
            if (await run(() => koffra.grantVault(granting.uuid, currentKey.version, sealed), `Accès transmis à ${granting.name}.`)) setGranting(null)
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
    <Modal
      icon={Fingerprint}
      title={`Donner l’accès au coffre à ${admin.name}`}
      description="Vérifiez l’empreinte de sécurité par téléphone ou en personne avant de transmettre l’accès."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            icon={ShieldCheck}
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
        </>
      }
    >
      <div className="stack">
        <p>
          Demandez à <strong>{admin.name}</strong> de lire l’empreinte affichée sur son écran. Elle doit être <strong>identique</strong> :
        </p>
        <p className="fingerprint">{fingerprint}</p>
        <Alert kind="warning">Si elle diffère, n’accordez pas l’accès : quelqu’un pourrait intercepter le coffre.</Alert>
        <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} label="J’ai vérifié l’empreinte par un autre canal (téléphone, en personne)." />
      </div>
    </Modal>
  )
}
