/**
 * Assistant Service types for the Regulatory AI Assistant
 * 
 * Defines types for the conversational AI interface including:
 * - Chat requests and responses
 * - Conversation context management
 * - Access control and permissions
 * 
 * Validates: Requirements 1.1, 1.2, 10.1-10.5
 */

import { Message, Reference, ToolCall, EntityReference } from './memory.js';
import { ToolResult } from './tool-service.js';
import { HumanGateAction } from './human-gate.js';

// Re-export Human Gate types for convenience
export {
  HumanGateAction,
  HumanGateResult,
  HumanGateDecision,
  HumanGateActionType,
  HumanGateStatus,
  HumanGateService,
  HumanGateContext,
  HumanGateConfig,
  CRITICAL_ACTION_TYPES,
  isCriticalAction,
  getGateTypeForTool,
  getImpactDescription,
  getRequiredRole,
  isActionExpired,
} from './human-gate.js';

// ==================== Page Context ====================

/**
 * Page context for contextual suggestions
 */
export interface PageContext {
  /** Current page path */
  path: string;
  /** Page type (dashboard, report, cde, etc.) */
  pageType: string;
  /** Entity ID if viewing a specific entity */
  entityId?: string;
  /** Entity type if viewing a specific entity */
  entityType?: string;
  /** Additional page-specific context */
  metadata?: Record<string, unknown>;
}

// ==================== Chat Request/Response Types ====================

/**
 * Chat request from the user
 * Validates: Requirements 1.1
 */
export interface ChatRequest {
  /** Unique session identifier */
  sessionId: string;
  /** User ID making the request */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** The user's message */
  message: string;
  /** Current page context for contextual suggestions */
  pageContext?: PageContext;
}

/**
 * Type of chat response chunk
 */
export type ChatResponseType = 
  | 'text'
  | 'tool_start'
  | 'tool_result'
  | 'reference'
  | 'quick_action'
  | 'human_gate'
  | 'error'
  | 'context_summary';

/**
 * Quick action suggestion
 */
export interface QuickAction {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Action type */
  type: 'query' | 'command' | 'navigation';
  /** The query or command to execute */
  action: string;
  /** Icon name for display */
  icon?: string;
}

/**
 * Chat response chunk (for streaming)
 * Validates: Requirements 1.1, 1.2
 */
export interface ChatResponse {
  /** Type of response chunk */
  type: ChatResponseType;
  /** Content of the response (varies by type) */
  content: string | ToolCall | Reference | QuickAction | HumanGateAction | ErrorResponse;
  /** Whether this is the final chunk */
  isComplete: boolean;
  /** Message ID for the response */
  messageId?: string;
  /** Timestamp of the response */
  timestamp?: Date;
}

// ==================== Conversation Context Types ====================

/**
 * Conversation context for the assistant
 * Validates: Requirements 2.1, 2.3, 13.1
 */
export interface ConversationContext {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Recent messages in the conversation */
  messages: Message[];
  /** Entities mentioned for pronoun resolution */
  entities: Map<string, EntityReference>;
  /** Summarized older context */
  summary?: string;
  /** User preferences */
  preferences?: UserContextPreferences;
  /** Relevant episodic memories */
  relevantEpisodes?: EpisodeSummary[];
}

/**
 * User preferences relevant to conversation
 */
export interface UserContextPreferences {
  /** Preferred reports */
  preferredReports: string[];
  /** Custom quick actions */
  customQuickActions?: string[];
  /** Display preferences */
  displayPreferences?: {
    theme: string;
    dateFormat: string;
  };
}

/**
 * Summary of a relevant episode
 */
export interface EpisodeSummary {
  /** Episode ID */
  id: string;
  /** When it occurred */
  timestamp: Date;
  /** Brief summary */
  summary: string;
  /** Related entities */
  relatedEntities: string[];
}

// ==================== Access Control Types ====================

/**
 * User permissions for access control
 * Validates: Requirements 10.1, 10.4
 */
export interface UserPermissions {
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** User's role */
  role: string;
  /** List of permissions */
  permissions: string[];
  /** Data access scopes */
  dataScopes: DataScope[];
}

/**
 * Data access scope
 */
export interface DataScope {
  /** Entity type this scope applies to */
  entityType: string;
  /** Allowed entity IDs (empty means all) */
  allowedIds?: string[];
  /** Denied entity IDs */
  deniedIds?: string[];
  /** Access level */
  accessLevel: 'read' | 'write' | 'admin';
}

/**
 * Access control context for filtering results
 * Validates: Requirements 10.1, 10.2, 10.4, 10.5
 */
export interface AccessControlContext {
  /** User permissions */
  permissions: UserPermissions;
  /** Access token for authentication */
  accessToken?: string;
  /** Whether to log access attempts */
  enableAuditLogging: boolean;
}

