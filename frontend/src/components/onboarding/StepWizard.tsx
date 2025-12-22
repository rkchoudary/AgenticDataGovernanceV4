import { useState, ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface WizardStep {
  id: string
  title: string
  description?: string
  content: ReactNode
  validation?: () => boolean | Promise<boolean>
  optional?: boolean
}

interface StepWizardProps {
  title: string
  description?: string
  steps: WizardStep[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: (data: Record<string, unknown>) => void
  initialData?: Record<string, unknown>
  className?: string
}

export function StepWizard({
  title,
  description,
  steps,
  open,
  onOpenChange,
  onComplete,
  initialData = {},
  className,
}: StepWizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [wizardData, setWizardData] = useState<Record<string, unknown>>(initialData)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)

  const step = steps[currentStep]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === steps.length - 1
  const progress = ((currentStep + 1) / steps.length) * 100

  const handleNext = async () => {
    setValidationError(null)
    
    if (step.validation) {
      setIsValidating(true)
      try {
        const isValid = await step.validation()
        if (!isValid) {
          setValidationError('Please complete all required fields before continuing.')
          setIsValidating(false)
          return
        }
      } catch (error) {
        setValidationError('Validation failed. Please try again.')
        setIsValidating(false)
        return
      }
      setIsValidating(false)
    }

    if (isLastStep) {
      onComplete(wizardData)
      onOpenChange(false)
      setCurrentStep(0)
      setWizardData(initialData)
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handleBack = () => {
    setValidationError(null)
    setCurrentStep(prev => Math.max(0, prev - 1))
  }

  const handleSkip = () => {
    if (step.optional) {
      setValidationError(null)
      if (isLastStep) {
        onComplete(wizardData)
        onOpenChange(false)
        setCurrentStep(0)
        setWizardData(initialData)
      } else {
        setCurrentStep(prev => prev + 1)
      }
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setCurrentStep(0)
    setWizardData(initialData)
    setValidationError(null)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn('sm:max-w-2xl', className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <span className="font-medium">{Math.round(progress)}% complete</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex items-center justify-center gap-2 py-2">
          {steps.map((s, index) => (
            <div
              key={s.id}
              className={cn(
                'flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium transition-colors',
                index < currentStep
                  ? 'bg-primary text-primary-foreground'
                  : index === currentStep
                  ? 'bg-primary/20 text-primary border-2 border-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {index < currentStep ? (
                <Check className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="border-0 shadow-none">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-lg">{step.title}</CardTitle>
            {step.description && (
              <CardDescription>{step.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="px-0">
            {step.content}
            {validationError && (
              <div className="flex items-center gap-2 mt-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {validationError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={isFirstStep}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {step.optional && (
              <Button variant="ghost" onClick={handleSkip}>
                Skip
              </Button>
            )}
            <Button onClick={handleNext} disabled={isValidating}>
              {isValidating ? (
                'Validating...'
              ) : isLastStep ? (
                'Complete'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Context for wizard data sharing
import { createContext, useContext } from 'react'

interface WizardContextValue {
  data: Record<string, unknown>
  updateData: (data: Record<string, unknown>) => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

export function useWizardContext() {
  const context = useContext(WizardContext)
  if (!context) {
    throw new Error('useWizardContext must be used within a StepWizard')
  }
  return context
}

export function WizardProvider({
  children,
  data,
  updateData,
}: {
  children: ReactNode
  data: Record<string, unknown>
  updateData: (data: Record<string, unknown>) => void
}) {
  return (
    <WizardContext.Provider value={{ data, updateData }}>
      {children}
    </WizardContext.Provider>
  )
}
