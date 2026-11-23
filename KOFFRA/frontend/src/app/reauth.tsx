import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { prepareLogin, wipe } from '../crypto'
import { Alert, Button, Modal, PasswordInput, errorMessage } from '../components/ui'
import { ApiError } from '../services/api/client'
import { koffra } from '../services/api/koffra'
import { useSession } from './session'

/**
 * Réauthentification pour les actions sensibles (export, invitation, sécurité…).
 * `withReauth(action)` exécute l'action ; si l'API répond « reauth_required »,
 * le mot de passe est redemandé, puis l'action est relancée.
 */
interface ReauthValue {
  withReauth: <T>(action: () => Promise<T>) => Promise<T>
  /** Demande le mot de passe (ex. avant d'afficher un secret critique). */
  confirmPassword: () => Promise<boolean>
}

const ReauthContext = createContext<ReauthValue | null>(null)

export function ReauthProvider({ children }: { children: ReactNode }) {
  const { me } = useSession()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef<((ok: boolean) => void) | null>(null)

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pending.current = resolve
        setPassword('')
        setError(null)
        setOpen(true)
      }),
    [],
  )

  const close = (ok: boolean) => {
    setOpen(false)
    setPassword('')
    pending.current?.(ok)
    pending.current = null
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!me) return
    setBusy(true)
    setError(null)
    try {
      const { authKey, wrapKey } = await prepareLogin(password, me.keys.kdf_params)
      await wipe(wrapKey)
      await koffra.reauth(authKey)
      close(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const withReauth = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action()
      } catch (err) {
        if (err instanceof ApiError && err.code === 'reauth_required' && (await ask())) return action()
        throw err
      }
    },
    [ask],
  )

  return (
    <ReauthContext.Provider value={{ withReauth, confirmPassword: ask }}>
      {children}
      {open ? (
        <Modal title="Confirmez votre mot de passe" onClose={() => close(false)}>
          <form onSubmit={submit} className="stack">
            <p>Cette action est sensible : confirmez votre identité.</p>
            {error ? <Alert kind="error">{error}</Alert> : null}
            <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
            <div className="row-end">
              <Button variant="secondary" onClick={() => close(false)}>
                Annuler
              </Button>
              <Button type="submit" busy={busy}>
                Confirmer
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </ReauthContext.Provider>
  )
}

export function useReauth(): ReauthValue {
  const ctx = useContext(ReauthContext)
  if (!ctx) throw new Error('useReauth hors de ReauthProvider')
  return ctx
}
