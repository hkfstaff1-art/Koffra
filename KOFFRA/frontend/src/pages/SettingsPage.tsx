import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Alert, Button, Modal, PasswordInput, errorMessage } from '../components/ui'
import { changePassword, prepareLogin, publicKeyFingerprint, regenerateRecoveryKey, wipe } from '../crypto'
import { useReauth } from '../app/reauth'
import { useSession } from '../app/session'
import { koffra, toApiPassword, toApiRecovery } from '../services/api/koffra'
import { buildEncryptedExport, importEncryptedExport, rotateVaultKey } from '../features/vault/operations'
import { useVault } from '../features/vault/VaultProvider'
import { RecoveryKeyNotice, StrengthMeter, validateNewPassword } from './auth/AuthLayout'

type Msg = { kind: 'success' | 'error' | 'warning'; text: string } | null

export function SettingsPage() {
  const { me, account, vaultKeys, currentKey, autoLockMinutes, setAutoLockMinutes, refresh } = useSession()
  const { withReauth } = useReauth()
  const vault = useVault()
  const [fingerprint, setFingerprint] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [newRecovery, setNewRecovery] = useState<string | null>(null)
  const [progress, setProgress] = useState('')

  useEffect(() => {
    if (me) void publicKeyFingerprint(me.keys.public_key).then(setFingerprint)
  }, [me])

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name)
    setMsg(null)
    try {
      await fn()
    } catch (err) {
      setMsg({ kind: 'error', text: errorMessage(err) })
    } finally {
      setBusy(null)
      setProgress('')
    }
  }

  return (
    <div className="stack">
      <h1>Paramètres et sécurité</h1>
      {msg ? <Alert kind={msg.kind}>{msg.text}</Alert> : null}

      <section className="card stack">
        <h2>Mon empreinte de sécurité</h2>
        <p>À communiquer à un autre administrateur lorsqu’il vous transmet l’accès au coffre.</p>
        <p className="fingerprint">{fingerprint}</p>
      </section>

      <section className="card stack">
        <h2>Verrouillage automatique</h2>
        <label htmlFor="autolock">Verrouiller le coffre après</label>
        <select id="autolock" value={autoLockMinutes} onChange={(e) => setAutoLockMinutes(Number(e.target.value))}>
          {[1, 2, 5, 10, 15, 30].map((m) => (
            <option key={m} value={m}>
              {m} minute{m > 1 ? 's' : ''} d’inactivité
            </option>
          ))}
        </select>
        <p className="field-hint">Le coffre se verrouille aussi à la fermeture de l’onglet.</p>
      </section>

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
            setMsg({ kind: 'success', text: 'Mot de passe modifié. Vos autres sessions ont été fermées.' })
          })
        }
      />

      <section className="card stack">
        <h2>Clé de récupération</h2>
        <p>Générez une nouvelle clé si vous avez perdu l’ancienne ou pensez qu’elle a été vue. L’ancienne cessera de fonctionner.</p>
        <Button
          variant="secondary"
          busy={busy === 'recovery'}
          onClick={() =>
            run('recovery', async () => {
              if (!account) return
              const { recovery, recoveryKey } = await regenerateRecoveryKey(account)
              await withReauth(() => koffra.regenerateRecovery(toApiRecovery(recovery)))
              setNewRecovery(recoveryKey)
            })
          }
        >
          Générer une nouvelle clé de récupération
        </Button>
      </section>

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
            setMsg({ kind: 'success', text: 'Export chiffré téléchargé. Conservez la phrase d’export séparément du fichier.' })
          })
        }
        onImport={(file, passphrase) =>
          run('import', async () => {
            if (!currentKey) throw new Error('Coffre non accessible.')
            const parsed: unknown = JSON.parse(await file.text())
            const res = await importEncryptedExport(parsed, passphrase, currentKey, (d, t) => setProgress(`${d}/${t}`))
            await vault.reload()
            setMsg({ kind: 'success', text: `Import terminé : ${res.items} entrée(s), ${res.categories} catégorie(s).` })
          })
        }
      />

      <section className="card stack">
        <h2>Rotation de la clé du coffre</h2>
        <p>Recommandée après la désactivation d’un administrateur : toutes les données sont re-chiffrées avec une nouvelle clé. Ce que l’ancien administrateur a pu voir reste compromis.</p>
        {progress && busy === 'rotation' ? <p role="status">Re-chiffrement : {progress}</p> : null}
        <Button
          variant="secondary"
          busy={busy === 'rotation'}
          disabled={!currentKey}
          onClick={() =>
            window.confirm('Re-chiffrer tout le coffre avec une nouvelle clé ? Ne fermez pas la page pendant l’opération.') &&
            run('rotation', async () => {
              if (!account || !currentKey) return
              const admins = await koffra.admins()
              const version = await withReauth(() => rotateVaultKey(account, vaultKeys, currentKey.version, admins.data, (d, t) => setProgress(`${d}/${t}`)))
              await refresh()
              setMsg({ kind: 'success', text: `Rotation terminée : clé du coffre version ${version}.` })
            })
          }
        >
          Lancer la rotation
        </Button>
      </section>

      <section className="card stack">
        <h2>Limites de sécurité</h2>
        <ul>
          <li>KOFFRA n’est ni inviolable ni certifié : un appareil compromis ou laissé déverrouillé peut exposer vos données.</li>
          <li>Ne stockez jamais de code PIN, CVV, mot de passe de paiement ni code OTP bancaire.</li>
          <li>Sans mot de passe ni clé de récupération, les données sont définitivement perdues.</li>
          <li>Un audit de sécurité indépendant est requis avant d’y stocker des données réelles.</li>
        </ul>
      </section>

      {newRecovery ? (
        <Modal title="Nouvelle clé de récupération" onClose={() => setNewRecovery(null)}>
          <RecoveryKeyNotice recoveryKey={newRecovery} onDone={() => setNewRecovery(null)} />
        </Modal>
      ) : null}
    </div>
  )
}

