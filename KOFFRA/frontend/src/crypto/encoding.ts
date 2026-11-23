import { CryptoError } from './errors'
import { getSodium } from './sodium'

/** Binaire → base64url sans padding. */
export async function toB64(bytes: Uint8Array): Promise<string> {
  const s = await getSodium()
  return s.to_base64(bytes, s.base64_variants.URLSAFE_NO_PADDING)
}

/** base64url sans padding → binaire (lève INVALID_FORMAT si invalide). */
export async function fromB64(value: string): Promise<Uint8Array> {
  const s = await getSodium()
  try {
    return s.from_base64(value, s.base64_variants.URLSAFE_NO_PADDING)
  } catch {
    throw new CryptoError('INVALID_FORMAT', 'Donnée encodée invalide.')
  }
}

export const utf8Encode = (text: string): Uint8Array => new TextEncoder().encode(text)
export const utf8Decode = (bytes: Uint8Array): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes)
