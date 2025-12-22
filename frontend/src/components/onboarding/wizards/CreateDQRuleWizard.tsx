import { useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { StepWizard, type WizardStep } from '../StepWizard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CreateDQRuleWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (data: DQRuleWizardData) => void
  cdeId?: string
  cdeName?: string
}

interface DQRuleWizardData {
  name: string
  description: string
  dimension: string
  severity: string
  threshold: number
  logic: string
}

const dimensions = [
  { id: 'completeness', label: 'Completeness', description: 'Check for missing values' },
  { id: 'accuracy', label: 'Accuracy', description: 'Verify data correctness' },
  { id: 'validity', label: 'Validity', description: 'Validate against rules' },
  { id: 'consistency', label: 'Consistency', description: 'Check cross-field consistency' },
  { id: 'timeliness', label: 'Timeliness', description: 'Verify data freshness' },
  { id: 'uniqueness', label: 'Uniqueness', description: 'Detect duplicates' },
  { id: 'integrity', label: 'Integrity', description: 'Validate relationships' },
]

const severities = [
  { id: 'critical', label: 'Critical', color: 'text-red-500', description: 'Blocks submission' },
  { id: 'high', label: 'High', color: 'text-orange-500', description: 'Requires attention' },
  { id: 'medium', label: 'Medium', color: 'text-yellow-500', description: 'Should be reviewed' },
  { id: 'low', label: 'Low', color: 'text-blue-500', description: 'Informational' },
]

const ruleTemplates: Record<string, { name: string; logic: string }[]> = {
  completeness: [
    { name: 'Not Null Check', logic: 'value IS NOT NULL' },
    { name: 'Not Empty Check', logic: "value IS NOT NULL AND value != ''" },
  ],
  accuracy: [
    { name: 'Range Check', logic: 'value >= {min} AND value <= {max}' },
    { name: 'Pattern Match', logic: "value MATCHES '{pattern}'" },
  ],
  validity: [
    { name: 'Enum Check', logic: "value IN ('{value1}', '{value2}')" },
    { name: 'Format Check', logic: "value MATCHES '{regex}'" },
  ],
  consistency: [
    { name: 'Cross-Field Check', logic: 'field1 + field2 = field3' },
    { name: 'Reference Check', logic: 'value EXISTS IN reference_table' },
  ],
  timeliness: [
    { name: 'Age Check', logic: 'DATEDIFF(NOW(), updated_at) <= {days}' },
    { name: 'Freshness Check', logic: 'updated_at >= {date}' },
  ],
  uniqueness: [
    { name: 'Unique Check', logic: 'COUNT(DISTINCT value) = COUNT(value)' },
    { name: 'Primary Key Check', logic: 'value IS UNIQUE' },
  ],
  integrity: [
    { name: 'Foreign Key Check', logic: 'value EXISTS IN parent_table.id' },
    { name: 'Referential Check', logic: 'ALL references ARE VALID' },
  ],
}

