import { CRYPTO_VERSION } from './constants'
import { fromB64, toB64, utf8Encode } from './encoding'
import { CryptoError } from './errors'
import { getSodium } from './sodium'

/** Enveloppe chiffrée stockée côté serveur (voir docs/09 §3). */
export interface Envelope {
  v: typeof CRYPTO_VERSION
  /** nonce XChaCha20 (24 octets), base64url */
  n: string
  /** ciphertext + tag Poly1305, base64url */
  c: string
}

/**
 * Chiffre `plaintext` avec XChaCha20-Poly1305. Nonce aléatoire unique par appel.
 * `ad` (données associées) lie le ciphertext à son contexte (utilisateur, entrée, version).
 */
export async function seal(key: Uint8Array, plaintext: Uint8Array, ad: string): Promise<Envelope> {
  const s = await getSodium()
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES)
  const ciphertext = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, utf8Encode(ad), null, nonce, key)
  return { v: CRYPTO_VERSION, n: await toB64(nonce), c: await toB64(ciphertext) }
}

/** Déchiffre et authentifie une enveloppe. Lève DECRYPT_FAILED si clé, AD ou données incorrectes. */
export async function open(key: Uint8Array, envelope: Envelope, ad: string): Promise<Uint8Array> {
  assertEnvelope(envelope)
  const s = await getSodium()
  const nonce = await fromB64(envelope.n)
  const ciphertext = await fromB64(envelope.c)
  if (nonce.length !== s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES) {
    throw new CryptoError('INVALID_FORMAT', 'Nonce invalide.')
  }
  try {
    return s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, ciphertext, utf8Encode(ad), nonce, key)
  } catch {
    throw new CryptoError('DECRYPT_FAILED', 'Déchiffrement impossible : donnée altérée ou clé incorrecte.')
  }
}

export function assertEnvelope(value: unknown): asserts value is Envelope {
  if (typeof value !== 'object' || value === null) {
    throw new CryptoError('INVALID_FORMAT', 'Enveloppe chiffrée invalide.')
  }
  const env = value as Record<string, unknown>
  if (env.v !== CRYPTO_VERSION) {
    throw new CryptoError('UNSUPPORTED_VERSION', 'Version de chiffrement non prise en charge.')
  }
  if (typeof env.n !== 'string' || typeof env.c !== 'string') {
    throw new CryptoError('INVALID_FORMAT', 'Enveloppe chiffrée invalide.')
  }
}
