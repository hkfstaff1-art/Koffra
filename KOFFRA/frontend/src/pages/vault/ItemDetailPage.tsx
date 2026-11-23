import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Alert, Button, CopyButton, SecretValue, errorMessage, formatDate } from '../../components/ui'
import { useReauth } from '../../app/reauth'
import { useVault } from '../../features/vault/VaultProvider'
import { ITEM_TYPES, type AttachmentMeta } from '../../features/vault/model'

/** Les entrées « critiques » (clés API) exigent une réauthentification pour afficher le secret. */
const CRITICAL_TYPES = new Set(['api'])

export function ItemDetailPage() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const vault = useVault()
  const { withReauth, confirmPassword } = useReauth()
  const entry = vault.entries.find((e) => e.uuid === uuid)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  if (!entry) return <p className="empty">Entrée introuvable.</p>

  const type = ITEM_TYPES[entry.data.type]
  const category = vault.categories.find((c) => c.uuid === entry.categoryUuid)
  const reveal = CRITICAL_TYPES.has(entry.data.type) ? confirmPassword : undefined

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function download(meta: AttachmentMeta) {
    await act(async () => {
      const url = URL.createObjectURL(await vault.openAttachment(meta))
      const a = document.createElement('a')
      a.href = url
      a.download = meta.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  return (
    <article className="card detail" aria-labelledby="detail-title">
      <header className="pane-head">
        <div>
          <p className="eyebrow">
            {type.icon} {type.label}
            {category ? ` · ${category.name}` : ''}
          </p>
          <h2 id="detail-title">{entry.data.title}</h2>
        </div>
        <Link to="/coffre" className="btn btn-ghost icon-btn" aria-label="Fermer">
          ✕
        </Link>
      </header>

      {error ? <Alert kind="error">{error}</Alert> : null}
      {entry.deletedAt ? <Alert kind="warning">Dans la corbeille depuis le {formatDate(entry.deletedAt)}.</Alert> : null}

      <dl className="fields">
        {type.fields.map((f) =>
          entry.data.fields[f.key] ? (
            <div key={f.key}>
              <dt>{f.label}</dt>
              <dd>
                {f.secret ? (
                  <SecretValue value={entry.data.fields[f.key]!} onReveal={reveal} />
                ) : f.inputType === 'url' ? (
                  <span className="row">
                    <a href={entry.data.fields[f.key]} target="_blank" rel="noopener noreferrer">
                      {entry.data.fields[f.key]}
                    </a>
                    <CopyButton value={entry.data.fields[f.key]!} />
                  </span>
                ) : (
                  <span className="row">
                    <span>{entry.data.fields[f.key]}</span>
                    <CopyButton value={entry.data.fields[f.key]!} />
                  </span>
                )}
              </dd>
            </div>
          ) : null,
        )}
        {entry.data.custom.map((c, i) => (
          <div key={i}>
            <dt>{c.label}</dt>
            <dd>{c.secret ? <SecretValue value={c.value} onReveal={reveal} /> : c.value}</dd>
          </div>
        ))}
        {entry.data.notes ? (
          <div>
            <dt>Notes</dt>
            <dd className="notes">{entry.data.notes}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="att-title" className="stack">
        <h3 id="att-title">Pièces jointes chiffrées</h3>
        {entry.data.attachments.length === 0 ? <p className="field-hint">Aucune.</p> : null}
        <ul className="attachments">
          {entry.data.attachments.map((a) => (
            <li key={a.uuid}>
              <span>
                📎 {a.name} <small>({Math.ceil(a.size / 1024)} Ko)</small>
              </span>
              <span className="row">
                <Button variant="ghost" className="btn-small" onClick={() => void download(a)}>
                  Télécharger
                </Button>
                {!entry.deletedAt ? (
                  <Button variant="ghost" className="btn-small" onClick={() => void act(() => vault.removeAttachment(entry, a))}>
                    Supprimer
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {!entry.deletedAt ? (
          <>
            <input ref={fileInput} type="file" hidden onChange={(e) => e.target.files?.[0] && void act(() => vault.addAttachment(entry, e.target.files![0]!))} />
            <Button variant="secondary" busy={busy} onClick={() => fileInput.current?.click()}>
              Ajouter une pièce jointe (10 Mo max)
            </Button>
          </>
        ) : null}
      </section>

      <p className="field-hint">
        Créée le {formatDate(entry.createdAt)} · modifiée le {formatDate(entry.updatedAt)}
      </p>

      <footer className="row wrap">
        {entry.deletedAt ? (
          <>
            <Button onClick={() => void act(() => vault.restore(entry))}>Restaurer</Button>
            <Button
              variant="danger"
              onClick={() =>
                window.confirm('Supprimer définitivement cette entrée et ses pièces jointes ?') &&
                void act(async () => {
                  await withReauth(() => vault.destroy(entry))
                  navigate('/coffre')
                })
              }
            >
              Supprimer définitivement
            </Button>
          </>
        ) : (
          <>
            <Link to={`/coffre/${entry.uuid}/modifier`} className="btn btn-primary">
              Modifier
            </Link>
            <Button variant="secondary" onClick={() => void act(() => vault.setFlags(entry, { favorite: !entry.favorite }))}>
              {entry.favorite ? '☆ Retirer des favoris' : '★ Favori'}
            </Button>
            <Button variant="secondary" onClick={() => void act(() => vault.setFlags(entry, { archived: !entry.archivedAt }))}>
              {entry.archivedAt ? 'Désarchiver' : 'Archiver'}
            </Button>
            <Button variant="danger" onClick={() => void act(() => vault.trash(entry))}>
              Mettre à la corbeille
            </Button>
          </>
        )}
      </footer>
    </article>
  )
}
