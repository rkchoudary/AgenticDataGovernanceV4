/**
 * EvidenceCollectionStep Component
 * 
 * Step 2 of Controls Management phase - provides upload functionality
 * with metadata tagging for control evidence.
 * 
 * Requirements: 9.3
 */

import { useState, useCallback } from 'react'
import {
  Upload,
  FileText,
  Image,
  FileCode,
  FileBarChart,
  FileCheck,
  CheckSquare,
  X,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Control,
  ControlEvidence,
  ControlEvidenceOutcome,
  EvidenceType,
  EVIDENCE_TYPE_CONFIG,
  EVIDENCE_OUTCOME_CONFIG,
  CONTROL_STATUS_CONFIG,
  getLatestEvidence,
  hasRecentEvidence,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface EvidenceCollectionStepProps {
  controls: Control[]
  selectedControlId: string | null
  onSelectControl: (controlId: string | null) => void
  onEvidenceUpload: (
    controlId: string,
    evidence: Omit<ControlEvidence, 'id' | 'controlId'>
  ) => void
  onEvidenceOutcomeUpdate: (
    controlId: string,
    evidenceId: string,
    outcome: ControlEvidenceOutcome
  ) => void
  onComplete: () => void
}

// ============================================================================
// Icon Mapping
// ============================================================================

const EVIDENCE_TYPE_ICONS: Record<EvidenceType, React.ReactNode> = {
  screenshot: <Image className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  log: <FileCode className="h-4 w-4" />,
  report: <FileBarChart className="h-4 w-4" />,
  attestation: <FileCheck className="h-4 w-4" />,
  approval: <CheckSquare className="h-4 w-4" />,
}

// ============================================================================
// Evidence Upload Dialog
// ============================================================================

interface EvidenceUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  controlName: string
  onUpload: (evidence: Omit<ControlEvidence, 'id' | 'controlId'>) => void
}

