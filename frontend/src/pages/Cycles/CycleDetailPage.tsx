import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  CycleDetail,
  WorkflowFlowchart,
  DeadlineTracker,
  type Task,
  type WorkflowStep,
  type Deadline,
} from '@/components/workflow'
import { useCycle, usePauseCycle, useResumeCycle } from '@/hooks/useCycles'

// Mock data - in production this would come from API
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
    phase: 'data_gathering',
    priority: 'medium',
    status: 'completed',
    assignee: { id: '2', name: 'Jane Doe' },
    dueDate: '2024-12-22',
  },
  {
    id: '3',
    title: 'Run completeness checks',
    phase: 'validation',
    priority: 'high',
    status: 'in_progress',
    assignee: { id: '1', name: 'John Smith' },
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
]

const mockIssues = [
  {
    id: '1',
    title: 'Missing data for field XYZ',
    severity: 'critical' as const,
    status: 'open',
  },
  {
    id: '2',
    title: 'Validation rule failure on accuracy check',
    severity: 'high' as const,
    status: 'in_progress',
  },
  {
    id: '3',
    title: 'Data format inconsistency',
    severity: 'medium' as const,
    status: 'open',
  },
]

const mockTimeline = [
  {
    id: '1',
    timestamp: new Date().toISOString(),
    action: 'Validation started',
    actor: 'Data Quality Agent',
    actorType: 'agent' as const,
    details: 'Running completeness checks on 45 data elements',
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    action: 'Data gathering completed',
    actor: 'John Smith',
    actorType: 'human' as const,
  },
  {
    id: '3',
    timestamp: new Date(Date.now() - 7200000).toISOString(),
    action: 'Source mapping completed',
    actor: 'Data Requirements Agent',
    actorType: 'agent' as const,
    details: 'Mapped 45 data elements to 12 source systems',
  },
  {
    id: '4',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    action: 'Cycle started',
    actor: 'System',
    actorType: 'system' as const,
  },
]

const mockWorkflowSteps: WorkflowStep[] = [
  {
    id: '1',
    name: 'Data Gathering',
    description: 'Extract and map data elements from regulatory templates',
    status: 'completed',
    completedAt: '2024-12-18',
    completedBy: 'John Smith',
    substeps: [
      { id: '1.1', name: 'Parse template', status: 'completed', completedAt: '2024-12-16' },
      { id: '1.2', name: 'Map sources', status: 'completed', completedAt: '2024-12-17' },
      { id: '1.3', name: 'Identify gaps', status: 'completed', completedAt: '2024-12-18' },
    ],
  },
  {
    id: '2',
    name: 'Validation',
    description: 'Run data quality rules and validate accuracy',
    status: 'current',
    estimatedDuration: '2 days',
    substeps: [
      { id: '2.1', name: 'Completeness checks', status: 'current' },
      { id: '2.2', name: 'Accuracy validation', status: 'blocked' },
      { id: '2.3', name: 'Consistency checks', status: 'pending' },
    ],
  },
  {
    id: '3',
    name: 'Review',
    description: 'Data steward review and sign-off',
    status: 'pending',
    estimatedDuration: '1 day',
  },
  {
    id: '4',
    name: 'Approval',
    description: 'Compliance officer approval',
    status: 'pending',
    estimatedDuration: '1 day',
  },
  {
    id: '5',
    name: 'Submission',
    description: 'Submit to regulatory body',
    status: 'pending',
    estimatedDuration: '4 hours',
  },
]

const mockDeadlines: Deadline[] = [
  {
    id: '1',
    title: 'Validation Complete',
    dueDate: '2024-12-25T17:00:00',
    type: 'task',
    status: 'due_soon',
    notificationThresholds: [3, 1],
  },
  {
    id: '2',
    title: 'Review Sign-off',
    dueDate: '2024-12-28T12:00:00',
    type: 'review',
    status: 'upcoming',
  },
  {
    id: '3',
    title: 'Final Submission',
    dueDate: '2024-12-31T17:00:00',
    type: 'submission',
    status: 'upcoming',
    notificationThresholds: [7, 3, 1],
  },
]

export function CycleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: cycle, isLoading } = useCycle(id || '')
  const pauseMutation = usePauseCycle()
  const resumeMutation = useResumeCycle()

  // Use mock data for demonstration
  const mockCycle = {
    id: id || '1',
    reportId: 'osfi-e23',
    reportName: 'OSFI E-23 Quarterly Report',
    periodEnd: '2024-12-31',
    status: 'active' as const,
    currentPhase: 'validation' as const,
    progress: 35,
    dueDate: '2024-12-31',
    createdAt: '2024-12-01',
    updatedAt: new Date().toISOString(),
  }

  const displayCycle = cycle || mockCycle

  const handlePause = () => {
    if (id) {
      pauseMutation.mutate(id)
    }
  }

  const handleResume = () => {
    if (id) {
      resumeMutation.mutate(id)
    }
  }

  const handleTaskClick = (task: Task) => {
    console.log('Task clicked:', task)
    // Navigate to task detail or open modal
  }

  const handleIssueClick = (issueId: string) => {
    navigate(`/issues/${issueId}`)
  }

  const handleStepClick = (step: WorkflowStep) => {
    console.log('Step clicked:', step)
    // Could expand step details or navigate
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading cycle details...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/cycles')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Cycles
      </Button>

      {/* Cycle Detail */}
      <CycleDetail
        cycle={displayCycle}
        tasks={mockTasks}
        issues={mockIssues}
        timeline={mockTimeline}
        onPause={displayCycle.status === 'active' ? handlePause : undefined}
        onResume={displayCycle.status === 'paused' ? handleResume : undefined}
        onTaskClick={handleTaskClick}
        onIssueClick={handleIssueClick}
      />

      {/* Workflow Flowchart */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorkflowFlowchart
            steps={mockWorkflowSteps}
            orientation="vertical"
            onStepClick={handleStepClick}
          />
        </div>

        {/* Deadlines */}
        <div className="lg:col-span-1">
          <DeadlineTracker
            deadlines={mockDeadlines}
            onDeadlineClick={(d) => console.log('Deadline clicked:', d)}
            onSetReminder={(d) => console.log('Set reminder for:', d)}
          />
        </div>
      </div>
    </div>
  )
}

export default CycleDetailPage
