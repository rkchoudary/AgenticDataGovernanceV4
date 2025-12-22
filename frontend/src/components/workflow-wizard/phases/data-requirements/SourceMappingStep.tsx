/**
 * SourceMappingStep Component
 * 
 * Step 2 of Data Requirements phase - validates source mappings
 * with sample data preview and completion percentage.
 * 
 * Requirements: 4.2, 4.4, 4.5
 */

import { useState, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Link,
  Database,
  Table,
  Eye,
  Check,
  Layers,
  ArrowRight,
  X,
  Edit2,
  RefreshCw,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  DataRequirementElement,
  SourceMapping,
  DataRequirementsSummary,
  ELEMENT_STATUS_CONFIG,
  DataElementStatus,
} from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Status Detail Panel - Interactive panel for viewing and fixing status issues
 */
interface StatusDetailPanelProps {
  element: DataRequirementElement
  mapping?: SourceMapping
  onClose: () => void
  onStatusChange: (elementId: string, newStatus: DataElementStatus) => void
  onValidate: (elementId: string, isValid: boolean) => void
}

function StatusDetailPanel({
  element,
  mapping,
  onClose,
  onStatusChange,
  onValidate,
}: StatusDetailPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [newSourceSystem, setNewSourceSystem] = useState(mapping?.sourceSystem || '')
  const [newSourceTable, setNewSourceTable] = useState(mapping?.sourceTable || '')
  const [newSourceField, setNewSourceField] = useState(mapping?.sourceField || '')
  
  const config = ELEMENT_STATUS_CONFIG[element.status]
  
  const handleSaveMapping = () => {
    // In a real app, this would call an API to save the mapping
    if (newSourceSystem && newSourceTable && newSourceField) {
      onStatusChange(element.id, 'mapped')
      setEditMode(false)
    }
  }
  
  const handleRevalidate = () => {
    // Trigger revalidation
    onValidate(element.id, true)
  }
  
  const handleMarkAsGap = () => {
    onStatusChange(element.id, 'gap')
  }
  
  const handleResetToPending = () => {
    onStatusChange(element.id, 'pending')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span className={cn(
              'px-3 py-1 rounded-full text-sm font-medium',
              config.bgColor,
              config.color
            )}>
              {config.label}
            </span>
            <h3 className="font-semibold">{element.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Element Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Element Details</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Data Type:</span>
                <span className="ml-2 font-medium">{element.dataType}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Format:</span>
                <span className="ml-2 font-mono text-xs bg-muted px-2 py-0.5 rounded">{element.format}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Definition:</span>
                <p className="mt-1 text-sm">{element.regulatoryDefinition}</p>
              </div>
            </div>
          </div>
          
          {/* Current Mapping (if exists) */}
          {mapping && !editMode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-muted-foreground">Current Mapping</h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditMode(true)}
                  className="gap-1"
                >
                  <Edit2 className="h-3 w-3" />
                  Edit
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 font-mono text-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  {mapping.sourceSystem}.{mapping.sourceTable}.{mapping.sourceField}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Confidence: {Math.round(mapping.confidence * 100)}%</span>
                  {mapping.validatedBy && (
                    <span>Validated by: {mapping.validatedBy}</span>
                  )}
                </div>
                {mapping.sampleData && mapping.sampleData.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1">Sample Data:</p>
                    <div className="flex flex-wrap gap-1">
                      {mapping.sampleData.map((sample, i) => (
                        <span key={i} className="px-2 py-0.5 bg-background rounded text-xs font-mono">
                          {sample}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Edit Mapping Form */}
          {(editMode || (!mapping && element.status === 'gap')) && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                {mapping ? 'Edit Mapping' : 'Create Mapping'}
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Source System</label>
                  <input
                    type="text"
                    value={newSourceSystem}
                    onChange={(e) => setNewSourceSystem(e.target.value)}
                    placeholder="e.g., LOS"
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Source Table</label>
                  <input
                    type="text"
                    value={newSourceTable}
                    onChange={(e) => setNewSourceTable(e.target.value)}
                    placeholder="e.g., loans"
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Source Field</label>
                  <input
                    type="text"
                    value={newSourceField}
                    onChange={(e) => setNewSourceField(e.target.value)}
                    placeholder="e.g., loan_id"
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveMapping}>
                  Save Mapping
                </Button>
                {editMode && (
                  <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
          
          {/* Status-specific actions */}
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">Actions</h4>
            <div className="flex flex-wrap gap-2">
              {element.status === 'validated' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRevalidate}
                    className="gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Re-validate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(element.id, 'mapped')}
                    className="gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    Revoke Validation
                  </Button>
                </>
              )}
              
              {element.status === 'mapped' && (
                <>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => onValidate(element.id, true)}
                    className="gap-1 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-3 w-3" />
                    Validate Mapping
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMarkAsGap}
                    className="gap-1 text-red-600 hover:text-red-700"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Mark as Gap
                  </Button>
                </>
              )}
              
              {element.status === 'gap' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetToPending}
                    className="gap-1"
                  >
                    <Clock className="h-3 w-3" />
                    Reset to Pending
                  </Button>
                </>
              )}
              
              {element.status === 'pending' && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleMarkAsGap}
                    className="gap-1 text-red-600 hover:text-red-700"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Mark as Gap
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Interactive Status Badge - Clickable status indicator
 */
interface InteractiveStatusBadgeProps {
  status: DataElementStatus
  onClick: () => void
}

function InteractiveStatusBadge({ status, onClick }: InteractiveStatusBadgeProps) {
  const config = ELEMENT_STATUS_CONFIG[status]
  
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium transition-all',
        'hover:ring-2 hover:ring-offset-1 cursor-pointer',
        config.bgColor,
        config.color,
        status === 'validated' && 'hover:ring-green-300',
        status === 'mapped' && 'hover:ring-blue-300',
        status === 'gap' && 'hover:ring-red-300',
        status === 'pending' && 'hover:ring-gray-300'
      )}
      title={`Click to view and manage ${config.label} status`}
    >
      {config.label}
    </button>
  )
}

