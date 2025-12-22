import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  ArrowUpDown,
  Database,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BulkOperationsPanel } from '@/components/data-quality'
import { useCDEs, useUpdateCDE, type CDE } from '@/hooks/useCDEs'
import { cn } from '@/lib/utils'

// Mock available owners for bulk assignment
const mockOwners = [
  { id: '1', name: 'John Smith', email: 'john.smith@example.com' },
  { id: '2', name: 'Jane Doe', email: 'jane.doe@example.com' },
  { id: '3', name: 'Bob Wilson', email: 'bob.wilson@example.com' },
]

type SortField = 'name' | 'criticalityScore' | 'qualityScore' | 'updatedAt'
type SortOrder = 'asc' | 'desc'

interface CDEFilters {
  search: string
  status: string
  minScore: string
}

export function CDEList() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState<CDEFilters>({
    search: '',
    status: 'all',
    minScore: 'all',
  })
  const [sortField, setSortField] = useState<SortField>('criticalityScore')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedCDEs, setSelectedCDEs] = useState<Set<string>>(new Set())
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)

  const updateCDE = useUpdateCDE()

  const { data: cdesData, isLoading } = useCDEs({
    search: filters.search || undefined,
    status: filters.status !== 'all' ? filters.status : undefined,
    minScore: filters.minScore !== 'all' ? parseInt(filters.minScore) : undefined,
  })

  const sortedCDEs = useMemo(() => {
    if (!cdesData?.items) return []
    return [...cdesData.items].sort((a, b) => {
      let comparison = 0
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'criticalityScore':
          comparison = a.criticalityScore - b.criticalityScore
          break
        case 'qualityScore':
          comparison = a.qualityScore - b.qualityScore
          break
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
  }, [cdesData?.items, sortField, sortOrder])


  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const handleSelectAll = () => {
    if (selectedCDEs.size === sortedCDEs.length) {
      setSelectedCDEs(new Set())
    } else {
      setSelectedCDEs(new Set(sortedCDEs.map((cde) => cde.id)))
    }
  }

  const handleSelectCDE = (id: string) => {
    const newSelected = new Set(selectedCDEs)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedCDEs(newSelected)
  }

  const getStatusIcon = (status: CDE['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'pending_review':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'deprecated':
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50'
    if (score >= 60) return 'text-yellow-600 bg-yellow-50'
    return 'text-red-600 bg-red-50'
  }

  const handleBulkAssignOwner = async (owner: string, email: string) => {
    setIsProcessingBulk(true)
    try {
      await Promise.all(
        Array.from(selectedCDEs).map((id) =>
          updateCDE.mutateAsync({ id, owner, ownerEmail: email })
        )
      )
      setSelectedCDEs(new Set())
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkChangeStatus = async (status: string) => {
    setIsProcessingBulk(true)
    try {
      await Promise.all(
        Array.from(selectedCDEs).map((id) =>
          updateCDE.mutateAsync({ id, status })
        )
      )
      setSelectedCDEs(new Set())
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const handleBulkEnableRules = () => {
    console.log('Enable rules for:', Array.from(selectedCDEs))
    // In production, this would call an API
  }

  const handleBulkDisableRules = () => {
    console.log('Disable rules for:', Array.from(selectedCDEs))
    // In production, this would call an API
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Critical Data Elements</h1>
          <p className="text-muted-foreground">
            Manage and monitor your critical data elements
          </p>
        </div>
        {selectedCDEs.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedCDEs.size} selected
            </span>
            <Button variant="outline" size="sm" onClick={() => setSelectedCDEs(new Set())}>
              Clear
            </Button>
            <Button size="sm">Bulk Actions</Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search CDEs by name or description..."
                className="w-full pl-10 pr-4 py-2 border rounded-md bg-background"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              />
            </div>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.minScore}
              onValueChange={(value) => setFilters({ ...filters, minScore: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Min Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scores</SelectItem>
                <SelectItem value="80">80+</SelectItem>
                <SelectItem value="60">60+</SelectItem>
                <SelectItem value="40">40+</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>


      {/* Data Grid */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {cdesData?.total ?? 0} Critical Data Elements
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading CDEs...</p>
            </div>
          ) : sortedCDEs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Database className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No CDEs found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedCDEs.size === sortedCDEs.length && sortedCDEs.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('name')}
                      >
                        Name
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Owner</th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('criticalityScore')}
                      >
                        Criticality
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('qualityScore')}
                      >
                        Quality
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">
                      <button
                        className="flex items-center gap-1 font-medium hover:text-primary"
                        onClick={() => handleSort('updatedAt')}
                      >
                        Updated
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCDEs.map((cde) => (
                    <tr
                      key={cde.id}
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/cdes/${cde.id}`)}
                    >
                      <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedCDEs.has(cde.id)}
                          onChange={() => handleSelectCDE(cde.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="py-3 px-2">
                        <div>
                          <p className="font-medium">{cde.name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-xs">
                            {cde.description}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <span className="text-sm">{cde.owner || 'Unassigned'}</span>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                            getScoreColor(cde.criticalityScore)
                          )}
                        >
                          {cde.criticalityScore}
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                            getScoreColor(cde.qualityScore)
                          )}
                        >
                          {cde.qualityScore}%
                        </span>
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(cde.status)}
                          <span className="text-sm capitalize">
                            {cde.status.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-sm text-muted-foreground">
                        {new Date(cde.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Operations Panel */}
      <BulkOperationsPanel
        selectedCount={selectedCDEs.size}
        selectedIds={Array.from(selectedCDEs)}
        onClearSelection={() => setSelectedCDEs(new Set())}
        onAssignOwner={handleBulkAssignOwner}
        onChangeStatus={handleBulkChangeStatus}
        onEnableRules={handleBulkEnableRules}
        onDisableRules={handleBulkDisableRules}
        availableOwners={mockOwners}
        isProcessing={isProcessingBulk}
      />
    </div>
  )
}

export default CDEList
