import { useState } from 'react'
import {
  Shield,
  Save,
  Play,
  AlertCircle,
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
import { cn } from '@/lib/utils'

export type DQDimension =
  | 'completeness'
  | 'accuracy'
  | 'validity'
  | 'consistency'
  | 'timeliness'
  | 'uniqueness'
  | 'integrity'

export interface DQRuleConfig {
  id?: string
  name: string
  description: string
  cdeId: string
  dimension: DQDimension
  threshold: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  logic: {
    type: 'sql' | 'expression' | 'regex'
    expression: string
  }
  enabled: boolean
}

interface DQRuleBuilderProps {
  cdeId: string
  cdeName: string
  initialRule?: Partial<DQRuleConfig>
  onSave: (rule: DQRuleConfig) => void
  onCancel: () => void
  onTest?: (rule: DQRuleConfig) => void
}

const dimensions: { value: DQDimension; label: string; description: string }[] = [
  { value: 'completeness', label: 'Completeness', description: 'Checks for missing or null values' },
  { value: 'accuracy', label: 'Accuracy', description: 'Validates data correctness against source' },
  { value: 'validity', label: 'Validity', description: 'Ensures data conforms to defined formats' },
  { value: 'consistency', label: 'Consistency', description: 'Checks data consistency across systems' },
  { value: 'timeliness', label: 'Timeliness', description: 'Validates data freshness and currency' },
  { value: 'uniqueness', label: 'Uniqueness', description: 'Ensures no duplicate records exist' },
  { value: 'integrity', label: 'Integrity', description: 'Validates referential integrity' },
]

const severities = [
  { value: 'critical', label: 'Critical', color: 'text-red-600' },
  { value: 'high', label: 'High', color: 'text-orange-600' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'low', label: 'Low', color: 'text-blue-600' },
]


const expressionTemplates: Record<DQDimension, string> = {
  completeness: 'COUNT(CASE WHEN {field} IS NOT NULL THEN 1 END) * 100.0 / COUNT(*)',
  accuracy: 'COUNT(CASE WHEN {field} = {expected_value} THEN 1 END) * 100.0 / COUNT(*)',
  validity: 'COUNT(CASE WHEN {field} REGEXP \'{pattern}\' THEN 1 END) * 100.0 / COUNT(*)',
  consistency: 'COUNT(CASE WHEN a.{field} = b.{field} THEN 1 END) * 100.0 / COUNT(*)',
  timeliness: 'COUNT(CASE WHEN {timestamp_field} >= DATE_SUB(NOW(), INTERVAL {days} DAY) THEN 1 END) * 100.0 / COUNT(*)',
  uniqueness: '(COUNT(DISTINCT {field}) * 100.0 / COUNT(*))',
  integrity: 'COUNT(CASE WHEN {field} IN (SELECT {ref_field} FROM {ref_table}) THEN 1 END) * 100.0 / COUNT(*)',
}

export function DQRuleBuilder({
  cdeId,
  cdeName,
  initialRule,
  onSave,
  onCancel,
  onTest,
}: DQRuleBuilderProps) {
  const [rule, setRule] = useState<DQRuleConfig>({
    name: initialRule?.name || '',
    description: initialRule?.description || '',
    cdeId,
    dimension: initialRule?.dimension || 'completeness',
    threshold: initialRule?.threshold ?? 95,
    severity: initialRule?.severity || 'medium',
    logic: initialRule?.logic || { type: 'sql', expression: '' },
    enabled: initialRule?.enabled ?? true,
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isTesting, setIsTesting] = useState(false)

  const handleDimensionChange = (dimension: DQDimension) => {
    setRule({
      ...rule,
      dimension,
      logic: {
        ...rule.logic,
        expression: expressionTemplates[dimension],
      },
    })
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!rule.name.trim()) {
      newErrors.name = 'Rule name is required'
    }
    if (!rule.logic.expression.trim()) {
      newErrors.expression = 'Expression is required'
    }
    if (rule.threshold < 0 || rule.threshold > 100) {
      newErrors.threshold = 'Threshold must be between 0 and 100'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSave = () => {
    if (validate()) {
      onSave(rule)
    }
  }

  const handleTest = async () => {
    if (!validate()) return
    setIsTesting(true)
    try {
      onTest?.(rule)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {initialRule?.id ? 'Edit Data Quality Rule' : 'Create Data Quality Rule'}
        </CardTitle>
        <CardDescription>
          Define a validation rule for CDE: {cdeName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Info */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Rule Name</label>
            <input
              type="text"
              className={cn(
                'w-full px-3 py-2 border rounded-md bg-background',
                errors.name && 'border-red-500'
              )}
              placeholder="e.g., Balance Completeness Check"
              value={rule.name}
              onChange={(e) => setRule({ ...rule, name: e.target.value })}
            />
            {errors.name && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Severity</label>
            <Select
              value={rule.severity}
              onValueChange={(value: any) => setRule({ ...rule, severity: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severities.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    <span className={s.color}>{s.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <textarea
            className="w-full px-3 py-2 border rounded-md bg-background min-h-[80px]"
            placeholder="Describe what this rule validates..."
            value={rule.description}
            onChange={(e) => setRule({ ...rule, description: e.target.value })}
          />
        </div>


        {/* Dimension Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Quality Dimension</label>
          <div className="grid gap-2 md:grid-cols-4">
            {dimensions.map((dim) => (
              <button
                key={dim.value}
                type="button"
                onClick={() => handleDimensionChange(dim.value)}
                className={cn(
                  'p-3 border rounded-lg text-left transition-colors',
                  rule.dimension === dim.value
                    ? 'border-primary bg-primary/5'
                    : 'hover:bg-muted/50'
                )}
              >
                <p className="font-medium text-sm">{dim.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{dim.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Threshold Configuration */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Threshold (%)</label>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={rule.threshold}
              onChange={(e) => setRule({ ...rule, threshold: parseInt(e.target.value) })}
              className="flex-1"
            />
            <input
              type="number"
              min="0"
              max="100"
              value={rule.threshold}
              onChange={(e) => setRule({ ...rule, threshold: parseInt(e.target.value) || 0 })}
              className={cn(
                'w-20 px-3 py-2 border rounded-md bg-background text-center',
                errors.threshold && 'border-red-500'
              )}
            />
          </div>
          {errors.threshold && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.threshold}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Rule will fail if result is below {rule.threshold}%
          </p>
        </div>

        {/* Expression Editor */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Rule Expression</label>
            <Select
              value={rule.logic.type}
              onValueChange={(value: any) =>
                setRule({ ...rule, logic: { ...rule.logic, type: value } })
              }
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sql">SQL</SelectItem>
                <SelectItem value="expression">Expression</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="relative">
            <textarea
              className={cn(
                'w-full px-3 py-2 border rounded-md bg-background font-mono text-sm min-h-[120px]',
                errors.expression && 'border-red-500'
              )}
              placeholder={`Enter ${rule.logic.type.toUpperCase()} expression...`}
              value={rule.logic.expression}
              onChange={(e) =>
                setRule({ ...rule, logic: { ...rule.logic, expression: e.target.value } })
              }
            />
          </div>
          {errors.expression && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {errors.expression}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Use {'{'} field {'}'} placeholders for dynamic field references
          </p>
        </div>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="enabled"
            checked={rule.enabled}
            onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
            className="rounded border-gray-300"
          />
          <label htmlFor="enabled" className="text-sm">
            Enable this rule immediately after saving
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {onTest && (
            <Button variant="outline" onClick={handleTest} disabled={isTesting}>
              <Play className="h-4 w-4 mr-2" />
              {isTesting ? 'Testing...' : 'Test Rule'}
            </Button>
          )}
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Rule
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default DQRuleBuilder
