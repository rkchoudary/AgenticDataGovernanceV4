/**
 * Conversation Persistence Service for the Regulatory AI Assistant
 * 
 * Implements conversation persistence including:
 * - Browser refresh recovery from Short_Term_Memory
 * - Session continuity within 24 hours
 * - Durable storage persistence to AgentCore Memory
 * - Graceful degradation with local storage fallback
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 17.4, 17.5, 17.6, 17.7
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ConversationPersistenceService,
  SessionRecoveryRequest,
  SessionRecoveryResult,
  PreviousSessionInfo,
  SessionContinuityRequest,
  SessionContinuityResult,
  ConversationState,
  PersistenceResult,
  SESSION_CONTINUITY_WINDOW_MS,
  LOCAL_STORAGE_KEY_PREFIX,
  MAX_SUMMARY_MESSAGES,
} from '../types/conversation-persistence.js';
import {
  MemoryService,
  Message,
  SessionContext,
} from '../types/memory.js';
import { withRetry, logError, RetryConfig, DEFAULT_RETRY_CONFIG } from './error-handling-service.js';

// ==================== Local Storage Fallback ====================

/**
 * Local storage adapter for browser environments
 * Falls back to in-memory storage for non-browser environments
 */
class LocalStorageAdapter {
  private inMemoryStorage: Map<string, string> = new Map();
  private isLocalStorageAvailable: boolean;

  constructor() {
    this.isLocalStorageAvailable = this.checkLocalStorageAvailability();
  }


  private checkLocalStorageAvailability(): boolean {
    try {
      // Check if we're in a browser environment
      if (typeof globalThis !== 'undefined' && 
          typeof (globalThis as any).localStorage !== 'undefined') {
        const storage = (globalThis as any).localStorage;
        const testKey = '__test__';
        storage.setItem(testKey, testKey);
        storage.removeItem(testKey);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Interface for localStorage-like storage
   */
  private getStorage(): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void; length: number; key: (index: number) => string | null } | null {
    if (this.isLocalStorageAvailable) {
      return (globalThis as any).localStorage;
    }
    return null;
  }

  getItem(key: string): string | null {
    const storage = this.getStorage();
    if (storage) {
      return storage.getItem(key);
    }
    return this.inMemoryStorage.get(key) || null;
  }

  setItem(key: string, value: string): void {
    const storage = this.getStorage();
    if (storage) {
      storage.setItem(key, value);
    } else {
      this.inMemoryStorage.set(key, value);
    }
  }

  removeItem(key: string): void {
    const storage = this.getStorage();
    if (storage) {
      storage.removeItem(key);
    } else {
      this.inMemoryStorage.delete(key);
    }
  }

  /**
   * Get all keys matching a prefix
   */
  getKeysWithPrefix(prefix: string): string[] {
    const keys: string[] = [];
    const storage = this.getStorage();
    if (storage) {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith(prefix)) {
          keys.push(key);
        }
      }
    } else {
      for (const key of this.inMemoryStorage.keys()) {
        if (key.startsWith(prefix)) {
          keys.push(key);
        }
      }
    }
    return keys;
  }
}

// ==================== Implementation ====================

/**
 * Configuration for the Conversation Persistence Service
 */
export interface ConversationPersistenceConfig {
  /** Whether to enable local storage fallback */
  enableLocalStorageFallback: boolean;
  /** Callback for degradation notifications */
  onDegradation?: (message: string) => void;
  /** Retry configuration */
  retryConfig: RetryConfig;
}

const DEFAULT_CONFIG: ConversationPersistenceConfig = {
  enableLocalStorageFallback: true,
  retryConfig: {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts: 2, // Fewer retries for persistence operations
    baseDelayMs: 500,
  },
};

/**
 * Implementation of the Conversation Persistence Service
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 17.4, 17.5, 17.6, 17.7
 */
export class ConversationPersistenceServiceImpl implements ConversationPersistenceService {
  private memoryService: MemoryService;
  private localStorage: LocalStorageAdapter;
  private config: ConversationPersistenceConfig;

  constructor(
    memoryService: MemoryService,
    config: Partial<ConversationPersistenceConfig> = {}
  ) {
    this.memoryService = memoryService;
    this.localStorage = new LocalStorageAdapter();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }


  // ==================== Session Recovery (Browser Refresh) ====================

