import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui'

/** Événement non standard exposé par Chrome/Edge/Android quand l'application est installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'koffra.install-dismissed'
const DISMISS_DAYS = 14

function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function recentlyDismissed(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
  return Date.now() - at < DISMISS_DAYS * 86_400_000
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

/** Indique si l'installation est proposable et permet de la lancer (bouton du menu latéral). */
export function useInstallApp() {
  const [available, setAvailable] = useState(() => deferred !== null)
  useEffect(() => {
    const update = () => setAvailable(deferred !== null)
    listeners.add(update)
    return () => void listeners.delete(update)
  }, [])
  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    deferred = null
    listeners.forEach((l) => l())
  }
  return { available, install }
}

/**
 * Bandeau « Installer KOFFRA » : propose d'ajouter l'application à l'écran d'accueil
 * (Android/Chrome/Edge via l'invite native, iPhone/iPad via les instructions Safari).
 */
export function InstallPrompt() {
  const { available, install } = useInstallApp()
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed())
  const ios = isIos()

  if (hidden || (!available && !ios)) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setHidden(true)
  }

  return (
    <div className="install-banner" role="dialog" aria-label="Installer l’application KOFFRA">
      <img src="/pwa-192.png" alt="" width={44} height={44} />
      <div className="install-text">
        <strong>Installer KOFFRA</strong>
        {ios && !available ? (
          <span>
            Touchez <Share className="icon-sm" aria-label="Partager" /> puis « Sur l’écran d’accueil » <SquarePlus className="icon-sm" aria-hidden />
          </span>
        ) : (
          <span>Accédez à votre coffre depuis l’écran d’accueil, comme une application.</span>
        )}
      </div>
      {available ? (
        <Button size="sm" icon={Download} onClick={() => void install().then(() => setHidden(true))}>
          Installer
        </Button>
      ) : null}
      <button type="button" className="install-close" onClick={dismiss} aria-label="Plus tard">
        <X className="icon-sm" aria-hidden />
      </button>
    </div>
  )
}
