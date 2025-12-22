/**
 * useCollaboration Hook
 * 
 * React hook for managing collaboration state in the workflow wizard.
 * Provides active user tracking, step locking, and conflict detection.
 * 
 * Requirements: 13.4, 13.5
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  ActiveUser, 
  StepLock, 
  PendingChange, 
  Phase 
} from '@/types/workflow-wizard'
import { 
  collaborationService, 
  ConflictInfo,
  CollaborationEvent,
  VersionedData,
  createMergedData,
} from '@/services/collaborationService'

// ============================================================================
// Types
// ============================================================================

export interface UseCollaborationOptions {
  cycleId: string
  userId: string
  enabled?: boolean
}

export interface UseCollaborationReturn {
  // State
  activeUsers: ActiveUser[]
  locks: StepLock[]
  pendingChanges: PendingChange[]
  conflicts: ConflictInfo[]
  isConnected: boolean
  isLoading: boolean
  error: Error | null
  
  // Actions
  updatePosition: (phase: Phase, stepId?: string) => Promise<void>
  acquireLock: (stepId: string) => Promise<{ success: boolean; existingLock?: StepLock }>
  releaseLock: (stepId: string) => Promise<void>
  checkConflicts: (stepId: string, localVersion: number, localData: Record<string, unknown>) => Promise<{ hasConflict: boolean; conflict?: ConflictInfo }>
  resolveConflict: (conflictId: string, resolution: 'keep_local' | 'keep_remote' | 'merge', conflict: ConflictInfo, mergedData?: Record<string, unknown>) => Promise<{ success: boolean; resolvedData: Record<string, unknown>; newVersion: number }>
  dismissConflict: (conflictId: string) => void
  getStepVersion: (stepId: string) => Promise<VersionedData | null>
  updateStepData: (stepId: string, data: Record<string, unknown>, expectedVersion: number) => Promise<{ success: boolean; newVersion?: number; conflict?: ConflictInfo }>
  createMerge: (localData: Record<string, unknown>, remoteData: Record<string, unknown>, fieldResolutions: Record<string, 'local' | 'remote'>) => Record<string, unknown>
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useCollaboration({
  cycleId,
  userId,
  enabled = true,
}: UseCollaborationOptions): UseCollaborationReturn {
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Initialize collaboration service
  useEffect(() => {
    if (!enabled || !cycleId || !userId) return

    const init = async () => {
      try {
        await collaborationService.initialize(cycleId, userId)
        setIsConnected(true)
      } catch (error) {
        console.error('Failed to initialize collaboration:', error)
        setIsConnected(false)
      }
    }

    init()

    // Subscribe to collaboration events
    unsubscribeRef.current = collaborationService.subscribe((event: CollaborationEvent) => {
      handleCollaborationEvent(event)
    })

    return () => {
      collaborationService.disconnect()
      setIsConnected(false)
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
    }
  }, [cycleId, userId, enabled])

  // Handle collaboration events
  const handleCollaborationEvent = useCallback((event: CollaborationEvent) => {
    switch (event.type) {
      case 'user_joined':
      case 'user_left':
      case 'user_moved':
        queryClient.invalidateQueries({ queryKey: ['collaboration', 'users', cycleId] })
        break
      case 'step_locked':
      case 'step_unlocked':
        queryClient.invalidateQueries({ queryKey: ['collaboration', 'locks', cycleId] })
        break
      case 'conflict_detected':
        const conflict = event.payload as ConflictInfo
        setConflicts(prev => [...prev, conflict])
        break
    }
  }, [cycleId, queryClient])

  // Query active users
  // Requirement 13.4: Display who is working on which step
  const { 
    data: activeUsers = [], 
    isLoading: isLoadingUsers,
    error: usersError,
  } = useQuery({
    queryKey: ['collaboration', 'users', cycleId],
    queryFn: () => collaborationService.getActiveUsers(cycleId),
    enabled: enabled && isConnected,
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 5000,
  })

  // Query locks
  const { 
    data: locks = [],
    isLoading: isLoadingLocks,
  } = useQuery({
    queryKey: ['collaboration', 'locks', cycleId],
    queryFn: () => collaborationService.getLocks(cycleId),
    enabled: enabled && isConnected,
    refetchInterval: 5000,
    staleTime: 2000,
  })

  // Query pending changes
  const {
    data: pendingChanges = [],
  } = useQuery({
    queryKey: ['collaboration', 'changes', cycleId],
    queryFn: () => collaborationService.getPendingChanges(cycleId),
    enabled: enabled && isConnected,
    refetchInterval: 5000,
  })

  // Update position mutation
  const updatePositionMutation = useMutation({
    mutationFn: ({ phase, stepId }: { phase: Phase; stepId?: string }) =>
      collaborationService.updateUserPosition(cycleId, phase, stepId),
  })

  // Acquire lock mutation
  const acquireLockMutation = useMutation({
    mutationFn: (stepId: string) => collaborationService.acquireLock(cycleId, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration', 'locks', cycleId] })
    },
  })

  // Release lock mutation
  const releaseLockMutation = useMutation({
    mutationFn: (stepId: string) => collaborationService.releaseLock(cycleId, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboration', 'locks', cycleId] })
    },
  })

  // Resolve conflict mutation
  const resolveConflictMutation = useMutation({
    mutationFn: ({ 
      conflictId, 
      resolution,
      conflict,
      mergedData 
    }: { 
      conflictId: string
      resolution: 'keep_local' | 'keep_remote' | 'merge'
      conflict: ConflictInfo
      mergedData?: Record<string, unknown> 
    }) => collaborationService.resolveConflict(cycleId, conflictId, resolution, conflict, mergedData),
    onSuccess: (_, variables) => {
      setConflicts(prev => prev.filter(c => c.id !== variables.conflictId))
      queryClient.invalidateQueries({ queryKey: ['collaboration', 'changes', cycleId] })
    },
  })

  // ============================================================================
  // Actions
  // ============================================================================

  const updatePosition = useCallback(async (phase: Phase, stepId?: string) => {
    await updatePositionMutation.mutateAsync({ phase, stepId })
  }, [updatePositionMutation])

  const acquireLock = useCallback(async (stepId: string) => {
    const result = await acquireLockMutation.mutateAsync(stepId)
    return { success: result.success, existingLock: result.existingLock }
  }, [acquireLockMutation])

  const releaseLock = useCallback(async (stepId: string) => {
    await releaseLockMutation.mutateAsync(stepId)
  }, [releaseLockMutation])

  const checkConflicts = useCallback(async (stepId: string, localVersion: number, localData: Record<string, unknown>) => {
    const result = await collaborationService.checkForConflicts(cycleId, stepId, localVersion, localData)
    if (result.hasConflict && result.conflict) {
      setConflicts(prev => [...prev, result.conflict!])
    }
    return result
  }, [cycleId])

  const resolveConflict = useCallback(async (
    conflictId: string, 
    resolution: 'keep_local' | 'keep_remote' | 'merge',
    conflict: ConflictInfo,
    mergedData?: Record<string, unknown>
  ) => {
    return resolveConflictMutation.mutateAsync({ conflictId, resolution, conflict, mergedData })
  }, [resolveConflictMutation])

  const dismissConflict = useCallback((conflictId: string) => {
    setConflicts(prev => prev.filter(c => c.id !== conflictId))
  }, [])

  const getStepVersion = useCallback(async (stepId: string) => {
    return collaborationService.getStepVersion(cycleId, stepId)
  }, [cycleId])

  const updateStepData = useCallback(async (
    stepId: string,
    data: Record<string, unknown>,
    expectedVersion: number
  ) => {
    const result = await collaborationService.updateStepData(cycleId, stepId, data, expectedVersion)
    if (!result.success && result.conflict) {
      setConflicts(prev => [...prev, result.conflict!])
    }
    return result
  }, [cycleId])

  const createMerge = useCallback((
    localData: Record<string, unknown>,
    remoteData: Record<string, unknown>,
    fieldResolutions: Record<string, 'local' | 'remote'>
  ) => {
    return createMergedData(localData, remoteData, fieldResolutions)
  }, [])

  return {
    activeUsers,
    locks,
    pendingChanges,
    conflicts,
    isConnected,
    isLoading: isLoadingUsers || isLoadingLocks,
    error: usersError as Error | null,
    updatePosition,
    acquireLock,
    releaseLock,
    checkConflicts,
    resolveConflict,
    dismissConflict,
    getStepVersion,
    updateStepData,
    createMerge,
  }
}
