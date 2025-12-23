/**
 * AgentCore Memory Adapter for Durable Storage Persistence
 * 
 * Provides integration with AWS Bedrock AgentCore Memory for:
 * - Short-term memory (session-scoped)
 * - Long-term memory (user/tenant-scoped)
 * - Episodic memory (historical interactions)
 * 
 * Validates: Requirements 17.4, 17.5, 17.6, 17.7
 */

import { v4 as uuidv4 } from 'uuid';
import {
  MemoryService,
  AgentCoreMemoryConfig,
  SessionContext,
  Message,
  UserPreferences,
  LearnedKnowledge,
  Episode,
  EpisodeQuery,
  Decision,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_DISPLAY_PREFERENCES,
  MAX_SESSION_MESSAGES,
  SESSION_TIMEOUT_MS,
} from '../types/memory.js';
import { logError } from './error-handling-service.js';

/**
 * AgentCore Memory client interface
 * This would be implemented using the actual AWS SDK in production
 */
export interface AgentCoreMemoryClient {
  /**
   * Store a memory entry
   */
  putMemory(params: {
    memoryId: string;
    sessionId: string;
    actorId: string;
    content: unknown;
    memoryType: 'short_term' | 'long_term' | 'episodic';
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; entryId: string }>;

  /**
   * Retrieve memory entries
   */
  getMemory(params: {
    memoryId: string;
    sessionId?: string;
    actorId?: string;
    memoryType?: 'short_term' | 'long_term' | 'episodic';
    query?: string;
    limit?: number;
  }): Promise<{ entries: Array<{ id: string; content: unknown; metadata: Record<string, unknown> }> }>;

  /**
   * Delete memory entries
   */
  deleteMemory(params: {
    memoryId: string;
    sessionId?: string;
    entryId?: string;
  }): Promise<{ success: boolean }>;
}

/**
 * Mock AgentCore Memory client for development/testing
 */
export class MockAgentCoreMemoryClient implements AgentCoreMemoryClient {
  private storage: Map<string, Array<{ id: string; content: unknown; metadata: Record<string, unknown> }>> = new Map();

  async putMemory(params: {
    memoryId: string;
    sessionId: string;
    actorId: string;
    content: unknown;
    memoryType: 'short_term' | 'long_term' | 'episodic';
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; entryId: string }> {
    const key = `${params.memoryId}:${params.memoryType}:${params.sessionId || params.actorId}`;
    const entryId = uuidv4();
    
    const entries = this.storage.get(key) || [];
    entries.push({
      id: entryId,
      content: params.content,
      metadata: {
        ...params.metadata,
        memoryType: params.memoryType,
        sessionId: params.sessionId,
        actorId: params.actorId,
        timestamp: new Date().toISOString(),
      },
    });
    this.storage.set(key, entries);

    return { success: true, entryId };
  }

  async getMemory(params: {
    memoryId: string;
    sessionId?: string;
    actorId?: string;
    memoryType?: 'short_term' | 'long_term' | 'episodic';
    limit?: number;
  }): Promise<{ entries: Array<{ id: string; content: unknown; metadata: Record<string, unknown> }> }> {
    const key = `${params.memoryId}:${params.memoryType || 'short_term'}:${params.sessionId || params.actorId}`;
    const entries = this.storage.get(key) || [];
    
    const limited = params.limit ? entries.slice(-params.limit) : entries;
    return { entries: limited };
  }

  async deleteMemory(params: {
    memoryId: string;
    sessionId?: string;
    entryId?: string;
  }): Promise<{ success: boolean }> {
    if (params.entryId) {
      // Delete specific entry
      for (const [key, entries] of this.storage.entries()) {
        if (key.startsWith(params.memoryId)) {
          const filtered = entries.filter(e => e.id !== params.entryId);
          this.storage.set(key, filtered);
        }
      }
    } else if (params.sessionId) {
      // Delete all entries for session
      for (const key of this.storage.keys()) {
        if (key.includes(params.sessionId)) {
          this.storage.delete(key);
        }
      }
    }
    return { success: true };
  }

  /**
   * Clear all storage (for testing)
   */
  clear(): void {
    this.storage.clear();
  }
}

/**
 * AgentCore Memory Service implementation
 * 
 * Validates: Requirements 17.4, 17.5, 17.6, 17.7
 */
export class AgentCoreMemoryService implements MemoryService {
  private config: AgentCoreMemoryConfig;
  private client: AgentCoreMemoryClient;
  
  // Local cache for performance
  private sessionCache: Map<string, SessionContext> = new Map();
  private preferencesCache: Map<string, UserPreferences> = new Map();

  constructor(config: AgentCoreMemoryConfig, client?: AgentCoreMemoryClient) {
    this.config = config;
    this.client = client || new MockAgentCoreMemoryClient();
  }

  /**
   * Get user/tenant key for scoped data
   */
  private getUserTenantKey(userId: string, tenantId: string): string {
    return `${tenantId}:${userId}`;
  }

