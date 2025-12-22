/**
 * PhaseContainer Component
 * 
 * Container for displaying the current phase content with step list,
 * step content area, and navigation actions.
 * 
 * Requirements: 1.1, 2.1
 */

import { useState } from 'react'
import { ChevronRight, Check, Circle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState, StepState, PHASE_CONFIG, getNextPhase } from '@/types/workflow-wizard'
import { RegulatoryIntelligencePhase } from './phases/regulatory-intelligence'
import { DataRequirementsPhase } from './phases/data-requirements'
import { CDEIdentificationPhase } from './phases/cde-identification'
import { DataQualityRulesPhase } from './phases/data-quality-rules'
import { LineageMappingPhase } from './phases/lineage-mapping'
import { IssueManagementPhase } from './phases/issue-management'
import { ControlsManagementPhase } from './phases/controls-management'
import { DocumentationPhase } from './phases/documentation'
import { AttestationPhase } from './phases/attestation'
import { cn } from '@/lib/utils'

interface PhaseContainerProps {
  phase: PhaseState
}

export function PhaseContainer({ phase }: PhaseContainerProps) {
  const {
    currentStep,
    setCurrentStep,
    completeStep,
    completePhase,
    navigateToNextPhase,
  } = useWorkflowWizardStore()

  const [showValidationModal, setShowValidationModal] = useState(false)
  const [incompleteItems, setIncompleteItems] = useState<StepState[]>([])

  const currentStepData = phase.steps[currentStep]
  const nextPhase = getNextPhase(phase.id)
  const nextPhaseConfig = nextPhase ? PHASE_CONFIG[nextPhase] : null

  const handleStepClick = (index: number) => {
    // Can only navigate to completed steps or current step
    const step = phase.steps[index]
    if (step.status === 'completed' || index === currentStep || index === currentStep + 1) {
      setCurrentStep(index)
    }
  }

  const handleCompleteStep = () => {
    if (currentStepData) {
      completeStep(currentStepData.id)
      // Auto-advance to next step if not last
      if (currentStep < phase.steps.length - 1) {
        setCurrentStep(currentStep + 1)
      }
    }
  }

  const handleContinueToNextPhase = () => {
    // Check if all required steps are completed
    const incomplete = phase.steps.filter(
      s => s.isRequired && s.status !== 'completed'
    )

    if (incomplete.length > 0) {
      setIncompleteItems(incomplete)
      setShowValidationModal(true)
      return
    }

    // Check for validation errors
    const hasErrors = phase.steps.some(s => s.validationErrors.length > 0)
    if (hasErrors) {
      const stepsWithErrors = phase.steps.filter(s => s.validationErrors.length > 0)
      setIncompleteItems(stepsWithErrors)
      setShowValidationModal(true)
      return
    }

    // Complete phase and navigate
    const success = completePhase()
    if (success) {
      navigateToNextPhase()
    }
  }

  const handleGoToIncompleteItem = (stepId: string) => {
    const index = phase.steps.findIndex(s => s.id === stepId)
    if (index !== -1) {
      setCurrentStep(index)
      setShowValidationModal(false)
    }
  }

  const allStepsCompleted = phase.steps.every(s => s.status === 'completed')
  const isLastPhase = !nextPhase

  // Render phase-specific content
  const renderPhaseContent = () => {
    switch (phase.id) {
      case 'regulatory_intelligence':
        return <RegulatoryIntelligencePhase phase={phase} />
      
      case 'data_requirements':
        return <DataRequirementsPhase phase={phase} />
      
      case 'cde_identification':
        return <CDEIdentificationPhase phase={phase} />
      
      case 'data_quality_rules':
        return <DataQualityRulesPhase phase={phase} />
      
      case 'lineage_mapping':
        return <LineageMappingPhase phase={phase} />
      
      case 'issue_management':
        return <IssueManagementPhase phase={phase} />
      
      case 'controls_management':
        return <ControlsManagementPhase phase={phase} />
      
      case 'documentation':
        return <DocumentationPhase phase={phase} />
      
      case 'attestation':
        return <AttestationPhase phase={phase} />
      
      default:
        return (
          <>
            {/* Step List */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Steps</CardTitle>
                <CardDescription>
                  Complete each step to proceed to the next phase
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {phase.steps.map((step, index) => (
                    <StepListItem
                      key={step.id}
                      step={step}
                      index={index}
                      isActive={index === currentStep}
                      onClick={() => handleStepClick(index)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Current Step Content */}
            {currentStepData && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{currentStepData.name}</CardTitle>
                      <CardDescription>
                        Step {currentStep + 1} of {phase.steps.length}
                      </CardDescription>
                    </div>
                    {currentStepData.status === 'completed' && (
                      <span className="flex items-center gap-1 text-sm text-primary">
                        <Check className="h-4 w-4" />
                        Completed
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Step content will be rendered by phase-specific components */}
                  <div className="min-h-[200px] flex items-center justify-center text-muted-foreground border-2 border-dashed rounded-lg">
                    <p>Step content for "{currentStepData.name}" will be rendered here</p>
                  </div>

                  {/* Validation Errors */}
                  {currentStepData.validationErrors.length > 0 && (
                    <div className="mt-4 p-3 bg-destructive/10 rounded-lg">
                      <div className="flex items-center gap-2 text-destructive font-medium mb-2">
                        <AlertCircle className="h-4 w-4" />
                        Validation Errors
                      </div>
                      <ul className="list-disc list-inside text-sm text-destructive space-y-1">
                        {currentStepData.validationErrors.map((error, i) => (
                          <li key={i}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Step Actions */}
                  <div className="flex justify-end gap-2 mt-6">
                    {currentStepData.status !== 'completed' && (
                      <Button onClick={handleCompleteStep}>
                        Complete Step
                        <Check className="h-4 w-4 ml-2" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Phase Navigation */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {allStepsCompleted ? (
                  <span className="text-primary font-medium">
                    ✓ All steps completed
                  </span>
                ) : (
                  <span>
                    {phase.steps.filter(s => s.status === 'completed').length} of{' '}
                    {phase.steps.length} steps completed
                  </span>
                )}
              </div>

              {!isLastPhase && (
                <Button
                  onClick={handleContinueToNextPhase}
                  disabled={phase.status === 'blocked'}
                  className="gap-2"
                >
                  Continue to {nextPhaseConfig?.name}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}

              {isLastPhase && allStepsCompleted && (
                <Button onClick={() => completePhase()} className="gap-2">
                  Complete Workflow
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Phase Header */}
      <div>
        <h2 className="text-2xl font-bold">{phase.name}</h2>
        <p className="text-muted-foreground mt-1">{phase.description}</p>
      </div>

      {/* Phase Content */}
      {renderPhaseContent()}

      {/* Validation Modal */}
      <ValidationModal
        open={showValidationModal}
        onOpenChange={setShowValidationModal}
        incompleteItems={incompleteItems}
        onGoToItem={handleGoToIncompleteItem}
      />
    </div>
  )
}

/**
 * Step List Item Component
 */
interface StepListItemProps {
  step: StepState
  index: number
  isActive: boolean
  onClick: () => void
}

function StepListItem({ step, index, isActive, onClick }: StepListItemProps) {
  const isClickable = step.status === 'completed' || isActive

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors',
        isActive && 'bg-primary/10 border border-primary/20',
        !isActive && step.status === 'completed' && 'hover:bg-muted/50',
        !isClickable && 'opacity-50 cursor-not-allowed'
      )}
    >
      {/* Status Icon */}
      <div
        className={cn(
          'flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium',
          step.status === 'completed' && 'bg-primary text-primary-foreground',
          step.status === 'in_progress' && 'bg-primary/20 text-primary border border-primary',
          step.status === 'pending' && 'bg-muted text-muted-foreground',
          step.status === 'skipped' && 'bg-muted text-muted-foreground line-through'
        )}
      >
        {step.status === 'completed' ? (
          <Check className="h-3 w-3" />
        ) : (
          index + 1
        )}
      </div>

      {/* Step Info */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'font-medium truncate',
            step.status === 'completed' && 'text-primary',
            step.status === 'skipped' && 'line-through text-muted-foreground'
          )}
        >
          {step.name}
        </p>
        {step.validationErrors.length > 0 && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
            <AlertCircle className="h-3 w-3" />
            {step.validationErrors.length} error(s)
          </p>
        )}
      </div>

      {/* Required Badge */}
      {step.isRequired && step.status !== 'completed' && (
        <span className="text-xs text-muted-foreground">Required</span>
      )}
    </button>
  )
}

/**
 * Validation Modal Component
 * Requirements: 2.3
 */
interface ValidationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  incompleteItems: StepState[]
  onGoToItem: (stepId: string) => void
}

function ValidationModal({
  open,
  onOpenChange,
  incompleteItems,
  onGoToItem,
}: ValidationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Cannot Proceed
          </DialogTitle>
          <DialogDescription>
            Please complete the following items before continuing to the next phase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[300px] overflow-auto">
          {incompleteItems.map(item => (
            <button
              key={item.id}
              onClick={() => onGoToItem(item.id)}
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 text-left"
            >
              <Circle className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <p className="font-medium">{item.name}</p>
                {item.validationErrors.length > 0 && (
                  <p className="text-xs text-destructive">
                    {item.validationErrors[0]}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
