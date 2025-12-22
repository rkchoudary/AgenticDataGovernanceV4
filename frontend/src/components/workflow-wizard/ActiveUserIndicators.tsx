/**
 * ActiveUserIndicators Component
 * 
 * Displays active users working on the workflow with their current position.
 * Shows avatars, names, and which step each user is working on.
 * 
 * Requirements: 13.4 - Display who is working on which step
 */

import { Users, Circle } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { ActiveUser, PHASE_CONFIG, Phase } from '@/types/workflow-wizard'
import { getUserInitials, formatLastActivity, isUserActive } from '@/services/collaborationService'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ActiveUserIndicatorsProps {
  activeUsers: ActiveUser[]
  currentUserId?: string
  variant?: 'sidebar' | 'compact' | 'inline'
  maxDisplay?: number
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function ActiveUserIndicators({
  activeUsers,
  currentUserId,
  variant = 'sidebar',
  maxDisplay = 5,
  className,
}: ActiveUserIndicatorsProps) {
  // Filter out current user
  const otherUsers = activeUsers.filter(u => u.userId !== currentUserId)
  
  if (otherUsers.length === 0) {
    return null
  }

  if (variant === 'compact') {
    return <CompactIndicator users={otherUsers} maxDisplay={maxDisplay} className={className} />
  }

  if (variant === 'inline') {
    return <InlineIndicator users={otherUsers} maxDisplay={maxDisplay} className={className} />
  }

  return <SidebarIndicator users={otherUsers} className={className} />
}

// ============================================================================
// Sidebar Variant (Full display in context sidebar)
// ============================================================================

function SidebarIndicator({ 
  users, 
  className 
}: { 
  users: ActiveUser[]
  className?: string 
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Active Users
          <Badge variant="secondary" className="ml-auto">
            {users.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map(user => (
          <UserCard key={user.userId} user={user} />
        ))}
      </CardContent>
    </Card>
  )
}

function UserCard({ user }: { user: ActiveUser }) {
  const active = isUserActive(user.lastActivity)
  const phaseName = PHASE_CONFIG[user.currentPhase]?.name || user.currentPhase
  
  return (
    <div className="flex items-start gap-3">
      <div className="relative">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatarUrl} alt={user.userName} />
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {getUserInitials(user.userName)}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator */}
        <Circle 
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-current",
            active ? "text-green-500" : "text-gray-400"
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{user.userName}</p>
        <p className="text-xs text-muted-foreground truncate">
          {phaseName}
          {user.currentStep && ` • ${formatStepName(user.currentStep)}`}
        </p>
        <p className="text-xs text-muted-foreground/70">
          {formatLastActivity(user.lastActivity)}
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Compact Variant (Avatar stack)
// ============================================================================

function CompactIndicator({ 
  users, 
  maxDisplay,
  className 
}: { 
  users: ActiveUser[]
  maxDisplay: number
  className?: string 
}) {
  const displayUsers = users.slice(0, maxDisplay)
  const remainingCount = users.length - maxDisplay

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-2">
        {displayUsers.map(user => (
          <Tooltip key={user.userId}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Avatar className="h-7 w-7 border-2 border-background">
                  <AvatarImage src={user.avatarUrl} alt={user.userName} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getUserInitials(user.userName)}
                  </AvatarFallback>
                </Avatar>
                {isUserActive(user.lastActivity) && (
                  <Circle className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 fill-green-500 text-green-500" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="text-xs">
                <p className="font-medium">{user.userName}</p>
                <p className="text-muted-foreground">
                  {PHASE_CONFIG[user.currentPhase]?.name}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {remainingCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar className="h-7 w-7 border-2 border-background">
                <AvatarFallback className="text-xs bg-muted">
                  +{remainingCount}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="text-xs">{remainingCount} more users</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <span className="ml-2 text-xs text-muted-foreground">
        {users.length} active
      </span>
    </div>
  )
}

// ============================================================================
// Inline Variant (For header or toolbar)
// ============================================================================

function InlineIndicator({ 
  users, 
  maxDisplay,
  className 
}: { 
  users: ActiveUser[]
  maxDisplay: number
  className?: string 
}) {
  const displayUsers = users.slice(0, maxDisplay)
  const remainingCount = users.length - maxDisplay

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Users className="h-4 w-4 text-muted-foreground" />
      <div className="flex -space-x-1.5">
        {displayUsers.map(user => (
          <Tooltip key={user.userId}>
            <TooltipTrigger asChild>
              <Avatar className="h-6 w-6 border border-background">
                <AvatarImage src={user.avatarUrl} alt={user.userName} />
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                  {getUserInitials(user.userName)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <div className="text-xs">
                <p className="font-medium">{user.userName}</p>
                <p className="text-muted-foreground">
                  {PHASE_CONFIG[user.currentPhase]?.name}
                  {user.currentStep && ` • ${formatStepName(user.currentStep)}`}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
        {remainingCount > 0 && (
          <Avatar className="h-6 w-6 border border-background">
            <AvatarFallback className="text-[10px] bg-muted">
              +{remainingCount}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Step Indicator (Shows who is on a specific step)
// ============================================================================

export interface StepUserIndicatorProps {
  users: ActiveUser[]
  stepId: string
  phase: Phase
  className?: string
}

export function StepUserIndicator({
  users,
  stepId,
  phase,
  className,
}: StepUserIndicatorProps) {
  const usersOnStep = users.filter(
    u => u.currentPhase === phase && u.currentStep === stepId
  )

  if (usersOnStep.length === 0) {
    return null
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <div className="flex -space-x-1">
        {usersOnStep.slice(0, 3).map(user => (
          <Tooltip key={user.userId}>
            <TooltipTrigger asChild>
              <Avatar className="h-5 w-5 border border-background">
                <AvatarImage src={user.avatarUrl} alt={user.userName} />
                <AvatarFallback className="text-[9px] bg-amber-100 text-amber-700">
                  {getUserInitials(user.userName)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="text-xs font-medium">{user.userName}</p>
              <p className="text-xs text-muted-foreground">Currently editing</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {usersOnStep.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{usersOnStep.length - 3}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatStepName(stepId: string): string {
  return stepId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
