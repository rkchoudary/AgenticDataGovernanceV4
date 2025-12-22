/**
 * HumanGate Component
 *
 * Human approval gate interface for workflow checkpoints.
 * Displays context summary, items for review, and captures
 * decisions with rationale and digital signatures.
 *
 * Requirements: 3.5, 11.4, 12.4, 15.3
 */

import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  Edit3,
  AlertTriangle,
  Sparkles,
  Pen,
  Loader2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { HumanGateProps, GateItem } from '@/types/workflow-wizard'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type DecisionType = 'approve' | 'reject' | 'approve_with_changes'

export const DEFAULT_MIN_RATIONALE_LENGTH = 20

// ============================================================================
// Decision Configuration
// ============================================================================

const DECISION_CONFIG: Record<
  DecisionType,
  {
    icon: React.ReactNode
    color: string
    selectedColor: string
    label: string
    description: string
  }
> = {
  approve: {
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'border-border hover:border-green-300',
    selectedColor: 'border-green-500 bg-green-50 text-green-700',
    label: 'Approve',
    description: 'Approve all items as presented',
  },
  reject: {
    icon: <XCircle className="h-5 w-5" />,
    color: 'border-border hover:border-red-300',
    selectedColor: 'border-red-500 bg-red-50 text-red-700',
    label: 'Reject',
    description: 'Reject and require resubmission',
  },
  approve_with_changes: {
    icon: <Edit3 className="h-5 w-5" />,
    color: 'border-border hover:border-purple-300',
    selectedColor: 'border-purple-500 bg-purple-50 text-purple-700',
    label: 'Approve with Changes',
    description: 'Approve with noted modifications',
  },
}


// ============================================================================
// Sub-Components
// ============================================================================

function AIIndicator({ confidenceScore }: { confidenceScore?: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
      <Sparkles className="h-3 w-3" />
      AI Generated
      {confidenceScore !== undefined && (
        <span className="ml-1 text-blue-500">
          ({Math.round(confidenceScore * 100)}%)
        </span>
      )}
    </span>
  )
}