  /**
   * Recover a session after browser refresh
   * 
   * Recovery order:
   * 1. Try to recover from AgentCore Memory (Short_Term_Memory)
   * 2. Fall back to local storage if memory service fails
   * 3. Generate context summary for restored session
   * 
   * Validates: Requirements 13.1, 13.3
   */
  async recoverSession(request: SessionRecoveryRequest): Promise<SessionRecoveryResult> {
    const { sessionId, userId, tenantId } = request;

    // Try to recover from memory service first
    try {
      const session = await withRetry(
        () => this.memoryService.getSessionContext(sessionId),
        this.config.retryConfig
      );

      if (session) {
        // Verify tenant isolation
        if (session.tenantId !== tenantId || session.userId !== userId) {
          return {
            success: false,
            foundInMemory: false,
            foundInLocalStorage: false,
            error: 'Session does not belong to this user/tenant',
          };
        }

        // Generate context summary for restoration
        const contextSummary = await this.summarizePreviousContext(session.messages);

        return {
          success: true,
          session,
          contextSummary,
          foundInMemory: true,
          foundInLocalStorage: false,
        };
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      this.notifyDegradation('Memory service unavailable, attempting local recovery.');
    }

    // Fall back to local storage
    if (this.config.enableLocalStorageFallback) {
      const localState = this.loadFromLocalStorage(sessionId, userId, tenantId);
      if (localState) {
        // Convert local state to session context
        const session = this.convertStateToSession(localState);
        const contextSummary = await this.summarizePreviousContext(session.messages);

        return {
          success: true,
          session,
          contextSummary,
          foundInMemory: false,
          foundInLocalStorage: true,
        };
      }
    }

    // No session found
    return {
      success: false,
      foundInMemory: false,
      foundInLocalStorage: false,
      error: 'No session found to recover',
    };
  }

  // ==================== Session Continuity ====================

  /**
   * Check for previous session within continuity window (24 hours)
   * Validates: Requirements 13.2
   */
  async checkPreviousSession(userId: string, tenantId: string): Promise<PreviousSessionInfo | null> {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - SESSION_CONTINUITY_WINDOW_MS);

    // Query episodic memory for recent sessions
    try {
      const episodes = await this.memoryService.queryEpisodes({
        userId,
        tenantId,
        startDate: cutoffTime,
        types: ['query'],
        limit: 50,
      });

      if (episodes.length === 0) {
        return null;
      }

      // Find the most recent session
      const sessionIds = new Set<string>();
      for (const episode of episodes) {
        sessionIds.add(episode.sessionId);
      }

      // Get the most recent session
      for (const sessionId of sessionIds) {
        const session = await this.memoryService.getSessionContext(sessionId);
        if (session && session.isActive) {
          const isWithinWindow = session.lastActivity.getTime() > cutoffTime.getTime();
          
          if (isWithinWindow) {
            return {
              sessionId: session.sessionId,
              lastActivity: session.lastActivity,
              messageCount: session.messages.length,
              summary: session.summary || await this.summarizePreviousContext(session.messages),
              isWithinContinuityWindow: true,
            };
          }
        }
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }

    // Check local storage as fallback
    if (this.config.enableLocalStorageFallback) {
      const localSession = this.findRecentLocalSession(userId, tenantId, cutoffTime);
      if (localSession) {
        return localSession;
      }
    }

    return null;
  }

  /**
   * Handle session continuity decision
   * Validates: Requirements 13.2, 13.5
   */
  async handleContinuityDecision(request: SessionContinuityRequest): Promise<SessionContinuityResult> {
    const { userId, tenantId, decision, previousSessionId } = request;

    if (decision === 'new') {
      // Clear previous session if specified
      if (previousSessionId) {
        await this.clearSession(previousSessionId, userId, tenantId);
      }

      // Create new session
      const newSessionId = uuidv4();
      return {
        sessionId: newSessionId,
        isContinued: false,
      };
    }

    // Continue previous session
    if (!previousSessionId) {
      // No previous session to continue, create new
      return {
        sessionId: uuidv4(),
        isContinued: false,
      };
    }

    // Recover the previous session
    const recoveryResult = await this.recoverSession({
      sessionId: previousSessionId,
      userId,
      tenantId,
    });

    if (recoveryResult.success && recoveryResult.session) {
      return {
        sessionId: previousSessionId,
        isContinued: true,
        contextSummary: recoveryResult.contextSummary,
        messages: recoveryResult.session.messages,
      };
    }

    // Recovery failed, create new session
    return {
      sessionId: uuidv4(),
      isContinued: false,
    };
  }

  // ==================== Durable Storage Persistence ====================

  /**
   * Persist conversation state to durable storage
   * Validates: Requirements 13.4, 17.4, 17.5, 17.6
   */
  async persistConversationState(state: ConversationState): Promise<PersistenceResult> {
    const timestamp = new Date();
    let usedFallback = false;

    // Try to persist to memory service
    try {
      // Update session context in memory service
      await withRetry(
        () => this.memoryService.updateSessionContext(state.sessionId, state.messages),
        this.config.retryConfig
      );

      // Also persist to local storage for redundancy
      if (this.config.enableLocalStorageFallback) {
        this.saveToLocalStorage(state);
      }

      return {
        success: true,
        usedFallback: false,
        timestamp,
      };
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      this.notifyDegradation('Failed to persist to memory service, using local storage.');
      usedFallback = true;
    }

    // Fall back to local storage only
    if (this.config.enableLocalStorageFallback) {
      try {
        this.saveToLocalStorage(state);
        return {
          success: true,
          usedFallback: true,
          timestamp,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          usedFallback: true,
          timestamp,
        };
      }
    }

    return {
      success: false,
      error: 'All persistence methods failed',
      usedFallback,
      timestamp,
    };
  }

  /**
   * Load conversation state from durable storage
   * Validates: Requirements 13.4, 17.4, 17.5, 17.6
   */
  async loadConversationState(
    sessionId: string,
    userId: string,
    tenantId: string
  ): Promise<ConversationState | null> {
    // Try memory service first
    try {
      const session = await withRetry(
        () => this.memoryService.getSessionContext(sessionId),
        this.config.retryConfig
      );

      if (session && session.userId === userId && session.tenantId === tenantId) {
        return this.convertSessionToState(session);
      }
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }

    // Fall back to local storage
    if (this.config.enableLocalStorageFallback) {
      return this.loadFromLocalStorage(sessionId, userId, tenantId);
    }

    return null;
  }

  /**
   * Clear session from all storage
   * Validates: Requirements 13.5
   */
  async clearSession(sessionId: string, userId: string, tenantId: string): Promise<void> {
    // Clear from memory service
    try {
      await this.memoryService.clearSession(sessionId);
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }

    // Clear from local storage
    this.removeFromLocalStorage(sessionId, userId, tenantId);
  }

  // ==================== Context Summarization ====================

  /**
   * Summarize previous context for restoration
   * Validates: Requirements 13.3
   */
  async summarizePreviousContext(messages: Message[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    // Take the most recent messages for summary
    const recentMessages = messages.slice(-MAX_SUMMARY_MESSAGES);

    // Extract key information
    const topics: Set<string> = new Set();
    const entities: Set<string> = new Set();
    const actions: Set<string> = new Set();

    for (const message of recentMessages) {
      // Extract topics from tool calls
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          topics.add(this.getTopicFromToolName(toolCall.name));
        }
      }

      // Extract entities from references
      if (message.references) {
        for (const ref of message.references) {
          entities.add(`${ref.type}: ${ref.title}`);
        }
      }

      // Extract key phrases from user messages
      if (message.role === 'user') {
        const keyPhrases = this.extractKeyPhrases(message.content);
        keyPhrases.forEach(phrase => actions.add(phrase));
      }
    }

    // Build summary
    const parts: string[] = [];

    if (topics.size > 0) {
      parts.push(`Topics: ${Array.from(topics).slice(0, 3).join(', ')}`);
    }

    if (entities.size > 0) {
      parts.push(`Referenced: ${Array.from(entities).slice(0, 3).join(', ')}`);
    }

    if (actions.size > 0) {
      parts.push(`Discussed: ${Array.from(actions).slice(0, 2).join(', ')}`);
    }

    if (parts.length === 0) {
      return `Previous conversation with ${messages.length} messages`;
    }

    return parts.join('. ') + '.';
  }

