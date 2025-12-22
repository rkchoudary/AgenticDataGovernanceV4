/**
 * ThresholdConfigStep Component
 * 
 * Step 2 of Data Quality Rules phase - displays interactive histogram
 * with draggable threshold line and impact preview.
 * 
 * Requirements: 6.3
 */

import { useMemo } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Info,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import {
  DQRule,
  HistogramBin,
  DIMENSION_CONFIG,
  SEVERITY_CONFIG,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface ThresholdConfigStepProps {
  rules: DQRule[]
  selectedRuleId: string | null
  onSelectRule: (ruleId: string | null) => void
  onUpdateThreshold: (ruleId: string, newThreshold: number) => void
  onComplete: () => void
}

// ============================================================================
// Histogram Component
// ============================================================================

interface HistogramProps {
  data: HistogramBin[]
  threshold: number
  suggestedThreshold: number
  onThresholdChange: (value: number) => void
}

function Histogram({ data, threshold, suggestedThreshold, onThresholdChange }: HistogramProps) {
  const maxPercentage = Math.max(...data.map(d => d.percentage))
  
  // Calculate records failing based on threshold
  const recordsFailingPercentage = useMemo(() => {
    let failing = 0
    data.forEach(bin => {
      if (bin.binEnd < threshold) {
        failing += bin.percentage
      } else if (bin.binStart < threshold && bin.binEnd >= threshold) {
        // Partial bin
        const ratio = (threshold - bin.binStart) / (bin.binEnd - bin.binStart)
        failing += bin.percentage * ratio
      }
    })
    return failing
  }, [data, threshold])

  return (
    <div className="space-y-4">
      {/* Histogram Bars */}
      <div className="relative h-48 flex items-end gap-1 bg-muted/30 rounded-lg p-4">
        {data.map((bin, index) => {
          const height = (bin.percentage / maxPercentage) * 100
          const isBelowThreshold = bin.binEnd < threshold
          const isPartial = bin.binStart < threshold && bin.binEnd >= threshold
          
          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center"
            >
              <div
                className={`w-full rounded-t transition-colors ${
                  isBelowThreshold 
                    ? 'bg-red-400' 
                    : isPartial 
                      ? 'bg-gradient-to-t from-red-400 to-green-400'
                      : 'bg-green-400'
                }`}
                style={{ height: `${height}%` }}
                title={`${bin.binStart}-${bin.binEnd}%: ${bin.percentage.toFixed(1)}%`}
              />
              <div className="text-xs text-muted-foreground mt-1">
                {bin.binStart}
              </div>
            </div>
          )
        })}
        
        {/* Threshold Line */}
        <div
          className="absolute top-0 bottom-8 w-0.5 bg-primary z-10"
          style={{ 
            left: `calc(${((threshold - (data[0]?.binStart || 0)) / ((data[data.length - 1]?.binEnd || 100) - (data[0]?.binStart || 0))) * 100}% + 1rem)` 
          }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-1 rounded">
            {threshold}%
          </div>
        </div>
        
        {/* Suggested Threshold Marker */}
        {suggestedThreshold !== threshold && (
          <div
            className="absolute top-0 bottom-8 w-0.5 bg-purple-400 z-5 opacity-50"
            style={{ 
              left: `calc(${((suggestedThreshold - (data[0]?.binStart || 0)) / ((data[data.length - 1]?.binEnd || 100) - (data[0]?.binStart || 0))) * 100}% + 1rem)` 
            }}
          >
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-purple-600 text-xs">
              AI: {suggestedThreshold}%
            </div>
          </div>
        )}
      </div>
      
      {/* Threshold Slider */}
      <div className="px-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground">Threshold</span>
          <span className="font-medium">{threshold}%</span>
        </div>
        <Slider
          value={[threshold]}
          onValueChange={([value]) => onThresholdChange(value)}
          min={data[0]?.binStart || 0}
          max={data[data.length - 1]?.binEnd || 100}
          step={0.1}
          className="w-full"
        />
      </div>
      
      {/* Impact Preview */}
      <div className="bg-muted/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Records Failing</div>
            <div className="text-2xl font-bold text-red-600">
              {recordsFailingPercentage.toFixed(2)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Records Passing</div>
            <div className="text-2xl font-bold text-green-600">
              {(100 - recordsFailingPercentage).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Rule Selector Component
// ============================================================================

interface RuleSelectorProps {
  rules: DQRule[]
  selectedRuleId: string | null
  onSelectRule: (ruleId: string) => void
}

function RuleSelector({ rules, selectedRuleId, onSelectRule }: RuleSelectorProps) {
  return (
    <div className="space-y-2">
      {rules.map(rule => {
        const dimensionConfig = DIMENSION_CONFIG[rule.dimension]
        const isSelected = rule.id === selectedRuleId
        
        return (
          <button
            key={rule.id}
            onClick={() => onSelectRule(rule.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              isSelected 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge 
                    variant="outline" 
                    className="text-xs"
                    style={{ 
                      borderColor: dimensionConfig.color,
                      color: dimensionConfig.color,
                    }}
                  >
                    {dimensionConfig.label}
                  </Badge>
                </div>
                <div className="font-medium truncate">{rule.name}</div>
                <div className="text-sm text-muted-foreground truncate">
                  {rule.cdeName}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-medium">{rule.threshold.value}%</div>
                  <div className="text-xs text-muted-foreground">threshold</div>
                </div>
                <ChevronRight className={`h-4 w-4 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function ThresholdConfigStep({
  rules,
  selectedRuleId,
  onSelectRule,
  onUpdateThreshold,
  onComplete,
}: ThresholdConfigStepProps) {
  // Auto-select first rule if none selected
  const effectiveSelectedId = selectedRuleId || rules[0]?.id || null
  const selectedRule = rules.find(r => r.id === effectiveSelectedId)

  // Generate mock histogram data if not present
  const histogramData = useMemo(() => {
    if (selectedRule?.histogramData) {
      return selectedRule.histogramData
    }
    // Generate default histogram data
    return [
      { binStart: 90, binEnd: 92, count: 50, percentage: 5 },
      { binStart: 92, binEnd: 94, count: 100, percentage: 10 },
      { binStart: 94, binEnd: 96, count: 150, percentage: 15 },
      { binStart: 96, binEnd: 98, count: 300, percentage: 30 },
      { binStart: 98, binEnd: 100, count: 400, percentage: 40 },
    ]
  }, [selectedRule])

  const handleThresholdChange = (value: number) => {
    if (effectiveSelectedId) {
      onUpdateThreshold(effectiveSelectedId, value)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Threshold Configuration</h2>
        <p className="text-muted-foreground mt-1">
          Fine-tune thresholds for accepted rules. Drag the threshold line to see impact on failure rates.
        </p>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rule Selector */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rules ({rules.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <RuleSelector
                rules={rules}
                selectedRuleId={effectiveSelectedId}
                onSelectRule={onSelectRule}
              />
            </CardContent>
          </Card>
        </div>

        {/* Threshold Configuration */}
        <div className="lg:col-span-2">
          {selectedRule ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{selectedRule.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {selectedRule.cdeName} • {DIMENSION_CONFIG[selectedRule.dimension].label}
                    </p>
                  </div>
                  <Badge className={SEVERITY_CONFIG[selectedRule.severity].bgColor + ' ' + SEVERITY_CONFIG[selectedRule.severity].color}>
                    {SEVERITY_CONFIG[selectedRule.severity].label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Rule Description */}
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm font-medium mb-2">
                    <Info className="h-4 w-4" />
                    Rule Logic
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedRule.description}
                  </p>
                  <code className="block mt-2 text-xs bg-background px-2 py-1 rounded">
                    {selectedRule.logic.expression}
                  </code>
                </div>

                {/* Histogram */}
                <Histogram
                  data={histogramData}
                  threshold={selectedRule.threshold.value}
                  suggestedThreshold={selectedRule.threshold.suggestedValue}
                  onThresholdChange={handleThresholdChange}
                />

                {/* Threshold Comparison */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-sm text-muted-foreground">Current</div>
                    <div className="text-xl font-bold">{selectedRule.threshold.value}%</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <div className="text-sm text-purple-600">AI Suggested</div>
                    <div className="text-xl font-bold text-purple-700">
                      {selectedRule.threshold.suggestedValue}%
                    </div>
                  </div>
                  {selectedRule.threshold.historicalAverage && (
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-sm text-blue-600">Historical Avg</div>
                      <div className="text-xl font-bold text-blue-700">
                        {selectedRule.threshold.historicalAverage}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Impact Preview */}
                {selectedRule.impactPreview && (
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm font-medium mb-3">
                      <AlertTriangle className="h-4 w-4" />
                      Impact Preview
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground">Records Failing</div>
                        <div className="text-lg font-bold text-red-600">
                          {selectedRule.impactPreview.recordsFailing.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Total Records</div>
                        <div className="text-lg font-bold">
                          {selectedRule.impactPreview.totalRecords.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Failure Rate</div>
                        <div className="text-lg font-bold text-red-600">
                          {selectedRule.impactPreview.failurePercentage.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Trend</div>
                        <div className={`text-lg font-bold flex items-center gap-1 ${
                          selectedRule.impactPreview.trend === 'improving' ? 'text-green-600' :
                          selectedRule.impactPreview.trend === 'degrading' ? 'text-red-600' :
                          'text-gray-600'
                        }`}>
                          {selectedRule.impactPreview.trend === 'improving' && <TrendingDown className="h-4 w-4" />}
                          {selectedRule.impactPreview.trend === 'degrading' && <TrendingUp className="h-4 w-4" />}
                          {selectedRule.impactPreview.trend === 'stable' && <Minus className="h-4 w-4" />}
                          {selectedRule.impactPreview.trend.charAt(0).toUpperCase() + selectedRule.impactPreview.trend.slice(1)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a rule to configure its threshold
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Complete Step Button */}
      <div className="flex justify-end pt-4 border-t">
        <Button onClick={onComplete}>
          Continue to Coverage Validation
        </Button>
      </div>
    </div>
  )
}

export default ThresholdConfigStep
