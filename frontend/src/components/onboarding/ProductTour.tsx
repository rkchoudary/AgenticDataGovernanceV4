import { useEffect, useState, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { cn } from '@/lib/utils'

interface SpotlightPosition {
  top: number
  left: number
  width: number
  height: number
}

interface TooltipPosition {
  top: number
  left: number
}

export function ProductTour() {
  const {
    tourActive,
    currentTourStep,
    tourSteps,
    userRole,
    nextTourStep,
    prevTourStep,
    endTour,
    completeTour,
  } = useOnboardingStore()

  const [spotlightPosition, setSpotlightPosition] = useState<SpotlightPosition | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({ top: 0, left: 0 })

  // Filter steps based on user role
  const filteredSteps = tourSteps.filter(
    step => !step.roles || step.roles.includes(userRole)
  )

  const currentStep = filteredSteps[currentTourStep]

  const calculatePositions = useCallback(() => {
    if (!currentStep) return

    const targetElement = document.querySelector(currentStep.target)
    if (!targetElement) {
      // If target not found, show centered tooltip
      setSpotlightPosition(null)
      setTooltipPosition({
        top: window.innerHeight / 2 - 100,
        left: window.innerWidth / 2 - 200,
      })
      return
    }

    const rect = targetElement.getBoundingClientRect()
    const padding = currentStep.spotlightPadding ?? 8

    // Set spotlight position
    setSpotlightPosition({
      top: rect.top - padding + window.scrollY,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    })

    // Calculate tooltip position based on placement
    const tooltipWidth = 320
    const tooltipHeight = 200
    const gap = 16

    let top = 0
    let left = 0

    switch (currentStep.placement) {
      case 'top':
        top = rect.top - tooltipHeight - gap + window.scrollY
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        break
      case 'bottom':
        top = rect.bottom + gap + window.scrollY
        left = rect.left + rect.width / 2 - tooltipWidth / 2
        break
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2 + window.scrollY
        left = rect.left - tooltipWidth - gap
        break
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2 + window.scrollY
        left = rect.right + gap
        break
      default:
        top = rect.bottom + gap + window.scrollY
        left = rect.left + rect.width / 2 - tooltipWidth / 2
    }

    // Keep tooltip within viewport
    left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16))
    top = Math.max(16, Math.min(top, window.innerHeight - tooltipHeight - 16 + window.scrollY))

    setTooltipPosition({ top, left })
  }, [currentStep])

  useEffect(() => {
    if (!tourActive) return

    calculatePositions()

    // Recalculate on resize
    window.addEventListener('resize', calculatePositions)
    window.addEventListener('scroll', calculatePositions)

    return () => {
      window.removeEventListener('resize', calculatePositions)
      window.removeEventListener('scroll', calculatePositions)
    }
  }, [tourActive, currentTourStep, calculatePositions])

  // Scroll target into view
  useEffect(() => {
    if (!tourActive || !currentStep) return

    const targetElement = document.querySelector(currentStep.target)
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Recalculate after scroll
      setTimeout(calculatePositions, 300)
    }
  }, [tourActive, currentStep, calculatePositions])

  if (!tourActive || !currentStep) return null

  const isFirstStep = currentTourStep === 0
  const isLastStep = currentTourStep === filteredSteps.length - 1

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product Tour">
      {/* Overlay with spotlight cutout */}
      <div className="absolute inset-0 bg-black/60 transition-opacity duration-300">
        {spotlightPosition && (
          <div
            className="absolute bg-transparent rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] transition-all duration-300"
            style={{
              top: spotlightPosition.top,
              left: spotlightPosition.left,
              width: spotlightPosition.width,
              height: spotlightPosition.height,
            }}
          />
        )}
      </div>

      {/* Tooltip */}
      <Card
        className="absolute w-80 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          zIndex: 101,
        }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{currentStep.title}</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={endTour}
              aria-label="Close tour"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-muted-foreground">{currentStep.content}</p>
        </CardContent>
        <CardFooter className="flex items-center justify-between pt-0">
          <div className="flex items-center gap-1">
            {filteredSteps.map((_, index) => (
              <div
                key={index}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  index === currentTourStep ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <Button variant="ghost" size="sm" onClick={prevTourStep}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            {!isLastStep && (
              <Button variant="ghost" size="sm" onClick={completeTour}>
                <SkipForward className="h-4 w-4 mr-1" />
                Skip
              </Button>
            )}
            <Button size="sm" onClick={isLastStep ? completeTour : nextTourStep}>
              {isLastStep ? 'Finish' : 'Next'}
              {!isLastStep && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
