import { CryptoError } from '../crypto'
import { ApiError } from '../services/api/client'

/** Message d'erreur lisible, sans détail technique ni donnée sensible. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const details = error.validationMessages
    return details.length ? details.join(' ') : error.message
  }
  if (error instanceof CryptoError) return error.message
  if (error instanceof TypeError) return 'Serveur injoignable. Vérifiez votre connexion.'
  if (error instanceof Error && error.message) return error.message
  return 'Une erreur inattendue est survenue.'
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

/** Date courte pour les listes : « 24 nov. » (ou « 24 nov. 2025 » si autre année). */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}
