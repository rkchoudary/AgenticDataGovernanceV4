import { useState } from 'react'
import {
  X,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertTriangle,
  Pen,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubmitDecision, type DecisionType } from '@/hooks/useApprovals'
import { cn } from '@/lib/utils'

interface DecisionFormProps {
  approvalId: string
  artifactName: string
  onClose: () => void
  onSuccess: () => void
}

const MIN_RATIONALE_LENGTH = 20

export function DecisionForm({ approvalId, artifactName, onClose, onSuccess }: DecisionFormProps) {
  const [decision, setDecision] = useState<DecisionType | ''>('')
  const [rationale, setRationale] = useState('')
  const [signature, setSignature] = useState('')
  const [signatureConfirmed, setSignatureConfirmed] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const submitDecision = useSubmitDecision()

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!decision) {
      newErrors.decision = 'Please select a decision'
    }

    if (!rationale.trim()) {
      newErrors.rationale = 'Rationale is required'
    } else if (rationale.trim().length < MIN_RATIONALE_LENGTH) {
      newErrors.rationale = `Rationale must be at least ${MIN_RATIONALE_LENGTH} characters`
    }

    if (!signature.trim()) {
      newErrors.signature = 'Digital signature is required'
    }

    if (!signatureConfirmed) {
      newErrors.signatureConfirmed = 'Please confirm your signature'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm() || !decision) return

    try {
      await submitDecision.mutateAsync({
        id: approvalId,
        decision,
        rationale: rationale.trim(),
        signature: signature.trim(),
      })
      onSuccess()
    } catch (error) {
      setErrors({ submit: 'Failed to submit decision. Please try again.' })
    }
  }

  const getDecisionConfig = (type: DecisionType) => {
    const configs: Record<DecisionType, { icon: React.ReactNode; color: string; label: string; description: string }> = {
      approve: {
        icon: <CheckCircle2 className="h-5 w-5" />,
        color: 'border-green-500 bg-green-50 text-green-700',
        label: 'Approve',
        description: 'Approve the artifact as submitted',
      },
      reject: {
        icon: <XCircle className="h-5 w-5" />,
        color: 'border-red-500 bg-red-50 text-red-700',
        label: 'Reject',
        description: 'Reject the artifact and require resubmission',
      },
      request_changes: {
        icon: <MessageSquare className="h-5 w-5" />,
        color: 'border-purple-500 bg-purple-50 text-purple-700',
        label: 'Request Changes',
        description: 'Request specific changes before approval',
      },
    }
    return configs[type]
  }

  const rationaleCharCount = rationale.trim().length
  const isRationaleValid = rationaleCharCount >= MIN_RATIONALE_LENGTH

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl">Make Decision</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Artifact Info */}
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm text-muted-foreground">Reviewing</p>
            <p className="font-medium">{artifactName}</p>
          </div>

          {/* Decision Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Decision <span className="text-red-500">*</span>
            </label>
            <div className="grid gap-3">
              {(['approve', 'reject', 'request_changes'] as DecisionType[]).map((type) => {
                const config = getDecisionConfig(type)
                return (
                  <button
                    key={type}
                    type="button"
                    className={cn(
                      'flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left',
                      decision === type
                        ? config.color
                        : 'border-border hover:border-muted-foreground/50'
                    )}
                    onClick={() => setDecision(type)}
                  >
                    <div className={cn(decision === type ? '' : 'text-muted-foreground')}>
                      {config.icon}
                    </div>
                    <div>
                      <p className="font-medium">{config.label}</p>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            {errors.decision && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {errors.decision}
              </p>
            )}
          </div>

          {/* Rationale */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Rationale <span className="text-red-500">*</span>
              </label>
              <span
                className={cn(
                  'text-xs',
                  isRationaleValid ? 'text-green-600' : 'text-muted-foreground'
                )}
              >
                {rationaleCharCount}/{MIN_RATIONALE_LENGTH} min characters
              </span>
            </div>
            <textarea
              className={cn(
                'w-full min-h-[120px] p-3 border rounded-lg bg-background resize-none',
                errors.rationale && 'border-red-500'
              )}
              placeholder="Provide a detailed rationale for your decision (minimum 20 characters)..."
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
            {errors.rationale && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {errors.rationale}
              </p>
            )}
          </div>

          {/* Digital Signature */}
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
                  errors.signature && 'border-red-500'
                )}
                placeholder="Type your full name as digital signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
              />
            </div>
            {errors.signature && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {errors.signature}
              </p>
            )}

            {/* Signature Confirmation */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={signatureConfirmed}
                onChange={(e) => setSignatureConfirmed(e.target.checked)}
              />
              <span className="text-sm text-muted-foreground">
                I confirm that by typing my name above, I am providing my digital signature and
                acknowledge that this decision will be recorded in the audit trail.
              </span>
            </label>
            {errors.signatureConfirmed && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {errors.signatureConfirmed}
              </p>
            )}
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
              {errors.submit}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitDecision.isPending}
              className={cn(
                decision === 'approve' && 'bg-green-600 hover:bg-green-700',
                decision === 'reject' && 'bg-red-600 hover:bg-red-700',
                decision === 'request_changes' && 'bg-purple-600 hover:bg-purple-700'
              )}
            >
              {submitDecision.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Decision'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default DecisionForm