  // ==================== Helper Methods ====================

  /**
   * Get topic name from tool name
   */
  private getTopicFromToolName(toolName: string): string {
    const topicMap: Record<string, string> = {
      scanRegulatorySources: 'regulatory scanning',
      detectChanges: 'regulatory changes',
      getReportCatalog: 'report catalog',
      approveCatalog: 'catalog approval',
      getLineageForReport: 'data lineage',
      getLineageForCDE: 'CDE lineage',
      getIssuesForReport: 'data quality issues',
      getCDEDetails: 'CDE details',
      getCycleStatus: 'workflow status',
    };
    return topicMap[toolName] || toolName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  }

  /**
   * Extract key phrases from message content
   */
  private extractKeyPhrases(content: string): string[] {
    const phrases: string[] = [];

    // Look for common query patterns
    const patterns = [
      { regex: /what is (\w+[\w\s-]*)/i, extract: 1 },
      { regex: /show me (\w+[\w\s-]*)/i, extract: 1 },
      { regex: /tell me about (\w+[\w\s-]*)/i, extract: 1 },
      { regex: /(\w+[\w\s-]*) issues/i, extract: 1 },
      { regex: /(\w+[\w\s-]*) report/i, extract: 1 },
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern.regex);
      if (match && match[pattern.extract]) {
        phrases.push(match[pattern.extract].trim());
      }
    }

