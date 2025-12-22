/**
 * OfflineQueue Component and Hook
 * 
 * Manages offline action queuing and synchronization for the workflow wizard.
 * Queues actions when offline and syncs when connectivity is restored.
 * 
 * Requirements: 15.5
 */

import { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  useCallback, 
  useRef,
  ReactNode 
} from 'react'
import { WifiOff, RefreshCw, AlertCircle, CheckCircle, CloudOff, Cloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type ActionType = 
  | 'step_complete' 
  | 'step_update' 
  | 'phase_complete' 
  | 'approval' 
  | 'signature'
  | 'save_progress'

export interface QueuedAction {
  id: string
  type: ActionType
  cycleId: string
  phaseId: string
  stepId?: string
  data: Record<string, unknown>
  timestamp: string
  retryCount: number
  maxRetries: number
  status: 'pending' | 'syncing' | 'failed' | 'completed'
  error?: string
  /** Priority for sync order (lower = higher priority) */
  priority: number
}

export interface OfflineQueueState {
  isOnline: boolean
  isSyncing: boolean
  queuedActions: QueuedAction[]
  failedActions: QueuedAction[]
  lastSyncTime: string | null
  syncError: string | null
  /** Total bytes of queued data */
  queuedDataSize: number
}

export interface OfflineQueueContextValue extends OfflineQueueState {
  queueAction: (action: Omit<QueuedAction, 'id' | 'timestamp' | 'retryCount' | 'status' | 'priority'> & { priority?: number }) => Promise<string>
  syncNow: () => Promise<SyncResult>
  retryFailed: () => Promise<void>
  clearFailed: () => void
  removeAction: (actionId: string) => void
  /** Get actions for a specific cycle */
  getActionsForCycle: (cycleId: string) => QueuedAction[]
  /** Check if there are pending actions for a cycle */
  hasPendingActions: (cycleId: string) => boolean
  /** Register for background sync (if supported) */
  registerBackgroundSync: () => Promise<boolean>
}

export interface SyncResult {
  success: number
  failed: number
  errors: Array<{ actionId: string; error: string }>
}

// ============================================================================
// IndexedDB Storage
// ============================================================================

const DB_NAME = 'workflow-wizard-offline'
const DB_VERSION = 2
const STORE_NAME = 'queued-actions'
const SYNC_LOG_STORE = 'sync-log'

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      
      // Actions store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
        store.createIndex('cycleId', 'cycleId', { unique: false })
        store.createIndex('priority', 'priority', { unique: false })
      }
      
      // Sync log store for tracking sync history
      if (!db.objectStoreNames.contains(SYNC_LOG_STORE)) {
        const logStore = db.createObjectStore(SYNC_LOG_STORE, { keyPath: 'id', autoIncrement: true })
        logStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

async function saveAction(action: QueuedAction): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.put(action)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getActions(): Promise<QueuedAction[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function deleteAction(id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function clearAllActions(): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function getActionsByCycle(cycleId: string): Promise<QueuedAction[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('cycleId')
    const request = index.getAll(cycleId)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function logSyncEvent(event: { type: string; success: number; failed: number; timestamp: string }): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_LOG_STORE, 'readwrite')
    const store = tx.objectStore(SYNC_LOG_STORE)
    store.add(event)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Calculate approximate size of queued data in bytes */
function calculateQueueSize(actions: QueuedAction[]): number {
  return actions.reduce((total, action) => {
    return total + new Blob([JSON.stringify(action)]).size
  }, 0)
}

// Export for testing and manual cleanup
export { clearAllActions as clearOfflineQueue, getActionsByCycle }

// ============================================================================
// Priority Helper
// ============================================================================

/** Get default priority for action type (lower = higher priority) */
function getPriorityForActionType(type: ActionType): number {
  const priorities: Record<ActionType, number> = {
    signature: 1,      // Highest priority - signatures are critical
    approval: 2,       // High priority - approvals unlock workflow
    phase_complete: 3, // Medium-high - phase completion
    step_complete: 4,  // Medium - step completion
    step_update: 5,    // Lower - partial updates
    save_progress: 6,  // Lowest - auto-save
  }
  return priorities[type] ?? 5
}

// ============================================================================
// Context
// ============================================================================

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null)

export function useOfflineQueue(): OfflineQueueContextValue {
  const context = useContext(OfflineQueueContext)
  if (!context) {
    throw new Error('useOfflineQueue must be used within an OfflineQueueProvider')
  }
  return context
}

// ============================================================================
// Provider
// ============================================================================

interface OfflineQueueProviderProps {
  children: ReactNode
  /** API endpoint for syncing actions */
  syncEndpoint?: string
  /** Interval for auto-sync attempts (ms) */
  syncInterval?: number
  /** Maximum retries for failed actions */
  maxRetries?: number
}

export function OfflineQueueProvider({
  children,
  syncEndpoint = '/api/workflow/sync',
  syncInterval = 30000,
  maxRetries = 3,
}: OfflineQueueProviderProps) {
  const [state, setState] = useState<OfflineQueueState>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    queuedActions: [],
    failedActions: [],
    lastSyncTime: null,
    syncError: null,
    queuedDataSize: 0,
  })
  
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncInProgressRef = useRef(false)

  // Load queued actions from IndexedDB on mount
  useEffect(() => {
    const loadActions = async () => {
      try {
        const actions = await getActions()
        const pending = actions.filter(a => a.status === 'pending' || a.status === 'syncing')
        const failed = actions.filter(a => a.status === 'failed')
        setState(prev => ({
          ...prev,
          queuedActions: pending,
          failedActions: failed,
          queuedDataSize: calculateQueueSize([...pending, ...failed]),
        }))
      } catch (error) {
        console.error('Failed to load offline actions:', error)
      }
    }
    loadActions()
  }, [])

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }))
      // Trigger sync when coming back online
      syncActions()
    }
    
    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Sync function with improved error handling and priority ordering
  const syncActions = useCallback(async (): Promise<SyncResult> => {
    if (!state.isOnline || syncInProgressRef.current || state.queuedActions.length === 0) {
      return { success: 0, failed: 0, errors: [] }
    }

    syncInProgressRef.current = true
    setState(prev => ({ ...prev, isSyncing: true, syncError: null }))

    // Sort by priority (lower = higher priority) then by timestamp
    const actionsToSync = [...state.queuedActions].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })
    
    const completedIds: string[] = []
    const newFailedActions: QueuedAction[] = []
    const errors: Array<{ actionId: string; error: string }> = []

    for (const action of actionsToSync) {
      try {
        // Update action status to syncing
        const syncingAction = { ...action, status: 'syncing' as const }
        await saveAction(syncingAction)

        // Attempt to sync with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

        const response = await fetch(syncEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: action.type,
            cycleId: action.cycleId,
            phaseId: action.phaseId,
            stepId: action.stepId,
            data: action.data,
            timestamp: action.timestamp,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok) {
          // Success - remove from queue
          await deleteAction(action.id)
          completedIds.push(action.id)
        } else {
          const errorText = await response.text().catch(() => response.statusText)
          throw new Error(`Sync failed: ${errorText}`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        errors.push({ actionId: action.id, error: errorMessage })
        
        // Handle failure
        const updatedAction: QueuedAction = {
          ...action,
          retryCount: action.retryCount + 1,
          status: action.retryCount + 1 >= maxRetries ? 'failed' : 'pending',
          error: errorMessage,
        }
        await saveAction(updatedAction)
        
        if (updatedAction.status === 'failed') {
          newFailedActions.push(updatedAction)
        }
      }
    }

    const result: SyncResult = {
      success: completedIds.length,
      failed: errors.length,
      errors,
    }

    // Log sync event
    await logSyncEvent({
      type: 'sync',
      success: result.success,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    }).catch(console.error)

    const remainingQueued = state.queuedActions.filter(
      a => !completedIds.includes(a.id) && !newFailedActions.some(f => f.id === a.id)
    )

    setState(prev => ({
      ...prev,
      isSyncing: false,
      queuedActions: remainingQueued,
      failedActions: [...prev.failedActions, ...newFailedActions],
      lastSyncTime: new Date().toISOString(),
      queuedDataSize: calculateQueueSize([...remainingQueued, ...prev.failedActions, ...newFailedActions]),
      syncError: errors.length > 0 ? `${errors.length} action(s) failed to sync` : null,
    }))

    syncInProgressRef.current = false
    return result
  }, [state.isOnline, state.queuedActions, syncEndpoint, maxRetries])

  // Auto-sync when online
  useEffect(() => {
    if (state.isOnline && state.queuedActions.length > 0 && !syncInProgressRef.current) {
      syncActions()
    }
  }, [state.isOnline, syncActions, state.queuedActions.length])

  // Set up sync interval
  useEffect(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
    }

    syncIntervalRef.current = setInterval(() => {
      if (state.isOnline && state.queuedActions.length > 0 && !syncInProgressRef.current) {
        syncActions()
      }
    }, syncInterval)

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
      }
    }
  }, [syncInterval, state.isOnline, state.queuedActions.length, syncActions])

  // Queue a new action
  const queueAction = useCallback(async (
    action: Omit<QueuedAction, 'id' | 'timestamp' | 'retryCount' | 'status' | 'priority'> & { priority?: number }
  ): Promise<string> => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const queuedAction: QueuedAction = {
      ...action,
      id,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
      priority: action.priority ?? getPriorityForActionType(action.type),
    }

    await saveAction(queuedAction)
    setState(prev => {
      const newQueued = [...prev.queuedActions, queuedAction]
      return {
        ...prev,
        queuedActions: newQueued,
        queuedDataSize: calculateQueueSize([...newQueued, ...prev.failedActions]),
      }
    })

    // Try to sync immediately if online
    if (state.isOnline && !syncInProgressRef.current) {
      setTimeout(syncActions, 100)
    } else {
      // Register for background sync if offline
      registerBackgroundSync().catch(console.error)
    }

    return id
  }, [state.isOnline, syncActions])

  // Register for background sync
  const registerBackgroundSync = useCallback(async (): Promise<boolean> => {
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready
        await (registration as ServiceWorkerRegistration & { 
          sync: { register: (tag: string) => Promise<void> } 
        }).sync.register('sync-workflow-actions')
        return true
      } catch (error) {
        console.error('Background sync registration failed:', error)
        return false
      }
    }
    return false
  }, [])

  // Manual sync trigger
  const syncNow = useCallback(async (): Promise<SyncResult> => {
    return syncActions()
  }, [syncActions])

  // Retry failed actions
  const retryFailed = useCallback(async () => {
    const actionsToRetry = state.failedActions.map(action => ({
      ...action,
      status: 'pending' as const,
      retryCount: 0,
      error: undefined,
    }))

    for (const action of actionsToRetry) {
      await saveAction(action)
    }

    setState(prev => {
      const newQueued = [...prev.queuedActions, ...actionsToRetry]
      return {
        ...prev,
        queuedActions: newQueued,
        failedActions: [],
        queuedDataSize: calculateQueueSize(newQueued),
      }
    })

    if (state.isOnline && !syncInProgressRef.current) {
      setTimeout(syncActions, 100)
    }
  }, [state.failedActions, state.isOnline, syncActions])

  // Clear failed actions
  const clearFailed = useCallback(() => {
    state.failedActions.forEach(action => deleteAction(action.id))
    setState(prev => ({ 
      ...prev, 
      failedActions: [],
      queuedDataSize: calculateQueueSize(prev.queuedActions),
    }))
  }, [state.failedActions])

  // Remove a specific action
  const removeAction = useCallback(async (actionId: string) => {
    await deleteAction(actionId)
    setState(prev => {
      const newQueued = prev.queuedActions.filter(a => a.id !== actionId)
      const newFailed = prev.failedActions.filter(a => a.id !== actionId)
      return {
        ...prev,
        queuedActions: newQueued,
        failedActions: newFailed,
        queuedDataSize: calculateQueueSize([...newQueued, ...newFailed]),
      }
    })
  }, [])

  // Get actions for a specific cycle
  const getActionsForCycle = useCallback((cycleId: string): QueuedAction[] => {
    return [...state.queuedActions, ...state.failedActions].filter(
      a => a.cycleId === cycleId
    )
  }, [state.queuedActions, state.failedActions])

  // Check if there are pending actions for a cycle
  const hasPendingActions = useCallback((cycleId: string): boolean => {
    return state.queuedActions.some(a => a.cycleId === cycleId)
  }, [state.queuedActions])

  const value: OfflineQueueContextValue = {
    ...state,
    queueAction,
    syncNow,
    retryFailed,
    clearFailed,
    removeAction,
    getActionsForCycle,
    hasPendingActions,
    registerBackgroundSync,
  }

  return (
    <OfflineQueueContext.Provider value={value}>
      {children}
    </OfflineQueueContext.Provider>
  )
}

