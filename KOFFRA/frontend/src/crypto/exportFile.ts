import { open, seal, type Envelope } from './aead'
import { utf8Decode, utf8Encode } from './encoding'
import { CryptoError } from './errors'
import { assertKdfParams, derivePasswordKeys, generateKdfParams, type KdfParams } from './kdf'
import { wipe } from './sodium'

/**
 * Fichier d'export chiffré : le contenu déchiffré du coffre est re-chiffré avec une
 * phrase d'export (Argon2id + XChaCha20-Poly1305). Lisible sans serveur ni compte,
 * avec la seule phrase d'export. Jamais d'export en clair.
 */
export const EXPORT_FORMAT = 'koffra-encrypted-export'
const EXPORT_AD = 'koffra/v1/export'

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  format_version: 1
  created_at: string
  kdf: KdfParams
  data: Envelope
}

export async function encryptExport(content: unknown, passphrase: string, cost?: { ops: number; mem: number }): Promise<ExportFile> {
  if (passphrase.length < 12) throw new CryptoError('INVALID_FORMAT', 'La phrase d’export doit contenir au moins 12 caractères.')
  const kdf = await generateKdfParams(cost)
  // On réutilise la dérivation du mot de passe : seule la sous-clé « wrap » sert ici.
  const { authKey, wrapKey } = await derivePasswordKeys(passphrase, kdf)
  try {
    return {
      format: EXPORT_FORMAT,
      format_version: 1,
      created_at: new Date().toISOString(),
      kdf,
      data: await seal(wrapKey, utf8Encode(JSON.stringify(content)), EXPORT_AD),
    }
  } finally {
    await wipe(authKey, wrapKey)
  }
}

export async function decryptExport(file: unknown, passphrase: string): Promise<unknown> {
  const f = file as Partial<ExportFile> | null
  if (!f || f.format !== EXPORT_FORMAT || f.format_version !== 1 || !f.data) {
    throw new CryptoError('INVALID_FORMAT', 'Ce fichier n’est pas un export KOFFRA.')
  }
  const kdf = await assertKdfParams(f.kdf)
  const { authKey, wrapKey } = await derivePasswordKeys(passphrase, kdf)
  try {
    return JSON.parse(utf8Decode(await open(wrapKey, f.data, EXPORT_AD)))
  } catch (error) {
    if (error instanceof CryptoError && error.code === 'DECRYPT_FAILED') {
      throw new CryptoError('DECRYPT_FAILED', 'Phrase d’export incorrecte ou fichier altéré.')
    }
    throw error
  } finally {
    await wipe(authKey, wrapKey)
  }
}

/** SHA-256 hexadécimal (contrôle d'intégrité des pièces jointes chiffrées côté serveur). */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
