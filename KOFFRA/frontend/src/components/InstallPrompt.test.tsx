import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallPrompt } from './InstallPrompt'

describe('InstallPrompt', () => {
  beforeEach(() => localStorage.clear())

  it('ne s’affiche pas tant que le navigateur ne propose pas l’installation', () => {
    render(<InstallPrompt />)
    expect(screen.queryByText('Installer KOFFRA')).not.toBeInTheDocument()
  })

  it('propose l’installation puis lance l’invite native', async () => {
    render(<InstallPrompt />)
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) })
    act(() => void window.dispatchEvent(event))

    expect(await screen.findByText('Installer KOFFRA')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Installer' }))
    expect(prompt).toHaveBeenCalledOnce()
  })

  it('« Plus tard » masque le bandeau et s’en souvient', async () => {
    const event = Object.assign(new Event('beforeinstallprompt'), { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) })
    window.dispatchEvent(event)
    const { unmount } = render(<InstallPrompt />)
    await userEvent.click(screen.getByRole('button', { name: 'Plus tard' }))
    expect(screen.queryByText('Installer KOFFRA')).not.toBeInTheDocument()
    unmount()
    render(<InstallPrompt />)
    expect(screen.queryByText('Installer KOFFRA')).not.toBeInTheDocument()
  })
})
