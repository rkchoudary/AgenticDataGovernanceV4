import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Filter,
  Clock,
  AlertCircle,
  CheckCircle2,
  Inbox,
  SlidersHorizontal,
} from 'lucide-react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApprovals, type UrgencyLevel } from '@/hooks/useApprovals'
import { 
  MobileApprovalList, 
  TouchCard, 
  MobileQuickActions,
  useMobileDetect,
  type QuickAction,
} from '@/components/mobile'
import { cn } from '@/lib/utils'

type FilterTab = 'all' | 'pending' | 'critical' | 'overdue'

/**
 * MobileApprovalInbox - Mobile-optimized approval inbox with swipe gestures
 */
export function MobileApprovalInbox() {
  const navigate = useNavigate()
  const { isMobile } = useMobileDetect()
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')
  const [showFilters, setShowFilters] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all')

  const { data: approvalsData, isLoading } = useApprovals({
    status: activeTab === 'all' ? undefined : activeTab === 'pending' ? 'pending' : undefined,
  })

  // Filter approvals based on active tab and filters
  const filteredApprovals = useMemo(() => {
    if (!approvalsData?.items) return []
    
    let items = [...approvalsData.items]
    
    // Apply tab filter
    if (activeTab === 'pending') {
      items = items.filter((a) => a.status === 'pending')
    } else if (activeTab === 'critical') {
      items = items.filter((a) => a.urgency === 'critical' && a.status === 'pending')
    } else if (activeTab === 'overdue') {
      items = items.filter((a) => {
        if (!a.dueDate || a.status !== 'pending') return false
        return new Date(a.dueDate) < new Date()
      })
    }
    
    // Apply urgency filter
    if (urgencyFilter !== 'all') {
      items = items.filter((a) => a.urgency === urgencyFilter)
    }
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      items = items.filter(
        (a) =>
          a.artifactName.toLowerCase().includes(query) ||
          a.requester.toLowerCase().includes(query)
      )
    }
    
    // Sort by urgency and date
    items.sort((a, b) => {
      const urgencyOrder: Record<UrgencyLevel, number> = {
        critical: 4,
        high: 3,
        normal: 2,
        low: 1,
      }
      const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency]
      if (urgencyDiff !== 0) return urgencyDiff
      return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    })
    
    return items
  }, [approvalsData?.items, activeTab, urgencyFilter, searchQuery])

  // Stats for tabs
  const stats = useMemo(() => {
    if (!approvalsData?.items) return { all: 0, pending: 0, critical: 0, overdue: 0 }
    const items = approvalsData.items
    const pending = items.filter((a) => a.status === 'pending').length
    const critical = items.filter((a) => a.urgency === 'critical' && a.status === 'pending').length
    const overdue = items.filter((a) => {
      if (!a.dueDate || a.status !== 'pending') return false
      return new Date(a.dueDate) < new Date()
    }).length
    return { all: items.length, pending, critical, overdue }
  }, [approvalsData?.items])

  // Quick action handlers
  const handleApprove = (id: string) => {
    // Navigate to approval detail with approve action
    navigate(`/approvals/${id}?action=approve`)
  }

  const handleReject = (id: string) => {
    navigate(`/approvals/${id}?action=reject`)
  }

  const handleRequestChanges = (id: string) => {
    navigate(`/approvals/${id}?action=changes`)
  }

  // Quick actions for the header
  const quickActions: QuickAction[] = [
    {
      id: 'filter',
      icon: SlidersHorizontal,
      label: 'Filters',
      onAction: () => setShowFilters(!showFilters),
    },
    {
      id: 'settings',
      icon: Filter,
      label: 'Delegation',
      onAction: () => navigate('/approvals/settings'),
    },
  ]

  const tabs: { id: FilterTab; label: string; count: number; color?: string }[] = [
    { id: 'pending', label: 'Pending', count: stats.pending },
    { id: 'critical', label: 'Critical', count: stats.critical, color: 'text-red-600' },
    { id: 'overdue', label: 'Overdue', count: stats.overdue, color: 'text-orange-600' },
    { id: 'all', label: 'All', count: stats.all },
  ]

  // If not mobile, redirect to regular inbox
  if (!isMobile) {
    return null // The regular ApprovalInbox will be shown
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Approvals</h1>
            <MobileQuickActions actions={quickActions} />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search approvals..."
              className="w-full pl-10 pr-4 py-3 border rounded-xl bg-background text-base"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto scrollbar-hide px-4 pb-3 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap',
                'transition-colors touch-manipulation',
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={cn(
                    'min-w-[20px] h-5 flex items-center justify-center rounded-full text-xs',
                    activeTab === tab.id
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : tab.color || 'bg-muted-foreground/20'
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters (collapsible) */}
        {showFilters && (
          <div className="px-4 pb-4 border-t pt-4">
            <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Filter by urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Urgencies</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <TouchCard variant="outlined" size="sm" className="text-center">
          <Clock className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
          <p className="text-lg font-bold">{stats.pending}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </TouchCard>
        <TouchCard variant="outlined" size="sm" className="text-center">
          <AlertCircle className="h-5 w-5 mx-auto text-red-500 mb-1" />
          <p className="text-lg font-bold">{stats.critical}</p>
          <p className="text-xs text-muted-foreground">Critical</p>
        </TouchCard>
        <TouchCard variant="outlined" size="sm" className="text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto text-green-500 mb-1" />
          <p className="text-lg font-bold">{stats.all - stats.pending}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </TouchCard>
      </div>

      {/* Approval List */}
      <div className="flex-1 overflow-auto px-4 pb-20">
        {filteredApprovals.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-4" />
            <p className="text-lg font-medium">
              {activeTab === 'pending' ? 'All caught up!' : 'No approvals found'}
            </p>
            <p className="text-sm">
              {activeTab === 'pending'
                ? 'No pending approvals at the moment'
                : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <MobileApprovalList
            approvals={filteredApprovals}
            onApprove={handleApprove}
            onReject={handleReject}
            onRequestChanges={handleRequestChanges}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Swipe hint for first-time users */}
      {filteredApprovals.length > 0 && (
        <div className="fixed bottom-20 left-0 right-0 px-4 pointer-events-none">
          <div className="bg-muted/90 backdrop-blur-sm rounded-lg p-3 text-center text-sm text-muted-foreground">
            💡 Swipe cards left or right for quick actions
          </div>
        </div>
      )}
    </div>
  )
}

export default MobileApprovalInbox