  // ==================== Short-Term Memory ====================

  /**
   * Get session context from AgentCore Memory
   * Validates: Requirements 17.4
   */
  async getSessionContext(sessionId: string): Promise<SessionContext | null> {
    // Check cache first
    const cached = this.sessionCache.get(sessionId);
    if (cached) {
      // Check if session has expired
      const now = new Date();
      const sessionAge = now.getTime() - cached.lastActivity.getTime();
      if (sessionAge > SESSION_TIMEOUT_MS) {
        await this.clearSession(sessionId);
        return null;
      }
      return cached;
    }

    try {
      const result = await this.client.getMemory({
        memoryId: this.config.memoryId,
        sessionId,
        memoryType: 'short_term',
        limit: 1,
      });

      if (result.entries.length === 0) {
        return null;
      }

      const entry = result.entries[result.entries.length - 1];
      const session = this.deserializeSession(entry.content);
      
      // Update cache
      this.sessionCache.set(sessionId, session);
      
      return session;
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Update session context in AgentCore Memory
   * Validates: Requirements 17.4
   */
  async updateSessionContext(sessionId: string, messages: Message[]): Promise<void> {
    let session = this.sessionCache.get(sessionId);
    
    if (!session) {
      session = {
        sessionId,
        userId: this.config.actorId,
        tenantId: 'default',
        messages: [],
        entities: new Map(),
        lastActivity: new Date(),
        isActive: true,
      };
    }

    // Update messages
    session.messages = messages;
    session.lastActivity = new Date();

    // Extract entities from messages
    this.extractEntitiesFromMessages(session, messages);

    // Summarize if exceeding message limit
    if (session.messages.length > MAX_SESSION_MESSAGES) {
      session = await this.summarizeSessionContext(session);
    }

    // Update cache
    this.sessionCache.set(sessionId, session);

    // Persist to AgentCore Memory
    try {
      await this.client.putMemory({
        memoryId: this.config.memoryId,
        sessionId,
        actorId: this.config.actorId,
        content: this.serializeSession(session),
        memoryType: 'short_term',
        metadata: {
          messageCount: session.messages.length,
          lastActivity: session.lastActivity.toISOString(),
        },
      });
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      // Continue with cached version
    }
  }

  /**
   * Clear session from AgentCore Memory
   * Validates: Requirements 17.4
   */
  async clearSession(sessionId: string): Promise<void> {
    this.sessionCache.delete(sessionId);

    try {
      await this.client.deleteMemory({
        memoryId: this.config.memoryId,
        sessionId,
      });
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==================== Long-Term Memory ====================

  /**
   * Get user preferences from AgentCore Memory
   * Validates: Requirements 17.5
   */
  async getUserPreferences(userId: string, tenantId: string): Promise<UserPreferences | null> {
    const key = this.getUserTenantKey(userId, tenantId);
    
    // Check cache
    const cached = this.preferencesCache.get(key);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.client.getMemory({
        memoryId: this.config.memoryId,
        actorId: key,
        memoryType: 'long_term',
        limit: 1,
      });

      if (result.entries.length === 0) {
        return null;
      }

      const prefs = result.entries[result.entries.length - 1].content as UserPreferences;
      this.preferencesCache.set(key, prefs);
      return prefs;
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Update user preferences in AgentCore Memory
   * Validates: Requirements 17.5
   */
  async updateUserPreferences(
    userId: string,
    tenantId: string,
    prefs: Partial<UserPreferences>
  ): Promise<void> {
    const key = this.getUserTenantKey(userId, tenantId);
    const existing = await this.getUserPreferences(userId, tenantId);

    const updated: UserPreferences = {
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
      customQuickActions: prefs.customQuickActions ?? existing?.customQuickActions,
      updatedAt: new Date(),
    };

    this.preferencesCache.set(key, updated);

    try {
      await this.client.putMemory({
        memoryId: this.config.memoryId,
        sessionId: key,
        actorId: key,
        content: updated,
        memoryType: 'long_term',
      });
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get learned knowledge from AgentCore Memory
   * Validates: Requirements 17.5
   */
  async getLearnedKnowledge(userId: string, tenantId: string): Promise<LearnedKnowledge[]> {
    const key = this.getUserTenantKey(userId, tenantId);

    try {
      const result = await this.client.getMemory({
        memoryId: this.config.memoryId,
        actorId: `${key}:knowledge`,
        memoryType: 'long_term',
      });

      return result.entries.map(e => e.content as LearnedKnowledge);
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Store learned knowledge in AgentCore Memory
   * Validates: Requirements 17.5
   */
  async storeLearnedKnowledge(
    userId: string,
    tenantId: string,
    knowledge: Omit<LearnedKnowledge, 'id' | 'userId' | 'tenantId' | 'learnedAt' | 'usageCount'>
  ): Promise<LearnedKnowledge> {
    const key = this.getUserTenantKey(userId, tenantId);

    const newKnowledge: LearnedKnowledge = {
      ...knowledge,
      id: uuidv4(),
      userId,
      tenantId,
      learnedAt: new Date(),
      usageCount: 0,
    };

    try {
      await this.client.putMemory({
        memoryId: this.config.memoryId,
        sessionId: `${key}:knowledge`,
        actorId: `${key}:knowledge`,
        content: newKnowledge,
        memoryType: 'long_term',
      });
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }

    return newKnowledge;
  }

  // ==================== Episodic Memory ====================

  /**
   * Record episode in AgentCore Memory
   * Validates: Requirements 17.6
   */
  async recordEpisode(episode: Omit<Episode, 'id'>): Promise<Episode> {
    const newEpisode: Episode = {
      ...episode,
      id: uuidv4(),
    };

    try {
      await this.client.putMemory({
        memoryId: this.config.memoryId,
        sessionId: episode.sessionId,
        actorId: episode.userId,
        content: newEpisode,
        memoryType: 'episodic',
        metadata: {
          type: episode.type,
          timestamp: episode.timestamp.toISOString(),
          tenantId: episode.tenantId,
        },
      });
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
    }

    return newEpisode;
  }

  /**
   * Query episodes from AgentCore Memory
   * Validates: Requirements 17.6
   */
  async queryEpisodes(query: EpisodeQuery): Promise<Episode[]> {
    try {
      const result = await this.client.getMemory({
        memoryId: this.config.memoryId,
        actorId: query.userId,
        memoryType: 'episodic',
        limit: query.limit || 50,
      });

      let episodes = result.entries.map(e => e.content as Episode);

      // Apply filters
      episodes = episodes.filter(episode => {
        if (episode.tenantId !== query.tenantId) return false;
        if (query.startDate && episode.timestamp < query.startDate) return false;
        if (query.endDate && episode.timestamp > query.endDate) return false;
        if (query.types && !query.types.includes(episode.type)) return false;
        return true;
      });

      // Sort by timestamp descending
      episodes.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return episodes;
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * Get decision history from AgentCore Memory
   * Validates: Requirements 17.6
   */
  async getDecisionHistory(
    userId: string,
    entityType: string,
    entityId: string
  ): Promise<Decision[]> {
    try {
      const result = await this.client.getMemory({
        memoryId: this.config.memoryId,
        actorId: userId,
        memoryType: 'episodic',
      });

      const decisions = result.entries
        .map(e => e.content)
        .filter((content): content is Decision => 
          (content as any).decisionType !== undefined &&
          (content as any).entityType === entityType &&
          (content as any).entityId === entityId
        );

      return decisions.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
    } catch (error) {
      logError(error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  // ==================== Helper Methods ====================

  private serializeSession(session: SessionContext): unknown {
    return {
      ...session,
      entities: Array.from(session.entities.entries()),
      lastActivity: session.lastActivity.toISOString(),
      messages: session.messages.map(m => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    };
  }

  private deserializeSession(data: unknown): SessionContext {
    const raw = data as any;
    return {
      ...raw,
      entities: new Map(raw.entities || []),
      lastActivity: new Date(raw.lastActivity),
      messages: (raw.messages || []).map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    };
  }

  private extractEntitiesFromMessages(session: SessionContext, messages: Message[]): void {
    for (const message of messages) {
      if (message.references) {
        for (const ref of message.references) {
          session.entities.set(ref.id, {
            entityType: ref.type,
            entityId: ref.id,
            displayName: ref.title,
            lastMentioned: message.timestamp,
            context: { source: ref.source },
          });
        }
      }
    }
  }

  private async summarizeSessionContext(session: SessionContext): Promise<SessionContext> {
    const recentMessages = session.messages.slice(-MAX_SESSION_MESSAGES);
    const olderMessages = session.messages.slice(0, -MAX_SESSION_MESSAGES);

    const summary = this.createMessageSummary(olderMessages);

    return {
      ...session,
      messages: recentMessages,
      summary: session.summary ? `${session.summary}\n\n${summary}` : summary,
    };
  }

  private createMessageSummary(messages: Message[]): string {
    if (messages.length === 0) return '';

    const topics: Set<string> = new Set();
    const entities: Set<string> = new Set();

    for (const message of messages) {
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          topics.add(toolCall.name);
        }
      }
      if (message.references) {
        for (const ref of message.references) {
          entities.add(`${ref.type}: ${ref.title}`);
        }
      }
    }

    return `Previous conversation summary (${messages.length} messages):\n` +
      `- Topics: ${Array.from(topics).join(', ') || 'general queries'}\n` +
      `- Entities: ${Array.from(entities).join(', ') || 'none'}`;
  }
}

/**
 * Create an AgentCore Memory Service instance
 */
export function createAgentCoreMemoryService(
  config: AgentCoreMemoryConfig,
  client?: AgentCoreMemoryClient
): MemoryService {
  return new AgentCoreMemoryService(config, client);
}
