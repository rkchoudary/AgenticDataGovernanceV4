/**
 * Resilient Memory Service with Graceful Degradation
 * 
 * Wraps the Memory Service with error handling and fallback mechanisms:
 * - Falls back to local storage when memory service unavailable
 * - Continues without personalization when long-term memory fails
 * - Provides degraded functionality rather than complete failure
 * 
 * Validates: Requirements 15.2, 15.3, 17.7
 */

import { v4 as uuidv4 } from 'uuid';
import {
  MemoryService,
  SessionContext,
  Message,
  UserPreferences,
  LearnedKnowledge,
  Episode,
  EpisodeQuery,
  Decision,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_DISPLAY_PREFERENCES,
} from '../types/memory.js';
import {
  GracefulDegradationService,
  withRetry,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  MemoryServiceError,
  logError,
} from './error-handling-service.js';

/**
 * Configuration for the resilient memory service
 */
export interface ResilientMemoryServiceConfig {
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Whether to enable local storage fallback */
  enableLocalStorageFallback: boolean;
  /** Whether to enable default preferences fallback */
  enableDefaultPreferencesFallback: boolean;
  /** Notification callback for degradation events */
  onDegradation?: (message: string) => void;
}

/**
 * Default configuration
 */
const DEFAULT_RESILIENT_CONFIG: ResilientMemoryServiceConfig = {
  retryConfig: {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts: 2, // Fewer retries for memory operations
    baseDelayMs: 500,
  },
  enableLocalStorageFallback: true,
  enableDefaultPreferencesFallback: true,
};

/**
 * Local storage fallback for session context
 * Used when the primary memory service is unavailable
 */
class LocalStorageFallback {
  private sessions: Map<string, SessionContext> = new Map();
  private preferences: Map<string, UserPreferences> = new Map();

  getSession(sessionId: string): SessionContext | null {
    return this.sessions.get(sessionId) || null;
  }

  setSession(sessionId: string, context: SessionContext): void {
    this.sessions.set(sessionId, context);
  }

  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getPreferences(userId: string, tenantId: string): UserPreferences | null {
    return this.preferences.get(`${tenantId}:${userId}`) || null;
  }

  setPreferences(userId: string, tenantId: string, prefs: UserPreferences): void {
    this.preferences.set(`${tenantId}:${userId}`, prefs);
  }
}

/**
 * Resilient Memory Service that wraps the primary memory service
 * with graceful degradation capabilities
 * 
 * Validates: Requirements 15.2, 15.3, 17.7
 */
export class ResilientMemoryService implements MemoryService {
  private primaryService: MemoryService;
  private degradationService: GracefulDegradationService;
  private localFallback: LocalStorageFallback;
  private config: ResilientMemoryServiceConfig;
  
  // Track service health
  private shortTermMemoryAvailable: boolean = true;
  private longTermMemoryAvailable: boolean = true;
  private episodicMemoryAvailable: boolean = true;

  constructor(
    primaryService: MemoryService,
    config: Partial<ResilientMemoryServiceConfig> = {}
  ) {
    this.primaryService = primaryService;
    this.config = { ...DEFAULT_RESILIENT_CONFIG, ...config };
    this.degradationService = new GracefulDegradationService();
    this.localFallback = new LocalStorageFallback();
    
    // Initialize service statuses
    this.degradationService.updateServiceStatus('short-term-memory', true);
    this.degradationService.updateServiceStatus('long-term-memory', true);
    this.degradationService.updateServiceStatus('episodic-memory', true);
  }

  /**
   * Get the degradation service for external monitoring
   */
  getDegradationService(): GracefulDegradationService {
    return this.degradationService;
  }

  /**
   * Check if the service is operating in degraded mode
   */
  isDegraded(): boolean {
    return !this.shortTermMemoryAvailable || 
           !this.longTermMemoryAvailable || 
           !this.episodicMemoryAvailable;
  }

