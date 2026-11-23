import { useState, type FormEvent } from 'react'
import { Alert, Button, TextInput, errorMessage } from '../components/ui'
import { useVault } from '../features/vault/VaultProvider'

export function CategoriesPage() {
  const { categories, entries, createCategory, renameCategory, deleteCategory } = useVault()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<{ uuid: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    void run(async () => {
      await createCategory(name.trim())
      setName('')
    })
  }

  return (
    <div className="card stack narrow">
      <h1>Catégories</h1>
      <p className="field-hint">Les noms de catégories sont chiffrés : le serveur ne les connaît pas.</p>
      {error ? <Alert kind="error">{error}</Alert> : null}
      <form onSubmit={add} className="row align-end">
        <TextInput label="Nouvelle catégorie" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Button type="submit">Ajouter</Button>
      </form>
      <ul className="plain-list">
        {categories.map((c) => (
          <li key={c.uuid} className="row between">
            {editing?.uuid === c.uuid ? (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(async () => {
                    await renameCategory(c.uuid, editing.name.trim())
                    setEditing(null)
                  })
                }}
              >
                <input aria-label="Nom de la catégorie" value={editing.name} onChange={(e) => setEditing({ uuid: c.uuid, name: e.target.value })} autoFocus />
                <Button type="submit" className="btn-small">
                  OK
                </Button>
              </form>
            ) : (
              <span>
                {c.name} <small>({entries.filter((e) => e.categoryUuid === c.uuid && !e.deletedAt).length} entrées)</small>
              </span>
            )}
            <span className="row">
              <Button variant="ghost" className="btn-small" onClick={() => setEditing({ uuid: c.uuid, name: c.name })}>
                Renommer
              </Button>
              <Button variant="ghost" className="btn-small" onClick={() => window.confirm(`Supprimer « ${c.name} » ? Les entrées sont conservées.`) && void run(() => deleteCategory(c.uuid))}>
                Supprimer
              </Button>
            </span>
          </li>
        ))}
        {categories.length === 0 ? <li>Aucune catégorie.</li> : null}
      </ul>
    </div>
  )
}
