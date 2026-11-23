import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('affiche l’état opérationnel quand l’API répond', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', service: 'koffra-api', version: 'v1' }), {
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    render(<App />)

    expect(screen.getByRole('img', { name: 'Logo KOFFRA' })).toBeInTheDocument()
    expect(await screen.findByText('API opérationnelle (v1)')).toBeInTheDocument()
  })

  it('signale une API injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<App />)

    expect(await screen.findByText('API injoignable')).toBeInTheDocument()
  })
})
