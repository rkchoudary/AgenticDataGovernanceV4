/**
 * CoverageValidationStep Component
 * 
 * Step 3 of Data Quality Rules phase - displays CDEs vs dimensions
 * coverage matrix (heatmap) with gaps highlighted in red.
 * 
 * Requirements: 6.4
 */

import { useState, useMemo, useEffect } from 'react'
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Info,
  Filter,
  Sparkles,
  Edit,
  Plus,
  Loader2,
  Save,
  X,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  CDEWithRules,
  CoverageSummary,
  DQDimension,
  DQRule,
  RuleSeverity,
  ALL_DIMENSIONS,
  DIMENSION_CONFIG,
  SEVERITY_CONFIG,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface CoverageValidationStepProps {
  cdesWithRules: CDEWithRules[]
  coverageSummary: CoverageSummary
  onComplete: () => void
  onAddRule?: (cdeId: string, dimension: DQDimension, rule: Partial<DQRule>) => void
  onUpdateRule?: (ruleId: string, updates: Partial<DQRule>) => void
}

// ============================================================================
// AI Rule Suggestion Generator (Mock)
// ============================================================================

function generateAISuggestedRule(cdeName: string, cdeId: string, dimension: DQDimension): Partial<DQRule> {
  const ruleTemplates: Record<DQDimension, { name: string; description: string; expression: string; rationale: string }> = {
    completeness: {
      name: `${cdeName} - Completeness Check`,
      description: `Validates that ${cdeName} is not null or empty`,
      expression: `${cdeName.toLowerCase().replace(/\s+/g, '_')} IS NOT NULL AND ${cdeName.toLowerCase().replace(/\s+/g, '_')} != ''`,
      rationale: `This rule ensures data completeness by checking that ${cdeName} always has a value. Missing values in this field could impact downstream calculations and regulatory reporting accuracy.`,
    },
    accuracy: {
      name: `${cdeName} - Accuracy Validation`,
      description: `Validates that ${cdeName} falls within expected business ranges`,
      expression: `${cdeName.toLowerCase().replace(/\s+/g, '_')} BETWEEN expected_min AND expected_max`,
      rationale: `This rule validates data accuracy by ensuring ${cdeName} values are within acceptable business ranges. Out-of-range values may indicate data entry errors or system issues.`,
    },
    validity: {
      name: `${cdeName} - Format Validation`,
      description: `Validates that ${cdeName} conforms to expected format and business rules`,
      expression: `REGEXP_LIKE(${cdeName.toLowerCase().replace(/\s+/g, '_')}, '^[A-Za-z0-9]+$')`,
      rationale: `This rule ensures data validity by checking that ${cdeName} matches the expected format. Invalid formats can cause processing errors and compliance issues.`,
    },
    consistency: {
      name: `${cdeName} - Cross-System Consistency`,
      description: `Validates that ${cdeName} is consistent across related systems`,
      expression: `source_system.${cdeName.toLowerCase().replace(/\s+/g, '_')} = target_system.${cdeName.toLowerCase().replace(/\s+/g, '_')}`,
      rationale: `This rule ensures data consistency by comparing ${cdeName} values across systems. Inconsistencies may indicate synchronization issues or data quality problems.`,
    },
    timeliness: {
      name: `${cdeName} - Timeliness Check`,
      description: `Validates that ${cdeName} is updated within expected timeframes`,
      expression: `DATEDIFF(CURRENT_DATE, last_updated) <= max_staleness_days`,
      rationale: `This rule ensures data timeliness by checking that ${cdeName} is refreshed within acceptable timeframes. Stale data can lead to incorrect decisions and reporting.`,
    },
    uniqueness: {
      name: `${cdeName} - Uniqueness Validation`,
      description: `Validates that ${cdeName} has no duplicate values where uniqueness is required`,
      expression: `COUNT(DISTINCT ${cdeName.toLowerCase().replace(/\s+/g, '_')}) = COUNT(${cdeName.toLowerCase().replace(/\s+/g, '_')})`,
      rationale: `This rule ensures data uniqueness by detecting duplicate ${cdeName} values. Duplicates can cause incorrect aggregations and reporting errors.`,
    },
    integrity: {
      name: `${cdeName} - Referential Integrity`,
      description: `Validates that ${cdeName} references exist in related tables`,
      expression: `${cdeName.toLowerCase().replace(/\s+/g, '_')} IN (SELECT id FROM reference_table)`,
      rationale: `This rule ensures referential integrity by validating that ${cdeName} references valid entries in related tables. Orphaned references can cause data quality issues.`,
    },
  }

  const template = ruleTemplates[dimension]
  
  return {
    cdeId,
    cdeName,
    dimension,
    name: template.name,
    description: template.description,
    logic: {
      type: dimension === 'completeness' ? 'null_check' : 
            dimension === 'accuracy' ? 'range_check' :
            dimension === 'validity' ? 'format_check' :
            dimension === 'integrity' ? 'referential_check' : 'custom',
      expression: template.expression,
      description: template.description,
    },
    threshold: {
      type: 'percentage',
      value: 95,
      suggestedValue: 95,
    },
    severity: 'medium' as RuleSeverity,
    isAIGenerated: true,
    aiConfidence: 0.85,
    aiRationale: template.rationale,
    enabled: true,
  }
}

