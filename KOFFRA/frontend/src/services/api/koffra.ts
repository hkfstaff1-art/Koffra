/** Points d'accès de l'API KOFFRA (docs/openapi.yaml). Uniquement du matériel chiffré transite. */
import type { AccountKeyMaterial, Envelope, KdfParams, PasswordMaterial, RecoveryMaterial } from '../../crypto'
import { api, apiBinary } from './client'

export interface VaultGrant {
  key_version: number
  type: 'confirmed' | 'sealed'
  encrypted_key: Envelope | string
}

export interface MeResponse {
  user: { uuid: string; name: string; email: string; status: string; last_login_at: string | null; created_at: string | null }
  device: { uuid: string; label: string } | null
  keys: {
    kdf_params: KdfParams
    encrypted_user_key: Envelope
    public_key: string
    encrypted_private_key: Envelope
    current_vault_key_version: number | null
    vault_key_grants: VaultGrant[]
  }
  limits: { max_accounts: number; used_seats: number }
}

export interface OtpRequired {
  otp_required: true
  challenge: string
  destination: string
  expires_at: string
}

export interface KdfDefaults {
  ops: number
  mem: number
}

export interface ApiVaultItem {
  uuid: string
  category_uuid: string | null
  payload: Envelope
  key_version: number
  favorite: boolean
  archived_at: string | null
  deleted_at: string | null
  revision: number
  attachments: { uuid: string; encrypted_size: number; ciphertext_sha256: string; created_at: string }[]
  created_at: string
  updated_at: string
}

export interface ApiCategory {
  uuid: string
  name: Envelope
  key_version: number
  icon: string | null
  sort_order: number
}

export interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number }
}

export interface DeviceInfo {
  uuid: string
  label: string
  approved_at: string | null
  last_seen_at: string | null
  last_ip: string | null
  revoked_at: string | null
  current: boolean
}

export interface AdminInfo {
  uuid: string
  name: string
  email: string
  status: 'active' | 'disabled'
  public_key: string
  vault_access: 'confirmed' | 'pending_confirmation' | 'none'
  is_me: boolean
  last_login_at: string | null
  created_at: string | null
}

export interface InvitationInfo {
  uuid: string
  email: string
  invited_by: string | null
  expires_at: string
  created_at: string
}

