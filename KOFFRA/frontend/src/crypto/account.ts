import { open, seal, type Envelope } from './aead'
import { AD, KEY_BYTES } from './constants'
import { fromB64, toB64 } from './encoding'
import { CryptoError } from './errors'
import { derivePasswordKeys, generateKdfParams, type KdfParams } from './kdf'
import { deriveRecoveryKeys, generateRecoveryKey, parseRecoveryKey } from './recoveryKey'
import { getSodium, wipe } from './sodium'

/** Clés d'un compte déverrouillé : en mémoire uniquement, effacées au verrouillage. */
export interface UnlockedAccount {
  userUuid: string
  userKey: Uint8Array
  publicKey: Uint8Array
  privateKey: Uint8Array
}

/** Ce que le serveur stocke pour l'authentification et l'enveloppe des clés (aucun secret en clair). */
export interface PasswordMaterial {
  kdf: KdfParams
  /** base64url — le serveur la re-hache (Argon2id) avant stockage */
  authKey: string
  encryptedUserKey: Envelope
}

export interface RecoveryMaterial {
  authKey: string
  encryptedUserKey: Envelope
  fingerprint: string
}

export interface AccountKeyMaterial {
  password: PasswordMaterial
  recovery: RecoveryMaterial
  publicKey: string
  encryptedPrivateKey: Envelope
}

export interface CreatedAccount {
  material: AccountKeyMaterial
  /** À afficher UNE SEULE FOIS à l'utilisateur ; jamais envoyée au serveur. */
  recoveryKey: string
  account: UnlockedAccount
}

async function buildPasswordMaterial(
  password: string,
  userKey: Uint8Array,
  userUuid: string,
  cost?: { ops: number; mem: number },
): Promise<PasswordMaterial> {
  const kdf = await generateKdfParams(cost)
  const { authKey, wrapKey } = await derivePasswordKeys(password, kdf)
  try {
    return {
      kdf,
      authKey: await toB64(authKey),
      encryptedUserKey: await seal(wrapKey, userKey, AD.userKeyByPassword(userUuid)),
    }
  } finally {
    await wipe(authKey, wrapKey)
  }
}

async function buildRecoveryMaterial(userKey: Uint8Array, userUuid: string) {
  const { key, formatted } = await generateRecoveryKey()
  const r = await deriveRecoveryKeys(key)
  try {
    const material: RecoveryMaterial = {
      authKey: await toB64(r.authKey),
      encryptedUserKey: await seal(r.wrapKey, userKey, AD.userKeyByRecovery(userUuid)),
      fingerprint: r.fingerprint,
    }
    return { material, formatted }
  } finally {
    await wipe(key, r.authKey, r.wrapKey)
  }
}

/** Création des clés d'un compte (installation du propriétaire ou acceptation d'invitation). */
export async function createAccountKeys(
  password: string,
  userUuid: string,
  cost?: { ops: number; mem: number },
): Promise<CreatedAccount> {
  const s = await getSodium()
  const userKey = s.randombytes_buf(KEY_BYTES)
  const { publicKey, privateKey } = s.crypto_box_keypair()

  const passwordMaterial = await buildPasswordMaterial(password, userKey, userUuid, cost)
  const recovery = await buildRecoveryMaterial(userKey, userUuid)

  return {
    material: {
      password: passwordMaterial,
      recovery: recovery.material,
      publicKey: await toB64(publicKey),
      encryptedPrivateKey: await seal(userKey, privateKey, AD.privateKey(userUuid)),
    },
    recoveryKey: recovery.formatted,
    account: { userUuid, userKey, publicKey, privateKey },
  }
}

/** Étape 1 de la connexion : calcule l'authKey à envoyer et la wrapKey à garder localement. */
export async function prepareLogin(password: string, kdf: KdfParams) {
  const { authKey, wrapKey } = await derivePasswordKeys(password, kdf)
  const authKeyB64 = await toB64(authKey)
  await wipe(authKey)
  return { authKey: authKeyB64, wrapKey }
}

