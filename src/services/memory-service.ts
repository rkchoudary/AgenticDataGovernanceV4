/**
 * Memory Service for the Regulatory AI Assistant
 * 
 * Implements the three-tier memory architecture:
 * - Short-Term Memory: Session-scoped conversation context
 * - Long-Term Memory: Persistent user preferences and learned knowledge
 * - Episodic Memory: Historical interaction records for audit trails
 * 
 * Validates: Requirements 2.1-2.5, 3.1-3.5, 4.1-4.5, 17.1-17.7
 */

import { v4 as uuidv4 } from 'uuid';
import {
  AgentCoreMemoryConfig,
  SessionContext,
  Message,
  EntityReference,
  UserPreferences,
  LearnedKnowledge,
  Episode,
  EpisodeQuery,
  Decision,
  MemoryService,
  DEFAULT_NOTIFICATION_SETTINGS,
  DEFAULT_DISPLAY_PREFERENCES,
  MAX_SESSION_MESSAGES,
  SESSION_TIMEOUT_MS,
} from '../types/memory.js';

/**
 * In-memory implementation of the Memory Service
 * 
 * This implementation provides:
 * - Session-scoped short-term memory with entity tracking
 * - User/tenant-scoped long-term memory with preferences
 * - Episodic memory for historical interactions and decisions
 * - Tenant isolation for all data access
 * 
 * In production, this would integrate with AWS Bedrock AgentCore Memory
 */
export class InMemoryMemoryService implements MemoryService {
  // Config stored for potential AgentCore integration
  private _config: AgentCoreMemoryConfig | null = null;
  
  // Short-term memory storage (session-scoped)
  private sessions: Map<string, SessionContext> = new Map();
  
  // Long-term memory storage (user/tenant-scoped)
  private userPreferences: Map<string, UserPreferences> = new Map();
  private learnedKnowledge: Map<string, LearnedKnowledge[]> = new Map();
  
  // Episodic memory storage
  private episodes: Episode[] = [];
  private decisions: Decision[] = [];

  constructor(config?: AgentCoreMemoryConfig) {
    this._config = config || null;
  }

  /**
   * Get the current configuration
   */
  get config(): AgentCoreMemoryConfig | null {
    return this._config;
  }

  /**
   * Generate a composite key for user/tenant scoped data
   */
  private getUserTenantKey(userId: string, tenantId: string): string {
    return `${tenantId}:${userId}`;
  }

  // ==================== Short-Term Memory ====================

  /**
   * Get the session context for a given session ID
   * Validates: Requirements 2.1, 2.3
   */
  async getSessionContext(sessionId: string): Promise<SessionContext | null> {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    // Check if session has expired
    const now = new Date();
    const sessionAge = now.getTime() - session.lastActivity.getTime();
    if (sessionAge > SESSION_TIMEOUT_MS) {
      // Session expired, clear it
      await this.clearSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Update the session context with new messages
   * Implements entity tracking for pronoun resolution
   * Implements context summarization when exceeding message limit
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
   */
  async updateSessionContext(sessionId: string, messages: Message[]): Promise<void> {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // Create new session - extract userId and tenantId from first message context or use defaults
      session = {
        sessionId,
        userId: 'unknown',
        tenantId: 'unknown',
        messages: [],
        entities: new Map(),
        lastActivity: new Date(),
        isActive: true,
      };
    }

    // Update messages
    session.messages = messages;
    session.lastActivity = new Date();

    // Extract entities from messages for pronoun resolution
    this.extractEntitiesFromMessages(session, messages);

    // Summarize if exceeding message limit
    if (session.messages.length > MAX_SESSION_MESSAGES) {
      session = await this.summarizeSessionContext(session);
    }

    this.sessions.set(sessionId, session);
  }

  /**
   * Initialize a new session with user and tenant context
   */
  async initializeSession(
    sessionId: string,
    userId: string,
    tenantId: string
  ): Promise<SessionContext> {
    const session: SessionContext = {
      sessionId,
      userId,
      tenantId,
      messages: [],
      entities: new Map(),
      lastActivity: new Date(),
      isActive: true,
    };
    
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Clear a session from short-term memory
   * Validates: Requirements 2.4
   */
  async clearSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  /**
   * Extract entities from messages for pronoun resolution
   * Validates: Requirements 2.3
   */
  private extractEntitiesFromMessages(session: SessionContext, messages: Message[]): void {
    for (const message of messages) {
      // Extract entities from references
      if (message.references) {
        for (const ref of message.references) {
          const entityRef: EntityReference = {
            entityType: ref.type,
            entityId: ref.id,
            displayName: ref.title,
            lastMentioned: message.timestamp,
            context: { source: ref.source },
          };
          session.entities.set(ref.id, entityRef);
        }
      }

      // Extract entities from tool calls
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          // Extract entity references from tool parameters
          if (toolCall.parameters) {
            this.extractEntitiesFromParams(session, toolCall.parameters, message.timestamp);
          }
        }
      }
    }
  }

