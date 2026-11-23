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
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

const UNSAFE_METHODS: ReadonlySet<HttpMethod> = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

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

export async function apiRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }

  if (UNSAFE_METHODS.has(method)) {
    await ensureCsrfCookie()
    const token = readXsrfToken()
    if (token) headers['X-XSRF-TOKEN'] = token
  }

  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const isJson = response.headers.get('Content-Type')?.includes('application/json') ?? false
  const payload: unknown = isJson ? await response.json() : null

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
        ? payload.message
        : `Erreur ${response.status}`
    throw new ApiError(response.status, message, payload)
  }

  return payload as T
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
}
