/**
 * ConflictResolution Component
 * 
 * Displays conflict resolution interface when concurrent edits are detected.
 * Shows both versions side-by-side and allows user to choose resolution.
 * 
 * Requirements: 13.5 - Display resolution interface showing both versions
 */

import { useState } from 'react'
import { AlertTriangle, Check, GitMerge, ArrowLeft, ArrowRight, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { PendingChange } from '@/types/workflow-wizard'
import { ConflictInfo, FieldConflict, createMergedData } from '@/services/collaborationService'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export interface ConflictResolutionProps {
  conflict: ConflictInfo
  onResolve: (resolution: 'keep_local' | 'keep_remote' | 'merge', mergedData?: Record<string, unknown>) => void
  onDismiss: () => void
  isResolving?: boolean
}

export interface ConflictBannerProps {
  conflicts: ConflictInfo[]
  onViewConflict: (conflict: ConflictInfo) => void
  className?: string
}

export interface FieldResolutionMap {
  [field: string]: 'local' | 'remote'
}

// ============================================================================
// Conflict Resolution Dialog
// ============================================================================

export function ConflictResolutionDialog({
  conflict,
  onResolve,
  onDismiss,
  isResolving = false,
}: ConflictResolutionProps) {
  const [selectedResolution, setSelectedResolution] = useState<'keep_local' | 'keep_remote' | 'merge' | null>(null)
  const [fieldResolutions, setFieldResolutions] = useState<FieldResolutionMap>({})
  const [showFieldDetails, setShowFieldDetails] = useState(false)

  // Initialize field resolutions when merge is selected
  const initializeFieldResolutions = () => {
    const resolutions: FieldResolutionMap = {}
    conflict.fieldConflicts?.forEach(fc => {
      resolutions[fc.field] = 'remote' // Default to remote
    })
    setFieldResolutions(resolutions)
  }

  const handleResolutionChange = (resolution: 'keep_local' | 'keep_remote' | 'merge') => {
    setSelectedResolution(resolution)
    if (resolution === 'merge') {
      initializeFieldResolutions()
      setShowFieldDetails(true)
    } else {
      setShowFieldDetails(false)
    }
  }

  const handleFieldResolutionChange = (field: string, value: 'local' | 'remote') => {
    setFieldResolutions(prev => ({ ...prev, [field]: value }))
  }

  const handleResolve = () => {
    if (!selectedResolution) return

    if (selectedResolution === 'merge') {
      const mergedData = createMergedData(
        conflict.localChange.data,
        conflict.remoteChange.data,
        fieldResolutions
      )
      onResolve(selectedResolution, mergedData)
    } else {
      onResolve(selectedResolution)
    }
  }

  const hasFieldConflicts = conflict.fieldConflicts && conflict.fieldConflicts.length > 0

  return (
    <Dialog open onOpenChange={() => onDismiss()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Conflict Detected
          </DialogTitle>
          <DialogDescription>
            Another user has made changes to this step. Please choose how to resolve the conflict.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Conflict Info */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Step: {formatStepId(conflict.stepId)}</span>
            <div className="flex items-center gap-4">
              <span>Your version: v{conflict.localVersion}</span>
              <span>Their version: v{conflict.remoteVersion}</span>
              <span>Detected: {formatTime(conflict.detectedAt)}</span>
            </div>
          </div>

          {/* Field Conflicts Summary */}
          {hasFieldConflicts && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>{conflict.fieldConflicts!.length}</strong> field(s) have conflicting values
              </p>
            </div>
          )}

          {/* Side-by-side comparison */}
          <div className="grid grid-cols-2 gap-4">
            {/* Local Version */}
            <VersionCard
              title="Your Changes"
              change={conflict.localChange}
              isSelected={selectedResolution === 'keep_local'}
              onSelect={() => handleResolutionChange('keep_local')}
              variant="local"
            />

            {/* Remote Version */}
            <VersionCard
              title="Their Changes"
              change={conflict.remoteChange}
              isSelected={selectedResolution === 'keep_remote'}
              onSelect={() => handleResolutionChange('keep_remote')}
              variant="remote"
            />
          </div>

          {/* Merge Option */}
          <Card
            className={cn(
              "cursor-pointer transition-all",
              selectedResolution === 'merge' 
                ? "ring-2 ring-primary border-primary" 
                : "hover:border-primary/50"
            )}
            onClick={() => handleResolutionChange('merge')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  selectedResolution === 'merge' ? "bg-primary/10" : "bg-muted"
                )}>
                  <GitMerge className={cn(
                    "h-5 w-5",
                    selectedResolution === 'merge' ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Merge Changes</p>
                  <p className="text-sm text-muted-foreground">
                    Choose which version to keep for each conflicting field
                  </p>
                </div>
                {selectedResolution === 'merge' && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Field-level resolution (when merge is selected) */}
          {selectedResolution === 'merge' && hasFieldConflicts && (
            <Collapsible open={showFieldDetails} onOpenChange={setShowFieldDetails}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span>Field-by-field resolution</span>
                  {showFieldDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-3 mt-2 p-4 bg-muted/50 rounded-lg">
                  {conflict.fieldConflicts!.map(fc => (
                    <FieldConflictResolver
                      key={fc.field}
                      fieldConflict={fc}
                      resolution={fieldResolutions[fc.field] || 'remote'}
                      onResolutionChange={(value) => handleFieldResolutionChange(fc.field, value)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onDismiss} disabled={isResolving}>
            Cancel
          </Button>
          <Button 
            onClick={handleResolve} 
            disabled={!selectedResolution || isResolving}
          >
            {isResolving ? 'Resolving...' : 'Apply Resolution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Field Conflict Resolver Component
// ============================================================================

interface FieldConflictResolverProps {
  fieldConflict: FieldConflict
  resolution: 'local' | 'remote'
  onResolutionChange: (value: 'local' | 'remote') => void
}

function FieldConflictResolver({
  fieldConflict,
  resolution,
  onResolutionChange,
}: FieldConflictResolverProps) {
  return (
    <div className="border rounded-lg p-3 bg-background">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm">{formatFieldName(fieldConflict.field)}</span>
        <RadioGroup
          value={resolution}
          onValueChange={(value) => onResolutionChange(value as 'local' | 'remote')}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="local" id={`${fieldConflict.field}-local`} />
            <Label htmlFor={`${fieldConflict.field}-local`} className="text-xs">Your value</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="remote" id={`${fieldConflict.field}-remote`} />
            <Label htmlFor={`${fieldConflict.field}-remote`} className="text-xs">Their value</Label>
          </div>
        </RadioGroup>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className={cn(
          "p-2 rounded border",
          resolution === 'local' ? "border-blue-500 bg-blue-50" : "border-muted"
        )}>
          <span className="text-muted-foreground block mb-1">Your value:</span>
          <code className="text-xs break-all">{formatValue(fieldConflict.localValue)}</code>
        </div>
        <div className={cn(
          "p-2 rounded border",
          resolution === 'remote' ? "border-green-500 bg-green-50" : "border-muted"
        )}>
          <span className="text-muted-foreground block mb-1">Their value:</span>
          <code className="text-xs break-all">{formatValue(fieldConflict.remoteValue)}</code>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Version Card Component
// ============================================================================

interface VersionCardProps {
  title: string
  change: PendingChange
  isSelected: boolean
  onSelect: () => void
  variant: 'local' | 'remote'
}

function VersionCard({ title, change, isSelected, onSelect, variant }: VersionCardProps) {
  const isLocal = variant === 'local'
  
  return (
    <Card
      className={cn(
        "cursor-pointer transition-all",
        isSelected 
          ? "ring-2 ring-primary border-primary" 
          : "hover:border-primary/50"
      )}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {isLocal ? (
              <ArrowRight className="h-4 w-4 text-blue-500" />
            ) : (
              <ArrowLeft className="h-4 w-4 text-green-500" />
            )}
            {title}
          </span>
          {isSelected && <Check className="h-4 w-4 text-primary" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* User info */}
        <div className="flex items-center gap-2 text-sm">
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px]">
              {change.userId.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground">
            {isLocal ? 'You' : `User ${change.userId.slice(-4)}`}
          </span>
        </div>

        {/* Timestamp */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatTime(change.timestamp)}
        </div>

        {/* Change type */}
        <Badge variant={change.changeType === 'complete' ? 'default' : 'secondary'}>
          {change.changeType}
        </Badge>

        {/* Data preview */}
        <div className="bg-muted rounded-md p-2 text-xs font-mono max-h-32 overflow-auto">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(change.data, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Conflict Banner Component
// ============================================================================

export function ConflictBanner({
  conflicts,
  onViewConflict,
  className,
}: ConflictBannerProps) {
  if (conflicts.length === 0) {
    return null
  }

  return (
    <div className={cn(
      "bg-amber-50 border border-amber-200 rounded-lg p-3",
      className
    )}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">
            {conflicts.length === 1 
              ? 'Conflict detected' 
              : `${conflicts.length} conflicts detected`}
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Another user has made changes that conflict with yours. Please resolve before continuing.
          </p>
        </div>
        <Button 
          size="sm" 
          variant="outline"
          className="border-amber-300 text-amber-700 hover:bg-amber-100"
          onClick={() => onViewConflict(conflicts[0])}
        >
          Resolve
        </Button>
      </div>

      {conflicts.length > 1 && (
        <>
          <Separator className="my-2 bg-amber-200" />
          <div className="space-y-1">
            {conflicts.map((conflict, index) => (
              <button
                key={conflict.id}
                className="w-full text-left text-xs text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded px-2 py-1 transition-colors"
                onClick={() => onViewConflict(conflict)}
              >
                {index + 1}. {formatStepId(conflict.stepId)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// Inline Conflict Indicator
// ============================================================================

export interface ConflictIndicatorProps {
  hasConflict: boolean
  onClick?: () => void
  className?: string
}

export function ConflictIndicator({
  hasConflict,
  onClick,
  className,
}: ConflictIndicatorProps) {
  if (!hasConflict) {
    return null
  }

  return (
    <button
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-full",
        "bg-amber-100 text-amber-700 text-xs font-medium",
        "hover:bg-amber-200 transition-colors",
        className
      )}
      onClick={onClick}
    >
      <AlertTriangle className="h-3 w-3" />
      Conflict
    </button>
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatStepId(stepId: string): string {
  return stepId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return value || '(empty)'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}
