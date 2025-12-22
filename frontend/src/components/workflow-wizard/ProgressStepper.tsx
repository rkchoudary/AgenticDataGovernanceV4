/**
 * ProgressStepper Component
 * 
 * Horizontal progress stepper showing all 9 phases with status indicators.
 * Supports navigation to completed phases and shows blocking conditions.
 * 
 * Requirements: 1.1, 1.3, 1.4
 */

import {
  FileSearch,
  Database,
  Target,
  CheckSquare,
  GitBranch,
  AlertTriangle,
  Shield,
  FileText,
  Award,
  Check,
  Lock,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Phase, PhaseState, ProgressStepperProps, PHASE_CONFIG } from '@/types/workflow-wizard'
import { cn } from '@/lib/utils'

const PHASE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileSearch,
  Database,
  Target,
  CheckSquare,
  GitBranch,
  AlertTriangle,
  Shield,
  FileText,
  Award,
}

function getPhaseIcon(iconName: string) {
  return PHASE_ICONS[iconName] || FileText
}

function getStepperStatus(phase: PhaseState, currentPhase: Phase): 'pending' | 'current' | 'completed' | 'blocked' {
  if (phase.status === 'blocked') return 'blocked'
  if (phase.status === 'completed') return 'completed'
  if (phase.id === currentPhase) return 'current'
  return 'pending'
}

export function ProgressStepper({
  phases,
  currentPhase,
  onPhaseClick,
  isMobile = false,
}: ProgressStepperProps) {
  if (isMobile) {
    return <MobileProgressStepper phases={phases} currentPhase={currentPhase} onPhaseClick={onPhaseClick} />
  }

  return (
    <TooltipProvider>
      <div className="flex items-center justify-between w-full">
        {phases.map((phase, index) => {
          const config = PHASE_CONFIG[phase.id]
          const Icon = getPhaseIcon(config.icon)
          const status = getStepperStatus(phase, currentPhase)
          const isClickable = status === 'completed' || status === 'current'
          const isLast = index === phases.length - 1

          return (
            <div key={phase.id} className="flex items-center flex-1">
              {/* Phase Indicator */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => isClickable && onPhaseClick(phase.id)}
                    disabled={!isClickable}
                    className={cn(
                      'relative flex flex-col items-center gap-1 group',
                      isClickable ? 'cursor-pointer' : 'cursor-not-allowed'
                    )}
                  >
                    {/* Icon Circle */}
                    <div
                      className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-full transition-all',
                        status === 'completed' && 'bg-primary text-primary-foreground',
                        status === 'current' && 'bg-primary/20 text-primary border-2 border-primary',
                        status === 'pending' && 'bg-muted text-muted-foreground',
                        status === 'blocked' && 'bg-destructive/20 text-destructive border-2 border-destructive',
                        isClickable && 'group-hover:scale-110'
                      )}
                    >
                      {status === 'completed' ? (
                        <Check className="h-5 w-5" />
                      ) : status === 'blocked' ? (
                        <Lock className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>

                    {/* Phase Label */}
                    <span
                      className={cn(
                        'text-xs font-medium text-center max-w-[80px] truncate',
                        status === 'current' && 'text-primary',
                        status === 'completed' && 'text-primary',
                        status === 'pending' && 'text-muted-foreground',
                        status === 'blocked' && 'text-destructive'
                      )}
                    >
                      {config.name}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{config.name}</p>
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                    {status === 'blocked' && phase.blockingReason && (
                      <p className="text-xs text-destructive mt-2">
                        Blocked: {phase.blockingReason}
                      </p>
                    )}
                    {status === 'completed' && (
                      <p className="text-xs text-primary mt-2">✓ Completed</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Est. {config.estimatedMinutes} min
                    </p>
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* Connector Line */}
              {!isLast && (
                <div className="flex-1 mx-2">
                  <div
                    className={cn(
                      'h-0.5 transition-colors',
                      status === 'completed' ? 'bg-primary' : 'bg-muted'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </TooltipProvider>
  )
}

/**
 * Mobile-optimized progress stepper showing current and adjacent phases
 * Requirements: 15.2
 */
function MobileProgressStepper({
  phases,
  currentPhase,
  onPhaseClick,
}: Omit<ProgressStepperProps, 'isMobile'>) {
  const currentIndex = phases.findIndex(p => p.id === currentPhase)
  
  // Show current phase and one on each side
  const visiblePhases = phases.filter((_, index) => {
    return Math.abs(index - currentIndex) <= 1
  })

  return (
    <div className="flex items-center justify-center gap-4">
      {/* Previous indicator */}
      {currentIndex > 1 && (
        <span className="text-xs text-muted-foreground">
          +{currentIndex - 1} more
        </span>
      )}

      {visiblePhases.map((phase) => {
        const config = PHASE_CONFIG[phase.id]
        const Icon = getPhaseIcon(config.icon)
        const status = getStepperStatus(phase, currentPhase)
        const isClickable = status === 'completed' || status === 'current'

        return (
          <button
            key={phase.id}
            onClick={() => isClickable && onPhaseClick(phase.id)}
            disabled={!isClickable}
            className={cn(
              'flex flex-col items-center gap-1',
              isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full',
                status === 'completed' && 'bg-primary text-primary-foreground',
                status === 'current' && 'bg-primary/20 text-primary border-2 border-primary',
                status === 'pending' && 'bg-muted text-muted-foreground',
                status === 'blocked' && 'bg-destructive/20 text-destructive'
              )}
            >
              {status === 'completed' ? (
                <Check className="h-4 w-4" />
              ) : status === 'blocked' ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </div>
            <span className="text-[10px] font-medium max-w-[60px] truncate">
              {config.name}
            </span>
          </button>
        )
      })}

      {/* Next indicator */}
      {currentIndex < phases.length - 2 && (
        <span className="text-xs text-muted-foreground">
          +{phases.length - currentIndex - 2} more
        </span>
      )}
    </div>
  )
}
