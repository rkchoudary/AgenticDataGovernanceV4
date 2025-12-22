/**
 * StakeholderApprovalStep Component
 * 
 * Step 4 of Regulatory Intelligence phase - integrates HumanGate
 * for stakeholder approval of catalog updates.
 * 
 * Requirements: 3.4, 3.5
 */

import { useMemo } from 'react'
import {
  CheckCircle2,
  XCircle,
  Edit3,
  FileText,
  Calendar,
  AlertTriangle,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HumanGate } from '@/components/workflow-wizard/HumanGate'
import { GateItem } from '@/types/workflow-wizard'
import { cn } from '@/lib/utils'
import { DetectedChange, CatalogUpdateSummary } from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Approval Context Summary
 */
interface ApprovalContextProps {
  summary: CatalogUpdateSummary
}

function ApprovalContext({ summary }: ApprovalContextProps) {
  const hasChanges = summary.acceptedChanges > 0 || summary.modifiedChanges > 0

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Approval Context</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-xl font-bold text-green-600">{summary.acceptedChanges}</p>
            <p className="text-xs text-green-700">Accepted</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-xl font-bold text-purple-600">{summary.modifiedChanges}</p>
            <p className="text-xs text-purple-700">Modified</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-xl font-bold text-red-600">{summary.rejectedChanges}</p>
            <p className="text-xs text-red-700">Rejected</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-xl font-bold text-blue-600">{summary.impactedReports.length}</p>
            <p className="text-xs text-blue-700">Reports Impacted</p>
          </div>
        </div>

        {hasChanges ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Action Required:</strong> By approving, you confirm that the accepted regulatory 
              changes have been reviewed and should be applied to the report catalog. This will update 
              the compliance requirements for {summary.impactedReports.length} report(s).
            </p>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> All detected changes have been rejected. By approving, you confirm 
              that no updates to the report catalog are required at this time.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Change Summary Item for Gate
 */
interface ChangeSummaryItemProps {
  change: DetectedChange
}

function ChangeSummaryItem({ change }: ChangeSummaryItemProps) {
  const statusConfig = {
    accepted: { icon: CheckCircle2, color: 'text-green-600', label: 'Accepted' },
    rejected: { icon: XCircle, color: 'text-red-600', label: 'Rejected' },
    modified: { icon: Edit3, color: 'text-purple-600', label: 'Modified' },
    pending: { icon: AlertTriangle, color: 'text-amber-600', label: 'Pending' },
  }
  const StatusIcon = statusConfig[change.status].icon
  const effectiveDate = new Date(change.effectiveDate)

  return (
    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
      <StatusIcon className={cn('h-5 w-5 mt-0.5', statusConfig[change.status].color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{change.title}</span>
          <span className={cn(
            'text-xs px-1.5 py-0.5 rounded',
            statusConfig[change.status].color,
            change.status === 'accepted' && 'bg-green-100',
            change.status === 'rejected' && 'bg-red-100',
            change.status === 'modified' && 'bg-purple-100',
          )}>
            {statusConfig[change.status].label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{change.source}</p>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Effective: {effectiveDate.toLocaleDateString()}
          </span>
          <span className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {change.impactedReports.length} report(s)
          </span>
        </div>
        {change.status === 'modified' && change.modificationNotes && (
          <div className="mt-2 p-2 bg-purple-50 rounded text-xs text-purple-800">
            <strong>Modification:</strong> {change.modificationNotes}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface StakeholderApprovalStepProps {
  changes: DetectedChange[]
  summary: CatalogUpdateSummary
  onApprove: (rationale: string, signature?: string) => void
  onReject: (reason: string) => void
}

export function StakeholderApprovalStep({
  changes,
  summary,
  onApprove,
  onReject,
}: StakeholderApprovalStepProps) {
  // Build gate items from changes
  const gateItems = useMemo<GateItem[]>(() => {
    const items: GateItem[] = []

    // Summary item
    items.push({
      id: 'summary',
      label: 'Catalog Update Summary',
      value: (
        <div className="space-y-1">
          <p>{summary.acceptedChanges} changes accepted, {summary.modifiedChanges} modified, {summary.rejectedChanges} rejected</p>
          <p className="text-muted-foreground">{summary.impactedReports.length} reports will be updated</p>
        </div>
      ),
      isAIGenerated: false,
    })

    // Add each change as an item
    const reviewedChanges = changes.filter(c => c.status !== 'pending')
    reviewedChanges.forEach(change => {
      items.push({
        id: change.id,
        label: change.title,
        value: <ChangeSummaryItem change={change} />,
        isAIGenerated: true,
        confidenceScore: change.confidence,
      })
    })

    // Impacted reports
    if (summary.impactedReports.length > 0) {
      items.push({
        id: 'impacted-reports',
        label: 'Impacted Reports',
        value: (
          <div className="flex flex-wrap gap-1">
            {summary.impactedReports.map((report, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
              >
                <FileText className="h-3 w-3" />
                {report}
              </span>
            ))}
          </div>
        ),
        isAIGenerated: false,
      })
    }

    return items
  }, [changes, summary])

  // Determine gate description based on changes
  const gateDescription = useMemo(() => {
    const hasAccepted = summary.acceptedChanges > 0 || summary.modifiedChanges > 0
    if (hasAccepted) {
      return `Review and approve the catalog updates. ${summary.acceptedChanges + summary.modifiedChanges} regulatory change(s) will be applied to ${summary.impactedReports.length} report(s).`
    }
    return 'Review and confirm that no catalog updates are required. All detected changes have been rejected.'
  }, [summary])

  return (
    <div className="space-y-6">
      {/* Context Summary */}
      <ApprovalContext summary={summary} />

      {/* AI Content Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
        <div>
          <h3 className="font-medium text-blue-800">AI-Detected Changes</h3>
          <p className="text-sm text-blue-700 mt-1">
            The regulatory changes in this review were detected by AI scanning of regulatory sources. 
            Each change includes a confidence score indicating the AI's certainty. Please review 
            carefully before approving.
          </p>
        </div>
      </div>

      {/* Human Gate */}
      <HumanGate
        gateType="approval"
        title="Stakeholder Approval"
        description={gateDescription}
        items={gateItems}
        onApprove={onApprove}
        onReject={onReject}
        requiresSignature={true}
        minimumRationaleLength={20}
      />
    </div>
  )
}

export default StakeholderApprovalStep
