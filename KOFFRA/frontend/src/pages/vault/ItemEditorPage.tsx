import { ArrowLeft, Plus, Save, WandSparkles, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useFeedback } from '../../components/feedback'
import { errorMessage } from '../../components/format'
import { Alert, Button, Checkbox, EmptyState, Field, IconButton, PasswordInput, SelectField, TextArea, TextInput } from '../../components/ui'
import { GeneratorModal } from '../../features/vault/GeneratorModal'
import { ApiError } from '../../services/api/client'
import { useVault } from '../../features/vault/VaultProvider'
import { emptyItem, forbiddenDataWarnings, ITEM_TYPES, type ItemData, type ItemType } from '../../features/vault/model'

export function ItemEditorPage() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const vault = useVault()
  const { toast, confirm } = useFeedback()
  const existing = uuid ? (vault.entries.find((e) => e.uuid === uuid) ?? null) : null
  const [data, setData] = useState<ItemData>(() => (existing ? structuredClone(existing.data) : emptyItem()))
  const [categoryUuid, setCategoryUuid] = useState<string | null>(existing?.categoryUuid ?? null)
  const [favorite, setFavorite] = useState(existing?.favorite ?? false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [generator, setGenerator] = useState(false)

  if (uuid && !existing) return <EmptyState icon={X} title="Entrée introuvable" />

  const type = ITEM_TYPES[data.type]
  const warnings = forbiddenDataWarnings(data)
  const setField = (key: string, value: string) => setData((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))
  const backTo = existing ? `/coffre/${existing.uuid}` : '/coffre'

  function check(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!data.title.trim()) e.title = 'Le titre est obligatoire.'
    else if (data.title.length > 200) e.title = '200 caractères maximum.'
    const url = data.fields.url?.trim()
    if (url && !/^https?:\/\/\S+$/i.test(url)) e.url = 'Adresse invalide : commencez par https://'
    const mail = data.fields.email?.trim()
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) e.email = 'Adresse email invalide.'
    data.custom.forEach((c, i) => {
      if (!c.label.trim() && c.value) e[`custom-${i}`] = 'Donnez un nom à ce champ.'
    })
    return e
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const found = check()
    setErrors(found)
    if (Object.keys(found).length) return
    if (
      warnings.length &&
      !(await confirm({
        title: 'Données interdites possibles',
        message: (
          <>
            <p>{warnings.join(' · ')}</p>
            <p>Ne stockez jamais de code PIN, CVV ni code OTP bancaire. Enregistrer quand même ?</p>
          </>
        ),
        confirmLabel: 'Enregistrer quand même',
        tone: 'warning',
      }))
    )
      return
    setBusy(true)
    setError(null)
    try {
      // Les champs vides ne sont pas conservés
      const fields = Object.fromEntries(Object.entries(data.fields).filter(([, v]) => v.trim() !== ''))
      const custom = data.custom.filter((c) => c.label.trim() || c.value)
      const saved = await vault.save({ existing, data: { ...data, title: data.title.trim(), fields, custom }, categoryUuid, favorite })
      toast('success', existing ? 'Modifications enregistrées (chiffrées).' : 'Entrée ajoutée au coffre (chiffrée).')
      navigate(`/coffre/${saved.uuid}`)
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'revision_conflict' ? `${err.message} Vos modifications n’ont pas été enregistrées.` : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card detail" onSubmit={submit} aria-labelledby="editor-title" noValidate>
      <header className="detail-head">
        <Link to={backTo} className="btn btn-ghost btn-sm back-link">
          <ArrowLeft className="icon" aria-hidden /> Annuler
        </Link>
        <h2 id="editor-title">{existing ? 'Modifier l’entrée' : 'Nouvelle entrée'}</h2>
      </header>

      {error ? <Alert kind="error">{error}</Alert> : null}

      {!existing ? (
        <fieldset className="type-picker">
          <legend>Type d’entrée</legend>
          <div className="type-grid">
            {(Object.entries(ITEM_TYPES) as [ItemType, (typeof ITEM_TYPES)[ItemType]][]).map(([k, t]) => {
              const Icon = t.icon
              return (
                <label key={k} className={`type-option ${data.type === k ? 'active' : ''}`}>
                  <input type="radio" name="type" value={k} checked={data.type === k} onChange={() => setData((d) => ({ ...d, type: k }))} />
                  <span className={`item-icon type-${k}`} aria-hidden>
                    <Icon />
                  </span>
                  <span>{t.label}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {data.type === 'bank' ? (
        <Alert kind="warning" title="Références non exploitables uniquement">
          Ne saisissez jamais de code PIN, CVV, mot de passe de paiement ni code OTP bancaire.
        </Alert>
      ) : null}

      <div className="form-grid">
        <div className="span-2">
          <TextInput label="Titre" value={data.title} onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))} error={errors.title} maxLength={200} required autoFocus={!existing} />
        </div>

        {type.fields.map((f) => {
          const value = data.fields[f.key] ?? ''
          if (f.secret) {
            return (
              <div key={f.key} className={f.multiline ? 'span-2' : ''}>
                <PasswordInput label={f.label} value={value} onChange={(e) => setField(f.key, e.target.value)} />
                {f.key === 'password' ? (
                  <Button variant="ghost" size="sm" icon={WandSparkles} onClick={() => setGenerator(true)}>
                    Générer un mot de passe
                  </Button>
                ) : null}
              </div>
            )
          }
          if (f.multiline) {
            return (
              <div key={f.key} className="span-2">
                <TextArea label={f.label} rows={3} value={value} onChange={(e) => setField(f.key, e.target.value)} />
              </div>
            )
          }
          return (
            <TextInput
              key={f.key}
              label={f.label}
              type={f.inputType ?? 'text'}
              value={value}
              onChange={(e) => setField(f.key, e.target.value)}
              error={errors[f.key]}
              placeholder={f.inputType === 'url' ? 'https://' : undefined}
            />
          )
        })}

        <SelectField label="Catégorie" value={categoryUuid ?? ''} onChange={(e) => setCategoryUuid(e.target.value || null)}>
          <option value="">Sans catégorie</option>
          {vault.categories.map((c) => (
            <option key={c.uuid} value={c.uuid}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset className="custom-fields">
        <legend>Champs personnalisés</legend>
        {data.custom.length === 0 ? <p className="muted small">Ajoutez des informations propres à cette entrée (n° client, question secrète…).</p> : null}
        {data.custom.map((c, i) => (
          <div key={i} className="custom-field">
            <Field label="Nom du champ" error={errors[`custom-${i}`]}>
              {(a) => <input {...a} value={c.label} onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} />}
            </Field>
            <Field label="Valeur">
              {(a) => (
                <input {...a} type={c.secret ? 'password' : 'text'} autoComplete="off" value={c.value} onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))} />
              )}
            </Field>
            <Checkbox label="Secret" checked={c.secret} onChange={(e) => setData((d) => ({ ...d, custom: d.custom.map((x, j) => (j === i ? { ...x, secret: e.target.checked } : x)) }))} />
            <IconButton icon={X} label="Retirer ce champ" onClick={() => setData((d) => ({ ...d, custom: d.custom.filter((_, j) => j !== i) }))} />
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => setData((d) => ({ ...d, custom: [...d.custom, { label: '', value: '', secret: false }] }))}>
          Ajouter un champ
        </Button>
      </fieldset>

      <TextArea label="Notes" value={data.notes} onChange={(e) => setData((d) => ({ ...d, notes: e.target.value }))} />

      <Checkbox label="Ajouter aux favoris" checked={favorite} onChange={(e) => setFavorite(e.target.checked)} />

      {warnings.length ? <Alert kind="warning" title="À vérifier">{warnings.join(' · ')}</Alert> : null}

      {generator ? (
        <GeneratorModal
          onClose={() => setGenerator(false)}
          onUse={(p) => {
            setField('password', p)
            setGenerator(false)
          }}
        />
      ) : null}

      <footer className="form-actions">
        <Link to={backTo} className="btn btn-secondary btn-md">
          Annuler
        </Link>
        <Button type="submit" icon={Save} busy={busy}>
          Enregistrer
        </Button>
      </footer>
    </form>
  )
}
