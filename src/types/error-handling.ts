/**
 * Error Handling Types and Infrastructure for the Regulatory AI Assistant
 * 
 * Provides comprehensive error handling including:
 * - Error categories and response types
 * - User-friendly error messages
 * - Retry configuration
 * - Graceful degradation strategies
 * 
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 17.7
 */

// ==================== Error Category Enum ====================

/**
 * Error category enum for categorizing errors
 * Validates: Requirements 15.1, 15.4
 */
export enum ErrorCategory {
  /** AI service is unavailable */
  AI_SERVICE_UNAVAILABLE = 'AI_SERVICE_UNAVAILABLE',
  /** Tool execution failed */
  TOOL_EXECUTION_FAILED = 'TOOL_EXECUTION_FAILED',
  /** Memory retrieval failed */
  MEMORY_RETRIEVAL_FAILED = 'MEMORY_RETRIEVAL_FAILED',
  /** Authentication failed */
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  /** Authorization denied */
  AUTHORIZATION_DENIED = 'AUTHORIZATION_DENIED',
  /** Rate limit exceeded */
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  /** Invalid input */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Request timeout */
  TIMEOUT = 'TIMEOUT',
  /** Human approval required */
  HUMAN_APPROVAL_REQUIRED = 'HUMAN_APPROVAL_REQUIRED',
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Service degraded */
  SERVICE_DEGRADED = 'SERVICE_DEGRADED',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

// ==================== Error Response Interface ====================

/**
 * Error response structure for user-friendly error handling
 * Validates: Requirements 15.1, 15.4
 */
export interface ErrorResponse {
  /** Error category */
  category: ErrorCategory;
  /** User-friendly message (safe to display) */
  userMessage: string;
  /** Technical details (for logging only, not shown to user) */
  technicalDetails?: string;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Suggested actions for the user */
  suggestedActions: string[];
  /** Error code for programmatic handling */
  errorCode?: string;
  /** Timestamp when error occurred */
  timestamp?: Date;
  /** Correlation ID for tracking */
  correlationId?: string;
}

// ==================== Retry Configuration ====================

/**
 * Configuration for retry strategy
 * Validates: Requirements 15.5
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Whether to add jitter to delays */
  jitter: boolean;
  /** Error categories that should be retried */
  retryableCategories: ErrorCategory[];
}

/**
 * Default retry configuration
 * Validates: Requirements 15.5
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
  retryableCategories: [
    ErrorCategory.AI_SERVICE_UNAVAILABLE,
    ErrorCategory.TOOL_EXECUTION_FAILED,
    ErrorCategory.TIMEOUT,
    ErrorCategory.NETWORK_ERROR,
    ErrorCategory.RATE_LIMIT_EXCEEDED,
  ],
};

// ==================== Graceful Degradation ====================

/**
 * Degradation level indicating service health
 */
export type DegradationLevel = 'full' | 'partial' | 'minimal' | 'offline';

/**
 * Service status for graceful degradation
 * Validates: Requirements 15.2, 15.3, 17.7
 */
export interface ServiceStatus {
  /** Service name */
  name: string;
  /** Whether the service is available */
  available: boolean;
  /** Current degradation level */
  degradationLevel: DegradationLevel;
  /** Last successful check timestamp */
  lastCheck?: Date;
  /** Error message if unavailable */
  error?: string;
  /** Fallback being used */
  fallbackActive?: boolean;
}

/**
 * Degradation strategy for a service
 * Validates: Requirements 15.2, 15.3, 17.7
 */
export interface DegradationStrategy {
  /** Service name */
  serviceName: string;
  /** Condition to check if degradation is needed */
  condition: () => boolean | Promise<boolean>;
  /** Fallback function to execute */
  fallback: () => unknown | Promise<unknown>;
  /** User notification message */
  notification: string;
  /** Priority (lower = higher priority) */
  priority: number;
}

/**
 * Graceful degradation configuration
 */
export interface GracefulDegradationConfig {
  /** Whether to enable graceful degradation */
  enabled: boolean;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;
  /** Strategies for different services */
  strategies: DegradationStrategy[];
}

// ==================== Error Handlers ====================

/**
 * Default error responses for each category
 * Validates: Requirements 15.1, 15.4
 */
