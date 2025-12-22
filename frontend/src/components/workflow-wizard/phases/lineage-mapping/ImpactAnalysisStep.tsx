/**
 * ImpactAnalysisStep Component
 * 
 * Step 3 of Lineage Mapping phase - Configure notification rules for source changes.
 * Allows setting up impact analysis rules to monitor upstream changes.
 * 
 * Requirements: 7.4
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Edit,
  GitBranch,
  Mail,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  Webhook,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LineageNode,
  LineageEdge,
  ImpactRule,
  ImpactAnalysisConfig,
  ImpactPreview,
  NotificationChannel,
  LineageMappingSummary,
  calculateImpactPreview,
} from './types'

// ============================================================================
// Channel Icons
// ============================================================================

const channelIcons: Record<NotificationChannel, typeof Mail> = {
  email: Mail,
  slack: MessageSquare,
  teams: MessageSquare,
  webhook: Webhook,
}

const triggerTypeLabels = {
  schema_change: 'Schema Change',
  data_change: 'Data Change',
  quality_drop: 'Quality Drop',
  availability: 'Availability Issue',
}

// ============================================================================
// Component Props
// ============================================================================

interface ImpactAnalysisStepProps {
  nodes: LineageNode[]
  edges: LineageEdge[]
  impactConfig: ImpactAnalysisConfig
  onCreateRule: (rule: Omit<ImpactRule, 'id' | 'createdAt' | 'createdBy'>) => void
  onUpdateRule: (ruleId: string, updates: Partial<ImpactRule>) => void
  onDeleteRule: (ruleId: string) => void
  summary: LineageMappingSummary
  onComplete: () => void
}

// ============================================================================
// Rule Form State
// ============================================================================

interface RuleFormState {
  name: string
  description: string
  sourceNodeId: string
  triggerType: ImpactRule['triggerType']
  threshold?: number
  notificationChannels: NotificationChannel[]
  recipients: string[]
  enabled: boolean
}

const defaultFormState: RuleFormState = {
  name: '',
  description: '',
  sourceNodeId: '',
  triggerType: 'schema_change',
  notificationChannels: ['email'],
  recipients: [],
  enabled: true,
}

// ============================================================================
// Main Component
// ============================================================================

export function ImpactAnalysisStep({
  nodes,
  edges,
  impactConfig,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onComplete,
}: ImpactAnalysisStepProps) {
  const [showRuleDialog, setShowRuleDialog] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [formState, setFormState] = useState<RuleFormState>(defaultFormState)
  const [recipientInput, setRecipientInput] = useState('')
  const [selectedPreviewNodeId, setSelectedPreviewNodeId] = useState<string | null>(null)

  // Get source nodes (tables that can trigger changes)
  const sourceNodes = useMemo(() => {
    return nodes.filter(n => n.type === 'source_table' || n.type === 'staging_table')
  }, [nodes])

  // Calculate impact preview for selected node
  const impactPreview = useMemo<ImpactPreview | null>(() => {
    if (!selectedPreviewNodeId) return null
    return calculateImpactPreview(selectedPreviewNodeId, nodes, edges)
  }, [selectedPreviewNodeId, nodes, edges])

  // Handle opening create dialog
  const handleOpenCreateDialog = () => {
    setFormState(defaultFormState)
    setEditingRuleId(null)
    setShowRuleDialog(true)
  }

  // Handle opening edit dialog
  const handleOpenEditDialog = (rule: ImpactRule) => {
    setFormState({
      name: rule.name,
      description: rule.description,
      sourceNodeId: rule.sourceNodeId,
      triggerType: rule.triggerType,
      threshold: rule.threshold,
      notificationChannels: rule.notificationChannels,
      recipients: rule.recipients,
      enabled: rule.enabled,
    })
    setEditingRuleId(rule.id)
    setShowRuleDialog(true)
  }

  // Handle form submission
  const handleSubmit = () => {
    const sourceNode = nodes.find(n => n.id === formState.sourceNodeId)
    
    if (editingRuleId) {
      onUpdateRule(editingRuleId, {
        ...formState,
        sourceNodeName: sourceNode?.label || '',
      })
    } else {
      onCreateRule({
        ...formState,
        sourceNodeName: sourceNode?.label || '',
      })
    }
    
    setShowRuleDialog(false)
    setFormState(defaultFormState)
    setEditingRuleId(null)
  }

  // Handle adding recipient
  const handleAddRecipient = () => {
    if (recipientInput.trim() && !formState.recipients.includes(recipientInput.trim())) {
      setFormState(prev => ({
        ...prev,
        recipients: [...prev.recipients, recipientInput.trim()],
      }))
      setRecipientInput('')
    }
  }

  // Handle removing recipient
  const handleRemoveRecipient = (email: string) => {
    setFormState(prev => ({
      ...prev,
      recipients: prev.recipients.filter(r => r !== email),
    }))
  }

  // Toggle notification channel
  const toggleChannel = (channel: NotificationChannel) => {
    setFormState(prev => ({
      ...prev,
      notificationChannels: prev.notificationChannels.includes(channel)
        ? prev.notificationChannels.filter(c => c !== channel)
        : [...prev.notificationChannels, channel],
    }))
  }

  const enabledRulesCount = impactConfig.rules.filter(r => r.enabled).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Impact Analysis Setup</h2>
        <p className="text-muted-foreground mt-1">
          Configure notification rules to be alerted when upstream data sources change.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{impactConfig.rules.length}</div>
            <div className="text-sm text-muted-foreground">Total Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{enabledRulesCount}</div>
            <div className="text-sm text-muted-foreground">Active Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{sourceNodes.length}</div>
            <div className="text-sm text-muted-foreground">Monitorable Sources</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">
              {impactConfig.globalSettings.sensitivityLevel}
            </div>
            <div className="text-sm text-muted-foreground">Sensitivity Level</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rules List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Rules
            </CardTitle>
            <CardDescription>
              Rules that trigger alerts when source data changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-end mb-4">
              <Button onClick={handleOpenCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Rule
              </Button>
            </div>
            {impactConfig.rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No notification rules configured</p>
                <p className="text-sm mt-1">Add rules to monitor upstream changes</p>
              </div>
            ) : (
              <ScrollArea className="h-[350px]">
                <div className="space-y-3">
                  {impactConfig.rules.map(rule => (
                    <div
                      key={rule.id}
                      className={cn(
                        'p-4 border rounded-lg',
                        rule.enabled ? 'bg-white' : 'bg-gray-50 opacity-75'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{rule.name}</span>
                            {!rule.enabled && (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {rule.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditDialog(rule)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteRule(rule.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="outline">
                          <Database className="h-3 w-3 mr-1" />
                          {rule.sourceNodeName}
                        </Badge>
                        <Badge variant="outline">
                          <Zap className="h-3 w-3 mr-1" />
                          {triggerTypeLabels[rule.triggerType]}
                        </Badge>
                        {rule.notificationChannels.map(channel => {
                          const Icon = channelIcons[channel]
                          return (
                            <Badge key={channel} variant="secondary">
                              <Icon className="h-3 w-3 mr-1" />
                              {channel}
                            </Badge>
                          )
                        })}
                      </div>
                      
                      {rule.recipients.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          Recipients: {rule.recipients.join(', ')}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Impact Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Impact Preview
            </CardTitle>
            <CardDescription>
              Select a source to preview downstream impact
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Select
                value={selectedPreviewNodeId || ''}
                onValueChange={setSelectedPreviewNodeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a source node..." />
                </SelectTrigger>
                <SelectContent>
                  {sourceNodes.map(node => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {impactPreview && (
                <div className="space-y-4">
                  <div className={cn(
                    'p-4 rounded-lg border-2',
                    impactPreview.estimatedImpactLevel === 'critical' ? 'border-red-300 bg-red-50' :
                    impactPreview.estimatedImpactLevel === 'high' ? 'border-amber-300 bg-amber-50' :
                    impactPreview.estimatedImpactLevel === 'medium' ? 'border-yellow-300 bg-yellow-50' :
                    'border-green-300 bg-green-50'
                  )}>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={cn(
                        'h-5 w-5',
                        impactPreview.estimatedImpactLevel === 'critical' ? 'text-red-500' :
                        impactPreview.estimatedImpactLevel === 'high' ? 'text-amber-500' :
                        impactPreview.estimatedImpactLevel === 'medium' ? 'text-yellow-500' :
                        'text-green-500'
                      )} />
                      <span className="font-medium capitalize">
                        {impactPreview.estimatedImpactLevel} Impact
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Changes to this source will affect downstream components
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold">{impactPreview.affectedNodes.length}</div>
                      <div className="text-xs text-muted-foreground">Affected Nodes</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold">{impactPreview.affectedCDEs.length}</div>
                      <div className="text-xs text-muted-foreground">Affected CDEs</div>
                    </div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold">{impactPreview.affectedReports.length}</div>
                      <div className="text-xs text-muted-foreground">Affected Reports</div>
                    </div>
                  </div>

                  {impactPreview.affectedReports.length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Affected Reports</div>
                      <div className="flex flex-wrap gap-2">
                        {impactPreview.affectedReports.map(report => (
                          <Badge key={report} variant="destructive">
                            {report}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!selectedPreviewNodeId && (
                <div className="text-center py-8 text-muted-foreground">
                  <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Select a source node to preview impact</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRuleId ? 'Edit Notification Rule' : 'Create Notification Rule'}
            </DialogTitle>
            <DialogDescription>
              Configure when and how to be notified about source changes
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rule Name</Label>
              <Input
                value={formState.name}
                onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., LOS Schema Change Alert"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formState.description}
                onChange={(e) => setFormState(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this rule monitors..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Source Node</Label>
              <Select
                value={formState.sourceNodeId}
                onValueChange={(value) => setFormState(prev => ({ ...prev, sourceNodeId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select source to monitor..." />
                </SelectTrigger>
                <SelectContent>
                  {sourceNodes.map(node => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trigger Type</Label>
              <Select
                value={formState.triggerType}
                onValueChange={(value) => setFormState(prev => ({ 
                  ...prev, 
                  triggerType: value as ImpactRule['triggerType'] 
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(triggerTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formState.triggerType === 'quality_drop' && (
              <div className="space-y-2">
                <Label>Quality Threshold (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={formState.threshold || ''}
                  onChange={(e) => setFormState(prev => ({ 
                    ...prev, 
                    threshold: parseInt(e.target.value) || undefined 
                  }))}
                  placeholder="e.g., 95"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notification Channels</Label>
              <div className="flex flex-wrap gap-2">
                {(['email', 'slack', 'teams', 'webhook'] as NotificationChannel[]).map(channel => {
                  const Icon = channelIcons[channel]
                  const isSelected = formState.notificationChannels.includes(channel)
                  return (
                    <Button
                      key={channel}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleChannel(channel)}
                    >
                      <Icon className="h-4 w-4 mr-1" />
                      {channel}
                    </Button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <Input
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="email@example.com"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRecipient())}
                />
                <Button type="button" variant="outline" onClick={handleAddRecipient}>
                  Add
                </Button>
              </div>
              {formState.recipients.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formState.recipients.map(email => (
                    <Badge key={email} variant="secondary" className="flex items-center gap-1">
                      {email}
                      <button onClick={() => handleRemoveRecipient(email)}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Label>Enable Rule</Label>
              <input
                type="checkbox"
                checked={formState.enabled}
                onChange={(e) => setFormState(prev => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formState.name || !formState.sourceNodeId}
            >
              {editingRuleId ? 'Update Rule' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {enabledRulesCount > 0 ? (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              {enabledRulesCount} notification rule(s) configured
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Settings className="h-4 w-4" />
              No notification rules configured (optional)
            </span>
          )}
        </div>
        <Button onClick={onComplete}>
          Continue to Lineage Approval
        </Button>
      </div>
    </div>
  )
}

export default ImpactAnalysisStep
