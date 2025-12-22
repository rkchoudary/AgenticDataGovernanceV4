/**
 * ContextualHelpPanel Component
 * 
 * Displays contextual help for the current step including description,
 * required actions, common issues, and video tutorial links.
 * 
 * Requirements: 14.1, 14.2
 */

import { useState } from 'react'
import {
  HelpCircle,
  X,
  ChevronRight,
  PlayCircle,
  Book,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Search,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Phase } from '@/types/workflow-wizard'
import { FAQ, CommonIssue } from './types'
import { getStepHelp, getPhaseHelp, PHASE_HELP_CONTENT } from './helpContent'

interface ContextualHelpPanelProps {
  isOpen: boolean
  onClose: () => void
  currentPhase: Phase
  currentStepId: string
  onRequestAssistance?: () => void
  className?: string
}

export function ContextualHelpPanel({
  isOpen,
  onClose,
  currentPhase,
  currentStepId,
  onRequestAssistance,
  className,
}: ContextualHelpPanelProps) {
  const [activeTab, setActiveTab] = useState<'help' | 'faq' | 'search'>('help')
  const [searchQuery, setSearchQuery] = useState('')

  const stepHelp = getStepHelp(currentPhase, currentStepId)
  const phaseHelp = getPhaseHelp(currentPhase)

  // Search across all help content
  const searchResults = searchQuery.trim()
    ? searchHelpContent(searchQuery)
    : []

  if (!isOpen) return null

  return (
    <div
      className={cn(
        'fixed right-0 top-0 h-full w-96 bg-background border-l shadow-lg z-50',
        'animate-in slide-in-from-right duration-300',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Help & Guidance</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="w-full justify-start px-4 pt-2">
          <TabsTrigger value="help">This Step</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>

        <ScrollArea className="h-[calc(100vh-180px)]">
          {/* Help Tab */}
          <TabsContent value="help" className="p-4 space-y-4">
            {stepHelp ? (
              <>
                {/* Step Title & Description */}
                <div>
                  <h3 className="font-semibold text-lg">{stepHelp.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {stepHelp.description}
                  </p>
                </div>

                {/* Required Actions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-primary" />
                      Required Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {stepHelp.requiredActions.map((action, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-sm"
                        >
                          <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Common Issues */}
                {stepHelp.commonIssues.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Common Issues
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {stepHelp.commonIssues.map((issue) => (
                        <CommonIssueCard key={issue.id} issue={issue} />
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Tips */}
                {stepHelp.tips && stepHelp.tips.length > 0 && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-4">
                      <p className="text-sm font-medium mb-2">💡 Tips</p>
                      <ul className="space-y-1">
                        {stepHelp.tips.map((tip, index) => (
                          <li key={index} className="text-sm text-muted-foreground">
                            • {tip}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Video Tutorial Link */}
                {stepHelp.videoTutorialUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    asChild
                  >
                    <a
                      href={stepHelp.videoTutorialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <PlayCircle className="h-4 w-4 text-primary" />
                      Watch Video Tutorial
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  </Button>
                )}

                {/* Documentation Link */}
                {stepHelp.documentationUrl && (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    asChild
                  >
                    <a
                      href={stepHelp.documentationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Book className="h-4 w-4" />
                      View Documentation
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No help content available for this step.</p>
              </div>
            )}
          </TabsContent>

          {/* FAQ Tab */}
          <TabsContent value="faq" className="p-4 space-y-4">
            {phaseHelp?.faqs && phaseHelp.faqs.length > 0 ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Frequently asked questions about {phaseHelp.title}
                </p>
                <div className="space-y-3">
                  {phaseHelp.faqs.map((faq, index) => (
                    <FAQCard key={index} faq={faq} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No FAQs available for this phase.</p>
              </div>
            )}
          </TabsContent>

          {/* Search Tab */}
          <TabsContent value="search" className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search help content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {searchQuery.trim() ? (
              searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map((result, index) => (
                    <SearchResultCard key={index} result={result} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No results found for "{searchQuery}"</p>
                </div>
              )
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Enter a search term to find help content</p>
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Request Assistance Button */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={onRequestAssistance}
        >
          <MessageSquare className="h-4 w-4" />
          Request Assistance
        </Button>
      </div>
    </div>
  )
}

/**
 * Common Issue Card Component
 */
function CommonIssueCard({ issue }: { issue: CommonIssue }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border rounded-lg p-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium text-sm">{issue.title}</p>
            <p className="text-xs text-muted-foreground">{issue.description}</p>
          </div>
          <ChevronRight
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isExpanded && 'rotate-90'
            )}
          />
        </div>
      </button>
      {isExpanded && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-xs font-medium text-primary">Resolution:</p>
          <p className="text-xs text-muted-foreground">{issue.resolution}</p>
        </div>
      )}
    </div>
  )
}

/**
 * FAQ Card Component
 */
function FAQCard({ faq }: { faq: FAQ }) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="border rounded-lg p-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm">{faq.question}</p>
          <ChevronRight
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
              isExpanded && 'rotate-90'
            )}
          />
        </div>
      </button>
      {isExpanded && (
        <div className="mt-2 pt-2 border-t">
          <p className="text-sm text-muted-foreground">{faq.answer}</p>
        </div>
      )}
    </div>
  )
}

/**
 * Search Result Card Component
 */
interface SearchResultItem {
  type: 'step' | 'faq' | 'issue'
  title: string
  excerpt: string
  phaseTitle?: string
}

function SearchResultCard({ result }: { result: SearchResultItem }) {
  return (
    <div className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer">
      <div className="flex items-start gap-2">
        <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">
          {result.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{result.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {result.excerpt}
          </p>
          {result.phaseTitle && (
            <p className="text-xs text-primary mt-1">{result.phaseTitle}</p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Search help content across all phases
 */
function searchHelpContent(query: string): SearchResultItem[] {
  const results: SearchResultItem[] = []
  const lowerQuery = query.toLowerCase()

  Object.values(PHASE_HELP_CONTENT).forEach((phaseHelp) => {
    // Search steps
    phaseHelp.steps.forEach((step) => {
      if (
        step.title.toLowerCase().includes(lowerQuery) ||
        step.description.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          type: 'step',
          title: step.title,
          excerpt: step.description,
          phaseTitle: phaseHelp.title,
        })
      }

      // Search common issues
      step.commonIssues.forEach((issue) => {
        if (
          issue.title.toLowerCase().includes(lowerQuery) ||
          issue.description.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            type: 'issue',
            title: issue.title,
            excerpt: issue.resolution,
            phaseTitle: phaseHelp.title,
          })
        }
      })
    })

    // Search FAQs
    phaseHelp.faqs.forEach((faq) => {
      if (
        faq.question.toLowerCase().includes(lowerQuery) ||
        faq.answer.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          type: 'faq',
          title: faq.question,
          excerpt: faq.answer,
          phaseTitle: phaseHelp.title,
        })
      }
    })
  })

  return results.slice(0, 10) // Limit results
}

export default ContextualHelpPanel
