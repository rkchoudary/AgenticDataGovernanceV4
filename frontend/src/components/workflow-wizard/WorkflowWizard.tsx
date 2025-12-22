/**
 * WorkflowWizard Shell Component
 * 
 * Full-screen wizard interface that guides users through the 9-phase
 * regulatory reporting cycle. Provides slots for Progress Stepper,
 * Phase Container, and Context Sidebar.
 * 
 * Requirements: 1.1, 1.5, 13.4, 13.5, 14.1, 14.5, 15.1, 15.5
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { useCollaboration } from '@/hooks/useCollaboration'
import { useMobileDetect } from '@/components/mobile/useMobileDetect'
import { ProgressStepper } from './ProgressStepper'
import { PhaseContainer } from './PhaseContainer'
import { ContextSidebar } from './ContextSidebar'
import { ActiveUserIndicators } from './ActiveUserIndicators'
import { ConflictBanner, ConflictResolutionDialog } from './ConflictResolution'
import { ContextualHelpPanel, AssistanceRequestDialog } from './help'
import { MobileWizardLayout, OfflineQueueProvider, OfflineStatusBanner } from './mobile'
import { WorkflowWizardProps } from '@/types/workflow-wizard'
import { ConflictInfo } from '@/services/collaborationService'

export function WorkflowWizard({ cycleId, reportId: _reportId, initialPhase }: WorkflowWizardProps) {
  const navigate = useNavigate()
  const { isMobile } = useMobileDetect()
  const [selectedConflict, setSelectedConflict] = useState<ConflictInfo | null>(null)
  const [isResolvingConflict, setIsResolvingConflict] = useState(false)
  
  // Help system state - Requirements 14.1, 14.5
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false)
  const [isAssistanceDialogOpen, setIsAssistanceDialogOpen] = useState(false)
  
  const {
    currentPhase,
    currentStep,
    phases,
    reportName,
    cycleDeadline,
    overallProgress,
    isLoading,
    error,
    setCurrentPhase,
    navigateToPhase,
    getCurrentPhaseState,
  } = useWorkflowWizardStore()

  // Collaboration hook - Requirements 13.4, 13.5
  const {
    activeUsers,
    conflicts,
    isConnected,
    updatePosition,
    resolveConflict,
    dismissConflict,
  } = useCollaboration({
    cycleId,
    userId: 'current-user', // In production, get from auth context
    enabled: true,
  })

  // Initialize workflow on mount
  useEffect(() => {
    // In a real implementation, this would fetch the cycle data
    // For now, we'll use the store's default state
    if (initialPhase) {
      setCurrentPhase(initialPhase)
    }
  }, [cycleId, initialPhase, setCurrentPhase])

  // Update position when phase changes - Requirement 13.4
  useEffect(() => {
    if (isConnected) {
      updatePosition(currentPhase)
    }
  }, [currentPhase, isConnected, updatePosition])

  const currentPhaseState = getCurrentPhaseState()

  // Default deadline is January 20, 2026 if not set
  const defaultDeadline = useMemo(() => {
    return new Date('2026-01-20T00:00:00.000Z').toISOString()
  }, [])

  const handlePhaseClick = (phase: typeof currentPhase) => {
    navigateToPhase(phase)
  }

  const handleClose = () => {
    navigate('/cycles')
  }

  // Help system handlers - Requirements 14.1, 14.5
  const handleHelp = () => {
    setIsHelpPanelOpen(true)
  }

  const handleCloseHelp = () => {
    setIsHelpPanelOpen(false)
  }

  const handleRequestAssistance = () => {
    setIsHelpPanelOpen(false)
    setIsAssistanceDialogOpen(true)
  }

  const handleCloseAssistance = () => {
    setIsAssistanceDialogOpen(false)
  }

  // Conflict resolution handlers - Requirement 13.5
  const handleViewConflict = (conflict: ConflictInfo) => {
    setSelectedConflict(conflict)
  }

  const handleResolveConflict = async (
    resolution: 'keep_local' | 'keep_remote' | 'merge',
    mergedData?: Record<string, unknown>
  ) => {
    if (!selectedConflict) return
    
    setIsResolvingConflict(true)
    try {
      await resolveConflict(selectedConflict.id, resolution, selectedConflict, mergedData)
      setSelectedConflict(null)
    } finally {
      setIsResolvingConflict(false)
    }
  }

  const handleDismissConflict = () => {
    if (selectedConflict) {
      dismissConflict(selectedConflict.id)
    }
    setSelectedConflict(null)
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading workflow...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-destructive text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold mb-2">Error Loading Workflow</h2>
          <p className="text-muted-foreground mb-4">{error.message}</p>
          <Button onClick={handleClose}>Return to Cycles</Button>
        </div>
      </div>
    )
  }

  // Render mobile layout for mobile devices - Requirement 15.1
  if (isMobile) {
    return (
      <OfflineQueueProvider>
        <div className="fixed inset-0 flex flex-col">
          <OfflineStatusBanner />
          <MobileWizardLayout
            cycleId={cycleId}
            reportId={_reportId}
            reportName={reportName || 'Regulatory Report'}
            cycleDeadline={cycleDeadline || defaultDeadline}
            overallProgress={overallProgress}
            currentPhase={currentPhase}
            currentStep={currentStep}
            phases={phases}
            activeUsers={activeUsers}
            currentUserId="current-user"
            onPhaseClick={handlePhaseClick}
            onClose={handleClose}
            onHelp={handleHelp}
          />
        </div>
      </OfflineQueueProvider>
    )
  }

  // Desktop layout
  return (
    <OfflineQueueProvider>
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Offline Status Banner - Requirement 15.5 */}
      <OfflineStatusBanner />
      
      {/* Header */}
      <header className="flex-shrink-0 border-b bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleClose}>
              <X className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">
                {reportName || 'Regulatory Report Workflow'}
              </h1>
              <p className="text-sm text-muted-foreground">
                Cycle ID: {cycleId}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Active Users Indicator - Requirement 13.4 */}
            {activeUsers.length > 0 && (
              <ActiveUserIndicators
                activeUsers={activeUsers}
                currentUserId="current-user"
                variant="inline"
                maxDisplay={3}
              />
            )}
            <Button variant="ghost" size="icon" onClick={handleHelp}>
              <HelpCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="px-4 pb-4">
          <ProgressStepper
            phases={phases}
            currentPhase={currentPhase}
            onPhaseClick={handlePhaseClick}
          />
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Phase Container (Main Content) */}
        <main className="flex-1 overflow-auto">
          <div className="max-w-4xl mx-auto p-6">
            {/* Conflict Banner - Requirement 13.5 */}
            {conflicts.length > 0 && (
              <ConflictBanner
                conflicts={conflicts}
                onViewConflict={handleViewConflict}
                className="mb-4"
              />
            )}
            
            {currentPhaseState && (
              <PhaseContainer phase={currentPhaseState} />
            )}
          </div>
        </main>

        {/* Context Sidebar */}
        <aside className="hidden lg:block w-80 border-l bg-card overflow-auto">
          <ContextSidebar
            reportName={reportName || 'Regulatory Report'}
            cycleDeadline={cycleDeadline || defaultDeadline}
            overallProgress={overallProgress}
            quickLinks={[]}
            currentPhaseInfo={
              currentPhaseState
                ? {
                    name: currentPhaseState.name,
                    stepsCompleted: currentPhaseState.steps.filter(
                      s => s.status === 'completed'
                    ).length,
                    totalSteps: currentPhaseState.steps.length,
                    estimatedTimeRemaining: currentPhaseState.estimatedMinutes,
                  }
                : {
                    name: '',
                    stepsCompleted: 0,
                    totalSteps: 0,
                    estimatedTimeRemaining: 0,
                  }
            }
            activeUsers={activeUsers}
            currentUserId="current-user"
          />
        </aside>
      </div>

      {/* Conflict Resolution Dialog - Requirement 13.5 */}
      {selectedConflict && (
        <ConflictResolutionDialog
          conflict={selectedConflict}
          onResolve={handleResolveConflict}
          onDismiss={handleDismissConflict}
          isResolving={isResolvingConflict}
        />
      )}

      {/* Contextual Help Panel - Requirement 14.1 */}
      <ContextualHelpPanel
        isOpen={isHelpPanelOpen}
        onClose={handleCloseHelp}
        currentPhase={currentPhase}
        currentStepId={currentPhaseState?.steps[currentStep]?.id || ''}
        onRequestAssistance={handleRequestAssistance}
      />

      {/* Assistance Request Dialog - Requirement 14.5 */}
      <AssistanceRequestDialog
        isOpen={isAssistanceDialogOpen}
        onClose={handleCloseAssistance}
        cycleId={cycleId}
        reportName={reportName || 'Regulatory Report'}
        currentPhase={currentPhase}
        currentStepId={currentPhaseState?.steps[currentStep]?.id || ''}
        currentStepName={currentPhaseState?.steps[currentStep]?.name || ''}
        stepData={currentPhaseState?.steps[currentStep]?.data}
        validationErrors={currentPhaseState?.steps[currentStep]?.validationErrors}
      />
    </div>
    </OfflineQueueProvider>
  )
}
