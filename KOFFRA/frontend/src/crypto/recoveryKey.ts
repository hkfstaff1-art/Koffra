import { KDF_CONTEXT, KEY_BYTES } from './constants'
import { CryptoError } from './errors'
import { getSodium } from './sodium'

/**
 * Clé de récupération : 256 bits aléatoires + 2 octets de somme de contrôle (BLAKE2b),
 * affichée en base32 Crockford par groupes de 5 (ex. « 7K3QD-… »). Affichée une seule fois.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford : sans I, L, O, U
const CHECKSUM_BYTES = 2
const GROUP = 5

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(text: string, expectedBytes: number): Uint8Array {
  const out = new Uint8Array(expectedBytes)
  let bits = 0
  let value = 0
  let index = 0
  for (const char of text) {
    const v = ALPHABET.indexOf(char)
    if (v === -1) throw new CryptoError('INVALID_RECOVERY_KEY', 'Clé de récupération invalide.')
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      if (index >= expectedBytes) throw new CryptoError('INVALID_RECOVERY_KEY', 'Clé de récupération invalide.')
      out[index++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
    value &= 0xff // ne conserve que les bits utiles (évite le débordement)
  }
  if (index !== expectedBytes) throw new CryptoError('INVALID_RECOVERY_KEY', 'Clé de récupération invalide.')
  return out
}

async function checksum(key: Uint8Array): Promise<Uint8Array> {
  const s = await getSodium()
  return s.crypto_generichash(16, key, null).slice(0, CHECKSUM_BYTES)
}

export async function generateRecoveryKey(): Promise<{ key: Uint8Array; formatted: string }> {
  const s = await getSodium()
  const key = s.randombytes_buf(KEY_BYTES)
  return { key, formatted: await formatRecoveryKey(key) }
}

export async function formatRecoveryKey(key: Uint8Array): Promise<string> {
  const full = new Uint8Array(KEY_BYTES + CHECKSUM_BYTES)
  full.set(key)
  full.set(await checksum(key), KEY_BYTES)
  const encoded = base32Encode(full)
  return encoded.match(new RegExp(`.{1,${GROUP}}`, 'g'))!.join('-')
}

/** Analyse une clé saisie (tolère espaces, tirets, minuscules, O→0, I/L→1) et vérifie la somme de contrôle. */
export async function parseRecoveryKey(input: string): Promise<Uint8Array> {
  const s = await getSodium()
  const normalized = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  const full = base32Decode(normalized, KEY_BYTES + CHECKSUM_BYTES)
  const key = full.slice(0, KEY_BYTES)
  if (s.compare(full.slice(KEY_BYTES), await checksum(key)) !== 0) {
    throw new CryptoError('INVALID_RECOVERY_KEY', 'Clé de récupération invalide (faute de frappe ?).')
  }
  return key
}

export interface RecoveryKeys {
  /** Envoyée au serveur pour prouver la possession (re-hachée côté serveur). */
  authKey: Uint8Array
  /** Déchiffre la userKey ; ne quitte jamais l'appareil. */
  wrapKey: Uint8Array
  /** Empreinte publique stockée côté serveur (recovery_records.recovery_key_fingerprint), hex. */
  fingerprint: string
}

export async function deriveRecoveryKeys(recoveryKey: Uint8Array): Promise<RecoveryKeys> {
  const s = await getSodium()
  const idKey = s.crypto_kdf_derive_from_key(KEY_BYTES, 3, KDF_CONTEXT.recoveryId, recoveryKey)
  const fingerprint = s.to_hex(s.crypto_generichash(16, idKey, null))
  s.memzero(idKey)
  return {
    authKey: s.crypto_kdf_derive_from_key(KEY_BYTES, 1, KDF_CONTEXT.recoveryAuth, recoveryKey),
    wrapKey: s.crypto_kdf_derive_from_key(KEY_BYTES, 2, KDF_CONTEXT.recoveryWrap, recoveryKey),
    fingerprint,
  }
}
