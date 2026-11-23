import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Alert, Button, PasswordInput, TextInput, errorMessage } from '../../components/ui'
import { createAccountKeys, generateVaultKey, prepareLogin, wrapVaultKey, type CreatedAccount } from '../../crypto'
import { deviceLabel, useSession } from '../../app/session'
import { koffra, toApiAccountMaterial, type KdfDefaults } from '../../services/api/koffra'
import { AuthLayout, RecoveryKeyNotice, StrengthMeter, validateNewPassword } from './AuthLayout'

/** Initialisation du premier propriétaire (lien produit par `php artisan koffra:install`). */
export function InstallPage() {
  const navigate = useNavigate()
  const { openSession } = useSession()
  // Le jeton est dans le fragment (#) : jamais envoyé au serveur dans l'URL.
  const [token] = useState(() => window.location.hash.slice(1))
  const [step, setStep] = useState<'identity' | 'code' | 'recovery'>('identity')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [start, setStart] = useState<{ user_uuid: string; destination: string; kdf_defaults: KdfDefaults } | null>(null)
  const [created, setCreated] = useState<CreatedAccount | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submitIdentity(e: FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(password, confirm)
    if (invalid) return setError(invalid)
    setBusy(true)
    setError(null)
    try {
      setStart(await koffra.setupStart({ token, name, email }))
      setStep('code')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    if (!start) return
    setBusy(true)
    setError(null)
    try {
      // Toutes les clés sont générées ici, dans le navigateur.
      const account = await createAccountKeys(password, start.user_uuid, start.kdf_defaults)
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
    const { wrapKey } = await prepareLogin(password, me.keys.kdf_params)
    setPassword('')
    setConfirm('')
    await openSession(me, wrapKey)
    navigate('/', { replace: true })
  }

  if (!token) {
    return (
      <AuthLayout title="Initialisation">
        <Alert kind="error">Lien d’initialisation manquant. Générez-en un sur le serveur : <code>php artisan koffra:install</code></Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Création du compte propriétaire" wide={step === 'recovery'}>
      {error ? <Alert kind="error">{error}</Alert> : null}

      {step === 'identity' ? (
        <form onSubmit={submitIdentity} className="stack">
          <p>Ce compte disposera de tous les droits. Votre mot de passe ne quitte jamais cet appareil : il chiffre vos données localement.</p>
          <TextInput label="Nom" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          <TextInput label="Email (canal de vérification)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" hint="12 caractères minimum. Une phrase de plusieurs mots est idéale." />
          <StrengthMeter password={password} />
          <PasswordInput label="Confirmer le mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          <Button type="submit" busy={busy}>
            Recevoir le code de vérification
          </Button>
        </form>
      ) : null}

      {step === 'code' && start ? (
        <form onSubmit={submitCode} className="stack">
          <p>Un code à 6 chiffres a été envoyé à <strong>{start.destination}</strong>.</p>
          <TextInput label="Code de vérification" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoComplete="one-time-code" autoFocus />
          <Button type="submit" busy={busy}>
            Créer le compte et le coffre
          </Button>
          {busy ? <p className="field-hint">Génération des clés de chiffrement…</p> : null}
        </form>
      ) : null}

      {step === 'recovery' && created ? <RecoveryKeyNotice recoveryKey={created.recoveryKey} onDone={finish} /> : null}
    </AuthLayout>
  )
}
