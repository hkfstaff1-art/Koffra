import { FlaskConical, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useReauth } from '../../app/reauth'
import { useFeedback } from '../../components/feedback'
import { errorMessage } from '../../components/format'
import { Alert, Button } from '../../components/ui'
import { koffra } from '../../services/api/koffra'
import { DEMO_CATEGORIES, DEMO_COUNT, demoItems, isDemo } from './demo'
import { useVault } from './VaultProvider'

/** Ajout / suppression des données de test fictives (une seule confirmation du mot de passe pour supprimer). */
export function useDemoData() {
  const vault = useVault()
  const { withReauth } = useReauth()
  const { toast, confirm } = useFeedback()
  const [busy, setBusy] = useState<'seed' | 'remove' | null>(null)
  const [progress, setProgress] = useState('')
  const demoEntries = vault.entries.filter(isDemo)

  async function seed() {
    setBusy('seed')
    try {
      const existing = new Map(vault.categories.map((c) => [c.name, c.uuid]))
      const catUuids: string[] = []
      for (const name of DEMO_CATEGORIES) catUuids.push(existing.get(name) ?? (await vault.createCategory(name)))
      const items = demoItems(catUuids)
      let n = 0
      for (const item of items) {
        setProgress(`Chiffrement ${++n}/${items.length}…`)
        const entry = await vault.save({ existing: null, data: item.data, categoryUuid: item.categoryUuid, favorite: item.favorite })
        if (item.archived) await vault.setFlags(entry, { archived: true })
      }
      toast('success', `${items.length} entrées de test ajoutées au coffre.`)
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(null)
      setProgress('')
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Supprimer les données de test ?',
      message: `Les ${demoEntries.length} entrées de test et leurs catégories « Démo » seront supprimées définitivement. Vos vraies entrées ne sont pas touchées.`,
      confirmLabel: 'Supprimer les données de test',
      tone: 'danger',
    })
    if (!ok) return
    setBusy('remove')
    try {
      const targets = vault.entries.filter(isDemo)
      let n = 0
      for (const e of targets.filter((t) => !t.deletedAt)) {
        setProgress(`Mise à la corbeille ${++n}/${targets.length}…`)
        await koffra.trashItem(e.uuid)
      }
      setProgress('Suppression définitive…')
      await withReauth(() => vault.purge(targets.map((t) => t.uuid)))
      for (const c of vault.categories.filter((c) => DEMO_CATEGORIES.includes(c.name))) {
        if (!vault.entries.some((e) => e.categoryUuid === c.uuid && !isDemo(e))) await vault.deleteCategory(c.uuid)
      }
      await vault.reload()
      toast('success', 'Données de test supprimées.')
    } catch (err) {
      toast('error', errorMessage(err))
      await vault.reload()
    } finally {
      setBusy(null)
      setProgress('')
    }
  }

  return { demoCount: demoEntries.length, busy, progress, seed, remove }
}

/** Carte « Données de test » (Paramètres → Mon compte). */
export function DemoDataSection() {
  const { demoCount, busy, progress, seed, remove } = useDemoData()

  return (
    <section className="card settings-section">
      <header>
        <span className="section-icon" aria-hidden>
          <FlaskConical />
        </span>
        <div>
          <h2>Données de test</h2>
          <p className="muted">
            {DEMO_COUNT} entrées fictives (banques, réseaux sociaux, outils, fournisseurs) pour essayer KOFFRA. Elles sont chiffrées comme les autres et se suppriment en un clic.
          </p>
        </div>
      </header>
      <div className="stack">
        {demoCount > 0 ? <Alert kind="info">{demoCount} entrée(s) de test présentes dans le coffre.</Alert> : null}
        {progress ? <div className="progress">{progress}</div> : null}
        <div className="row wrap">
          <Button variant="secondary" icon={FlaskConical} busy={busy === 'seed'} disabled={busy !== null || demoCount > 0} onClick={() => void seed()}>
            Ajouter les données de test
          </Button>
          <Button variant="secondary" className="danger-hover" icon={Trash2} busy={busy === 'remove'} disabled={busy !== null || demoCount === 0} onClick={() => void remove()}>
            Supprimer les données de test
          </Button>
        </div>
      </div>
    </section>
  )
}

/** Rappel sur le tableau de bord tant que des données de test sont présentes. */
export function DemoDataBanner() {
  const { demoCount, busy, progress, remove } = useDemoData()
  if (demoCount === 0) return null
  return (
    <Alert kind="info" title="Données de test présentes">
      <div className="row wrap between">
        <span>{progress || `${demoCount} entrée(s) fictive(s) sont dans le coffre pour essayer l’interface.`}</span>
        <Button size="sm" variant="secondary" icon={Trash2} busy={busy === 'remove'} onClick={() => void remove()}>
          Supprimer les données de test
        </Button>
      </div>
    </Alert>
  )
}
