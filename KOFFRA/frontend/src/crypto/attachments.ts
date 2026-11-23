import { AD } from './constants'
import { utf8Encode } from './encoding'
import { CryptoError } from './errors'
import { getSodium } from './sodium'

/**
 * Pièces jointes : chiffrement par flux (secretstream XChaCha20-Poly1305), par blocs de 64 Kio.
 * Chaque fichier a sa propre clé aléatoire, stockée dans le payload chiffré de l'entrée.
 * Format binaire : header (24 o) || bloc1 || bloc2 || … (chaque bloc = données + 17 o).
 * Le dernier bloc porte le tag FINAL : une troncature est détectée.
 */

export const ATTACHMENT_CHUNK_BYTES = 64 * 1024

export interface EncryptedFile {
  fileKey: Uint8Array
  data: Uint8Array
}

export async function encryptFile(plaintext: Uint8Array, attachmentUuid: string): Promise<EncryptedFile> {
  const s = await getSodium()
  const ABYTES = s.crypto_secretstream_xchacha20poly1305_ABYTES
  const fileKey = s.crypto_secretstream_xchacha20poly1305_keygen()
  const { state, header } = s.crypto_secretstream_xchacha20poly1305_init_push(fileKey)
  const ad = utf8Encode(AD.attachment(attachmentUuid))

  const chunkCount = Math.max(1, Math.ceil(plaintext.length / ATTACHMENT_CHUNK_BYTES))
  const out = new Uint8Array(header.length + plaintext.length + chunkCount * ABYTES)
  out.set(header, 0)
  let offset = header.length

  for (let i = 0; i < chunkCount; i++) {
    const chunk = plaintext.subarray(i * ATTACHMENT_CHUNK_BYTES, (i + 1) * ATTACHMENT_CHUNK_BYTES)
    const tag =
      i === chunkCount - 1
        ? s.crypto_secretstream_xchacha20poly1305_TAG_FINAL
        : s.crypto_secretstream_xchacha20poly1305_TAG_MESSAGE
    const encrypted = s.crypto_secretstream_xchacha20poly1305_push(state, chunk, ad, tag)
    out.set(encrypted, offset)
    offset += encrypted.length
  }

  return { fileKey, data: out }
}

export async function decryptFile(data: Uint8Array, fileKey: Uint8Array, attachmentUuid: string): Promise<Uint8Array> {
  const s = await getSodium()
  const HEADER = s.crypto_secretstream_xchacha20poly1305_HEADERBYTES
  const ABYTES = s.crypto_secretstream_xchacha20poly1305_ABYTES
  const fail = () => new CryptoError('DECRYPT_FAILED', 'Pièce jointe altérée ou clé incorrecte.')

  if (data.length < HEADER + ABYTES) throw fail()
  let state
  try {
    state = s.crypto_secretstream_xchacha20poly1305_init_pull(data.subarray(0, HEADER), fileKey)
  } catch {
    throw fail()
  }
  const ad = utf8Encode(AD.attachment(attachmentUuid))
  const parts: Uint8Array[] = []
  let offset = HEADER
  let finished = false

  while (offset < data.length) {
    if (finished) throw fail() // données après le bloc final
    const end = Math.min(offset + ATTACHMENT_CHUNK_BYTES + ABYTES, data.length)
    const result = s.crypto_secretstream_xchacha20poly1305_pull(state, data.subarray(offset, end), ad)
    if (!result) throw fail()
    parts.push(result.message)
    finished = result.tag === s.crypto_secretstream_xchacha20poly1305_TAG_FINAL
    offset = end
  }
  if (!finished) throw fail() // fichier tronqué

  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const p of parts) {
    out.set(p, pos)
    pos += p.length
  }
  return out
}
