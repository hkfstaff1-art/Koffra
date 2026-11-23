import { open, seal, type Envelope } from './aead'
import type { UnlockedAccount } from './account'
import { AD, KEY_BYTES } from './constants'
import { fromB64, toB64, utf8Decode, utf8Encode } from './encoding'
import { CryptoError } from './errors'
import { getSodium, wipe } from './sodium'

/** Clé du coffre partagé (une par version), en mémoire uniquement. */
export interface VaultKey {
  version: number
  key: Uint8Array
}

function assertVersion(version: number) {
  if (!Number.isInteger(version) || version < 1 || version > 0xffffffff) {
    throw new CryptoError('INVALID_FORMAT', 'Version de clé invalide.')
  }
}

export async function generateVaultKey(version: number): Promise<VaultKey> {
  assertVersion(version)
  const s = await getSodium()
  return { version, key: s.crypto_aead_xchacha20poly1305_ietf_keygen() }
}

/** Accès « confirmé » : la vaultKey chiffrée avec la userKey de l'admin. */
export async function wrapVaultKey(account: UnlockedAccount, vaultKey: VaultKey): Promise<Envelope> {
  return seal(account.userKey, vaultKey.key, AD.vaultKey(account.userUuid, vaultKey.version))
}

export async function unwrapVaultKey(account: UnlockedAccount, envelope: Envelope, version: number): Promise<VaultKey> {
  assertVersion(version)
  const key = await open(account.userKey, envelope, AD.vaultKey(account.userUuid, version))
  if (key.length !== KEY_BYTES) throw new CryptoError('INVALID_FORMAT', 'Clé de coffre invalide.')
  return { version, key }
}

/**
 * Accès « en attente » (invitation) : vaultKey scellée pour la clé publique de l'invité.
 * La version est incluse dans le message scellé pour empêcher toute substitution de version.
 * ⚠ Vérifier hors bande l'empreinte de la clé publique AVANT d'appeler cette fonction.
 */
export async function sealVaultKeyFor(recipientPublicKey: string, vaultKey: VaultKey): Promise<string> {
  const s = await getSodium()
  const publicKey = await fromB64(recipientPublicKey)
  if (publicKey.length !== s.crypto_box_PUBLICKEYBYTES) {
    throw new CryptoError('INVALID_FORMAT', 'Clé publique invalide.')
  }
  const message = new Uint8Array(4 + KEY_BYTES)
  new DataView(message.buffer).setUint32(0, vaultKey.version)
  message.set(vaultKey.key, 4)
  try {
    return await toB64(s.crypto_box_seal(message, publicKey))
  } finally {
    await wipe(message)
  }
}

export async function openSealedVaultKey(account: UnlockedAccount, sealed: string, version: number): Promise<VaultKey> {
  assertVersion(version)
  const s = await getSodium()
  let message: Uint8Array
  try {
    message = s.crypto_box_seal_open(await fromB64(sealed), account.publicKey, account.privateKey)
  } catch {
    throw new CryptoError('DECRYPT_FAILED', 'Accès au coffre illisible.')
  }
  try {
    if (message.length !== 4 + KEY_BYTES || new DataView(message.buffer, message.byteOffset).getUint32(0) !== version) {
      throw new CryptoError('KEY_MISMATCH', 'Version de clé de coffre inattendue.')
    }
    return { version, key: message.slice(4) }
  } finally {
    await wipe(message)
  }
}

/** Contenu déchiffré d'une entrée du coffre (type, titre, champs…) : objet JSON libre. */
export type ItemPayload = Record<string, unknown>

export async function encryptItem(vaultKey: VaultKey, itemUuid: string, payload: ItemPayload): Promise<Envelope> {
  const bytes = utf8Encode(JSON.stringify(payload))
  try {
    return await seal(vaultKey.key, bytes, AD.item(itemUuid, vaultKey.version))
  } finally {
    await wipe(bytes)
  }
}

export async function decryptItem(vaultKey: VaultKey, itemUuid: string, envelope: Envelope): Promise<ItemPayload> {
  const bytes = await open(vaultKey.key, envelope, AD.item(itemUuid, vaultKey.version))
  try {
    const parsed: unknown = JSON.parse(utf8Decode(bytes))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new CryptoError('INVALID_FORMAT', 'Contenu d’entrée invalide.')
    }
    return parsed as ItemPayload
  } catch (error) {
    if (error instanceof CryptoError) throw error
    throw new CryptoError('INVALID_FORMAT', 'Contenu d’entrée invalide.')
  } finally {
    await wipe(bytes)
  }
}

/** Rotation : déchiffre avec l'ancienne clé et re-chiffre avec la nouvelle (nouveau nonce). */
export async function reencryptItem(from: VaultKey, to: VaultKey, itemUuid: string, envelope: Envelope): Promise<Envelope> {
  return encryptItem(to, itemUuid, await decryptItem(from, itemUuid, envelope))
}

/** Chiffre/déchiffre un nom de catégorie (les noms peuvent être révélateurs). */
export async function encryptCategoryName(vaultKey: VaultKey, categoryUuid: string, name: string): Promise<Envelope> {
  return seal(vaultKey.key, utf8Encode(name), AD.category(categoryUuid, vaultKey.version))
}

export async function decryptCategoryName(vaultKey: VaultKey, categoryUuid: string, envelope: Envelope): Promise<string> {
  return utf8Decode(await open(vaultKey.key, envelope, AD.category(categoryUuid, vaultKey.version)))
}

/** Empreinte lisible d'une clé publique, à comparer hors bande lors d'une invitation. */
export async function publicKeyFingerprint(publicKey: string): Promise<string> {
  const s = await getSodium()
  const hex = s.to_hex(s.crypto_generichash(32, await fromB64(publicKey), null)).slice(0, 40).toUpperCase()
  return hex.match(/.{4}/g)!.join(' ')
}
