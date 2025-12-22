/**
 * ReconciliationStep Component
 * 
 * Step 4 of CDE Identification phase - displays three-column comparison
 * view for reconciling CDEs with external lists and supports bulk actions.
 * 
 * Requirements: 5.5
 */

import { useState, useMemo } from 'react'
import {
  Target,
  GitCompare,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Merge,
  Plus,
  Minus,
  SkipForward,
  Filter,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  CDE,
  ExternalCDEList,
  ExternalCDE,
  ReconciliationMatch,
  MATCH_TYPE_CONFIG,
} from './types'

// ============================================================================
// Match Type Badge Component
// ============================================================================

interface MatchTypeBadgeProps {
  matchType: ReconciliationMatch['matchType']
}

function MatchTypeBadge({ matchType }: MatchTypeBadgeProps) {
  const config = MATCH_TYPE_CONFIG[matchType]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      config.bgColor,
      config.color
    )}>
      {matchType === 'exact' && <CheckCircle2 className="h-3 w-3" />}
      {matchType === 'partial' && <AlertTriangle className="h-3 w-3" />}
      {matchType === 'new' && <Plus className="h-3 w-3" />}
      {matchType === 'missing' && <Minus className="h-3 w-3" />}
      {config.label}
    </span>
  )
}

// ============================================================================
// Action Badge Component
// ============================================================================

interface ActionBadgeProps {
  action: ReconciliationMatch['actionTaken']
}

function ActionBadge({ action }: ActionBadgeProps) {
  if (!action) return null

  const config: Record<NonNullable<ReconciliationMatch['actionTaken']>, {
    label: string
    color: string
    bgColor: string
    icon: React.ReactNode
  }> = {
    keep: {
      label: 'Keep',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    merge: {
      label: 'Merge',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
      icon: <Merge className="h-3 w-3" />,
    },
    add: {
      label: 'Add',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      icon: <Plus className="h-3 w-3" />,
    },
    remove: {
      label: 'Remove',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      icon: <Minus className="h-3 w-3" />,
    },
    skip: {
      label: 'Skipped',
      color: 'text-gray-700',
      bgColor: 'bg-gray-100',
      icon: <SkipForward className="h-3 w-3" />,
    },
  }

  const actionConfig = config[action]
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      actionConfig.bgColor,
      actionConfig.color
    )}>
      {actionConfig.icon}
      {actionConfig.label}
    </span>
  )
}

// ============================================================================
// Reconciliation Row Component
// ============================================================================

interface ReconciliationRowProps {
  match: ReconciliationMatch
  currentCDE: CDE | undefined
  externalCDE: ExternalCDE | undefined
  externalList: ExternalCDEList | undefined
  onAction: (action: ReconciliationMatch['actionTaken'], notes?: string) => void
  isSelected: boolean
  onToggleSelect: () => void
}

