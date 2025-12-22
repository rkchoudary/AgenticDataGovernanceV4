/**
 * TemplateParsingStep Component
 * 
 * Step 1 of Data Requirements phase - displays parsed template
 * with hierarchical data elements and status indicators.
 * 
 * Requirements: 4.1, 4.2
 */

import { useState, useMemo } from 'react'
import {
  FileText,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Link,
  Clock,
  Sparkles,
  Layers,
  Database,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  DataRequirementElement,
  TemplateParsingResult,
  ELEMENT_STATUS_CONFIG,
  DataElementStatus,
} from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Parsing Summary Card
 */
interface ParsingSummaryProps {
  parsingResult: TemplateParsingResult
}

function ParsingSummary({ parsingResult }: ParsingSummaryProps) {
  const parsedDate = new Date(parsingResult.parsedAt)
  const confidencePercent = Math.round(parsingResult.parsingConfidence * 100)
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {parsingResult.templateName}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Parsed: {parsedDate.toLocaleDateString()} at {parsedDate.toLocaleTimeString()}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-primary">{parsingResult.sectionsCount}</p>
            <p className="text-xs text-muted-foreground">Sections</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{parsingResult.totalElements}</p>
            <p className="text-xs text-muted-foreground">Data Elements</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{confidencePercent}%</p>
            <p className="text-xs text-muted-foreground">Parsing Confidence</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-amber-600">
              {parsingResult.elements.reduce((acc, section) => 
                acc + (section.children?.filter(e => e.mandatory).length || 0), 0
              )}
            </p>
            <p className="text-xs text-muted-foreground">Mandatory Fields</p>
          </div>
        </div>
        
        {parsingResult.aiNotes && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <div className="flex items-center gap-1 text-xs text-blue-700 font-medium mb-1">
              <Sparkles className="h-3 w-3" />
              AI Parsing Notes
            </div>
            <p className="text-sm text-blue-800">{parsingResult.aiNotes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Status Icon Component
 */
function StatusIcon({ status }: { status: DataRequirementElement['status'] }) {
  const iconMap = {
    validated: CheckCircle2,
    mapped: Link,
    gap: AlertCircle,
    pending: Clock,
  }
  const Icon = iconMap[status]
  const config = ELEMENT_STATUS_CONFIG[status]
  return <Icon className={cn('h-4 w-4', config.color)} />
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
      title={`Click to view ${config.label} details`}
    >
      {config.label}
    </button>
  )
}

/**
 * Element Detail Panel - Shows element details when status is clicked
 */
interface ElementDetailPanelProps {
  element: DataRequirementElement
  onClose: () => void
}

function ElementDetailPanel({ element, onClose }: ElementDetailPanelProps) {
  const config = ELEMENT_STATUS_CONFIG[element.status]
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] overflow-auto m-4">
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
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Regulatory Definition</label>
              <p className="text-sm mt-1">{element.regulatoryDefinition}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">Data Type</label>
                <p className="text-sm font-medium mt-1">{element.dataType}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Format</label>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded mt-1">{element.format}</p>
              </div>
            </div>
            
            {element.calculationLogic && (
              <div>
                <label className="text-xs text-muted-foreground">Calculation Logic</label>
                <p className="text-sm font-mono bg-muted p-2 rounded mt-1">{element.calculationLogic}</p>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              {element.mandatory && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  Required Field
                </span>
              )}
              {element.unit && (
                <span className="text-xs text-muted-foreground">
                  Unit: {element.unit}
                </span>
              )}
            </div>
          </div>
          
          {/* Status-specific info */}
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Status Information</h4>
            {element.status === 'validated' && (
              <p className="text-sm text-green-700 bg-green-50 p-3 rounded-lg">
                This element has been validated and is ready for use.
              </p>
            )}
            {element.status === 'mapped' && (
              <p className="text-sm text-blue-700 bg-blue-50 p-3 rounded-lg">
                This element has a source mapping but needs validation. Proceed to Source Mapping step to validate.
              </p>
            )}
            {element.status === 'gap' && (
              <p className="text-sm text-red-700 bg-red-50 p-3 rounded-lg">
                This element has a data gap that needs resolution. Proceed to Gap Analysis step to resolve.
              </p>
            )}
            {element.status === 'pending' && (
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                This element is pending mapping. Proceed to Source Mapping step to configure.
              </p>
            )}
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
 * Element Tree Item
 * Requirements: 4.2 - Hierarchical tree with expand/collapse
 */
interface ElementTreeItemProps {
  element: DataRequirementElement
  isExpanded: boolean
  onToggle: () => void
  onStatusClick: (element: DataRequirementElement) => void
}

function ElementTreeItem({ element, isExpanded, onToggle, onStatusClick }: ElementTreeItemProps) {
  const hasChildren = element.children && element.children.length > 0
  
  // Calculate section status based on children
  const sectionStatus = useMemo(() => {
    if (!hasChildren) return null
    const children = element.children!
    const validated = children.filter(c => c.status === 'validated').length
    const mapped = children.filter(c => c.status === 'mapped').length
    const gaps = children.filter(c => c.status === 'gap').length
    return { validated, mapped, gaps, total: children.length }
  }, [element.children, hasChildren])
  
  if (hasChildren) {
    // Section header
    return (
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-medium">{element.name}</span>
          </div>
          {sectionStatus && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600">{sectionStatus.validated} validated</span>
              <span className="text-blue-600">{sectionStatus.mapped} mapped</span>
              {sectionStatus.gaps > 0 && (
                <span className="text-red-600">{sectionStatus.gaps} gaps</span>
              )}
            </div>
          )}
        </button>
        
        {isExpanded && element.children && (
          <div className="divide-y">
            {element.children.map(child => (
              <div
                key={child.id}
                className="flex items-center justify-between p-3 pl-10 hover:bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <StatusIcon status={child.status} />
                  <div>
                    <p className="font-medium text-sm">{child.name}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {child.regulatoryDefinition}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {child.dataType} • {child.format}
                  </span>
                  <InteractiveStatusBadge
                    status={child.status}
                    onClick={() => onStatusClick(child)}
                  />
                  {child.mandatory && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                      Required
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }
  
  // Leaf element (shouldn't happen at top level, but handle it)
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20">
      <div className="flex items-center gap-3">
        <StatusIcon status={element.status} />
        <div>
          <p className="font-medium text-sm">{element.name}</p>
          <p className="text-xs text-muted-foreground">{element.regulatoryDefinition}</p>
        </div>
      </div>
      <InteractiveStatusBadge
        status={element.status}
        onClick={() => onStatusClick(element)}
      />
    </div>
  )
}

/**
 * Status Summary Bar
 */
interface StatusSummaryProps {
  elements: DataRequirementElement[]
}

function StatusSummary({ elements }: StatusSummaryProps) {
  const counts = useMemo(() => {
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
    flatten(elements)
    
    return {
      validated: flatElements.filter(e => e.status === 'validated').length,
      mapped: flatElements.filter(e => e.status === 'mapped').length,
      gap: flatElements.filter(e => e.status === 'gap').length,
      pending: flatElements.filter(e => e.status === 'pending').length,
      total: flatElements.length,
    }
  }, [elements])
  
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        {counts.validated} Validated
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-700">
        <Link className="h-3 w-3" />
        {counts.mapped} Mapped
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700">
        <AlertCircle className="h-3 w-3" />
        {counts.gap} Gaps
      </span>
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
        <Clock className="h-3 w-3" />
        {counts.pending} Pending
      </span>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface TemplateParsingStepProps {
  parsingResult: TemplateParsingResult
  elements: DataRequirementElement[]
  onComplete: () => void
}

export function TemplateParsingStep({
  parsingResult,
  elements,
  onComplete,
}: TemplateParsingStepProps) {
  // Track expanded sections
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(elements.map(e => e.id)) // Expand all by default
  )
  
  // Track selected element for detail panel
  const [selectedElement, setSelectedElement] = useState<DataRequirementElement | null>(null)
  
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
  
  const expandAll = () => {
    setExpandedSections(new Set(elements.map(e => e.id)))
  }
  
  const collapseAll = () => {
    setExpandedSections(new Set())
  }

  return (
    <div className="space-y-6">
      {/* Parsing Summary */}
      <ParsingSummary parsingResult={parsingResult} />

      {/* Elements Overview */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Data Elements
          </h3>
          <p className="text-sm text-muted-foreground">
            Review the parsed data elements. Click on status badges to view details.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <StatusSummary elements={elements} />
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="ghost" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
          </div>
        </div>
      </div>

      {/* Element Tree */}
      <div className="space-y-3">
        {elements.map(element => (
          <ElementTreeItem
            key={element.id}
            element={element}
            isExpanded={expandedSections.has(element.id)}
            onToggle={() => toggleSection(element.id)}
            onStatusClick={setSelectedElement}
          />
        ))}
      </div>

      {/* Action */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete} className="gap-2">
          Proceed to Source Mapping
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Element Detail Panel */}
      {selectedElement && (
        <ElementDetailPanel
          element={selectedElement}
          onClose={() => setSelectedElement(null)}
        />
      )}
    </div>
  )
}

export default TemplateParsingStep
