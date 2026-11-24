import { Archive, ArchiveRestore, ArrowLeft, Download, ExternalLink, FileText, Paperclip, Pencil, RotateCcw, Star, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useFeedback } from '../../components/feedback'
import { errorMessage, formatDate, formatSize } from '../../components/format'
import { Alert, Button, CopyButton, EmptyState, IconButton, SecretValue } from '../../components/ui'
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
  const { toast, confirm } = useFeedback()
  const entry = vault.entries.find((e) => e.uuid === uuid)
  const [busy, setBusy] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  if (!entry) return <EmptyState icon={FileText} title="Entrée introuvable" />

  const type = ITEM_TYPES[entry.data.type]
  const TypeIcon = type.icon
  const category = vault.categories.find((c) => c.uuid === entry.categoryUuid)
  const reveal = CRITICAL_TYPES.has(entry.data.type) ? confirmPassword : undefined

  const act = async (name: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(name)
    try {
      await fn()
      if (success) toast('success', success)
    } catch (err) {
      toast('error', errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function download(meta: AttachmentMeta) {
    await act(`dl-${meta.uuid}`, async () => {
      const url = URL.createObjectURL(await vault.openAttachment(meta))
      const a = document.createElement('a')
      a.href = url
      a.download = meta.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  const filled = type.fields.filter((f) => entry.data.fields[f.key])

  return (
    <article className="card detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <Link to="/coffre" className="btn btn-ghost btn-sm back-link">
          <ArrowLeft className="icon" aria-hidden /> Coffre
        </Link>
        <div className="detail-title">
          <span className={`item-icon lg type-${entry.data.type}`} aria-hidden>
            <TypeIcon />
          </span>
          <div>
            <p className="eyebrow">
              {type.label}
              {category ? ` · ${category.name}` : ''}
            </p>
            <h2 id="detail-title">
              {entry.data.title} {entry.favorite ? <Star className="icon star" aria-label="Favori" /> : null}
            </h2>
          </div>
        </div>
        {!entry.deletedAt ? (
          <div className="detail-actions">
            <Link to={`/coffre/${entry.uuid}/modifier`} className="btn btn-primary btn-sm">
              <Pencil className="icon" aria-hidden /> Modifier
            </Link>
            <IconButton
              icon={Star}
              label={entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={entry.favorite ? 'is-active' : ''}
              onClick={() => void act('fav', () => vault.setFlags(entry, { favorite: !entry.favorite }))}
            />
            <IconButton
              icon={entry.archivedAt ? ArchiveRestore : Archive}
              label={entry.archivedAt ? 'Désarchiver' : 'Archiver'}
              onClick={() => void act('arch', () => vault.setFlags(entry, { archived: !entry.archivedAt }), entry.archivedAt ? 'Entrée désarchivée.' : 'Entrée archivée.')}
            />
            <IconButton
              icon={Trash2}
              label="Mettre à la corbeille"
              variant="ghost"
              className="danger-hover"
              onClick={async () => {
                if (await confirm({ title: 'Mettre à la corbeille ?', message: `« ${entry.data.title} » pourra être restaurée depuis la corbeille.`, confirmLabel: 'Mettre à la corbeille', tone: 'danger' })) {
                  await act('trash', () => vault.trash(entry), 'Entrée placée dans la corbeille.')
                }
              }}
            />
          </div>
        ) : null}
      </header>

      {entry.deletedAt ? (
        <Alert kind="warning" title={`Dans la corbeille depuis le ${formatDate(entry.deletedAt)}`}>
          <div className="row wrap">
            <Button size="sm" icon={RotateCcw} busy={busy === 'restore'} onClick={() => void act('restore', () => vault.restore(entry), 'Entrée restaurée.')}>
              Restaurer
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={Trash2}
              busy={busy === 'destroy'}
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Supprimer définitivement ?',
                    message: 'Cette entrée et ses pièces jointes seront effacées. Cette action est irréversible.',
                    confirmLabel: 'Supprimer définitivement',
                    tone: 'danger',
                  })
                ) {
                  await act('destroy', async () => {
                    await withReauth(() => vault.destroy(entry))
                    navigate('/coffre')
                  }, 'Entrée supprimée définitivement.')
                }
              }}
            >
              Supprimer définitivement
            </Button>
          </div>
        </Alert>
      ) : null}

      {filled.length || entry.data.custom.length ? (
        <dl className="fields">
          {filled.map((f) => {
            const value = entry.data.fields[f.key]!
            return (
              <div key={f.key} className="field-row">
                <dt>{f.label}</dt>
                <dd>
                  {f.secret ? (
                    <SecretValue value={value} onReveal={reveal} />
                  ) : (
                    <span className="value-row">
                      {f.inputType === 'url' ? (
                        <a href={value} target="_blank" rel="noopener noreferrer" className="value-text link">
                          {value} <ExternalLink className="icon-sm" aria-hidden />
                        </a>
                      ) : (
                        <span className="value-text">{value}</span>
                      )}
                      <CopyButton value={value} />
                    </span>
                  )}
                </dd>
              </div>
            )
          })}
          {entry.data.custom.map((c, i) => (
            <div key={i} className="field-row">
              <dt>{c.label}</dt>
              <dd>
                {c.secret ? (
                  <SecretValue value={c.value} onReveal={reveal} />
                ) : (
                  <span className="value-row">
                    <span className="value-text">{c.value}</span>
                    <CopyButton value={c.value} />
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {entry.data.notes ? (
        <section className="notes-block">
          <h3>Notes</h3>
          <p className="notes">{entry.data.notes}</p>
        </section>
      ) : null}

      <section aria-labelledby="att-title" className="attachments-block">
        <div className="row between">
          <h3 id="att-title">
            <Paperclip className="icon-sm" aria-hidden /> Pièces jointes chiffrées
          </h3>
          {!entry.deletedAt ? (
            <>
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void act('upload', () => vault.addAttachment(entry, file), `« ${file.name} » ajouté (chiffré).`)
                }}
              />
              <Button variant="secondary" size="sm" icon={Upload} busy={busy === 'upload'} onClick={() => fileInput.current?.click()}>
                Ajouter
              </Button>
            </>
          ) : null}
        </div>
        {entry.data.attachments.length === 0 ? <p className="muted small">Aucune pièce jointe. 10 Mo maximum par fichier.</p> : null}
        <ul className="attachments">
          {entry.data.attachments.map((a) => (
            <li key={a.uuid}>
              <FileText className="icon" aria-hidden />
              <span className="att-name">
                {a.name} <small>{formatSize(a.size)}</small>
              </span>
              <IconButton icon={Download} label={`Télécharger ${a.name}`} disabled={busy === `dl-${a.uuid}`} onClick={() => void download(a)} />
              {!entry.deletedAt ? (
                <IconButton
                  icon={X}
                  label={`Supprimer ${a.name}`}
                  className="danger-hover"
                  onClick={async () => {
                    if (await confirm({ title: 'Supprimer la pièce jointe ?', message: `« ${a.name} » sera définitivement supprimée.`, confirmLabel: 'Supprimer', tone: 'danger' })) {
                      await act('rm', () => vault.removeAttachment(entry, a), 'Pièce jointe supprimée.')
                    }
                  }}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <p className="muted small">
        Créée le {formatDate(entry.createdAt)} · modifiée le {formatDate(entry.updatedAt)}
      </p>
    </article>
  )
}
