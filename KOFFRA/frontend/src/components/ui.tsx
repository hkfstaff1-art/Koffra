import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

export function Button({
  variant = 'primary',
  size = 'md',
  busy = false,
  icon: Icon,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; busy?: boolean; icon?: LucideIcon }) {
  return (
    <button
      type="button"
      {...props}
      className={`btn btn-${variant} btn-${size} ${children ? '' : 'btn-icon-only'} ${className ?? ''}`}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <Loader2 className="icon spin" aria-hidden /> : Icon ? <Icon className="icon" aria-hidden /> : null}
      {children}
    </button>
  )
}

/** Bouton composé d'une seule icône : libellé accessible obligatoire. */
export function IconButton({ icon, label, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: LucideIcon; label: string; variant?: Variant }) {
  return <Button variant="ghost" size="sm" icon={icon} aria-label={label} title={label} {...props} />
}

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
  required?: boolean
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true; required?: boolean }) => ReactNode
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId()
  const describedBy = error || hint ? `${id}-desc` : undefined
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="required" aria-hidden> *</span> : null}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error ? (
        <p id={describedBy} className="field-error">
          <AlertCircle className="icon-sm" aria-hidden /> {error}
        </p>
      ) : hint ? (
        <p id={describedBy} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode; error?: string | null; icon?: LucideIcon }

export function TextInput({ label, hint, error, required, icon: Icon, ...props }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(a) => (
        <div className={`input-wrap ${Icon ? 'has-lead' : ''}`}>
          {Icon ? <Icon className="input-lead" aria-hidden /> : null}
          <input {...a} {...props} />
        </div>
      )}
    </Field>
  )
}

/** Champ secret : bouton afficher/masquer intégré au champ, à droite. */
export function PasswordInput({ label, hint, error, required, icon: Icon, ...props }: InputProps) {
  const [visible, setVisible] = useState(false)
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(a) => (
        <div className={`input-wrap has-trail ${Icon ? 'has-lead' : ''}`}>
          {Icon ? <Icon className="input-lead" aria-hidden /> : null}
          <input {...a} type={visible ? 'text' : 'password'} autoComplete="off" spellCheck={false} autoCapitalize="off" {...props} />
          <button
            type="button"
            className="input-trail"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={visible}
            title={visible ? 'Masquer' : 'Afficher'}
          >
            {visible ? <EyeOff className="icon" aria-hidden /> : <Eye className="icon" aria-hidden />}
          </button>
        </div>
      )}
    </Field>
  )
}

export function TextArea({ label, hint, error, required, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(a) => <textarea {...a} rows={4} {...props} />}
    </Field>
  )
}

export function SelectField({ label, hint, error, required, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {(a) => (
        <select {...a} {...props}>
          {children}
        </select>
      )}
    </Field>
  )
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="checkbox">
      <input type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  )
}

const CLIPBOARD_CLEAR_MS = 30_000

/** Copie dans le presse-papiers puis tente de l'effacer après 30 s (si le navigateur l'autorise). */
export function CopyButton({ value, label = 'Copier', compact = true }: { value: string; label?: string; compact?: boolean }) {
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

  const text = copied ? 'Copié · effacé dans 30 s' : label
  return (
    <Button variant="ghost" size="sm" icon={copied ? Check : Copy} onClick={copy} aria-label={text} title={text} className={copied ? 'is-success' : ''}>
      {compact ? null : text}
    </Button>
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
    <span className="value-row">
      <code className={`secret ${shown ? '' : 'masked'}`}>{shown ? value : '••••••••••••'}</code>
      <IconButton icon={shown ? EyeOff : Eye} label={shown ? 'Masquer' : 'Afficher'} onClick={toggle} />
      <CopyButton value={value} />
    </span>
  )
}

const ALERT_ICONS: Record<string, LucideIcon> = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: AlertCircle }

export function Alert({ kind = 'info', title, children }: { kind?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: ReactNode }) {
  const Icon = ALERT_ICONS[kind]!
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon className="alert-icon" aria-hidden />
      <div className="alert-body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  )
}

export function Modal({
  title,
  description,
  icon: Icon,
  tone = 'default',
  onClose,
  children,
  footer,
  size = 'md',
}: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  tone?: 'default' | 'danger' | 'warning'
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) {
      // Repli pour les navigateurs (et jsdom) sans showModal : ouverture simple.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    return () => {
      if (typeof dialog?.close === 'function') dialog.close()
      else dialog?.removeAttribute('open')
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="modal-panel">
        <header className="modal-head">
          {Icon ? (
            <span className={`modal-icon tone-${tone}`}>
              <Icon aria-hidden />
            </span>
          ) : null}
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p className="modal-desc">{description}</p> : null}
          </div>
          <IconButton icon={X} label="Fermer" onClick={onClose} className="modal-close" />
        </header>
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </dialog>
  )
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      <Loader2 className="icon spin" aria-hidden /> {label}
    </p>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon aria-hidden />
      </span>
      <strong>{title}</strong>
      {children ? <div className="empty-text">{children}</div> : null}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}
