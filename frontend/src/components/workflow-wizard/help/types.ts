/**
 * Help System Types
 * 
 * Type definitions for the workflow wizard help system including
 * contextual help, field tooltips, validation messages, and assistance requests.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { Phase } from '@/types/workflow-wizard'

// ============================================================================
// Help Content Types
// ============================================================================

/**
 * Step help content for contextual help panel
 * Requirements: 14.1, 14.2
 */
export interface StepHelpContent {
  stepId: string
  title: string
  description: string
  requiredActions: string[]
  commonIssues: CommonIssue[]
  videoTutorialUrl?: string
  documentationUrl?: string
  tips?: string[]
}

/**
 * Common issue with resolution guidance
 */
export interface CommonIssue {
  id: string
  title: string
  description: string
  resolution: string
}

/**
 * Phase-level help content
 */
export interface PhaseHelpContent {
  phaseId: Phase
  title: string
  overview: string
  steps: StepHelpContent[]
  faqs: FAQ[]
}

/**
 * FAQ item
 */
export interface FAQ {
  question: string
  answer: string
}

// ============================================================================
// Field Tooltip Types
// ============================================================================

/**
 * Field tooltip configuration
 * Requirement: 14.3
 */
export interface FieldTooltipConfig {
  fieldId: string
  label: string
  description: string
  validationRules?: ValidationRuleInfo[]
  examples?: string[]
  required?: boolean
}

/**
 * Validation rule information for tooltips
 */
export interface ValidationRuleInfo {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'range' | 'custom'
  description: string
  value?: string | number
}

// ============================================================================
// Validation Message Types
// ============================================================================

/**
 * Validation message with correction guidance
 * Requirement: 14.4
 */
export interface ValidationMessage {
  id: string
  field: string
  type: 'error' | 'warning' | 'info'
  message: string
  correctionGuidance?: string
  suggestedValue?: string
  documentationLink?: string
}

/**
 * Validation state for a form or step
 */
export interface ValidationState {
  isValid: boolean
  messages: ValidationMessage[]
  touchedFields: Set<string>
}

// ============================================================================
// Assistance Request Types
// ============================================================================

/**
 * Support ticket context
 * Requirement: 14.5
 */
export interface AssistanceRequestContext {
  cycleId: string
  reportName: string
  currentPhase: Phase
  currentStep: string
  stepData: Record<string, unknown>
  validationErrors: string[]
  browserInfo: string
  timestamp: string
}

/**
 * Assistance request payload
 */
export interface AssistanceRequest {
  id?: string
  type: 'question' | 'issue' | 'feedback'
  priority: 'low' | 'medium' | 'high'
  subject: string
  description: string
  context: AssistanceRequestContext
  attachments?: File[]
  createdAt?: string
  status?: 'pending' | 'in_progress' | 'resolved'
}

/**
 * Assistance request result
 */
export interface AssistanceRequestResult {
  success: boolean
  ticketId?: string
  message: string
  estimatedResponseTime?: string
}

// ============================================================================
// Help Panel State
// ============================================================================

/**
 * Help panel state
 */
export interface HelpPanelState {
  isOpen: boolean
  activeTab: 'help' | 'faq' | 'contact'
  currentStepHelp: StepHelpContent | null
  searchQuery: string
  searchResults: SearchResult[]
}

/**
 * Search result for help content
 */
export interface SearchResult {
  type: 'step' | 'faq' | 'issue'
  title: string
  excerpt: string
  phaseId?: Phase
  stepId?: string
  relevanceScore: number
}