  /**
   * Extract entity references from tool call parameters
   */
  private extractEntitiesFromParams(
    session: SessionContext,
    params: Record<string, unknown>,
    timestamp: Date
  ): void {
    // Look for common entity ID patterns
    const entityPatterns = [
      { key: 'reportId', type: 'report' },
      { key: 'report_id', type: 'report' },
      { key: 'cdeId', type: 'cde' },
      { key: 'cde_id', type: 'cde' },
      { key: 'issueId', type: 'issue' },
      { key: 'issue_id', type: 'issue' },
      { key: 'cycleId', type: 'cycle' },
      { key: 'cycle_id', type: 'cycle' },
    ];

    for (const pattern of entityPatterns) {
      const value = params[pattern.key];
      if (typeof value === 'string') {
        const entityRef: EntityReference = {
          entityType: pattern.type,
          entityId: value,
          displayName: value, // Will be enriched later
          lastMentioned: timestamp,
        };
        session.entities.set(value, entityRef);
      }
    }
  }

  /**
   * Summarize session context when exceeding message limit
   * Validates: Requirements 2.2
   */
  private async summarizeSessionContext(session: SessionContext): Promise<SessionContext> {
    // Keep the most recent messages
    const recentMessages = session.messages.slice(-MAX_SESSION_MESSAGES);
    const olderMessages = session.messages.slice(0, -MAX_SESSION_MESSAGES);

    // Create a summary of older messages
    const summary = this.createMessageSummary(olderMessages);

    return {
      ...session,
      messages: recentMessages,
      summary: session.summary 
        ? `${session.summary}\n\n${summary}` 
        : summary,
    };
  }

  /**
   * Create a summary of messages
   */
  private createMessageSummary(messages: Message[]): string {
    if (messages.length === 0) {
      return '';
    }

    // Extract key topics and entities discussed
    const topics: Set<string> = new Set();
    const entitiesMentioned: Set<string> = new Set();

    for (const message of messages) {
      // Extract topics from tool calls
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          topics.add(toolCall.name);
        }
      }

