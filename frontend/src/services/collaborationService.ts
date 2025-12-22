/**
 * Collaboration Service
 * 
 * Manages real-time collaboration features including active user tracking,
 * step locking, and conflict detection/resolution.
 * 
 * Requirements: 13.4, 13.5
 */

import { 
  ActiveUser, 
  StepLock, 
  PendingChange, 
  CollaborationState,
  Phase 
} from '@/types/workflow-wizard'

// ============================================================================
// Types
// ============================================================================

export interface ConflictInfo {
  id: string
  stepId: string
  localChange: PendingChange
  remoteChange: PendingChange
  detectedAt: string
  localVersion: number
  remoteVersion: number
  fieldConflicts: FieldConflict[]
}

export interface FieldConflict {
  field: string
  localValue: unknown
  remoteValue: unknown
  baseValue?: unknown
}

export interface VersionedData {
  version: number
  data: Record<string, unknown>
  timestamp: string
  userId: string
}

export interface CollaborationEvent {
  type: 'user_joined' | 'user_left' | 'user_moved' | 'step_locked' | 'step_unlocked' | 'conflict_detected' | 'conflict_resolved'
  payload: unknown
  timestamp: string
}

export type CollaborationEventHandler = (event: CollaborationEvent) => void

// ============================================================================
// Mock Data for Development
// ============================================================================

const mockActiveUsers: ActiveUser[] = [
  {
    userId: 'user-1',
    userName: 'Sarah Compliance',
    avatarUrl: undefined,
    currentPhase: 'regulatory_intelligence',
    currentStep: 'scan_results',
    lastActivity: new Date().toISOString(),
  },
  {
    userId: 'user-2',
    userName: 'Mike Steward',
    avatarUrl: undefined,
    currentPhase: 'data_requirements',
    currentStep: 'source_mapping',
    lastActivity: new Date(Date.now() - 120000).toISOString(),
  },
]

const mockLocks: StepLock[] = []
const mockPendingChanges: PendingChange[] = []

// Version tracking for conflict detection
const stepVersions: Map<string, VersionedData> = new Map()

// ============================================================================
// Collaboration Service
// ============================================================================

class CollaborationService {
  private eventHandlers: Set<CollaborationEventHandler> = new Set()
  private currentUserId: string | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Initialize collaboration for a workflow cycle
   * Requirement 13.4: Display real-time collaboration indicators
   */
  async initialize(cycleId: string, userId: string): Promise<CollaborationState> {
    this.currentUserId = userId
    
    // In production, this would establish a WebSocket connection
    // For now, we'll use polling simulation
    this.startHeartbeat(cycleId)
    this.startPolling(cycleId)
    
    return {
      cycleId,
      activeUsers: mockActiveUsers,
      locks: mockLocks,
      pendingChanges: mockPendingChanges,
    }
  }

