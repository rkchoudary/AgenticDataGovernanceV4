import * as React from 'react'
import { useMemo } from 'react'
import { 
  FileText, 
  AlertTriangle, 
  Database, 
  GitBranch, 
  CheckCircle,
  BarChart3,
  Search,
  HelpCircle,
  Sparkles,
  Play,
  Clock,
  Shield,
  RefreshCw,
  TrendingUp,
  Users,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Quick action definition
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */
interface QuickAction {
  id: string
  label: string
  prompt: string
  icon: React.ElementType
  category: 'governance' | 'quality' | 'issues' | 'general' | 'workflow' | 'regulatory'
  /** Pages where this action is relevant */
  relevantPages?: string[]
  /** User roles that can see this action */
  allowedRoles?: string[]
  /** Priority for sorting (higher = more important) */
  priority?: number
}

/**
 * Page context for contextual suggestions
 */
interface PageContext {
  path: string
  pageType: string
  entityId?: string
  entityType?: string
  metadata?: Record<string, unknown>
}

/**
 * All available quick actions
 */
const QUICK_ACTIONS: QuickAction[] = [
  // Governance actions
  {
    id: 'report-status',
    label: 'Check report status',
    prompt: 'What is the current status of all active report cycles?',
    icon: FileText,
    category: 'governance',
    relevantPages: ['dashboard', 'reports', 'cycles'],
    priority: 10,
  },
  {
    id: 'pending-approvals',
    label: 'Pending approvals',
    prompt: 'What approvals are pending my review?',
    icon: CheckCircle,
    category: 'governance',
    relevantPages: ['dashboard', 'approvals'],
    priority: 9,
  },
  {
    id: 'start-cycle',
    label: 'Start report cycle',
    prompt: 'Help me start a new report cycle',
    icon: Play,
    category: 'workflow',
    relevantPages: ['reports', 'cycles'],
    priority: 8,
  },
  {
    id: 'regulatory-changes',
    label: 'Regulatory changes',
    prompt: 'Are there any recent regulatory changes I should know about?',
    icon: RefreshCw,
    category: 'regulatory',
    relevantPages: ['dashboard', 'regulatory'],
    priority: 7,
  },

  // Quality actions
  {
    id: 'open-issues',
    label: 'Show open issues',
    prompt: 'List all open issues sorted by severity',
    icon: AlertTriangle,
    category: 'issues',
    relevantPages: ['dashboard', 'issues'],
    priority: 9,
  },
  {
    id: 'cde-quality',
    label: 'CDE quality summary',
    prompt: 'Give me a summary of CDE quality scores across all reports',
    icon: Database,
    category: 'quality',
    relevantPages: ['dashboard', 'cdes', 'quality'],
    priority: 8,
  },
  {
    id: 'compliance-score',
    label: 'Compliance score',
    prompt: 'What is our current overall compliance score and how has it trended?',
    icon: BarChart3,
    category: 'quality',
    relevantPages: ['dashboard'],
    priority: 7,
  },
  {
    id: 'quality-trends',
    label: 'Quality trends',
    prompt: 'Show me data quality trends over the past month',
    icon: TrendingUp,
    category: 'quality',
    relevantPages: ['dashboard', 'quality'],
    priority: 6,
  },

  // Lineage actions
  {
    id: 'lineage-impact',
    label: 'Analyze lineage impact',
    prompt: 'What would be the impact if we change the source data for our critical data elements?',
    icon: GitBranch,
    category: 'governance',
    relevantPages: ['lineage', 'cdes'],
    priority: 6,
  },

  // Search actions
  {
    id: 'search-cde',
    label: 'Search CDEs',
    prompt: 'Help me find CDEs related to ',
    icon: Search,
    category: 'quality',
    relevantPages: ['cdes', 'search'],
    priority: 5,
  },
  {
    id: 'search-reports',
    label: 'Search reports',
    prompt: 'Help me find reports related to ',
    icon: Search,
    category: 'governance',
    relevantPages: ['reports', 'search'],
    priority: 5,
  },

  // Workflow actions
  {
    id: 'my-tasks',
    label: 'My tasks',
    prompt: 'What tasks are assigned to me?',
    icon: Clock,
    category: 'workflow',
    relevantPages: ['dashboard', 'tasks'],
    priority: 8,
  },
  {
    id: 'team-workload',
    label: 'Team workload',
    prompt: 'Show me the current workload distribution across the team',
    icon: Users,
    category: 'workflow',
    allowedRoles: ['manager', 'admin'],
    priority: 5,
  },

  // Regulatory actions
  {
    id: 'report-catalog',
    label: 'Report catalog',
    prompt: 'Show me the regulatory report catalog',
    icon: FileText,
    category: 'regulatory',
    relevantPages: ['regulatory', 'reports'],
    priority: 6,
  },
  {
    id: 'control-status',
    label: 'Control status',
    prompt: 'What is the status of our data quality controls?',
    icon: Shield,
    category: 'governance',
    relevantPages: ['controls', 'dashboard'],
    priority: 6,
  },

  // General actions
  {
    id: 'help',
    label: 'What can you help with?',
    prompt: 'What tasks can you help me with?',
    icon: HelpCircle,
    category: 'general',
    priority: 1,
  },
  {
    id: 'settings',
    label: 'My preferences',
    prompt: 'Show me my notification and display preferences',
    icon: Settings,
    category: 'general',
    relevantPages: ['settings'],
    priority: 2,
  },
]

/**
 * Props for QuickActions component
 */
interface QuickActionsProps {
  /** Callback when an action is selected */
  onSelectAction: (prompt: string) => void
  /** Context for displaying actions */
  context?: 'empty' | 'conversation'
  /** Current page context for contextual suggestions */
  pageContext?: PageContext
  /** User's role for filtering actions */
  userRole?: string
  /** CSS class name */
  className?: string
  /** Maximum number of actions to display */
  maxActions?: number
}

/**
 * QuickActions component for displaying contextual action suggestions
 * 
 * Features:
 * - Displays up to 4 relevant actions based on context
 * - Filters actions by page type and user role
 * - Prioritizes actions based on relevance
 * 
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5
 */
export function QuickActions({ 
  onSelectAction, 
  context = 'empty',
  pageContext,
  userRole,
  className,
  maxActions = 4,
}: QuickActionsProps) {
  // Filter and sort actions based on context
  const displayActions = useMemo(() => {
    let actions = [...QUICK_ACTIONS]

    // Filter by user role
    if (userRole) {
      actions = actions.filter(action => 
        !action.allowedRoles || action.allowedRoles.includes(userRole)
      )
    }

    // Filter and prioritize by page context
    if (pageContext) {
      const pageType = pageContext.pageType.toLowerCase()
      
      // Boost priority for relevant pages
      actions = actions.map(action => {
        const isRelevant = action.relevantPages?.some(p => 
          pageType.includes(p) || p.includes(pageType)
        )
        return {
          ...action,
          priority: isRelevant ? (action.priority || 0) + 10 : action.priority || 0,
        }
      })
    }

    // Sort by priority (descending)
    actions.sort((a, b) => (b.priority || 0) - (a.priority || 0))

    // Limit based on context
    const limit = context === 'empty' ? QUICK_ACTIONS.length : maxActions
    return actions.slice(0, limit)
  }, [context, pageContext, userRole, maxActions])

  return (
    <div className={cn('space-y-3', className)}>
      {context === 'empty' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          <span>Quick actions</span>
        </div>
      )}
      <div className={cn(
        'flex flex-wrap gap-2',
        context === 'empty' ? 'justify-center' : 'justify-start'
      )}>
        {displayActions.map((action) => (
          <QuickActionChip
            key={action.id}
            action={action}
            onClick={() => onSelectAction(action.prompt)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Props for QuickActionChip component
 */
interface QuickActionChipProps {
  action: QuickAction
  onClick: () => void
}

/**
 * QuickActionChip component for displaying a single action button
 */
function QuickActionChip({ action, onClick }: QuickActionChipProps) {
  const Icon = action.icon

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-auto py-2 px-3 text-xs"
      onClick={onClick}
    >
      <Icon className="h-3 w-3 mr-1.5" />
      {action.label}
    </Button>
  )
}

/**
 * Props for FollowUpSuggestions component
 */
interface FollowUpSuggestionsProps {
  suggestions: string[]
  onSelectSuggestion: (suggestion: string) => void
  className?: string
}

/**
 * FollowUpSuggestions component for displaying follow-up question suggestions
 */
export function FollowUpSuggestions({
  suggestions,
  onSelectSuggestion,
  className,
}: FollowUpSuggestionsProps) {
  if (suggestions.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      <span className="text-xs text-muted-foreground">Follow-up questions:</span>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, index) => (
          <Button
            key={index}
            variant="ghost"
            size="sm"
            className="h-auto py-1.5 px-2.5 text-xs bg-muted/50 hover:bg-muted"
            onClick={() => onSelectSuggestion(suggestion)}
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  )
}

/**
 * Context-aware suggestions based on the last message
 * Validates: Requirements 14.4
 */
export function getContextualSuggestions(lastMessage?: string): string[] {
  if (!lastMessage) return []

  const lowerMessage = lastMessage.toLowerCase()

  // Issue-related suggestions
  if (lowerMessage.includes('issue') || lowerMessage.includes('problem')) {
    return [
      'What is the root cause?',
      'Show similar issues',
      'Who should I assign this to?',
      'What is the resolution timeline?',
    ]
  }

  // CDE-related suggestions
  if (lowerMessage.includes('cde') || lowerMessage.includes('data element')) {
    return [
      'Show quality rules for this CDE',
      'What reports use this CDE?',
      'Show lineage for this CDE',
      'Who is the data owner?',
    ]
  }

  // Report-related suggestions
  if (lowerMessage.includes('report') || lowerMessage.includes('cycle')) {
    return [
      'What tasks are pending?',
      'Show blocking issues',
      'When is the deadline?',
      'Generate compliance package',
    ]
  }

  // Quality-related suggestions
  if (lowerMessage.includes('quality') || lowerMessage.includes('score')) {
    return [
      'What rules are failing?',
      'Show trend over time',
      'Which CDEs need attention?',
      'Generate quality report',
    ]
  }

  // Lineage-related suggestions
  if (lowerMessage.includes('lineage') || lowerMessage.includes('source')) {
    return [
      'Trace upstream sources',
      'Show downstream impact',
      'What transformations apply?',
      'Who owns this data?',
    ]
  }

  // Regulatory-related suggestions
  if (lowerMessage.includes('regulatory') || lowerMessage.includes('compliance')) {
    return [
      'Show recent changes',
      'What reports are affected?',
      'When is the next deadline?',
      'Show compliance status',
    ]
  }

  // Approval-related suggestions
  if (lowerMessage.includes('approval') || lowerMessage.includes('approve')) {
    return [
      'Show pending items',
      'What needs my attention?',
      'Show approval history',
      'Delegate to someone',
    ]
  }

  // Default suggestions
  return [
    'Tell me more',
    'What should I do next?',
    'Show related items',
  ]
}

/**
 * Get entity-specific quick actions
 * Validates: Requirements 14.4
 */
export function getEntityQuickActions(
  entityType: string,
  entityId: string
): QuickAction[] {
  switch (entityType.toLowerCase()) {
    case 'report':
      return [
        {
          id: 'report-status',
          label: 'Check status',
          prompt: `What is the current status of report ${entityId}?`,
          icon: FileText,
          category: 'governance',
        },
        {
          id: 'report-issues',
          label: 'Show issues',
          prompt: `Show me all issues for report ${entityId}`,
          icon: AlertTriangle,
          category: 'issues',
        },
        {
          id: 'report-cdes',
          label: 'Show CDEs',
          prompt: `What CDEs are used in report ${entityId}?`,
          icon: Database,
          category: 'quality',
        },
        {
          id: 'report-lineage',
          label: 'Show lineage',
          prompt: `Show me the data lineage for report ${entityId}`,
          icon: GitBranch,
          category: 'governance',
        },
      ]

    case 'cde':
      return [
        {
          id: 'cde-quality',
          label: 'Quality score',
          prompt: `What is the quality score for CDE ${entityId}?`,
          icon: BarChart3,
          category: 'quality',
        },
        {
          id: 'cde-rules',
          label: 'Quality rules',
          prompt: `Show me the quality rules for CDE ${entityId}`,
          icon: Shield,
          category: 'quality',
        },
        {
          id: 'cde-lineage',
          label: 'Show lineage',
          prompt: `Show me the lineage for CDE ${entityId}`,
          icon: GitBranch,
          category: 'governance',
        },
        {
          id: 'cde-reports',
          label: 'Used in reports',
          prompt: `What reports use CDE ${entityId}?`,
          icon: FileText,
          category: 'governance',
        },
      ]

    case 'issue':
      return [
        {
          id: 'issue-details',
          label: 'Show details',
          prompt: `Tell me more about issue ${entityId}`,
          icon: AlertTriangle,
          category: 'issues',
        },
        {
          id: 'issue-impact',
          label: 'Show impact',
          prompt: `What is the impact of issue ${entityId}?`,
          icon: TrendingUp,
          category: 'issues',
        },
        {
          id: 'issue-similar',
          label: 'Similar issues',
          prompt: `Show me issues similar to ${entityId}`,
          icon: Search,
          category: 'issues',
        },
        {
          id: 'issue-resolve',
          label: 'Resolution steps',
          prompt: `What are the steps to resolve issue ${entityId}?`,
          icon: CheckCircle,
          category: 'issues',
        },
      ]

    default:
      return []
  }
}
