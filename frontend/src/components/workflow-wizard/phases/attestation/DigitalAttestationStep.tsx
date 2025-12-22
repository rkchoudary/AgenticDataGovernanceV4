/**
 * DigitalAttestationStep Component
 * 
 * Captures digital attestation with identity verification and signature.
 * Requires signature with identity verification before submission.
 * 
 * Requirements: 11.4
 */

import { useState, useCallback } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  User,
  Mail,
  Briefcase,
  Shield,
  Lock,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HumanGate } from '../../HumanGate'
import { cn } from '@/lib/utils'
import {
  AttestationRecord,
  ExecutiveSummaryMetrics,
} from './types'

// ============================================================================
// Types
// ============================================================================

interface AttestorInfo {
  id: string
  name: string
  title: string
  email: string
}

// ============================================================================
// Sub-Components
// ============================================================================

interface AttestorCardProps {
  attestor: AttestorInfo
  isVerified: boolean
  onVerify: () => void
  isVerifying: boolean
}

function AttestorCard({ attestor, isVerified, onVerify, isVerifying }: AttestorCardProps) {
  return (
    <Card className={cn(
      'border-2',
      isVerified ? 'border-green-200 bg-green-50/50' : 'border-amber-200 bg-amber-50/50'
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={cn(
              'p-2 rounded-full',
              isVerified ? 'bg-green-100' : 'bg-amber-100'
            )}>
              <User className={cn(
                'h-5 w-5',
                isVerified ? 'text-green-600' : 'text-amber-600'
              )} />
            </div>
            <div>
              <p className="font-medium">{attestor.name}</p>
              <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                <Briefcase className="h-3 w-3" />
                {attestor.title}
              </div>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mail className="h-3 w-3" />
                {attestor.email}
              </div>
            </div>
          </div>
          
          {isVerified ? (
            <div className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Verified
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={onVerify}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-1" />
                  Verify Identity
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

interface MetricsSummaryProps {
  metrics: ExecutiveSummaryMetrics
}

function MetricsSummary({ metrics }: MetricsSummaryProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="p-3 bg-muted rounded-lg text-center">
        <p className="text-2xl font-bold">{metrics.dataQualityScore}%</p>
        <p className="text-xs text-muted-foreground">Data Quality</p>
      </div>
      <div className="p-3 bg-muted rounded-lg text-center">
        <p className="text-2xl font-bold">{metrics.issueResolutionRate}%</p>
        <p className="text-xs text-muted-foreground">Issues Resolved</p>
      </div>
      <div className="p-3 bg-muted rounded-lg text-center">
        <p className="text-2xl font-bold">{metrics.controlPassRate}%</p>
        <p className="text-xs text-muted-foreground">Controls Passed</p>
      </div>
      <div className="p-3 bg-muted rounded-lg text-center">
        <p className={cn(
          'text-2xl font-bold',
          metrics.criticalIssuesRemaining > 0 ? 'text-red-600' : 'text-green-600'
        )}>
          {metrics.criticalIssuesRemaining}
        </p>
        <p className="text-xs text-muted-foreground">Critical Issues</p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface DigitalAttestationStepProps {
  attestor: AttestorInfo
  metrics: ExecutiveSummaryMetrics
  reportName: string
  reportingPeriod: string
  existingAttestations: AttestationRecord[]
  onAttest: (rationale: string, signature: string) => void
  onComplete: () => void
}

export function DigitalAttestationStep({
  attestor,
  metrics,
  reportName,
  reportingPeriod,
  existingAttestations,
  onAttest,
  onComplete,
}: DigitalAttestationStepProps) {
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [hasAttested, setHasAttested] = useState(existingAttestations.length > 0)

  // Simulate identity verification
  const handleVerify = useCallback(async () => {
    setIsVerifying(true)
    // Simulate MFA/SSO verification
    await new Promise(resolve => setTimeout(resolve, 1500))
    setIsVerified(true)
    setIsVerifying(false)
  }, [])

  // Handle attestation approval
  const handleApprove = useCallback((rationale: string, signature?: string) => {
    if (signature) {
      onAttest(rationale, signature)
      setHasAttested(true)
    }
  }, [onAttest])

  // Handle rejection (shouldn't happen in attestation flow)
  const handleReject = useCallback((reason: string) => {
    console.log('Attestation rejected:', reason)
  }, [])

  // Gate items for review
  const gateItems = [
    {
      id: 'report',
      label: 'Report',
      value: reportName,
      isAIGenerated: false,
    },
    {
      id: 'period',
      label: 'Reporting Period',
      value: reportingPeriod,
      isAIGenerated: false,
    },
    {
      id: 'quality',
      label: 'Data Quality Score',
      value: `${metrics.dataQualityScore}%`,
      isAIGenerated: false,
    },
    {
      id: 'issues',
      label: 'Issue Resolution Rate',
      value: `${metrics.issueResolutionRate}% (${metrics.resolvedIssues}/${metrics.totalIssues})`,
      isAIGenerated: false,
    },
    {
      id: 'controls',
      label: 'Control Pass Rate',
      value: `${metrics.controlPassRate}%`,
      isAIGenerated: false,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Digital Attestation</h2>
        <p className="text-muted-foreground mt-1">
          Verify your identity and provide your digital attestation
        </p>
      </div>

      {/* Attestor Verification */}
      <div>
        <h3 className="text-sm font-medium mb-3">Attestor Identity</h3>
        <AttestorCardProps
          attestor={attestor}
          isVerified={isVerified}
          onVerify={handleVerify}
          isVerifying={isVerifying}
        />
      </div>

      {/* Metrics Summary */}
      <div>
        <h3 className="text-sm font-medium mb-3">Summary Metrics</h3>
        <MetricsSummary metrics={metrics} />
      </div>

      {/* Critical Issues Warning */}
      {metrics.criticalIssuesRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Critical Issues Remaining</p>
              <p className="text-sm text-amber-700 mt-1">
                There are {metrics.criticalIssuesRemaining} unresolved critical issues. 
                By attesting, you acknowledge these issues and accept responsibility 
                for their resolution.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Attestation Gate */}
      {!isVerified ? (
        <Card className="border-2 border-dashed">
          <CardContent className="p-8 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium">Identity Verification Required</p>
            <p className="text-sm text-muted-foreground mt-1">
              Please verify your identity above before providing your attestation
            </p>
          </CardContent>
        </Card>
      ) : hasAttested ? (
        <Card className="border-2 border-green-200 bg-green-50">
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-4" />
            <p className="font-medium text-green-800">Attestation Captured</p>
            <p className="text-sm text-green-700 mt-1">
              Your digital attestation has been recorded. You can proceed to submission.
            </p>
            {existingAttestations.length > 0 && (
              <p className="text-xs text-green-600 mt-2">
                Attested at: {new Date(existingAttestations[0].attestedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <HumanGate
          gateType="attestation"
          title="Executive Attestation"
          description="By providing your attestation, you confirm that you have reviewed all materials and certify the accuracy and completeness of this regulatory submission."
          items={gateItems}
          onApprove={handleApprove}
          onReject={handleReject}
          requiresSignature={true}
          minimumRationaleLength={20}
        />
      )}

      {/* Attestation Statement */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Attestation Statement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            I, the undersigned, hereby attest that:
          </p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              I have reviewed the executive summary and all supporting documentation
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              The data quality controls and processes are operating effectively
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              All identified issues have been appropriately addressed or escalated
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              The regulatory submission is accurate and complete to the best of my knowledge
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          disabled={!hasAttested}
        >
          Continue to Submission
        </Button>
      </div>
    </div>
  )
}

// Fix the component reference
function AttestorCardProps({ attestor, isVerified, onVerify, isVerifying }: AttestorCardProps) {
  return (
    <AttestorCard
      attestor={attestor}
      isVerified={isVerified}
      onVerify={onVerify}
      isVerifying={isVerifying}
    />
  )
}

export default DigitalAttestationStep
