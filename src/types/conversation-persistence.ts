/**
 * Conversation Persistence types for the Regulatory AI Assistant
 * 
 * Defines types for conversation persistence including:
 * - Session recovery after browser refresh
 * - Session continuity within 24 hours
 * - Durable storage persistence to AgentCore Memory
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 17.4, 17.5, 17.6
 */

import { Message, SessionContext, EntityReference } from './memory.js';

// ==================== Session Recovery Types ====================

/**
 * Session recovery request for browser refresh recovery
 * Validates: Requirements 13.1
 */
export interface SessionRecoveryRequest {
  /** Session ID to recover */
  sessionId: string;
  /** User ID for authentication */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
}

/**
 * Session recovery result
 * Validates: Requirements 13.1, 13.3
 */
export interface SessionRecoveryResult {
  /** Whether recovery was successful */
  success: boolean;
  /** Recovered session context */
  session?: SessionContext;
  /** Summary of previous context */
  contextSummary?: string;
  /** Whether the session was found in memory */
  foundInMemory: boolean;
  /** Whether the session was found in local storage */
  foundInLocalStorage: boolean;
  /** Error message if recovery failed */
  error?: string;
}

// ==================== Session Continuity Types ====================

/**
 * Previous session info for continuity prompt
 * Validates: Requirements 13.2
 */
export interface PreviousSessionInfo {
  /** Session ID */
  sessionId: string;
  /** When the session was last active */
  lastActivity: Date;
  /** Number of messages in the session */
  messageCount: number;
  /** Brief summary of the conversation */
  summary?: string;
  /** Whether the session is within the 24-hour window */
  isWithinContinuityWindow: boolean;
}

/**
 * Session continuity decision
 * Validates: Requirements 13.2, 13.5
 */
export type SessionContinuityDecision = 'continue' | 'new';

/**
 * Session continuity request
 * Validates: Requirements 13.2
 */
export interface SessionContinuityRequest {
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Decision to continue or start new */
  decision: SessionContinuityDecision;
  /** Previous session ID if continuing */
  previousSessionId?: string;
}

/**
 * Session continuity result
 * Validates: Requirements 13.2, 13.5
 */
export interface SessionContinuityResult {
  /** The session ID to use */
  sessionId: string;
  /** Whether this is a continued session */
  isContinued: boolean;
  /** Context summary if continued */
  contextSummary?: string;
  /** Messages if continued */
  messages?: Message[];
}

// ==================== Durable Storage Types ====================

/**
 * Conversation state for durable storage
 * Validates: Requirements 13.4, 17.4, 17.5, 17.6
 */
export interface ConversationState {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Messages in the conversation */
  messages: Message[];
  /** Entities mentioned for pronoun resolution */
  entities: SerializedEntityMap;
  /** Context summary */
  summary?: string;
  /** Last activity timestamp */
  lastActivity: Date;
  /** Whether the session is active */
  isActive: boolean;
  /** Version for optimistic locking */
  version: number;
  /** When the state was last persisted */
  persistedAt: Date;
}

/**
 * Serialized entity map for storage
 */
export type SerializedEntityMap = Array<[string, EntityReference]>;

/**
 * Persistence operation result
 * Validates: Requirements 13.4, 17.7
 */
export interface PersistenceResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether fallback was used */
  usedFallback: boolean;
  /** Timestamp of the operation */
  timestamp: Date;
}

// ==================== Persistence Service Interface ====================

/**
 * Conversation Persistence Service interface
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 17.4, 17.5, 17.6, 17.7
 */
export interface ConversationPersistenceService {
  /**
   * Recover a session after browser refresh
   * Validates: Requirements 13.1, 13.3
   */
  recoverSession(request: SessionRecoveryRequest): Promise<SessionRecoveryResult>;

  /**
   * Check for previous session within continuity window
   * Validates: Requirements 13.2
   */
  checkPreviousSession(userId: string, tenantId: string): Promise<PreviousSessionInfo | null>;

  /**
   * Handle session continuity decision
   * Validates: Requirements 13.2, 13.5
   */
  handleContinuityDecision(request: SessionContinuityRequest): Promise<SessionContinuityResult>;

  /**
   * Persist conversation state to durable storage
   * Validates: Requirements 13.4, 17.4, 17.5, 17.6
   */
  persistConversationState(state: ConversationState): Promise<PersistenceResult>;

  /**
   * Load conversation state from durable storage
   * Validates: Requirements 13.4, 17.4, 17.5, 17.6
   */
  loadConversationState(sessionId: string, userId: string, tenantId: string): Promise<ConversationState | null>;

  /**
   * Clear session from all storage
   * Validates: Requirements 13.5
   */
  clearSession(sessionId: string, userId: string, tenantId: string): Promise<void>;

  /**
   * Summarize previous context for restoration
   * Validates: Requirements 13.3
   */
  summarizePreviousContext(messages: Message[]): Promise<string>;
}

// ==================== Constants ====================

/**
 * Session continuity window in milliseconds (24 hours)
 * Validates: Requirements 13.2
 */
export const SESSION_CONTINUITY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Local storage key prefix for conversation state
 */
export const LOCAL_STORAGE_KEY_PREFIX = 'conversation_state_';

/**
 * Maximum messages to include in context summary
 */
export const MAX_SUMMARY_MESSAGES = 10;

/**
 * Default persistence retry configuration
 */
export const PERSISTENCE_RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};
