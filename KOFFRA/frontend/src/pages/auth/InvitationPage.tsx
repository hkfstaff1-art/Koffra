import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Alert, Button, PasswordInput, Spinner, TextInput, errorMessage } from '../../components/ui'
import { createAccountKeys, prepareLogin, publicKeyFingerprint, type CreatedAccount } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, toApiAccountMaterial, type KdfDefaults } from '../../services/api/koffra'
import { AuthLayout, RecoveryKeyNotice, StrengthMeter, validateNewPassword } from './AuthLayout'

/** Acceptation d'une invitation d'administrateur (lien reçu par email). */
export function InvitationPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  const [token] = useState(() => window.location.hash.slice(1))
  const [info, setInfo] = useState<{ email: string; invited_by: string | null; user_uuid: string; kdf_defaults: KdfDefaults } | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [fingerprint, setFingerprint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    koffra.invitationStart(token).then(setInfo, (err) => setError(errorMessage(err)))
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!info) return
    const invalid = validateNewPassword(password, confirm)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      const account = await createAccountKeys(password, info.user_uuid, info.kdf_defaults)
      await koffra.invitationAccept({ ...toApiAccountMaterial(account.material), name, device_label: deviceLabel() })
      setFingerprint(await publicKeyFingerprint(account.material.publicKey))
      setCreated(account)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    const me = await koffra.me()
    const { wrapKey } = await prepareLogin(password, me.keys.kdf_params)
    setPassword('')
    await openSession(me, wrapKey)
    navigate('/', { replace: true })
  }

  if (!token) return <AuthLayout title="Invitation">{<Alert kind="error">Lien d’invitation incomplet.</Alert>}</AuthLayout>

  return (
    <AuthLayout title="Rejoindre le coffre KOFFRA" wide={!!created}>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {!info && !error ? <Spinner /> : null}

      {info && !created ? (
        <form onSubmit={submit} className="stack">
          <p>
            <strong>{info.invited_by ?? 'Un administrateur'}</strong> vous invite comme administrateur ({info.email}). Les administrateurs ont tous les droits.
          </p>
          <TextInput label="Votre nom" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" hint="12 caractères minimum." />
          <StrengthMeter password={password} />
          <PasswordInput label="Confirmer le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          <Button type="submit" busy={busy}>
            Créer mon compte
          </Button>
        </form>
      ) : null}

      {created ? (
        <div className="stack">
          <Alert kind="info">
            <strong>Empreinte de sécurité à communiquer à {info?.invited_by ?? 'l’administrateur'} par téléphone :</strong>
            <p className="fingerprint">{fingerprint}</p>
            Il vérifiera qu’elle correspond avant de vous donner accès au coffre.
          </Alert>
          <RecoveryKeyNotice recoveryKey={created.recoveryKey} onDone={finish} />
        </div>
      ) : null}
    </AuthLayout>
  )
}
