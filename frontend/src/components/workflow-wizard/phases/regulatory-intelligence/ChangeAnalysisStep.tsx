/**
 * ChangeAnalysisStep Component
 * 
 * Step 2 of Regulatory Intelligence phase - displays side-by-side
 * diff view for each change and supports accept/reject/modify actions.
 * 
 * Requirements: 3.3
 */

import { useState, useCallback, useMemo } from 'react'
import {
  CheckCircle2,
  XCircle,
  Edit3,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Calendar,
  FileText,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Plus,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DetectedChange, CHANGE_TYPE_CONFIG } from './types'

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
 * Status Badge Component
 */
interface StatusBadgeProps {
  status: DetectedChange['status']
}

function StatusBadge({ status }: StatusBadgeProps) {
  const config = {
    pending: { label: 'Pending Review', color: 'text-amber-700 bg-amber-100' },
    accepted: { label: 'Accepted', color: 'text-green-700 bg-green-100' },
    rejected: { label: 'Rejected', color: 'text-red-700 bg-red-100' },
    modified: { label: 'Accepted with Changes', color: 'text-purple-700 bg-purple-100' },
  }
  const { label, color } = config[status]
  
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
      color
    )}>
      {status === 'accepted' && <CheckCircle2 className="h-3 w-3" />}
      {status === 'rejected' && <XCircle className="h-3 w-3" />}
      {status === 'modified' && <Edit3 className="h-3 w-3" />}
      {status === 'pending' && <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  )
}

/**
 * Change List Item
 */
interface ChangeListItemProps {
  change: DetectedChange
  isSelected: boolean
  onClick: () => void
}

function ChangeListItem({ change, isSelected, onClick }: ChangeListItemProps) {
  const config = CHANGE_TYPE_CONFIG[change.changeType]
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        isSelected 
          ? 'border-primary bg-primary/5 shadow-sm' 
          : 'border-transparent hover:bg-muted/50'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
          config.bgColor,
          config.color
        )}>
          <ChangeTypeIcon type={change.changeType} />
          {config.label}
        </span>
        <StatusBadge status={change.status} />
      </div>
      <h4 className="font-medium text-sm truncate">{change.title}</h4>
      <p className="text-xs text-muted-foreground truncate">{change.source}</p>
    </button>
  )
}

/**
 * Diff View Component
 * Requirements: 3.3 - Side-by-side diff view
 */
interface DiffViewProps {
  currentValue?: string
  proposedValue?: string
}

