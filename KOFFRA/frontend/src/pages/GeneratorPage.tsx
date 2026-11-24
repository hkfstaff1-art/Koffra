import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../components/format'
import { Alert, Button, Checkbox, CopyButton, PageHeader } from '../components/ui'
import { DEFAULT_GENERATOR, generatePassword, generatorEntropyBits, type GeneratorOptions } from '../crypto'

export function GeneratorPage() {
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
    <div className="stack-lg narrow">
      <PageHeader title="Générateur de mots de passe" description="Aléa cryptographique, généré uniquement sur cet appareil." />

      <section className="card stack">
        <div className="generated-box">
          <output className="generated" aria-live="polite" translate="no">
            {password || '—'}
          </output>
          <div className="row">
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => void regenerate()} aria-label="Générer un autre mot de passe" title="Générer un autre" />
            {password ? <CopyButton value={password} /> : null}
          </div>
        </div>
        <p className="muted small">
          Robustesse : <strong>{level}</strong> (≈ {bits} bits d’entropie)
        </p>
        {error ? <Alert kind="error">{error}</Alert> : null}
      </section>

      <section className="card stack">
        <h2>Options</h2>
        <div className="range-field">
          <label htmlFor="gen-length">Longueur</label>
          <input id="gen-length" type="range" min={8} max={64} value={options.length} onChange={(e) => setOptions((o) => ({ ...o, length: Number(e.target.value) }))} />
          <output htmlFor="gen-length" className="range-value">
            {options.length}
          </output>
        </div>
        <div className="options-grid">
          <Checkbox label="Minuscules (a-z)" checked={options.lower} onChange={() => toggle('lower')} />
          <Checkbox label="Majuscules (A-Z)" checked={options.upper} onChange={() => toggle('upper')} />
          <Checkbox label="Chiffres (0-9)" checked={options.digits} onChange={() => toggle('digits')} />
          <Checkbox label="Symboles (!#$…)" checked={options.symbols} onChange={() => toggle('symbols')} />
          <Checkbox label="Éviter les caractères ambigus (0/O, 1/l)" checked={options.avoidAmbiguous} onChange={() => toggle('avoidAmbiguous')} />
        </div>
      </section>
    </div>
  )
}
