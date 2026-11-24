import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

function mockApi(routes: Record<string, { status: number; body: unknown }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = String(url).replace('/api/v1', '')
      const route = routes[path] ?? { status: 404, body: { message: 'introuvable' } }
      return new Response(JSON.stringify(route.body), { status: route.status, headers: { 'Content-Type': 'application/json' } })
    }),
  )
}

describe('App — routage selon l’état de session', () => {
  it('sans session : affiche la connexion', async () => {
    window.history.pushState({}, '', '/')
    mockApi({ '/me': { status: 401, body: { message: 'Unauthenticated.' } }, '/setup/status': { status: 200, body: { installed: true } } })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Bienvenue sur KOFFRA' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Mot de passe/, { selector: 'input' })).toHaveAttribute('type', 'password')
    // Bouton « œil » intégré au champ, avec libellé accessible
    expect(screen.getByRole('button', { name: 'Afficher le mot de passe' })).toBeInTheDocument()
  })

  it('session serveur valide mais clés absentes : demande le déverrouillage, jamais le coffre', async () => {
    window.history.pushState({}, '', '/coffre')
    mockApi({
      '/me': {
        status: 200,
        body: {
          user: { uuid: 'u', name: 'Admin', email: 'admin@example.test', status: 'active', last_login_at: null, created_at: null },
          device: null,
          keys: { kdf_params: { alg: 'argon2id13', ops: 3, mem: 67108864, salt: 'AAAAAAAAAAAAAAAAAAAAAA' }, encrypted_user_key: {}, public_key: '', encrypted_private_key: {}, current_vault_key_version: 1, vault_key_grants: [] },
          limits: { max_accounts: 5, used_seats: 1 },
        },
      },
    })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Coffre verrouillé' })).toBeInTheDocument()
    expect(screen.getByText('admin@example.test')).toBeInTheDocument()
    expect(screen.queryByText('Coffre', { selector: 'h1' })).not.toBeInTheDocument()
  })

  it('session serveur expirée pendant le verrouillage : se reconnecte au lieu d’afficher « mot de passe incorrect »', async () => {
    window.history.pushState({}, '', '/')
    const me = {
      user: { uuid: 'u', name: 'Admin', email: 'admin@example.test', status: 'active', last_login_at: null, created_at: null },
      device: null,
      keys: { kdf_params: { alg: 'argon2id13', ops: 3, mem: 67108864, salt: 'AAAAAAAAAAAAAAAAAAAAAA' }, encrypted_user_key: {}, public_key: '', encrypted_private_key: {}, current_vault_key_version: 1, vault_key_grants: [] },
      limits: { max_accounts: 5, used_seats: 1 },
    }
    const calls: { path: string; body: unknown }[] = []
    let meCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const path = String(url).replace('/api/v1', '')
        calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null })
        const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
        if (path === '/me') return ++meCalls === 1 ? json(200, me) : json(401, { message: 'Unauthenticated.' })
        return json(503, { message: 'Service indisponible' })
      }),
    )
    render(<App />)
    await screen.findByRole('heading', { name: 'Coffre verrouillé' })
    fireEvent.change(screen.getByLabelText(/^Mot de passe/, { selector: 'input' }), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Déverrouiller' }))
    expect(await screen.findByText('Service indisponible')).toBeInTheDocument()
    expect(screen.queryByText('Mot de passe incorrect.')).not.toBeInTheDocument()
    expect(calls.find((c) => c.path === '/auth/prelogin')?.body).toEqual({ email: 'admin@example.test' })
  })

  it('installation non faite : le lien d’installation affiche le formulaire propriétaire', async () => {
    window.history.pushState({}, '', '/installation#jeton')
    mockApi({ '/me': { status: 401, body: {} }, '/setup/status': { status: 200, body: { installed: false } } })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Création du compte propriétaire' })).toBeInTheDocument()
  })

  it('n’écrit aucun secret dans le stockage du navigateur', async () => {
    window.history.pushState({}, '', '/')
    mockApi({ '/me': { status: 401, body: {} }, '/setup/status': { status: 200, body: { installed: true } } })
    render(<App />)
    await screen.findByRole('heading', { name: 'Bienvenue sur KOFFRA' })
    expect(sessionStorage.length).toBe(0)
    for (let i = 0; i < localStorage.length; i++) expect(localStorage.key(i)).toBe('koffra.autolock.minutes')
  })
})