export const ERROR_HANDLERS: Record<ErrorCategory, Omit<ErrorResponse, 'technicalDetails' | 'timestamp' | 'correlationId'>> = {
  [ErrorCategory.AI_SERVICE_UNAVAILABLE]: {
    category: ErrorCategory.AI_SERVICE_UNAVAILABLE,
    userMessage: "I'm having trouble connecting to my AI service. Please try again in a moment.",
    retryable: true,
    suggestedActions: ['Retry', 'Start new conversation'],
    errorCode: 'ERR_AI_UNAVAILABLE',
  },
  [ErrorCategory.TOOL_EXECUTION_FAILED]: {
    category: ErrorCategory.TOOL_EXECUTION_FAILED,
    userMessage: "I couldn't complete that action. Let me try a different approach.",
    retryable: true,
    suggestedActions: ['Retry', 'Ask differently', 'Manual action'],
    errorCode: 'ERR_TOOL_FAILED',
  },
  [ErrorCategory.MEMORY_RETRIEVAL_FAILED]: {
    category: ErrorCategory.MEMORY_RETRIEVAL_FAILED,
    userMessage: "I'm having trouble accessing our conversation history, but I can still help with your current question.",
    retryable: false,
    suggestedActions: ['Continue without history', 'Start new conversation'],
    errorCode: 'ERR_MEMORY_FAILED',
  },
  [ErrorCategory.AUTHENTICATION_FAILED]: {
    category: ErrorCategory.AUTHENTICATION_FAILED,
    userMessage: 'Your session has expired. Please sign in again.',
    retryable: false,
    suggestedActions: ['Sign in'],
    errorCode: 'ERR_AUTH_FAILED',
  },
  [ErrorCategory.AUTHORIZATION_DENIED]: {
    category: ErrorCategory.AUTHORIZATION_DENIED,
    userMessage: "You don't have permission to access that information. Please contact your administrator if you need access.",
    retryable: false,
    suggestedActions: ['Request access', 'Ask about something else'],
    errorCode: 'ERR_AUTHZ_DENIED',
  },
  [ErrorCategory.RATE_LIMIT_EXCEEDED]: {
    category: ErrorCategory.RATE_LIMIT_EXCEEDED,
    userMessage: "You've sent too many messages. Please wait a moment before trying again.",
    retryable: true,
    suggestedActions: ['Wait and retry'],
    errorCode: 'ERR_RATE_LIMIT',
  },
  [ErrorCategory.INVALID_INPUT]: {
    category: ErrorCategory.INVALID_INPUT,
    userMessage: "I didn't understand that. Could you rephrase your question?",
    retryable: false,
    suggestedActions: ['Rephrase', 'Use quick actions'],
    errorCode: 'ERR_INVALID_INPUT',
  },
  [ErrorCategory.TIMEOUT]: {
    category: ErrorCategory.TIMEOUT,
    userMessage: 'That request took too long. Let me try a simpler approach.',
    retryable: true,
    suggestedActions: ['Retry', 'Simplify question'],
    errorCode: 'ERR_TIMEOUT',
  },
  [ErrorCategory.HUMAN_APPROVAL_REQUIRED]: {
    category: ErrorCategory.HUMAN_APPROVAL_REQUIRED,
    userMessage: 'This action requires your explicit approval before I can proceed.',
    retryable: false,
    suggestedActions: ['Review and approve', 'Cancel'],
    errorCode: 'ERR_APPROVAL_REQUIRED',
  },
  [ErrorCategory.NETWORK_ERROR]: {
    category: ErrorCategory.NETWORK_ERROR,
    userMessage: 'There seems to be a network issue. Please check your connection and try again.',
    retryable: true,
    suggestedActions: ['Check connection', 'Retry'],
    errorCode: 'ERR_NETWORK',
  },
  [ErrorCategory.SERVICE_DEGRADED]: {
    category: ErrorCategory.SERVICE_DEGRADED,
    userMessage: 'Some features are temporarily limited. I can still help with basic queries.',
    retryable: false,
    suggestedActions: ['Continue with limited features', 'Try again later'],
    errorCode: 'ERR_DEGRADED',
  },
  [ErrorCategory.UNKNOWN]: {
    category: ErrorCategory.UNKNOWN,
    userMessage: 'Something unexpected happened. Please try again.',
    retryable: true,
    suggestedActions: ['Retry', 'Contact support'],
    errorCode: 'ERR_UNKNOWN',
  },
};

// ==================== Custom Error Classes ====================

/**
 * Base error class for assistant errors
 */
