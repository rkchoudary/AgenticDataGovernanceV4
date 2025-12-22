import { useState } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Shield,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Issue } from '@/hooks/useIssues'

interface ResolutionStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  completedBy?: string
  completedAt?: string
}

interface IssueResolutionWorkflowProps {
  issue: Issue
  currentUser: { id: string; name: string; email: string }
  onSubmitResolution: (data: ResolutionData) => void
  onVerifyResolution: (verifierId: string, notes: string) => void
  availableVerifiers: { id: string; name: string; email: string }[]
}

export interface ResolutionData {
  rootCause: string
  resolution: string
  preventiveMeasures: string
  implementedBy: string
}

const initialSteps: ResolutionStep[] = [
  {
    id: 'document',
    title: 'Document Resolution',
    description: 'Provide root cause analysis and resolution details',
    status: 'pending',
  },
  {
    id: 'implement',
    title: 'Implement Fix',
    description: 'Apply the resolution and document changes',
    status: 'pending',
  },
  {
    id: 'verify',
    title: 'Verification (Four-Eyes)',
    description: 'Independent verification by another team member',
    status: 'pending',
  },
]


export function IssueResolutionWorkflow({
  issue,
  currentUser,
  onSubmitResolution,
  onVerifyResolution,
  availableVerifiers,
}: IssueResolutionWorkflowProps) {
  const [steps, setSteps] = useState<ResolutionStep[]>(initialSteps)
  const [currentStep, setCurrentStep] = useState(0)
  const [resolutionData, setResolutionData] = useState<ResolutionData>({
    rootCause: issue.rootCause || '',
    resolution: issue.resolution || '',
    preventiveMeasures: '',
    implementedBy: currentUser.id,
  })
  const [selectedVerifier, setSelectedVerifier] = useState('')
  const [verificationNotes, setVerificationNotes] = useState('')

  // Filter out current user from verifiers (four-eyes principle)
  const eligibleVerifiers = availableVerifiers.filter(
    (v) => v.id !== currentUser.id && v.id !== resolutionData.implementedBy
  )

  const handleDocumentSubmit = () => {
    if (!resolutionData.rootCause.trim() || !resolutionData.resolution.trim()) {
      return
    }

    const updatedSteps = [...steps]
    updatedSteps[0] = {
      ...updatedSteps[0],
      status: 'completed',
      completedBy: currentUser.name,
      completedAt: new Date().toISOString(),
    }
    updatedSteps[1] = { ...updatedSteps[1], status: 'in_progress' }
    setSteps(updatedSteps)
    setCurrentStep(1)
  }

  const handleImplementSubmit = () => {
    const updatedSteps = [...steps]
    updatedSteps[1] = {
      ...updatedSteps[1],
      status: 'completed',
      completedBy: currentUser.name,
      completedAt: new Date().toISOString(),
    }
    updatedSteps[2] = { ...updatedSteps[2], status: 'in_progress' }
    setSteps(updatedSteps)
    setCurrentStep(2)
    onSubmitResolution(resolutionData)
  }

  const handleVerificationSubmit = () => {
    if (!selectedVerifier || !verificationNotes.trim()) {
      return
    }

    const updatedSteps = [...steps]
    const verifier = availableVerifiers.find((v) => v.id === selectedVerifier)
    updatedSteps[2] = {
      ...updatedSteps[2],
      status: 'completed',
      completedBy: verifier?.name,
      completedAt: new Date().toISOString(),
    }
    setSteps(updatedSteps)
    onVerifyResolution(selectedVerifier, verificationNotes)
  }

  const getStepIcon = (step: ResolutionStep, index: number) => {
    if (step.status === 'completed') {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />
    }
    if (step.status === 'in_progress') {
      return <Clock className="h-5 w-5 text-yellow-500" />
    }
    return (
      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground flex items-center justify-center text-xs">
        {index + 1}
      </div>
    )
  }


  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resolution Workflow</CardTitle>
          <CardDescription>
            Complete all steps to resolve this issue with proper documentation and verification
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg flex-1',
                    step.status === 'in_progress' && 'bg-yellow-50 border border-yellow-200',
                    step.status === 'completed' && 'bg-green-50 border border-green-200',
                    step.status === 'pending' && 'bg-muted'
                  )}
                >
                  {getStepIcon(step, index)}
                  <div>
                    <p className="font-medium text-sm">{step.title}</p>
                    {step.completedBy && (
                      <p className="text-xs text-muted-foreground">
                        by {step.completedBy}
                      </p>
                    )}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Document Resolution */}
      {currentStep === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Resolution
            </CardTitle>
            <CardDescription>
              Provide detailed root cause analysis and resolution documentation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Root Cause Analysis <span className="text-destructive">*</span>
              </label>
              <textarea
                value={resolutionData.rootCause}
                onChange={(e) =>
                  setResolutionData({ ...resolutionData, rootCause: e.target.value })
                }
                placeholder="Describe the root cause of this issue..."
                className="w-full p-3 border rounded-md bg-background resize-none min-h-[100px]"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Resolution Details <span className="text-destructive">*</span>
              </label>
              <textarea
                value={resolutionData.resolution}
                onChange={(e) =>
                  setResolutionData({ ...resolutionData, resolution: e.target.value })
                }
                placeholder="Describe how the issue was resolved..."
                className="w-full p-3 border rounded-md bg-background resize-none min-h-[100px]"
                rows={4}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Preventive Measures
              </label>
              <textarea
                value={resolutionData.preventiveMeasures}
                onChange={(e) =>
                  setResolutionData({ ...resolutionData, preventiveMeasures: e.target.value })
                }
                placeholder="What measures will prevent this issue from recurring?"
                className="w-full p-3 border rounded-md bg-background resize-none min-h-[80px]"
                rows={3}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleDocumentSubmit}
                disabled={!resolutionData.rootCause.trim() || !resolutionData.resolution.trim()}
              >
                Continue to Implementation
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Step 2: Implement Fix */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Confirm Implementation
            </CardTitle>
            <CardDescription>
              Confirm that the resolution has been implemented
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Root Cause</p>
                <p className="mt-1">{resolutionData.rootCause}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Resolution</p>
                <p className="mt-1">{resolutionData.resolution}</p>
              </div>
              {resolutionData.preventiveMeasures && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Preventive Measures</p>
                  <p className="mt-1">{resolutionData.preventiveMeasures}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                By confirming, you certify that the resolution has been implemented as documented.
              </p>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setCurrentStep(0)}>
                Back to Documentation
              </Button>
              <Button onClick={handleImplementSubmit}>
                Confirm Implementation
                <CheckCircle2 className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Verification (Four-Eyes) */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Four-Eyes Verification
            </CardTitle>
            <CardDescription>
              An independent team member must verify the resolution (cannot be the implementer)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">Four-Eyes Principle</p>
                  <p className="text-sm text-blue-700 mt-1">
                    The verifier must be different from the person who implemented the fix.
                    This ensures independent review and reduces the risk of errors.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Verifier <span className="text-destructive">*</span>
              </label>
              <Select value={selectedVerifier} onValueChange={setSelectedVerifier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team member to verify" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleVerifiers.map((verifier) => (
                    <SelectItem key={verifier.id} value={verifier.id}>
                      {verifier.name} ({verifier.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eligibleVerifiers.length === 0 && (
                <p className="text-sm text-destructive mt-1">
                  No eligible verifiers available. The verifier must be different from the implementer.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Verification Notes <span className="text-destructive">*</span>
              </label>
              <textarea
                value={verificationNotes}
                onChange={(e) => setVerificationNotes(e.target.value)}
                placeholder="Document verification findings and confirmation..."
                className="w-full p-3 border rounded-md bg-background resize-none min-h-[100px]"
                rows={4}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleVerificationSubmit}
                disabled={!selectedVerifier || !verificationNotes.trim()}
              >
                Complete Verification
                <CheckCircle2 className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Completion */}
      {steps.every((s) => s.status === 'completed') && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
              <div>
                <h3 className="text-lg font-semibold text-green-800">
                  Issue Resolution Complete
                </h3>
                <p className="text-green-700">
                  This issue has been resolved and verified following the four-eyes principle.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default IssueResolutionWorkflow
