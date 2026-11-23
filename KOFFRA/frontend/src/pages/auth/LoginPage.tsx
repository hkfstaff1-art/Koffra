import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert, Button, PasswordInput, TextInput, errorMessage } from '../../components/ui'
import { prepareLogin, wipe } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, type MeResponse, type OtpRequired } from '../../services/api/koffra'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [otp, setOtp] = useState<OtpRequired | null>(null)
  const [wrapKey, setWrapKey] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function finish(me: MeResponse, key: Uint8Array) {
    setPassword('')
    await openSession(me, key)
    navigate('/', { replace: true })
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { kdf_params } = await koffra.prelogin(email)
      const keys = await prepareLogin(password, kdf_params) // Argon2id local
      const res = await koffra.login({ email, auth_key: keys.authKey, device_label: deviceLabel() })
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
    if (!otp || !wrapKey) return
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
      setInfo('Nouveau code envoyé.')
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function cancel() {
    if (wrapKey) await wipe(wrapKey)
    setWrapKey(null)
    setOtp(null)
    setCode('')
  }

  return (
    <AuthLayout title={otp ? 'Vérification du nouvel appareil' : 'Connexion'}>
      {error ? <Alert kind="error">{error}</Alert> : null}
      {info ? <Alert kind="success">{info}</Alert> : null}

      {!otp ? (
        <form onSubmit={submitPassword} className="stack">
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoFocus />
          <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <Button type="submit" busy={busy}>
            Se connecter
          </Button>
          <p className="center">
            <Link to="/recuperation">Mot de passe oublié ? Utiliser ma clé de récupération</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={submitCode} className="stack">
          <p>
            Cet appareil n’est pas encore approuvé. Saisissez le code envoyé à <strong>{otp.destination}</strong> (valable 5 minutes).
          </p>
          <TextInput label="Code à 6 chiffres" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" autoFocus />
          <Button type="submit" busy={busy}>
            Valider
          </Button>
          <div className="row">
            <Button variant="ghost" onClick={resend}>
              Renvoyer un code
            </Button>
            <Button variant="ghost" onClick={cancel}>
              Annuler
            </Button>
          </div>
        </form>
      )}
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
    <AuthLayout title="Coffre verrouillé">
      <p>
        Connecté en tant que <strong>{me?.user.email}</strong>.
      </p>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <form onSubmit={submit} className="stack">
        <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus autoComplete="current-password" />
        <Button type="submit" busy={busy}>
          Déverrouiller
        </Button>
        <Button variant="ghost" onClick={() => void logout()}>
          Se déconnecter
        </Button>
      </form>
    </AuthLayout>
  )
}