export class AssistantError extends Error {
  public readonly category: ErrorCategory;
  public readonly retryable: boolean;
  public readonly correlationId: string;
  public readonly timestamp: Date;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    retryable: boolean = false,
    correlationId?: string
  ) {
    super(message);
    this.name = 'AssistantError';
    this.category = category;
    this.retryable = retryable;
    this.correlationId = correlationId || generateCorrelationId();
    this.timestamp = new Date();
  }

  /**
   * Convert to ErrorResponse for user display
   */
  toErrorResponse(): ErrorResponse {
    const handler = ERROR_HANDLERS[this.category];
    return {
      ...handler,
      technicalDetails: this.message,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
    };
  }
}

/**
 * Error for tool execution failures
 */
export class ToolExecutionError extends AssistantError {
  public readonly toolName: string;
  public readonly parameters?: Record<string, unknown>;

  constructor(
    toolName: string,
    message: string,
    parameters?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(message, ErrorCategory.TOOL_EXECUTION_FAILED, true, correlationId);
    this.name = 'ToolExecutionError';
    this.toolName = toolName;
    this.parameters = parameters;
  }
}

/**
 * Error for memory service failures
 */
export class MemoryServiceError extends AssistantError {
  public readonly operation: string;

  constructor(operation: string, message: string, correlationId?: string) {
    super(message, ErrorCategory.MEMORY_RETRIEVAL_FAILED, false, correlationId);
    this.name = 'MemoryServiceError';
    this.operation = operation;
  }
}

/**
 * Error for timeout situations
 */
export class TimeoutError extends AssistantError {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number, correlationId?: string) {
    super(message, ErrorCategory.TIMEOUT, true, correlationId);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error for authorization failures
 */
export class AuthorizationError extends AssistantError {
  public readonly requiredPermission: string;

  constructor(message: string, requiredPermission: string, correlationId?: string) {
    super(message, ErrorCategory.AUTHORIZATION_DENIED, false, correlationId);
    this.name = 'AuthorizationError';
    this.requiredPermission = requiredPermission;
  }
}

// ==================== Utility Functions ====================

/**
 * Generate a correlation ID for error tracking
 */
export function generateCorrelationId(): string {
  return `err-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Categorize an error based on its type and message
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof AssistantError) {
    return error.category;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorCategory.TIMEOUT;
    }
    if (message.includes('unauthorized') || message.includes('permission') || message.includes('forbidden')) {
      return ErrorCategory.AUTHORIZATION_DENIED;
    }
    if (message.includes('authentication') || message.includes('session') || message.includes('token')) {
      return ErrorCategory.AUTHENTICATION_FAILED;
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return ErrorCategory.RATE_LIMIT_EXCEEDED;
    }
    if (message.includes('human approval') || message.includes('approval required')) {
      return ErrorCategory.HUMAN_APPROVAL_REQUIRED;
    }
    if (message.includes('network') || message.includes('connection') || message.includes('fetch')) {
      return ErrorCategory.NETWORK_ERROR;
    }
    if (message.includes('memory') || message.includes('session context')) {
      return ErrorCategory.MEMORY_RETRIEVAL_FAILED;
    }
    if (message.includes('tool') || message.includes('execution')) {
      return ErrorCategory.TOOL_EXECUTION_FAILED;
    }
    if (message.includes('invalid') || message.includes('validation')) {
      return ErrorCategory.INVALID_INPUT;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Create an ErrorResponse from any error
 * Validates: Requirements 15.1, 15.4
 */
export function createErrorResponse(
  error: unknown,
  correlationId?: string
): ErrorResponse {
  const id = correlationId || generateCorrelationId();
  const timestamp = new Date();

  if (error instanceof AssistantError) {
    return error.toErrorResponse();
  }

  const category = categorizeError(error);
  const handler = ERROR_HANDLERS[category];
  const technicalDetails = error instanceof Error ? error.message : String(error);

  return {
    ...handler,
    technicalDetails,
    timestamp,
    correlationId: id,
  };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  if (error instanceof AssistantError) {
    return error.retryable && config.retryableCategories.includes(error.category);
  }

  const category = categorizeError(error);
  return config.retryableCategories.includes(category);
}

/**
 * Log error for debugging (without exposing to user)
 */
export function logError(
  error: unknown,
  context: Record<string, unknown> = {}
): void {
  const errorResponse = createErrorResponse(error);
  
  // In production, this would send to a logging service
  console.error('[AssistantError]', {
    category: errorResponse.category,
    errorCode: errorResponse.errorCode,
    correlationId: errorResponse.correlationId,
    timestamp: errorResponse.timestamp,
    technicalDetails: errorResponse.technicalDetails,
    context,
  });
}
