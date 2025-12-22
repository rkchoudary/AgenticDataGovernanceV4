import { useState } from 'react'
import { HelpCircle, ExternalLink, Book } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface ContextualHelpProps {
  title: string
  content: string
  docLink?: string
  learnMoreLink?: string
  className?: string
  iconClassName?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export function ContextualHelp({
  title,
  content,
  docLink,
  learnMoreLink,
  className,
  iconClassName,
  side = 'top',
}: ContextualHelpProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-5 w-5 rounded-full', className)}
          aria-label={`Help: ${title}`}
        >
          <HelpCircle className={cn('h-4 w-4 text-muted-foreground', iconClassName)} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} className="w-80">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-sm text-muted-foreground">{content}</p>
          {(docLink || learnMoreLink) && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {docLink && (
                <Button variant="outline" size="sm" asChild>
                  <a href={docLink} target="_blank" rel="noopener noreferrer">
                    <Book className="h-3 w-3 mr-1" />
                    Documentation
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {learnMoreLink && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={learnMoreLink} target="_blank" rel="noopener noreferrer">
                    Learn more
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Predefined help content for common features
export const helpContent = {
  cde: {
    title: 'Critical Data Elements (CDEs)',
    content: 'CDEs are data elements that are essential for regulatory reporting. They are scored based on regulatory usage, cross-report usage, financial impact, and regulatory scrutiny.',
    docLink: '/docs/cdes',
  },
  dqRule: {
    title: 'Data Quality Rules',
    content: 'Rules that validate data quality across 7 dimensions: completeness, accuracy, validity, consistency, timeliness, uniqueness, and integrity.',
    docLink: '/docs/data-quality',
  },
  lineage: {
    title: 'Data Lineage',
    content: 'Visual representation of data flow from source systems through transformations to regulatory reports. Helps understand data dependencies and impact analysis.',
    docLink: '/docs/lineage',
  },
  reportCycle: {
    title: 'Report Cycles',
    content: 'A report cycle tracks the end-to-end process of preparing a regulatory report, from data gathering through validation, review, and submission.',
    docLink: '/docs/cycles',
  },
  approval: {
    title: 'Approvals',
    content: 'Governance artifacts require approval before becoming effective. Approvers must provide rationale and can delegate to others when unavailable.',
    docLink: '/docs/approvals',
  },
  issue: {
    title: 'Issues',
    content: 'Data quality issues are tracked from detection through resolution. Critical issues can block report cycles until resolved.',
    docLink: '/docs/issues',
  },
  qualityScore: {
    title: 'Quality Score',
    content: 'A composite score (0-100) based on data quality rule results. Higher scores indicate better data quality across all dimensions.',
    docLink: '/docs/quality-scores',
  },
  complianceScore: {
    title: 'Compliance Score',
    content: 'Overall compliance health based on CDE quality, issue resolution, control effectiveness, and documentation completeness.',
    docLink: '/docs/compliance',
  },
}
