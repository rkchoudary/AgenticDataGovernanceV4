/**
 * CompensatingControlStep Component
 * 
 * Step 3 of Controls Management phase - displays expiration warnings
 * for compensating controls and requires renewal confirmation.
 * 
 * Requirements: 9.4
 */

import { useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle,
  RefreshCw,
  Link2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  CONTROL_TYPE_CONFIG,
  getLatestEvidence,
} from './types'
import { cn } from '@/lib/utils'

// ============================================================================
// Component Props
// ============================================================================

interface CompensatingControlStepProps {
  controls: Control[]
  expiringControls: Control[]
  selectedControlId: string | null
  onSelectControl: (controlId: string | null) => void
  onRenewalConfirm: (controlId: string, newExpirationDate: string) => void
  onComplete: () => void
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDaysUntilExpiration(expirationDate: string): number {
  const expDate = new Date(expirationDate)
  const now = new Date()
  return Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function getExpirationStatus(daysUntil: number): {
  label: string
  color: string
  bgColor: string
  urgent: boolean
} {
  if (daysUntil <= 0) {
    return {
      label: 'Expired',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      urgent: true,
    }
  }
  if (daysUntil <= 7) {
    return {
      label: 'Critical',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      urgent: true,
    }
  }
  if (daysUntil <= 14) {
    return {
      label: 'Warning',
      color: 'text-amber-700',
      bgColor: 'bg-amber-100',
      urgent: true,
    }
  }
  if (daysUntil <= 30) {
    return {
      label: 'Upcoming',
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-100',
      urgent: false,
    }
  }
  return {
    label: 'Active',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    urgent: false,
  }
}

// ============================================================================
// Renewal Dialog
// ============================================================================

interface RenewalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  control: Control
  onConfirm: (newExpirationDate: string) => void
}

function RenewalDialog({
  open,
  onOpenChange,
  control,
  onConfirm,
}: RenewalDialogProps) {
  const [newExpirationDate, setNewExpirationDate] = useState('')
  const [justification, setJustification] = useState('')

  const handleConfirm = () => {
    if (newExpirationDate && justification.trim()) {
      onConfirm(newExpirationDate)
      setNewExpirationDate('')
      setJustification('')
      onOpenChange(false)
    }
  }

  // Calculate minimum date (today)
  const minDate = new Date().toISOString().split('T')[0]
  // Calculate maximum date (90 days from now - typical max for compensating controls)
  const maxDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const isValid = newExpirationDate && justification.trim().length >= 20

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renew Compensating Control</DialogTitle>
          <DialogDescription>
            Extend the expiration date for: {control.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Expiration */}
          <div className="bg-muted/50 rounded-md p-3">
            <div className="text-sm text-muted-foreground">Current Expiration</div>
            <div className="font-medium">
              {control.expirationDate
                ? new Date(control.expirationDate).toLocaleDateString()
                : 'Not set'}
            </div>
          </div>

          {/* New Expiration Date */}
          <div className="space-y-2">
            <Label htmlFor="new-expiration">New Expiration Date *</Label>
            <Input
              id="new-expiration"
              type="date"
              value={newExpirationDate}
              onChange={(e) => setNewExpirationDate(e.target.value)}
              min={minDate}
              max={maxDate}
            />
            <p className="text-xs text-muted-foreground">
              Maximum extension: 90 days from today
            </p>
          </div>

          {/* Justification */}
          <div className="space-y-2">
            <Label htmlFor="justification">Renewal Justification * (min 20 characters)</Label>
            <Textarea
              id="justification"
              placeholder="Explain why this compensating control needs to be extended..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {justification.length}/20 characters minimum
            </p>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
            <div className="flex items-center gap-2 text-amber-700 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">Important</span>
            </div>
            <p className="text-sm text-amber-600 mt-1">
              Compensating controls should be temporary. Ensure the underlying issue
              is being addressed and a permanent solution is in progress.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Confirm Renewal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Compensating Control Card
// ============================================================================

interface CompensatingControlCardProps {
  control: Control
  isExpanded: boolean
  isExpiring: boolean
  onToggleExpand: () => void
  onRenew: () => void
}

function CompensatingControlCard({
  control,
  isExpanded,
  isExpiring,
  onToggleExpand,
  onRenew,
}: CompensatingControlCardProps) {
  const typeConfig = CONTROL_TYPE_CONFIG[control.type]
  const latestEvidence = getLatestEvidence(control)
  
  const daysUntil = control.expirationDate
    ? getDaysUntilExpiration(control.expirationDate)
    : 999
  const expirationStatus = getExpirationStatus(daysUntil)

  return (
    <Card className={cn(
      'transition-all',
      isExpanded && 'ring-2 ring-primary',
      expirationStatus.urgent && 'border-l-4 border-l-red-500',
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {/* Expiration Status */}
              <Badge className={cn(expirationStatus.bgColor, expirationStatus.color)}>
                <Clock className="h-3 w-3 mr-1" />
                {expirationStatus.label}
              </Badge>
              
              {/* Control Type */}
              <Badge variant="outline">
                {typeConfig.label}
              </Badge>
              
              {/* Linked Issue */}
              {control.linkedIssueId && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  {control.linkedIssueId}
                </Badge>
              )}
            </div>
            
            <CardTitle className="text-lg">{control.name}</CardTitle>
            
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              {/* Owner */}
              {control.ownerName && (
                <span>Owner: {control.ownerName}</span>
              )}
              
              {/* Expiration Date */}
              {control.expirationDate && (
                <div className={cn(
                  'flex items-center gap-1',
                  daysUntil <= 7 && 'text-red-600 font-medium',
                  daysUntil > 7 && daysUntil <= 14 && 'text-amber-600',
                )}>
                  <Calendar className="h-3 w-3" />
                  Expires: {new Date(control.expirationDate).toLocaleDateString()}
                  {daysUntil > 0 && ` (${daysUntil} days)`}
                  {daysUntil <= 0 && ' (Expired)'}
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
        
        {/* Linked CDEs */}
        {control.linkedCDEs.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {control.linkedCDEs.map(cde => (
              <Badge key={cde} variant="outline" className="text-xs">
                CDE: {cde}
              </Badge>
            ))}
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
            
            {/* Expiration Warning */}
            {isExpiring && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Renewal Required</span>
                </div>
                <p className="text-sm text-red-600 mt-1">
                  This compensating control is expiring soon. Please review and confirm
                  renewal or ensure the underlying issue has been resolved.
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Action Buttons */}
        {isExpiring && (
          <div className="flex items-center gap-2 pt-3 border-t mt-3">
            <Button
              size="sm"
              onClick={onRenew}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Renew Control
            </Button>
            <Button
              size="sm"
              variant="outline"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Mark Issue Resolved
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

export function CompensatingControlStep({
  controls,
  expiringControls,
  selectedControlId,
  onSelectControl,
  onRenewalConfirm,
  onComplete,
}: CompensatingControlStepProps) {
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false)
  const [renewalControlId, setRenewalControlId] = useState<string | null>(null)

  const renewalControl = controls.find(c => c.id === renewalControlId)

  // Sort controls by expiration date
  const sortedControls = [...controls].sort((a, b) => {
    if (!a.expirationDate) return 1
    if (!b.expirationDate) return -1
    return new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()
  })

  const handleRenewClick = (controlId: string) => {
    setRenewalControlId(controlId)
    setRenewalDialogOpen(true)
  }

  const handleRenewalConfirm = (newExpirationDate: string) => {
    if (renewalControlId) {
      onRenewalConfirm(renewalControlId, newExpirationDate)
    }
  }

  // Check if all expiring controls have been addressed
  const allExpiringAddressed = expiringControls.every(c => {
    const daysUntil = c.expirationDate ? getDaysUntilExpiration(c.expirationDate) : 999
    return daysUntil > 30
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Compensating Control Check</h2>
        <p className="text-muted-foreground mt-1">
          Review compensating controls and confirm renewals for those approaching expiration.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{controls.length}</div>
            <div className="text-sm text-muted-foreground">Total Compensating Controls</div>
          </CardContent>
        </Card>
        <Card className={cn(expiringControls.length > 0 && 'border-l-4 border-l-amber-500')}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn(
                'h-5 w-5',
                expiringControls.length > 0 ? 'text-amber-600' : 'text-gray-400'
              )} />
              <div className="text-2xl font-bold text-amber-600">
                {expiringControls.length}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Expiring Within 30 Days</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              {allExpiringAddressed ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <Clock className="h-5 w-5 text-gray-400" />
              )}
              <div className={cn(
                'text-2xl font-bold',
                allExpiringAddressed ? 'text-green-600' : 'text-gray-600'
              )}>
                {allExpiringAddressed ? 'Complete' : 'Pending'}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Renewal Status</div>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Controls Warning */}
      {expiringControls.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              {expiringControls.length} compensating control{expiringControls.length !== 1 ? 's' : ''} expiring soon
            </span>
          </div>
          <p className="text-sm text-amber-600 mt-1">
            Review each control below and either renew or confirm the underlying issue has been resolved.
          </p>
        </div>
      )}

      {/* No Compensating Controls */}
      {controls.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <h3 className="text-lg font-medium">No Compensating Controls</h3>
              <p className="text-muted-foreground mt-1">
                There are no active compensating controls for this reporting cycle.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Control Cards */}
      {controls.length > 0 && (
        <div className="space-y-4">
          {sortedControls.map(control => {
            const isExpiring = expiringControls.some(c => c.id === control.id)
            return (
              <CompensatingControlCard
                key={control.id}
                control={control}
                isExpanded={selectedControlId === control.id}
                isExpiring={isExpiring}
                onToggleExpand={() => {
                  onSelectControl(selectedControlId === control.id ? null : control.id)
                }}
                onRenew={() => handleRenewClick(control.id)}
              />
            )
          })}
        </div>
      )}

      {/* Renewal Dialog */}
      {renewalControl && (
        <RenewalDialog
          open={renewalDialogOpen}
          onOpenChange={setRenewalDialogOpen}
          control={renewalControl}
          onConfirm={handleRenewalConfirm}
        />
      )}

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={onComplete}
          disabled={expiringControls.length > 0 && !allExpiringAddressed}
        >
          {expiringControls.length > 0 && !allExpiringAddressed
            ? `${expiringControls.length} control${expiringControls.length !== 1 ? 's' : ''} need renewal`
            : 'Continue to Effectiveness Sign-off'}
        </Button>
      </div>
    </div>
  )
}

export default CompensatingControlStep
