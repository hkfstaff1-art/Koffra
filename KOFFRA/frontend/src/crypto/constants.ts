/** Version du protocole cryptographique (docs/09). Incrémenter à toute évolution du format. */
export const CRYPTO_VERSION = 1 as const

/** Contextes de dérivation libsodium (exactement 8 caractères). */
export const KDF_CONTEXT = {
  auth: 'KOFFauth',
  wrap: 'KOFFwrap',
  recoveryAuth: 'KOFFrcau',
  recoveryWrap: 'KOFFrcwr',
  recoveryId: 'KOFFrcid',
} as const

/** Données associées (AD) : lient chaque ciphertext à son emplacement logique. */
export const AD = {
  userKeyByPassword: (userUuid: string) => `koffra/v1/user-key/password/${userUuid}`,
  userKeyByRecovery: (userUuid: string) => `koffra/v1/user-key/recovery/${userUuid}`,
  privateKey: (userUuid: string) => `koffra/v1/private-key/${userUuid}`,
  vaultKey: (userUuid: string, keyVersion: number) => `koffra/v1/vault-key/${userUuid}/${keyVersion}`,
  item: (itemUuid: string, keyVersion: number) => `koffra/v1/item/${itemUuid}/${keyVersion}`,
  category: (categoryUuid: string, keyVersion: number) => `koffra/v1/category/${categoryUuid}/${keyVersion}`,
  attachment: (attachmentUuid: string) => `koffra/v1/attachment/${attachmentUuid}`,
} as const

export const KEY_BYTES = 32