export interface StoredAccountKeys {
  userUuid: string
  encryptedUserKey: Envelope
  publicKey: string
  encryptedPrivateKey: Envelope
}

async function unlockWithUserKey(userKey: Uint8Array, stored: StoredAccountKeys): Promise<UnlockedAccount> {
  const s = await getSodium()
  let privateKey: Uint8Array | undefined
  try {
    privateKey = await open(userKey, stored.encryptedPrivateKey, AD.privateKey(stored.userUuid))
    const publicKey = await fromB64(stored.publicKey)
    // La clé publique fournie par le serveur doit correspondre à la clé privée déchiffrée.
    if (publicKey.length !== s.crypto_box_PUBLICKEYBYTES || s.compare(s.crypto_scalarmult_base(privateKey), publicKey) !== 0) {
      throw new CryptoError('KEY_MISMATCH', 'Clé publique incohérente avec la clé privée.')
    }
    return { userUuid: stored.userUuid, userKey, publicKey, privateKey }
  } catch (error) {
    await wipe(userKey, privateKey)
    throw error
  }
}

/** Étape 2 de la connexion : déverrouille le compte avec la wrapKey (efface la wrapKey). */
export async function unlockAccount(wrapKey: Uint8Array, stored: StoredAccountKeys): Promise<UnlockedAccount> {
  try {
    const userKey = await open(wrapKey, stored.encryptedUserKey, AD.userKeyByPassword(stored.userUuid))
    return await unlockWithUserKey(userKey, stored)
  } finally {
    await wipe(wrapKey)
  }
}

/** Changement de mot de passe : seule l'enveloppe de la userKey change. */
export async function changePassword(
  account: UnlockedAccount,
  newPassword: string,
  cost?: { ops: number; mem: number },
): Promise<PasswordMaterial> {
  return buildPasswordMaterial(newPassword, account.userKey, account.userUuid, cost)
}

/** Récupération, étape 1 : vérifie la clé saisie et calcule la preuve à envoyer au serveur. */
export async function prepareRecovery(recoveryKeyInput: string) {
  const key = await parseRecoveryKey(recoveryKeyInput)
  const r = await deriveRecoveryKeys(key)
  await wipe(key)
  const authKey = await toB64(r.authKey)
  await wipe(r.authKey)
  return { authKey, wrapKey: r.wrapKey, fingerprint: r.fingerprint }
}

/** Récupération, étape 2 : déverrouille avec la clé de récupération puis définit un nouveau mot de passe. */
export async function recoverAccount(
  recoveryWrapKey: Uint8Array,
  stored: StoredAccountKeys & { encryptedUserKeyByRecovery: Envelope },
  newPassword: string,
  cost?: { ops: number; mem: number },
) {
  let userKey: Uint8Array
  try {
    userKey = await open(recoveryWrapKey, stored.encryptedUserKeyByRecovery, AD.userKeyByRecovery(stored.userUuid))
  } finally {
    await wipe(recoveryWrapKey)
  }
  const account = await unlockWithUserKey(userKey, stored)
  // La clé de récupération utilisée est renouvelée : l'ancienne devient inutile.
  const recovery = await buildRecoveryMaterial(account.userKey, account.userUuid)
  return {
    account,
    password: await buildPasswordMaterial(newPassword, account.userKey, account.userUuid, cost),
    recovery: recovery.material,
    recoveryKey: recovery.formatted,
  }
}

/** Nouvelle clé de récupération (l'ancienne doit être révoquée côté serveur). */
export async function regenerateRecoveryKey(account: UnlockedAccount) {
  const recovery = await buildRecoveryMaterial(account.userKey, account.userUuid)
  return { recovery: recovery.material, recoveryKey: recovery.formatted }
}

/** Verrouillage : efface toutes les clés du compte en mémoire. */
export async function lockAccount(account: UnlockedAccount): Promise<void> {
  await wipe(account.userKey, account.privateKey)
}
