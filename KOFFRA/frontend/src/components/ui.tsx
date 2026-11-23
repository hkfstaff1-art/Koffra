import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { ApiError } from '../services/api/client'
import { CryptoError } from '../crypto'

export function Button({
  variant = 'primary',
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean }) {
  return (
    <button type="button" {...props} className={`btn btn-${variant} ${props.className ?? ''}`} disabled={props.disabled || busy} aria-busy={busy}>
      {busy ? <span className="spinner" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  children: (id: string, describedBy: string | undefined) => ReactNode
}) {
  const id = useId()
  const hintId = hint || error ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function TextInput({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => <input id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...props} />}
    </Field>
  )
}

/** Champ secret masqué par défaut, avec bouton afficher/masquer. */
export function PasswordInput({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} hint={hint} error={error}>
      {(id, describedBy) => (
        <div className="input-row">
          <input
            id={id}
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            {...props}
          />
          <button type="button" className="btn btn-ghost icon-btn" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Masquer' : 'Afficher'}>
            {visible ? '🙈' : '👁'}
          </button>
        </div>
      )}
    </Field>
  )
}

const CLIPBOARD_CLEAR_MS = 30_000

/** Copie dans le presse-papiers puis tente de l'effacer après 30 s (si le navigateur l'autorise). */
export function CopyButton({ value, label = 'Copier' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(async () => {
        setCopied(false)
        try {
          if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('')
        } catch {
          /* lecture du presse-papiers refusée : effacement impossible, sans gravité */
        }
      }, CLIPBOARD_CLEAR_MS)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button type="button" className="btn btn-ghost btn-small" onClick={copy} aria-live="polite">
      {copied ? '✓ Copié (effacé dans 30 s)' : label}
    </button>
  )
}

/** Valeur secrète : masquée par défaut, affichable et copiable. */
export function SecretValue({ value, onReveal }: { value: string; onReveal?: () => Promise<boolean> }) {
  const [shown, setShown] = useState(false)
  async function toggle() {
    if (!shown && onReveal && !(await onReveal())) return
    setShown((s) => !s)
  }
  return (
    <span className="secret">
      <code className={shown ? '' : 'masked'}>{shown ? value : '••••••••••••'}</code>
      <button type="button" className="btn btn-ghost btn-small" onClick={toggle}>
        {shown ? 'Masquer' : 'Afficher'}
      </button>
      <CopyButton value={value} />
    </span>
  )
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal?.()
    return () => dialog?.close?.()
  }, [])
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(e) => (e.preventDefault(), onClose())}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  )
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden /> {label}
    </p>
  )
}

/** Message d'erreur lisible, sans détail technique ni donnée sensible. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.validationMessages
    return details.length ? details.join(' ') : error.message
  }
  if (error instanceof CryptoError) return error.message
  if (error instanceof TypeError) return 'Serveur injoignable. Vérifiez votre connexion.'
  return 'Une erreur inattendue est survenue.'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}