function EvidenceUploadDialog({
  open,
  onOpenChange,
  controlName,
  onUpload,
}: EvidenceUploadDialogProps) {
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('document')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [outcome, setOutcome] = useState<ControlEvidenceOutcome>('pass')
  const [details, setDetails] = useState('')
  const [metadata, setMetadata] = useState<Record<string, string>>({})
  const [newMetadataKey, setNewMetadataKey] = useState('')
  const [newMetadataValue, setNewMetadataValue] = useState('')

  const handleAddMetadata = () => {
    if (newMetadataKey.trim() && newMetadataValue.trim()) {
      setMetadata(prev => ({
        ...prev,
        [newMetadataKey.trim()]: newMetadataValue.trim(),
      }))
      setNewMetadataKey('')
      setNewMetadataValue('')
    }
  }

  const handleRemoveMetadata = (key: string) => {
    setMetadata(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const handleSubmit = () => {
    if (!name.trim() || !description.trim()) return

    onUpload({
      type: evidenceType,
      name: name.trim(),
      description: description.trim(),
      executionDate: new Date().toISOString(),
      outcome,
      details: details.trim(),
      uploadedBy: 'current-user',
      uploadedAt: new Date().toISOString(),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    })

    // Reset form
    setEvidenceType('document')
    setName('')
    setDescription('')
    setOutcome('pass')
    setDetails('')
    setMetadata({})
    onOpenChange(false)
  }

  const isValid = name.trim() && description.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Evidence</DialogTitle>
          <DialogDescription>
            Upload evidence for control: {controlName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Evidence Type */}
          <div className="space-y-2">
            <Label>Evidence Type</Label>
            <Select value={evidenceType} onValueChange={(v) => setEvidenceType(v as EvidenceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EVIDENCE_TYPE_CONFIG).map(([type, config]) => (
                  <SelectItem key={type} value={type}>
                    <div className="flex items-center gap-2">
                      {EVIDENCE_TYPE_ICONS[type as EvidenceType]}
                      {config.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Accepted formats: {EVIDENCE_TYPE_CONFIG[evidenceType].acceptedFormats.join(', ')}
            </p>
          </div>

          {/* File Upload Placeholder */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Drag and drop a file here, or click to browse
            </p>
            <Button variant="outline" size="sm" className="mt-2">
              Browse Files
            </Button>
          </div>

          {/* Evidence Name */}
          <div className="space-y-2">
            <Label htmlFor="evidence-name">Evidence Name *</Label>
            <Input
              id="evidence-name"
              placeholder="e.g., Q4 Access Review Report"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="evidence-description">Description *</Label>
            <Textarea
              id="evidence-description"
              placeholder="Describe what this evidence demonstrates..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label>Control Outcome</Label>
            <div className="flex gap-2">
              {(['pass', 'fail', 'exception'] as ControlEvidenceOutcome[]).map((o) => {
                const config = EVIDENCE_OUTCOME_CONFIG[o]
                return (
                  <Button
                    key={o}
                    type="button"
                    variant={outcome === o ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOutcome(o)}
                    className={cn(
                      outcome === o && o === 'pass' && 'bg-green-600 hover:bg-green-700',
                      outcome === o && o === 'fail' && 'bg-red-600 hover:bg-red-700',
                      outcome === o && o === 'exception' && 'bg-amber-600 hover:bg-amber-700',
                    )}
                  >
                    {config.label}
                  </Button>
                )
              })}
            </div>
          </div>

          {/* Details */}
          <div className="space-y-2">
            <Label htmlFor="evidence-details">Outcome Details</Label>
            <Textarea
              id="evidence-details"
              placeholder="Provide details about the control execution outcome..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={2}
            />
          </div>

          {/* Metadata Tags */}
          <div className="space-y-2">
            <Label>Metadata Tags</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Key"
                value={newMetadataKey}
                onChange={(e) => setNewMetadataKey(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Value"
                value={newMetadataValue}
                onChange={(e) => setNewMetadataValue(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleAddMetadata}
                disabled={!newMetadataKey.trim() || !newMetadataValue.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {Object.keys(metadata).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(metadata).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="flex items-center gap-1">
                    {key}: {value}
                    <button
                      type="button"
                      onClick={() => handleRemoveMetadata(key)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            Upload Evidence
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Control Evidence Card
// ============================================================================

interface ControlEvidenceCardProps {
  control: Control
  isSelected: boolean
  onSelect: () => void
  onUploadClick: () => void
}

function ControlEvidenceCard({
  control,
  isSelected,
  onSelect,
  onUploadClick,
}: ControlEvidenceCardProps) {
  const statusConfig = CONTROL_STATUS_CONFIG[control.status]
  const latestEvidence = getLatestEvidence(control)
  const hasRecent = hasRecentEvidence(control, 30)

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isSelected && 'ring-2 ring-primary',
        !hasRecent && 'border-amber-300 bg-amber-50/50',
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{control.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={cn(statusConfig.bgColor, statusConfig.color)} variant="outline">
                {statusConfig.label}
              </Badge>
              <span className="text-xs text-muted-foreground capitalize">
                {control.frequency}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {latestEvidence ? (
              <div className="flex items-center gap-1">
                {latestEvidence.outcome === 'pass' && <CheckCircle className="h-5 w-5 text-green-600" />}
                {latestEvidence.outcome === 'fail' && <XCircle className="h-5 w-5 text-red-600" />}
                {latestEvidence.outcome === 'exception' && <AlertTriangle className="h-5 w-5 text-amber-600" />}
              </div>
            ) : (
              <Clock className="h-5 w-5 text-gray-400" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {control.evidence.length} evidence item{control.evidence.length !== 1 ? 's' : ''}
            {latestEvidence && (
              <span className="ml-2">
                • Last: {new Date(latestEvidence.executionDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              onUploadClick()
            }}
          >
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
        </div>
        
        {!hasRecent && (
          <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            No recent evidence (within 30 days)
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Evidence List
// ============================================================================

interface EvidenceListProps {
  evidence: ControlEvidence[]
}

function EvidenceList({ evidence }: EvidenceListProps) {
  if (evidence.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No evidence collected yet. Upload evidence to document control execution.
      </div>
    )
  }

  const sortedEvidence = [...evidence].sort(
    (a, b) => new Date(b.executionDate).getTime() - new Date(a.executionDate).getTime()
  )

  return (
    <div className="space-y-3">
      {sortedEvidence.map((ev) => {
        const typeConfig = EVIDENCE_TYPE_CONFIG[ev.type]
        const outcomeConfig = EVIDENCE_OUTCOME_CONFIG[ev.outcome]

        return (
          <div
            key={ev.id}
            className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30"
          >
            <div className="p-2 bg-background rounded-md">
              {EVIDENCE_TYPE_ICONS[ev.type]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{ev.name}</span>
                <Badge variant="outline" className="text-xs">
                  {typeConfig.label}
                </Badge>
                <Badge className={cn(outcomeConfig.bgColor, outcomeConfig.color, 'text-xs')}>
                  {outcomeConfig.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{ev.description}</p>
              {ev.details && (
                <p className="text-sm mt-1">{ev.details}</p>
              )}
              {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.entries(ev.metadata).map(([key, value]) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {key}: {value}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-2">
                {new Date(ev.executionDate).toLocaleString()} • {ev.uploadedBy}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function EvidenceCollectionStep({
  controls,
  selectedControlId,
  onSelectControl,
  onEvidenceUpload,
  onEvidenceOutcomeUpdate: _onEvidenceOutcomeUpdate,
  onComplete,
}: EvidenceCollectionStepProps) {
  // Note: onEvidenceOutcomeUpdate is available for future use when editing evidence outcomes
  void _onEvidenceOutcomeUpdate
  
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadControlId, setUploadControlId] = useState<string | null>(null)

  const selectedControl = controls.find(c => c.id === selectedControlId)
  const uploadControl = controls.find(c => c.id === uploadControlId)

  // Count controls needing evidence
  const controlsNeedingEvidence = controls.filter(c => !hasRecentEvidence(c, 30))

  const handleUploadClick = useCallback((controlId: string) => {
    setUploadControlId(controlId)
    setUploadDialogOpen(true)
  }, [])

  const handleUpload = useCallback((evidence: Omit<ControlEvidence, 'id' | 'controlId'>) => {
    if (uploadControlId) {
      onEvidenceUpload(uploadControlId, evidence)
    }
  }, [uploadControlId, onEvidenceUpload])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Evidence Collection</h2>
        <p className="text-muted-foreground mt-1">
          Upload evidence for each control with metadata tagging. Evidence documents control execution and outcomes.
        </p>
      </div>

      {/* Warning for controls needing evidence */}
      {controlsNeedingEvidence.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {controlsNeedingEvidence.length} control{controlsNeedingEvidence.length !== 1 ? 's' : ''} need evidence
            </span>
          </div>
          <p className="text-sm text-amber-600 mt-1">
            These controls have no evidence collected within the last 30 days.
          </p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control List */}
        <div className="space-y-4">
          <h3 className="font-medium">Controls</h3>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {controls.map(control => (
              <ControlEvidenceCard
                key={control.id}
                control={control}
                isSelected={selectedControlId === control.id}
                onSelect={() => onSelectControl(control.id)}
                onUploadClick={() => handleUploadClick(control.id)}
              />
            ))}
          </div>
        </div>

        {/* Evidence Detail */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">
              {selectedControl ? `Evidence for ${selectedControl.name}` : 'Select a control'}
            </h3>
            {selectedControl && (
              <Button
                size="sm"
                onClick={() => handleUploadClick(selectedControl.id)}
              >
                <Upload className="h-4 w-4 mr-1" />
                Upload Evidence
              </Button>
            )}
          </div>
          
          {selectedControl ? (
            <Card>
              <CardContent className="pt-4">
                <EvidenceList evidence={selectedControl.evidence} />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <div className="text-center py-8 text-muted-foreground">
                  Select a control to view and manage its evidence.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Upload Dialog */}
      {uploadControl && (
        <EvidenceUploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          controlName={uploadControl.name}
          onUpload={handleUpload}
        />
      )}

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete}>
          Continue to Compensating Controls
        </Button>
      </div>
    </div>
  )
}

export default EvidenceCollectionStep