function PasswordChange({ busy, onSubmit }: { busy: boolean; onSubmit: (current: string, next: string) => Promise<void> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const invalid = validateNewPassword(next, confirm)
    if (invalid) return setError(invalid)
    setError(null)
    await onSubmit(current, next)
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>Changer de mot de passe</h2>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <PasswordInput label="Mot de passe actuel" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
      <PasswordInput label="Nouveau mot de passe" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
      <StrengthMeter password={next} />
      <PasswordInput label="Confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      <Button type="submit" busy={busy}>
        Changer le mot de passe
      </Button>
    </form>
  )
}

function ExportImport({ busy, progress, onExport, onImport }: { busy: string | null; progress: string; onExport: (p: string) => void; onImport: (f: File, p: string) => void }) {
  const [exportPass, setExportPass] = useState('')
  const [importPass, setImportPass] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <section className="card stack">
      <h2>Export et restauration chiffrés</h2>
      <p>L’export est toujours chiffré par une phrase que vous choisissez (12 caractères minimum). Les pièces jointes ne sont pas incluses : elles sont couvertes par la sauvegarde du serveur.</p>
      <PasswordInput label="Phrase d’export" value={exportPass} onChange={(e) => setExportPass(e.target.value)} autoComplete="new-password" />
      <Button variant="secondary" busy={busy === 'export'} disabled={exportPass.length < 12} onClick={() => onExport(exportPass)}>
        Télécharger l’export chiffré
      </Button>
      <hr />
      <label htmlFor="import-file">Fichier d’export (.koffra.json)</label>
      <input id="import-file" ref={fileRef} type="file" accept=".json,application/json" />
      <PasswordInput label="Phrase de l’export à restaurer" value={importPass} onChange={(e) => setImportPass(e.target.value)} autoComplete="off" />
      {progress && busy === 'import' ? <p role="status">Import : {progress}</p> : null}
      <Button
        variant="secondary"
        busy={busy === 'import'}
        onClick={() => {
          const f = fileRef.current?.files?.[0]
          if (f && importPass) onImport(f, importPass)
        }}
      >
        Restaurer dans ce coffre
      </Button>
    </section>
  )
}