    return phrases.slice(0, 3);
  }

  /**
   * Convert ConversationState to SessionContext
   */
  private convertStateToSession(state: ConversationState): SessionContext {
    return {
      sessionId: state.sessionId,
      userId: state.userId,
      tenantId: state.tenantId,
      messages: state.messages,
      entities: new Map(state.entities),
      lastActivity: state.lastActivity,
      summary: state.summary,
      isActive: state.isActive,
    };
  }

  /**
   * Convert SessionContext to ConversationState
   */
  private convertSessionToState(session: SessionContext): ConversationState {
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      tenantId: session.tenantId,
      messages: session.messages,
      entities: Array.from(session.entities.entries()),
      summary: session.summary,
      lastActivity: session.lastActivity,
      isActive: session.isActive,
      version: 1,
      persistedAt: new Date(),
    };
  }

  /**
   * Get local storage key for a session
   */
  private getLocalStorageKey(sessionId: string, userId: string, tenantId: string): string {
    return `${LOCAL_STORAGE_KEY_PREFIX}${tenantId}_${userId}_${sessionId}`;
  }

  /**
   * Save conversation state to local storage
   */
  private saveToLocalStorage(state: ConversationState): void {
    const key = this.getLocalStorageKey(state.sessionId, state.userId, state.tenantId);
    const serialized = JSON.stringify({
      ...state,
      lastActivity: state.lastActivity.toISOString(),
      persistedAt: new Date().toISOString(),
      messages: state.messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    });
    this.localStorage.setItem(key, serialized);
  }

  /**
   * Load conversation state from local storage
   */
  private loadFromLocalStorage(
    sessionId: string,
    userId: string,
    tenantId: string
  ): ConversationState | null {
    const key = this.getLocalStorageKey(sessionId, userId, tenantId);
    const serialized = this.localStorage.getItem(key);
    
    if (!serialized) {
      return null;
    }

    try {
      const parsed = JSON.parse(serialized);
      return {
        ...parsed,
        lastActivity: new Date(parsed.lastActivity),
        persistedAt: new Date(parsed.persistedAt),
        messages: parsed.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        })),
      };
    } catch {
      return null;
    }
  }

  /**
   * Remove conversation state from local storage
   */
  private removeFromLocalStorage(sessionId: string, userId: string, tenantId: string): void {
    const key = this.getLocalStorageKey(sessionId, userId, tenantId);
    this.localStorage.removeItem(key);
  }

  /**
   * Find recent local session within continuity window
   */
  private findRecentLocalSession(
    userId: string,
    tenantId: string,
    cutoffTime: Date
  ): PreviousSessionInfo | null {
    const prefix = `${LOCAL_STORAGE_KEY_PREFIX}${tenantId}_${userId}_`;
    const keys = this.localStorage.getKeysWithPrefix(prefix);

    let mostRecent: PreviousSessionInfo | null = null;
    let mostRecentTime = 0;

    for (const key of keys) {
      const serialized = this.localStorage.getItem(key);
      if (!serialized) continue;

      try {
        const state = JSON.parse(serialized);
        const lastActivity = new Date(state.lastActivity);
        
        if (lastActivity.getTime() > cutoffTime.getTime() && 
            lastActivity.getTime() > mostRecentTime) {
          mostRecentTime = lastActivity.getTime();
          mostRecent = {
            sessionId: state.sessionId,
            lastActivity,
            messageCount: state.messages?.length || 0,
            summary: state.summary,
            isWithinContinuityWindow: true,
          };
        }
      } catch {
        // Skip invalid entries
      }
    }

    return mostRecent;
  }

  /**
   * Notify about degradation
   */
  private notifyDegradation(message: string): void {
    if (this.config.onDegradation) {
      this.config.onDegradation(message);
    }
  }
}

// ==================== Factory Function ====================

/**
 * Create a new Conversation Persistence Service instance
 */
export function createConversationPersistenceService(
  memoryService: MemoryService,
  config?: Partial<ConversationPersistenceConfig>
): ConversationPersistenceService {
  return new ConversationPersistenceServiceImpl(memoryService, config);
}
