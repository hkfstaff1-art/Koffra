import { KDF_CONTEXT, KEY_BYTES } from './constants'
import { fromB64, toB64, utf8Encode } from './encoding'
import { CryptoError } from './errors'
import { getSodium, wipe } from './sodium'

export interface KdfParams {
  alg: 'argon2id13'
  /** nombre de passes (opslimit) */
  ops: number
  /** mémoire en octets (memlimit) */
  mem: number
  /** sel aléatoire 16 octets, base64url */
  salt: string
}

const MIB = 1024 * 1024

/** Paramètres par défaut (docs/09 §4) — à calibrer sur les téléphones cibles. */
export const DEFAULT_KDF_COST = { ops: 3, mem: 64 * MIB } as const

/** Plancher OWASP : tout paramètre inférieur (ex. imposé par un serveur compromis) est refusé. */
export const MIN_KDF_COST = { ops: 2, mem: 19 * MIB } as const

/** Plafond : évite un déni de service (mémoire) via des paramètres serveur démesurés. */
export const MAX_KDF_COST = { ops: 10, mem: 1024 * MIB } as const

export async function generateKdfParams(cost: { ops: number; mem: number } = DEFAULT_KDF_COST): Promise<KdfParams> {
  const s = await getSodium()
  const params: KdfParams = {
    alg: 'argon2id13',
    ops: cost.ops,
    mem: cost.mem,
    salt: await toB64(s.randombytes_buf(s.crypto_pwhash_SALTBYTES)),
  }
  await assertKdfParams(params)
  return params
}

/** Valide des paramètres KDF (ex. reçus du serveur) et les renvoie typés. */
export async function assertKdfParams(params: unknown): Promise<KdfParams> {
  const s = await getSodium()
  const p = params as Partial<KdfParams> | null
  if (
    !p ||
    p.alg !== 'argon2id13' ||
    !Number.isInteger(p.ops) ||
    !Number.isInteger(p.mem) ||
    typeof p.salt !== 'string'
  ) {
    throw new CryptoError('INVALID_FORMAT', 'Paramètres de dérivation invalides.')
  }
  if ((await fromB64(p.salt)).length !== s.crypto_pwhash_SALTBYTES) {
    throw new CryptoError('INVALID_FORMAT', 'Sel de dérivation invalide.')
  }
  const ops = p.ops as number
  const mem = p.mem as number
  if (ops < MIN_KDF_COST.ops || mem < MIN_KDF_COST.mem) {
    throw new CryptoError('WEAK_KDF_PARAMS', 'Paramètres de dérivation trop faibles : refusés.')
  }
  if (ops > MAX_KDF_COST.ops || mem > MAX_KDF_COST.mem) {
    throw new CryptoError('INVALID_FORMAT', 'Paramètres de dérivation hors limites.')
  }
  return { alg: 'argon2id13', ops, mem, salt: p.salt }
}

export interface PasswordKeys {
  /** Envoyée au serveur pour l'authentification (re-hachée côté serveur). */
  authKey: Uint8Array
  /** Ne quitte jamais l'appareil : déchiffre la userKey. */
  wrapKey: Uint8Array
}

/**
 * mot de passe → Argon2id → masterKey → { authKey, wrapKey } (dérivations indépendantes).
 * La masterKey est effacée immédiatement.
 */
export async function derivePasswordKeys(password: string, params: KdfParams): Promise<PasswordKeys> {
  await assertKdfParams(params)
  if (password.length === 0) throw new CryptoError('INVALID_FORMAT', 'Mot de passe vide.')
  const s = await getSodium()
  const passwordBytes = utf8Encode(password.normalize('NFKC'))
  const masterKey = s.crypto_pwhash(
    KEY_BYTES,
    passwordBytes,
    await fromB64(params.salt),
    params.ops,
    params.mem,
    s.crypto_pwhash_ALG_ARGON2ID13,
  )
  try {
    return {
      authKey: s.crypto_kdf_derive_from_key(KEY_BYTES, 1, KDF_CONTEXT.auth, masterKey),
      wrapKey: s.crypto_kdf_derive_from_key(KEY_BYTES, 2, KDF_CONTEXT.wrap, masterKey),
    }
  } finally {
    await wipe(masterKey, passwordBytes)
  }
}
