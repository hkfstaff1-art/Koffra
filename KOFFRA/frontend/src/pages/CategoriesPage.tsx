import { Check, FolderPlus, FolderTree, Lock, Pencil, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useFeedback } from '../components/feedback'
import { errorMessage } from '../components/format'
import { Button, EmptyState, IconButton, PageHeader, TextInput } from '../components/ui'
import { useVault } from '../features/vault/VaultProvider'

export function CategoriesPage() {
  const { categories, entries, createCategory, renameCategory, deleteCategory } = useVault()
  const { toast, confirm } = useFeedback()
  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ uuid: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const exists = (n: string, except?: string) => categories.some((c) => c.uuid !== except && c.name.toLowerCase() === n.trim().toLowerCase())

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast('success', ok)
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return setNameError('Saisissez un nom.')
    if (n.length > 80) return setNameError('80 caractères maximum.')
    if (exists(n)) return setNameError('Cette catégorie existe déjà.')
    setNameError(null)
    void run(async () => {
      await createCategory(n)
      setName('')
    }, `Catégorie « ${n} » créée.`)
  }

  return (
    <div className="stack-lg narrow">
      <PageHeader title="Catégories" description={<><Lock className="icon-sm" aria-hidden /> Les noms de catégories sont chiffrés : le serveur ne les connaît pas.</>} />

      <form onSubmit={add} className="card inline-form" noValidate>
        <TextInput label="Nouvelle catégorie" value={name} onChange={(e) => setName(e.target.value)} error={nameError} maxLength={80} placeholder="Ex. Banques, Réseaux sociaux…" />
        <Button type="submit" icon={FolderPlus} busy={busy}>
          Ajouter
        </Button>
      </form>

      {categories.length === 0 ? (
        <EmptyState icon={FolderTree} title="Aucune catégorie">
          Les catégories vous aident à ranger les entrées du coffre.
        </EmptyState>
      ) : (
        <ul className="card list">
          {categories.map((c) => {
            const count = entries.filter((e) => e.categoryUuid === c.uuid && !e.deletedAt).length
            return (
              <li key={c.uuid} className="list-row">
                <FolderTree className="icon muted" aria-hidden />
                {editing?.uuid === c.uuid ? (
                  <form
                    className="row grow"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const n = editing.name.trim()
                      if (!n || exists(n, c.uuid)) return toast('error', n ? 'Cette catégorie existe déjà.' : 'Saisissez un nom.')
                      void run(async () => {
                        await renameCategory(c.uuid, n)
                        setEditing(null)
                      }, 'Catégorie renommée.')
                    }}
                  >
                    <input className="grow" aria-label="Nouveau nom" value={editing.name} onChange={(e) => setEditing({ uuid: c.uuid, name: e.target.value })} autoFocus maxLength={80} />
                    <IconButton icon={Check} label="Enregistrer" type="submit" />
                    <IconButton icon={X} label="Annuler" onClick={() => setEditing(null)} />
                  </form>
                ) : (
                  <>
                    <span className="grow">{c.name}</span>
                    <span className="count">
                      {count} entrée{count > 1 ? 's' : ''}
                    </span>
                    <IconButton icon={Pencil} label={`Renommer ${c.name}`} onClick={() => setEditing({ uuid: c.uuid, name: c.name })} />
                    <IconButton
                      icon={Trash2}
                      label={`Supprimer ${c.name}`}
                      className="danger-hover"
                      onClick={async () => {
                        if (await confirm({ title: `Supprimer « ${c.name} » ?`, message: 'Les entrées de cette catégorie sont conservées, sans catégorie.', confirmLabel: 'Supprimer', tone: 'danger' })) {
                          await run(() => deleteCategory(c.uuid), 'Catégorie supprimée.')
                        }
                      }}
                    />
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