function DiffView({ currentValue, proposedValue }: DiffViewProps) {
  if (!currentValue && !proposedValue) {
    return null
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Current Value */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Current Value</h4>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg min-h-[80px]">
          {currentValue ? (
            <p className="text-sm text-red-800">{currentValue}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No current value (new requirement)</p>
          )}
        </div>
      </div>

      {/* Proposed Value */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Proposed Value</h4>
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg min-h-[80px]">
          {proposedValue ? (
            <p className="text-sm text-green-800">{proposedValue}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Value will be removed</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Change Detail Panel
 */
interface ChangeDetailPanelProps {
  change: DetectedChange
  onAccept: () => void
  onReject: () => void
  onModify: (notes: string) => void
}

function ChangeDetailPanel({ change, onAccept, onReject, onModify }: ChangeDetailPanelProps) {
  const [showModifyDialog, setShowModifyDialog] = useState(false)
  const [modificationNotes, setModificationNotes] = useState('')
  const config = CHANGE_TYPE_CONFIG[change.changeType]
  const effectiveDate = new Date(change.effectiveDate)
  const confidence = Math.round(change.confidence * 100)

  const handleModifySubmit = useCallback(() => {
    if (modificationNotes.trim()) {
      onModify(modificationNotes.trim())
      setShowModifyDialog(false)
      setModificationNotes('')
    }
  }, [modificationNotes, onModify])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
              config.bgColor,
              config.color
            )}>
              <ChangeTypeIcon type={change.changeType} />
              {config.label}
            </span>
            <StatusBadge status={change.status} />
          </div>
          <h2 className="text-xl font-semibold">{change.title}</h2>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>Source: {change.source}</span>
            {change.sourceUrl && (
              <a
                href={change.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                View Source <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-sm">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span className={cn(
              'font-medium',
              confidence >= 90 ? 'text-green-600' : confidence >= 70 ? 'text-amber-600' : 'text-red-600'
            )}>
              {confidence}% confidence
            </span>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
            <Calendar className="h-4 w-4" />
            Effective: {effectiveDate.toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <h3 className="text-sm font-medium mb-2">Description</h3>
        <p className="text-sm text-muted-foreground">{change.description}</p>
      </div>

      {/* AI Summary */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
        <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
          <Sparkles className="h-4 w-4" />
          AI Analysis Summary
        </div>
        <p className="text-sm text-blue-800">{change.aiSummary}</p>
      </div>

      {/* Diff View */}
      {(change.currentValue || change.proposedValue) && (
        <div>
          <h3 className="text-sm font-medium mb-3">Value Comparison</h3>
          <DiffView 
            currentValue={change.currentValue} 
            proposedValue={change.proposedValue} 
          />
        </div>
      )}

      {/* Impacted Reports */}
      <div>
        <h3 className="text-sm font-medium mb-2">Impacted Reports</h3>
        <div className="flex flex-wrap gap-2">
          {change.impactedReports.map((report, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-muted rounded-md text-sm"
            >
              <FileText className="h-3 w-3" />
              {report}
            </span>
          ))}
        </div>
      </div>

      {/* Modification Notes (if modified) */}
      {change.status === 'modified' && change.modificationNotes && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-purple-700 mb-2">Modification Notes</h3>
          <p className="text-sm text-purple-800">{change.modificationNotes}</p>
        </div>
      )}

      {/* Actions */}
      {change.status === 'pending' && (
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            onClick={onAccept}
            className="bg-green-600 hover:bg-green-700 gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Accept Change
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowModifyDialog(true)}
            className="gap-2"
          >
            <Edit3 className="h-4 w-4" />
            Accept with Modifications
          </Button>
          <Button
            variant="outline"
            onClick={onReject}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2"
          >
            <XCircle className="h-4 w-4" />
            Reject Change
          </Button>
        </div>
      )}

      {/* Modify Dialog */}
      <Dialog open={showModifyDialog} onOpenChange={setShowModifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept with Modifications</DialogTitle>
            <DialogDescription>
              Provide notes explaining the modifications or conditions for accepting this change.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <textarea
              className="w-full min-h-[120px] p-3 border rounded-lg resize-none"
              placeholder="Enter modification notes..."
              value={modificationNotes}
              onChange={(e) => setModificationNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModifyDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleModifySubmit}
              disabled={!modificationNotes.trim()}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Accept with Modifications
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Progress Summary
 */
interface ProgressSummaryProps {
  changes: DetectedChange[]
}

function ProgressSummary({ changes }: ProgressSummaryProps) {
  const stats = useMemo(() => {
    const pending = changes.filter(c => c.status === 'pending').length
    const accepted = changes.filter(c => c.status === 'accepted').length
    const rejected = changes.filter(c => c.status === 'rejected').length
    const modified = changes.filter(c => c.status === 'modified').length
    const reviewed = accepted + rejected + modified
    return { pending, accepted, rejected, modified, reviewed, total: changes.length }
  }, [changes])

  const progressPercent = Math.round((stats.reviewed / stats.total) * 100)

  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Review Progress</span>
          <span className="text-sm text-muted-foreground">
            {stats.reviewed} of {stats.total} reviewed
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {stats.accepted} Accepted
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            {stats.modified} Modified
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {stats.rejected} Rejected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {stats.pending} Pending
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface ChangeAnalysisStepProps {
  changes: DetectedChange[]
  selectedChangeId: string | null
  onSelectChange: (id: string | null) => void
  onUpdateStatus: (id: string, status: DetectedChange['status'], notes?: string) => void
  onComplete: () => void
}

export function ChangeAnalysisStep({
  changes,
  selectedChangeId,
  onSelectChange,
  onUpdateStatus,
  onComplete,
}: ChangeAnalysisStepProps) {
  const selectedChange = changes.find(c => c.id === selectedChangeId)
  const allReviewed = changes.every(c => c.status !== 'pending')

  // Navigation helpers
  const currentIndex = selectedChangeId 
    ? changes.findIndex(c => c.id === selectedChangeId)
    : -1
  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < changes.length - 1

  const handlePrev = useCallback(() => {
    if (canGoPrev) {
      onSelectChange(changes[currentIndex - 1].id)
    }
  }, [canGoPrev, changes, currentIndex, onSelectChange])

  const handleNext = useCallback(() => {
    if (canGoNext) {
      onSelectChange(changes[currentIndex + 1].id)
    }
  }, [canGoNext, changes, currentIndex, onSelectChange])

  // Auto-select first change if none selected
  if (!selectedChangeId && changes.length > 0) {
    onSelectChange(changes[0].id)
  }

  return (
    <div className="space-y-6">
      {/* Progress Summary */}
      <ProgressSummary changes={changes} />

      {/* Main Content */}
      <div className="grid md:grid-cols-[280px_1fr] gap-6">
        {/* Change List */}
        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Changes ({changes.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[500px] overflow-auto">
            {changes.map(change => (
              <ChangeListItem
                key={change.id}
                change={change}
                isSelected={change.id === selectedChangeId}
                onClick={() => onSelectChange(change.id)}
              />
            ))}
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card>
          <CardContent className="p-6">
            {selectedChange ? (
              <>
                {/* Navigation */}
                <div className="flex items-center justify-between mb-4 pb-4 border-b">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePrev}
                    disabled={!canGoPrev}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {currentIndex + 1} of {changes.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNext}
                    disabled={!canGoNext}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>

                <ChangeDetailPanel
                  change={selectedChange}
                  onAccept={() => {
                    onUpdateStatus(selectedChange.id, 'accepted')
                    if (canGoNext) handleNext()
                  }}
                  onReject={() => {
                    onUpdateStatus(selectedChange.id, 'rejected')
                    if (canGoNext) handleNext()
                  }}
                  onModify={(notes) => {
                    onUpdateStatus(selectedChange.id, 'modified', notes)
                    if (canGoNext) handleNext()
                  }}
                />
              </>
            ) : (
              <div className="text-center text-muted-foreground py-12">
                Select a change from the list to review
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {allReviewed ? (
            <span className="text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              All changes reviewed
            </span>
          ) : (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              {changes.filter(c => c.status === 'pending').length} changes pending review
            </span>
          )}
        </div>
        <Button 
          onClick={onComplete} 
          disabled={!allReviewed}
          className="gap-2"
        >
          Proceed to Catalog Updates
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default ChangeAnalysisStep
