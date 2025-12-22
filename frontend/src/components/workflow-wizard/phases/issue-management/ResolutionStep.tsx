/**
 * ResolutionStep Component
 * 
 * Step 3 of Issue Management phase - requires documentation and evidence
 * for issue resolution.
 * 
 * Requirements: 8.4
 */

import { useState } from 'react'
import {
  CheckCircle,
  FileText,
  Image,
  Paperclip,
  Plus,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Issue,
  Resolution,
  ResolutionEvidence,
  ResolutionType,
  SEVERITY_CONFIG,
  RESOLUTION_TYPE_CONFIG,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface ResolutionStepProps {
  issues: Issue[]
  selectedIssueId: string | null
  onSelectIssue: (issueId: string | null) => void
  onResolutionUpdate: (issueId: string, resolution: Partial<Resolution>) => void
  onResolutionSubmit: (issueId: string, resolution: Resolution) => void
  onComplete: () => void
}

// ============================================================================
// Evidence Upload Component
// ============================================================================

interface EvidenceUploadProps {
  evidence: ResolutionEvidence[]
  onAddEvidence: (evidence: ResolutionEvidence) => void
  onRemoveEvidence: (evidenceId: string) => void
}

function EvidenceUpload({ evidence, onAddEvidence, onRemoveEvidence }: EvidenceUploadProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEvidence, setNewEvidence] = useState({
    type: 'document' as ResolutionEvidence['type'],
    name: '',
    description: '',
  })

  const handleAdd = () => {
    if (newEvidence.name.trim() && newEvidence.description.trim()) {
      onAddEvidence({
        id: `evidence-${Date.now()}`,
        type: newEvidence.type,
        name: newEvidence.name,
        description: newEvidence.description,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'current-user',
      })
      setNewEvidence({ type: 'document', name: '', description: '' })
      setShowAddForm(false)
    }
  }

  const getEvidenceIcon = (type: ResolutionEvidence['type']) => {
    switch (type) {
      case 'screenshot':
        return <Image className="h-4 w-4" />
      case 'document':
        return <FileText className="h-4 w-4" />
      case 'log':
        return <FileText className="h-4 w-4" />
      case 'data_sample':
        return <FileText className="h-4 w-4" />
      case 'approval':
        return <CheckCircle className="h-4 w-4" />
      default:
        return <Paperclip className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Evidence <span className="text-red-500">*</span>
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Evidence
        </Button>
      </div>

      {/* Evidence List */}
      {evidence.length > 0 && (
        <div className="space-y-2">
          {evidence.map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-background rounded">
                  {getEvidenceIcon(item.type)}
                </div>
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveEvidence(item.id)}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add Evidence Form */}
      {showAddForm && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Add Evidence</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Select
              value={newEvidence.type}
              onValueChange={(value) => setNewEvidence(prev => ({
                ...prev,
                type: value as ResolutionEvidence['type'],
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Evidence type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="screenshot">Screenshot</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="log">Log File</SelectItem>
                <SelectItem value="data_sample">Data Sample</SelectItem>
                <SelectItem value="approval">Approval Record</SelectItem>
              </SelectContent>
            </Select>

            <Input
              placeholder="Evidence name"
              value={newEvidence.name}
              onChange={(e) => setNewEvidence(prev => ({ ...prev, name: e.target.value }))}
            />

            <Textarea
              placeholder="Description of evidence"
              value={newEvidence.description}
              onChange={(e) => setNewEvidence(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleAdd}
                disabled={!newEvidence.name.trim() || !newEvidence.description.trim()}
              >
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {evidence.length === 0 && !showAddForm && (
        <div className="text-center py-6 bg-muted/30 rounded-lg border-2 border-dashed">
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No evidence attached. Click "Add Evidence" to document your resolution.
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Resolution Form Component
// ============================================================================

interface ResolutionFormProps {
  issue: Issue
  onUpdate: (updates: Partial<Resolution>) => void
  onSubmit: (resolution: Resolution) => void
}

function ResolutionForm({ issue, onUpdate, onSubmit }: ResolutionFormProps) {
  const [localResolution, setLocalResolution] = useState<Partial<Resolution>>(() => {
    if (issue.resolution) {
      return issue.resolution
    }
    return {
      type: 'data_correction',
      description: '',
      rootCause: '',
      rootCauseCategory: 'unknown',
      implementedBy: '',
      implementedAt: '',
      evidence: [],
    }
  })

  const handleFieldChange = (field: keyof Resolution, value: unknown) => {
    const updated = { ...localResolution, [field]: value }
    setLocalResolution(updated)
    onUpdate(updated)
  }

  const handleAddEvidence = (evidence: ResolutionEvidence) => {
    const updatedEvidence = [...(localResolution.evidence || []), evidence]
    handleFieldChange('evidence', updatedEvidence)
  }

  const handleRemoveEvidence = (evidenceId: string) => {
    const updatedEvidence = (localResolution.evidence || []).filter(e => e.id !== evidenceId)
    handleFieldChange('evidence', updatedEvidence)
  }

  const handleSubmit = () => {
    if (isValid) {
      onSubmit(localResolution as Resolution)
    }
  }

  // Validation
  const isValid =
    localResolution.type &&
    localResolution.description?.trim() &&
    localResolution.description.trim().length >= 50 &&
    (localResolution.evidence?.length || 0) >= 1

  const severityConfig = SEVERITY_CONFIG[issue.severity]

  return (
    <div className="space-y-6">
      {/* Issue Header */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge className={cn(severityConfig.bgColor, severityConfig.color)}>
            {severityConfig.label}
          </Badge>
          <span className="text-lg font-semibold">{issue.title}</span>
        </div>
        <p className="text-sm text-muted-foreground">{issue.description}</p>
        
        {/* Root Cause */}
        {localResolution.rootCause && (
          <div className="mt-3 pt-3 border-t">
            <span className="text-sm text-muted-foreground">Root Cause: </span>
            <span className="text-sm">{localResolution.rootCause}</span>
          </div>
        )}
      </div>

      {/* Resolution Type */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Resolution Type <span className="text-red-500">*</span>
        </label>
        <Select
          value={localResolution.type}
          onValueChange={(value) => handleFieldChange('type', value as ResolutionType)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select resolution type" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RESOLUTION_TYPE_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                <div>
                  <div className="font-medium">{config.label}</div>
                  <div className="text-xs text-muted-foreground">{config.description}</div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Resolution Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            Resolution Description <span className="text-red-500">*</span>
          </label>
          <span className={cn(
            'text-xs',
            (localResolution.description?.trim().length || 0) >= 50
              ? 'text-green-600'
              : 'text-muted-foreground'
          )}>
            {localResolution.description?.trim().length || 0}/50 min characters
          </span>
        </div>
        <Textarea
          placeholder="Describe the resolution in detail. Include what was changed, how it was fixed, and any follow-up actions required..."
          value={localResolution.description || ''}
          onChange={(e) => handleFieldChange('description', e.target.value)}
          rows={5}
        />
        <p className="text-xs text-muted-foreground">
          Provide a detailed description of the resolution for audit purposes.
        </p>
      </div>

      {/* Evidence Upload */}
      <EvidenceUpload
        evidence={localResolution.evidence || []}
        onAddEvidence={handleAddEvidence}
        onRemoveEvidence={handleRemoveEvidence}
      />

      {/* Validation Summary */}
      <div className="bg-muted/30 rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">Resolution Checklist</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className={cn(
              'h-4 w-4',
              localResolution.type ? 'text-green-500' : 'text-muted-foreground'
            )} />
            <span className={localResolution.type ? '' : 'text-muted-foreground'}>
              Resolution type selected
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className={cn(
              'h-4 w-4',
              (localResolution.description?.trim().length || 0) >= 50
                ? 'text-green-500'
                : 'text-muted-foreground'
            )} />
            <span className={(localResolution.description?.trim().length || 0) >= 50 ? '' : 'text-muted-foreground'}>
              Description provided (min 50 characters)
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className={cn(
              'h-4 w-4',
              (localResolution.evidence?.length || 0) >= 1
                ? 'text-green-500'
                : 'text-muted-foreground'
            )} />
            <span className={(localResolution.evidence?.length || 0) >= 1 ? '' : 'text-muted-foreground'}>
              At least one evidence attached
            </span>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
        >
          Submit for Verification
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Issue List Item
// ============================================================================

interface IssueListItemProps {
  issue: Issue
  isSelected: boolean
  isResolved: boolean
  onClick: () => void
}

function IssueListItem({ issue, isSelected, isResolved, onClick }: IssueListItemProps) {
  const severityConfig = SEVERITY_CONFIG[issue.severity]

  return (
    <button
      className={cn(
        'w-full text-left p-3 rounded-lg border transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/50 hover:bg-muted/50'
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <Badge className={cn(severityConfig.bgColor, severityConfig.color, 'text-xs')}>
          {severityConfig.label}
        </Badge>
        {isResolved && (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
      </div>
      <p className="text-sm font-medium truncate">{issue.title}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {issue.status === 'pending_verification' ? 'Pending verification' : 'Needs resolution'}
      </p>
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ResolutionStep({
  issues,
  selectedIssueId,
  onSelectIssue,
  onResolutionUpdate,
  onResolutionSubmit,
  onComplete,
}: ResolutionStepProps) {
  // Get selected issue
  const selectedIssue = issues.find(i => i.id === selectedIssueId)

  // Count resolved issues
  const resolvedCount = issues.filter(i => i.status === 'pending_verification').length

  // Check if all issues are resolved
  const allResolved = issues.every(i => i.status === 'pending_verification')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Resolution Implementation</h2>
        <p className="text-muted-foreground mt-1">
          Document the resolution for each issue with detailed description and evidence.
        </p>
      </div>

      {/* Progress */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Resolution Progress</span>
          <span className="text-sm text-muted-foreground">
            {resolvedCount} of {issues.length} issues resolved
          </span>
        </div>
        <Progress value={(resolvedCount / issues.length) * 100} className="h-2" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Issue List */}
        <div className="lg:col-span-1">
          <h3 className="text-sm font-medium mb-3">Issues to Resolve</h3>
          <div className="space-y-2">
            {issues.map(issue => (
              <IssueListItem
                key={issue.id}
                issue={issue}
                isSelected={selectedIssueId === issue.id}
                isResolved={issue.status === 'pending_verification'}
                onClick={() => onSelectIssue(issue.id)}
              />
            ))}
          </div>
        </div>

        {/* Resolution Form */}
        <div className="lg:col-span-2">
          {selectedIssue ? (
            <ResolutionForm
              issue={selectedIssue}
              onUpdate={(updates) => onResolutionUpdate(selectedIssue.id, updates)}
              onSubmit={(resolution) => onResolutionSubmit(selectedIssue.id, resolution)}
            />
          ) : (
            <div className="flex items-center justify-center h-64 bg-muted/30 rounded-lg">
              <div className="text-center text-muted-foreground">
                <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Select an issue to resolve</p>
                <p className="text-sm">Choose from the list on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={!allResolved}
        >
          {allResolved
            ? 'Continue to Verification'
            : `${issues.length - resolvedCount} issues need resolution`}
        </Button>
      </div>
    </div>
  )
}

export default ResolutionStep

