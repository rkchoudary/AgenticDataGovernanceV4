/**
 * ComplianceChecklistStep Component
 * 
 * Displays attestation checklist items with acknowledgment checkboxes.
 * Users must acknowledge all required items before proceeding to attestation.
 * 
 * Requirements: 11.3
 */

import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  Circle,
  MinusCircle,
  CheckSquare,
  Shield,
  FileText,
  Building,
  AlertTriangle,
  Book,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  ChecklistItem,
  ChecklistCategory,
  ChecklistItemStatus,
  CHECKLIST_CATEGORY_CONFIG,
  allRequiredItemsAcknowledged,
  getPendingChecklistItems,
} from './types'

// ============================================================================
// Icon Mapping
// ============================================================================

const CATEGORY_ICONS: Record<ChecklistCategory, React.ReactNode> = {
  data_quality: <CheckSquare className="h-4 w-4" />,
  regulatory_compliance: <FileText className="h-4 w-4" />,
  controls: <Shield className="h-4 w-4" />,
  documentation: <Book className="h-4 w-4" />,
  governance: <Building className="h-4 w-4" />,
  risk_management: <AlertTriangle className="h-4 w-4" />,
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ChecklistItemCardProps {
  item: ChecklistItem
  onStatusChange: (itemId: string, status: ChecklistItemStatus, notes?: string) => void
}

function ChecklistItemCard({ item, onStatusChange }: ChecklistItemCardProps) {
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(item.notes || '')

  const statusConfig = {
    pending: {
      icon: Circle,
      color: 'text-gray-400',
      bg: 'bg-gray-100',
      label: 'Pending',
    },
    acknowledged: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-100',
      label: 'Acknowledged',
    },
    not_applicable: {
      icon: MinusCircle,
      color: 'text-gray-500',
      bg: 'bg-gray-100',
      label: 'N/A',
    },
  }

  const config = statusConfig[item.status]
  const StatusIcon = config.icon

  const handleAcknowledge = () => {
    onStatusChange(item.id, 'acknowledged', notes || undefined)
  }

  const handleNotApplicable = () => {
    onStatusChange(item.id, 'not_applicable', notes || undefined)
  }

  const handleReset = () => {
    onStatusChange(item.id, 'pending')
    setNotes('')
  }

  return (
    <div className={cn(
      'border rounded-lg p-4 transition-colors',
      item.status === 'acknowledged' && 'border-green-200 bg-green-50/50',
      item.status === 'not_applicable' && 'border-gray-200 bg-gray-50/50'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn('p-1.5 rounded-full mt-0.5', config.bg)}>
          <StatusIcon className={cn('h-4 w-4', config.color)} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium text-sm">
                {item.title}
                {item.isRequired && (
                  <span className="text-red-500 ml-1">*</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {item.description}
              </p>
            </div>
            
            {item.status !== 'pending' && (
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full whitespace-nowrap',
                config.bg, config.color
              )}>
                {config.label}
              </span>
            )}
          </div>

          {/* Linked Artifacts */}
          {item.linkedArtifacts && item.linkedArtifacts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.linkedArtifacts.map((artifact, idx) => (
                <span
                  key={idx}
                  className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700"
                >
                  {artifact}
                </span>
              ))}
            </div>
          )}

          {/* Notes Toggle */}
          <button
            className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover:text-foreground"
            onClick={() => setShowNotes(!showNotes)}
          >
            {showNotes ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {item.notes ? 'View notes' : 'Add notes'}
          </button>

          {/* Notes Input */}
          {showNotes && (
            <textarea
              className="w-full mt-2 p-2 text-sm border rounded-md bg-background resize-none"
              placeholder="Add optional notes..."
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={item.status !== 'pending'}
            />
          )}

          {/* Actions */}
          {item.status === 'pending' ? (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleAcknowledge}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Acknowledge
              </Button>
              {!item.isRequired && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleNotApplicable}
                >
                  <MinusCircle className="h-4 w-4 mr-1" />
                  Not Applicable
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
              >
                Reset
              </Button>
              {item.acknowledgedAt && (
                <span className="text-xs text-muted-foreground">
                  {new Date(item.acknowledgedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface CategorySectionProps {
  category: ChecklistCategory
  items: ChecklistItem[]
  isExpanded: boolean
  onToggle: () => void
  onItemStatusChange: (itemId: string, status: ChecklistItemStatus, notes?: string) => void
}

function CategorySection({
  category,
  items,
  isExpanded,
  onToggle,
  onItemStatusChange,
}: CategorySectionProps) {
  const config = CHECKLIST_CATEGORY_CONFIG[category]
  const acknowledgedCount = items.filter(
    i => i.status === 'acknowledged' || i.status === 'not_applicable'
  ).length
  const allComplete = acknowledgedCount === items.length

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className={cn(
          'w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left',
          allComplete && 'bg-green-50'
        )}
        onClick={onToggle}
      >
        <div className={cn(
          'p-2 rounded-lg',
          allComplete ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground'
        )}>
          {CATEGORY_ICONS[category]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{config.label}</p>
          <p className="text-sm text-muted-foreground">{config.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            'text-sm font-medium',
            allComplete ? 'text-green-600' : 'text-muted-foreground'
          )}>
            {acknowledgedCount}/{items.length}
          </span>
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="p-4 pt-0 space-y-3 border-t bg-muted/30">
          {items.map(item => (
            <ChecklistItemCard
              key={item.id}
              item={item}
              onStatusChange={onItemStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface ComplianceChecklistStepProps {
  items: ChecklistItem[]
  onItemStatusChange: (itemId: string, status: ChecklistItemStatus, notes?: string) => void
  onComplete: () => void
}

export function ComplianceChecklistStep({
  items,
  onItemStatusChange,
  onComplete,
}: ComplianceChecklistStepProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<ChecklistCategory>>(
    new Set(['data_quality', 'regulatory_compliance'])
  )

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const grouped = new Map<ChecklistCategory, ChecklistItem[]>()
    for (const item of items) {
      const existing = grouped.get(item.category) || []
      grouped.set(item.category, [...existing, item])
    }
    return grouped
  }, [items])

  // Calculate progress
  const totalItems = items.length
  const acknowledgedItems = items.filter(
    i => i.status === 'acknowledged' || i.status === 'not_applicable'
  ).length
  const pendingRequired = getPendingChecklistItems(items)
  const canProceed = allRequiredItemsAcknowledged(items)

  const toggleCategory = (category: ChecklistCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  const acknowledgeAll = () => {
    for (const item of items) {
      if (item.status === 'pending') {
        onItemStatusChange(item.id, 'acknowledged')
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Compliance Checklist</h2>
        <p className="text-muted-foreground mt-1">
          Review and acknowledge all required items before attestation
        </p>
      </div>

      {/* Progress Summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16">
                <svg className="h-16 w-16 -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="text-muted"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeDasharray={`${(acknowledgedItems / totalItems) * 176} 176`}
                    className="text-primary"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                  {Math.round((acknowledgedItems / totalItems) * 100)}%
                </span>
              </div>
              <div>
                <p className="font-medium">
                  {acknowledgedItems} of {totalItems} items acknowledged
                </p>
                {pendingRequired.length > 0 ? (
                  <p className="text-sm text-amber-600">
                    {pendingRequired.length} required items pending
                  </p>
                ) : (
                  <p className="text-sm text-green-600">
                    All required items acknowledged
                  </p>
                )}
              </div>
            </div>
            
            {acknowledgedItems < totalItems && (
              <Button
                variant="outline"
                size="sm"
                onClick={acknowledgeAll}
              >
                Acknowledge All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">Acknowledgment Required</p>
            <p className="text-sm text-blue-700 mt-1">
              Items marked with <span className="text-red-500">*</span> are required and must be 
              acknowledged before proceeding to digital attestation. Optional items can be marked 
              as "Not Applicable" if they don't apply to this reporting cycle.
            </p>
          </div>
        </div>
      </div>

      {/* Category Sections */}
      <div className="space-y-3">
        {Array.from(itemsByCategory.entries()).map(([category, categoryItems]) => (
          <CategorySection
            key={category}
            category={category}
            items={categoryItems}
            isExpanded={expandedCategories.has(category)}
            onToggle={() => toggleCategory(category)}
            onItemStatusChange={onItemStatusChange}
          />
        ))}
      </div>

      {/* Pending Items Warning */}
      {pendingRequired.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Required Items Pending</p>
              <p className="text-sm text-amber-700 mt-1">
                The following required items must be acknowledged:
              </p>
              <ul className="mt-2 space-y-1">
                {pendingRequired.slice(0, 5).map(item => (
                  <li key={item.id} className="text-sm text-amber-700 flex items-center gap-2">
                    <Circle className="h-3 w-3" />
                    {item.title}
                  </li>
                ))}
                {pendingRequired.length > 5 && (
                  <li className="text-sm text-amber-700">
                    ...and {pendingRequired.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end">
        <Button
          onClick={onComplete}
          disabled={!canProceed}
        >
          Continue to Attestation
        </Button>
      </div>
    </div>
  )
}

export default ComplianceChecklistStep