/**
 * Completion Progress Card
 * Requirements: 4.5 - Calculate and show completion percentage
 */
interface CompletionProgressProps {
  summary: DataRequirementsSummary
  onStatusClick: (status: DataElementStatus) => void
}

function CompletionProgress({ summary, onStatusClick }: CompletionProgressProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Mapping Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Completion</span>
              <span className="text-sm font-bold text-primary">
                {summary.completionPercentage}%
              </span>
            </div>
            <Progress value={summary.completionPercentage} className="h-2" />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => onStatusClick('validated')}
              className="text-center p-2 bg-green-50 rounded-lg hover:bg-green-100 hover:ring-2 hover:ring-green-300 transition-all cursor-pointer"
            >
              <p className="text-xl font-bold text-green-600">{summary.validatedElements}</p>
              <p className="text-xs text-green-700">Validated</p>
            </button>
            <button
              onClick={() => onStatusClick('mapped')}
              className="text-center p-2 bg-blue-50 rounded-lg hover:bg-blue-100 hover:ring-2 hover:ring-blue-300 transition-all cursor-pointer"
            >
              <p className="text-xl font-bold text-blue-600">{summary.mappedElements}</p>
              <p className="text-xs text-blue-700">Mapped</p>
            </button>
            <button
              onClick={() => onStatusClick('gap')}
              className="text-center p-2 bg-red-50 rounded-lg hover:bg-red-100 hover:ring-2 hover:ring-red-300 transition-all cursor-pointer"
            >
              <p className="text-xl font-bold text-red-600">{summary.gapElements}</p>
              <p className="text-xs text-red-700">Gaps</p>
            </button>
            <button
              onClick={() => onStatusClick('pending')}
              className="text-center p-2 bg-gray-50 rounded-lg hover:bg-gray-100 hover:ring-2 hover:ring-gray-300 transition-all cursor-pointer"
            >
              <p className="text-xl font-bold text-gray-600">{summary.pendingElements}</p>
              <p className="text-xs text-gray-700">Pending</p>
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Status Filter Panel - Shows filtered elements by status
 */
interface StatusFilterPanelProps {
  status: DataElementStatus
  elements: DataRequirementElement[]
  mappings: SourceMapping[]
  onClose: () => void
  onElementClick: (element: DataRequirementElement) => void
}