/**
 * Audit log entry for data access
 * Validates: Requirements 10.3
 */
export interface AccessAuditEntry {
  /** Unique identifier */
  id: string;
  /** Timestamp */
  timestamp: Date;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Session ID */
  sessionId: string;
  /** Action performed */
  action: 'query' | 'view' | 'export' | 'unauthorized_attempt';
  /** Entity type accessed */
  entityType: string;
  /** Entity IDs accessed */
  entityIds: string[];
  /** Whether access was granted */
  accessGranted: boolean;
  /** Reason if denied */
  denialReason?: string;
  /** Query or tool that triggered access */
  source: string;
}

// ==================== Error Types ====================

/**
 * Error category for user-friendly messages
 */
export type ErrorCategory =
  | 'AI_SERVICE_UNAVAILABLE'
  | 'TOOL_EXECUTION_FAILED'
  | 'MEMORY_RETRIEVAL_FAILED'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_DENIED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'HUMAN_APPROVAL_REQUIRED';

/**
 * Error response for the assistant
 * Validates: Requirements 15.1, 15.4
 */
export interface ErrorResponse {
  /** Error category */
  category: ErrorCategory;
  /** User-friendly message */
  userMessage: string;
  /** Technical details (for logging only) */
  technicalDetails?: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Suggested actions for the user */
  suggestedActions: string[];
}

// ==================== Execution Context ====================

/**
 * Execution context for the assistant service
 */
export interface AssistantExecutionContext {
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Session ID */
  sessionId: string;
  /** Access token */
  accessToken?: string;
  /** User permissions */
  permissions: string[];
  /** Whether human approval is required for critical actions */
  requireHumanApproval: boolean;
  /** Page context */
  pageContext?: PageContext;
}

// ==================== Constants ====================

/**
 * Default error responses
 */
export const ERROR_RESPONSES: Record<ErrorCategory, Omit<ErrorResponse, 'technicalDetails'>> = {
  AI_SERVICE_UNAVAILABLE: {
    category: 'AI_SERVICE_UNAVAILABLE',
    userMessage: "I'm having trouble connecting to my AI service. Please try again in a moment.",
    retryable: true,
    suggestedActions: ['Retry', 'Start new conversation'],
  },
  TOOL_EXECUTION_FAILED: {
    category: 'TOOL_EXECUTION_FAILED',
    userMessage: "I couldn't complete that action. Let me try a different approach.",
    retryable: true,
    suggestedActions: ['Retry', 'Ask differently', 'Manual action'],
  },
  MEMORY_RETRIEVAL_FAILED: {
    category: 'MEMORY_RETRIEVAL_FAILED',
    userMessage: "I'm having trouble accessing our conversation history, but I can still help with your current question.",
    retryable: false,
    suggestedActions: ['Continue without history', 'Start new conversation'],
  },
  AUTHENTICATION_FAILED: {
    category: 'AUTHENTICATION_FAILED',
    userMessage: 'Your session has expired. Please sign in again.',
    retryable: false,
    suggestedActions: ['Sign in'],
  },
  AUTHORIZATION_DENIED: {
    category: 'AUTHORIZATION_DENIED',
    userMessage: "You don't have permission to access that information. Please contact your administrator if you need access.",
    retryable: false,
    suggestedActions: ['Request access', 'Ask about something else'],
  },
  RATE_LIMIT_EXCEEDED: {
    category: 'RATE_LIMIT_EXCEEDED',
    userMessage: "You've sent too many messages. Please wait a moment before trying again.",
    retryable: true,
    suggestedActions: ['Wait and retry'],
  },
  INVALID_INPUT: {
    category: 'INVALID_INPUT',
    userMessage: "I didn't understand that. Could you rephrase your question?",
    retryable: false,
    suggestedActions: ['Rephrase', 'Use quick actions'],
  },
  TIMEOUT: {
    category: 'TIMEOUT',
    userMessage: 'That request took too long. Let me try a simpler approach.',
    retryable: true,
    suggestedActions: ['Retry', 'Simplify question'],
  },
  HUMAN_APPROVAL_REQUIRED: {
    category: 'HUMAN_APPROVAL_REQUIRED',
    userMessage: 'This action requires your explicit approval before I can proceed.',
    retryable: false,
    suggestedActions: ['Review and approve', 'Cancel'],
  },
};

/**
 * Pronoun patterns for entity resolution
 */
export const PRONOUN_PATTERNS: Record<string, string[]> = {
  report: ['it', 'this report', 'that report', 'the report'],
  cde: ['it', 'this cde', 'that cde', 'the cde', 'this element', 'that element'],
  issue: ['it', 'this issue', 'that issue', 'the issue'],
  cycle: ['it', 'this cycle', 'that cycle', 'the cycle'],
};
