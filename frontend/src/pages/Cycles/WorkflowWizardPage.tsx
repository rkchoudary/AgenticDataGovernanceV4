/**
 * WorkflowWizardPage
 * 
 * Page wrapper for the WorkflowWizard component that extracts
 * route parameters and passes them to the wizard.
 * 
 * Requirements: 1.1 - Full-screen wizard interface for regulatory reporting cycle
 */

import { useParams, useSearchParams } from 'react-router-dom'
import { WorkflowWizard } from '@/components/workflow-wizard/WorkflowWizard'
import { Phase } from '@/types/workflow-wizard'

export function WorkflowWizardPage() {
  const { cycleId } = useParams<{ cycleId: string }>()
  const [searchParams] = useSearchParams()
  
  // Get optional initial phase from query params
  const initialPhaseParam = searchParams.get('phase')
  const initialPhase = initialPhaseParam as Phase | undefined
  
  // Get reportId from query params (optional, can be fetched from cycle)
  const reportId = searchParams.get('reportId') || ''

  if (!cycleId) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Invalid Cycle</h2>
          <p className="text-muted-foreground">No cycle ID provided</p>
        </div>
      </div>
    )
  }

  return (
    <WorkflowWizard
      cycleId={cycleId}
      reportId={reportId}
      initialPhase={initialPhase}
    />
  )
}
