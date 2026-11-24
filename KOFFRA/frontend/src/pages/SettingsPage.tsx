import { DatabaseBackup, Download, Fingerprint, KeyRound, Lock, MonitorSmartphone, RefreshCcw, ScrollText, ShieldAlert, Timer, Upload, UserCog, Users } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { z } from 'zod'
import { useFeedback } from '../components/feedback'
import { errorMessage } from '../components/format'
import { Alert, Button, Modal, PasswordInput, SelectField } from '../components/ui'
import { newPasswordSchema, rules, validate, type FieldErrors } from '../components/validation'
import { changePassword, prepareLogin, publicKeyFingerprint, regenerateRecoveryKey, wipe } from '../crypto'
import { useReauth } from '../app/reauth'
import { useSession } from '../app/session'
import { koffra, toApiPassword, toApiRecovery } from '../services/api/koffra'
import { buildEncryptedExport, importEncryptedExport, rotateVaultKey } from '../features/vault/operations'
import { useVault } from '../features/vault/VaultProvider'
import { RecoveryKeyNotice, StrengthMeter } from './auth/AuthLayout'

const TABS = [
  { to: 'compte', label: 'Mon compte', icon: UserCog },
  { to: 'appareils', label: 'Appareils', icon: MonitorSmartphone },
  { to: 'administrateurs', label: 'Administrateurs', icon: Users },
  { to: 'journal', label: 'Journal', icon: ScrollText },
  { to: 'sauvegarde', label: 'Sauvegarde', icon: DatabaseBackup },
]

/** Écran Paramètres : un seul endroit, organisé en onglets. */
export function SettingsLayout() {
  return (
    <div className="settings">
      <header className="settings-head">
        <h1>Paramètres</h1>
        <nav className="tabs" aria-label="Rubriques des paramètres">
          {TABS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `tab-link ${isActive ? 'active' : ''}`}>
              <Icon className="icon" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="settings-body">
        <Outlet />
      </div>
    </div>
  )
}

function Section({ icon: Icon, title, description, children }: { icon: typeof Lock; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="card settings-section">
      <header>
        <span className="section-icon" aria-hidden>
          <Icon />
        </span>
        <div>
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
      </header>
      <div className="stack">{children}</div>
    </section>
  )
}

