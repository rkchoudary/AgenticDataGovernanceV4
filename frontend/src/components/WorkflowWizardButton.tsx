import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Workflow, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useCycle } from '@/hooks/useCycles'
import { useAuthStore } from '@/stores'

export interface WorkflowWizardButtonProps {
  cycleId?: string
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
  disabled?: boolean
}

export function WorkflowWizardButton({
  cycleId = '1',
  variant = 'default',
  size = 'lg',
  className,
  disabled = false,
  ...props
}: WorkflowWizardButtonProps) {
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuthStore()
  
  // Check if cycle exists and get its status
  const { data: cycle, isLoading: cycleLoading, error: cycleError } = useCycle(cycleId)
  
  // Determine if user has permission to access workflow wizard
  const hasPermission = React.useMemo(() => {
    if (!user || !isAuthenticated) return false
    
    // Only certain roles can access the workflow wizard
    const allowedRoles = ['admin', 'compliance_officer', 'data_steward', 'data_owner']
    return allowedRoles.includes(user.role)
  }, [user, isAuthenticated])
  
  // Determine button state based on various conditions
  const buttonState = React.useMemo(() => {
    // If not authenticated, show button but disabled (for visibility/discoverability)
    if (!isAuthenticated) {
      return { visible: true, disabled: true, tooltip: 'Please log in to access the workflow wizard' }
    }
    
    // If no permission, disable button
    if (!hasPermission) {
      return { 
        visible: true, 
        disabled: true, 
        tooltip: 'Insufficient permissions to access workflow wizard' 
      }
    }
    
    // If cycle is loading, disable button temporarily
    if (cycleLoading) {
      return { 
        visible: true, 
        disabled: true, 
        tooltip: 'Loading cycle information...' 
      }
    }
    
    // If cycle doesn't exist or there's an error, show warning state
    if (cycleError || !cycle) {
      return { 
        visible: true, 
        disabled: false, 
        tooltip: `Cycle ${cycleId} may not exist. Click to attempt navigation.`,
        warning: true
      }
    }
    
    // If cycle is completed or cancelled, show informational state
    if (cycle.status === 'completed' || cycle.status === 'cancelled') {
      return { 
        visible: true, 
        disabled: false, 
        tooltip: `Cycle ${cycleId} is ${cycle.status}. Click to view details.`,
        warning: true
      }
    }
    
    // Normal state - cycle exists and is accessible
    return { 
      visible: true, 
      disabled: false, 
      tooltip: `Start workflow wizard for ${cycle.reportName || `Cycle ${cycleId}`}`
    }
  }, [isAuthenticated, hasPermission, cycleLoading, cycleError, cycle, cycleId])
  
  // Don't render if not visible (e.g., not authenticated)
  if (!buttonState.visible) {
    return null
  }

  const handleClick = () => {
    if (!buttonState.disabled && !disabled) {
      try {
        // Preserve current authentication state by ensuring token is still valid
        if (!isAuthenticated || !user) {
          console.warn('Authentication state lost during navigation')
          return
        }
        
        navigate(`/cycles/${cycleId}/wizard`)
      } catch (error) {
        console.error('Navigation error:', error)
        // Could add toast notification here for user feedback
      }
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    // Handle Enter and Space keys for accessibility
    if ((event.key === 'Enter' || event.key === ' ') && !buttonState.disabled && !disabled) {
      event.preventDefault()
      event.stopPropagation()
      handleClick()
    }
  }

  const isDisabled = disabled || buttonState.disabled
  const showWarning = buttonState.warning && !isDisabled

  const buttonContent = (
    <Button
      variant={showWarning ? 'outline' : variant}
      size={size}
      className={cn(
        // Base styling with consistent spacing
        'gap-2 font-semibold transition-all duration-200',
        // Enhanced hover and focus states
        'hover:scale-[1.02] active:scale-[0.98]',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        // Mobile responsiveness
        'w-full sm:w-auto min-w-[200px]',
        // Large size specific enhancements
        size === 'lg' && 'px-6 py-3 text-base',
        // Warning state with design system colors
        showWarning && [
          'border-yellow-500/60 text-yellow-700 bg-yellow-50/50',
          'hover:border-yellow-500 hover:bg-yellow-50 hover:text-yellow-800',
          'focus-visible:ring-yellow-500/50',
          'dark:border-yellow-400/60 dark:text-yellow-300 dark:bg-yellow-950/50',
          'dark:hover:border-yellow-400 dark:hover:bg-yellow-950 dark:hover:text-yellow-200'
        ],
        // Primary variant enhancements
        variant === 'default' && !showWarning && [
          'bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg',
          'focus-visible:ring-primary/50'
        ],
        // Disabled state
        isDisabled && 'cursor-not-allowed opacity-50 hover:scale-100',
        className
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={isDisabled}
      aria-label={buttonState.tooltip}
      aria-describedby={isDisabled ? undefined : 'workflow-wizard-description'}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      {...props}
    >
      {showWarning ? (
        <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      ) : (
        <Workflow className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">Start Workflow Wizard</span>
      {!isDisabled && (
        <span id="workflow-wizard-description" className="sr-only">
          Press Enter or Space to navigate to the workflow wizard
        </span>
      )}
    </Button>
  )

  // Wrap with tooltip if there's a tooltip message
  if (buttonState.tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {buttonContent}
          </TooltipTrigger>
          <TooltipContent>
            <p>{buttonState.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return buttonContent
}