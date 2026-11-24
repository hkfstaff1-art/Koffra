import { Fingerprint, Lock, User } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { errorMessage } from '../../components/format'
import { Alert, Button, PasswordInput, Spinner, TextInput } from '../../components/ui'
import { newPasswordSchema, rules, validate, type FieldErrors } from '../../components/validation'
import { createAccountKeys, prepareLogin, publicKeyFingerprint, type CreatedAccount } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, toApiAccountMaterial, type KdfDefaults } from '../../services/api/koffra'
import { AuthLayout, RecoveryKeyNotice, StrengthMeter } from './AuthLayout'

const schema = newPasswordSchema({ name: rules.name })

/** Acceptation d'une invitation d'administrateur (lien reçu par email). */
export function InvitationPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  const [token] = useState(() => window.location.hash.slice(1))
  const [info, setInfo] = useState<{ email: string; invited_by: string | null; user_uuid: string; kdf_defaults: KdfDefaults } | null>(null)
  const [values, setValues] = useState({ name: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<typeof values>>({})
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [fingerprint, setFingerprint] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }))

  useEffect(() => {
    if (!token) return
    koffra.invitationStart(token).then(setInfo, (err) => setError(errorMessage(err)))
  }, [token])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!info) return
    const invalid = validate(schema, values)
    setErrors(invalid ?? {})
    if (invalid) return
    setBusy(true)
    setError(null)
    try {
      const account = await createAccountKeys(values.password, info.user_uuid, info.kdf_defaults)
      await koffra.invitationAccept({ ...toApiAccountMaterial(account.material), name: values.name, device_label: deviceLabel() })
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
    const { wrapKey } = await prepareLogin(values.password, me.keys.kdf_params)
    setValues((v) => ({ ...v, password: '', confirm: '' }))
    await openSession(me, wrapKey)
    navigate('/', { replace: true })
  }

  if (!token) {
    return (
      <AuthLayout title="Invitation">
        <Alert kind="error">Lien d’invitation incomplet. Ouvrez le lien reçu par email dans son intégralité.</Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Rejoindre le coffre KOFFRA"
      subtitle={info && !created ? <><strong>{info.invited_by ?? 'Un administrateur'}</strong> vous invite comme administrateur ({info.email}).</> : undefined}
      wide={!!created}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}
      {!info && !error ? <Spinner /> : null}

      {info && !created ? (
        <form onSubmit={submit} className="stack" noValidate>
          <Alert kind="info">Les administrateurs ont tous les droits sur le coffre partagé.</Alert>
          <TextInput label="Votre nom" icon={User} value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
          <PasswordInput label="Mot de passe" icon={Lock} value={values.password} onChange={set('password')} error={errors.password} hint="12 caractères minimum." autoComplete="new-password" required />
          <StrengthMeter password={values.password} />
          <PasswordInput label="Confirmer le mot de passe" icon={Lock} value={values.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" required />
          <Button type="submit" busy={busy} className="btn-block">
            Créer mon compte
          </Button>
        </form>
      ) : null}

      {created ? (
        <div className="stack">
          <div className="fingerprint-card">
            <Fingerprint className="icon-lg" aria-hidden />
            <div>
              <strong>Empreinte de sécurité à communiquer par téléphone à {info?.invited_by ?? 'l’administrateur'}</strong>
              <p className="fingerprint">{fingerprint}</p>
              <small>Il vérifiera qu’elle correspond avant de vous donner accès au coffre.</small>
            </div>
          </div>
          <RecoveryKeyNotice recoveryKey={created.recoveryKey} onDone={finish} />
        </div>
      ) : null}
    </AuthLayout>
  )
}