/** Onglet « Mon compte » : mot de passe, clé de récupération, empreinte, verrouillage. */
export function AccountSettings() {
  const { me, account, autoLockMinutes, setAutoLockMinutes, refresh } = useSession()
  const { withReauth } = useReauth()
  const { toast, confirm } = useFeedback()
  const [fingerprint, setFingerprint] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [newRecovery, setNewRecovery] = useState<string | null>(null)

  useEffect(() => {
    if (me) void publicKeyFingerprint(me.keys.public_key).then(setFingerprint)
  }, [me])

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    try {
      await fn()
      return true
    } catch (err) {
      toast('error', errorMessage(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="settings-grid">
      <PasswordChange
        busy={busy === 'password'}
        onSubmit={(current, next) =>
          run('password', async () => {
            if (!account || !me) return
            const { authKey, wrapKey } = await prepareLogin(current, me.keys.kdf_params)
            await wipe(wrapKey)
            await koffra.reauth(authKey)
            const material = await changePassword(account, next, { ops: me.keys.kdf_params.ops, mem: me.keys.kdf_params.mem })
            await koffra.changePassword(toApiPassword(material))
            await refresh()
            toast('success', 'Mot de passe modifié. Vos autres sessions ont été fermées.')
          })
        }
      />

      <div className="stack-lg">
        <Section icon={Timer} title="Verrouillage automatique" description="Le coffre se verrouille aussi à la fermeture de l’onglet.">
          <SelectField label="Verrouiller après" value={autoLockMinutes} onChange={(e) => setAutoLockMinutes(Number(e.target.value))}>
            {[1, 2, 5, 10, 15, 30].map((m) => (
              <option key={m} value={m}>
                {m} minute{m > 1 ? 's' : ''} d’inactivité
              </option>
            ))}
          </SelectField>
        </Section>

        <Section icon={KeyRound} title="Clé de récupération" description="Si vous avez perdu l’ancienne ou pensez qu’elle a été vue. L’ancienne cessera de fonctionner.">
          <div>
            <Button
              variant="secondary"
              icon={RefreshCcw}
              busy={busy === 'recovery'}
              onClick={async () => {
                if (!(await confirm({ title: 'Remplacer la clé de récupération ?', message: 'L’ancienne clé ne fonctionnera plus.', confirmLabel: 'Générer une nouvelle clé', tone: 'warning' }))) return
                await run('recovery', async () => {
                  if (!account) return
                  const { recovery, recoveryKey } = await regenerateRecoveryKey(account)
                  await withReauth(() => koffra.regenerateRecovery(toApiRecovery(recovery)))
                  setNewRecovery(recoveryKey)
                })
              }}
            >
              Générer une nouvelle clé
            </Button>
          </div>
        </Section>

        <Section icon={Fingerprint} title="Mon empreinte de sécurité" description="À communiquer à un administrateur qui vous transmet l’accès au coffre.">
          <p className="fingerprint">{fingerprint}</p>
        </Section>
      </div>

      <div className="span-all">
        <Section icon={ShieldAlert} title="Limites de sécurité">
          <ul className="bullets">
            <li>KOFFRA n’est ni inviolable ni certifié : un appareil compromis ou laissé déverrouillé peut exposer vos données.</li>
            <li>Ne stockez jamais de code PIN, CVV, mot de passe de paiement ni code OTP bancaire.</li>
            <li>Sans mot de passe ni clé de récupération, les données sont définitivement perdues.</li>
          </ul>
        </Section>
      </div>

      {newRecovery ? (
        <Modal icon={KeyRound} title="Nouvelle clé de récupération" onClose={() => setNewRecovery(null)} size="lg">
          <RecoveryKeyNotice recoveryKey={newRecovery} onDone={() => setNewRecovery(null)} />
        </Modal>
      ) : null}
    </div>
  )
}

/** Onglet « Sauvegarde » : export / restauration chiffrés et rotation de la clé du coffre. */
export function BackupSettings() {
  const { account, vaultKeys, currentKey, refresh } = useSession()
  const { withReauth } = useReauth()
  const { toast, confirm } = useFeedback()
  const vault = useVault()
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    try {
      await fn()
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(null)
      setProgress('')
    }
  }

  return (
    <div className="settings-grid">
      <ExportImport
        busy={busy}
        progress={progress}
        onExport={(passphrase) =>
          run('export', async () => {
            const file = await withReauth(() => buildEncryptedExport(vaultKeys, passphrase))
            const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }))
            const a = document.createElement('a')
            a.href = url
            a.download = `koffra-export-${new Date().toISOString().slice(0, 10)}.koffra.json`
            a.click()
            URL.revokeObjectURL(url)
            toast('success', 'Export chiffré téléchargé. Conservez la phrase d’export séparément du fichier.')
          })
        }
        onImport={(file, passphrase) =>
          run('import', async () => {
            if (!currentKey) throw new Error('Coffre non accessible.')
            const parsed: unknown = JSON.parse(await file.text())
            const res = await importEncryptedExport(parsed, passphrase, currentKey, (d, t) => setProgress(`${d}/${t}`))
            await vault.reload()
            toast('success', `Import terminé : ${res.items} entrée(s), ${res.categories} catégorie(s).`)
          })
        }
      />

      <Section icon={RefreshCcw} title="Rotation de la clé du coffre" description="Recommandée après la désactivation d’un administrateur : toutes les données sont re-chiffrées avec une nouvelle clé.">
        {progress && busy === 'rotation' ? (
          <div className="progress" role="status">
            Re-chiffrement : {progress}
          </div>
        ) : null}
        <div>
          <Button
            variant="secondary"
            icon={RefreshCcw}
            busy={busy === 'rotation'}
            disabled={!currentKey}
            onClick={async () => {
              if (
                !(await confirm({
                  title: 'Re-chiffrer tout le coffre ?',
                  message: 'Une nouvelle clé sera créée et toutes les entrées re-chiffrées. Ne fermez pas la page pendant l’opération.',
                  confirmLabel: 'Lancer la rotation',
                  tone: 'warning',
                }))
              )
                return
              await run('rotation', async () => {
                if (!account || !currentKey) return
                const admins = await koffra.admins()
                const version = await withReauth(() => rotateVaultKey(account, vaultKeys, currentKey.version, admins.data, (d, t) => setProgress(`${d}/${t}`)))
                await refresh()
                toast('success', `Rotation terminée : clé du coffre version ${version}.`)
              })
            }}
          >
            Lancer la rotation
          </Button>
        </div>
      </Section>
    </div>
  )
}

