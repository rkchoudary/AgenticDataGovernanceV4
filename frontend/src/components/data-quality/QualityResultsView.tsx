import { useState } from 'react'
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Download,
  ChevronDown,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface RuleExecutionResult {
  ruleId: string
  ruleName: string
  dimension: string
  threshold: number
  actualValue: number
  passed: boolean
  executedAt: string
  totalRecords: number
  failedRecords: number
  failedSamples?: FailedRecord[]
  trend?: 'up' | 'down' | 'stable'
  previousValue?: number
}

export interface FailedRecord {
  id: string
  values: Record<string, any>
  reason: string
}

interface QualityResultsViewProps {
  results: RuleExecutionResult[]
  cdeName?: string
  onRefresh?: () => void
  onExport?: () => void
  isLoading?: boolean
}

export function QualityResultsView({
  results,
  cdeName,
  onRefresh,
  onExport,
  isLoading,
}: QualityResultsViewProps) {
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())

  const toggleExpanded = (ruleId: string) => {
    const newExpanded = new Set(expandedRules)
    if (newExpanded.has(ruleId)) {
      newExpanded.delete(ruleId)
    } else {
      newExpanded.add(ruleId)
    }
    setExpandedRules(newExpanded)
  }

  const passedCount = results.filter((r) => r.passed).length
  const failedCount = results.filter((r) => !r.passed).length
  const overallScore = results.length > 0
    ? Math.round((passedCount / results.length) * 100)
    : 0

  const getTrendIcon = (trend?: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />
      default:
        return <Minus className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusIcon = (passed: boolean) => {
    return passed ? (
      <CheckCircle2 className="h-5 w-5 text-green-500" />
    ) : (
      <XCircle className="h-5 w-5 text-red-500" />
    )
  }


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Quality Results</h2>
          {cdeName && (
            <p className="text-muted-foreground">
              Data quality validation results for {cdeName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Score</p>
                <p className={cn(
                  'text-2xl font-bold',
                  overallScore >= 80 ? 'text-green-600' :
                  overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                )}>
                  {overallScore}%
                </p>
              </div>
              <div className={cn(
                'p-3 rounded-full',
                overallScore >= 80 ? 'bg-green-100' :
                overallScore >= 60 ? 'bg-yellow-100' : 'bg-red-100'
              )}>
                {overallScore >= 80 ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                ) : overallScore >= 60 ? (
                  <AlertTriangle className="h-6 w-6 text-yellow-600" />
                ) : (
                  <XCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rules Passed</p>
                <p className="text-2xl font-bold text-green-600">{passedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rules Failed</p>
                <p className="text-2xl font-bold text-red-600">{failedCount}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-200" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Rules</p>
                <p className="text-2xl font-bold">{results.length}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Results List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rule Execution Results</CardTitle>
          <CardDescription>
            Click on a failed rule to view sample records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No results available</p>
            </div>
          ) : (
            <div className="space-y-2">
              {results.map((result) => (
                <div key={result.ruleId} className="border rounded-lg overflow-hidden">
                  <div
                    className={cn(
                      'flex items-center justify-between p-4 cursor-pointer transition-colors',
                      !result.passed && 'hover:bg-muted/50'
                    )}
                    onClick={() => !result.passed && toggleExpanded(result.ruleId)}
                  >
                    <div className="flex items-center gap-4">
                      {!result.passed && result.failedSamples && result.failedSamples.length > 0 ? (
                        expandedRules.has(result.ruleId) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )
                      ) : (
                        <div className="w-4" />
                      )}
                      {getStatusIcon(result.passed)}
                      <div>
                        <p className="font-medium">{result.ruleName}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {result.dimension}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Threshold</p>
                        <p className="font-medium">{result.threshold}%</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Actual</p>
                        <div className="flex items-center gap-1">
                          <p className={cn(
                            'font-medium',
                            result.passed ? 'text-green-600' : 'text-red-600'
                          )}>
                            {result.actualValue.toFixed(1)}%
                          </p>
                          {getTrendIcon(result.trend)}
                        </div>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="text-sm text-muted-foreground">Records</p>
                        <p className="font-medium">
                          {result.failedRecords.toLocaleString()} / {result.totalRecords.toLocaleString()}
                        </p>
                      </div>
                      <div className={cn(
                        'px-3 py-1 rounded-full text-xs font-medium',
                        result.passed
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      )}>
                        {result.passed ? 'Pass' : 'Fail'}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Failed Records */}
                  {!result.passed && expandedRules.has(result.ruleId) && result.failedSamples && (
                    <div className="border-t bg-muted/30 p-4">
                      <p className="text-sm font-medium mb-3">
                        Sample Failed Records ({result.failedSamples.length} shown)
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-3 font-medium">Record ID</th>
                              <th className="text-left py-2 px-3 font-medium">Values</th>
                              <th className="text-left py-2 px-3 font-medium">Failure Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.failedSamples.map((record) => (
                              <tr key={record.id} className="border-b last:border-0">
                                <td className="py-2 px-3 font-mono text-xs">{record.id}</td>
                                <td className="py-2 px-3">
                                  <code className="text-xs bg-muted px-2 py-1 rounded">
                                    {JSON.stringify(record.values)}
                                  </code>
                                </td>
                                <td className="py-2 px-3 text-red-600">{record.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default QualityResultsView
