import * as React from 'react'
import { 
  FileText, 
  AlertTriangle, 
  Database, 
  GitBranch, 
  CheckCircle,
  BarChart3,
  Search,
  HelpCircle,
  Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface QuickAction {
  id: string
  label: string
  prompt: string
  icon: React.ElementType
  category: 'governance' | 'quality' | 'issues' | 'general'
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'report-status',
    label: 'Check report status',
    prompt: 'What is the current status of all active report cycles?',
    icon: FileText,
    category: 'governance',
  },
  {
    id: 'open-issues',
    label: 'Show open issues',
    prompt: 'List all open issues sorted by severity',
    icon: AlertTriangle,
    category: 'issues',
  },
  {
    id: 'cde-quality',
    label: 'CDE quality summary',
    prompt: 'Give me a summary of CDE quality scores across all reports',
    icon: Database,
    category: 'quality',
  },
  {
    id: 'lineage-impact',
    label: 'Analyze lineage impact',
    prompt: 'What would be the impact if we change the source data for our critical data elements?',
    icon: GitBranch,
    category: 'governance',
  },
  {
    id: 'pending-approvals',
    label: 'Pending approvals',
    prompt: 'What approvals are pending my review?',
    icon: CheckCircle,
    category: 'governance',
  },
  {
    id: 'compliance-score',
    label: 'Compliance score',
    prompt: 'What is our current overall compliance score and how has it trended?',
    icon: BarChart3,
    category: 'quality',
  },
  {
    id: 'search-cde',
    label: 'Search CDEs',
    prompt: 'Help me find CDEs related to ',
    icon: Search,
    category: 'quality',
  },
  {
    id: 'help',
    label: 'What can you help with?',
    prompt: 'What tasks can you help me with?',
    icon: HelpCircle,
    category: 'general',
  },
]

interface QuickActionsProps {
  onSelectAction: (prompt: string) => void
  context?: 'empty' | 'conversation'
  className?: string
}

export function QuickActions({ 
  onSelectAction, 
  context = 'empty',
  className 
}: QuickActionsProps) {
  const displayActions = context === 'empty' 
    ? QUICK_ACTIONS 
    : QUICK_ACTIONS.slice(0, 4)

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

interface QuickActionChipProps {
  action: QuickAction
  onClick: () => void
}

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

interface FollowUpSuggestionsProps {
  suggestions: string[]
  onSelectSuggestion: (suggestion: string) => void
  className?: string
}

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

// Context-aware suggestions based on the last message
export function getContextualSuggestions(lastMessage?: string): string[] {
  if (!lastMessage) return []

  const lowerMessage = lastMessage.toLowerCase()

  if (lowerMessage.includes('issue') || lowerMessage.includes('problem')) {
    return [
      'What is the root cause?',
      'Show similar issues',
      'Who should I assign this to?',
      'What is the resolution timeline?',
    ]
  }

  if (lowerMessage.includes('cde') || lowerMessage.includes('data element')) {
    return [
      'Show quality rules for this CDE',
      'What reports use this CDE?',
      'Show lineage for this CDE',
      'Who is the data owner?',
    ]
  }

  if (lowerMessage.includes('report') || lowerMessage.includes('cycle')) {
    return [
      'What tasks are pending?',
      'Show blocking issues',
      'When is the deadline?',
      'Generate compliance package',
    ]
  }

  if (lowerMessage.includes('quality') || lowerMessage.includes('score')) {
    return [
      'What rules are failing?',
      'Show trend over time',
      'Which CDEs need attention?',
      'Generate quality report',
    ]
  }

  // Default suggestions
  return [
    'Tell me more',
    'What should I do next?',
    'Show related items',
  ]
}
