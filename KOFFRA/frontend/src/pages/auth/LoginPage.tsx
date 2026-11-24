import { ArrowLeft, Lock, LogOut, Mail, RotateCw, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { errorMessage } from '../../components/format'
import { Alert, Button, PasswordInput, TextInput } from '../../components/ui'
import { rules, validate, type FieldErrors } from '../../components/validation'
import { prepareLogin, wipe } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, type MeResponse, type OtpRequired } from '../../services/api/koffra'
import { AuthLayout } from './AuthLayout'

const loginSchema = z.object({ email: rules.email, password: rules.currentPassword })
const otpSchema = z.object({ code: rules.otp })

export function LoginPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  const [values, setValues] = useState({ email: '', password: '' })
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<FieldErrors<typeof values & { code: string }>>({})
  const [otp, setOtp] = useState<OtpRequired | null>(null)
  const [wrapKey, setWrapKey] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function finish(me: MeResponse, key: Uint8Array) {
    setValues((v) => ({ ...v, password: '' }))
    await openSession(me, key)
    navigate('/', { replace: true })
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(loginSchema, values)
    setErrors(invalid ?? {})
    if (invalid) return
    setBusy(true)
    setError(null)
    try {
      const { kdf_params } = await koffra.prelogin(values.email)
      const keys = await prepareLogin(values.password, kdf_params) // Argon2id local
      const res = await koffra.login({ email: values.email, auth_key: keys.authKey, device_label: deviceLabel() })
      if ('otp_required' in res) {
        setOtp(res)
        setWrapKey(keys.wrapKey)
      } else {
        await finish(res, keys.wrapKey)
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(otpSchema, { code })
    setErrors(invalid ?? {})
    if (invalid || !otp || !wrapKey) return
    setBusy(true)
    setError(null)
    try {
      await finish(await koffra.verifyOtp(otp.challenge, code), wrapKey)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      setOtp(await koffra.resendOtp())
      setInfo('Un nouveau code vient de vous être envoyé.')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function cancel() {
    if (wrapKey) await wipe(wrapKey)
    setWrapKey(null)
    setOtp(null)
    setCode('')
    setInfo(null)
    setError(null)
  }

  if (otp) {
    return (
      <AuthLayout title="Vérification de l’appareil" subtitle={<>Cet appareil n’est pas encore approuvé. Saisissez le code envoyé à <strong>{otp.destination}</strong>.</>}>
        {error ? <Alert kind="error">{error}</Alert> : null}
        {info ? <Alert kind="success">{info}</Alert> : null}
        <form onSubmit={submitCode} className="stack" noValidate>
          <TextInput
            label="Code à 6 chiffres"
            icon={ShieldCheck}
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={errors.code}
            hint="Valable 5 minutes, à usage unique."
            autoComplete="one-time-code"
            autoFocus
            className="otp-input"
            required
          />
          <Button type="submit" busy={busy} className="btn-block">
            Valider
          </Button>
          <div className="row between">
            <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={cancel}>
              Retour
            </Button>
            <Button variant="ghost" size="sm" icon={RotateCw} onClick={resend}>
              Renvoyer un code
            </Button>
          </div>
        </form>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre coffre-fort KOFFRA.">
      {error ? <Alert kind="error">{error}</Alert> : null}
      <form onSubmit={submitPassword} className="stack" noValidate>
        <TextInput
          label="Adresse email"
          icon={Mail}
          type="email"
          value={values.email}
          onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
          error={errors.email}
          autoComplete="username"
          autoFocus
          required
        />
        <PasswordInput
          label="Mot de passe"
          icon={Lock}
          value={values.password}
          onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
          error={errors.password}
          autoComplete="current-password"
          required
        />
        <Button type="submit" busy={busy} className="btn-block">
          {busy ? 'Vérification…' : 'Se connecter'}
        </Button>
        <p className="center small">
          <Link to="/recuperation">Mot de passe oublié ? Utiliser ma clé de récupération</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

/** Session serveur valide mais coffre verrouillé : seul le mot de passe est redemandé (aucun envoi au serveur). */
export function UnlockPage() {
  const { me, unlock, logout } = useSession()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password) return setError('Saisissez votre mot de passe.')
    setBusy(true)
    setError(null)
    try {
      await unlock(password)
      setPassword('')
    } catch {
      setError('Mot de passe incorrect.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Coffre verrouillé" subtitle={<>Connecté en tant que <strong>{me?.user.email}</strong></>}>
      <form onSubmit={submit} className="stack" noValidate>
        <PasswordInput label="Mot de passe" icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} error={error} autoFocus autoComplete="current-password" required />
        <Button type="submit" busy={busy} className="btn-block">
          Déverrouiller
        </Button>
        <Button variant="ghost" icon={LogOut} onClick={() => void logout()}>
          Se déconnecter
        </Button>
      </form>
    </AuthLayout>
  )
}
