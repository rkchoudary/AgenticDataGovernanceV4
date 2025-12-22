import { useState, useEffect, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PWAState {
  isInstallable: boolean
  isInstalled: boolean
  isOnline: boolean
  isUpdateAvailable: boolean
  notificationPermission: NotificationPermission | 'unsupported'
}

interface UsePWAReturn extends PWAState {
  install: () => Promise<boolean>
  requestNotificationPermission: () => Promise<boolean>
  sendTestNotification: () => void
  updateServiceWorker: () => void
  queueOfflineAction: (action: OfflineAction) => Promise<void>
}

interface OfflineAction {
  id: string
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}

let deferredPrompt: BeforeInstallPromptEvent | null = null

/**
 * usePWA - Hook for Progressive Web App functionality
 * Handles installation, notifications, offline support, and service worker updates
 */
export function usePWA(): UsePWAReturn {
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isInstalled: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isUpdateAvailable: false,
    notificationPermission: typeof Notification !== 'undefined' 
      ? Notification.permission 
      : 'unsupported',
  })

  // Check if app is installed (standalone mode)
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true
    
    setState(prev => ({ ...prev, isInstalled: isStandalone }))
  }, [])

  // Listen for install prompt
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      setState(prev => ({ ...prev, isInstallable: true }))
    }

    const handleAppInstalled = () => {
      deferredPrompt = null
      setState(prev => ({ ...prev, isInstallable: false, isInstalled: true }))
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Listen for online/offline status
  useEffect(() => {
    const handleOnline = () => setState(prev => ({ ...prev, isOnline: true }))
    const handleOffline = () => setState(prev => ({ ...prev, isOnline: false }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Register service worker and listen for updates
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setState(prev => ({ ...prev, isUpdateAvailable: true }))
                }
              })
            }
          })
        })
        .catch((error) => {
          console.error('Service worker registration failed:', error)
        })
    }
  }, [])

  // Install the PWA
  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      deferredPrompt = null
      setState(prev => ({ ...prev, isInstallable: false }))
      return outcome === 'accepted'
    } catch (error) {
      console.error('Install failed:', error)
      return false
    }
  }, [])

  // Request notification permission
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (typeof Notification === 'undefined') return false

    try {
      const permission = await Notification.requestPermission()
      setState(prev => ({ ...prev, notificationPermission: permission }))
      return permission === 'granted'
    } catch (error) {
      console.error('Notification permission request failed:', error)
      return false
    }
  }, [])

  // Send a test notification
  const sendTestNotification = useCallback(() => {
    if (state.notificationPermission !== 'granted') return

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification('Data Governance Platform', {
          body: 'Push notifications are working!',
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
          tag: 'test-notification',
        })
      })
    } else {
      new Notification('Data Governance Platform', {
        body: 'Notifications are working!',
        icon: '/icons/icon-192x192.png',
      })
    }
  }, [state.notificationPermission])

  // Update service worker
  const updateServiceWorker = useCallback(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
        window.location.reload()
      })
    }
  }, [])

  // Queue an action for offline sync
  const queueOfflineAction = useCallback(async (action: OfflineAction): Promise<void> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('datagov-offline', 1)
      
      request.onerror = () => reject(request.error)
      
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('queued-actions', 'readwrite')
        const store = tx.objectStore('queued-actions')
        store.add(action)
        
        tx.oncomplete = () => {
          // Request background sync if available
          if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
            navigator.serviceWorker.ready.then((registration) => {
              (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
                .sync.register('sync-actions')
            })
          }
          resolve()
        }
        
        tx.onerror = () => reject(tx.error)
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('queued-actions')) {
          db.createObjectStore('queued-actions', { keyPath: 'id' })
        }
      }
    })
  }, [])

  return {
    ...state,
    install,
    requestNotificationPermission,
    sendTestNotification,
    updateServiceWorker,
    queueOfflineAction,
  }
}

// Hook for subscribing to push notifications
export function usePushNotifications() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    setIsSupported('PushManager' in window)
    
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then(setSubscription)
      })
    }
  }, [])

  const subscribe = useCallback(async (vapidPublicKey: string): Promise<PushSubscription | null> => {
    if (!isSupported) return null

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      setSubscription(subscription)
      return subscription
    } catch (error) {
      console.error('Push subscription failed:', error)
      return null
    }
  }, [isSupported])

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!subscription) return false

    try {
      await subscription.unsubscribe()
      setSubscription(null)
      return true
    } catch (error) {
      console.error('Push unsubscribe failed:', error)
      return false
    }
  }, [subscription])

  return {
    subscription,
    isSupported,
    subscribe,
    unsubscribe,
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer
}
