/**
 * CatalogUpdatesStep Component
 * 
 * Step 3 of Regulatory Intelligence phase - displays summary of
 * accepted/rejected changes before final approval.
 * 
 * Requirements: 3.4
 */

import { useMemo } from 'react'
import {
  CheckCircle2,
  XCircle,
  Edit3,
  FileText,
  Calendar,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  Plus,
  Minus,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { DetectedChange, CatalogUpdateSummary, CHANGE_TYPE_CONFIG } from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Change Type Icon Component
 */
function ChangeTypeIcon({ type }: { type: DetectedChange['changeType'] }) {
  const iconMap = {
    new_requirement: Plus,
    updated_requirement: RefreshCw,
    removed_requirement: Minus,
    deadline_change: Calendar,
    format_change: FileText,
  }
  const Icon = iconMap[type]
  return <Icon className="h-4 w-4" />
}

/**
 * Summary Statistics Card
 */
interface SummaryStatsProps {
  summary: CatalogUpdateSummary
}

function SummaryStats({ summary }: SummaryStatsProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Update Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold">{summary.totalChanges}</p>
            <p className="text-xs text-muted-foreground">Total Changes</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{summary.acceptedChanges}</p>
            <p className="text-xs text-green-700">Accepted</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-600">{summary.modifiedChanges}</p>
            <p className="text-xs text-purple-700">Modified</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{summary.rejectedChanges}</p>
            <p className="text-xs text-red-700">Rejected</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{summary.impactedReports.length}</p>
            <p className="text-xs text-blue-700">Reports Impacted</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Change Summary Row
 */
interface ChangeSummaryRowProps {
  change: DetectedChange
}

function ChangeSummaryRow({ change }: ChangeSummaryRowProps) {
  const config = CHANGE_TYPE_CONFIG[change.changeType]
  const effectiveDate = new Date(change.effectiveDate)
  
  const statusConfig = {
    accepted: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
    rejected: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
    modified: { icon: Edit3, color: 'text-purple-600', bg: 'bg-purple-50' },
    pending: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
  }
  const StatusIcon = statusConfig[change.status].icon

  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-lg border',
      statusConfig[change.status].bg
    )}>
      <div className={cn('p-2 rounded-full', statusConfig[change.status].bg)}>
        <StatusIcon className={cn('h-5 w-5', statusConfig[change.status].color)} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
            config.bgColor,
            config.color
          )}>
            <ChangeTypeIcon type={change.changeType} />
            {config.label}
          </span>
        </div>
        <h4 className="font-medium text-sm truncate">{change.title}</h4>
        <p className="text-xs text-muted-foreground">{change.source}</p>
      </div>

      <div className="text-right text-sm">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {effectiveDate.toLocaleDateString()}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground mt-1">
          <FileText className="h-3 w-3" />
          {change.impactedReports.length} report{change.impactedReports.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}

/**
 * Changes Section
 */
interface ChangesSectionProps {
  title: string
  icon: React.ReactNode
  changes: DetectedChange[]
  emptyMessage: string
  headerColor: string
}

function ChangesSection({ title, icon, changes, emptyMessage, headerColor }: ChangesSectionProps) {
  if (changes.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className={cn('text-base flex items-center gap-2', headerColor)}>
            {icon}
            {title} (0)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={cn('text-base flex items-center gap-2', headerColor)}>
          {icon}
          {title} ({changes.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {changes.map(change => (
          <ChangeSummaryRow key={change.id} change={change} />
        ))}
      </CardContent>
    </Card>
  )
}

/**
 * Impacted Reports Card
 */
interface ImpactedReportsProps {
  reports: string[]
}

function ImpactedReports({ reports }: ImpactedReportsProps) {
  if (reports.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          Impacted Reports ({reports.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {reports.map((report, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-md text-sm font-medium"
            >
              <FileText className="h-3 w-3" />
              {report}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface CatalogUpdatesStepProps {
  changes: DetectedChange[]
  summary: CatalogUpdateSummary
  onComplete: () => void
}

export function CatalogUpdatesStep({ changes, summary, onComplete }: CatalogUpdatesStepProps) {
  // Group changes by status
  const groupedChanges = useMemo(() => ({
    accepted: changes.filter(c => c.status === 'accepted'),
    modified: changes.filter(c => c.status === 'modified'),
    rejected: changes.filter(c => c.status === 'rejected'),
  }), [changes])

  const hasAcceptedChanges = groupedChanges.accepted.length > 0 || groupedChanges.modified.length > 0

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <SummaryStats summary={summary} />

      {/* Warning if no changes accepted */}
      {!hasAcceptedChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-800">No Changes Accepted</h3>
            <p className="text-sm text-amber-700 mt-1">
              All detected changes have been rejected. The report catalog will not be updated.
              You can still proceed to stakeholder approval to document this decision.
            </p>
          </div>
        </div>
      )}

      {/* Accepted Changes */}
      <ChangesSection
        title="Accepted Changes"
        icon={<CheckCircle2 className="h-5 w-5" />}
        changes={groupedChanges.accepted}
        emptyMessage="No changes were accepted as-is"
        headerColor="text-green-600"
      />

      {/* Modified Changes */}
      <ChangesSection
        title="Accepted with Modifications"
        icon={<Edit3 className="h-5 w-5" />}
        changes={groupedChanges.modified}
        emptyMessage="No changes were accepted with modifications"
        headerColor="text-purple-600"
      />

      {/* Rejected Changes */}
      <ChangesSection
        title="Rejected Changes"
        icon={<XCircle className="h-5 w-5" />}
        changes={groupedChanges.rejected}
        emptyMessage="No changes were rejected"
        headerColor="text-red-600"
      />

      {/* Impacted Reports */}
      <ImpactedReports reports={summary.impactedReports} />

      {/* Action */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} className="gap-2">
          Proceed to Stakeholder Approval
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default CatalogUpdatesStep
