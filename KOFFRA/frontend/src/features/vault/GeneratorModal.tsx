import { Check, RefreshCw, WandSparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../../components/format'
import { Alert, Button, Checkbox, CopyButton, Modal } from '../../components/ui'
import { DEFAULT_GENERATOR, generatePassword, generatorEntropyBits, type GeneratorOptions } from '../../crypto'

/** Générateur de mots de passe, ouvert depuis le formulaire d'une entrée. */
export function GeneratorModal({ onUse, onClose }: { onUse: (password: string) => void; onClose: () => void }) {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const regenerate = useCallback(async () => {
    try {
      const next = await generatePassword(options)
      setError(null)
      setPassword(next)
    } catch (err) {
      setError(errorMessage(err))
      setPassword('')
    }
  }, [options])

  useEffect(() => {
    void regenerate()
  }, [regenerate])

  const toggle = (k: keyof Omit<GeneratorOptions, 'length'>) => setOptions((o) => ({ ...o, [k]: !o[k] }))
  const bits = generatorEntropyBits(options)
  const level = bits < 60 ? 'faible' : bits < 90 ? 'correcte' : bits < 120 ? 'forte' : 'excellente'

  return (
    <Modal
      icon={WandSparkles}
      title="Générer un mot de passe"
      description="Aléa cryptographique, généré uniquement sur cet appareil."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button icon={Check} disabled={!password} onClick={() => onUse(password)}>
            Utiliser ce mot de passe
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="generated-box">
          <output className="generated" aria-live="polite" translate="no">
            {password || '—'}
          </output>
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => void regenerate()} aria-label="Générer un autre" title="Générer un autre" />
          {password ? <CopyButton value={password} /> : null}
        </div>
        <p className="muted small">
          Robustesse : <strong>{level}</strong> (≈ {bits} bits)
        </p>
        {error ? <Alert kind="error">{error}</Alert> : null}
        <div className="range-field">
          <label htmlFor="gen-length">Longueur</label>
          <input id="gen-length" type="range" min={8} max={64} value={options.length} onChange={(e) => setOptions((o) => ({ ...o, length: Number(e.target.value) }))} />
          <output htmlFor="gen-length" className="range-value">
            {options.length}
          </output>
        </div>
        <div className="options-grid">
          <Checkbox label="Minuscules" checked={options.lower} onChange={() => toggle('lower')} />
          <Checkbox label="Majuscules" checked={options.upper} onChange={() => toggle('upper')} />
          <Checkbox label="Chiffres" checked={options.digits} onChange={() => toggle('digits')} />
          <Checkbox label="Symboles" checked={options.symbols} onChange={() => toggle('symbols')} />
          <Checkbox label="Sans caractères ambigus (0/O, 1/l)" checked={options.avoidAmbiguous} onChange={() => toggle('avoidAmbiguous')} />
        </div>
      </div>
    </Modal>
  )
}