function StatusFilterPanel({
  status,
  elements,
  mappings,
  onClose,
  onElementClick,
}: StatusFilterPanelProps) {
  const config = ELEMENT_STATUS_CONFIG[status]
  
  // Flatten and filter elements by status
  const filteredElements = useMemo(() => {
    const result: DataRequirementElement[] = []
    const flatten = (items: DataRequirementElement[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          flatten(item.children)
        } else if (item.status === status) {
          result.push(item)
        }
      })
    }
    flatten(elements)
    return result
  }, [elements, status])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <span className={cn(
              'px-3 py-1 rounded-full text-sm font-medium',
              config.bgColor,
              config.color
            )}>
              {config.label}
            </span>
            <h3 className="font-semibold">
              {filteredElements.length} Element{filteredElements.length !== 1 ? 's' : ''}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-auto max-h-[60vh]">
          {filteredElements.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No elements with {config.label.toLowerCase()} status
            </p>
          ) : (
            <div className="space-y-2">
              {filteredElements.map(element => {
                const mapping = mappings.find(m => m.elementId === element.id)
                return (
                  <button
                    key={element.id}
                    onClick={() => onElementClick(element)}
                    className="w-full text-left p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{element.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {element.regulatoryDefinition}
                        </p>
                      </div>
                      {mapping && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {mapping.sourceSystem}.{mapping.sourceField}
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t bg-muted/30">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Sample Data Preview
 * Requirements: 4.4 - Display sample data from source field
 */
interface SampleDataPreviewProps {
  mapping: SourceMapping
}

function SampleDataPreview({ mapping }: SampleDataPreviewProps) {
  if (!mapping.sampleData || mapping.sampleData.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic">
        No sample data available
      </div>
    )
  }
  
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium">Sample Data:</p>
      <div className="flex flex-wrap gap-1">
        {mapping.sampleData.slice(0, 3).map((sample, index) => (
          <span
            key={index}
            className="px-2 py-0.5 bg-muted rounded text-xs font-mono"
          >
            {sample}
          </span>
        ))}
        {mapping.sampleData.length > 3 && (
          <span className="text-xs text-muted-foreground">
            +{mapping.sampleData.length - 3} more
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Mapping Card with validation
 * Requirements: 4.4 - Display sample data preview from source field
 */
interface MappingCardProps {
  element: DataRequirementElement
  mapping?: SourceMapping
  onValidate: (elementId: string, isValid: boolean) => void
  onStatusClick: (element: DataRequirementElement) => void
}

function MappingCard({ element, mapping, onValidate, onStatusClick }: MappingCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const confidencePercent = mapping ? Math.round(mapping.confidence * 100) : 0
  
  const isValidated = element.status === 'validated'
  const isMapped = element.status === 'mapped'
  const canValidate = isMapped && mapping
  
  return (
    <Card className={cn(
      'transition-all',
      isValidated && 'border-green-200 bg-green-50/30',
      element.status === 'gap' && 'border-red-200 bg-red-50/30'
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <InteractiveStatusBadge
                status={element.status}
                onClick={() => onStatusClick(element)}
              />
              {element.mandatory && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  Required
                </span>
              )}
              {mapping && (
                <span className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  confidencePercent >= 90 ? 'bg-green-100 text-green-700' :
                  confidencePercent >= 70 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                )}>
                  {confidencePercent}% confidence
                </span>
              )}
            </div>
            <h4 className="font-semibold text-sm">{element.name}</h4>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {element.regulatoryDefinition}
            </p>
          </div>
          
          {canValidate && (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => onValidate(element.id, true)}
              >
                <Check className="h-3 w-3" />
                Validate
              </Button>
            </div>
          )}
          
          {isValidated && (
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          )}
        </div>

        {/* Mapping Details */}
        {mapping && (
          <div className="space-y-3">
            {/* Source Path */}
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Table className="h-4 w-4" />
                <span>{element.dataType}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-1 font-mono text-xs bg-muted px-2 py-1 rounded">
                <Database className="h-3 w-3" />
                {mapping.sourceSystem}.{mapping.sourceTable}.{mapping.sourceField}
              </div>
            </div>
            
            {/* Sample Data Preview */}
            <SampleDataPreview mapping={mapping} />
            
            {/* Validation Info */}
            {mapping.validatedBy && (
              <div className="text-xs text-muted-foreground">
                Validated by {mapping.validatedBy} on{' '}
                {new Date(mapping.validatedAt!).toLocaleDateString()}
              </div>
            )}
            
            {/* Transformation Logic */}
            {mapping.transformationLogic && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Eye className="h-3 w-3" />
                {showDetails ? 'Hide' : 'Show'} transformation logic
              </button>
            )}
            
            {showDetails && mapping.transformationLogic && (
              <div className="bg-muted/50 rounded p-2 text-xs font-mono">
                {mapping.transformationLogic}
              </div>
            )}
          </div>
        )}
        
        {/* No Mapping */}
        {!mapping && element.status !== 'gap' && (
          <div className="text-sm text-muted-foreground italic">
            No mapping configured yet
          </div>
        )}
        
        {/* Gap Indicator */}
        {element.status === 'gap' && (
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            Data gap - requires resolution in Gap Analysis step
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Section with expandable elements
 * Requirements: 4.2 - Support expand/collapse for sections
 */
interface MappingSectionProps {
  section: DataRequirementElement
  mappings: SourceMapping[]
  isExpanded: boolean
  onToggle: () => void
  onValidate: (elementId: string, isValid: boolean) => void
  onStatusClick: (element: DataRequirementElement) => void
}

function MappingSection({
  section,
  mappings,
  isExpanded,
  onToggle,
  onValidate,
  onStatusClick,
}: MappingSectionProps) {
  const children = section.children || []
  
  // Calculate section stats
  const stats = useMemo(() => {
    const validated = children.filter(c => c.status === 'validated').length
    const mapped = children.filter(c => c.status === 'mapped').length
    const gaps = children.filter(c => c.status === 'gap').length
    return { validated, mapped, gaps, total: children.length }
  }, [children])
  
  const completionPercent = stats.total > 0
    ? Math.round(((stats.validated + stats.mapped) / stats.total) * 100)
    : 0
  
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )}
          <Layers className="h-5 w-5 text-primary" />
          <div className="text-left">
            <h3 className="font-semibold">{section.name}</h3>
            <p className="text-xs text-muted-foreground">
              {stats.total} elements • {completionPercent}% complete
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              {stats.validated}
            </span>
            <span className="flex items-center gap-1 text-blue-600">
              <Link className="h-3 w-3" />
              {stats.mapped}
            </span>
            {stats.gaps > 0 && (
              <span className="flex items-center gap-1 text-red-600">
                <AlertCircle className="h-3 w-3" />
                {stats.gaps}
              </span>
            )}
          </div>
          <Progress value={completionPercent} className="w-24 h-2" />
        </div>
      </button>
      
      {isExpanded && (
        <div className="p-4 space-y-3 bg-background">
          {children.map(element => {
            const mapping = mappings.find(m => m.elementId === element.id)
            return (
              <MappingCard
                key={element.id}
                element={element}
                mapping={mapping}
                onValidate={onValidate}
                onStatusClick={onStatusClick}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface SourceMappingStepProps {
  elements: DataRequirementElement[]
  mappings: SourceMapping[]
  onValidateMapping: (elementId: string, isValid: boolean) => void
  onUpdateElementStatus: (elementId: string, status: DataRequirementElement['status']) => void
  summary: DataRequirementsSummary
  onComplete: () => void
}

export function SourceMappingStep({
  elements,
  mappings,
  onValidateMapping,
  onUpdateElementStatus,
  summary,
  onComplete,
}: SourceMappingStepProps) {
  // Track expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(elements.map(e => e.id))
  )
  
  // Track selected element for detail panel
  const [selectedElement, setSelectedElement] = useState<DataRequirementElement | null>(null)
  
  // Track status filter panel
  const [statusFilter, setStatusFilter] = useState<DataElementStatus | null>(null)
  
  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }
  
  // Handle status click from summary cards
  const handleStatusSummaryClick = (status: DataElementStatus) => {
    setStatusFilter(status)
  }
  
  // Handle element click from status filter panel
  const handleElementFromFilter = (element: DataRequirementElement) => {
    setStatusFilter(null)
    setSelectedElement(element)
  }
  
  // Handle status change from detail panel
  const handleStatusChange = (elementId: string, newStatus: DataElementStatus) => {
    onUpdateElementStatus(elementId, newStatus)
    setSelectedElement(null)
  }
  
  // Check if can proceed (all mapped elements should be validated)
  const canProceed = summary.gapElements > 0 || summary.mappedElements === 0 || 
    summary.validatedElements >= summary.mappedElements

  return (
    <div className="space-y-6">
      {/* Progress Summary - Now Interactive */}
      <CompletionProgress summary={summary} onStatusClick={handleStatusSummaryClick} />

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Link className="h-5 w-5 text-primary" />
            Source Mapping Validation
          </h3>
          <p className="text-sm text-muted-foreground">
            Review and validate source field mappings with sample data preview.
            Click on status badges to view details and make changes.
          </p>
        </div>
      </div>

      {/* Mapping Sections */}
      <div className="space-y-4">
        {elements.map(section => (
          <MappingSection
            key={section.id}
            section={section}
            mappings={mappings}
            isExpanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            onValidate={onValidateMapping}
            onStatusClick={setSelectedElement}
          />
        ))}
      </div>

      {/* Action */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {summary.gapElements > 0 && (
            <span className="text-amber-600">
              {summary.gapElements} gap{summary.gapElements !== 1 ? 's' : ''} require resolution in the next step
            </span>
          )}
        </div>
        <Button onClick={onComplete} className="gap-2" disabled={!canProceed}>
          Proceed to Gap Analysis
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Status Detail Panel */}
      {selectedElement && (
        <StatusDetailPanel
          element={selectedElement}
          mapping={mappings.find(m => m.elementId === selectedElement.id)}
          onClose={() => setSelectedElement(null)}
          onStatusChange={handleStatusChange}
          onValidate={onValidateMapping}
        />
      )}
      
      {/* Status Filter Panel */}
      {statusFilter && (
        <StatusFilterPanel
          status={statusFilter}
          elements={elements}
          mappings={mappings}
          onClose={() => setStatusFilter(null)}
          onElementClick={handleElementFromFilter}
        />
      )}
    </div>
  )
}

export default SourceMappingStep