export interface ActivityEntry {
  id: number
  event: string
  user: { uuid: string; name: string } | null
  device: string | null
  ip: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

/** Format de matériel attendu par l'API (snake_case). */
export function toApiAccountMaterial(m: AccountKeyMaterial) {
  return {
    auth_key: m.password.authKey,
    kdf_params: m.password.kdf,
    encrypted_user_key: m.password.encryptedUserKey,
    public_key: m.publicKey,
    encrypted_private_key: m.encryptedPrivateKey,
    recovery: toApiRecovery(m.recovery),
  }
}

export const toApiRecovery = (r: RecoveryMaterial) => ({
  auth_key: r.authKey,
  encrypted_user_key: r.encryptedUserKey,
  fingerprint: r.fingerprint,
})

export const toApiPassword = (p: PasswordMaterial) => ({
  auth_key: p.authKey,
  kdf_params: p.kdf,
  encrypted_user_key: p.encryptedUserKey,
})

export const koffra = {
  setupStatus: () => api.get<{ installed: boolean }>('/setup/status'),
  setupStart: (body: { token: string; name: string; email: string }) =>
    api.post<{ user_uuid: string; destination: string; kdf_defaults: KdfDefaults }>('/setup/start', body),
  setupComplete: (body: Record<string, unknown>) => api.post<MeResponse>('/setup/complete', body),

  prelogin: (email: string) => api.post<{ kdf_params: KdfParams }>('/auth/prelogin', { email }),
  login: (body: { email: string; auth_key: string; device_label: string }) =>
    api.post<MeResponse | OtpRequired>('/auth/login', body, { silent401: true }),
  verifyOtp: (challenge: string, code: string) => api.post<MeResponse>('/auth/otp/verify', { challenge, code }),
  resendOtp: () => api.post<OtpRequired>('/auth/otp/resend'),
  logout: () => api.post('/auth/logout', undefined, { silent401: true }),
  reauth: (authKey: string) => api.post('/auth/reauth', { auth_key: authKey }),
  me: () => api.get<MeResponse>('/me', { silent401: true }),

  changePassword: (body: ReturnType<typeof toApiPassword>) => api.put('/me/password', body),
  regenerateRecovery: (recovery: ReturnType<typeof toApiRecovery>) => api.post('/me/recovery-key', { recovery }),

  recoveryStart: (email: string, recoveryAuthKey: string) =>
    api.post<{ challenge: string; destination: string; message: string }>('/recovery/start', { email, recovery_auth_key: recoveryAuthKey }),
  recoveryVerify: (challenge: string, code: string) =>
    api.post<{ user_uuid: string; encrypted_user_key_by_recovery: Envelope; public_key: string; encrypted_private_key: Envelope; kdf_defaults: KdfDefaults }>(
      '/recovery/verify',
      { challenge, code },
    ),
  recoveryComplete: (body: Record<string, unknown>) => api.post<MeResponse>('/recovery/complete', body),

  devices: () => api.get<{ data: DeviceInfo[] }>('/devices'),
  revokeDevice: (uuid: string) => api.delete(`/devices/${uuid}`),
  logoutOthers: () => api.post('/devices/logout-others'),

  admins: () => api.get<{ data: AdminInfo[]; current_vault_key_version: number | null }>('/admins'),
  grantVault: (userUuid: string, keyVersion: number, sealedKey: string) =>
    api.post(`/admins/${userUuid}/vault-grant`, { key_version: keyVersion, sealed_key: sealedKey }),
  confirmVault: (keyVersion: number, encryptedKey: Envelope) =>
    api.post('/vault-grants/confirm', { key_version: keyVersion, encrypted_key: encryptedKey }),
  disableAdmin: (uuid: string) => api.delete<{ rotation_recommended: boolean }>(`/admins/${uuid}`),

  invitations: () => api.get<{ data: InvitationInfo[] }>('/invitations'),
  invite: (email: string) => api.post('/invitations', { email }),
  revokeInvitation: (uuid: string) => api.delete(`/invitations/${uuid}`),
  invitationStart: (token: string) =>
    api.post<{ email: string; invited_by: string | null; user_uuid: string; kdf_defaults: KdfDefaults }>('/invitations/accept/start', { token }),
  invitationAccept: (body: Record<string, unknown>) => api.post<MeResponse>('/invitations/accept', body),

  activity: (page = 1) => api.get<Paginated<ActivityEntry>>(`/activity?page=${page}&per_page=50`),

  /** Charge toutes les pages (la recherche se fait localement après déchiffrement). */
  async allItems(trashed: 'without' | 'with' | 'only' = 'with'): Promise<ApiVaultItem[]> {
    const all: ApiVaultItem[] = []
    for (let page = 1; ; page++) {
      const res = await api.get<Paginated<ApiVaultItem>>(`/vault-items?trashed=${trashed}&per_page=500&page=${page}`)
      all.push(...res.data)
      if (page >= res.meta.last_page) return all
    }
  },
  createItem: (body: { uuid: string; key_version: number; payload: Envelope; category_uuid: string | null; favorite: boolean }) =>
    api.post<{ data: ApiVaultItem }>('/vault-items', body),
  updateItem: (uuid: string, body: Record<string, unknown>) => api.patch<{ data: ApiVaultItem }>(`/vault-items/${uuid}`, body),
  trashItem: (uuid: string) => api.delete(`/vault-items/${uuid}`),
  restoreItem: (uuid: string) => api.post(`/vault-items/${uuid}/restore`),
  forceDeleteItem: (uuid: string) => api.delete(`/vault-items/${uuid}/force`),
  purgeItems: (uuids: string[]) => api.post<{ deleted: number }>('/vault-items/purge', { uuids }),

  categories: () => api.get<{ data: ApiCategory[] }>('/categories'),
  createCategory: (body: { uuid: string; key_version: number; name: Envelope; icon?: string }) => api.post('/categories', body),
  updateCategory: (uuid: string, body: Record<string, unknown>) => api.patch(`/categories/${uuid}`, body),
  deleteCategory: (uuid: string) => api.delete(`/categories/${uuid}`),

  uploadAttachment: (itemUuid: string, uuid: string, data: Uint8Array, sha256: string) => {
    const form = new FormData()
    form.append('uuid', uuid)
    form.append('ciphertext_sha256', sha256)
    form.append('file', new Blob([data as BlobPart], { type: 'application/octet-stream' }), 'fichier.bin')
    return api.post(`/vault-items/${itemUuid}/attachments`, form)
  },
  downloadAttachment: (uuid: string) => apiBinary(`/attachments/${uuid}`),
  deleteAttachment: (uuid: string) => api.delete(`/attachments/${uuid}`),

  vaultKeyStatus: () =>
    api.get<{ active_version: number | null; rotating_version: number | null; remaining: { items: number; categories: number } | null }>(
      '/vault-keys/status',
    ),
  startRotation: (body: { version: number; own_grant: Envelope; sealed_grants: { user_uuid: string; sealed_key: string }[] }) =>
    api.post('/vault-keys', body),
  activateRotation: (version: number) => api.post(`/vault-keys/${version}/activate`),

  exportEncrypted: () =>
    api.post<{ format: string; format_version: number; exported_at: string; vault_key_version: number; categories: ApiCategory[]; items: ApiVaultItem[] }>(
      '/exports/encrypted',
    ),
}
