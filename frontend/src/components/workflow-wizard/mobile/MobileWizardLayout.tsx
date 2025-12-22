/**
 * MobileWizardLayout Component
 * 
 * Single-column layout optimized for touch interactions on mobile devices.
 * Provides a simplified, focused experience for completing workflow steps.
 * 
 * Requirements: 15.1, 15.5
 */

import { useState, useEffect } from 'react'
import { X, HelpCircle, Menu, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { ProgressStepper } from '../ProgressStepper'
import { PhaseContainer } from '../PhaseContainer'
import { ContextSidebar } from '../ContextSidebar'
import { ActiveUserIndicators } from '../ActiveUserIndicators'
import { ContextualHelpPanel, AssistanceRequestDialog } from '../help'
import { OfflineStatusBanner, OfflineIndicator } from './OfflineQueue'
import { Phase, PhaseState, ActiveUser, PHASE_CONFIG } from '@/types/workflow-wizard'
import { cn } from '@/lib/utils'

export interface MobileWizardLayoutProps {
  cycleId: string
  reportId: string
  reportName: string
  cycleDeadline: string
  overallProgress: number
  currentPhase: Phase
  currentStep: number
  phases: PhaseState[]
  activeUsers: ActiveUser[]
  currentUserId: string
  onPhaseClick: (phase: Phase) => void
  onClose: () => void
  onHelp: () => void
}

export function MobileWizardLayout({
  cycleId,
  reportName,
  cycleDeadline,
  overallProgress,
  currentPhase,
  currentStep,
  phases,
  activeUsers,
  currentUserId,
  onPhaseClick,
  onClose,
}: MobileWizardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false)
  const [isAssistanceDialogOpen, setIsAssistanceDialogOpen] = useState(false)
  
  const { getCurrentPhaseState } = useWorkflowWizardStore()
  const currentPhaseState = getCurrentPhaseState()
  const phaseConfig = PHASE_CONFIG[currentPhase]

  // Close sidebar when phase changes
  useEffect(() => {
    setIsSidebarOpen(false)
  }, [currentPhase])

  const handleRequestAssistance = () => {
    setIsHelpPanelOpen(false)
    setIsAssistanceDialogOpen(true)
  }

  // Get current phase index for navigation
  const currentPhaseIndex = phases.findIndex(p => p.id === currentPhase)
  const canGoBack = currentPhaseIndex > 0
  const canGoForward = currentPhaseIndex < phases.length - 1 && 
    phases[currentPhaseIndex]?.status === 'completed'

  const handlePreviousPhase = () => {
    if (canGoBack) {
      onPhaseClick(phases[currentPhaseIndex - 1].id)
    }
  }

  const handleNextPhase = () => {
    if (canGoForward) {
      onPhaseClick(phases[currentPhaseIndex + 1].id)
    }
  }

  return (
    <div className="fixed inset-0 bg-background flex flex-col overflow-hidden">
      {/* Offline Status Banner - Shows when offline or has pending actions */}
      <OfflineStatusBanner className="flex-shrink-0 safe-area-inset-top" />

      {/* Mobile Header */}
      <header className="flex-shrink-0 border-b bg-card">
        <div className="flex items-center justify-between px-3 py-2">
          {/* Left: Close button */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="touch-manipulation h-10 w-10"
          >
            <X className="h-5 w-5" />
          </Button>

          {/* Center: Phase info */}
          <div className="flex-1 text-center px-2">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-sm font-semibold truncate">
                {phaseConfig.name}
              </h1>
              <OfflineIndicator />
            </div>
            <p className="text-xs text-muted-foreground">
              Step {currentStep + 1} of {currentPhaseState?.steps.length || 0}
            </p>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsHelpPanelOpen(true)}
              className="touch-manipulation h-10 w-10"
            >
              <HelpCircle className="h-5 w-5" />
            </Button>
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="touch-manipulation h-10 w-10"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[320px] p-0">
                <ContextSidebar
                  reportName={reportName}
                  cycleDeadline={cycleDeadline}
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
                  currentUserId={currentUserId}
                />
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{overallProgress}%</span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Mobile Progress Stepper */}
        <div className="px-3 pb-3">
          <ProgressStepper
            phases={phases}
            currentPhase={currentPhase}
            onPhaseClick={onPhaseClick}
            isMobile={true}
          />
        </div>
      </header>

      {/* Active Users (if any) */}
      {activeUsers.length > 1 && (
        <div className="flex-shrink-0 px-3 py-2 border-b bg-muted/30">
          <ActiveUserIndicators
            activeUsers={activeUsers}
            currentUserId={currentUserId}
            variant="inline"
            maxDisplay={3}
          />
        </div>
      )}

      {/* Main Content Area - Scrollable */}
      <main className="flex-1 overflow-auto overscroll-contain">
        <div className="p-4 pb-24">
          {currentPhaseState && (
            <PhaseContainer phase={currentPhaseState} />
          )}
        </div>
      </main>

      {/* Bottom Navigation Bar */}
      <MobileBottomNavigation
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onPrevious={handlePreviousPhase}
        onNext={handleNextPhase}
        currentPhaseIndex={currentPhaseIndex}
        totalPhases={phases.length}
      />

      {/* Help Panel */}
      <ContextualHelpPanel
        isOpen={isHelpPanelOpen}
        onClose={() => setIsHelpPanelOpen(false)}
        currentPhase={currentPhase}
        currentStepId={currentPhaseState?.steps[currentStep]?.id || ''}
        onRequestAssistance={handleRequestAssistance}
      />

      {/* Assistance Dialog */}
      <AssistanceRequestDialog
        isOpen={isAssistanceDialogOpen}
        onClose={() => setIsAssistanceDialogOpen(false)}
        cycleId={cycleId}
        reportName={reportName}
        currentPhase={currentPhase}
        currentStepId={currentPhaseState?.steps[currentStep]?.id || ''}
        currentStepName={currentPhaseState?.steps[currentStep]?.name || ''}
        stepData={currentPhaseState?.steps[currentStep]?.data}
        validationErrors={currentPhaseState?.steps[currentStep]?.validationErrors}
      />
    </div>
  )
}

/**
 * Mobile Bottom Navigation Component
 * Provides phase navigation with touch-optimized buttons
 */
interface MobileBottomNavigationProps {
  canGoBack: boolean
  canGoForward: boolean
  onPrevious: () => void
  onNext: () => void
  currentPhaseIndex: number
  totalPhases: number
}

function MobileBottomNavigation({
  canGoBack,
  canGoForward,
  onPrevious,
  onNext,
  currentPhaseIndex,
  totalPhases,
}: MobileBottomNavigationProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t safe-area-inset-bottom">
      <div className="flex items-center justify-between px-4 py-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onPrevious}
          disabled={!canGoBack}
          className={cn(
            'touch-manipulation min-h-[48px] px-4',
            !canGoBack && 'opacity-50'
          )}
        >
          <ChevronLeft className="h-5 w-5 mr-1" />
          Previous
        </Button>

        <div className="text-sm text-muted-foreground">
          Phase {currentPhaseIndex + 1} of {totalPhases}
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={onNext}
          disabled={!canGoForward}
          className={cn(
            'touch-manipulation min-h-[48px] px-4',
            !canGoForward && 'opacity-50'
          )}
        >
          Next
          <ChevronRight className="h-5 w-5 ml-1" />
        </Button>
      </div>
    </div>
  )
}
