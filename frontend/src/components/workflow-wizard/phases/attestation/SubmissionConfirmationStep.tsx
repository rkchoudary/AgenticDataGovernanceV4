/**
 * SubmissionConfirmationStep Component
 * 
 * Final submission step that locks all artifacts and generates a submission receipt.
 * Once submitted, all artifacts become immutable.
 * 
 * Requirements: 11.5
 * Property 8: Artifact Lock Immutability
 */

import { useState, useCallback } from 'react'
import {
  CheckCircle2,
  Lock,
  FileText,
  Download,
  Send,
  Loader2,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  Package,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  SubmissionReceipt,
  ArtifactLock,
  AttestationRecord,
  SUBMISSION_STATUS_CONFIG,
} from './types'

// ============================================================================
// Sub-Components
// ============================================================================

interface SubmissionSummaryProps {
  reportName: string
  reportingPeriod: string
  attestations: AttestationRecord[]
  artifactCount: number
  totalPages: number
}

function SubmissionSummary({
  reportName,
  reportingPeriod,
  attestations,
  artifactCount,
  totalPages,
}: SubmissionSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Submission Package
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Report</p>
            <p className="font-medium">{reportName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Period</p>
            <p className="font-medium">{reportingPeriod}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Artifacts</p>
            <p className="font-medium">{artifactCount} documents</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Pages</p>
            <p className="font-medium">{totalPages} pages</p>
          </div>
        </div>
        
        {attestations.length > 0 && (
          <div className="pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-2">Attestations</p>
            <div className="space-y-2">
              {attestations.map(att => (
                <div key={att.id} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>{att.attestorName}</span>
                  <span className="text-muted-foreground">({att.attestorTitle})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ReceiptCardProps {
  receipt: SubmissionReceipt
  onDownload: () => void
}

function ReceiptCard({ receipt, onDownload }: ReceiptCardProps) {
  const [copied, setCopied] = useState(false)

  const copyConfirmation = () => {
    navigator.clipboard.writeText(receipt.confirmationNumber)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const statusConfig = SUBMISSION_STATUS_CONFIG[receipt.status]

  return (
    <Card className="border-2 border-green-200 bg-green-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Submission Receipt
          </CardTitle>
          <span className={cn(
            'text-xs px-2 py-1 rounded-full',
            statusConfig.bgColor, statusConfig.color
          )}>
            {statusConfig.label}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Confirmation Number */}
        <div className="bg-white rounded-lg p-4 border border-green-200">
          <p className="text-xs text-muted-foreground mb-1">Confirmation Number</p>
          <div className="flex items-center gap-2">
            <code className="text-lg font-mono font-bold text-green-800">
              {receipt.confirmationNumber}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={copyConfirmation}
              className="h-8 w-8 p-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Submitted At</p>
            <p className="font-medium">
              {new Date(receipt.submissionTimestamp).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Submitted By</p>
            <p className="font-medium">{receipt.submittedByName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Package Hash</p>
            <code className="text-xs font-mono">{receipt.packageHash.slice(0, 16)}...</code>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Artifacts Locked</p>
            <p className="font-medium">{receipt.artifactCount} documents</p>
          </div>
        </div>

        {/* Download Button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={onDownload}
        >
          <Download className="h-4 w-4 mr-2" />
          Download Receipt (PDF)
        </Button>
      </CardContent>
    </Card>
  )
}

interface LockedArtifactsListProps {
  artifacts: ArtifactLock[]
}

function LockedArtifactsList({ artifacts }: LockedArtifactsListProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Locked Artifacts
        </CardTitle>
        <CardDescription>
          These artifacts are now immutable and cannot be modified
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[200px] overflow-auto">
          {artifacts.map(artifact => (
            <div
              key={artifact.artifactId}
              className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
            >
              <Lock className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{artifact.artifactName}</p>
                <p className="text-xs text-muted-foreground">
                  Locked at {new Date(artifact.lockedAt).toLocaleString()}
                </p>
              </div>
              <code className="text-xs font-mono text-muted-foreground">
                {artifact.hash.slice(0, 8)}
              </code>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface SubmissionConfirmationStepProps {
  reportName: string
  reportingPeriod: string
  attestations: AttestationRecord[]
  artifactIds: string[]
  artifactNames: string[]
  totalPages: number
  submissionReceipt: SubmissionReceipt | null
  lockedArtifacts: ArtifactLock[]
  onSubmit: () => Promise<void>
  onComplete: () => void
}

export function SubmissionConfirmationStep({
  reportName,
  reportingPeriod,
  attestations,
  artifactIds,
  artifactNames,
  totalPages,
  submissionReceipt,
  lockedArtifacts,
  onSubmit,
  onComplete,
}: SubmissionConfirmationStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSubmitted = submissionReceipt !== null

  const handleSubmit = useCallback(async () => {
    if (!confirmed) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      await onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }, [confirmed, onSubmit])

  const handleDownloadReceipt = useCallback(() => {
    // In a real implementation, this would generate and download a PDF
    console.log('Downloading receipt...')
    alert('Receipt download would be triggered here')
  }, [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">
          {isSubmitted ? 'Submission Complete' : 'Submission Confirmation'}
        </h2>
        <p className="text-muted-foreground mt-1">
          {isSubmitted
            ? 'Your regulatory submission has been successfully processed'
            : 'Review and confirm your submission. This action cannot be undone.'}
        </p>
      </div>

      {/* Submission Summary */}
      <SubmissionSummary
        reportName={reportName}
        reportingPeriod={reportingPeriod}
        attestations={attestations}
        artifactCount={artifactIds.length}
        totalPages={totalPages}
      />

      {isSubmitted && submissionReceipt ? (
        <>
          {/* Receipt */}
          <ReceiptCard
            receipt={submissionReceipt}
            onDownload={handleDownloadReceipt}
          />

          {/* Locked Artifacts */}
          {lockedArtifacts.length > 0 && (
            <LockedArtifactsList artifacts={lockedArtifacts} />
          )}

          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">Artifacts Locked</p>
                <p className="text-sm text-green-700 mt-1">
                  All {lockedArtifacts.length} artifacts have been locked and are now immutable. 
                  Any future modifications will require a new submission cycle.
                </p>
              </div>
            </div>
          </div>

          {/* Complete Button */}
          <div className="flex justify-end">
            <Button onClick={onComplete}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Complete Workflow
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Important Notice</p>
                <p className="text-sm text-amber-700 mt-1">
                  Once submitted, all artifacts will be locked and cannot be modified. 
                  This action is irreversible. Please ensure all information is accurate 
                  before proceeding.
                </p>
              </div>
            </div>
          </div>

          {/* Artifacts to be Locked */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Artifacts to be Locked
              </CardTitle>
              <CardDescription>
                The following {artifactIds.length} artifacts will be locked upon submission
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[200px] overflow-auto">
                {artifactNames.map((name, idx) => (
                  <div
                    key={artifactIds[idx]}
                    className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Confirmation Checkbox */}
          <Card className="border-2 border-primary/20">
            <CardContent className="p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <div>
                  <p className="font-medium">I confirm this submission</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    I understand that by submitting, all artifacts will be permanently locked 
                    and this regulatory submission will be finalized. I have verified that all 
                    information is accurate and complete.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">Submission Failed</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!confirmed || isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit to Regulator
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export default SubmissionConfirmationStep