// ============================================================================
// Status Banner Component
// ============================================================================

interface OfflineStatusBannerProps {
  className?: string
  showWhenOnline?: boolean
  /** Show detailed queue information */
  showDetails?: boolean
}

export function OfflineStatusBanner({ 
  className,
  showWhenOnline = false,
  showDetails = false,
}: OfflineStatusBannerProps) {
  const { 
    isOnline, 
    isSyncing, 
    queuedActions, 
    failedActions,
    lastSyncTime,
    queuedDataSize,
    syncNow,
    retryFailed,
  } = useOfflineQueue()

  const pendingCount = queuedActions.length
  const failedCount = failedActions.length

  // Don't show if online with no pending actions (unless showWhenOnline is true)
  if (isOnline && pendingCount === 0 && failedCount === 0 && !showWhenOnline) {
    return null
  }

  const formatDataSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatLastSync = (timestamp: string | null): string => {
    if (!timestamp) return 'Never'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-2 text-sm',
        !isOnline && 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
        isOnline && failedCount > 0 && 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
        isOnline && failedCount === 0 && pendingCount > 0 && 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
        isOnline && failedCount === 0 && pendingCount === 0 && 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <CloudOff className="h-4 w-4" />
              <span>You're offline. Changes will sync when connected.</span>
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Syncing {pendingCount} action{pendingCount !== 1 ? 's' : ''}...</span>
            </>
          ) : failedCount > 0 ? (
            <>
              <AlertCircle className="h-4 w-4" />
              <span>{failedCount} action{failedCount !== 1 ? 's' : ''} failed to sync</span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <Cloud className="h-4 w-4" />
              <span>{pendingCount} action{pendingCount !== 1 ? 's' : ''} pending sync</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              <span>All changes synced</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isOnline && pendingCount > 0 && !isSyncing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => syncNow()}
              className="h-7 px-2 text-xs"
            >
              Sync Now
            </Button>
          )}
          {failedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={retryFailed}
              className="h-7 px-2 text-xs"
            >
              Retry Failed
            </Button>
          )}
        </div>
      </div>

      {showDetails && (pendingCount > 0 || failedCount > 0) && (
        <div className="flex items-center gap-4 text-xs opacity-75">
          <span>Queue: {formatDataSize(queuedDataSize)}</span>
          <span>Last sync: {formatLastSync(lastSyncTime)}</span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Offline Indicator Component
// ============================================================================

interface OfflineIndicatorProps {
  className?: string
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const { isOnline, queuedActions } = useOfflineQueue()
  
  if (isOnline && queuedActions.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        !isOnline 
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
        className
      )}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3" />
          <span>{queuedActions.length} pending</span>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Queued Actions Panel Component
// ============================================================================

interface QueuedActionsPanelProps {
  className?: string
  cycleId?: string
  onClose?: () => void
}

export function QueuedActionsPanel({ 
  className, 
  cycleId,
  onClose,
}: QueuedActionsPanelProps) {
  const { 
    queuedActions, 
    failedActions, 
    isOnline,
    isSyncing,
    syncNow,
    retryFailed,
    removeAction,
    clearFailed,
  } = useOfflineQueue()

  const displayActions = cycleId 
    ? [...queuedActions, ...failedActions].filter(a => a.cycleId === cycleId)
    : [...queuedActions, ...failedActions]

  const pendingActions = displayActions.filter(a => a.status === 'pending' || a.status === 'syncing')
  const failedDisplayActions = displayActions.filter(a => a.status === 'failed')

  const getActionTypeLabel = (type: ActionType): string => {
    const labels: Record<ActionType, string> = {
      step_complete: 'Step Completion',
      step_update: 'Step Update',
      phase_complete: 'Phase Completion',
      approval: 'Approval',
      signature: 'Signature',
      save_progress: 'Progress Save',
    }
    return labels[type] || type
  }

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (displayActions.length === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No pending actions</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold">Queued Actions</h3>
        <div className="flex items-center gap-2">
          {isOnline && pendingActions.length > 0 && !isSyncing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncNow()}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Sync All
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Pending Actions */}
      {pendingActions.length > 0 && (
        <div className="p-4 border-b">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Pending ({pendingActions.length})
          </h4>
          <div className="space-y-2">
            {pendingActions.map(action => (
              <div 
                key={action.id}
                className="flex items-center justify-between p-2 bg-muted/50 rounded-md text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {getActionTypeLabel(action.type)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimestamp(action.timestamp)}
                    {action.status === 'syncing' && (
                      <span className="ml-2 text-blue-600">Syncing...</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAction(action.id)}
                  className="h-7 w-7 p-0"
                >
                  <span className="sr-only">Remove</span>
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Actions */}
      {failedDisplayActions.length > 0 && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              Failed ({failedDisplayActions.length})
            </h4>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={retryFailed}
                className="h-7 text-xs"
              >
                Retry All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFailed}
                className="h-7 text-xs text-red-600"
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {failedDisplayActions.map(action => (
              <div 
                key={action.id}
                className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded-md text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {getActionTypeLabel(action.type)}
                  </div>
                  <div className="text-xs text-red-600 truncate">
                    {action.error || 'Unknown error'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAction(action.id)}
                  className="h-7 w-7 p-0"
                >
                  <span className="sr-only">Remove</span>
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
