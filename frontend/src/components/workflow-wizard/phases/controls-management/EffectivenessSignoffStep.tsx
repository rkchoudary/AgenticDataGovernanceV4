/**
 * EffectivenessSignoffStep Component
 * 
 * Step 4 of Controls Management phase - captures attestation
 * that all controls are operating effectively.
 * 
 * Requirements: 9.5
 */

import { useState, useMemo } from 'react'
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  PenTool,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Control,
  ControlSummary,
  EffectivenessAttestation,
  CONTROL_TYPE_CONFIG,
  CONTROL_STATUS_CONFIG,
  getLatestEvidence,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface EffectivenessSignoffStepProps {
  controls: Control[]
  summary: ControlSummary
  attestations: EffectivenessAttestation[]
  onAttestation: (attestation: EffectivenessAttestation) => void
  onComplete: () => void
}

// ============================================================================
// Attestation Dialog
// ============================================================================

interface AttestationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  control: Control
  onAttest: (attestation: EffectivenessAttestation) => void
}

function AttestationDialog({
  open,
  onOpenChange,
  control,
  onAttest,
}: AttestationDialogProps) {
  const [effectivenessRating, setEffectivenessRating] = useState(
    control.effectivenessRating || 80
  )
  const [rationale, setRationale] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const isEffective = effectivenessRating >= 70

  const handleAttest = () => {
    if (rationale.trim().length < 20 || !acknowledged) return

    onAttest({
      controlId: control.id,
      attestedBy: 'current-user',
      attestedAt: new Date().toISOString(),
      effectivenessRating,
      rationale: rationale.trim(),
      isEffective,
    })

    // Reset form
    setRationale('')
    setAcknowledged(false)
    onOpenChange(false)
  }

  const isValid = rationale.trim().length >= 20 && acknowledged

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attest Control Effectiveness</DialogTitle>
          <DialogDescription>
            Provide your assessment of control effectiveness for: {control.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Effectiveness Rating */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Effectiveness Rating</Label>
              <span className={cn(
                'text-lg font-bold',
                effectivenessRating >= 90 && 'text-green-600',
                effectivenessRating >= 70 && effectivenessRating < 90 && 'text-amber-600',
                effectivenessRating < 70 && 'text-red-600',
              )}>
                {effectivenessRating}%
              </span>
            </div>
            <Slider
              value={[effectivenessRating]}
              onValueChange={(v) => setEffectivenessRating(v[0])}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Ineffective (0%)</span>
              <span>Threshold (70%)</span>
              <span>Fully Effective (100%)</span>
            </div>
          </div>

          {/* Effectiveness Status */}
          <div className={cn(
            'rounded-md p-3',
            isEffective ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          )}>
            <div className="flex items-center gap-2">
              {isEffective ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span className={cn(
                'font-medium',
                isEffective ? 'text-green-700' : 'text-red-700'
              )}>
                {isEffective ? 'Control is Effective' : 'Control is Not Effective'}
              </span>
            </div>
            <p className={cn(
              'text-sm mt-1',
              isEffective ? 'text-green-600' : 'text-red-600'
            )}>
              {isEffective
                ? 'This control meets the minimum effectiveness threshold of 70%.'
                : 'This control does not meet the minimum effectiveness threshold. Additional remediation may be required.'}
            </p>
          </div>

          {/* Rationale */}
          <div className="space-y-2">
            <Label htmlFor="rationale">Assessment Rationale * (min 20 characters)</Label>
            <Textarea
              id="rationale"
              placeholder="Provide your rationale for this effectiveness assessment..."
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {rationale.length}/20 characters minimum
            </p>
          </div>

          {/* Acknowledgment */}
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
            <Checkbox
              id="acknowledge"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="acknowledge" className="text-sm font-medium cursor-pointer">
                I attest that this assessment is accurate
              </Label>
              <p className="text-xs text-muted-foreground">
                By checking this box, I confirm that I have reviewed the control evidence
                and my effectiveness assessment is based on factual observations.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAttest} disabled={!isValid}>
            <PenTool className="h-4 w-4 mr-1" />
            Submit Attestation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Control Attestation Card
// ============================================================================

interface ControlAttestationCardProps {
  control: Control
  attestation?: EffectivenessAttestation
  isExpanded: boolean
  onToggleExpand: () => void
  onAttest: () => void
}

function ControlAttestationCard({
  control,
  attestation,
  isExpanded,
  onToggleExpand,
  onAttest,
}: ControlAttestationCardProps) {
  const typeConfig = CONTROL_TYPE_CONFIG[control.type]
  const statusConfig = CONTROL_STATUS_CONFIG[control.status]
  const latestEvidence = getLatestEvidence(control)
  
  const isAttested = !!attestation || control.effectivenessRating !== undefined
  const effectivenessRating = attestation?.effectivenessRating ?? control.effectivenessRating

  return (
    <Card className={cn(
      'transition-all',
      isExpanded && 'ring-2 ring-primary',
      isAttested && 'border-l-4 border-l-green-500',
      !isAttested && 'border-l-4 border-l-gray-300',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* Attestation Status */}
              {isAttested ? (
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Attested
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-600">
                  <FileCheck className="h-3 w-3 mr-1" />
                  Pending Attestation
                </Badge>
              )}
              
              {/* Control Type */}
              <Badge variant="outline">
                {typeConfig.label}
              </Badge>
              
              {/* Status */}
              <Badge className={cn(statusConfig.bgColor, statusConfig.color)}>
                {statusConfig.label}
              </Badge>
            </div>
            
            <CardTitle className="text-lg">{control.name}</CardTitle>
            
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {/* Owner */}
              {control.ownerName && (
                <span>Owner: {control.ownerName}</span>
              )}
              
              {/* Effectiveness Rating */}
              {effectivenessRating !== undefined && (
                <div className="flex items-center gap-2">
                  <span>Effectiveness:</span>
                  <span className={cn(
                    'font-medium',
                    effectivenessRating >= 90 && 'text-green-600',
                    effectivenessRating >= 70 && effectivenessRating < 90 && 'text-amber-600',
                    effectivenessRating < 70 && 'text-red-600',
                  )}>
                    {effectivenessRating}%
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          {control.description}
        </p>
        
        {/* Effectiveness Bar */}
        {effectivenessRating !== undefined && (
          <div className="mb-3">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  effectivenessRating >= 90 && 'bg-green-500',
                  effectivenessRating >= 70 && effectivenessRating < 90 && 'bg-amber-500',
                  effectivenessRating < 70 && 'bg-red-500',
                )}
                style={{ width: `${effectivenessRating}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="space-y-4 pt-3 border-t">
            {/* Latest Evidence */}
            {latestEvidence && (
              <div className="bg-muted/50 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Latest Evidence</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(latestEvidence.executionDate).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm">{latestEvidence.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {latestEvidence.details}
                </p>
              </div>
            )}
            
            {/* Attestation Details */}
            {attestation && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-green-700 mb-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Attestation Recorded</span>
                </div>
                <p className="text-sm text-green-600">
                  {attestation.rationale}
                </p>
                <p className="text-xs text-green-600 mt-2">
                  Attested by {attestation.attestedBy} on{' '}
                  {new Date(attestation.attestedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Action Button */}
        {!isAttested && (
          <div className="flex justify-end pt-3 border-t mt-3">
            <Button size="sm" onClick={onAttest}>
              <PenTool className="h-4 w-4 mr-1" />
              Attest Effectiveness
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function EffectivenessSignoffStep({
  controls,
  summary,
  attestations,
  onAttestation,
  onComplete,
}: EffectivenessSignoffStepProps) {
  const [attestDialogOpen, setAttestDialogOpen] = useState(false)
  const [attestControlId, setAttestControlId] = useState<string | null>(null)
  const [expandedControlId, setExpandedControlId] = useState<string | null>(null)

  const attestControl = controls.find(c => c.id === attestControlId)

  // Get attestation for each control
  const getAttestation = (controlId: string) => {
    return attestations.find(a => a.controlId === controlId)
  }

  // Count attested controls
  const attestedCount = useMemo(() => {
    return controls.filter(c => 
      getAttestation(c.id) || c.effectivenessRating !== undefined
    ).length
  }, [controls, attestations])

  // Check if all controls are attested
  const allAttested = attestedCount === controls.length

  // Calculate average effectiveness
  const avgEffectiveness = useMemo(() => {
    const ratings = controls
      .map(c => getAttestation(c.id)?.effectivenessRating ?? c.effectivenessRating)
      .filter((r): r is number => r !== undefined)
    
    if (ratings.length === 0) return 0
    return Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length)
  }, [controls, attestations])

  const handleAttestClick = (controlId: string) => {
    setAttestControlId(controlId)
    setAttestDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Effectiveness Sign-off</h2>
        <p className="text-muted-foreground mt-1">
          Attest to the effectiveness of each control. All controls must be attested before proceeding.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{controls.length}</div>
            <div className="text-sm text-muted-foreground">Total Controls</div>
          </CardContent>
        </Card>
        <Card className={cn(allAttested && 'border-l-4 border-l-green-500')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className={cn(
                'h-5 w-5',
                allAttested ? 'text-green-600' : 'text-gray-400'
              )} />
              <div className="text-2xl font-bold">
                {attestedCount}/{controls.length}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Attested</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={cn(
              'text-2xl font-bold',
              avgEffectiveness >= 90 && 'text-green-600',
              avgEffectiveness >= 70 && avgEffectiveness < 90 && 'text-amber-600',
              avgEffectiveness < 70 && 'text-red-600',
            )}>
              {avgEffectiveness}%
            </div>
            <div className="text-sm text-muted-foreground">Avg Effectiveness</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Shield className={cn(
                'h-5 w-5',
                summary.failedControls === 0 ? 'text-green-600' : 'text-red-600'
              )} />
              <div className={cn(
                'text-2xl font-bold',
                summary.failedControls === 0 ? 'text-green-600' : 'text-red-600'
              )}>
                {summary.failedControls === 0 ? 'Strong' : 'Needs Work'}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Control Posture</div>
          </CardContent>
        </Card>
      </div>

      {/* Overall Effectiveness */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Control Effectiveness</span>
            <span className={cn(
              'text-lg font-bold',
              avgEffectiveness >= 90 && 'text-green-600',
              avgEffectiveness >= 70 && avgEffectiveness < 90 && 'text-amber-600',
              avgEffectiveness < 70 && 'text-red-600',
            )}>
              {avgEffectiveness}%
            </span>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                avgEffectiveness >= 90 && 'bg-green-500',
                avgEffectiveness >= 70 && avgEffectiveness < 90 && 'bg-amber-500',
                avgEffectiveness < 70 && 'bg-red-500',
              )}
              style={{ width: `${avgEffectiveness}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>0%</span>
            <span className="text-amber-600">Threshold: 70%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Pending Attestations Warning */}
      {!allAttested && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {controls.length - attestedCount} control{controls.length - attestedCount !== 1 ? 's' : ''} pending attestation
            </span>
          </div>
          <p className="text-sm text-amber-600 mt-1">
            All controls must be attested before completing this phase.
          </p>
        </div>
      )}

      {/* Control Cards */}
      <div className="space-y-4">
        {controls.map(control => (
          <ControlAttestationCard
            key={control.id}
            control={control}
            attestation={getAttestation(control.id)}
            isExpanded={expandedControlId === control.id}
            onToggleExpand={() => {
              setExpandedControlId(expandedControlId === control.id ? null : control.id)
            }}
            onAttest={() => handleAttestClick(control.id)}
          />
        ))}
      </div>

      {/* Attestation Dialog */}
      {attestControl && (
        <AttestationDialog
          open={attestDialogOpen}
          onOpenChange={setAttestDialogOpen}
          control={attestControl}
          onAttest={onAttestation}
        />
      )}

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={!allAttested}
        >
          {allAttested
            ? 'Complete Controls Management'
            : `${controls.length - attestedCount} attestation${controls.length - attestedCount !== 1 ? 's' : ''} remaining`}
        </Button>
      </div>
    </div>
  )
}

export default EffectivenessSignoffStep