  /**
   * Get current service health status
   */
  getHealthStatus(): {
    shortTermMemory: boolean;
    longTermMemory: boolean;
    episodicMemory: boolean;
    overall: 'healthy' | 'degraded' | 'offline';
  } {
    const allHealthy = this.shortTermMemoryAvailable && 
                       this.longTermMemoryAvailable && 
                       this.episodicMemoryAvailable;
    const allOffline = !this.shortTermMemoryAvailable && 
                       !this.longTermMemoryAvailable && 
                       !this.episodicMemoryAvailable;
    
    return {
      shortTermMemory: this.shortTermMemoryAvailable,
      longTermMemory: this.longTermMemoryAvailable,
      episodicMemory: this.episodicMemoryAvailable,
      overall: allHealthy ? 'healthy' : (allOffline ? 'offline' : 'degraded'),
    };
  }

  // ==================== Short-Term Memory ====================

  /**
   * Get session context with fallback to local storage
   * Validates: Requirements 17.7
   */
  async getSessionContext(sessionId: string): Promise<SessionContext | null> {
    try {
      const result = await withRetry(
        () => this.primaryService.getSessionContext(sessionId),
        this.config.retryConfig
      );
      
      // Service is healthy
      this.shortTermMemoryAvailable = true;
      this.degradationService.updateServiceStatus('short-term-memory', true);
      
      return result;
    } catch (error) {
      // Service failed
      this.shortTermMemoryAvailable = false;
      this.degradationService.updateServiceStatus(
        'short-term-memory',
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      logError(new MemoryServiceError('getSessionContext', String(error)));
      
      // Fall back to local storage
      if (this.config.enableLocalStorageFallback) {
        this.notifyDegradation('Using local storage for session. Some features may be limited.');
        return this.localFallback.getSession(sessionId);
      }
      
      return null;
    }
  }

  /**
   * Update session context with fallback
   * Validates: Requirements 17.7
   */
  async updateSessionContext(sessionId: string, messages: Message[]): Promise<void> {
    try {
      await withRetry(
        () => this.primaryService.updateSessionContext(sessionId, messages),
        this.config.retryConfig
      );
      
      this.shortTermMemoryAvailable = true;
      this.degradationService.updateServiceStatus('short-term-memory', true);
      
      // Also update local fallback for redundancy
      if (this.config.enableLocalStorageFallback) {
        const existingSession = this.localFallback.getSession(sessionId);
        this.localFallback.setSession(sessionId, {
          sessionId,
          userId: existingSession?.userId || 'unknown',
          tenantId: existingSession?.tenantId || 'unknown',
          messages,
          entities: existingSession?.entities || new Map(),
          lastActivity: new Date(),
          isActive: true,
        });
      }
    } catch (error) {
      this.shortTermMemoryAvailable = false;
      this.degradationService.updateServiceStatus(
        'short-term-memory',
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      logError(new MemoryServiceError('updateSessionContext', String(error)));
      
      // Fall back to local storage
      if (this.config.enableLocalStorageFallback) {
        this.notifyDegradation('Session saved locally. Changes may not persist across devices.');
        const existingSession = this.localFallback.getSession(sessionId);
        this.localFallback.setSession(sessionId, {
          sessionId,
          userId: existingSession?.userId || 'unknown',
          tenantId: existingSession?.tenantId || 'unknown',
          messages,
          entities: existingSession?.entities || new Map(),
          lastActivity: new Date(),
          isActive: true,
        });
      }
    }
  }

  /**
   * Clear session with fallback
   */
  async clearSession(sessionId: string): Promise<void> {
    try {
      await this.primaryService.clearSession(sessionId);
    } catch (error) {
      logError(new MemoryServiceError('clearSession', String(error)));
    }
    
    // Always clear local fallback
    this.localFallback.clearSession(sessionId);
  }

  // ==================== Long-Term Memory ====================

  /**
   * Get user preferences with fallback to defaults
   * Validates: Requirements 15.3
   */
  async getUserPreferences(userId: string, tenantId: string): Promise<UserPreferences | null> {
    try {
      const result = await withRetry(
        () => this.primaryService.getUserPreferences(userId, tenantId),
        this.config.retryConfig
      );
      
      this.longTermMemoryAvailable = true;
      this.degradationService.updateServiceStatus('long-term-memory', true);
      
      return result;
    } catch (error) {
      this.longTermMemoryAvailable = false;
      this.degradationService.updateServiceStatus(
        'long-term-memory',
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      logError(new MemoryServiceError('getUserPreferences', String(error)));
      
      // Fall back to default preferences
      if (this.config.enableDefaultPreferencesFallback) {
        this.notifyDegradation('Personalization temporarily unavailable.');
        return this.getDefaultPreferences(userId, tenantId);
      }
      
      return null;
    }
  }

  /**
   * Update user preferences with fallback
   * Validates: Requirements 15.3
   */
  async updateUserPreferences(
    userId: string,
    tenantId: string,
    prefs: Partial<UserPreferences>
  ): Promise<void> {
    try {
      await withRetry(
        () => this.primaryService.updateUserPreferences(userId, tenantId, prefs),
        this.config.retryConfig
      );
      
      this.longTermMemoryAvailable = true;
      this.degradationService.updateServiceStatus('long-term-memory', true);
    } catch (error) {
      this.longTermMemoryAvailable = false;
      this.degradationService.updateServiceStatus(
        'long-term-memory',
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      logError(new MemoryServiceError('updateUserPreferences', String(error)));
      this.notifyDegradation('Preferences could not be saved. They will be lost when you close the session.');
      
      // Store locally as fallback
      const existing = this.localFallback.getPreferences(userId, tenantId);
      this.localFallback.setPreferences(userId, tenantId, {
        userId,
        tenantId,
        preferredReports: prefs.preferredReports ?? existing?.preferredReports ?? [],
        notificationSettings: {
          ...DEFAULT_NOTIFICATION_SETTINGS,
          ...existing?.notificationSettings,
          ...prefs.notificationSettings,
        },
        displayPreferences: {
          ...DEFAULT_DISPLAY_PREFERENCES,
          ...existing?.displayPreferences,
          ...prefs.displayPreferences,
        },
        updatedAt: new Date(),
      });
    }
  }

  /**
   * Get learned knowledge with graceful degradation
   */
  async getLearnedKnowledge(userId: string, tenantId: string): Promise<LearnedKnowledge[]> {
    try {
      const result = await withRetry(
        () => this.primaryService.getLearnedKnowledge(userId, tenantId),
        this.config.retryConfig
      );
      
      this.longTermMemoryAvailable = true;
      return result;
    } catch (error) {
      this.longTermMemoryAvailable = false;
      logError(new MemoryServiceError('getLearnedKnowledge', String(error)));
      
      // Return empty array - continue without learned knowledge
      this.notifyDegradation('Previous learnings temporarily unavailable.');
      return [];
    }
  }

  /**
   * Store learned knowledge with graceful degradation
   */
  async storeLearnedKnowledge(
    userId: string,
    tenantId: string,
    knowledge: Omit<LearnedKnowledge, 'id' | 'userId' | 'tenantId' | 'learnedAt' | 'usageCount'>
  ): Promise<LearnedKnowledge> {
    try {
      const result = await withRetry(
        () => this.primaryService.storeLearnedKnowledge(userId, tenantId, knowledge),
        this.config.retryConfig
      );
      
      this.longTermMemoryAvailable = true;
      return result;
    } catch (error) {
      this.longTermMemoryAvailable = false;
      logError(new MemoryServiceError('storeLearnedKnowledge', String(error)));
      
      // Return a placeholder - knowledge won't be persisted
      this.notifyDegradation('Learning could not be saved for future sessions.');
      return {
        ...knowledge,
        id: uuidv4(),
        userId,
        tenantId,
        learnedAt: new Date(),
        usageCount: 0,
      };
    }
  }

  // ==================== Episodic Memory ====================

  /**
   * Record episode with graceful degradation
   */
  async recordEpisode(episode: Omit<Episode, 'id'>): Promise<Episode> {
    try {
      const result = await withRetry(
        () => this.primaryService.recordEpisode(episode),
        this.config.retryConfig
      );
      
      this.episodicMemoryAvailable = true;
      this.degradationService.updateServiceStatus('episodic-memory', true);
      
      return result;
    } catch (error) {
      this.episodicMemoryAvailable = false;
      this.degradationService.updateServiceStatus(
        'episodic-memory',
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      logError(new MemoryServiceError('recordEpisode', String(error)));
      
      // Return a placeholder - episode won't be persisted
      return {
        ...episode,
        id: uuidv4(),
      };
    }
  }

  /**
   * Query episodes with graceful degradation
   */
  async queryEpisodes(query: EpisodeQuery): Promise<Episode[]> {
    try {
      const result = await withRetry(
        () => this.primaryService.queryEpisodes(query),
        this.config.retryConfig
      );
      
      this.episodicMemoryAvailable = true;
      this.degradationService.updateServiceStatus('episodic-memory', true);
      
      return result;
    } catch (error) {
      this.episodicMemoryAvailable = false;
      this.degradationService.updateServiceStatus(
        'episodic-memory',
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      logError(new MemoryServiceError('queryEpisodes', String(error)));
      
      // Return empty array - continue without historical context
      this.notifyDegradation('Historical interactions temporarily unavailable.');
      return [];
    }
  }

  /**
   * Get decision history with graceful degradation
   */
  async getDecisionHistory(
    userId: string,
    entityType: string,
    entityId: string
  ): Promise<Decision[]> {
    try {
      const result = await withRetry(
        () => this.primaryService.getDecisionHistory(userId, entityType, entityId),
        this.config.retryConfig
      );
      
      this.episodicMemoryAvailable = true;
      return result;
    } catch (error) {
      this.episodicMemoryAvailable = false;
      logError(new MemoryServiceError('getDecisionHistory', String(error)));
      
      // Return empty array - continue without decision history
      return [];
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Get default preferences when long-term memory is unavailable
   */
  private getDefaultPreferences(userId: string, tenantId: string): UserPreferences {
    return {
      userId,
      tenantId,
      preferredReports: [],
      notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
      displayPreferences: DEFAULT_DISPLAY_PREFERENCES,
      updatedAt: new Date(),
    };
  }

  /**
   * Notify about degradation
   */
  private notifyDegradation(message: string): void {
    if (this.config.onDegradation) {
      this.config.onDegradation(message);
    }
  }

  /**
   * Attempt to recover services
   */
  async attemptRecovery(): Promise<{
    shortTermMemory: boolean;
    longTermMemory: boolean;
    episodicMemory: boolean;
  }> {
    const results = {
      shortTermMemory: false,
      longTermMemory: false,
      episodicMemory: false,
    };

    // Try short-term memory
    try {
      await this.primaryService.getSessionContext('health-check');
      this.shortTermMemoryAvailable = true;
      this.degradationService.updateServiceStatus('short-term-memory', true);
      results.shortTermMemory = true;
    } catch {
      // Still unavailable
    }

    // Try long-term memory
    try {
      await this.primaryService.getUserPreferences('health-check', 'health-check');
      this.longTermMemoryAvailable = true;
      this.degradationService.updateServiceStatus('long-term-memory', true);
      results.longTermMemory = true;
    } catch {
      // Still unavailable
    }

    // Try episodic memory
    try {
      await this.primaryService.queryEpisodes({
        userId: 'health-check',
        tenantId: 'health-check',
        limit: 1,
      });
      this.episodicMemoryAvailable = true;
      this.degradationService.updateServiceStatus('episodic-memory', true);
      results.episodicMemory = true;
    } catch {
      // Still unavailable
    }

    return results;
  }
}

/**
 * Create a resilient memory service
 */
export function createResilientMemoryService(
  primaryService: MemoryService,
  config?: Partial<ResilientMemoryServiceConfig>
): ResilientMemoryService {
  return new ResilientMemoryService(primaryService, config);
}
