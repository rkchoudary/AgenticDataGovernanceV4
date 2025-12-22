import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IssueAnalytics } from '@/components/issues'
import { useIssues } from '@/hooks/useIssues'

export function IssueAnalyticsPage() {
  const navigate = useNavigate()
  const { data: issuesData, isLoading } = useIssues()

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading analytics...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/issues')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Issue Analytics</h1>
          <p className="text-muted-foreground">
            Insights and trends from your issue data
          </p>
        </div>
      </div>

      {/* Analytics */}
      <IssueAnalytics issues={issuesData?.items || []} />
    </div>
  )
}

export default IssueAnalyticsPage
