/**
 * DocumentApprovalStep Component
 * 
 * Step 4 of Data Requirements phase - displays summary of all mappings
 * and gaps, calculates completion percentage, and allows approval.
 * 
 * Requirements: 4.5
 */

import { useState, useMemo, useEffect } from 'react'
import {
  CheckCircle2,
  AlertCircle,
  Link,
  Clock,
  FileText,
  Database,
  Sparkles,
  Download,
  Printer,
  X,
  Edit2,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  DataRequirementElement,
  SourceMapping,
  DataGap,
  DataRequirementsSummary,
  ELEMENT_STATUS_CONFIG,
  GAP_RESOLUTION_CONFIG,
  DataElementStatus,
} from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Element Detail Panel - Interactive panel for viewing element details
 */
interface ElementDetailPanelProps {
  element: DataRequirementElement
  mapping?: SourceMapping
  onClose: () => void
  onStatusChange: (elementId: string, newStatus: DataElementStatus, newMapping?: SourceMapping) => void
}

function ElementDetailPanel({
  element,
  mapping,
  onClose,
  onStatusChange,
}: ElementDetailPanelProps) {
  const [editMode, setEditMode] = useState(false)
  const [newSourceSystem, setNewSourceSystem] = useState(mapping?.sourceSystem || '')
  const [newSourceTable, setNewSourceTable] = useState(mapping?.sourceTable || '')
  const [newSourceField, setNewSourceField] = useState(mapping?.sourceField || '')
  
  const config = ELEMENT_STATUS_CONFIG[element.status]
  
  const handleSaveMapping = () => {
    if (newSourceSystem && newSourceTable && newSourceField) {
      const newMapping: SourceMapping = {
        elementId: element.id,
        sourceSystem: newSourceSystem,
        sourceTable: newSourceTable,
        sourceField: newSourceField,
        confidence: 0.85,
        sampleData: [],
      }
      onStatusChange(element.id, 'mapped', newMapping)
      setEditMode(false)
    }
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
          
          {/* Current Mapping */}
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
          {(editMode || (!mapping && (element.status === 'gap' || element.status === 'pending'))) && (
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
          
          {/* Status Actions */}
          <div className="space-y-2 pt-4 border-t">
            <h4 className="text-sm font-medium text-muted-foreground">Actions</h4>
            <div className="flex flex-wrap gap-2">
              {element.status === 'validated' && (
                <>
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
                    onClick={() => onStatusChange(element.id, 'validated')}
                    className="gap-1 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-3 w-3" />
                    Validate Mapping
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(element.id, 'gap')}
                    className="gap-1 text-red-600 hover:text-red-700"
                  >
                    <AlertCircle className="h-3 w-3" />
                    Mark as Gap
                  </Button>
                </>
              )}
              
              {element.status === 'gap' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatusChange(element.id, 'pending')}
                  className="gap-1"
                >
                  <Clock className="h-3 w-3" />
                  Reset to Pending
                </Button>
              )}
              
              {element.status === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onStatusChange(element.id, 'gap')}
                  className="gap-1 text-red-600 hover:text-red-700"
                >
                  <AlertCircle className="h-3 w-3" />
                  Mark as Gap
                </Button>
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
 * Interactive Status Badge
 */
interface InteractiveStatusBadgeProps {
  element: DataRequirementElement
  onClick: () => void
}

function InteractiveStatusBadge({ element, onClick }: InteractiveStatusBadgeProps) {
  const config = ELEMENT_STATUS_CONFIG[element.status]
  
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all',
        'hover:ring-2 hover:ring-offset-1 cursor-pointer',
        config.bgColor,
        config.color,
        element.status === 'validated' && 'hover:ring-green-300',
        element.status === 'mapped' && 'hover:ring-blue-300',
        element.status === 'gap' && 'hover:ring-red-300',
        element.status === 'pending' && 'hover:ring-gray-300'
      )}
      title={`Click to view and edit ${element.name}`}
    >
      {element.status === 'validated' && <CheckCircle2 className="h-3 w-3" />}
      {element.status === 'mapped' && <Link className="h-3 w-3" />}
      {element.status === 'gap' && <AlertCircle className="h-3 w-3" />}
      {element.status === 'pending' && <Clock className="h-3 w-3" />}
      {config.label}
    </button>
  )
}

/**
 * Final Summary Card
 * Requirements: 4.5 - Calculate and show completion percentage
 */
interface FinalSummaryProps {
  summary: DataRequirementsSummary
}