  /**
   * Cleanup collaboration resources
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.currentUserId = null
  }

  /**
   * Subscribe to collaboration events
   */
  subscribe(handler: CollaborationEventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  /**
   * Get active users for a cycle
   * Requirement 13.4: Display who is working on which step
   */
  async getActiveUsers(_cycleId: string): Promise<ActiveUser[]> {
    // In production: const response = await apiClient.get(`/cycles/${_cycleId}/collaboration/users`)
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 100))
    return mockActiveUsers.filter(u => u.userId !== this.currentUserId)
  }

  /**
   * Update current user's position in the workflow
   */
  async updateUserPosition(_cycleId: string, phase: Phase, stepId?: string): Promise<void> {
    // In production: await apiClient.post(`/cycles/${_cycleId}/collaboration/position`, { phase, stepId })
    const userIndex = mockActiveUsers.findIndex(u => u.userId === this.currentUserId)
    if (userIndex >= 0) {
      mockActiveUsers[userIndex] = {
        ...mockActiveUsers[userIndex],
        currentPhase: phase,
        currentStep: stepId,
        lastActivity: new Date().toISOString(),
      }
    }
  }

  /**
   * Acquire a lock on a step
   * Requirement 13.5: Detect concurrent edits
   */
  async acquireLock(_cycleId: string, stepId: string): Promise<{ success: boolean; lock?: StepLock; existingLock?: StepLock }> {
    // Check for existing lock
    const existingLock = mockLocks.find(l => l.stepId === stepId)
    if (existingLock && existingLock.lockedBy !== this.currentUserId) {
      // Check if lock has expired
      if (new Date(existingLock.expiresAt) > new Date()) {
        return { success: false, existingLock }
      }
      // Remove expired lock
      const index = mockLocks.indexOf(existingLock)
      mockLocks.splice(index, 1)
    }

    // Create new lock
    const lock: StepLock = {
      stepId,
      lockedBy: this.currentUserId!,
      lockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minute lock
    }
    mockLocks.push(lock)

    this.emitEvent({
      type: 'step_locked',
      payload: { cycleId: _cycleId, lock },
      timestamp: new Date().toISOString(),
    })

    return { success: true, lock }
  }

  /**
   * Release a lock on a step
   */
  async releaseLock(_cycleId: string, stepId: string): Promise<void> {
    const index = mockLocks.findIndex(l => l.stepId === stepId && l.lockedBy === this.currentUserId)
    if (index >= 0) {
      mockLocks.splice(index, 1)
      this.emitEvent({
        type: 'step_unlocked',
        payload: { cycleId: _cycleId, stepId },
        timestamp: new Date().toISOString(),
      })
    }
  }

  /**
   * Get all locks for a cycle
   */
  async getLocks(_cycleId: string): Promise<StepLock[]> {
    // In production: const response = await apiClient.get(`/cycles/${_cycleId}/collaboration/locks`)
    await new Promise(resolve => setTimeout(resolve, 50))
    // Filter out expired locks
    const now = new Date()
    return mockLocks.filter(l => new Date(l.expiresAt) > now)
  }

  /**
   * Check for conflicts before saving
   * Requirement 13.5: Detect concurrent edits
   */
  async checkForConflicts(
    _cycleId: string, 
    stepId: string, 
    localVersion: number,
    localData: Record<string, unknown>
  ): Promise<{ hasConflict: boolean; conflict?: ConflictInfo }> {
    // Get the current server version
    const serverVersion = stepVersions.get(stepId)
    
    // If no server version exists, no conflict
    if (!serverVersion) {
      return { hasConflict: false }
    }
    
    // If versions match, no conflict
    if (serverVersion.version === localVersion) {
      return { hasConflict: false }
    }
    
    // Version mismatch - detect field-level conflicts
    const fieldConflicts = detectFieldConflicts(localData, serverVersion.data)
    
    // If no actual field conflicts (same values), no conflict
    if (fieldConflicts.length === 0) {
      return { hasConflict: false }
    }
    
    // Create conflict info
    const conflict: ConflictInfo = {
      id: `conflict-${Date.now()}`,
      stepId,
      localChange: {
        id: `local-${Date.now()}`,
        stepId,
        userId: this.currentUserId!,
        changeType: 'update',
        data: localData,
        timestamp: new Date().toISOString(),
        synced: false,
      },
      remoteChange: {
        id: `remote-${Date.now()}`,
        stepId,
        userId: serverVersion.userId,
        changeType: 'update',
        data: serverVersion.data,
        timestamp: serverVersion.timestamp,
        synced: true,
      },
      detectedAt: new Date().toISOString(),
      localVersion,
      remoteVersion: serverVersion.version,
      fieldConflicts,
    }
    
    this.emitEvent({
      type: 'conflict_detected',
      payload: conflict,
      timestamp: new Date().toISOString(),
    })
    
    return { hasConflict: true, conflict }
  }

  /**
   * Get the current version of a step's data
   */
  async getStepVersion(_cycleId: string, stepId: string): Promise<VersionedData | null> {
    return stepVersions.get(stepId) || null
  }

  /**
   * Update step data with version tracking
   */
  async updateStepData(
    _cycleId: string,
    stepId: string,
    data: Record<string, unknown>,
    expectedVersion: number
  ): Promise<{ success: boolean; newVersion?: number; conflict?: ConflictInfo }> {
    const currentVersion = stepVersions.get(stepId)
    
    // Check for version conflict
    if (currentVersion && currentVersion.version !== expectedVersion) {
      const conflictResult = await this.checkForConflicts(_cycleId, stepId, expectedVersion, data)
      if (conflictResult.hasConflict) {
        return { success: false, conflict: conflictResult.conflict }
      }
    }
    
    // Update with new version
    const newVersion = (currentVersion?.version || 0) + 1
    stepVersions.set(stepId, {
      version: newVersion,
      data,
      timestamp: new Date().toISOString(),
      userId: this.currentUserId!,
    })
    
    return { success: true, newVersion }
  }

  /**
   * Submit a change for syncing
   */
  async submitChange(_cycleId: string, change: Omit<PendingChange, 'id' | 'timestamp' | 'synced'>): Promise<PendingChange> {
    const pendingChange: PendingChange = {
      ...change,
      id: `change-${Date.now()}`,
      timestamp: new Date().toISOString(),
      synced: false,
    }
    mockPendingChanges.push(pendingChange)
    return pendingChange
  }

  /**
   * Resolve a conflict by choosing a version
   * Requirement 13.5: Display resolution interface showing both versions
   */
  async resolveConflict(
    _cycleId: string,
    conflictId: string,
    resolution: 'keep_local' | 'keep_remote' | 'merge',
    conflict: ConflictInfo,
    mergedData?: Record<string, unknown>
  ): Promise<{ success: boolean; resolvedData: Record<string, unknown>; newVersion: number }> {
    // Determine the resolved data based on resolution type
    let resolvedData: Record<string, unknown>
    
    switch (resolution) {
      case 'keep_local':
        resolvedData = conflict.localChange.data
        break
      case 'keep_remote':
        resolvedData = conflict.remoteChange.data
        break
      case 'merge':
        if (!mergedData) {
          // Auto-merge: combine non-conflicting fields
          resolvedData = autoMergeData(
            conflict.localChange.data,
            conflict.remoteChange.data,
            conflict.fieldConflicts
          )
        } else {
          resolvedData = mergedData
        }
        break
      default:
        resolvedData = conflict.remoteChange.data
    }
    
    // Update the step version with resolved data
    const newVersion = conflict.remoteVersion + 1
    stepVersions.set(conflict.stepId, {
      version: newVersion,
      data: resolvedData,
      timestamp: new Date().toISOString(),
      userId: this.currentUserId!,
    })
    
    // Remove from pending changes
    const localIndex = mockPendingChanges.findIndex(c => c.id === conflict.localChange.id)
    if (localIndex >= 0) {
      mockPendingChanges.splice(localIndex, 1)
    }
    
    // Notify other users
    this.emitEvent({
      type: 'conflict_resolved' as CollaborationEvent['type'],
      payload: { conflictId, resolution, stepId: conflict.stepId },
      timestamp: new Date().toISOString(),
    })
    
    return {
      success: true,
      resolvedData,
      newVersion,
    }
  }

  /**
   * Get pending changes for a cycle
   */
  async getPendingChanges(_cycleId: string): Promise<PendingChange[]> {
    return mockPendingChanges.filter(c => !c.synced)
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private startHeartbeat(_cycleId: string): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      // In production: await apiClient.post(`/cycles/${_cycleId}/collaboration/heartbeat`)
    }, 30000)
  }

  private startPolling(_cycleId: string): void {
    // Poll for updates every 5 seconds
    this.pollInterval = setInterval(async () => {
      // In production, this would be replaced by WebSocket events
      // For now, we simulate checking for updates
    }, 5000)
  }

  private emitEvent(event: CollaborationEvent): void {
    this.eventHandlers.forEach(handler => handler(event))
  }
}