function ReconciliationRow({
  match,
  currentCDE,
  externalCDE,
  externalList,
  onAction,
  isSelected,
  onToggleSelect,
}: ReconciliationRowProps) {
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(match.notes || '')

  const hasAction = !!match.actionTaken

  return (
    <div className={cn(
      'border rounded-lg overflow-hidden transition-all',
      hasAction ? 'border-green-200 bg-green-50/30' : 'border-border',
      isSelected && 'ring-2 ring-primary'
    )}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3 bg-muted/50 border-b">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded"
          disabled={hasAction}
        />
        <MatchTypeBadge matchType={match.matchType} />
        <span className="text-xs text-muted-foreground">
          Confidence: {Math.round(match.confidence * 100)}%
        </span>
        {match.actionTaken && (
          <ActionBadge action={match.actionTaken} />
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {externalList?.name}
        </span>
      </div>

      {/* Three Column Comparison */}
      <div className="grid grid-cols-3 divide-x">
        {/* Current CDE */}
        <div className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            Current Cycle
          </div>
          {currentCDE ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{currentCDE.name}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {currentCDE.businessDefinition}
              </p>
              {currentCDE.owner && (
                <p className="text-xs text-muted-foreground mt-1">
                  Owner: {currentCDE.owner.name}
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              Not in current cycle
            </div>
          )}
        </div>

        {/* Comparison Arrow */}
        <div className="p-4 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {match.matchType === 'exact' ? 'Matches' :
               match.matchType === 'partial' ? 'Similar' :
               match.matchType === 'new' ? 'New' : 'Missing'}
            </span>
          </div>
        </div>

        {/* External CDE */}
        <div className="p-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            External List
          </div>
          {externalCDE ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{externalCDE.name}</span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {externalCDE.definition}
              </p>
              {externalCDE.owner && (
                <p className="text-xs text-muted-foreground mt-1">
                  Owner: {externalCDE.owner}
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic">
              Not in external list
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {!hasAction && (
        <div className="p-3 bg-muted/30 border-t">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground mr-2">
              Suggested: <strong>{match.suggestedAction}</strong>
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onAction('keep')}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Keep
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onAction('merge')}
            >
              <Merge className="h-3 w-3 mr-1" />
              Merge
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onAction('add')}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-red-600 hover:text-red-700"
              onClick={() => onAction('remove')}
            >
              <Minus className="h-3 w-3 mr-1" />
              Remove
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => onAction('skip')}
            >
              <SkipForward className="h-3 w-3 mr-1" />
              Skip
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs ml-auto"
              onClick={() => setShowNotes(!showNotes)}
            >
              Add Notes
            </Button>
          </div>
          
          {showNotes && (
            <div className="mt-2">
              <textarea
                className="w-full p-2 text-sm border rounded-lg bg-background resize-none"
                rows={2}
                placeholder="Add notes about this reconciliation decision..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {/* Notes Display */}
      {hasAction && match.notes && (
        <div className="p-3 bg-muted/30 border-t">
          <p className="text-xs text-muted-foreground">
            <strong>Notes:</strong> {match.notes}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Bulk Actions Panel Component
// ============================================================================

interface BulkActionsPanelProps {
  selectedCount: number
  onBulkAction: (action: ReconciliationMatch['actionTaken']) => void
  onClearSelection: () => void
}

function BulkActionsPanel({ selectedCount, onBulkAction, onClearSelection }: BulkActionsPanelProps) {
  if (selectedCount === 0) return null

  return (
    <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
      <span className="text-sm font-medium">
        {selectedCount} item(s) selected
      </span>
      <div className="flex items-center gap-2 ml-auto">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBulkAction('keep')}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Keep All
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBulkAction('merge')}
        >
          <Merge className="h-4 w-4 mr-1" />
          Merge All
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onBulkAction('skip')}
        >
          <SkipForward className="h-4 w-4 mr-1" />
          Skip All
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
        >
          Clear Selection
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Filter Tabs Component
// ============================================================================

type FilterOption = 'all' | 'pending' | 'exact' | 'partial' | 'new' | 'missing'

interface FilterTabsProps {
  selected: FilterOption
  onSelect: (filter: FilterOption) => void
  counts: Record<FilterOption, number>
}

function FilterTabs({ selected, onSelect, counts }: FilterTabsProps) {
  const options: { value: FilterOption; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'exact', label: 'Exact' },
    { value: 'partial', label: 'Partial' },
    { value: 'new', label: 'New' },
    { value: 'missing', label: 'Missing' },
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

interface ReconciliationStepProps {
  cdes: CDE[]
  externalLists: ExternalCDEList[]
  matches: ReconciliationMatch[]
  onReconciliationAction: (currentCDEId: string, action: ReconciliationMatch['actionTaken'], notes?: string) => void
  onBulkAction: (cdeIds: string[], action: ReconciliationMatch['actionTaken']) => void
  onComplete: () => void
}

export function ReconciliationStep({
  cdes,
  externalLists,
  matches,
  onReconciliationAction,
  onBulkAction,
  onComplete,
}: ReconciliationStepProps) {
  const [filter, setFilter] = useState<FilterOption>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Calculate filter counts
  const filterCounts = useMemo(() => ({
    all: matches.length,
    pending: matches.filter(m => !m.actionTaken).length,
    exact: matches.filter(m => m.matchType === 'exact').length,
    partial: matches.filter(m => m.matchType === 'partial').length,
    new: matches.filter(m => m.matchType === 'new').length,
    missing: matches.filter(m => m.matchType === 'missing').length,
  }), [matches])

  // Filter matches
  const filteredMatches = useMemo(() => {
    switch (filter) {
      case 'pending':
        return matches.filter(m => !m.actionTaken)
      case 'exact':
        return matches.filter(m => m.matchType === 'exact')
      case 'partial':
        return matches.filter(m => m.matchType === 'partial')
      case 'new':
        return matches.filter(m => m.matchType === 'new')
      case 'missing':
        return matches.filter(m => m.matchType === 'missing')
      default:
        return matches
    }
  }, [matches, filter])

  // Get CDE and external CDE for a match
  const getCDEForMatch = (match: ReconciliationMatch) => 
    cdes.find(c => c.id === match.currentCDEId)
  
  const getExternalCDEForMatch = (match: ReconciliationMatch) => {
    const list = externalLists.find(l => l.id === match.externalListId)
    return list?.cdes.find(c => c.id === match.externalCDEId)
  }
  
  const getExternalListForMatch = (match: ReconciliationMatch) =>
    externalLists.find(l => l.id === match.externalListId)

  // Selection handlers
  const handleToggleSelect = (cdeId: string) => {
    setSelectedIds(prev =>
      prev.includes(cdeId)
        ? prev.filter(id => id !== cdeId)
        : [...prev, cdeId]
    )
  }

  const handleBulkAction = (action: ReconciliationMatch['actionTaken']) => {
    onBulkAction(selectedIds, action)
    setSelectedIds([])
  }

  // Check completion
  const allReconciled = filterCounts.pending === 0
  const canComplete = allReconciled

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-primary" />
          CDE Reconciliation
        </h2>
        <p className="text-muted-foreground mt-1">
          Compare current cycle CDEs with external lists and resolve any differences.
          Use bulk actions to process multiple items at once.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{matches.length}</p>
              <p className="text-xs text-muted-foreground">Total Matches</p>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(
          filterCounts.pending > 0 ? 'border-amber-200 bg-amber-50/50' : 'border-green-200 bg-green-50/50'
        )}>
          <CardContent className="pt-4">
            <div className="text-center">
              <p className={cn(
                'text-2xl font-bold',
                filterCounts.pending > 0 ? 'text-amber-700' : 'text-green-700'
              )}>
                {filterCounts.pending}
              </p>
              <p className={cn(
                'text-xs',
                filterCounts.pending > 0 ? 'text-amber-600' : 'text-green-600'
              )}>
                Pending
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{filterCounts.exact}</p>
              <p className="text-xs text-green-600">Exact Matches</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-700">{filterCounts.partial}</p>
              <p className="text-xs text-amber-600">Partial Matches</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-700">{filterCounts.new}</p>
              <p className="text-xs text-blue-600">New CDEs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* External Lists Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">External Lists</CardTitle>
          <CardDescription>
            Comparing against the following external CDE lists
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {externalLists.map(list => (
              <div key={list.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                <ExternalLink className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{list.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {list.cdes.length} CDEs • Updated {new Date(list.lastUpdated).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      <BulkActionsPanel
        selectedCount={selectedIds.length}
        onBulkAction={handleBulkAction}
        onClearSelection={() => setSelectedIds([])}
      />

      {/* Filter and List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Reconciliation Results</CardTitle>
              <CardDescription>
                Review and take action on each match
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
            {filteredMatches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No matches found for the selected filter</p>
              </div>
            ) : (
              filteredMatches.map(match => (
                <ReconciliationRow
                  key={match.currentCDEId}
                  match={match}
                  currentCDE={getCDEForMatch(match)}
                  externalCDE={getExternalCDEForMatch(match)}
                  externalList={getExternalListForMatch(match)}
                  onAction={(action, notes) => onReconciliationAction(match.currentCDEId, action, notes)}
                  isSelected={selectedIds.includes(match.currentCDEId)}
                  onToggleSelect={() => handleToggleSelect(match.currentCDEId)}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Completion Status */}
      {!canComplete && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            {filterCounts.pending} reconciliation item(s) still require action before you can proceed.
          </p>
        </div>
      )}

      {canComplete && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-green-50 border border-green-200 text-green-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            All reconciliation items have been processed. You can proceed to complete this phase.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} disabled={!canComplete}>
          Complete CDE Identification
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default ReconciliationStep
