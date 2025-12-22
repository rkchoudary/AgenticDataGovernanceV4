/**
 * InventoryApprovalStep Component
 * 
 * Step 2 of CDE Identification phase - allows users to approve or reject
 * CDEs for inclusion in the inventory.
 * 
 * Requirements: 5.1, 5.2
 */

import { useState, useMemo } from 'react'
import {
  Target,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Filter,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  CDE,
  CDEInventory,
  CDEIdentificationSummary,
  CDEStatus,
  CDE_STATUS_CONFIG,
} from './types'

// ============================================================================
// Status Badge Component
// ============================================================================

interface StatusBadgeProps {
  status: CDEStatus
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = CDE_STATUS_CONFIG[status]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      config.bgColor,
      config.color
    )}>
      {status === 'approved' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'rejected' && <XCircle className="h-3 w-3" />}
      {status === 'pending' && <AlertTriangle className="h-3 w-3" />}
      {status === 'needs_review' && <AlertTriangle className="h-3 w-3" />}
      {config.label}
    </span>
  )
}

// ============================================================================
// Score Badge Component
// ============================================================================

interface ScoreBadgeProps {
  score: number
}

function ScoreBadge({ score }: ScoreBadgeProps) {
  const getScoreColor = (s: number) => {
    if (s >= 90) return 'bg-green-100 text-green-700'
    if (s >= 75) return 'bg-blue-100 text-blue-700'
    if (s >= 60) return 'bg-amber-100 text-amber-700'
    return 'bg-red-100 text-red-700'
  }

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      getScoreColor(score)
    )}>
      {score}
    </span>
  )
}

// ============================================================================
// CDE Approval Card Component
// ============================================================================

interface CDEApprovalCardProps {
  cde: CDE
  onApprove: () => void
  onReject: (reason: string) => void
}

function CDEApprovalCard({ cde, onApprove, onReject }: CDEApprovalCardProps) {
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const handleReject = () => {
    if (rejectReason.trim()) {
      onReject(rejectReason)
      setShowRejectForm(false)
      setRejectReason('')
    }
  }

  return (
    <Card className={cn(
      'transition-all',
      cde.status === 'approved' && 'border-green-200 bg-green-50/50',
      cde.status === 'rejected' && 'border-red-200 bg-red-50/50'
    )}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-4">
          {/* CDE Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-primary shrink-0" />
              <span className="font-medium">{cde.name}</span>
              <ScoreBadge score={cde.overallScore} />
              <StatusBadge status={cde.status} />
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {cde.businessDefinition}
            </p>
            
            {/* AI Rationale */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
              <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-medium text-blue-700">AI Rationale</span>
                <p className="text-xs text-blue-600 mt-0.5">{cde.aiRationale}</p>
              </div>
            </div>
            
            {/* Source info */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>{cde.sourceSystem}</span>
              <span>•</span>
              <span className="font-mono">{cde.sourceTable}.{cde.sourceField}</span>
            </div>
            
            {/* Rejection reason if rejected */}
            {cde.status === 'rejected' && cde.rejectionReason && (
              <div className="mt-2 p-2 rounded bg-red-100 text-red-700 text-xs">
                <strong>Rejection reason:</strong> {cde.rejectionReason}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 shrink-0">
            {cde.status === 'pending' || cde.status === 'needs_review' ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-green-300 text-green-700 hover:bg-green-50"
                  onClick={onApprove}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => setShowRejectForm(true)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  // Reset to pending for re-review
                  onApprove() // This will be handled by parent to reset
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Reject Form */}
        {showRejectForm && (
          <div className="mt-4 p-3 rounded-lg border bg-muted/50">
            <label className="text-sm font-medium">Rejection Reason</label>
            <textarea
              className="w-full mt-1 p-2 text-sm border rounded-lg bg-background resize-none"
              rows={2}
              placeholder="Please provide a reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowRejectForm(false)
                  setRejectReason('')
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={!rejectReason.trim()}
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Filter Tabs Component
// ============================================================================

type FilterOption = 'all' | 'pending' | 'approved' | 'rejected'

interface FilterTabsProps {
  selected: FilterOption
  onSelect: (filter: FilterOption) => void
  counts: Record<FilterOption, number>
}

function FilterTabs({ selected, onSelect, counts }: FilterTabsProps) {
  const options: { value: FilterOption; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ]

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            selected === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {option.label}
          <span className="ml-1.5 text-xs opacity-70">
            ({counts[option.value]})
          </span>
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface InventoryApprovalStepProps {
  cdes: CDE[]
  inventory: CDEInventory
  onUpdateStatus: (cdeId: string, status: CDEStatus, rejectionReason?: string) => void
  summary: CDEIdentificationSummary
  onComplete: () => void
}

export function InventoryApprovalStep({
  cdes,
  inventory,
  onUpdateStatus,
  summary,
  onComplete,
}: InventoryApprovalStepProps) {
  const [filter, setFilter] = useState<FilterOption>('all')

  // Calculate filter counts
  const filterCounts = useMemo(() => ({
    all: cdes.length,
    pending: cdes.filter(c => c.status === 'pending' || c.status === 'needs_review').length,
    approved: cdes.filter(c => c.status === 'approved').length,
    rejected: cdes.filter(c => c.status === 'rejected').length,
  }), [cdes])

  // Filter CDEs
  const filteredCDEs = useMemo(() => {
    switch (filter) {
      case 'pending':
        return cdes.filter(c => c.status === 'pending' || c.status === 'needs_review')
      case 'approved':
        return cdes.filter(c => c.status === 'approved')
      case 'rejected':
        return cdes.filter(c => c.status === 'rejected')
      default:
        return cdes
    }
  }, [cdes, filter])

  // Check if all CDEs have been reviewed
  const allReviewed = filterCounts.pending === 0
  const canComplete = allReviewed

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          Inventory Approval
        </h2>
        <p className="text-muted-foreground mt-1">
          Review and approve or reject each CDE for inclusion in the inventory.
          All CDEs must be reviewed before proceeding.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{summary.totalCDEs}</p>
              <p className="text-xs text-muted-foreground">Total CDEs</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-700">{filterCounts.pending}</p>
              <p className="text-xs text-amber-600">Pending Review</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{summary.approvedCDEs}</p>
              <p className="text-xs text-green-600">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-700">{summary.rejectedCDEs}</p>
              <p className="text-xs text-red-600">Rejected</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inventory Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Inventory Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Report</dt>
              <dd className="font-medium">{inventory.reportName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Version</dt>
              <dd className="font-medium">v{inventory.version}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="font-medium capitalize">{inventory.status.replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd className="font-medium">
                {new Date(inventory.updatedAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Filter and List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">CDE Review</CardTitle>
              <CardDescription>
                Approve or reject each CDE based on its criticality assessment
              </CardDescription>
            </div>
            <FilterTabs
              selected={filter}
              onSelect={setFilter}
              counts={filterCounts}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredCDEs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No CDEs match the selected filter</p>
              </div>
            ) : (
              filteredCDEs.map(cde => (
                <CDEApprovalCard
                  key={cde.id}
                  cde={cde}
                  onApprove={() => onUpdateStatus(cde.id, 'approved')}
                  onReject={(reason) => onUpdateStatus(cde.id, 'rejected', reason)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Completion Warning */}
      {!canComplete && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            {filterCounts.pending} CDE(s) still require review before you can proceed.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} disabled={!canComplete}>
          Continue to Ownership Assignment
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default InventoryApprovalStep
