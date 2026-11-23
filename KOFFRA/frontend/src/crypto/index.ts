/**
 * Module cryptographique KOFFRA — voir docs/09-conception-cryptographique.md.
 * Point d'entrée unique : le reste de l'application ne doit pas importer libsodium directement.
 */
export * from './aead'
export * from './account'
export * from './attachments'
export { CRYPTO_VERSION } from './constants'
export * from './encoding'
export * from './errors'
export * from './kdf'
export * from './recoveryKey'
export * from './vault'
export * from './exportFile'
export * from './generator'
export { wipe } from './sodium'