export function CreateDQRuleWizard({
  open,
  onOpenChange,
  onComplete,
  cdeId: _cdeId,
  cdeName,
}: CreateDQRuleWizardProps) {
  const [formData, setFormData] = useState<Partial<DQRuleWizardData>>({
    threshold: 95,
  })

  const updateField = (field: keyof DQRuleWizardData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const applyTemplate = (template: { name: string; logic: string }) => {
    updateField('name', template.name)
    updateField('logic', template.logic)
  }

  const steps: WizardStep[] = [
    {
      id: 'dimension',
      title: 'Select Quality Dimension',
      description: 'Choose which aspect of data quality this rule will check',
      content: (
        <div className="grid grid-cols-1 gap-2">
          {dimensions.map((dim) => (
            <div
              key={dim.id}
              className={cn(
                'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                formData.dimension === dim.id
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-muted-foreground/50'
              )}
              onClick={() => updateField('dimension', dim.id)}
            >
              <div
                className={cn(
                  'h-5 w-5 rounded-full border flex items-center justify-center',
                  formData.dimension === dim.id
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/50'
                )}
              >
                {formData.dimension === dim.id && (
                  <CheckCircle2 className="h-4 w-4 text-primary-foreground" />
                )}
              </div>
              <div>
                <p className="font-medium text-sm">{dim.label}</p>
                <p className="text-xs text-muted-foreground">{dim.description}</p>
              </div>
            </div>
          ))}
        </div>
      ),
      validation: () => !!formData.dimension,
    },
    {
      id: 'rule-definition',
      title: 'Define Rule',
      description: 'Specify the rule name and validation logic',
      content: (
        <div className="space-y-4">
          {formData.dimension && ruleTemplates[formData.dimension] && (
            <div>
              <label className="text-sm font-medium">Quick Templates</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {ruleTemplates[formData.dimension].map((template) => (
                  <Button
                    key={template.name}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyTemplate(template)}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Rule Name *</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Account Balance Not Null"
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe what this rule validates..."
              rows={2}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Validation Logic *</label>
            <textarea
              value={formData.logic || ''}
              onChange={(e) => updateField('logic', e.target.value)}
              placeholder="e.g., value IS NOT NULL AND value > 0"
              rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use SQL-like syntax to define the validation condition
            </p>
          </div>
        </div>
      ),
      validation: () => !!(formData.name && formData.logic),
    },
    {
      id: 'threshold',
      title: 'Set Threshold & Severity',
      description: 'Configure the pass threshold and failure severity',
      content: (
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium">Pass Threshold</label>
            <div className="flex items-center gap-4 mt-2">
              <input
                type="range"
                min="0"
                max="100"
                value={formData.threshold || 95}
                onChange={(e) => updateField('threshold', parseInt(e.target.value))}
                className="flex-1"
              />
              <span className="text-lg font-semibold w-16 text-right">
                {formData.threshold || 95}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Minimum percentage of records that must pass this rule
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Severity *</label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {severities.map((sev) => (
                <div
                  key={sev.id}
                  className={cn(
                    'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                    formData.severity === sev.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-muted-foreground/50'
                  )}
                  onClick={() => updateField('severity', sev.id)}
                >
                  <AlertTriangle className={cn('h-5 w-5', sev.color)} />
                  <div>
                    <p className="font-medium text-sm">{sev.label}</p>
                    <p className="text-xs text-muted-foreground">{sev.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      validation: () => !!formData.severity,
    },
    {
      id: 'review',
      title: 'Review & Create',
      description: 'Review your rule configuration',
      content: (
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Rule Name</p>
            <p className="font-medium">{formData.name}</p>
          </div>
          {formData.description && (
            <div>
              <p className="text-xs text-muted-foreground">Description</p>
              <p className="text-sm">{formData.description}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Dimension</p>
              <p className="text-sm font-medium capitalize">{formData.dimension}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Severity</p>
              <p className="text-sm font-medium capitalize">{formData.severity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Threshold</p>
              <p className="text-sm font-medium">{formData.threshold}%</p>
            </div>
            {cdeName && (
              <div>
                <p className="text-xs text-muted-foreground">CDE</p>
                <p className="text-sm font-medium">{cdeName}</p>
              </div>
            )}
          </div>
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Validation Logic</p>
            <code className="text-sm bg-muted p-2 rounded block mt-1">
              {formData.logic}
            </code>
          </div>
        </div>
      ),
    },
  ]

  const handleComplete = () => {
    onComplete(formData as DQRuleWizardData)
    setFormData({ threshold: 95 })
  }

  return (
    <StepWizard
      title="Create Data Quality Rule"
      description={cdeName ? `Creating rule for: ${cdeName}` : 'Define a new data quality validation rule'}
      steps={steps}
      open={open}
      onOpenChange={onOpenChange}
      onComplete={handleComplete}
    />
  )
}
