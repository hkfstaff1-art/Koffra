import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Alert, Button, PasswordInput, TextInput, errorMessage } from '../../components/ui'
import { prepareLogin, prepareRecovery, recoverAccount, wipe } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, toApiPassword, toApiRecovery } from '../../services/api/koffra'
import { AuthLayout, RecoveryKeyNotice, StrengthMeter, validateNewPassword } from './AuthLayout'

/** Mot de passe oublié : clé de récupération + code email, puis nouveau mot de passe. */
export function RecoveryPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  const [step, setStep] = useState<'key' | 'code' | 'password' | 'done'>('key')
  const [email, setEmail] = useState('')
  const [recoveryInput, setRecoveryInput] = useState('')
  const [challenge, setChallenge] = useState('')
  const [destination, setDestination] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [wrapKey, setWrapKey] = useState<Uint8Array | null>(null)
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [stored, setStored] = useState<Awaited<ReturnType<typeof koffra.recoveryVerify>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const submitKey = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const proof = await prepareRecovery(recoveryInput)
      setRecoveryInput('')
      const res = await koffra.recoveryStart(email, proof.authKey)
      setWrapKey(proof.wrapKey)
      setChallenge(res.challenge)
      setDestination(res.destination)
      setStep('code')
    })
  }

  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      setStored(await koffra.recoveryVerify(challenge, code))
      setStep('password')
    })
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    const invalid = validateNewPassword(password, confirm)
    if (invalid) return setError(invalid)
    if (!stored || !wrapKey) return
    void run(async () => {
      const result = await recoverAccount(
        wrapKey,
        {
          userUuid: stored.user_uuid,
          encryptedUserKey: stored.encrypted_user_key_by_recovery,
          encryptedUserKeyByRecovery: stored.encrypted_user_key_by_recovery,
          publicKey: stored.public_key,
          encryptedPrivateKey: stored.encrypted_private_key,
        },
        password,
        stored.kdf_defaults,
      )
      await koffra.recoveryComplete({ ...toApiPassword(result.password), recovery: toApiRecovery(result.recovery), device_label: deviceLabel() })
      setNewRecoveryKey(result.recoveryKey)
      setStep('done')
    })
  }

  async function finish() {
    const me = await koffra.me()
    const { wrapKey: wk } = await prepareLogin(password, me.keys.kdf_params)
    setPassword('')
    await openSession(me, wk)
    navigate('/', { replace: true })
  }

  async function cancel() {
    if (wrapKey) await wipe(wrapKey)
    navigate('/connexion')
  }

  return (
    <AuthLayout title="Récupération du compte" wide={step === 'done'}>
      {error ? <Alert kind="error">{error}</Alert> : null}

      {step === 'key' ? (
        <form onSubmit={submitKey} className="stack">
          <p>Saisissez votre email et la clé de récupération remise à la création de votre compte.</p>
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <TextInput label="Clé de récupération" value={recoveryInput} onChange={(e) => setRecoveryInput(e.target.value)} required autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX-…" />
          <Button type="submit" busy={busy}>
            Continuer
          </Button>
          <p className="center">
            <Link to="/connexion">Retour à la connexion</Link>
          </p>
        </form>
      ) : null}

      {step === 'code' ? (
        <form onSubmit={submitCode} className="stack">
          <p>Si la clé est valide, un code a été envoyé à <strong>{destination}</strong>.</p>
          <TextInput label="Code à 6 chiffres" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus autoComplete="one-time-code" />
          <Button type="submit" busy={busy}>
            Vérifier
          </Button>
          <Button variant="ghost" onClick={cancel}>
            Annuler
          </Button>
        </form>
      ) : null}

      {step === 'password' ? (
        <form onSubmit={submitPassword} className="stack">
          <Alert kind="info">Toutes vos autres sessions seront fermées et une nouvelle clé de récupération sera créée.</Alert>
          <PasswordInput label="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          <StrengthMeter password={password} />
          <PasswordInput label="Confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          <Button type="submit" busy={busy}>
            Enregistrer le nouveau mot de passe
          </Button>
        </form>
      ) : null}

      {step === 'done' ? <RecoveryKeyNotice recoveryKey={newRecoveryKey} onDone={finish} /> : null}
    </AuthLayout>
  )
}
