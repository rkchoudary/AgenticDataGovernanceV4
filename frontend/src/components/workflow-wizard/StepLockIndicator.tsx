/**
 * StepLockIndicator Component
 * 
 * Displays a lock indicator when a step is being edited by another user.
 * Prevents concurrent edits by showing who has the lock.
 * 
 * Requirements: 13.5 - Detect concurrent edits
 */

import { Lock, Unlock } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { StepLock } from '@/types/workflow-wizard'
import { getUserInitials, formatLastActivity } from '@/services/collaborationService'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface StepLockIndicatorProps {
  lock: StepLock | null
  currentUserId?: string
  userName?: string
  userAvatarUrl?: string
  className?: string
}

export interface LockStatusBadgeProps {
  isLocked: boolean
  isOwnLock: boolean
  lockedBy?: string
  expiresAt?: string
  className?: string
}

// ============================================================================
// Step Lock Indicator Component
// ============================================================================

export function StepLockIndicator({
  lock,
  currentUserId,
  userName,
  userAvatarUrl,
  className,
}: StepLockIndicatorProps) {
  if (!lock) {
    return null
  }

  const isOwnLock = lock.lockedBy === currentUserId
  const displayName = userName || `User ${lock.lockedBy.slice(-4)}`
  const expiresIn = getExpiresIn(lock.expiresAt)

  if (isOwnLock) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
            "bg-blue-100 text-blue-700 text-xs font-medium",
            className
          )}>
            <Lock className="h-3 w-3" />
            <span>You're editing</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Lock expires in {expiresIn}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full",
          "bg-amber-100 text-amber-700 text-xs font-medium",
          className
        )}>
          <Lock className="h-3 w-3" />
          <Avatar className="h-4 w-4">
            <AvatarImage src={userAvatarUrl} alt={displayName} />
            <AvatarFallback className="text-[8px]">
              {getUserInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span>{displayName} is editing</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs space-y-1">
          <p className="font-medium">{displayName} is currently editing this step</p>
          <p className="text-muted-foreground">Lock expires in {expiresIn}</p>
          <p className="text-muted-foreground">Please wait or contact them to release the lock</p>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ============================================================================
// Lock Status Badge Component
// ============================================================================

export function LockStatusBadge({
  isLocked,
  isOwnLock,
  lockedBy,
  expiresAt,
  className,
}: LockStatusBadgeProps) {
  if (!isLocked) {
    return (
      <Badge variant="outline" className={cn("gap-1", className)}>
        <Unlock className="h-3 w-3" />
        Available
      </Badge>
    )
  }

  if (isOwnLock) {
    return (
      <Badge variant="default" className={cn("gap-1 bg-blue-500", className)}>
        <Lock className="h-3 w-3" />
        Editing
      </Badge>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className={cn("gap-1 bg-amber-100 text-amber-700", className)}>
          <Lock className="h-3 w-3" />
          Locked
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <p>Locked by {lockedBy}</p>
          {expiresAt && <p>Expires {formatLastActivity(expiresAt)}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ============================================================================
// Lock Warning Banner
// ============================================================================

export interface LockWarningBannerProps {
  lock: StepLock
  userName?: string
  onRequestRelease?: () => void
  className?: string
}

export function LockWarningBanner({
  lock,
  userName,
  onRequestRelease,
  className,
}: LockWarningBannerProps) {
  const displayName = userName || `User ${lock.lockedBy.slice(-4)}`
  const expiresIn = getExpiresIn(lock.expiresAt)

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg",
      "bg-amber-50 border border-amber-200",
      className
    )}>
      <Lock className="h-5 w-5 text-amber-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800">
          This step is being edited by {displayName}
        </p>
        <p className="text-xs text-amber-700 mt-0.5">
          Lock expires in {expiresIn}. You can view but not edit until the lock is released.
        </p>
      </div>
      {onRequestRelease && (
        <button
          onClick={onRequestRelease}
          className="text-xs text-amber-700 hover:text-amber-900 underline flex-shrink-0"
        >
          Request release
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function getExpiresIn(expiresAt: string): string {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()
  
  if (diffMs <= 0) return 'expired'
  
  const diffMins = Math.ceil(diffMs / 60000)
  if (diffMins < 60) return `${diffMins} min`
  
  const diffHours = Math.floor(diffMins / 60)
  return `${diffHours}h ${diffMins % 60}m`
}
