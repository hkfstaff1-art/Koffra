import { AlertCircle, AlertTriangle, CheckCircle2, Info, Trash2, X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from './ui'

/* ---------------------------------------------------------------------------------------------
 * Notifications (toasts) : confirmations brèves qui disparaissent seules. Jamais de secret dedans.
 * ------------------------------------------------------------------------------------------- */
type ToastKind = 'success' | 'error' | 'info' | 'warning'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

const TOAST_ICONS: Record<ToastKind, LucideIcon> = { success: CheckCircle2, error: AlertCircle, info: Info, warning: AlertTriangle }

/* ---------------------------------------------------------------------------------------------
 * Confirmations : remplacent window.confirm par une fenêtre modale cohérente avec l'application.
 * ------------------------------------------------------------------------------------------- */
export interface ConfirmOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'warning' | 'default'
  icon?: LucideIcon
}

interface FeedbackValue {
  toast: (kind: ToastKind, message: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackValue | null>(null)

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const toast = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-1), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3000)
    },
    [dismiss],
  )

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setDialog(options)
      }),
    [],
  )

  const close = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setDialog(null)
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.kind]
          return (
            <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <Icon className="icon" aria-hidden />
              <span>{t.message}</span>
              <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fermer la notification">
                <X className="icon-sm" aria-hidden />
              </button>
            </div>
          )
        })}
      </div>

      {dialog ? (
        <Modal
          size="sm"
          title={dialog.title}
          icon={dialog.icon ?? (dialog.tone === 'danger' ? Trash2 : AlertTriangle)}
          tone={dialog.tone ?? 'warning'}
          onClose={() => close(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                {dialog.cancelLabel ?? 'Annuler'}
              </Button>
              <Button variant={dialog.tone === 'danger' ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {dialog.confirmLabel ?? 'Confirmer'}
              </Button>
            </>
          }
        >
          {dialog.message ? <div className="confirm-text">{dialog.message}</div> : null}
        </Modal>
      ) : null}
    </FeedbackContext.Provider>
  )
}

export function useFeedback(): FeedbackValue {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback hors de FeedbackProvider')
  return ctx
}
