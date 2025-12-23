/**
 * HumanGateDialog Component
 *
 * Dialog component for human approval gates in the AI Assistant.
 * Displays action details, impact assessment, and AI rationale,
 * allowing users to approve, reject, or defer critical actions.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Sparkles,
  Shield,
  Info,
  Loader2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type HumanGateDecision = 'approved' | 'rejected' | 'deferred'

export interface HumanGateAction {
  id: string
  type: 'approval' | 'sign_off' | 'mapping_change' | 'ownership_change' | 'control_effectiveness'
  title: string
  description: string
  impact: string
  requiredRole: string
  entityType: string
  entityId: string
  proposedChanges?: Record<string, unknown>
  aiRationale: string
  toolName?: string
  toolParameters?: Record<string, unknown>
  createdAt: Date
  expiresAt?: Date
}

export interface HumanGateDialogProps {
  action: HumanGateAction | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDecision: (actionId: string, decision: HumanGateDecision, rationale: string) => void
  isProcessing?: boolean
  minRationaleLength?: number
}

// ============================================================================
// Constants
// ============================================================================

const ACTION_TYPE_CONFIG: Record<HumanGateAction['type'], {
  icon: React.ReactNode
  color: string
  label: string
}> = {
  approval: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-blue-600 bg-blue-100',
    label: 'Approval Required',
  },
  sign_off: {
    icon: <Shield className="h-5 w-5" />,
    color: 'text-purple-600 bg-purple-100',
    label: 'Sign-Off Required',
  },
  mapping_change: {
    icon: <Info className="h-5 w-5" />,
    color: 'text-orange-600 bg-orange-100',
    label: 'Mapping Change',
  },
  ownership_change: {
    icon: <Shield className="h-5 w-5" />,
    color: 'text-yellow-600 bg-yellow-100',
    label: 'Ownership Change',
  },
  control_effectiveness: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-green-600 bg-green-100',
    label: 'Control Sign-Off',
  },
}

const DEFAULT_MIN_RATIONALE_LENGTH = 10

// ============================================================================
// Sub-Components
// ============================================================================

function ActionTypeBadge({ type }: { type: HumanGateAction['type'] }) {
  const config = ACTION_TYPE_CONFIG[type]
  return (
    <Badge variant="outline" className={cn('gap-1', config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  )
}

function AIRationaleCard({ rationale }: { rationale: string }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-800">AI Rationale</span>
      </div>
      <p className="text-sm text-blue-700">{rationale}</p>
    </div>
  )
}

function ImpactCard({ impact }: { impact: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800">Impact Assessment</span>
      </div>
      <p className="text-sm text-amber-700">{impact}</p>
    </div>
  )
}

function ProposedChangesCard({ changes }: { changes: Record<string, unknown> }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Info className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-800">Proposed Changes</span>
      </div>
      <pre className="text-xs text-gray-600 overflow-auto max-h-32">
        {JSON.stringify(changes, null, 2)}
      </pre>
    </div>
  )
}

function RationaleInput({
  value,
  onChange,
  minLength,
  error,
}: {
  value: string
  onChange: (value: string) => void
  minLength: number
  error?: string
}) {
  const charCount = value.trim().length
  const isValid = charCount >= minLength

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Your Rationale <span className="text-red-500">*</span>
        </label>
        <span
          className={cn(
            'text-xs',
            isValid ? 'text-green-600' : 'text-muted-foreground'
          )}
        >
          {charCount}/{minLength} min characters
        </span>
      </div>
      <textarea
        className={cn(
          'w-full min-h-[80px] p-3 border rounded-lg bg-background resize-none text-sm',
          error && 'border-red-500'
        )}
        placeholder={`Provide your rationale for this decision (minimum ${minLength} characters)...`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function HumanGateDialog({
  action,
  open,
  onOpenChange,
  onDecision,
  isProcessing = false,
  minRationaleLength = DEFAULT_MIN_RATIONALE_LENGTH,
}: HumanGateDialogProps) {
  const [rationale, setRationale] = useState('')
  const [error, setError] = useState<string | undefined>()

  // Reset state when dialog opens/closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRationale('')
      setError(undefined)
    }
    onOpenChange(newOpen)
  }

  // Validate and submit decision
  const handleDecision = (decision: HumanGateDecision) => {
    if (!action) return

    // Validate rationale
    if (rationale.trim().length < minRationaleLength) {
      setError(`Rationale must be at least ${minRationaleLength} characters`)
      return
    }

    setError(undefined)
    onDecision(action.id, decision, rationale.trim())
  }

  if (!action) return null

  const config = ACTION_TYPE_CONFIG[action.type]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={cn('p-2 rounded-lg', config.color)}>
              {config.icon}
            </div>
            <div>
              <DialogTitle className="text-lg">{action.title}</DialogTitle>
              <ActionTypeBadge type={action.type} />
            </div>
          </div>
          <DialogDescription className="text-left">
            {action.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* AI Rationale */}
          <AIRationaleCard rationale={action.aiRationale} />

          {/* Impact Assessment */}
          <ImpactCard impact={action.impact} />

          {/* Proposed Changes */}
          {action.proposedChanges && Object.keys(action.proposedChanges).length > 0 && (
            <ProposedChangesCard changes={action.proposedChanges} />
          )}

          {/* Entity Info */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Entity: <strong>{action.entityType}</strong></span>
            <span>ID: <strong>{action.entityId}</strong></span>
          </div>

          <Separator />

          {/* Rationale Input */}
          <RationaleInput
            value={rationale}
            onChange={setRationale}
            minLength={minRationaleLength}
            error={error}
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Defer Button */}
          <Button
            variant="outline"
            onClick={() => handleDecision('deferred')}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            <Clock className="h-4 w-4 mr-2" />
            Defer
          </Button>

          {/* Reject Button */}
          <Button
            variant="destructive"
            onClick={() => handleDecision('rejected')}
            disabled={isProcessing}
            className="w-full sm:w-auto"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            Reject
          </Button>

          {/* Approve Button */}
          <Button
            onClick={() => handleDecision('approved')}
            disabled={isProcessing}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default HumanGateDialog
