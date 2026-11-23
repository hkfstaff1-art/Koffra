import { useState, type ReactNode } from 'react'
import { Button, CopyButton } from '../../components/ui'
import { estimatePasswordStrength } from '../../crypto'

export function AuthLayout({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className="auth-shell">
      <section className={`card auth-card ${wide ? 'auth-wide' : ''}`} aria-labelledby="auth-title">
        <img src="/brand/koffra-logo-256.png" alt="KOFFRA" className="auth-logo" width={160} height={107} />
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  )
}

export const MIN_PASSWORD_LENGTH = 12

/** Indicateur de robustesse (texte + barre : la couleur seule ne porte pas l'information). */
export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const { label, bits } = estimatePasswordStrength(password)
  const level = { faible: 1, moyen: 2, fort: 3, 'très fort': 4 }[label]
  return (
    <p className="strength" data-level={level}>
      <span className="strength-bar" aria-hidden>
        <span style={{ width: `${level * 25}%` }} />
      </span>
      Robustesse : <strong>{label}</strong> (≈ {bits} bits)
    </p>
  )
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Au moins ${MIN_PASSWORD_LENGTH} caractères.`
  if (estimatePasswordStrength(password).label === 'faible') return 'Mot de passe trop faible : allongez-le (une phrase de plusieurs mots convient bien).'
  if (password !== confirm) return 'Les deux mots de passe ne correspondent pas.'
  return null
}

/** Affichage unique de la clé de récupération : l'utilisateur doit confirmer l'avoir conservée. */
export function RecoveryKeyNotice({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false)

  function download() {
    const text = `KOFFRA — clé de récupération\nCréée le ${new Date().toLocaleString('fr-FR')}\n\n${recoveryKey}\n\nConservez ce document hors ligne (papier, coffre physique). Il permet de récupérer votre compte si vous oubliez votre mot de passe.\n`
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'koffra-cle-de-recuperation.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stack">
      <div className="alert alert-warning">
        <strong>Votre clé de récupération (affichée une seule fois)</strong>
        <p>Sans elle ni votre mot de passe, vos données seront définitivement perdues : personne, pas même l’administrateur du serveur, ne peut les déchiffrer.</p>
      </div>
      <p className="recovery-key" translate="no">
        {recoveryKey}
      </p>
      <div className="row">
        <CopyButton value={recoveryKey} label="Copier" />
        <Button variant="secondary" onClick={download}>
          Télécharger
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimer
        </Button>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> J’ai conservé ma clé de récupération en lieu sûr, hors ligne.
      </label>
      <Button onClick={onDone} disabled={!saved}>
        Continuer
      </Button>
    </div>
  )
}
