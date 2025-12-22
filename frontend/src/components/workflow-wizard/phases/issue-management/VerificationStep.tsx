/**
 * VerificationStep Component
 * 
 * Step 4 of Issue Management phase - verification with four-eyes
 * confirmation using HumanGate. Also enforces critical issue blocking.
 * 
 * Requirements: 8.4, 8.5
 */

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { HumanGate } from '@/components/workflow-wizard/HumanGate'
import { GateItem } from '@/types/workflow-wizard'
import {
  Issue,
  IssueSummary,
  SEVERITY_CONFIG,
  STATUS_CONFIG,
  RESOLUTION_TYPE_CONFIG,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface VerificationStepProps {
  issues: Issue[]
  allIssues: Issue[]
  summary: IssueSummary
  blockingIssues: Issue[]
  canProceed: boolean
  onVerify: (issueId: string, verifiedBy: string, notes: string) => void
  onComplete: () => void
}

// ============================================================================
// Issue Verification Card
// ============================================================================

interface IssueVerificationCardProps {
  issue: Issue
  onVerify: () => void
}

function IssueVerificationCard({ issue, onVerify }: IssueVerificationCardProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity]
  const resolutionTypeConfig = issue.resolution?.type
    ? RESOLUTION_TYPE_CONFIG[issue.resolution.type]
    : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={cn(severityConfig.bgColor, severityConfig.color)}>
              {severityConfig.label}
            </Badge>
            <CardTitle className="text-base">{issue.title}</CardTitle>
          </div>
          <Badge variant="outline" className="text-cyan-600 border-cyan-300 bg-cyan-50">
            <Clock className="h-3 w-3 mr-1" />
            Pending Verification
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Resolution Summary */}
          {issue.resolution && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Resolution Type:</span>
                <Badge variant="outline">
                  {resolutionTypeConfig?.label || issue.resolution.type}
                </Badge>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Root Cause:</span>
                <p className="text-sm mt-1">{issue.resolution.rootCause}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Resolution:</span>
                <p className="text-sm mt-1">{issue.resolution.description}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Implemented by: {issue.resolution.implementedBy}</span>
                <span>
                  {new Date(issue.resolution.implementedAt).toLocaleDateString()}
                </span>
              </div>
              {issue.resolution.evidence && issue.resolution.evidence.length > 0 && (
                <div>
                  <span className="text-sm text-muted-foreground">
                    Evidence: {issue.resolution.evidence.length} item(s) attached
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Verify Button */}
          <div className="flex justify-end">
            <Button onClick={onVerify}>
              <Eye className="h-4 w-4 mr-2" />
              Verify Resolution
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Blocking Issues Warning
// ============================================================================

interface BlockingIssuesWarningProps {
  blockingIssues: Issue[]
}

function BlockingIssuesWarning({ blockingIssues }: BlockingIssuesWarningProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <div className="flex items-center gap-2 text-red-700 mb-3">
        <ShieldAlert className="h-5 w-5" />
        <span className="font-semibold">
          {blockingIssues.length} Critical Issue{blockingIssues.length !== 1 ? 's' : ''} Blocking Progression
        </span>
      </div>
      <p className="text-sm text-red-600 mb-4">
        Critical issues must be resolved and verified before proceeding to the Controls Management phase.
        This is a regulatory requirement to ensure data quality issues are addressed.
      </p>
      <div className="space-y-2">
        {blockingIssues.map(issue => (
          <div
            key={issue.id}
            className="flex items-center justify-between p-2 bg-white rounded border border-red-200"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">{issue.title}</span>
            </div>
            <Badge className="bg-red-100 text-red-700">
              {STATUS_CONFIG[issue.status].label}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Summary Dashboard
// ============================================================================

interface SummaryDashboardProps {
  summary: IssueSummary
  allIssues: Issue[]
}

function SummaryDashboard({ summary, allIssues }: SummaryDashboardProps) {
  const verifiedIssues = allIssues.filter(i => i.status === 'verified')
  const closedIssues = allIssues.filter(i => i.status === 'closed')
  const escalatedIssues = allIssues.filter(i => i.status === 'escalated')

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold text-green-600">
              {verifiedIssues.length}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">Verified</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-5 w-5 text-cyan-500" />
            <span className="text-2xl font-bold text-cyan-600">
              {summary.totalIssues - verifiedIssues.length - closedIssues.length - escalatedIssues.length}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">Pending</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-5 w-5 text-gray-500" />
            <span className="text-2xl font-bold text-gray-600">
              {closedIssues.length}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">Closed</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <span className="text-2xl font-bold text-red-600">
              {escalatedIssues.length}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">Escalated</div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function VerificationStep({
  issues,
  allIssues,
  summary,
  blockingIssues,
  canProceed,
  onVerify,
  onComplete,
}: VerificationStepProps) {
  const [verifyingIssueId, setVerifyingIssueId] = useState<string | null>(null)

  // Get issue being verified
  const verifyingIssue = issues.find(i => i.id === verifyingIssueId)

  // Build gate items for HumanGate
  const buildGateItems = (issue: Issue): GateItem[] => {
    const items: GateItem[] = [
      {
        id: 'title',
        label: 'Issue',
        value: issue.title,
        isAIGenerated: issue.isAIGenerated,
        confidenceScore: issue.aiConfidence,
      },
      {
        id: 'severity',
        label: 'Severity',
        value: SEVERITY_CONFIG[issue.severity].label,
        isAIGenerated: false,
      },
    ]

    if (issue.resolution) {
      items.push(
        {
          id: 'root_cause',
          label: 'Root Cause',
          value: issue.resolution.rootCause,
          isAIGenerated: true,
        },
        {
          id: 'resolution_type',
          label: 'Resolution Type',
          value: RESOLUTION_TYPE_CONFIG[issue.resolution.type]?.label || issue.resolution.type,
          isAIGenerated: false,
        },
        {
          id: 'resolution_description',
          label: 'Resolution Description',
          value: issue.resolution.description,
          isAIGenerated: false,
        },
        {
          id: 'evidence_count',
          label: 'Evidence',
          value: `${issue.resolution.evidence?.length || 0} item(s) attached`,
          isAIGenerated: false,
        }
      )
    }

    return items
  }

  // Handle verification approval
  const handleApprove = (rationale: string, _signature?: string) => {
    if (verifyingIssueId) {
      onVerify(verifyingIssueId, 'current-user', rationale)
      setVerifyingIssueId(null)
    }
  }

  // Handle verification rejection
  const handleReject = (_reason: string) => {
    // In a real implementation, this would reopen the issue
    setVerifyingIssueId(null)
  }

  // Count verified issues
  const verifiedCount = allIssues.filter(i => i.status === 'verified').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Verification</h2>
        <p className="text-muted-foreground mt-1">
          Verify issue resolutions with four-eyes confirmation. All critical issues must be
          resolved before proceeding.
        </p>
      </div>

      {/* Summary Dashboard */}
      <SummaryDashboard summary={summary} allIssues={allIssues} />

      {/* Blocking Issues Warning - Property 2: Blocking Condition Enforcement */}
      {blockingIssues.length > 0 && (
        <BlockingIssuesWarning blockingIssues={blockingIssues} />
      )}

      {/* Verification Progress */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Verification Progress</span>
          <span className="text-sm text-muted-foreground">
            {verifiedCount} of {allIssues.length} issues verified
          </span>
        </div>
        <Progress value={(verifiedCount / allIssues.length) * 100} className="h-2" />
      </div>

      {/* Issues Pending Verification */}
      {issues.length > 0 ? (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Issues Pending Verification</h3>
          {issues.map(issue => (
            <IssueVerificationCard
              key={issue.id}
              issue={issue}
              onVerify={() => setVerifyingIssueId(issue.id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-green-50 rounded-lg border border-green-200">
          <ShieldCheck className="h-12 w-12 mx-auto mb-3 text-green-500" />
          <p className="text-lg font-medium text-green-700">All Issues Verified</p>
          <p className="text-sm text-green-600 mt-1">
            All issue resolutions have been verified and confirmed.
          </p>
        </div>
      )}

      {/* HumanGate for Four-Eyes Confirmation */}
      {verifyingIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-auto">
            <HumanGate
              gateType="approval"
              title="Four-Eyes Verification"
              description="Review the issue resolution and provide your verification. This requires a second person to confirm the resolution is complete and accurate."
              items={buildGateItems(verifyingIssue)}
              onApprove={handleApprove}
              onReject={handleReject}
              requiresSignature={true}
              minimumRationaleLength={20}
            />
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setVerifyingIssueId(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        {!canProceed ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {blockingIssues.length} critical issue{blockingIssues.length !== 1 ? 's' : ''} must be resolved
            </span>
            <Button disabled>
              Cannot Proceed - Critical Issues Blocking
            </Button>
          </div>
        ) : (
          <Button onClick={onComplete}>
            Continue to Controls Management
          </Button>
        )}
      </div>
    </div>
  )
}

export default VerificationStep

