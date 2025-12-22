import { useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface WorkflowStep {
  id: string
  name: string
  description?: string
  status: 'completed' | 'current' | 'pending' | 'blocked'
  completedAt?: string
  completedBy?: string
  estimatedDuration?: string
  substeps?: {
    id: string
    name: string
    status: 'completed' | 'current' | 'pending' | 'blocked'
    completedAt?: string
  }[]
  blockedReason?: string
}

interface WorkflowFlowchartProps {
  steps: WorkflowStep[]
  onStepClick?: (step: WorkflowStep) => void
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

const statusIcons = {
  completed: CheckCircle2,
  current: Loader2,
  pending: Circle,
  blocked: AlertTriangle,
}

const statusColors = {
  completed: {
    bg: 'bg-green-500',
    border: 'border-green-500',
    text: 'text-green-500',
    iconBg: 'bg-green-100',
  },
  current: {
    bg: 'bg-blue-500',
    border: 'border-blue-500',
    text: 'text-blue-500',
    iconBg: 'bg-blue-100',
  },
  pending: {
    bg: 'bg-gray-300',
    border: 'border-gray-300',
    text: 'text-gray-400',
    iconBg: 'bg-gray-100',
  },
  blocked: {
    bg: 'bg-red-500',
    border: 'border-red-500',
    text: 'text-red-500',
    iconBg: 'bg-red-100',
  },
}

export function WorkflowFlowchart({
  steps,
  onStepClick,
  orientation = 'horizontal',
  className,
}: WorkflowFlowchartProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const toggleExpand = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  const completedCount = steps.filter((s) => s.status === 'completed').length
  const progress = Math.round((completedCount / steps.length) * 100)

  if (orientation === 'vertical') {
    return (
      <div className={cn('space-y-4', className)}>
        {/* Progress Summary */}
        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-muted-foreground">
            {completedCount} of {steps.length} steps completed
          </span>
          <span className="font-medium">{progress}%</span>
        </div>

        {/* Vertical Steps */}
        <div className="relative">
          {steps.map((step, index) => {
            const Icon = statusIcons[step.status]
            const colors = statusColors[step.status]
            const isExpanded = expandedSteps.has(step.id)
            const hasSubsteps = step.substeps && step.substeps.length > 0

            return (
              <div key={step.id} className="relative">
                {/* Connector Line */}
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'absolute left-5 top-12 w-0.5 h-full -translate-x-1/2',
                      step.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
                    )}
                  />
                )}

                {/* Step Card */}
                <div
                  className={cn(
                    'relative flex gap-4 pb-8 cursor-pointer group',
                    index === steps.length - 1 && 'pb-0'
                  )}
                  onClick={() => onStepClick?.(step)}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center border-2 z-10 transition-transform group-hover:scale-110',
                      colors.border,
                      step.status === 'completed' || step.status === 'current'
                        ? colors.bg + ' text-white'
                        : 'bg-white'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-5 w-5',
                        step.status === 'current' && 'animate-spin',
                        step.status === 'pending' && colors.text
                      )}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <Card
                      className={cn(
                        'transition-shadow hover:shadow-md',
                        step.status === 'current' && 'ring-2 ring-blue-500',
                        step.status === 'blocked' && 'border-red-300 bg-red-50'
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-semibold">{step.name}</h4>
                            {step.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {step.description}
                              </p>
                            )}
                          </div>
                          {hasSubsteps && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleExpand(step.id)
                              }}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                        </div>

                        {/* Meta Info */}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          {step.completedAt && (
                            <span>Completed: {step.completedAt}</span>
                          )}
                          {step.completedBy && (
                            <span>By: {step.completedBy}</span>
                          )}
                          {step.estimatedDuration && step.status === 'pending' && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Est: {step.estimatedDuration}
                            </span>
                          )}
                        </div>

                        {/* Blocked Reason */}
                        {step.status === 'blocked' && step.blockedReason && (
                          <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-700">
                            <AlertTriangle className="h-4 w-4 inline mr-1" />
                            {step.blockedReason}
                          </div>
                        )}

                        {/* Substeps */}
                        {hasSubsteps && isExpanded && (
                          <div className="mt-4 space-y-2 border-t pt-4">
                            {step.substeps!.map((substep) => {
                              const SubIcon = statusIcons[substep.status]
                              const subColors = statusColors[substep.status]
                              return (
                                <div
                                  key={substep.id}
                                  className="flex items-center gap-2"
                                >
                                  <SubIcon
                                    className={cn(
                                      'h-4 w-4',
                                      subColors.text,
                                      substep.status === 'current' && 'animate-spin'
                                    )}
                                  />
                                  <span className="text-sm">{substep.name}</span>
                                  {substep.completedAt && (
                                    <span className="text-xs text-muted-foreground ml-auto">
                                      {substep.completedAt}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Horizontal orientation
  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress Bar */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-medium">{progress}%</span>
      </div>

      {/* Horizontal Steps */}
      <div className="flex items-start overflow-x-auto pb-4">
        {steps.map((step, index) => {
          const Icon = statusIcons[step.status]
          const colors = statusColors[step.status]

          return (
            <div key={step.id} className="flex items-start">
              {/* Step */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className="flex flex-col items-center cursor-pointer group"
                    onClick={() => onStepClick?.(step)}
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center border-2 transition-transform group-hover:scale-110',
                        colors.border,
                        step.status === 'completed' || step.status === 'current'
                          ? colors.bg + ' text-white'
                          : 'bg-white'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-6 w-6',
                          step.status === 'current' && 'animate-spin',
                          step.status === 'pending' && colors.text
                        )}
                      />
                    </div>

                    {/* Label */}
                    <span
                      className={cn(
                        'mt-2 text-sm font-medium text-center max-w-24',
                        step.status === 'current'
                          ? 'text-blue-600'
                          : step.status === 'completed'
                          ? 'text-green-600'
                          : 'text-muted-foreground'
                      )}
                    >
                      {step.name}
                    </span>

                    {/* Status Badge */}
                    {step.status === 'blocked' && (
                      <span className="mt-1 text-xs text-red-500 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Blocked
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-medium">{step.name}</p>
                    {step.description && (
                      <p className="text-xs">{step.description}</p>
                    )}
                    {step.completedAt && (
                      <p className="text-xs text-muted-foreground">
                        Completed: {step.completedAt}
                      </p>
                    )}
                    {step.blockedReason && (
                      <p className="text-xs text-red-500">{step.blockedReason}</p>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>

              {/* Connector */}
              {index < steps.length - 1 && (
                <div className="flex items-center px-2 pt-5">
                  <div
                    className={cn(
                      'w-16 h-0.5',
                      step.status === 'completed' ? 'bg-green-500' : 'bg-gray-200'
                    )}
                  />
                  <ArrowRight
                    className={cn(
                      'h-4 w-4 -ml-1',
                      step.status === 'completed'
                        ? 'text-green-500'
                        : 'text-gray-300'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WorkflowFlowchart
