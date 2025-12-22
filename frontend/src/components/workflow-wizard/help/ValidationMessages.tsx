/**
 * ValidationMessages Component
 * 
 * Displays inline validation messages with correction guidance.
 * Provides clear feedback for form validation errors.
 * 
 * Requirement: 14.4
 */

import { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Info, ExternalLink, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ValidationMessage, ValidationState } from './types'

// ============================================================================
// Single Validation Message Component
// ============================================================================

interface ValidationMessageItemProps {
  message: ValidationMessage
  className?: string
}

export function ValidationMessageItem({
  message,
  className,
}: ValidationMessageItemProps) {
  const getIcon = (): ReactNode => {
    switch (message.type) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
      case 'info':
        return <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
      default:
        return <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
    }
  }

  const getBgColor = (): string => {
    switch (message.type) {
      case 'error':
        return 'bg-destructive/10 border-destructive/20'
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/20'
      case 'info':
        return 'bg-blue-500/10 border-blue-500/20'
      default:
        return 'bg-destructive/10 border-destructive/20'
    }
  }

  const getTextColor = (): string => {
    switch (message.type) {
      case 'error':
        return 'text-destructive'
      case 'warning':
        return 'text-amber-700 dark:text-amber-400'
      case 'info':
        return 'text-blue-700 dark:text-blue-400'
      default:
        return 'text-destructive'
    }
  }

  return (
    <div
      className={cn(
        'rounded-md border p-3',
        getBgColor(),
        className
      )}
      role={message.type === 'error' ? 'alert' : 'status'}
    >
      <div className="flex gap-2">
        {getIcon()}
        <div className="flex-1 space-y-1">
          {/* Main Message */}
          <p className={cn('text-sm font-medium', getTextColor())}>
            {message.message}
          </p>

          {/* Correction Guidance */}
          {message.correctionGuidance && (
            <p className="text-xs text-muted-foreground">
              💡 {message.correctionGuidance}
            </p>
          )}

          {/* Suggested Value */}
          {message.suggestedValue && (
            <p className="text-xs">
              <span className="text-muted-foreground">Suggested: </span>
              <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">
                {message.suggestedValue}
              </code>
            </p>
          )}

          {/* Documentation Link */}
          {message.documentationLink && (
            <a
              href={message.documentationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Learn more
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Inline Field Error Component
// ============================================================================

interface InlineFieldErrorProps {
  message: string
  correctionGuidance?: string
  className?: string
}

export function InlineFieldError({
  message,
  correctionGuidance,
  className,
}: InlineFieldErrorProps) {
  return (
    <div className={cn('mt-1.5 space-y-0.5', className)}>
      <p className="text-sm text-destructive flex items-center gap-1">
        <AlertCircle className="h-3.5 w-3.5" />
        {message}
      </p>
      {correctionGuidance && (
        <p className="text-xs text-muted-foreground pl-4">
          💡 {correctionGuidance}
        </p>
      )}
    </div>
  )
}

// ============================================================================
// Validation Summary Component
// ============================================================================

interface ValidationSummaryProps {
  state: ValidationState
  title?: string
  showSuccessMessage?: boolean
  className?: string
}

export function ValidationSummary({
  state,
  title = 'Validation Issues',
  showSuccessMessage = false,
  className,
}: ValidationSummaryProps) {
  const errors = state.messages.filter((m) => m.type === 'error')
  const warnings = state.messages.filter((m) => m.type === 'warning')

  if (state.isValid && !showSuccessMessage) {
    return null
  }

  if (state.isValid && showSuccessMessage) {
    return (
      <div
        className={cn(
          'rounded-md border p-3 bg-green-500/10 border-green-500/20',
          className
        )}
      >
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            All validations passed
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Summary Header */}
      <div className="flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <h4 className="font-medium">{title}</h4>
        <span className="text-sm text-muted-foreground">
          ({errors.length} error{errors.length !== 1 ? 's' : ''}
          {warnings.length > 0 && `, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`})
        </span>
      </div>

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((message) => (
            <ValidationMessageItem key={message.id} message={message} />
          ))}
        </div>
      )}

      {/* Warning Messages */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          {warnings.map((message) => (
            <ValidationMessageItem key={message.id} message={message} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Field Validation Wrapper Component
// ============================================================================

interface FieldValidationWrapperProps {
  children: ReactNode
  fieldId: string
  validationState: ValidationState
  showOnTouched?: boolean
  className?: string
}

export function FieldValidationWrapper({
  children,
  fieldId,
  validationState,
  showOnTouched = true,
  className,
}: FieldValidationWrapperProps) {
  const fieldMessages = validationState.messages.filter(
    (m) => m.field === fieldId
  )
  const isTouched = validationState.touchedFields.has(fieldId)
  const shouldShow = !showOnTouched || isTouched

  const hasError = fieldMessages.some((m) => m.type === 'error')

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className={cn(
          hasError && shouldShow && 'ring-2 ring-destructive/20 rounded-md'
        )}
      >
        {children}
      </div>
      {shouldShow &&
        fieldMessages.map((message) => (
          <InlineFieldError
            key={message.id}
            message={message.message}
            correctionGuidance={message.correctionGuidance}
          />
        ))}
    </div>
  )
}

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Create a validation message
 */
export function createValidationMessage(
  field: string,
  message: string,
  options?: Partial<Omit<ValidationMessage, 'id' | 'field' | 'message'>>
): ValidationMessage {
  return {
    id: `${field}-${Date.now()}`,
    field,
    message,
    type: options?.type || 'error',
    correctionGuidance: options?.correctionGuidance,
    suggestedValue: options?.suggestedValue,
    documentationLink: options?.documentationLink,
  }
}

/**
 * Create an empty validation state
 */
export function createEmptyValidationState(): ValidationState {
  return {
    isValid: true,
    messages: [],
    touchedFields: new Set(),
  }
}

/**
 * Add a message to validation state
 */
export function addValidationMessage(
  state: ValidationState,
  message: ValidationMessage
): ValidationState {
  return {
    ...state,
    isValid: message.type === 'error' ? false : state.isValid,
    messages: [...state.messages, message],
  }
}

/**
 * Mark a field as touched
 */
export function touchField(
  state: ValidationState,
  fieldId: string
): ValidationState {
  const newTouched = new Set(state.touchedFields)
  newTouched.add(fieldId)
  return {
    ...state,
    touchedFields: newTouched,
  }
}

/**
 * Clear messages for a specific field
 */
export function clearFieldMessages(
  state: ValidationState,
  fieldId: string
): ValidationState {
  const filteredMessages = state.messages.filter((m) => m.field !== fieldId)
  return {
    ...state,
    messages: filteredMessages,
    isValid: !filteredMessages.some((m) => m.type === 'error'),
  }
}

export default ValidationMessageItem
