import { useState } from 'react'
import { format, subDays, subMonths } from 'date-fns'
import { Calendar, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { DashboardFilters as FilterType } from '@/hooks/useDashboard'

interface DashboardFiltersProps {
  filters: FilterType
  onFiltersChange: (filters: FilterType) => void
}

const DATE_PRESETS = [
  { label: 'Last 7 days', value: '7d', days: 7 },
  { label: 'Last 30 days', value: '30d', days: 30 },
  { label: 'Last 90 days', value: '90d', days: 90 },
  { label: 'Last 6 months', value: '6m', months: 6 },
  { label: 'Last year', value: '1y', months: 12 },
]

const JURISDICTIONS = [
  { label: 'All Jurisdictions', value: 'all' },
  { label: 'United States', value: 'US' },
  { label: 'Canada', value: 'CA' },
  { label: 'European Union', value: 'EU' },
  { label: 'United Kingdom', value: 'UK' },
]

const SEVERITIES = [
  { label: 'All Severities', value: 'all' },
  { label: 'Critical', value: 'critical' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' },
]

// Mock reports - in production, this would come from an API
const REPORTS = [
  { label: 'All Reports', value: 'all' },
  { label: 'CCAR', value: 'ccar' },
  { label: 'FR Y-14Q', value: 'fr-y-14q' },
  { label: 'Call Report', value: 'call-report' },
  { label: 'DFAST', value: 'dfast' },
  { label: 'LCR', value: 'lcr' },
]

export function DashboardFilters({
  filters,
  onFiltersChange,
}: DashboardFiltersProps) {
  const [datePreset, setDatePreset] = useState('30d')

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset)
    const presetConfig = DATE_PRESETS.find((p) => p.value === preset)
    if (!presetConfig) return

    const now = new Date()
    let dateFrom: Date

    if (presetConfig.months) {
      dateFrom = subMonths(now, presetConfig.months)
    } else {
      dateFrom = subDays(now, presetConfig.days ?? 30)
    }

    onFiltersChange({
      ...filters,
      dateFrom: format(dateFrom, 'yyyy-MM-dd'),
      dateTo: format(now, 'yyyy-MM-dd'),
    })
  }

  const handleFilterChange = (key: keyof FilterType, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value === 'all' ? undefined : value,
    })
  }

  const clearFilters = () => {
    setDatePreset('30d')
    onFiltersChange({})
  }

  const hasActiveFilters =
    filters.reportId || filters.jurisdiction || filters.severity

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={datePreset} onValueChange={handleDatePresetChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Report Filter */}
        <Select
          value={filters.reportId ?? 'all'}
          onValueChange={(value) => handleFilterChange('reportId', value)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Report" />
          </SelectTrigger>
          <SelectContent>
            {REPORTS.map((report) => (
              <SelectItem key={report.value} value={report.value}>
                {report.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Jurisdiction Filter */}
        <Select
          value={filters.jurisdiction ?? 'all'}
          onValueChange={(value) => handleFilterChange('jurisdiction', value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Jurisdiction" />
          </SelectTrigger>
          <SelectContent>
            {JURISDICTIONS.map((jurisdiction) => (
              <SelectItem key={jurisdiction.value} value={jurisdiction.value}>
                {jurisdiction.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Severity Filter */}
        <Select
          value={filters.severity ?? 'all'}
          onValueChange={(value) => handleFilterChange('severity', value)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITIES.map((severity) => (
              <SelectItem key={severity.value} value={severity.value}>
                {severity.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* More Filters Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <h4 className="font-medium">Additional Filters</h4>
              <p className="text-sm text-muted-foreground">
                Additional filter options will be available here for more
                granular control over the dashboard data.
              </p>
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>
    </Card>
  )
}
