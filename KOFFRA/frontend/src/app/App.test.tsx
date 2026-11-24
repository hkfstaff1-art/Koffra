import { render, screen } from '@testing-library/react'
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
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument()
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
    await screen.findByRole('heading', { name: 'Connexion' })
    expect(sessionStorage.length).toBe(0)
    for (let i = 0; i < localStorage.length; i++) expect(localStorage.key(i)).toBe('koffra.autolock.minutes')
  })
})