      // Extract entities from references
      if (message.references) {
        for (const ref of message.references) {
          entitiesMentioned.add(`${ref.type}: ${ref.title}`);
        }
      }
    }

    const topicList = Array.from(topics).join(', ');
    const entityList = Array.from(entitiesMentioned).join(', ');

    return `Previous conversation summary (${messages.length} messages):\n` +
      `- Topics discussed: ${topicList || 'general queries'}\n` +
      `- Entities referenced: ${entityList || 'none'}`;
  }

  /**
   * Resolve a pronoun reference using session context
   * Validates: Requirements 2.3
   */
  async resolveEntityReference(
    sessionId: string,
    entityType?: string
  ): Promise<EntityReference | null> {
    const session = await this.getSessionContext(sessionId);
    if (!session) {
      return null;
    }

    // Find the most recently mentioned entity of the given type
    let mostRecent: EntityReference | null = null;
    let mostRecentTime = new Date(0);

    for (const entity of session.entities.values()) {
      if (entityType && entity.entityType !== entityType) {
        continue;
      }
      if (entity.lastMentioned > mostRecentTime) {
        mostRecent = entity;
        mostRecentTime = entity.lastMentioned;
      }
    }

    return mostRecent;
  }


  // ==================== Long-Term Memory ====================

  /**
   * Get user preferences from long-term memory
   * Validates: Requirements 3.2, 3.5
   */
  async getUserPreferences(userId: string, tenantId: string): Promise<UserPreferences | null> {
    const key = this.getUserTenantKey(userId, tenantId);
    return this.userPreferences.get(key) || null;
  }

  /**
   * Update user preferences in long-term memory
   * Validates: Requirements 3.1, 3.5
   */
  async updateUserPreferences(
    userId: string,
    tenantId: string,
    prefs: Partial<UserPreferences>
  ): Promise<void> {
    const key = this.getUserTenantKey(userId, tenantId);
    const existing = this.userPreferences.get(key);

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

    this.userPreferences.set(key, updated);
  }

  /**
   * Get learned knowledge from long-term memory
   * Validates: Requirements 3.3, 3.4, 3.5
   */
  async getLearnedKnowledge(userId: string, tenantId: string): Promise<LearnedKnowledge[]> {
    const key = this.getUserTenantKey(userId, tenantId);
    return this.learnedKnowledge.get(key) || [];
  }

  /**
   * Store learned knowledge in long-term memory
   * Validates: Requirements 3.3, 3.5
   */
  async storeLearnedKnowledge(
    userId: string,
    tenantId: string,
    knowledge: Omit<LearnedKnowledge, 'id' | 'userId' | 'tenantId' | 'learnedAt' | 'usageCount'>
  ): Promise<LearnedKnowledge> {
    const key = this.getUserTenantKey(userId, tenantId);
    const existing = this.learnedKnowledge.get(key) || [];

    const newKnowledge: LearnedKnowledge = {
      ...knowledge,
      id: uuidv4(),
      userId,
      tenantId,
      learnedAt: new Date(),
      usageCount: 0,
    };

    existing.push(newKnowledge);
    this.learnedKnowledge.set(key, existing);

    return newKnowledge;
  }

  /**
   * Update usage count for learned knowledge
   */
  async updateKnowledgeUsage(knowledgeId: string, userId: string, tenantId: string): Promise<void> {
    const key = this.getUserTenantKey(userId, tenantId);
    const knowledge = this.learnedKnowledge.get(key) || [];
    
    const item = knowledge.find(k => k.id === knowledgeId);
    if (item) {
      item.usageCount++;
      item.lastUsedAt = new Date();
    }
  }

  // ==================== Episodic Memory ====================

  /**
   * Record an episode in episodic memory
   * Validates: Requirements 4.1, 4.2, 4.3, 4.5
   */
  async recordEpisode(episode: Omit<Episode, 'id'>): Promise<Episode> {
    const newEpisode: Episode = {
      ...episode,
      id: uuidv4(),
    };

    this.episodes.push(newEpisode);
    return newEpisode;
  }

  /**
   * Query episodes from episodic memory
   * Validates: Requirements 4.1, 4.4
   */
  async queryEpisodes(query: EpisodeQuery): Promise<Episode[]> {
    let results = this.episodes.filter(episode => {
      // Tenant isolation - CRITICAL for security
      if (episode.tenantId !== query.tenantId) {
        return false;
      }

      // User filter
      if (episode.userId !== query.userId) {
        return false;
      }

      // Date range filter
      if (query.startDate && episode.timestamp < query.startDate) {
        return false;
      }
      if (query.endDate && episode.timestamp > query.endDate) {
        return false;
      }

      // Type filter
      if (query.types && query.types.length > 0 && !query.types.includes(episode.type)) {
        return false;
      }

      // Entity filter
      if (query.entityType || query.entityId) {
        const hasMatchingEntity = episode.relatedEntities.some(entity => {
          if (query.entityType && entity.entityType !== query.entityType) {
            return false;
          }
          if (query.entityId && entity.entityId !== query.entityId) {
            return false;
          }
          return true;
        });
        if (!hasMatchingEntity) {
          return false;
        }
      }

      // Tag filter
      if (query.tags && query.tags.length > 0) {
        const episodeTags = episode.tags || [];
        const hasMatchingTag = query.tags.some(tag => episodeTags.includes(tag));
        if (!hasMatchingTag) {
          return false;
        }
      }

      // Text search
      if (query.searchText) {
        const searchLower = query.searchText.toLowerCase();
        const contentMatch = episode.content.toLowerCase().includes(searchLower);
        const outcomeMatch = episode.outcome?.toLowerCase().includes(searchLower);
        if (!contentMatch && !outcomeMatch) {
          return false;
        }
      }

      return true;
    });

    // Sort by timestamp descending (most recent first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get decision history for a specific entity
   * Validates: Requirements 4.2, 4.5
   */
  async getDecisionHistory(
    userId: string,
    entityType: string,
    entityId: string
  ): Promise<Decision[]> {
    // First, get the tenant from user's sessions or preferences
    // For now, we'll filter decisions that match the user
    return this.decisions.filter(decision => {
      if (decision.userId !== userId) {
        return false;
      }
      if (decision.entityType !== entityType) {
        return false;
      }
      if (decision.entityId !== entityId) {
        return false;
      }
      return true;
    }).sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
  }

  /**
   * Record a decision in episodic memory
   * Validates: Requirements 4.2, 4.5
   */
  async recordDecision(decision: Omit<Decision, 'id'>): Promise<Decision> {
    const newDecision: Decision = {
      ...decision,
      id: uuidv4(),
    };

    this.decisions.push(newDecision);

    // Also record as an episode for audit trail
    await this.recordEpisode({
      sessionId: decision.episodeId,
      userId: decision.userId,
      tenantId: decision.tenantId,
      timestamp: decision.decidedAt,
      type: 'decision',
      content: `Decision: ${decision.decision} for ${decision.entityType} ${decision.entityId}`,
      context: {
        decisionType: decision.decisionType,
        rationale: decision.rationale,
        aiRecommendation: decision.aiRecommendation,
        impact: decision.impact,
      },
      relatedEntities: [{
        entityType: decision.entityType,
        entityId: decision.entityId,
        displayName: decision.entityId,
        lastMentioned: decision.decidedAt,
      }],
      outcome: decision.decision,
      tags: ['decision', decision.decisionType],
    });

    return newDecision;
  }

  // ==================== Utility Methods ====================

  /**
   * Clear all memory (for testing)
   */
  async clearAll(): Promise<void> {
    this.sessions.clear();
    this.userPreferences.clear();
    this.learnedKnowledge.clear();
    this.episodes = [];
    this.decisions = [];
  }

  /**
   * Get all active sessions (for monitoring)
   */
  async getActiveSessions(): Promise<SessionContext[]> {
    const now = new Date();
    const activeSessions: SessionContext[] = [];

    for (const session of this.sessions.values()) {
      const sessionAge = now.getTime() - session.lastActivity.getTime();
      if (sessionAge <= SESSION_TIMEOUT_MS && session.isActive) {
        activeSessions.push(session);
      }
    }

    return activeSessions;
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    activeSessions: number;
    totalUsers: number;
    totalEpisodes: number;
    totalDecisions: number;
  }> {
    const activeSessions = await this.getActiveSessions();
    return {
      activeSessions: activeSessions.length,
      totalUsers: this.userPreferences.size,
      totalEpisodes: this.episodes.length,
      totalDecisions: this.decisions.length,
    };
  }
}

/**
 * Create a new Memory Service instance
 */
export function createMemoryService(config?: AgentCoreMemoryConfig): MemoryService {
  return new InMemoryMemoryService(config);
}