function GateItemCard({ item }: { item: GateItem }) {
  return (
    <div className="p-4 border rounded-lg bg-card">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{item.label}</span>
            {item.isAIGenerated && (
              <AIIndicator confidenceScore={item.confidenceScore} />
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {typeof item.value === 'string' ? item.value : item.value}
          </div>
        </div>
      </div>
    </div>
  )
}

function DecisionSelection({
  decision,
  onSelect,
  error,
}: {
  decision: DecisionType | null
  onSelect: (decision: DecisionType) => void
  error?: string
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">
        Decision <span className="text-red-500">*</span>
      </label>
      <div className="grid gap-3">
        {(Object.keys(DECISION_CONFIG) as DecisionType[]).map((type) => {
          const config = DECISION_CONFIG[type]
          const isSelected = decision === type
          return (
            <button
              key={type}
              type="button"
              className={cn(
                'flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left',
                isSelected ? config.selectedColor : config.color
              )}
              onClick={() => onSelect(type)}
            >
              <div className={cn(isSelected ? '' : 'text-muted-foreground')}>
                {config.icon}
              </div>
              <div>
                <p className="font-medium">{config.label}</p>
                <p className="text-sm text-muted-foreground">
                  {config.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}
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
          Rationale <span className="text-red-500">*</span>
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
          'w-full min-h-[120px] p-3 border rounded-lg bg-background resize-none',
          error && 'border-red-500'
        )}
        placeholder={`Provide a detailed rationale for your decision (minimum ${minLength} characters)...`}
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

function TypedSignature({
  value,
  onChange,
  confirmed,
  onConfirmChange,
  error,
  confirmError,
}: {
  value: string
  onChange: (value: string) => void
  confirmed: boolean
  onConfirmChange: (confirmed: boolean) => void
  error?: string
  confirmError?: string
}) {
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">
        Digital Signature <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <Pen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          className={cn(
            'w-full pl-10 pr-4 py-2 border rounded-lg bg-background',
            error && 'border-red-500'
          )}
          placeholder="Type your full name as digital signature"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </p>
      )}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(e) => onConfirmChange(e.target.checked)}
        />
        <span className="text-sm text-muted-foreground">
          I confirm that by typing my name above, I am providing my digital
          signature and acknowledge that this decision will be recorded in the
          audit trail.
        </span>
      </label>
      {confirmError && (
        <p className="text-sm text-red-500 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {confirmError}
        </p>
      )}
    </div>
  )
}


// ============================================================================
// Main HumanGate Component
// ============================================================================

export function HumanGate({
  gateType,
  title,
  description,
  items,
  onApprove,
  onReject,
  requiresSignature,
  minimumRationaleLength = DEFAULT_MIN_RATIONALE_LENGTH,
}: HumanGateProps) {
  // Form state
  const [decision, setDecision] = useState<DecisionType | null>(null)
  const [rationale, setRationale] = useState('')
  const [typedSignature, setTypedSignature] = useState('')
  const [signatureConfirmed, setSignatureConfirmed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Validation function
  function validateForm(): boolean {
    const newErrors: Record<string, string> = {}

    if (!decision) {
      newErrors.decision = 'Please select a decision'
    }

    if (!rationale.trim()) {
      newErrors.rationale = 'Rationale is required'
    } else if (rationale.trim().length < minimumRationaleLength) {
      newErrors.rationale = `Rationale must be at least ${minimumRationaleLength} characters`
    }

    if (requiresSignature) {
      if (!typedSignature.trim()) {
        newErrors.signature = 'Digital signature is required'
      }
      if (!signatureConfirmed) {
        newErrors.signatureConfirmed = 'Please confirm your signature'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Submit handler
  function handleSubmit() {
    const isValid = validateForm()

    if (!isValid || !decision) {
      return
    }

    setIsSubmitting(true)

    const signature = typedSignature.trim()

    if (decision === 'reject') {
      onReject(rationale.trim())
    } else {
      onApprove(rationale.trim(), signature || undefined)
    }

    setIsSubmitting(false)
  }

  // Get submit button color based on decision
  function getSubmitButtonClass(): string {
    if (!decision) return 'bg-primary hover:bg-primary/90'
    switch (decision) {
      case 'approve':
        return 'bg-green-600 hover:bg-green-700'
      case 'reject':
        return 'bg-red-600 hover:bg-red-700'
      case 'approve_with_changes':
        return 'bg-purple-600 hover:bg-purple-700'
    }
  }

  // Count AI-generated items
  const aiGeneratedCount = items.filter((item) => item.isAIGenerated).length

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {gateType === 'attestation' && (
            <CheckCircle2 className="h-5 w-5 text-primary" />
          )}
          {gateType === 'approval' && (
            <Edit3 className="h-5 w-5 text-primary" />
          )}
          {gateType === 'signature' && (
            <Pen className="h-5 w-5 text-primary" />
          )}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Context Summary */}
        {items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Items for Review</h3>
              {aiGeneratedCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {aiGeneratedCount} AI-generated item
                  {aiGeneratedCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {items.map((item) => (
                <GateItemCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* Decision Selection */}
        <DecisionSelection
          decision={decision}
          onSelect={setDecision}
          error={errors.decision}
        />

        {/* Rationale Input */}
        <RationaleInput
          value={rationale}
          onChange={setRationale}
          minLength={minimumRationaleLength}
          error={errors.rationale}
        />

        {/* Signature Section */}
        {requiresSignature && (
          <TypedSignature
            value={typedSignature}
            onChange={setTypedSignature}
            confirmed={signatureConfirmed}
            onConfirmChange={setSignatureConfirmed}
            error={errors.signature}
            confirmError={errors.signatureConfirmed}
          />
        )}

        {/* Submit Error */}
        {errors.submit && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {errors.submit}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            disabled={isSubmitting}
            className={cn(
              'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium h-10 px-4 py-2 text-white',
              getSubmitButtonClass()
            )}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Decision'
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

export default HumanGate
