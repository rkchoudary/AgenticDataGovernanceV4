/**
 * GapAnalysisStep Component
 * 
 * Step 3 of Data Requirements phase - highlights gaps with resolution options.
 * Supports Manual Map, Flag for Later, and Create Request actions.
 * 
 * Requirements: 4.3
 */

import { useState, useCallback } from 'react'
import {
  ChevronRight,
  AlertCircle,
  Link,
  Flag,
  FileText,
  CheckCircle2,
  Sparkles,
  Database,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  DataRequirementElement,
  DataGap,
  GapResolution,
  GapResolutionAction,
  SourceMapping,
  DataRequirementsSummary,
  GAP_REASON_CONFIG,
  GAP_RESOLUTION_CONFIG,
} from './types'

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Gap Summary Card
 */
interface GapSummaryProps {
  gaps: DataGap[]
  summary: DataRequirementsSummary
}

function GapSummary({ gaps, summary }: GapSummaryProps) {
  const resolvedGaps = gaps.filter(g => g.resolution).length
  const unresolvedGaps = gaps.length - resolvedGaps
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          Gap Analysis Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{unresolvedGaps}</p>
            <p className="text-xs text-red-700">Unresolved Gaps</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{resolvedGaps}</p>
            <p className="text-xs text-green-700">Resolved</p>
          </div>
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">{summary.totalElements}</p>
            <p className="text-xs text-blue-700">Total Elements</p>
          </div>
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <p className="text-2xl font-bold text-primary">{summary.completionPercentage}%</p>
            <p className="text-xs text-muted-foreground">Completion</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Resolution Action Button
 */
interface ResolutionActionButtonProps {
  action: GapResolutionAction
  isSelected: boolean
  onClick: () => void
}

function ResolutionActionButton({ action, isSelected, onClick }: ResolutionActionButtonProps) {
  const config = GAP_RESOLUTION_CONFIG[action]
  const iconMap = {
    manual_map: Link,
    flag_for_later: Flag,
    create_request: FileText,
  }
  const Icon = iconMap[action]
  
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-muted hover:border-primary/50 hover:bg-muted/50'
      )}
    >
      <Icon className={cn('h-6 w-6', isSelected ? 'text-primary' : 'text-muted-foreground')} />
      <span className={cn('text-sm font-medium', isSelected ? 'text-primary' : 'text-foreground')}>
        {config.label}
      </span>
      <span className="text-xs text-muted-foreground text-center">
        {config.description}
      </span>
    </button>
  )
}

/**
 * Manual Mapping Form
 */
interface ManualMappingFormProps {
  elementId: string
  onSubmit: (mapping: SourceMapping) => void
}

