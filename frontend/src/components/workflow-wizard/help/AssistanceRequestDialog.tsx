/**
 * AssistanceRequestDialog Component
 * 
 * Creates a support ticket with context from the current workflow state.
 * Allows users to request help when stuck on a step.
 * 
 * Requirement: 14.5
 */

import { useState } from 'react'
import {
  MessageSquare,
  Send,
  Paperclip,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Phase } from '@/types/workflow-wizard'
import {
  AssistanceRequest,
  AssistanceRequestContext,
  AssistanceRequestResult,
} from './types'

interface AssistanceRequestDialogProps {
  isOpen: boolean
  onClose: () => void
  cycleId: string
  reportName: string
  currentPhase: Phase
  currentStepId: string
  currentStepName: string
  stepData?: Record<string, unknown>
  validationErrors?: string[]
}

export function AssistanceRequestDialog({
  isOpen,
  onClose,
  cycleId,
  reportName,
  currentPhase,
  currentStepId,
  currentStepName,
  stepData = {},
  validationErrors = [],
}: AssistanceRequestDialogProps) {
  const [type, setType] = useState<AssistanceRequest['type']>('question')
  const [priority, setPriority] = useState<AssistanceRequest['priority']>('medium')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<AssistanceRequestResult | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments([...attachments, ...Array.from(e.target.files)])
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) return

    setIsSubmitting(true)

    // Build context
    const context: AssistanceRequestContext = {
      cycleId,
      reportName,
      currentPhase,
      currentStep: currentStepId,
      stepData,
      validationErrors,
      browserInfo: navigator.userAgent,
      timestamp: new Date().toISOString(),
    }

    const request: AssistanceRequest = {
      type,
      priority,
      subject: subject.trim(),
      description: description.trim(),
      context,
      attachments,
    }

    try {
      // Simulate API call - in production, this would call the support API
      const response = await submitAssistanceRequest(request)
      setResult(response)
    } catch (error) {
      setResult({
        success: false,
        message: 'Failed to submit request. Please try again.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    // Reset form
    setType('question')
    setPriority('medium')
    setSubject('')
    setDescription('')
    setAttachments([])
    setResult(null)
    onClose()
  }

  // Show success/error result
  if (result) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Request Submitted
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Submission Failed
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <p className="text-sm text-muted-foreground">{result.message}</p>
            {result.ticketId && (
              <p className="mt-2 text-sm">
                <span className="text-muted-foreground">Ticket ID: </span>
                <code className="px-1.5 py-0.5 bg-muted rounded font-mono">
                  {result.ticketId}
                </code>
              </p>
            )}
            {result.estimatedResponseTime && (
              <p className="mt-2 text-sm text-muted-foreground">
                Expected response: {result.estimatedResponseTime}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Request Assistance
          </DialogTitle>
          <DialogDescription>
            Submit a support request and our team will help you resolve your issue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Context Info */}
          <div className="p-3 bg-muted/50 rounded-lg text-sm">
            <p className="font-medium mb-1">Current Context</p>
            <p className="text-muted-foreground">
              {reportName} • {currentStepName}
            </p>
            {validationErrors.length > 0 && (
              <p className="text-destructive text-xs mt-1">
                {validationErrors.length} validation error(s) detected
              </p>
            )}
          </div>

          {/* Request Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Request Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="issue">Issue/Bug</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Brief summary of your request"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe your issue or question in detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <Label>Attachments (optional)</Label>
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-sm"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept="image/*,.pdf,.doc,.docx,.txt"
                />
                <span className="flex items-center gap-1 px-2 py-1 border border-dashed rounded text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors">
                  <Paperclip className="h-3 w-3" />
                  Add file
                </span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!subject.trim() || !description.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit Request
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Submit assistance request to the support API
 * In production, this would call the actual support API
 */
async function submitAssistanceRequest(
  request: AssistanceRequest
): Promise<AssistanceRequestResult> {
  // Simulate API call
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Generate a mock ticket ID
  const ticketId = `SUP-${Date.now().toString(36).toUpperCase()}`

  // Determine estimated response time based on priority
  const responseTime =
    request.priority === 'high'
      ? '2-4 hours'
      : request.priority === 'medium'
      ? '1 business day'
      : '2-3 business days'

  return {
    success: true,
    ticketId,
    message: `Your support request has been submitted successfully. Our team will review it and respond within ${responseTime}.`,
    estimatedResponseTime: responseTime,
  }
}

export default AssistanceRequestDialog