function FinalSummary({ summary }: FinalSummaryProps) {
  const isComplete = summary.completionPercentage >= 100
  const hasGaps = summary.gapElements > 0
  
  return (
    <Card className={cn(
      isComplete ? 'border-green-200 bg-green-50/30' : 
      hasGaps ? 'border-amber-200 bg-amber-50/30' : ''
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Requirements Document Summary
          </CardTitle>
          {isComplete && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              Ready for Approval
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Overall Completion</span>
              <span className={cn(
                'text-sm font-bold',
                isComplete ? 'text-green-600' : 'text-primary'
              )}>
                {summary.completionPercentage}%
              </span>
            </div>
            <Progress 
              value={summary.completionPercentage} 
              className={cn('h-3', isComplete && '[&>div]:bg-green-500')}
            />
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary">{summary.totalElements}</p>
              <p className="text-xs text-muted-foreground">Total Elements</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{summary.validatedElements}</p>
              <p className="text-xs text-green-700">Validated</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{summary.mappedElements}</p>
              <p className="text-xs text-blue-700">Mapped</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{summary.gapElements}</p>
              <p className="text-xs text-red-700">Gaps</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{summary.pendingElements}</p>
              <p className="text-xs text-gray-700">Pending</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Mapping Summary Table
 */
interface MappingSummaryTableProps {
  elements: DataRequirementElement[]
  mappings: SourceMapping[]
  onElementClick: (element: DataRequirementElement) => void
}

function MappingSummaryTable({ elements, mappings, onElementClick }: MappingSummaryTableProps) {
  // Flatten elements
  const flatElements = useMemo(() => {
    const result: DataRequirementElement[] = []
    const flatten = (items: DataRequirementElement[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          flatten(item.children)
        } else {
          result.push(item)
        }
      })
    }
    flatten(elements)
    return result
  }, [elements])
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Element Mappings
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Click on status badges to view details and make changes
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium">Element</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Source</th>
                <th className="text-left py-2 px-3 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {flatElements.map(element => {
                const mapping = mappings.find(m => m.elementId === element.id)
                
                return (
                  <tr key={element.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 px-3">
                      <div>
                        <p className="font-medium">{element.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {element.dataType} • {element.format}
                        </p>
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <InteractiveStatusBadge
                        element={element}
                        onClick={() => onElementClick(element)}
                      />
                    </td>
                    <td className="py-2 px-3">
                      {mapping ? (
                        <span className="font-mono text-xs">
                          {mapping.sourceSystem}.{mapping.sourceTable}.{mapping.sourceField}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {mapping ? (
                        <span className={cn(
                          'text-xs font-medium',
                          mapping.confidence >= 0.9 ? 'text-green-600' :
                          mapping.confidence >= 0.7 ? 'text-amber-600' :
                          'text-red-600'
                        )}>
                          {Math.round(mapping.confidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Gap Resolution Summary
 */
interface GapResolutionSummaryProps {
  gaps: DataGap[]
  elements: DataRequirementElement[]
}

function GapResolutionSummary({ gaps, elements }: GapResolutionSummaryProps) {
  if (gaps.length === 0) return null
  
  // Flatten elements to check their status
  const flatElements = useMemo(() => {
    const result: DataRequirementElement[] = []
    const flatten = (items: DataRequirementElement[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          flatten(item.children)
        } else {
          result.push(item)
        }
      })
    }
    flatten(elements)
    return result
  }, [elements])
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          Gap Resolutions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {gaps.map(gap => {
            const resolution = gap.resolution
            const resolutionConfig = resolution ? GAP_RESOLUTION_CONFIG[resolution.action] : null
            // Check if element has been mapped/validated (resolves the gap)
            const element = flatElements.find(e => e.id === gap.elementId)
            const isElementResolved = element && (element.status === 'mapped' || element.status === 'validated')
            const isResolved = resolution || isElementResolved
            
            return (
              <div
                key={gap.id}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg',
                  isResolved ? 'bg-green-50' : 'bg-red-50'
                )}
              >
                <div className="flex items-center gap-3">
                  {isResolved ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-medium text-sm">{gap.elementName}</p>
                    <p className="text-xs text-muted-foreground">
                      {resolution ? resolutionConfig?.label : isElementResolved ? 'Mapped' : 'Unresolved'}
                    </p>
                  </div>
                </div>
                {resolution && (
                  <span className="text-xs text-muted-foreground">
                    {gap.resolvedAt && new Date(gap.resolvedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Approval Actions
 */
interface ApprovalActionsProps {
  canApprove: boolean
  onApprove: () => void
}

function ApprovalActions({ canApprove, onApprove }: ApprovalActionsProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export Document
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Printer className="h-4 w-4" />
              Print Preview
            </Button>
          </div>
          
          <Button 
            onClick={onApprove} 
            disabled={!canApprove}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve Requirements Document
          </Button>
        </div>
        
        {!canApprove && (
          <p className="text-xs text-amber-600 mt-3 text-right">
            All elements must be mapped or validated before approval
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface DocumentApprovalStepProps {
  elements: DataRequirementElement[]
  mappings: SourceMapping[]
  gaps: DataGap[]
  onComplete: () => void
  onUpdateElementStatus?: (elementId: string, status: DataElementStatus) => void
  onAddMapping?: (mapping: SourceMapping) => void
}

export function DocumentApprovalStep({
  elements,
  mappings,
  gaps,
  onComplete,
  onUpdateElementStatus,
  onAddMapping,
}: DocumentApprovalStepProps) {
  // Track selected element for detail panel
  const [selectedElement, setSelectedElement] = useState<DataRequirementElement | null>(null)
  
  // Local state for elements to ensure UI updates
  const [localElements, setLocalElements] = useState<DataRequirementElement[]>(elements)
  
  // Local state for mappings
  const [localMappings, setLocalMappings] = useState<SourceMapping[]>(mappings)
  
  // Sync local elements with props when they change from parent
  useEffect(() => {
    setLocalElements(elements)
  }, [elements])
  
  // Sync local mappings with props
  useEffect(() => {
    setLocalMappings(mappings)
  }, [mappings])
  
  // Calculate local summary based on local elements
  const localSummary = useMemo<DataRequirementsSummary>(() => {
    const flatElements: DataRequirementElement[] = []
    const flatten = (items: DataRequirementElement[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          flatten(item.children)
        } else {
          flatElements.push(item)
        }
      })
    }
    flatten(localElements)
    
    const mapped = flatElements.filter(e => e.status === 'mapped').length
    const validated = flatElements.filter(e => e.status === 'validated').length
    const gap = flatElements.filter(e => e.status === 'gap').length
    const pending = flatElements.filter(e => e.status === 'pending').length
    const total = flatElements.length
    
    const completionPercentage = total > 0 
      ? Math.round(((mapped + validated) / total) * 100)
      : 0
    
    return {
      totalElements: total,
      mappedElements: mapped,
      validatedElements: validated,
      gapElements: gap,
      pendingElements: pending,
      completionPercentage,
      lastUpdated: new Date().toISOString(),
    }
  }, [localElements])
  
  // Can approve if completion is high enough and no unresolved gaps
  // A gap is considered resolved if it has a resolution OR if the element has been mapped/validated
  const unresolvedGaps = useMemo(() => {
    // Flatten elements to check their status
    const flatElements: DataRequirementElement[] = []
    const flatten = (items: DataRequirementElement[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          flatten(item.children)
        } else {
          flatElements.push(item)
        }
      })
    }
    flatten(localElements)
    
    return gaps.filter(g => {
      // Gap is resolved if it has a resolution
      if (g.resolution) return false
      // Gap is also resolved if the element has been mapped or validated
      const element = flatElements.find(e => e.id === g.elementId)
      if (element && (element.status === 'mapped' || element.status === 'validated')) return false
      return true
    })
  }, [gaps, localElements])
  
  const canApprove = localSummary.completionPercentage >= 80 && unresolvedGaps.length === 0
  
  // Handle status change
  const handleStatusChange = (elementId: string, newStatus: DataElementStatus, newMapping?: SourceMapping) => {
    // Update parent state
    if (onUpdateElementStatus) {
      onUpdateElementStatus(elementId, newStatus)
    }
    
    // Add new mapping if provided
    if (newMapping) {
      if (onAddMapping) {
        onAddMapping(newMapping)
      }
      // Update local mappings
      setLocalMappings(prev => [...prev.filter(m => m.elementId !== newMapping.elementId), newMapping])
    }
    
    // Update local state for immediate UI feedback
    const updateElementStatus = (items: DataRequirementElement[]): DataRequirementElement[] => {
      return items.map(item => {
        if (item.id === elementId) {
          return { ...item, status: newStatus }
        }
        if (item.children) {
          return { ...item, children: updateElementStatus(item.children) }
        }
        return item
      })
    }
    setLocalElements(prev => updateElementStatus(prev))
    
    setSelectedElement(null)
  }

  return (
    <div className="space-y-6">
      {/* Final Summary */}
      <FinalSummary summary={localSummary} />

      {/* AI Notes */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-sm mb-1">AI Analysis Summary</h4>
              <p className="text-sm text-muted-foreground">
                The requirements document has been analyzed and validated. 
                {localSummary.validatedElements} elements have been validated with sample data, 
                {localSummary.mappedElements} elements are mapped to source fields, 
                and {gaps.length} gaps have been identified and addressed.
                {canApprove 
                  ? ' The document is ready for approval.'
                  : ' Please resolve remaining issues before approval.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mapping Summary */}
      <MappingSummaryTable 
        elements={localElements} 
        mappings={localMappings} 
        onElementClick={setSelectedElement}
      />

      {/* Gap Resolution Summary */}
      <GapResolutionSummary gaps={gaps} elements={localElements} />

      {/* Approval Actions */}
      <ApprovalActions canApprove={canApprove} onApprove={onComplete} />
      
      {/* Element Detail Panel */}
      {selectedElement && (() => {
        // Find the current element from localElements to get updated status
        const findElement = (items: DataRequirementElement[]): DataRequirementElement | undefined => {
          for (const item of items) {
            if (item.id === selectedElement.id) return item
            if (item.children) {
              const found = findElement(item.children)
              if (found) return found
            }
          }
          return undefined
        }
        const currentElement = findElement(localElements) || selectedElement
        
        return (
          <ElementDetailPanel
            element={currentElement}
            mapping={localMappings.find(m => m.elementId === currentElement.id)}
            onClose={() => setSelectedElement(null)}
            onStatusChange={handleStatusChange}
          />
        )
      })()}
    </div>
  )
}

export default DocumentApprovalStep