function ManualMappingForm({ elementId, onSubmit }: ManualMappingFormProps) {
  const [sourceSystem, setSourceSystem] = useState('')
  const [sourceTable, setSourceTable] = useState('')
  const [sourceField, setSourceField] = useState('')
  const [transformation, setTransformation] = useState('')
  
  const handleSubmit = () => {
    if (sourceSystem && sourceTable && sourceField) {
      onSubmit({
        elementId,
        sourceSystem,
        sourceTable,
        sourceField,
        transformationLogic: transformation || undefined,
        confidence: 1.0, // Manual mapping = 100% confidence
      })
    }
  }
  
  const isValid = sourceSystem && sourceTable && sourceField
  
  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Database className="h-4 w-4 text-primary" />
        Manual Source Mapping
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="sourceSystem" className="text-xs">Source System</Label>
          <Input
            id="sourceSystem"
            placeholder="e.g., LOS"
            value={sourceSystem}
            onChange={(e) => setSourceSystem(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="sourceTable" className="text-xs">Table</Label>
          <Input
            id="sourceTable"
            placeholder="e.g., loans"
            value={sourceTable}
            onChange={(e) => setSourceTable(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="sourceField" className="text-xs">Field</Label>
          <Input
            id="sourceField"
            placeholder="e.g., cltv_ratio"
            value={sourceField}
            onChange={(e) => setSourceField(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      
      <div>
        <Label htmlFor="transformation" className="text-xs">Transformation Logic (optional)</Label>
        <Textarea
          id="transformation"
          placeholder="e.g., COALESCE(cltv_ratio, ltv_ratio)"
          value={transformation}
          onChange={(e) => setTransformation(e.target.value)}
          className="mt-1"
          rows={2}
        />
      </div>
      
      <Button onClick={handleSubmit} disabled={!isValid} size="sm" className="gap-2">
        <CheckCircle2 className="h-4 w-4" />
        Apply Mapping
      </Button>
    </div>
  )
}

/**
 * Flag for Later Form
 */
interface FlagForLaterFormProps {
  onSubmit: (reason: string) => void
}

function FlagForLaterForm({ onSubmit }: FlagForLaterFormProps) {
  const [reason, setReason] = useState('')
  
  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Flag className="h-4 w-4 text-amber-500" />
        Flag for Later Resolution
      </div>
      
      <div>
        <Label htmlFor="flagReason" className="text-xs">Reason for Deferral</Label>
        <Textarea
          id="flagReason"
          placeholder="Explain why this gap cannot be resolved now..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>
      
      <Button 
        onClick={() => onSubmit(reason)} 
        disabled={!reason.trim()} 
        size="sm" 
        variant="outline"
        className="gap-2"
      >
        <Flag className="h-4 w-4" />
        Flag Gap
      </Button>
    </div>
  )
}

/**
 * Create Request Form
 */
interface CreateRequestFormProps {
  elementName: string
  onSubmit: (details: string) => void
}

function CreateRequestForm({ elementName, onSubmit }: CreateRequestFormProps) {
  const [details, setDetails] = useState('')
  
  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
      <div className="flex items-center gap-2 text-sm font-medium">
        <FileText className="h-4 w-4 text-blue-500" />
        Create Data Request
      </div>
      
      <div>
        <Label htmlFor="requestDetails" className="text-xs">Request Details</Label>
        <Textarea
          id="requestDetails"
          placeholder={`Describe the data needed for "${elementName}"...`}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className="mt-1"
          rows={3}
        />
      </div>
      
      <Button 
        onClick={() => onSubmit(details)} 
        disabled={!details.trim()} 
        size="sm"
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        Create Request
      </Button>
    </div>
  )
}

/**
 * Gap Resolution Card
 * Requirements: 4.3 - Highlight gaps with resolution options
 */
interface GapCardProps {
  gap: DataGap
  element?: DataRequirementElement
  onResolve: (gapId: string, resolution: GapResolution) => void
}

function GapCard({ gap, element, onResolve }: GapCardProps) {
  const [selectedAction, setSelectedAction] = useState<GapResolutionAction | null>(null)
  const reasonConfig = GAP_REASON_CONFIG[gap.reason]
  
  const handleManualMapping = useCallback((mapping: SourceMapping) => {
    onResolve(gap.id, {
      action: 'manual_map',
      details: `Mapped to ${mapping.sourceSystem}.${mapping.sourceTable}.${mapping.sourceField}`,
      manualMapping: mapping,
    })
    setSelectedAction(null)
  }, [gap.id, onResolve])
  
  const handleFlagForLater = useCallback((reason: string) => {
    onResolve(gap.id, {
      action: 'flag_for_later',
      details: reason,
      flagReason: reason,
    })
    setSelectedAction(null)
  }, [gap.id, onResolve])
  
  const handleCreateRequest = useCallback((details: string) => {
    onResolve(gap.id, {
      action: 'create_request',
      details,
      requestId: `REQ-${Date.now()}`,
    })
    setSelectedAction(null)
  }, [gap.id, onResolve])
  
  // If already resolved
  if (gap.resolution) {
    const resolutionConfig = GAP_RESOLUTION_CONFIG[gap.resolution.action]
    return (
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h4 className="font-semibold">{gap.elementName}</h4>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  Resolved
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Resolution: {resolutionConfig.label}
              </p>
              <p className="text-xs text-muted-foreground">
                {gap.resolution.details}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {gap.resolvedAt && new Date(gap.resolvedAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <h4 className="font-semibold">{gap.elementName}</h4>
            </div>
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
              'bg-red-100 text-red-700'
            )}>
              {reasonConfig.label}
            </span>
          </div>
          {element && (
            <div className="text-right text-xs text-muted-foreground">
              <p>{element.dataType} • {element.format}</p>
              {element.mandatory && (
                <span className="text-amber-600">Required field</span>
              )}
            </div>
          )}
        </div>
        
        {/* Reason Description */}
        <p className="text-sm text-muted-foreground mb-3">
          {reasonConfig.description}
        </p>
        
        {/* AI Suggestion */}
        {gap.suggestedResolution && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-1 text-xs text-blue-700 font-medium mb-1">
              <Sparkles className="h-3 w-3" />
              AI Suggested Resolution
            </div>
            <p className="text-sm text-blue-800">{gap.suggestedResolution}</p>
          </div>
        )}
        
        {/* Resolution Actions */}
        <div className="space-y-4">
          <p className="text-sm font-medium">Choose Resolution Action:</p>
          
          <div className="grid grid-cols-3 gap-3">
            <ResolutionActionButton
              action="manual_map"
              isSelected={selectedAction === 'manual_map'}
              onClick={() => setSelectedAction(selectedAction === 'manual_map' ? null : 'manual_map')}
            />
            <ResolutionActionButton
              action="flag_for_later"
              isSelected={selectedAction === 'flag_for_later'}
              onClick={() => setSelectedAction(selectedAction === 'flag_for_later' ? null : 'flag_for_later')}
            />
            <ResolutionActionButton
              action="create_request"
              isSelected={selectedAction === 'create_request'}
              onClick={() => setSelectedAction(selectedAction === 'create_request' ? null : 'create_request')}
            />
          </div>
          
          {/* Resolution Forms */}
          {selectedAction === 'manual_map' && (
            <ManualMappingForm
              elementId={gap.elementId}
              onSubmit={handleManualMapping}
            />
          )}
          
          {selectedAction === 'flag_for_later' && (
            <FlagForLaterForm onSubmit={handleFlagForLater} />
          )}
          
          {selectedAction === 'create_request' && (
            <CreateRequestForm
              elementName={gap.elementName}
              onSubmit={handleCreateRequest}
            />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface GapAnalysisStepProps {
  gaps: DataGap[]
  elements: DataRequirementElement[]
  onResolveGap: (gapId: string, resolution: GapResolution) => void
  summary: DataRequirementsSummary
  onComplete: () => void
}

export function GapAnalysisStep({
  gaps,
  elements,
  onResolveGap,
  summary,
  onComplete,
}: GapAnalysisStepProps) {
  // Find element for each gap
  const findElement = (elementId: string): DataRequirementElement | undefined => {
    for (const section of elements) {
      if (section.children) {
        const found = section.children.find(e => e.id === elementId)
        if (found) return found
      }
    }
    return undefined
  }
  
  const unresolvedGaps = gaps.filter(g => !g.resolution)
  const resolvedGaps = gaps.filter(g => g.resolution)
  
  // Can proceed if all gaps are resolved or flagged
  const canProceed = unresolvedGaps.length === 0

  return (
    <div className="space-y-6">
      {/* Summary */}
      <GapSummary gaps={gaps} summary={summary} />

      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Data Gaps
          </h3>
          <p className="text-sm text-muted-foreground">
            Resolve data gaps using one of the available resolution options
          </p>
        </div>
      </div>

      {/* Unresolved Gaps */}
      {unresolvedGaps.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-red-600">
            Unresolved Gaps ({unresolvedGaps.length})
          </h4>
          {unresolvedGaps.map(gap => (
            <GapCard
              key={gap.id}
              gap={gap}
              element={findElement(gap.elementId)}
              onResolve={onResolveGap}
            />
          ))}
        </div>
      )}

      {/* Resolved Gaps */}
      {resolvedGaps.length > 0 && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-green-600">
            Resolved Gaps ({resolvedGaps.length})
          </h4>
          {resolvedGaps.map(gap => (
            <GapCard
              key={gap.id}
              gap={gap}
              element={findElement(gap.elementId)}
              onResolve={onResolveGap}
            />
          ))}
        </div>
      )}

      {/* No Gaps */}
      {gaps.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Data Gaps</h3>
            <p className="text-muted-foreground">
              All data elements have been successfully mapped to source fields.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Action */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {!canProceed && (
            <span className="text-amber-600">
              Please resolve all gaps before proceeding
            </span>
          )}
        </div>
        <Button onClick={onComplete} className="gap-2" disabled={!canProceed}>
          Proceed to Document Approval
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default GapAnalysisStep
