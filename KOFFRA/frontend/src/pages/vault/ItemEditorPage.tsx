import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Button, Field, PasswordInput, TextInput, errorMessage } from '../../components/ui'
import { generatePassword } from '../../crypto'
import { ApiError } from '../../services/api/client'
import { useVault } from '../../features/vault/VaultProvider'
import { emptyItem, forbiddenDataWarnings, ITEM_TYPES, type ItemData, type ItemType } from '../../features/vault/model'

export function ItemEditorPage() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const vault = useVault()
  const existing = uuid ? (vault.entries.find((e) => e.uuid === uuid) ?? null) : null
  const [data, setData] = useState<ItemData>(() => (existing ? structuredClone(existing.data) : emptyItem()))
  const [categoryUuid, setCategoryUuid] = useState<string | null>(existing?.categoryUuid ?? null)
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (uuid && !existing) return <p className="empty">Entrée introuvable.</p>

  const type = ITEM_TYPES[data.type]
  const warnings = forbiddenDataWarnings(data)
  const setField = (key: string, value: string) => setData((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!data.title.trim()) return setError('Le titre est obligatoire.')
    if (warnings.length && !window.confirm(`Attention : données interdites possibles (${warnings.join(', ')}). Ne stockez jamais de code PIN, CVV ou code OTP bancaire. Enregistrer quand même ?`)) return
    setBusy(true)
    setError(null)
    try {
      // Les champs vides ne sont pas conservés
      const fields = Object.fromEntries(Object.entries(data.fields).filter(([, v]) => v.trim() !== ''))
      const saved = await vault.save({ existing, data: { ...data, title: data.title.trim(), fields }, categoryUuid, favorite })
      navigate(`/coffre/${saved.uuid}`)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'revision_conflict' ? `${err.message} (vos modifications n’ont pas été enregistrées)` : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card detail stack" onSubmit={submit} aria-labelledby="editor-title">
      <header className="pane-head">
        <h2 id="editor-title">{existing ? 'Modifier l’entrée' : 'Nouvelle entrée'}</h2>
        <Link to={existing ? `/coffre/${existing.uuid}` : '/coffre'} className="btn btn-ghost">
          Annuler
        </Link>
      </header>
      {error ? <Alert kind="error">{error}</Alert> : null}

      <Field label="Type">
        {(id) => (
          <select id={id} value={data.type} onChange={(e) => setData((d) => ({ ...d, type: e.target.value as ItemType }))} disabled={!!existing}>
            {Object.entries(ITEM_TYPES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      {data.type === 'bank' ? (
        <Alert kind="warning">Références non exploitables uniquement : ne saisissez jamais de code PIN, CVV, mot de passe de paiement ou code OTP bancaire.</Alert>
      ) : null}

      <TextInput label="Titre" value={data.title} onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))} required maxLength={200} />

      {type.fields.map((f) =>
        f.secret ? (
          <div key={f.key} className="stack-tight">
            <PasswordInput label={f.label} value={data.fields[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
            {f.key === 'password' ? (
              <Button variant="ghost" className="btn-small" onClick={async () => setField('password', await generatePassword())}>
                🎲 Générer un mot de passe
              </Button>
            ) : null}
          </div>
        ) : f.multiline ? (
          <Field key={f.key} label={f.label}>
            {(id) => <textarea id={id} rows={3} value={data.fields[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />}
          </Field>
        ) : (
          <TextInput key={f.key} label={f.label} type={f.inputType ?? 'text'} value={data.fields[f.key] ?? ''} onChange={(e) => setField(f.key, e.target.value)} />
        ),
      )}

      <Field label="Catégorie">
        {(id) => (
          <select id={id} value={categoryUuid ?? ''} onChange={(e) => setCategoryUuid(e.target.value || null)}>
            <option value="">Sans catégorie</option>
            {vault.categories.map((c) => (
              <option key={c.uuid} value={c.uuid}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <fieldset className="stack-tight">
        <legend>Champs personnalisés</legend>
        {data.custom.map((c, i) => (
          <div key={i} className="custom-field">
            <input aria-label="Nom du champ" placeholder="Nom" value={c.label} onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} />
            <input aria-label="Valeur" placeholder="Valeur" type={c.secret ? 'password' : 'text'} value={c.value} onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))} />
            <label className="checkbox">
              <input type="checkbox" checked={c.secret} onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, secret: e.target.checked } : x)) }))} /> Secret
            </label>
            <Button variant="ghost" className="icon-btn" aria-label="Retirer le champ" onClick={() => setData((d) => ({ ...d, custom: d.custom.filter((_, j) => j !== i) }))}>
              ✕
            </Button>
          </div>
        ))}
        <Button variant="ghost" className="btn-small" onClick={() => setData((d) => ({ ...d, custom: [...d.custom, { label: '', value: '', secret: false }] }))}>
          + Ajouter un champ
        </Button>
      </fieldset>

      <Field label="Notes">{(id) => <textarea id={id} rows={4} value={data.notes} onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))} />}</Field>

      <label className="checkbox">
        <input type="checkbox" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} /> Favori
      </label>

      {warnings.length ? <Alert kind="warning">Vérifiez : {warnings.join(' · ')}</Alert> : null}

      <Button type="submit" busy={busy}>
        Enregistrer (chiffré)
      </Button>
    </form>
  )
}
