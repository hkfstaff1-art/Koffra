import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { FeedbackProvider, useFeedback } from './feedback'
import { PasswordInput, TextInput } from './ui'
import { newPasswordSchema, rules, validate } from './validation'

describe('PasswordInput', () => {
  it('masque la valeur et la révèle avec le bouton œil intégré au champ', async () => {
    render(<PasswordInput label="Mot de passe" defaultValue="secret" />)
    const input = screen.getByLabelText('Mot de passe', { selector: 'input' })
    expect(input).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Masquer le mot de passe' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('Champs et validation', () => {
  it('affiche l’erreur sous le champ et la relie au champ (accessibilité)', () => {
    render(<TextInput label="Email" error="Adresse email invalide." />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Adresse email invalide.')
  })

  it('valide les formulaires avec des messages en français', () => {
    expect(validate(z.object({ email: rules.email }), { email: 'pas-un-email' })).toEqual({ email: 'Adresse email invalide.' })
    expect(validate(z.object({ code: rules.otp }), { code: '12a' })).toEqual({ code: 'Le code contient 6 chiffres.' })
    const schema = newPasswordSchema({})
    expect(validate(schema, { password: 'court', confirm: 'court' })?.password).toMatch(/12 caractères/)
    expect(validate(schema, { password: 'Une phrase de passe solide 2026', confirm: 'autre' })).toEqual({ confirm: 'Les deux mots de passe ne correspondent pas.' })
    expect(validate(schema, { password: 'Une phrase de passe solide 2026', confirm: 'Une phrase de passe solide 2026' })).toBeNull()
  })
})

function ConfirmHarness() {
  const { confirm, toast } = useFeedback()
  const [result, setResult] = useState('—')
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({ title: 'Supprimer ?', message: 'Action irréversible.', confirmLabel: 'Supprimer', tone: 'danger' })
          setResult(ok ? 'oui' : 'non')
          if (ok) toast('success', 'Supprimé.')
        }}
      >
        Lancer
      </button>
      <output>{result}</output>
    </>
  )
}

describe('Confirmations et notifications', () => {
  it('remplace window.confirm par une modale, puis affiche une notification', async () => {
    render(
      <FeedbackProvider>
        <ConfirmHarness />
      </FeedbackProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    expect(screen.getByRole('heading', { name: 'Supprimer ?' })).toBeInTheDocument()
    expect(screen.getByText('Action irréversible.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(screen.getByText('oui')).toBeInTheDocument()
    expect(screen.getByText('Supprimé.')).toBeInTheDocument()
  })

  it('renvoie « non » si l’utilisateur annule', async () => {
    render(
      <FeedbackProvider>
        <ConfirmHarness />
      </FeedbackProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Lancer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.getByText('non')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Supprimer ?' })).not.toBeInTheDocument()
  })
})
