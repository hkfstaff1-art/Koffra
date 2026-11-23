import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, Spinner, formatDate } from '../components/ui'
import { koffra } from '../services/api/koffra'

const LABELS: Record<string, string> = {
  'setup.owner_created': 'Création du compte propriétaire',
  'auth.login': 'Connexion',
  'auth.login_failed': 'Échec de connexion',
  'auth.logout': 'Déconnexion',
  'auth.logout_others': 'Déconnexion des autres sessions',
  'auth.otp_sent': 'Code de vérification envoyé',
  'auth.otp_failed': 'Code de vérification erroné',
  'auth.reauth': 'Réauthentification',
  'auth.reauth_failed': 'Échec de réauthentification',
  'device.approved': 'Appareil approuvé',
  'device.revoked': 'Appareil révoqué',
  'security.password_changed': 'Mot de passe modifié',
  'security.recovery_key_regenerated': 'Clé de récupération renouvelée',
  'recovery.started': 'Récupération demandée',
  'recovery.failed': 'Récupération refusée',
  'recovery.completed': 'Compte récupéré',
  'admin.invited': 'Administrateur invité',
  'admin.invitation_revoked': 'Invitation annulée',
  'admin.invitation_accepted': 'Invitation acceptée',
  'admin.disabled': 'Administrateur désactivé',
  'vault.access_granted': 'Accès au coffre transmis',
  'vault.access_confirmed': 'Accès au coffre confirmé',
  'vault.rotation_started': 'Rotation de clé démarrée',
  'vault.rotation_completed': 'Rotation de clé terminée',
  'vault.rotation_aborted': 'Rotation de clé annulée',
  'item.created': 'Entrée ajoutée',
  'item.updated': 'Entrée modifiée',
  'item.trashed': 'Entrée mise à la corbeille',
  'item.restored': 'Entrée restaurée',
  'item.deleted_permanently': 'Entrée supprimée définitivement',
  'category.created': 'Catégorie créée',
  'category.updated': 'Catégorie modifiée',
  'category.deleted': 'Catégorie supprimée',
  'attachment.added': 'Pièce jointe ajoutée',
  'attachment.deleted': 'Pièce jointe supprimée',
  'export.created': 'Export chiffré',
}

export function ActivityPage() {
  const [page, setPage] = useState(1)
  const log = useQuery({ queryKey: ['activity', page], queryFn: () => koffra.activity(page) })

  return (
    <div className="card stack">
      <h1>Journal d’activité</h1>
      <p className="field-hint">Aucune valeur secrète n’est jamais journalisée.</p>
      {log.isPending ? <Spinner /> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Événement</th>
            <th>Administrateur</th>
            <th>Appareil</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {log.data?.data.map((e) => (
            <tr key={e.id} className={e.event.endsWith('failed') ? 'row-warning' : ''}>
              <td>{formatDate(e.created_at)}</td>
              <td>
                {LABELS[e.event] ?? e.event}
                {e.metadata && typeof e.metadata.target === 'string' ? ` (${e.metadata.target})` : ''}
                {e.metadata && typeof e.metadata.email === 'string' ? ` (${e.metadata.email})` : ''}
              </td>
              <td>{e.user?.name ?? '—'}</td>
              <td>{e.device ?? '—'}</td>
              <td>{e.ip ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {log.data ? (
        <div className="row">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Précédent
          </Button>
          <span>
            Page {log.data.meta.current_page} / {log.data.meta.last_page}
          </span>
          <Button variant="secondary" disabled={page >= log.data.meta.last_page} onClick={() => setPage((p) => p + 1)}>
            Suivant →
          </Button>
        </div>
      ) : null}
    </div>
  )
}
