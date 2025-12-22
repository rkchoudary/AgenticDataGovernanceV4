/**
 * Push Notification Service
 * Handles push notification subscription and sending
 */

export interface PushNotificationPayload {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  url?: string
  actions?: Array<{
    action: string
    title: string
    icon?: string
  }>
  data?: Record<string, unknown>
}

// Notification types for the governance platform
export type NotificationType = 
  | 'approval_request'
  | 'approval_decision'
  | 'issue_created'
  | 'issue_escalated'
  | 'deadline_approaching'
  | 'cycle_status_change'
  | 'mention'

export interface GovernanceNotification {
  type: NotificationType
  title: string
  body: string
  entityId?: string
  entityType?: string
  url?: string
  urgency?: 'low' | 'normal' | 'high' | 'critical'
}

/**
 * Create a push notification payload for governance events
 */
export function createNotificationPayload(
  notification: GovernanceNotification
): PushNotificationPayload {
  const basePayload: PushNotificationPayload = {
    title: notification.title,
    body: notification.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    url: notification.url || '/',
    tag: `${notification.type}-${notification.entityId || Date.now()}`,
  }

  // Add actions based on notification type
  switch (notification.type) {
    case 'approval_request':
      return {
        ...basePayload,
        actions: [
          { action: 'approve', title: 'Approve' },
          { action: 'view', title: 'View Details' },
        ],
      }
    
    case 'issue_created':
    case 'issue_escalated':
      return {
        ...basePayload,
        actions: [
          { action: 'view', title: 'View Issue' },
          { action: 'assign', title: 'Assign to Me' },
        ],
      }
    
    case 'deadline_approaching':
      return {
        ...basePayload,
        actions: [
          { action: 'view', title: 'View Details' },
          { action: 'snooze', title: 'Remind Later' },
        ],
      }
    
    default:
      return {
        ...basePayload,
        actions: [
          { action: 'view', title: 'View' },
        ],
      }
  }
}

/**
 * Request permission and subscribe to push notifications
 */
export async function subscribeToPushNotifications(
  vapidPublicKey: string
): Promise<PushSubscription | null> {
  // Check if push notifications are supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported')
    return null
  }

  // Request notification permission
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('Notification permission denied')
    return null
  }

  try {
    // Get service worker registration
    const registration = await navigator.serviceWorker.ready

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })

    return subscription
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error)
    return null
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    
    if (subscription) {
      await subscription.unsubscribe()
      return true
    }
    
    return false
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error)
    return false
  }
}

/**
 * Get current push subscription
 */
export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch (error) {
    console.error('Failed to get push subscription:', error)
    return null
  }
}

/**
 * Show a local notification (for testing or when push is not available)
 */
export async function showLocalNotification(
  notification: GovernanceNotification
): Promise<void> {
  if (!('Notification' in window)) {
    console.warn('Notifications are not supported')
    return
  }

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return
    }
  }

  const payload = createNotificationPayload(notification)

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      tag: payload.tag,
      data: { url: payload.url },
    })
  } else {
    new Notification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      tag: payload.tag,
    })
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
