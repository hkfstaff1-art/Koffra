import { CryptoError } from './errors'
import { getSodium } from './sodium'

export interface GeneratorOptions {
  length: number
  lower: boolean
  upper: boolean
  digits: boolean
  symbols: boolean
  /** Exclut les caractères ambigus (0/O, 1/l/I…) */
  avoidAmbiguous: boolean
}

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
}

const SETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&*+-=?@^_~.,:;()[]{}',
} as const
const AMBIGUOUS = /[0O1lIo|]/g

function pools(o: GeneratorOptions): string[] {
  return (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => o[k])
    .map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]))
}

/**
 * Mot de passe aléatoire (CSPRNG libsodium, tirage uniforme sans biais de modulo),
 * contenant au moins un caractère de chaque famille choisie.
 */
export async function generatePassword(options: GeneratorOptions = DEFAULT_GENERATOR): Promise<string> {
  const s = await getSodium()
  const selected = pools(options)
  if (selected.length === 0) throw new CryptoError('INVALID_FORMAT', 'Choisissez au moins un type de caractères.')
  if (!Number.isInteger(options.length) || options.length < Math.max(8, selected.length) || options.length > 128) {
    throw new CryptoError('INVALID_FORMAT', 'Longueur entre 8 et 128 caractères.')
  }

  const all = selected.join('')
  const pick = (set: string) => set[s.randombytes_uniform(set.length)]!
  const chars = selected.map(pick)
  while (chars.length < options.length) chars.push(pick(all))

  // Mélange de Fisher-Yates (aléa uniforme)
  for (let i = chars.length - 1; i > 0; i--) {
    const j = s.randombytes_uniform(i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}

/** Entropie approximative (bits) de la configuration choisie. */
export function generatorEntropyBits(options: GeneratorOptions): number {
  const size = pools(options).join('').length
  return size === 0 ? 0 : Math.floor(options.length * Math.log2(size))
}

/** Estimation simple de la robustesse d'un mot de passe saisi (indicatif, non bloquant). */
export function estimatePasswordStrength(password: string): { bits: number; label: 'faible' | 'moyen' | 'fort' | 'très fort' } {
  let pool = 0
  if (/[a-z]/.test(password)) pool += 26
  if (/[A-Z]/.test(password)) pool += 26
  if (/[0-9]/.test(password)) pool += 10
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33
  const unique = new Set(password).size
  const bits = pool === 0 ? 0 : Math.floor(Math.min(password.length, unique * 2) * Math.log2(pool))
  const label = bits < 50 ? 'faible' : bits < 70 ? 'moyen' : bits < 100 ? 'fort' : 'très fort'
  return { bits, label }
}
