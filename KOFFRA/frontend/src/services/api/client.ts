/**
 * Client HTTP de l'API KOFFRA.
 *
 * - Authentification par cookie de session HttpOnly (Sanctum SPA) : aucun token
 *   n'est jamais stocké dans localStorage / sessionStorage.
 * - Protection CSRF : le cookie XSRF-TOKEN (lisible) est renvoyé dans l'en-tête X-XSRF-TOKEN.
 * - Aucune mise en cache des réponses (elles peuvent contenir des données chiffrées du coffre).
 */

export const API_BASE = '/api/v1'

export class ApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }

  /** Code d'erreur métier renvoyé par l'API (ex. « reauth_required »). */
  get code(): string | undefined {
    const d = this.details
    return typeof d === 'object' && d !== null && 'code' in d && typeof d.code === 'string' ? d.code : undefined
  }

  /** Messages de validation (422) aplatis. */
  get validationMessages(): string[] {
    const d = this.details
    if (typeof d !== 'object' || d === null || !('errors' in d) || typeof d.errors !== 'object' || d.errors === null) return []
    return Object.values(d.errors as Record<string, string[]>).flat()
  }
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

/** Appelé quand la session serveur est perdue (401) : l'application revient à l'écran de connexion. */
let unauthorizedHandler: (() => void) | null = null
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

export function readXsrfToken(cookieString: string = document.cookie): string | null {
  for (const part of cookieString.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (rawName === 'XSRF-TOKEN') {
      return decodeURIComponent(rest.join('='))
    }
  }
  return null
}

/** Obtient le cookie CSRF auprès de Sanctum (à appeler avant la première requête non sûre). */
export async function ensureCsrfCookie(): Promise<void> {
  if (readXsrfToken()) return
  await fetch('/sanctum/csrf-cookie', { credentials: 'same-origin', cache: 'no-store' })
}

interface RequestOptions {
  /** Réponse binaire attendue (pièces jointes). */
  binary?: boolean
  /** Ne pas déclencher le retour à la connexion sur 401 (ex. tentative de connexion). */
  silent401?: boolean
}

async function send(method: HttpMethod, path: string, body: unknown, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: options.binary ? 'application/octet-stream' : 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }

  if (UNSAFE_METHODS.has(method)) {
    await ensureCsrfCookie()
    const token = readXsrfToken()
    if (token) headers['X-XSRF-TOKEN'] = token
  }

  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
    headers.Accept = 'application/json'
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  return fetch(`${API_BASE}${path}`, { method, headers, credentials: 'same-origin', cache: 'no-store', body: payload })
}

async function fail(response: Response, options: RequestOptions): Promise<never> {
  const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false
  const payload: unknown = isJson ? await response.json() : null
  const message =
    typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : response.status === 419
        ? 'Session expirée, rechargez la page.'
        : `Erreur ${response.status}`
  if (response.status === 401 && !options.silent401) unauthorizedHandler?.()
  throw new ApiError(response.status, message, payload)
}

export async function apiRequest<T>(method: HttpMethod, path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
  const response = await send(method, path, body, options)
  if (!response.ok) return fail(response, options)

  const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false
  return (isJson ? await response.json() : null) as T
}

export async function apiBinary(path: string): Promise<Uint8Array> {
  const response = await send('GET', path, undefined, { binary: true })
  if (!response.ok) return fail(response, {})
  return new Uint8Array(await response.arrayBuffer())
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiRequest<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => apiRequest<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
}
