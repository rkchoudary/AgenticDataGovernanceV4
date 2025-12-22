import { useState } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  AlertTriangle,
  Loader2,
  Route,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useRoutingRules,
  useSaveRoutingRule,
  useDeleteRoutingRule,
  type RoutingRule,
  type ArtifactType,
} from '@/hooks/useApprovals'
import { cn } from '@/lib/utils'

const artifactTypeLabels: Record<ArtifactType, string> = {
  report_catalog: 'Report Catalog',
  cde_inventory: 'CDE Inventory',
  dq_rules: 'DQ Rules',
  lineage_graph: 'Lineage Graph',
  control_matrix: 'Control Matrix',
  compliance_package: 'Compliance Package',
}

interface RuleFormData {
  id?: string
  name: string
  artifactType: ArtifactType | ''
  condition: string
  assignTo: string
  priority: number
  enabled: boolean
}

const emptyRule: RuleFormData = {
  name: '',
  artifactType: '',
  condition: '',
  assignTo: '',
  priority: 1,
  enabled: true,
}

export function RoutingRulesManager() {
  const { data: rules, isLoading } = useRoutingRules()
  const saveRule = useSaveRoutingRule()
  const deleteRule = useDeleteRoutingRule()

  const [editingRule, setEditingRule] = useState<RuleFormData | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = (data: RuleFormData): boolean => {
    const newErrors: Record<string, string> = {}

    if (!data.name.trim()) {
      newErrors.name = 'Rule name is required'
    }
    if (!data.artifactType) {
      newErrors.artifactType = 'Artifact type is required'
    }
    if (!data.assignTo.trim()) {
      newErrors.assignTo = 'Assignee is required'
    }
    if (data.priority < 1 || data.priority > 100) {
      newErrors.priority = 'Priority must be between 1 and 100'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = async () => {
    if (!editingRule || !validateForm(editingRule)) return

    try {
      await saveRule.mutateAsync({
        ...editingRule,
        artifactType: editingRule.artifactType as ArtifactType,
      })
      setEditingRule(null)
      setIsCreating(false)
      setErrors({})
    } catch (error) {
      setErrors({ submit: 'Failed to save rule. Please try again.' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this routing rule?')) return

    try {
      await deleteRule.mutateAsync(id)
    } catch (error) {
      setErrors({ submit: 'Failed to delete rule. Please try again.' })
    }
  }

  const handleEdit = (rule: RoutingRule) => {
    setEditingRule({
      id: rule.id,
      name: rule.name,
      artifactType: rule.artifactType,
      condition: rule.condition,
      assignTo: rule.assignTo,
      priority: rule.priority,
      enabled: rule.enabled,
    })
    setIsCreating(false)
    setErrors({})
  }

  const handleCreate = () => {
    setEditingRule({ ...emptyRule })
    setIsCreating(true)
    setErrors({})
  }

  const handleCancel = () => {
    setEditingRule(null)
    setIsCreating(false)
    setErrors({})
  }

  const sortedRules = rules?.slice().sort((a, b) => a.priority - b.priority) || []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Route className="h-5 w-5" />
              Approval Routing Rules
            </CardTitle>
            <CardDescription>
              Configure automatic routing and escalation rules for approvals
            </CardDescription>
          </div>
          <Button onClick={handleCreate} disabled={isCreating || !!editingRule}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create/Edit Form */}
        {(isCreating || editingRule) && (
          <Card className="border-primary">
            <CardContent className="pt-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Rule Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Rule Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={cn(
                      'w-full px-4 py-2 border rounded-lg bg-background',
                      errors.name && 'border-red-500'
                    )}
                    placeholder="e.g., Critical Reports to Manager"
                    value={editingRule?.name || ''}
                    onChange={(e) =>
                      setEditingRule((prev) => prev && { ...prev, name: e.target.value })
                    }
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500">{errors.name}</p>
                  )}
                </div>

                {/* Artifact Type */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Artifact Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={editingRule?.artifactType || ''}
                    onValueChange={(value) =>
                      setEditingRule((prev) => prev && { ...prev, artifactType: value as ArtifactType })
                    }
                  >
                    <SelectTrigger className={cn(errors.artifactType && 'border-red-500')}>
                      <SelectValue placeholder="Select artifact type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(artifactTypeLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.artifactType && (
                    <p className="text-sm text-red-500">{errors.artifactType}</p>
                  )}
                </div>

                {/* Condition */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Condition (Optional)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border rounded-lg bg-background"
                    placeholder="e.g., urgency == 'critical'"
                    value={editingRule?.condition || ''}
                    onChange={(e) =>
                      setEditingRule((prev) => prev && { ...prev, condition: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to match all requests of this type
                  </p>
                </div>

                {/* Assign To */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Assign To <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={cn(
                      'w-full px-4 py-2 border rounded-lg bg-background',
                      errors.assignTo && 'border-red-500'
                    )}
                    placeholder="Enter assignee name or role"
                    value={editingRule?.assignTo || ''}
                    onChange={(e) =>
                      setEditingRule((prev) => prev && { ...prev, assignTo: e.target.value })
                    }
                  />
                  {errors.assignTo && (
                    <p className="text-sm text-red-500">{errors.assignTo}</p>
                  )}
                </div>

                {/* Priority */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Priority (1-100)</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    className={cn(
                      'w-full px-4 py-2 border rounded-lg bg-background',
                      errors.priority && 'border-red-500'
                    )}
                    value={editingRule?.priority || 1}
                    onChange={(e) =>
                      setEditingRule((prev) =>
                        prev && { ...prev, priority: parseInt(e.target.value) || 1 }
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower numbers = higher priority
                  </p>
                  {errors.priority && (
                    <p className="text-sm text-red-500">{errors.priority}</p>
                  )}
                </div>

                {/* Enabled */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingRule?.enabled ?? true}
                      onChange={(e) =>
                        setEditingRule((prev) => prev && { ...prev, enabled: e.target.checked })
                      }
                    />
                    <span className="text-sm">Rule is enabled</span>
                  </label>
                </div>
              </div>

              {errors.submit && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {errors.submit}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={handleCancel}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saveRule.isPending}>
                  {saveRule.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {isCreating ? 'Create Rule' : 'Save Changes'}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rules List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sortedRules.length === 0 ? (
          <div className="text-center py-8">
            <Route className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No routing rules configured</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create rules to automatically route approvals to the right people
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRules.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  'border rounded-lg p-4 transition-colors',
                  !rule.enabled && 'opacity-50 bg-muted',
                  editingRule?.id === rule.id && 'border-primary'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs bg-muted px-2 py-1 rounded font-mono">
                        #{rule.priority}
                      </span>
                      <h4 className="font-medium">{rule.name}</h4>
                      {!rule.enabled && (
                        <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground space-y-1">
                      <p>
                        <span className="font-medium">Type:</span>{' '}
                        {artifactTypeLabels[rule.artifactType]}
                      </p>
                      {rule.condition && (
                        <p>
                          <span className="font-medium">Condition:</span>{' '}
                          <code className="bg-muted px-1 rounded">{rule.condition}</code>
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Assign to:</span> {rule.assignTo}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(rule)}
                      disabled={!!editingRule}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(rule.id)}
                      disabled={deleteRule.isPending}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">How Routing Rules Work</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Rules are evaluated in priority order (lowest number first)</li>
                <li>The first matching rule determines the assignee</li>
                <li>If no rules match, the default approver is used</li>
                <li>Escalation occurs automatically after the configured timeout</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default RoutingRulesManager
