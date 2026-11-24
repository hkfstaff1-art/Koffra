import { Download, KeyRound, Lock, Printer, ShieldCheck, Smartphone } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Alert, Button, Checkbox, CopyButton } from '../../components/ui'
import { estimatePasswordStrength } from '../../crypto'

export function AuthLayout({ title, subtitle, children, wide = false }: { title: string; subtitle?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className="auth-shell">
      <div className={`auth-frame ${wide ? 'auth-wide' : ''}`}>
        <aside className="auth-brand" aria-hidden>
          <img src="/brand/koffra-logo-512.png" alt="" className="auth-brand-logo" />
          <h2>Votre coffre-fort numérique privé</h2>
          <ul>
            <li>
              <Lock className="icon" /> Chiffré dans votre navigateur
            </li>
            <li>
              <ShieldCheck className="icon" /> Le serveur ne voit jamais vos secrets
            </li>
            <li>
              <Smartphone className="icon" /> Ordinateur, tablette et téléphone
            </li>
          </ul>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <img src="/brand/koffra-logo-256.png" alt="KOFFRA" className="auth-logo" width={132} height={88} />
          <header className="auth-head">
            <h1 id="auth-title">{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}

/** Indicateur de robustesse : barre segmentée + texte (la couleur seule ne porte pas l'information). */
export function StrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const { label } = estimatePasswordStrength(password)
  const level = { faible: 1, moyen: 2, fort: 3, 'très fort': 4 }[label]
  return (
    <div className="strength" data-level={level} aria-live="polite">
      <div className="strength-bars" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={i <= level ? 'on' : ''} />
        ))}
      </div>
      <span>
        Robustesse : <strong>{label}</strong>
      </span>
    </div>
  )
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
      <Alert kind="warning" title="Votre clé de récupération — affichée une seule fois">
        Sans elle ni votre mot de passe, vos données seront définitivement perdues : personne, pas même l’administrateur du serveur, ne peut les déchiffrer.
      </Alert>
      <div className="recovery-key" translate="no">
        <KeyRound className="icon" aria-hidden />
        <span>{recoveryKey}</span>
      </div>
      <div className="row wrap">
        <CopyButton value={recoveryKey} label="Copier" compact={false} />
        <Button variant="secondary" size="sm" icon={Download} onClick={download}>
          Télécharger
        </Button>
        <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()}>
          Imprimer
        </Button>
      </div>
      <Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} label="J’ai conservé ma clé de récupération en lieu sûr, hors ligne." />
      <Button onClick={onDone} disabled={!saved} className="btn-block">
        Continuer
      </Button>
    </div>
  )
}
