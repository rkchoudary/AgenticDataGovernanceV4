import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, LayoutGrid, List, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KanbanBoard, type Phase, type Task } from '@/components/workflow'
import { DeadlineWidget, type Deadline } from '@/components/workflow'
import { useCycles, type Cycle } from '@/hooks/useCycles'
import { cn } from '@/lib/utils'

type ViewMode = 'kanban' | 'list'

// Mock data for demonstration - in production this would come from API
const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Extract regulatory data elements',
    description: 'Parse OSFI E-23 template for required fields',
    phase: 'data_gathering',
    priority: 'high',
    status: 'completed',
    assignee: { id: '1', name: 'John Smith' },
    dueDate: '2024-12-20',
  },
  {
    id: '2',
    title: 'Map internal data sources',
    description: 'Connect data elements to source systems',
    phase: 'data_gathering',
    priority: 'medium',
    status: 'in_progress',
    assignee: { id: '2', name: 'Jane Doe' },
    dueDate: '2024-12-22',
    issueCount: 2,
  },
  {
    id: '3',
    title: 'Run completeness checks',
    phase: 'validation',
    priority: 'high',
    status: 'pending',
    dueDate: '2024-12-25',
  },
  {
    id: '4',
    title: 'Validate accuracy rules',
    phase: 'validation',
    priority: 'critical',
    status: 'blocked',
    assignee: { id: '3', name: 'Bob Wilson' },
    dueDate: '2024-12-24',
    issueCount: 1,
  },
  {
    id: '5',
    title: 'Data steward review',
    phase: 'review',
    priority: 'medium',
    status: 'pending',
    dueDate: '2024-12-28',
  },
  {
    id: '6',
    title: 'Compliance officer approval',
    phase: 'approval',
    priority: 'high',
    status: 'pending',
    dueDate: '2024-12-30',
  },
  {
    id: '7',
    title: 'Submit to regulator',
    phase: 'submission',
    priority: 'critical',
    status: 'pending',
    dueDate: '2024-12-31',
  },
]

const mockDeadlines: Deadline[] = [
  {
    id: '1',
    title: 'OSFI E-23 Q4 Submission',
    description: 'Quarterly regulatory report submission',
    dueDate: '2024-12-31T17:00:00',
    type: 'submission',
    status: 'due_soon',
    reportName: 'OSFI E-23',
    notificationThresholds: [7, 3, 1],
  },
  {
    id: '2',
    title: 'Data Quality Review',
    dueDate: '2024-12-25T12:00:00',
    type: 'review',
    status: 'due_soon',
    reportName: 'OSFI E-23',
  },
  {
    id: '3',
    title: 'FR Y-14Q Approval',
    dueDate: '2024-12-20T09:00:00',
    type: 'approval',
    status: 'overdue',
    reportName: 'FR Y-14Q',
  },
]

export function CycleList() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: cyclesData, isLoading } = useCycles(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  )

  const handleTaskMove = (taskId: string, newPhase: Phase) => {
    console.log(`Moving task ${taskId} to phase ${newPhase}`)
    // In production, this would call an API to update the task
  }

  const handleTaskClick = (task: Task) => {
    console.log('Task clicked:', task)
    // Navigate to task detail or open modal
  }

  const handleDeadlineClick = (deadline: Deadline) => {
    console.log('Deadline clicked:', deadline)
    // Navigate to related cycle or task
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Report Cycles</h1>
          <p className="text-muted-foreground">
            Manage regulatory reporting workflows
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/cycles/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Cycle
          </Button>
        </div>
      </div>

      {/* Filters and View Toggle */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('kanban')}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            Kanban
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Kanban Board / List View */}
        <div className="lg:col-span-3">
          {viewMode === 'kanban' ? (
            <KanbanBoard
              tasks={mockTasks}
              onTaskMove={handleTaskMove}
              onTaskClick={handleTaskClick}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Active Cycles</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-muted-foreground">Loading cycles...</p>
                ) : cyclesData?.items.length === 0 ? (
                  <p className="text-muted-foreground">No cycles found</p>
                ) : (
                  <div className="space-y-2">
                    {cyclesData?.items.map((cycle: Cycle) => (
                      <div
                        key={cycle.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div 
                          className="flex-1 cursor-pointer"
                          onClick={() => navigate(`/cycles/${cycle.id}`)}
                        >
                          <h4 className="font-medium">{cycle.reportName}</h4>
                          <p className="text-sm text-muted-foreground">
                            Period ending {cycle.periodEnd}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {cycle.progress}%
                            </p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {cycle.currentPhase.replace('_', ' ')}
                            </p>
                          </div>
                          <div
                            className={cn(
                              'w-2 h-2 rounded-full',
                              cycle.status === 'active' && 'bg-green-500',
                              cycle.status === 'paused' && 'bg-yellow-500',
                              cycle.status === 'completed' && 'bg-blue-500'
                            )}
                          />
                          {cycle.status === 'active' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/cycles/${cycle.id}/wizard`)
                              }}
                            >
                              <Wand2 className="h-4 w-4 mr-2" />
                              Start Wizard
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Deadlines */}
        <div className="lg:col-span-1">
          <DeadlineWidget
            deadlines={mockDeadlines}
            onDeadlineClick={handleDeadlineClick}
          />
        </div>
      </div>
    </div>
  )
}

export default CycleList
