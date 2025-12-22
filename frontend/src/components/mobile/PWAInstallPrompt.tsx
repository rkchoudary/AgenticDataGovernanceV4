import { useState, useEffect } from 'react'
import { X, Download, Bell, Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePWA } from '@/hooks/usePWA'
import { Button } from '@/components/ui/button'
import { useMobileDetect } from './useMobileDetect'

/**
 * PWAInstallPrompt - Prompts users to install the PWA on mobile devices
 */
export function PWAInstallPrompt() {
  const [dismissed, setDismissed] = useState(false)
  const { isMobile } = useMobileDetect()
  const { isInstallable, isInstalled, install } = usePWA()

  // Check if user has previously dismissed
  useEffect(() => {
    const dismissedAt = localStorage.getItem('pwa-install-dismissed')
    if (dismissedAt) {
      const dismissedDate = new Date(dismissedAt)
      const daysSinceDismissed = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        setDismissed(true)
      }
    }
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString())
  }

  const handleInstall = async () => {
    const success = await install()
    if (success) {
      setDismissed(true)
    }
  }

  // Only show on mobile, when installable, and not dismissed
  if (!isMobile || !isInstallable || isInstalled || dismissed) {
    return null
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Download className="h-6 w-6 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">Install App</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Add to your home screen for quick access and offline support
            </p>
            
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall}>
                Install
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * OfflineIndicator - Shows when the app is offline
 */
export function OfflineIndicator() {
  const { isOnline } = usePWA()
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setShow(true)
    } else {
      // Delay hiding to show "back online" message
      const timer = setTimeout(() => setShow(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [isOnline])

  if (!show) return null

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[100] py-2 px-4 text-center text-sm font-medium',
        'transition-colors duration-300',
        isOnline
          ? 'bg-green-500 text-white'
          : 'bg-yellow-500 text-yellow-950'
      )}
    >
      <div className="flex items-center justify-center gap-2">
        {isOnline ? (
          <>
            <Wifi className="h-4 w-4" />
            <span>Back online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>You're offline. Some features may be limited.</span>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * UpdateAvailableBanner - Shows when a new version is available
 */
export function UpdateAvailableBanner() {
  const { isUpdateAvailable, updateServiceWorker } = usePWA()
  const [dismissed, setDismissed] = useState(false)

  if (!isUpdateAvailable || dismissed) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80">
      <div className="bg-primary text-primary-foreground rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <RefreshCw className="h-5 w-5 flex-shrink-0 mt-0.5" />
          
          <div className="flex-1">
            <h3 className="font-semibold">Update Available</h3>
            <p className="text-sm opacity-90 mt-0.5">
              A new version is ready. Refresh to update.
            </p>
            
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={updateServiceWorker}
              >
                Refresh Now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-primary-foreground hover:text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => setDismissed(true)}
              >
                Later
              </Button>
            </div>
          </div>
          
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:bg-primary-foreground/10 rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * NotificationPermissionPrompt - Prompts users to enable notifications
 */
export function NotificationPermissionPrompt() {
  const [dismissed, setDismissed] = useState(false)
  const [show, setShow] = useState(false)
  const { notificationPermission, requestNotificationPermission } = usePWA()

  useEffect(() => {
    // Show after a delay if permission not granted
    if (notificationPermission === 'default') {
      const timer = setTimeout(() => {
        const dismissedAt = localStorage.getItem('notification-prompt-dismissed')
        if (!dismissedAt) {
          setShow(true)
        }
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [notificationPermission])

  const handleDismiss = () => {
    setDismissed(true)
    setShow(false)
    localStorage.setItem('notification-prompt-dismissed', new Date().toISOString())
  }

  const handleEnable = async () => {
    await requestNotificationPermission()
    setShow(false)
  }

  if (!show || dismissed || notificationPermission !== 'default') {
    return null
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-4 md:w-80 animate-in slide-in-from-bottom-4">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Enable Notifications</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Get notified about approvals, issues, and deadlines
            </p>
            
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleEnable}>
                Enable
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss}>
                Not now
              </Button>
            </div>
          </div>
          
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-muted rounded-md transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
