import { Lock, Mail, ShieldCheck, User } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { errorMessage } from '../../components/format'
import { Alert, Button, PasswordInput, TextInput } from '../../components/ui'
import { newPasswordSchema, rules, validate, type FieldErrors } from '../../components/validation'
import { createAccountKeys, generateVaultKey, prepareLogin, wrapVaultKey, type CreatedAccount } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, toApiAccountMaterial, type KdfDefaults } from '../../services/api/koffra'
import { AuthLayout, RecoveryKeyNotice, StrengthMeter } from './AuthLayout'

const identitySchema = newPasswordSchema({ name: rules.name, email: rules.email })
const codeSchema = z.object({ code: rules.otp })

/** Initialisation du premier propriétaire (lien produit par `php artisan koffra:install`). */
export function InstallPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  // Le jeton est dans le fragment (#) : jamais envoyé au serveur dans l'URL.
  const [token] = useState(() => window.location.hash.slice(1))
  const [step, setStep] = useState<'identity' | 'code' | 'recovery'>('identity')
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<FieldErrors<typeof values & { code: string }>>({})
  const [start, setStart] = useState<{ user_uuid: string; destination: string; kdf_defaults: KdfDefaults } | null>(null)
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }))

  async function submitIdentity(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(identitySchema, values)
    setErrors(invalid ?? {})
    if (invalid) return
    setBusy(true)
    setError(null)
    try {
      setStart(await koffra.setupStart({ token, name: values.name, email: values.email }))
      setStep('code')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(codeSchema, { code })
    setErrors(invalid ?? {})
    if (invalid || !start) return
    setBusy(true)
    setError(null)
    try {
      // Toutes les clés sont générées ici, dans le navigateur.
      const account = await createAccountKeys(values.password, start.user_uuid, start.kdf_defaults)
      const vaultKey = await generateVaultKey(1)
      const vaultEnvelope = await wrapVaultKey(account.account, vaultKey)
      vaultKey.key.fill(0)
      await koffra.setupComplete({ ...toApiAccountMaterial(account.material), vault_key: vaultEnvelope, code, device_label: deviceLabel() })
      setCreated(account)
      setStep('recovery')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    setBusy(true)
    const me = await koffra.me()
    const { wrapKey } = await prepareLogin(values.password, me.keys.kdf_params)
    setValues((v) => ({ ...v, password: '', confirm: '' }))
    await openSession(me, wrapKey)
    navigate('/', { replace: true })
  }

  if (!token) {
    return (
      <AuthLayout title="Initialisation">
        <Alert kind="error" title="Lien d’initialisation manquant">
          Générez-en un sur le serveur : <code>php artisan koffra:install</code>
        </Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={step === 'recovery' ? 'Compte créé' : 'Création du compte propriétaire'}
      subtitle={step === 'identity' ? 'Ce compte disposera de tous les droits. Votre mot de passe ne quitte jamais cet appareil.' : undefined}
      wide={step === 'recovery'}
    >
      <ol className="steps" aria-label="Étapes">
        {['Identité', 'Vérification', 'Clé de récupération'].map((label, i) => (
          <li key={label} className={i <= ['identity', 'code', 'recovery'].indexOf(step) ? 'done' : ''} aria-current={i === ['identity', 'code', 'recovery'].indexOf(step) ? 'step' : undefined}>
            <span>{i + 1}</span> {label}
          </li>
        ))}
      </ol>
      {error ? <Alert kind="error">{error}</Alert> : null}

      {step === 'identity' ? (
        <form onSubmit={submitIdentity} className="stack" noValidate>
          <TextInput label="Nom" icon={User} value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" required />
          <TextInput label="Email (canal de vérification)" icon={Mail} type="email" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" required />
          <PasswordInput label="Mot de passe" icon={Lock} value={values.password} onChange={set('password')} error={errors.password} hint="12 caractères minimum. Une phrase de plusieurs mots est idéale." autoComplete="new-password" required />
          <StrengthMeter password={values.password} />
          <PasswordInput label="Confirmer le mot de passe" icon={Lock} value={values.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" required />
          <Button type="submit" busy={busy} className="btn-block">
            Recevoir le code de vérification
          </Button>
        </form>
      ) : null}

      {step === 'code' && start ? (
        <form onSubmit={submitCode} className="stack" noValidate>
          <p>
            Un code à 6 chiffres a été envoyé à <strong>{start.destination}</strong>.
          </p>
          <TextInput label="Code de vérification" icon={ShieldCheck} inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} error={errors.code} autoComplete="one-time-code" autoFocus className="otp-input" required />
          <Button type="submit" busy={busy} className="btn-block">
            {busy ? 'Génération des clés de chiffrement…' : 'Créer le compte et le coffre'}
          </Button>
        </form>
      ) : null}

      {step === 'recovery' && created ? <RecoveryKeyNotice recoveryKey={created.recoveryKey} onDone={finish} /> : null}
    </AuthLayout>
  )
}
