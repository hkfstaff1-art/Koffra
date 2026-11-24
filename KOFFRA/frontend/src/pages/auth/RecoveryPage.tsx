import { ArrowLeft, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'
import { errorMessage } from '../../components/format'
import { Alert, Button, PasswordInput, TextInput } from '../../components/ui'
import { newPasswordSchema, rules, validate, type FieldErrors } from '../../components/validation'
import { prepareLogin, prepareRecovery, recoverAccount, wipe } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, toApiPassword, toApiRecovery } from '../../services/api/koffra'
import { AuthLayout, RecoveryKeyNotice, StrengthMeter } from './AuthLayout'

const keySchema = z.object({ email: rules.email, recoveryKey: z.string().trim().min(20, 'Saisissez la clé de récupération complète.') })
const codeSchema = z.object({ code: rules.otp })
const passwordSchema = newPasswordSchema({})

/** Mot de passe oublié : clé de récupération + code email, puis nouveau mot de passe. */
export function RecoveryPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  const [step, setStep] = useState<'key' | 'code' | 'password' | 'done'>('key')
  const [values, setValues] = useState({ email: '', recoveryKey: '', code: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<typeof values>>({})
  const [challenge, setChallenge] = useState('')
  const [destination, setDestination] = useState('')
  const [wrapKey, setWrapKey] = useState<Uint8Array | null>(null)
  const [newRecoveryKey, setNewRecoveryKey] = useState('')
  const [stored, setStored] = useState<Awaited<ReturnType<typeof koffra.recoveryVerify>> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }))

  const run = async <S extends Record<string, unknown>>(schema: z.ZodType<S>, data: S, fn: () => Promise<void>) => {
    const invalid = validate(schema, data)
    setErrors((invalid ?? {}) as FieldErrors<typeof values>)
    if (invalid) return
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
    void run(keySchema, { email: values.email, recoveryKey: values.recoveryKey }, async () => {
      const proof = await prepareRecovery(values.recoveryKey)
      setValues((v) => ({ ...v, recoveryKey: '' }))
      const res = await koffra.recoveryStart(values.email, proof.authKey)
      setWrapKey(proof.wrapKey)
      setChallenge(res.challenge)
      setDestination(res.destination)
      setStep('code')
    })
  }

  const submitCode = (e: FormEvent) => {
    e.preventDefault()
    void run(codeSchema, { code: values.code }, async () => {
      setStored(await koffra.recoveryVerify(challenge, values.code))
      setStep('password')
    })
  }

  const submitPassword = (e: FormEvent) => {
    e.preventDefault()
    if (!stored || !wrapKey) return
    void run(passwordSchema, { password: values.password, confirm: values.confirm }, async () => {
      const result = await recoverAccount(
        wrapKey,
        {
          userUuid: stored.user_uuid,
          encryptedUserKey: stored.encrypted_user_key_by_recovery,
          encryptedUserKeyByRecovery: stored.encrypted_user_key_by_recovery,
          publicKey: stored.public_key,
          encryptedPrivateKey: stored.encrypted_private_key,
        },
        values.password,
        stored.kdf_defaults,
      )
      await koffra.recoveryComplete({ ...toApiPassword(result.password), recovery: toApiRecovery(result.recovery), device_label: deviceLabel() })
      setNewRecoveryKey(result.recoveryKey)
      setStep('done')
    })
  }

  async function finish() {
    const me = await koffra.me()
    const { wrapKey: wk } = await prepareLogin(values.password, me.keys.kdf_params)
    setValues((v) => ({ ...v, password: '', confirm: '' }))
    await openSession(me, wk)
    navigate('/', { replace: true })
  }

  async function cancel() {
    if (wrapKey) await wipe(wrapKey)
    navigate('/connexion')
  }

  return (
    <AuthLayout
      title="Récupération du compte"
      subtitle={step === 'key' ? 'Utilisez la clé de récupération remise à la création de votre compte.' : undefined}
      wide={step === 'done'}
    >
      {error ? <Alert kind="error">{error}</Alert> : null}

      {step === 'key' ? (
        <form onSubmit={submitKey} className="stack" noValidate>
          <TextInput label="Adresse email" icon={Mail} type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="username" required />
          <TextInput label="Clé de récupération" icon={KeyRound} value={values.recoveryKey} onChange={set('recoveryKey')} error={errors.recoveryKey} autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX-…" required />
          <Button type="submit" busy={busy} className="btn-block">
            Continuer
          </Button>
          <p className="center small">
            <Link to="/connexion">
              <ArrowLeft className="icon-sm" aria-hidden /> Retour à la connexion
            </Link>
          </p>
        </form>
      ) : null}

      {step === 'code' ? (
        <form onSubmit={submitCode} className="stack" noValidate>
          <p>
            Si la clé est valide, un code a été envoyé à <strong>{destination}</strong>.
          </p>
          <TextInput label="Code à 6 chiffres" icon={ShieldCheck} inputMode="numeric" maxLength={6} value={values.code} onChange={(e) => setValues((v) => ({ ...v, code: e.target.value.replace(/\D/g, '') }))} error={errors.code} autoFocus autoComplete="one-time-code" className="otp-input" required />
          <Button type="submit" busy={busy} className="btn-block">
            Vérifier
          </Button>
          <Button variant="ghost" icon={ArrowLeft} onClick={cancel}>
            Annuler
          </Button>
        </form>
      ) : null}

      {step === 'password' ? (
        <form onSubmit={submitPassword} className="stack" noValidate>
          <Alert kind="info">Toutes vos autres sessions seront fermées et une nouvelle clé de récupération sera créée.</Alert>
          <PasswordInput label="Nouveau mot de passe" icon={Lock} value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" required />
          <StrengthMeter password={values.password} />
          <PasswordInput label="Confirmer" icon={Lock} value={values.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" required />
          <Button type="submit" busy={busy} className="btn-block">
            Enregistrer le nouveau mot de passe
          </Button>
        </form>
      ) : null}

      {step === 'done' ? <RecoveryKeyNotice recoveryKey={newRecoveryKey} onDone={finish} /> : null}
    </AuthLayout>
  )
}
