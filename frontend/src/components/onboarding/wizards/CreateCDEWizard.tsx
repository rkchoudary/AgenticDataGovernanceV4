import { useState } from 'react'
import { Database, CheckCircle2 } from 'lucide-react'
import { StepWizard, type WizardStep } from '../StepWizard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CreateCDEWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (data: CDEWizardData) => void
}

interface CDEWizardData {
  name: string
  description: string
  dataType: string
  sourceSystem: string
  owner: string
  qualityDimensions: string[]
}

const dataTypes = [
  { id: 'string', label: 'Text/String' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'boolean', label: 'Boolean' },
  { id: 'currency', label: 'Currency' },
  { id: 'percentage', label: 'Percentage' },
]

const qualityDimensions = [
  { id: 'completeness', label: 'Completeness', description: 'Data is not missing' },
  { id: 'accuracy', label: 'Accuracy', description: 'Data reflects reality' },
  { id: 'validity', label: 'Validity', description: 'Data conforms to rules' },
  { id: 'consistency', label: 'Consistency', description: 'Data is uniform' },
  { id: 'timeliness', label: 'Timeliness', description: 'Data is current' },
  { id: 'uniqueness', label: 'Uniqueness', description: 'No duplicates' },
  { id: 'integrity', label: 'Integrity', description: 'Relationships are valid' },
]

export function CreateCDEWizard({ open, onOpenChange, onComplete }: CreateCDEWizardProps) {
  const [formData, setFormData] = useState<Partial<CDEWizardData>>({
    qualityDimensions: [],
  })

  const updateField = (field: keyof CDEWizardData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const toggleDimension = (dimensionId: string) => {
    const current = formData.qualityDimensions || []
    const updated = current.includes(dimensionId)
      ? current.filter(d => d !== dimensionId)
      : [...current, dimensionId]
    updateField('qualityDimensions', updated)
  }

  const steps: WizardStep[] = [
    {
      id: 'basic-info',
      title: 'Basic Information',
      description: 'Enter the basic details for your Critical Data Element',
      content: (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">CDE Name *</label>
            <input
              type="text"
              value={formData.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g., Customer Account Balance"
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Description *</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Describe what this data element represents..."
              rows={3}
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Data Type *</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {dataTypes.map((type) => (
                <Button
                  key={type.id}
                  type="button"
                  variant={formData.dataType === type.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => updateField('dataType', type.id)}
                >
                  {type.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      ),
      validation: () => {
        return !!(formData.name && formData.description && formData.dataType)
      },
    },
    {
      id: 'source',
      title: 'Data Source',
      description: 'Specify where this data comes from',
      content: (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Source System *</label>
            <input
              type="text"
              value={formData.sourceSystem || ''}
              onChange={(e) => updateField('sourceSystem', e.target.value)}
              placeholder="e.g., Core Banking System"
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The system or database where this data originates
            </p>
          </div>
        </div>
      ),
      validation: () => !!formData.sourceSystem,
    },
    {
      id: 'ownership',
      title: 'Data Ownership',
      description: 'Assign responsibility for this data element',
      content: (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Data Owner *</label>
            <input
              type="text"
              value={formData.owner || ''}
              onChange={(e) => updateField('owner', e.target.value)}
              placeholder="e.g., john.smith@company.com"
              className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The person responsible for the quality and accuracy of this data
            </p>
          </div>
        </div>
      ),
      validation: () => !!formData.owner,
    },
    {
      id: 'quality',
      title: 'Quality Dimensions',
      description: 'Select which quality dimensions to monitor',
      content: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Select the quality dimensions that are important for this CDE:
          </p>
          <div className="grid grid-cols-1 gap-2">
            {qualityDimensions.map((dim) => (
              <div
                key={dim.id}
                className={cn(
                  'flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors',
                  formData.qualityDimensions?.includes(dim.id)
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-muted-foreground/50'
                )}
                onClick={() => toggleDimension(dim.id)}
              >
                <div
                  className={cn(
                    'h-5 w-5 rounded border flex items-center justify-center',
                    formData.qualityDimensions?.includes(dim.id)
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/50'
                  )}
                >
                  {formData.qualityDimensions?.includes(dim.id) && (
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
        </div>
      ),
      validation: () => (formData.qualityDimensions?.length || 0) > 0,
    },
    {
      id: 'review',
      title: 'Review & Create',
      description: 'Review your CDE configuration before creating',
      content: (
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">{formData.name}</p>
                <p className="text-sm text-muted-foreground">{formData.description}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Data Type</p>
                <p className="text-sm font-medium capitalize">{formData.dataType}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source System</p>
                <p className="text-sm font-medium">{formData.sourceSystem}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Owner</p>
                <p className="text-sm font-medium">{formData.owner}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quality Dimensions</p>
                <p className="text-sm font-medium">
                  {formData.qualityDimensions?.length || 0} selected
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ]

  const handleComplete = () => {
    onComplete(formData as CDEWizardData)
    setFormData({ qualityDimensions: [] })
  }

  return (
    <StepWizard
      title="Create Critical Data Element"
      description="Follow these steps to define a new CDE with quality rules"
      steps={steps}
      open={open}
      onOpenChange={onOpenChange}
      onComplete={handleComplete}
    />
  )
}
