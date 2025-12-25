import { useState } from 'react'
import { Download, FileText, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface ReportDownloadProps {
  sessionId: string
  className?: string
  onReportGenerated?: (reportInfo: GeneratedReport) => void
}

export interface GeneratedReport {
  report_id: string
  filename: string
  download_url: string
  content_type: string
  generated_at: string
}

const REPORT_TYPES = [
  { value: 'conversation_summary', label: 'Conversation Summary' },
  { value: 'governance_analysis', label: 'Governance Analysis' },
  { value: 'compliance_report', label: 'Compliance Report' },
  { value: 'data_quality_assessment', label: 'Data Quality Assessment' },
  { value: 'regulatory_findings', label: 'Regulatory Findings' },
  { value: 'recommendations', label: 'Recommendations Report' }
]

const EXPORT_FORMATS = [
  { value: 'pdf', label: 'PDF Document', icon: '📄' },
  { value: 'json', label: 'JSON Data', icon: '🔧' },
  { value: 'csv', label: 'CSV Spreadsheet', icon: '📊' },
  { value: 'txt', label: 'Text File', icon: '📝' }
]

export function ReportDownload({ 
  sessionId, 
  className, 
  onReportGenerated 
}: ReportDownloadProps) {
  const [selectedReportType, setSelectedReportType] = useState<string>('')
  const [selectedFormat, setSelectedFormat] = useState<string>('pdf')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([])

  const generateReport = async () => {
    if (!selectedReportType) {
      alert('Please select a report type')
      return
    }

    setIsGenerating(true)

    try {
      const formData = new FormData()
      formData.append('session_id', sessionId)
      formData.append('report_type', selectedReportType)
      formData.append('format', selectedFormat)

      const response = await fetch('/api/chat/generate-report', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Report generation failed')
      }

      const result = await response.json()
      const reportInfo = result.data as GeneratedReport

      setGeneratedReports(prev => [reportInfo, ...prev])
      onReportGenerated?.(reportInfo)

      // Auto-download the report
      await downloadReport(reportInfo.download_url, reportInfo.filename)

    } catch (error) {
      console.error('Report generation error:', error)
      alert('Report generation failed: ' + (error as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadReport = async (downloadUrl: string, filename: string) => {
    try {
      const response = await fetch(downloadUrl)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
      alert('Download failed')
    }
  }

  const getFormatIcon = (format: string) => {
    const formatInfo = EXPORT_FORMATS.find(f => f.value === format)
    return formatInfo?.icon || '📄'
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Report Generation Controls */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Generate Report
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Report Type</label>
            <Select value={selectedReportType} onValueChange={setSelectedReportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select report type" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Format</label>
            <Select value={selectedFormat} onValueChange={setSelectedFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_FORMATS.map((format) => (
                  <SelectItem key={format.value} value={format.value}>
                    <div className="flex items-center gap-2">
                      <span>{format.icon}</span>
                      <span>{format.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button 
          onClick={generateReport}
          disabled={!selectedReportType || isGenerating}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Report...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Generate & Download Report
            </>
          )}
        </Button>
      </div>

      {/* Generated Reports History */}
      {generatedReports.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Recent Reports</h4>
          <div className="space-y-2">
            {generatedReports.slice(0, 5).map((report) => (
              <div
                key={report.report_id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20"
              >
                <span className="text-lg">{getFormatIcon(report.content_type)}</span>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{report.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    Generated: {new Date(report.generated_at).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="h-3 w-3" />
                    <span className="text-xs">Ready</span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadReport(report.download_url, report.filename)}
                    className="h-6 w-6 p-0"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Export Options */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">Quick Export</h4>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedReportType('conversation_summary')
              setSelectedFormat('pdf')
              setTimeout(generateReport, 100)
            }}
            disabled={isGenerating}
          >
            📄 Chat Summary
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedReportType('governance_analysis')
              setSelectedFormat('json')
              setTimeout(generateReport, 100)
            }}
            disabled={isGenerating}
          >
            🔧 Analysis Data
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedReportType('recommendations')
              setSelectedFormat('csv')
              setTimeout(generateReport, 100)
            }}
            disabled={isGenerating}
          >
            📊 Recommendations
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedReportType('compliance_report')
              setSelectedFormat('pdf')
              setTimeout(generateReport, 100)
            }}
            disabled={isGenerating}
          >
            📋 Compliance
          </Button>
        </div>
      </div>
    </div>
  )
}