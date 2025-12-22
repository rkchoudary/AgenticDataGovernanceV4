import { useState } from 'react'
import {
  Search,
  Book,
  MessageCircle,
  FileText,
  ChevronRight,
  Play,
  HelpCircle,
  Ticket,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useOnboardingStore } from '@/stores/onboardingStore'

interface HelpArticle {
  id: string
  title: string
  description: string
  category: string
  icon: React.ElementType
  link: string
  isExternal?: boolean
}

const helpArticles: HelpArticle[] = [
  {
    id: 'getting-started',
    title: 'Getting Started Guide',
    description: 'Learn the basics of the Data Governance platform',
    category: 'Basics',
    icon: Book,
    link: '/docs/getting-started',
  },
  {
    id: 'cde-management',
    title: 'Managing Critical Data Elements',
    description: 'How to identify, score, and manage CDEs',
    category: 'CDEs',
    icon: FileText,
    link: '/docs/cdes',
  },
  {
    id: 'data-quality',
    title: 'Data Quality Rules',
    description: 'Creating and managing data quality validation rules',
    category: 'Data Quality',
    icon: FileText,
    link: '/docs/data-quality',
  },
  {
    id: 'report-cycles',
    title: 'Report Cycle Management',
    description: 'Managing regulatory reporting cycles end-to-end',
    category: 'Workflows',
    icon: FileText,
    link: '/docs/cycles',
  },
  {
    id: 'lineage',
    title: 'Data Lineage Visualization',
    description: 'Understanding and navigating data lineage graphs',
    category: 'Lineage',
    icon: FileText,
    link: '/docs/lineage',
  },
  {
    id: 'approvals',
    title: 'Approval Workflows',
    description: 'How to review and approve governance artifacts',
    category: 'Workflows',
    icon: FileText,
    link: '/docs/approvals',
  },
  {
    id: 'issues',
    title: 'Issue Management',
    description: 'Tracking and resolving data quality issues',
    category: 'Issues',
    icon: FileText,
    link: '/docs/issues',
  },
  {
    id: 'ai-assistant',
    title: 'Using the AI Assistant',
    description: 'Get help from the AI-powered governance assistant',
    category: 'AI',
    icon: MessageCircle,
    link: '/docs/ai-assistant',
  },
]

const quickLinks = [
  {
    id: 'tour',
    title: 'Restart Product Tour',
    description: 'Take a guided tour of the platform',
    icon: Play,
    action: 'tour',
  },
  {
    id: 'support',
    title: 'Contact Support',
    description: 'Get help from our support team',
    icon: Ticket,
    action: 'support',
  },
  {
    id: 'community',
    title: 'Community Forum',
    description: 'Connect with other users',
    icon: Users,
    link: 'https://community.example.com',
    isExternal: true,
  },
]

interface HelpCenterProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function HelpCenter({ open, onOpenChange }: HelpCenterProps) {
  const { helpCenterOpen, setHelpCenterOpen, startTour } = useOnboardingStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSupportForm, setShowSupportForm] = useState(false)

  const isOpen = open ?? helpCenterOpen
  const handleOpenChange = onOpenChange ?? setHelpCenterOpen

  const filteredArticles = helpArticles.filter(
    article =>
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleQuickAction = (action: string) => {
    if (action === 'tour') {
      handleOpenChange(false)
      startTour()
    } else if (action === 'support') {
      setShowSupportForm(true)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Help Center
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search help articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Quick Links */}
          {!searchQuery && (
            <div className="grid grid-cols-3 gap-3">
              {quickLinks.map((link) => (
                <Card
                  key={link.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => {
                    if (link.action) {
                      handleQuickAction(link.action)
                    } else if (link.link && link.isExternal) {
                      window.open(link.link, '_blank')
                    }
                  }}
                >
                  <CardContent className="p-4 text-center">
                    <link.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium">{link.title}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Articles */}
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {filteredArticles.map((article) => (
                <a
                  key={article.id}
                  href={article.link}
                  target={article.isExternal ? '_blank' : undefined}
                  rel={article.isExternal ? 'noopener noreferrer' : undefined}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors group"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <article.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{article.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {article.description}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </a>
              ))}
              {filteredArticles.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No articles found for "{searchQuery}"</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Can't find what you're looking for?
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowSupportForm(true)}>
              <Ticket className="h-4 w-4 mr-1" />
              Submit a Ticket
            </Button>
          </div>
        </div>

        {/* Support Form Dialog */}
        {showSupportForm && (
          <SupportTicketForm
            open={showSupportForm}
            onOpenChange={setShowSupportForm}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface SupportTicketFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SupportTicketForm({ open, onOpenChange }: SupportTicketFormProps) {
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // In a real app, this would submit to a support API
    setSubmitted(true)
    setTimeout(() => {
      onOpenChange(false)
      setSubmitted(false)
      setSubject('')
      setDescription('')
    }, 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Support Ticket</DialogTitle>
        </DialogHeader>
        {submitted ? (
          <div className="text-center py-8">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Ticket className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium">Ticket Submitted!</p>
            <p className="text-sm text-muted-foreground">
              We'll get back to you within 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please provide details about your issue..."
                rows={4}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">Submit Ticket</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// Floating help button component
export function FloatingHelpButton() {
  const { toggleHelpCenter } = useOnboardingStore()

  return (
    <Button
      variant="default"
      size="icon"
      className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg z-50"
      onClick={toggleHelpCenter}
      data-tour="help-button"
      aria-label="Open Help Center"
    >
      <HelpCircle className="h-6 w-6" />
    </Button>
  )
}
