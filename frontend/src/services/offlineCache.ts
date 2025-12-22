/**
 * Offline Cache Service
 * Handles caching critical data for offline access and queuing actions for sync
 */

const DB_NAME = 'datagov-offline'
const DB_VERSION = 1

interface QueuedAction {
  id: string
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
  timestamp: number
  retryCount: number
}

interface CachedData {
  key: string
  data: unknown
  timestamp: number
  expiresAt?: number
}

/**
 * Open the IndexedDB database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // Store for queued actions (offline mutations)
      if (!db.objectStoreNames.contains('queued-actions')) {
        db.createObjectStore('queued-actions', { keyPath: 'id' })
      }
      
      // Store for cached data
      if (!db.objectStoreNames.contains('cached-data')) {
        const store = db.createObjectStore('cached-data', { keyPath: 'key' })
        store.createIndex('timestamp', 'timestamp')
      }
      
      // Store for pending approvals
      if (!db.objectStoreNames.contains('pending-approvals')) {
        db.createObjectStore('pending-approvals', { keyPath: 'id' })
      }
    }
  })
}

/**
 * Queue an action for later sync when offline
 */
export async function queueAction(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retryCount'>): Promise<string> {
  const db = await openDatabase()
  const id = `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const queuedAction: QueuedAction = {
    ...action,
    id,
    timestamp: Date.now(),
    retryCount: 0,
  }
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queued-actions', 'readwrite')
    const store = tx.objectStore('queued-actions')
    const request = store.add(queuedAction)
    
    request.onsuccess = () => {
      // Request background sync if available
      if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready.then((registration) => {
          (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } })
            .sync.register('sync-actions')
            .catch(console.error)
        })
      }
      resolve(id)
    }
    
    request.onerror = () => reject(request.error)
  })
}

/**
 * Get all queued actions
 */
export async function getQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDatabase()
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queued-actions', 'readonly')
    const store = tx.objectStore('queued-actions')
    const request = store.getAll()
    
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Remove a queued action after successful sync
 */
export async function removeQueuedAction(id: string): Promise<void> {
  const db = await openDatabase()
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queued-actions', 'readwrite')
    const store = tx.objectStore('queued-actions')
    const request = store.delete(id)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Cache data for offline access
 */
export async function cacheData(key: string, data: unknown, ttlMs?: number): Promise<void> {
  const db = await openDatabase()
  
  const cachedData: CachedData = {
    key,
    data,
    timestamp: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
  }
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached-data', 'readwrite')
    const store = tx.objectStore('cached-data')
    const request = store.put(cachedData)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Get cached data
 */
export async function getCachedData<T>(key: string): Promise<T | null> {
  const db = await openDatabase()
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached-data', 'readonly')
    const store = tx.objectStore('cached-data')
    const request = store.get(key)
    
    request.onsuccess = () => {
      const result = request.result as CachedData | undefined
      
      if (!result) {
        resolve(null)
        return
      }
      
      // Check if expired
      if (result.expiresAt && result.expiresAt < Date.now()) {
        // Remove expired data
        removeCachedData(key).catch(console.error)
        resolve(null)
        return
      }
      
      resolve(result.data as T)
    }
    
    request.onerror = () => reject(request.error)
  })
}

/**
 * Remove cached data
 */
export async function removeCachedData(key: string): Promise<void> {
  const db = await openDatabase()
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached-data', 'readwrite')
    const store = tx.objectStore('cached-data')
    const request = store.delete(key)
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Clear all cached data
 */
export async function clearCache(): Promise<void> {
  const db = await openDatabase()
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cached-data', 'readwrite')
    const store = tx.objectStore('cached-data')
    const request = store.clear()
    
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * Queue an approval decision for offline sync
 */
export async function queueApprovalDecision(
  approvalId: string,
  decision: 'approve' | 'reject' | 'request_changes',
  rationale: string
): Promise<string> {
  return queueAction({
    url: `/api/approvals/${approvalId}/decision`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, rationale }),
  })
}

/**
 * Sync all queued actions when back online
 */
export async function syncQueuedActions(): Promise<{ success: number; failed: number }> {
  const actions = await getQueuedActions()
  let success = 0
  let failed = 0
  
  for (const action of actions) {
    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body,
      })
      
      if (response.ok) {
        await removeQueuedAction(action.id)
        success++
      } else {
        failed++
      }
    } catch (error) {
      console.error('Failed to sync action:', error)
      failed++
    }
  }
  
  return { success, failed }
}

/**
 * Get the count of pending offline actions
 */
export async function getPendingActionsCount(): Promise<number> {
  const actions = await getQueuedActions()
  return actions.length
}
