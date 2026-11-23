import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, CopyButton } from '../components/ui'
import { DEFAULT_GENERATOR, generatePassword, generatorEntropyBits, type GeneratorOptions } from '../crypto'
import { errorMessage } from '../components/ui'

export function GeneratorPage() {
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_GENERATOR)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const regenerate = useCallback(async () => {
    try {
      setError(null)
      setPassword(await generatePassword(options))
    } catch (err) {
      setError(errorMessage(err))
      setPassword('')
    }
  }, [options])

  useEffect(() => {
    void regenerate()
  }, [regenerate])

  const toggle = (k: keyof Omit<GeneratorOptions, 'length'>) => setOptions((o) => ({ ...o, [k]: !o[k] }))

  return (
    <div className="card stack narrow">
      <h1>Générateur de mots de passe</h1>
      <p className="generated" aria-live="polite" translate="no">
        {password || '—'}
      </p>
      <div className="row">
        <Button onClick={() => void regenerate()}>🎲 Nouveau</Button>
        {password ? <CopyButton value={password} /> : null}
      </div>
      {error ? <Alert kind="error">{error}</Alert> : null}

      <label htmlFor="gen-length">
        Longueur : <strong>{options.length}</strong>
      </label>
      <input id="gen-length" type="range" min={8} max={64} value={options.length} onChange={(e) => setOptions((o) => ({ ...o, length: Number(e.target.value) }))} />
      {(
        [
          ['lower', 'Minuscules (a-z)'],
          ['upper', 'Majuscules (A-Z)'],
          ['digits', 'Chiffres (0-9)'],
          ['symbols', 'Symboles (!#$…)'],
          ['avoidAmbiguous', 'Éviter les caractères ambigus (0/O, 1/l)'],
        ] as const
      ).map(([k, label]) => (
        <label key={k} className="checkbox">
          <input type="checkbox" checked={options[k]} onChange={() => toggle(k)} /> {label}
        </label>
      ))}
      <p className="field-hint">Entropie ≈ {generatorEntropyBits(options)} bits. Aléa cryptographique (libsodium), généré localement.</p>
    </div>
  )
}