// ============================================================================
// Rule Edit Dialog Component
// ============================================================================

interface RuleEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule: DQRule | null
  onSave: (updates: Partial<DQRule>) => void
}

function RuleEditDialog({ open, onOpenChange, rule, onSave }: RuleEditDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [expression, setExpression] = useState('')
  const [threshold, setThreshold] = useState(95)
  const [severity, setSeverity] = useState<RuleSeverity>('medium')

  // Reset form when rule changes - use useEffect to properly sync with prop changes
  useEffect(() => {
    if (rule) {
      setName(rule.name || '')
      setDescription(rule.description || '')
      setExpression(rule.logic?.expression || '')
      setThreshold(rule.threshold?.value || 95)
      setSeverity(rule.severity || 'medium')
    }
  }, [rule])

  const handleSave = () => {
    if (!rule) return
    
    onSave({
      name,
      description,
      logic: {
        type: rule.logic.type,
        expression,
        description,
        parameters: rule.logic.parameters,
      },
      threshold: {
        type: rule.threshold.type,
        value: threshold,
        suggestedValue: rule.threshold.suggestedValue,
        minValue: rule.threshold.minValue,
        maxValue: rule.threshold.maxValue,
        historicalAverage: rule.threshold.historicalAverage,
      },
      severity,
    })
    onOpenChange(false)
  }

  if (!rule) return null

  // Use dimension config for display
  const dimConfig = DIMENSION_CONFIG[rule.dimension]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Edit Rule
          </DialogTitle>
          <DialogDescription>
            Modify the data quality rule for {rule.cdeName} - {dimConfig.label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge style={{ backgroundColor: dimConfig.color + '20', color: dimConfig.color }}>
              {dimConfig.label}
            </Badge>
            <Badge variant="outline">{rule.cdeName}</Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-name">Rule Name</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter rule name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-description">Description</Label>
            <Textarea
              id="rule-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this rule validates"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule-expression">Rule Expression</Label>
            <Textarea
              id="rule-expression"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder="SQL-like expression"
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rule-threshold">Threshold (%)</Label>
              <Input
                id="rule-threshold"
                type="number"
                min={0}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rule-severity">Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as RuleSeverity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <span className={config.color}>{config.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// AI Suggestion Dialog Component
// ============================================================================

interface AISuggestionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cdeName: string
  cdeId: string
  dimension: DQDimension
  onAccept: (rule: Partial<DQRule>) => void
}

function AISuggestionDialog({ 
  open, 
  onOpenChange, 
  cdeName, 
  cdeId, 
  dimension, 
  onAccept 
}: AISuggestionDialogProps) {
  const [isGenerating, setIsGenerating] = useState(true)
  const [suggestedRule, setSuggestedRule] = useState<Partial<DQRule> | null>(null)
  const [editedRule, setEditedRule] = useState<Partial<DQRule> | null>(null)

  // Simulate AI generation when dialog opens
  useState(() => {
    if (open) {
      setIsGenerating(true)
      setSuggestedRule(null)
      setEditedRule(null)
      
      // Simulate AI delay
      setTimeout(() => {
        const rule = generateAISuggestedRule(cdeName, cdeId, dimension)
        setSuggestedRule(rule)
        setEditedRule(rule)
        setIsGenerating(false)
      }, 1500)
    }
  })

  // Reset when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setIsGenerating(true)
      setSuggestedRule(null)
      setEditedRule(null)
      
      setTimeout(() => {
        const rule = generateAISuggestedRule(cdeName, cdeId, dimension)
        setSuggestedRule(rule)
        setEditedRule(rule)
        setIsGenerating(false)
      }, 1500)
    }
    onOpenChange(newOpen)
  }

  const handleAccept = () => {
    if (editedRule) {
      onAccept(editedRule)
      onOpenChange(false)
    }
  }

  const dimensionConfig = DIMENSION_CONFIG[dimension]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            AI-Suggested Rule
            <Badge variant="outline" className="ml-2 text-blue-600 border-blue-200 bg-blue-50">
              AI Generated
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Create a data quality rule for {cdeName} - {dimensionConfig.label}
          </DialogDescription>
        </DialogHeader>

        {isGenerating ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
            <p className="text-sm text-muted-foreground">Generating AI suggestion...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzing {cdeName} for {dimensionConfig.label.toLowerCase()} rules
            </p>
          </div>
        ) : editedRule ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge style={{ backgroundColor: dimensionConfig.color + '20', color: dimensionConfig.color }}>
                {dimensionConfig.label}
              </Badge>
              <Badge variant="outline">{cdeName}</Badge>
              {suggestedRule?.aiConfidence && (
                <Badge variant="secondary" className="ml-auto">
                  {Math.round(suggestedRule.aiConfidence * 100)}% confidence
                </Badge>
              )}
            </div>

            {/* AI Rationale */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-800">AI Rationale</p>
                  <p className="text-sm text-blue-700 mt-1">{suggestedRule?.aiRationale}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-rule-name">Rule Name</Label>
              <Input
                id="ai-rule-name"
                value={editedRule.name || ''}
                onChange={(e) => setEditedRule({ ...editedRule, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-rule-description">Description</Label>
              <Textarea
                id="ai-rule-description"
                value={editedRule.description || ''}
                onChange={(e) => setEditedRule({ ...editedRule, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-rule-expression">Rule Expression</Label>
              <Textarea
                id="ai-rule-expression"
                value={editedRule.logic?.expression || ''}
                onChange={(e) => setEditedRule({ 
                  ...editedRule, 
                  logic: { ...editedRule.logic!, expression: e.target.value } 
                })}
                rows={2}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-rule-threshold">Threshold (%)</Label>
                <Input
                  id="ai-rule-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={editedRule.threshold?.value || 95}
                  onChange={(e) => setEditedRule({ 
                    ...editedRule, 
                    threshold: { ...editedRule.threshold!, value: Number(e.target.value) } 
                  })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-rule-severity">Severity</Label>
                <Select 
                  value={editedRule.severity || 'medium'} 
                  onValueChange={(v) => setEditedRule({ ...editedRule, severity: v as RuleSeverity })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <span className={config.color}>{config.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleAccept} disabled={isGenerating || !editedRule}>
            <Plus className="h-4 w-4 mr-2" />
            Add Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Coverage Cell Component
// ============================================================================

interface CoverageCellProps {
  cde: CDEWithRules
  dimension: DQDimension
  hasRule: boolean
  rule?: DQRule
  onCellClick: (cde: CDEWithRules, dimension: DQDimension, hasRule: boolean, rule?: DQRule) => void
}

function CoverageCell({ cde, dimension, hasRule, rule, onCellClick }: CoverageCellProps) {
  const dimensionConfig = DIMENSION_CONFIG[dimension]
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onCellClick(cde, dimension, hasRule, rule)}
            className={`w-full h-10 rounded transition-all flex items-center justify-center cursor-pointer ${
              hasRule 
                ? 'bg-green-100 hover:bg-green-200 hover:ring-2 hover:ring-green-400 text-green-700' 
                : 'bg-red-100 hover:bg-red-200 hover:ring-2 hover:ring-red-400 text-red-700'
            }`}
          >
            {hasRule ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <div className="font-medium">{cde.name}</div>
            <div className="text-muted-foreground">
              {dimensionConfig.label}: {hasRule ? 'Covered' : 'Gap - Click to add rule'}
            </div>
            {hasRule && rule && (
              <div className="text-xs text-muted-foreground mt-1">
                Click to view/edit rule
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// ============================================================================
// Coverage Heatmap Component
// ============================================================================

interface CoverageHeatmapProps {
  cdesWithRules: CDEWithRules[]
  showGapsOnly: boolean
  onCellClick: (cde: CDEWithRules, dimension: DQDimension, hasRule: boolean, rule?: DQRule) => void
}

function CoverageHeatmap({ cdesWithRules, showGapsOnly, onCellClick }: CoverageHeatmapProps) {
  // Filter CDEs if showing gaps only
  const filteredCDEs = useMemo(() => {
    if (!showGapsOnly) return cdesWithRules
    return cdesWithRules.filter(cde => 
      ALL_DIMENSIONS.some(d => !cde.coverageByDimension[d])
    )
  }, [cdesWithRules, showGapsOnly])

  // Helper to find rule for a CDE and dimension
  const findRule = (cde: CDEWithRules, dimension: DQDimension): DQRule | undefined => {
    return cde.rules.find(r => r.dimension === dimension)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 border-b font-medium text-sm sticky left-0 bg-background z-10 min-w-[200px]">
              CDE
            </th>
            {ALL_DIMENSIONS.map(dimension => {
              const config = DIMENSION_CONFIG[dimension]
              return (
                <th 
                  key={dimension} 
                  className="p-2 border-b text-center min-w-[80px]"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="text-xs font-medium cursor-help"
                          style={{ color: config.color }}
                        >
                          {config.label.slice(0, 4)}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-sm">
                          <div className="font-medium">{config.label}</div>
                          <div className="text-muted-foreground max-w-[200px]">
                            {config.description}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </th>
              )
            })}
            <th className="p-2 border-b text-center min-w-[80px]">
              <div className="text-xs font-medium text-muted-foreground">
                Coverage
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredCDEs.map(cde => (
            <tr key={cde.id} className="hover:bg-muted/50">
              <td className="p-2 border-b sticky left-0 bg-background z-10">
                <div className="font-medium text-sm truncate max-w-[200px]" title={cde.name}>
                  {cde.name}
                </div>
                <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={cde.sourceSystem}>
                  {cde.sourceSystem}
                </div>
              </td>
              {ALL_DIMENSIONS.map(dimension => {
                const hasRule = cde.coverageByDimension[dimension]
                const rule = findRule(cde, dimension)
                return (
                  <td key={dimension} className="p-1 border-b">
                    <CoverageCell
                      cde={cde}
                      dimension={dimension}
                      hasRule={hasRule}
                      rule={rule}
                      onCellClick={onCellClick}
                    />
                  </td>
                )
              })}
              <td className="p-2 border-b text-center">
                <Badge 
                  variant="outline"
                  className={
                    cde.overallCoverage >= 70 
                      ? 'text-green-700 border-green-300 bg-green-50' 
                      : cde.overallCoverage >= 40 
                        ? 'text-amber-700 border-amber-300 bg-amber-50'
                        : 'text-red-700 border-red-300 bg-red-50'
                  }
                >
                  {cde.overallCoverage}%
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {filteredCDEs.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          {showGapsOnly ? 'No coverage gaps found!' : 'No CDEs to display'}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Gap Summary Component
// ============================================================================

interface GapSummaryProps {
  coverageSummary: CoverageSummary
}

function GapSummary({ coverageSummary }: GapSummaryProps) {
  // Sort dimensions by gap count
  const sortedDimensions = useMemo(() => {
    return ALL_DIMENSIONS
      .map(d => ({ dimension: d, gaps: coverageSummary.gapsByDimension[d] }))
      .sort((a, b) => b.gaps - a.gaps)
  }, [coverageSummary])

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Gaps by Dimension</div>
      <div className="space-y-2">
        {sortedDimensions.map(({ dimension, gaps }) => {
          const config = DIMENSION_CONFIG[dimension]
          const percentage = coverageSummary.totalCDEs > 0 
            ? (gaps / coverageSummary.totalCDEs) * 100 
            : 0
          
          return (
            <div key={dimension} className="flex items-center gap-2">
              <div 
                className="w-24 text-xs font-medium truncate"
                style={{ color: config.color }}
              >
                {config.label}
              </div>
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-400 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="w-12 text-xs text-right text-muted-foreground">
                {gaps} gaps
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function CoverageValidationStep({
  cdesWithRules,
  coverageSummary,
  onComplete,
  onAddRule,
  onUpdateRule,
}: CoverageValidationStepProps) {
  const [showGapsOnly, setShowGapsOnly] = useState(false)
  
  // Dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [selectedRule, setSelectedRule] = useState<DQRule | null>(null)
  const [selectedCde, setSelectedCde] = useState<CDEWithRules | null>(null)
  const [selectedDimension, setSelectedDimension] = useState<DQDimension | null>(null)

  // Handle cell click
  const handleCellClick = (
    cde: CDEWithRules, 
    dimension: DQDimension, 
    hasRule: boolean, 
    rule?: DQRule
  ) => {
    setSelectedCde(cde)
    setSelectedDimension(dimension)
    
    if (hasRule && rule) {
      // Open edit dialog for existing rule
      setSelectedRule(rule)
      setEditDialogOpen(true)
    } else {
      // Open AI suggestion dialog for gap
      setAiDialogOpen(true)
    }
  }

  // Handle rule update
  const handleRuleUpdate = (updates: Partial<DQRule>) => {
    if (selectedRule && onUpdateRule) {
      onUpdateRule(selectedRule.id, updates)
    }
    setEditDialogOpen(false)
    setSelectedRule(null)
  }

  // Handle new rule from AI suggestion
  const handleAddRule = (rule: Partial<DQRule>) => {
    if (selectedCde && selectedDimension && onAddRule) {
      onAddRule(selectedCde.id, selectedDimension, rule)
    }
    setAiDialogOpen(false)
    setSelectedCde(null)
    setSelectedDimension(null)
  }

  // Determine if coverage is acceptable (e.g., > 50%)
  const isCoverageAcceptable = coverageSummary.coveragePercentage >= 50

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Coverage Validation</h2>
        <p className="text-muted-foreground mt-1">
          Review the coverage matrix to identify gaps in data quality rule coverage across CDEs and dimensions.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{coverageSummary.totalCDEs}</div>
            <div className="text-sm text-muted-foreground">Total CDEs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{coverageSummary.totalDimensions}</div>
            <div className="text-sm text-muted-foreground">Dimensions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold ${
              coverageSummary.coveragePercentage >= 70 ? 'text-green-600' :
              coverageSummary.coveragePercentage >= 40 ? 'text-amber-600' :
              'text-red-600'
            }`}>
              {coverageSummary.coveragePercentage}%
            </div>
            <div className="text-sm text-muted-foreground">Coverage</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{coverageSummary.gapCount}</div>
            <div className="text-sm text-muted-foreground">Gaps</div>
          </CardContent>
        </Card>
      </div>

      {/* Coverage Warning */}
      {!isCoverageAcceptable && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-amber-800">Low Coverage Warning</div>
            <p className="text-sm text-amber-700 mt-1">
              Current coverage is below 50%. Consider adding rules for uncovered dimensions 
              to ensure comprehensive data quality monitoring.
            </p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Gap Summary Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Gap Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <GapSummary coverageSummary={coverageSummary} />
            </CardContent>
          </Card>
        </div>

        {/* Coverage Heatmap */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Coverage Matrix</CardTitle>
                <Button
                  variant={showGapsOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setShowGapsOnly(!showGapsOnly)}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  {showGapsOnly ? 'Show All' : 'Show Gaps Only'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <CoverageHeatmap 
                cdesWithRules={cdesWithRules} 
                showGapsOnly={showGapsOnly}
                onCellClick={handleCellClick}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Legend:</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-green-100 rounded flex items-center justify-center">
                <CheckCircle className="h-3 w-3 text-green-700" />
              </div>
              <span>Covered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-red-100 rounded flex items-center justify-center">
                <XCircle className="h-3 w-3 text-red-700" />
              </div>
              <span>Gap (No Rule)</span>
            </div>
            <div className="flex items-center gap-2 ml-4 text-muted-foreground">
              <span>Click any cell to view/edit or add a rule</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete}>
          Continue to Rule Activation
        </Button>
      </div>

      {/* Edit Rule Dialog */}
      <RuleEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        rule={selectedRule}
        onSave={handleRuleUpdate}
      />

      {/* AI Suggestion Dialog */}
      {selectedCde && selectedDimension && (
        <AISuggestionDialog
          open={aiDialogOpen}
          onOpenChange={setAiDialogOpen}
          cdeName={selectedCde.name}
          cdeId={selectedCde.id}
          dimension={selectedDimension}
          onAccept={handleAddRule}
        />
      )}
    </div>
  )
}

export default CoverageValidationStep
