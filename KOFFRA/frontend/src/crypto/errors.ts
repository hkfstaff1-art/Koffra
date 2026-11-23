export type CryptoErrorCode =
  | 'DECRYPT_FAILED'
  | 'WEAK_KDF_PARAMS'
  | 'INVALID_FORMAT'
  | 'INVALID_RECOVERY_KEY'
  | 'KEY_MISMATCH'
  | 'UNSUPPORTED_VERSION'

/**
 * Erreur cryptographique. Les messages sont volontairement génériques :
 * ils ne contiennent jamais de donnée secrète ni de détail exploitable.
 */
export class CryptoError extends Error {
  readonly code: CryptoErrorCode

  constructor(code: CryptoErrorCode, message: string) {
    super(message)
    this.name = 'CryptoError'
    this.code = code
  }
}