// Export singleton instance
export const collaborationService = new CollaborationService()

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get initials from a user name
 */
export function getUserInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * Format last activity time as relative string
 */
export function formatLastActivity(timestamp: string): string {
  const now = new Date()
  const activity = new Date(timestamp)
  const diffMs = now.getTime() - activity.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  
  return activity.toLocaleDateString()
}

/**
 * Check if a user is currently active (activity within last 5 minutes)
 */
export function isUserActive(lastActivity: string): boolean {
  const now = new Date()
  const activity = new Date(lastActivity)
  const diffMs = now.getTime() - activity.getTime()
  return diffMs < 5 * 60 * 1000 // 5 minutes
}

/**
 * Detect field-level conflicts between local and remote data
 */
function detectFieldConflicts(
  localData: Record<string, unknown>,
  remoteData: Record<string, unknown>
): FieldConflict[] {
  const conflicts: FieldConflict[] = []
  const allKeys = new Set([...Object.keys(localData), ...Object.keys(remoteData)])
  
  for (const key of allKeys) {
    const localValue = localData[key]
    const remoteValue = remoteData[key]
    
    // Skip if values are equal
    if (JSON.stringify(localValue) === JSON.stringify(remoteValue)) {
      continue
    }
    
    conflicts.push({
      field: key,
      localValue,
      remoteValue,
    })
  }
  
  return conflicts
}

/**
 * Auto-merge data by combining non-conflicting fields
 * For conflicting fields, prefer the remote value (last-write-wins for conflicts)
 */
function autoMergeData(
  localData: Record<string, unknown>,
  remoteData: Record<string, unknown>,
  fieldConflicts: FieldConflict[]
): Record<string, unknown> {
  const conflictingFields = new Set(fieldConflicts.map(c => c.field))
  const merged: Record<string, unknown> = {}
  
  // Start with remote data as base
  Object.assign(merged, remoteData)
  
  // Add local fields that don't conflict
  for (const [key, value] of Object.entries(localData)) {
    if (!conflictingFields.has(key)) {
      merged[key] = value
    }
  }
  
  return merged
}

/**
 * Create a manual merge of conflicting data
 */
export function createMergedData(
  localData: Record<string, unknown>,
  remoteData: Record<string, unknown>,
  fieldResolutions: Record<string, 'local' | 'remote'>
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  const allKeys = new Set([...Object.keys(localData), ...Object.keys(remoteData)])
  
  for (const key of allKeys) {
    const resolution = fieldResolutions[key]
    
    if (resolution === 'local') {
      merged[key] = localData[key]
    } else if (resolution === 'remote') {
      merged[key] = remoteData[key]
    } else {
      // Default to remote for unspecified fields
      merged[key] = key in remoteData ? remoteData[key] : localData[key]
    }
  }
  
  return merged
}
