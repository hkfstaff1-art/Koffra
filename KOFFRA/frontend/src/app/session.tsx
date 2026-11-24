import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  lockAccount,
  openSealedVaultKey,
  prepareLogin,
  unlockAccount,
  unwrapVaultKey,
  wipe,
  wrapVaultKey,
  type Envelope,
  type UnlockedAccount,
  type VaultKey,
} from '../crypto'
import { ApiError, onUnauthorized } from '../services/api/client'
import { koffra, type MeResponse } from '../services/api/koffra'

/**
 * État de session KOFFRA.
 * - anonymous : pas de session serveur ;
 * - locked : session serveur valide mais clés absentes de la mémoire (rechargement, verrouillage) ;
 * - unlocked : clés déchiffrées EN MÉMOIRE UNIQUEMENT (jamais stockées dans le navigateur).
 */
export type Phase = 'loading' | 'anonymous' | 'locked' | 'unlocked'

interface SessionValue {
  phase: Phase
  me: MeResponse | null
  account: UnlockedAccount | null
  vaultKeys: ReadonlyMap<number, VaultKey>
  currentKey: VaultKey | null
  /** l'admin n'a pas encore reçu la clé du coffre */
  vaultPending: boolean
  autoLockMinutes: number
  setAutoLockMinutes: (m: number) => void
  /** Ouvre la session après connexion / installation (la wrapKey est effacée après usage). */
  openSession: (me: MeResponse, wrapKey: Uint8Array) => Promise<void>
  unlock: (password: string) => Promise<void>
  lock: () => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)
const AUTOLOCK_PREF = 'koffra.autolock.minutes' // préférence non secrète

function storedAutoLock(): number {
  const v = Number(localStorage.getItem(AUTOLOCK_PREF))
  return Number.isFinite(v) && v >= 1 && v <= 60 ? v : 5
}

/** Déchiffre les accès au coffre ; confirme automatiquement un accès scellé reçu à l'invitation. */
async function loadVaultKeys(account: UnlockedAccount, me: MeResponse): Promise<Map<number, VaultKey>> {
  const keys = new Map<number, VaultKey>()
  for (const grant of me.keys.vault_key_grants) {
    if (grant.type === 'confirmed') {
      keys.set(grant.key_version, await unwrapVaultKey(account, grant.encrypted_key as Envelope, grant.key_version))
    }
  }
  for (const grant of me.keys.vault_key_grants) {
    if (grant.type === 'sealed' && !keys.has(grant.key_version)) {
      const key = await openSealedVaultKey(account, grant.encrypted_key as string, grant.key_version)
      await koffra.confirmVault(grant.key_version, await wrapVaultKey(account, key))
      keys.set(grant.key_version, key)
    }
  }
  return keys
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [account, setAccount] = useState<UnlockedAccount | null>(null)
  const [vaultKeys, setVaultKeys] = useState<Map<number, VaultKey>>(new Map())
  const [autoLockMinutes, setAutoLock] = useState(storedAutoLock)
  const keysRef = useRef<{ account: UnlockedAccount | null; vaultKeys: Map<number, VaultKey> }>({ account: null, vaultKeys: new Map() })

  const wipeKeys = useCallback(async () => {
    const { account: a, vaultKeys: vk } = keysRef.current
    if (a) await lockAccount(a)
    for (const k of vk.values()) k.key.fill(0)
    keysRef.current = { account: null, vaultKeys: new Map() }
    setAccount(null)
    setVaultKeys(new Map())
  }, [])

  const toAnonymous = useCallback(async () => {
    await wipeKeys()
    setMe(null)
    setPhase('anonymous')
  }, [wipeKeys])

  // Session serveur existante au chargement ? → écran de déverrouillage.
  useEffect(() => {
    onUnauthorized(() => void toAnonymous())
    koffra
      .me()
      .then((m) => {
        setMe(m)
        setPhase('locked')
      })
      .catch(() => setPhase('anonymous'))
    return () => onUnauthorized(null)
  }, [toAnonymous])

  const install = useCallback(async (m: MeResponse, acc: UnlockedAccount) => {
    const keys = await loadVaultKeys(acc, m)
    keysRef.current = { account: acc, vaultKeys: keys }
    setAccount(acc)
    setVaultKeys(keys)
    setMe(m)
    setPhase('unlocked')
  }, [])

  const openSession = useCallback(
    async (m: MeResponse, wrapKey: Uint8Array) => {
      const acc = await unlockAccount(wrapKey, {
        userUuid: m.user.uuid,
        encryptedUserKey: m.keys.encrypted_user_key,
        publicKey: m.keys.public_key,
        encryptedPrivateKey: m.keys.encrypted_private_key,
      })
      await install(m, acc)
    },
    [install],
  )

  const unlock = useCallback(
    async (password: string) => {
      let m: MeResponse
      try {
        m = await koffra.me()
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401) || !me) throw err
        // La session serveur a expiré pendant que le coffre était verrouillé :
        // reconnexion transparente avec le même mot de passe (appareil déjà approuvé).
        const email = me.user.email
        const { kdf_params } = await koffra.prelogin(email)
        const keys = await prepareLogin(password, kdf_params)
        const res = await koffra.login({ email, auth_key: keys.authKey, device_label: deviceLabel() })
        if ('otp_required' in res) {
          await wipe(keys.wrapKey)
          await toAnonymous() // appareil à re-vérifier : retour à l'écran de connexion
          return
        }
        await openSession(res, keys.wrapKey)
        return
      }
      const { wrapKey } = await prepareLogin(password, m.keys.kdf_params)
      await openSession(m, wrapKey)
    },
    [me, openSession, toAnonymous],
  )

  const refresh = useCallback(async () => {
    const m = await koffra.me()
    const acc = keysRef.current.account
    if (acc) await install(m, acc)
    else setMe(m)
  }, [install])

  const lock = useCallback(async () => {
    await wipeKeys()
    setPhase((p) => (p === 'unlocked' ? 'locked' : p))
  }, [wipeKeys])

  const logout = useCallback(async () => {
    await koffra.logout().catch(() => undefined)
    await toAnonymous()
  }, [toAnonymous])

  // Verrouillage automatique après inactivité et à la fermeture de l'onglet.
  useEffect(() => {
    if (phase !== 'unlocked') return
    let timer = window.setTimeout(() => void lock(), autoLockMinutes * 60_000)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void lock(), autoLockMinutes * 60_000)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    const onHide = () => void lock()
    window.addEventListener('pagehide', onHide)
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
      window.removeEventListener('pagehide', onHide)
    }
  }, [phase, autoLockMinutes, lock])

  const setAutoLockMinutes = useCallback((m: number) => {
    localStorage.setItem(AUTOLOCK_PREF, String(m))
    setAutoLock(m)
  }, [])

  const value = useMemo<SessionValue>(() => {
    const currentVersion = me?.keys.current_vault_key_version ?? null
    const currentKey = currentVersion !== null ? (vaultKeys.get(currentVersion) ?? null) : null
    return {
      phase,
      me,
      account,
      vaultKeys,
      currentKey,
      vaultPending: phase === 'unlocked' && currentKey === null,
      autoLockMinutes,
      setAutoLockMinutes,
      openSession,
      unlock,
      lock,
      logout,
      refresh,
    }
  }, [phase, me, account, vaultKeys, autoLockMinutes, setAutoLockMinutes, openSession, unlock, lock, logout, refresh])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession hors de SessionProvider')
  return ctx
}

/** Libellé d'appareil lisible, sans empreinte navigateur. */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur'
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Appareil'
  return `${browser} · ${os}`
}