const passwordChangeSchema = newPasswordSchema({ current: rules.currentPassword })

function PasswordChange({ busy, onSubmit }: { busy: boolean; onSubmit: (current: string, next: string) => Promise<boolean> }) {
  const [values, setValues] = useState({ current: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<typeof values>>({})
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const invalid = validate(passwordChangeSchema, values)
    setErrors(invalid ?? {})
    if (invalid) return
    if (await onSubmit(values.current, values.password)) setValues({ current: '', password: '', confirm: '' })
  }

  return (
    <Section icon={Lock} title="Changer de mot de passe" description="Vos données ne sont pas re-chiffrées : seule l’enveloppe de votre clé change.">
      <form className="stack" onSubmit={submit} noValidate>
        <PasswordInput label="Mot de passe actuel" value={values.current} onChange={set('current')} error={errors.current} autoComplete="current-password" required />
        <PasswordInput label="Nouveau mot de passe" value={values.password} onChange={set('password')} error={errors.password} autoComplete="new-password" required />
        <StrengthMeter password={values.password} />
        <PasswordInput label="Confirmer le nouveau mot de passe" value={values.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" required />
        <div>
          <Button type="submit" busy={busy}>
            Changer le mot de passe
          </Button>
        </div>
      </form>
    </Section>
  )
}

const exportSchema = z.object({ passphrase: z.string().min(12, 'Au moins 12 caractères.') })

function ExportImport({ busy, progress, onExport, onImport }: { busy: string | null; progress: string; onExport: (p: string) => void; onImport: (f: File, p: string) => void }) {
  const [exportPass, setExportPass] = useState('')
  const [importPass, setImportPass] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<{ export?: string; import?: string; file?: string }>({})
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <Section icon={Download} title="Exporter le coffre" description="Fichier chiffré par une phrase que vous choisissez. Les pièces jointes sont couvertes par la sauvegarde du serveur.">
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            const invalid = validate(exportSchema, { passphrase: exportPass })
            setErrors({ export: invalid?.passphrase })
            if (!invalid) onExport(exportPass)
          }}
        >
          <PasswordInput label="Phrase d’export" value={exportPass} onChange={(e) => setExportPass(e.target.value)} error={errors.export} hint="12 caractères minimum. Conservez-la séparément du fichier." autoComplete="new-password" />
          <div>
            <Button type="submit" variant="secondary" icon={Download} busy={busy === 'export'}>
              Télécharger l’export chiffré
            </Button>
          </div>
        </form>
      </Section>

      <Section icon={Upload} title="Restaurer un export" description="Les entrées restaurées s’ajoutent au coffre existant ; rien n’est supprimé.">
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setErrors({ file: file ? undefined : 'Choisissez un fichier d’export.', import: importPass ? undefined : 'Saisissez la phrase de cet export.' })
            if (file && importPass) onImport(file, importPass)
          }}
        >
          <div className="field">
            <label htmlFor="import-file">Fichier d’export (.koffra.json)</label>
            <div className="file-picker">
              <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>
                Choisir un fichier
              </Button>
              <span className="muted small">{file ? file.name : 'Aucun fichier choisi'}</span>
              <input id="import-file" ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            {errors.file ? <p className="field-error">{errors.file}</p> : null}
          </div>
          <PasswordInput label="Phrase de l’export" value={importPass} onChange={(e) => setImportPass(e.target.value)} error={errors.import} autoComplete="off" />
          {progress && busy === 'import' ? <div className="progress" role="status">Import : {progress}</div> : null}
          <div>
            <Button type="submit" variant="secondary" icon={Upload} busy={busy === 'import'}>
              Restaurer dans ce coffre
            </Button>
          </div>
        </form>
        <Alert kind="info">Conservez vos exports hors de cet appareil (clé USB chiffrée, coffre physique).</Alert>
      </Section>
    </>
  )
}
