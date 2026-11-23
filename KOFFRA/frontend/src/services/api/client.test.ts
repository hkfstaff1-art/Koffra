import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, readXsrfToken } from './client'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('readXsrfToken', () => {
  it('extrait et décode le cookie XSRF-TOKEN', () => {
    expect(readXsrfToken('a=1; XSRF-TOKEN=abc%3D%3D; b=2')).toBe('abc==')
  })

  it('renvoie null si absent', () => {
    expect(readXsrfToken('a=1')).toBeNull()
  })
})

describe('apiRequest', () => {
  it('appelle l’API versionnée sans cache et avec les cookies de même origine', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('GET', '/health')).resolves.toEqual({ status: 'ok' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/health')
    expect(init.credentials).toBe('same-origin')
    expect(init.cache).toBe('no-store')
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBeUndefined()
  })

  it('envoie le jeton CSRF sur les requêtes non sûres', async () => {
    document.cookie = 'XSRF-TOKEN=jeton-test'
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await apiRequest('POST', '/x', { a: 1 })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['X-XSRF-TOKEN']).toBe('jeton-test')
    expect(init.body).toBe('{"a":1}')
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  it('lève une ApiError avec le message du serveur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Non autorisé' }, 401)))

    const error = await apiRequest('GET', '/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, message: 'Non autorisé' })
  })

  it('ne stocke rien dans localStorage ni sessionStorage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' })))
    await apiRequest('GET', '/health')
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })
})
