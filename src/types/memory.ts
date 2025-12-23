/**
 * Memory types for the Regulatory AI Assistant
 * 
 * Defines types for the three-tier memory architecture:
 * - Short-Term Memory: Session-scoped conversation context
 * - Long-Term Memory: Persistent user preferences and learned knowledge
 * - Episodic Memory: Historical interaction records for audit trails
 * 
 * Validates: Requirements 17.1, 17.2, 17.3
 */

// ==================== AgentCore Memory Configuration ====================

/**
 * Configuration for AWS Bedrock AgentCore Memory integration
 * Validates: Requirements 17.1, 17.2, 17.3
 */
export interface AgentCoreMemoryConfig {
  /** The AgentCore Memory ID for the memory store */
  memoryId: string;
  /** The session ID for grouping conversation events */
  sessionId: string;
  /** The actor ID for tracking who performed actions */
  actorId: string;
  /** AWS region for AgentCore Memory */
  region: string;
}

// ==================== Message Types ====================

/**
 * Role of a message in the conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Status of a tool call execution
 */
export type ToolCallStatus = 'pending' | 'executing' | 'completed' | 'failed';

/**
 * Type of reference in a message
 */
export type ReferenceType = 'report' | 'cde' | 'lineage' | 'issue' | 'audit';

/**
 * A tool call made by the assistant
 */
export interface ToolCall {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool being called */
  name: string;
  /** Parameters passed to the tool */
  parameters: Record<string, unknown>;
  /** Result of the tool execution */
  result?: unknown;
  /** Current status of the tool call */
  status: ToolCallStatus;
  /** Duration of the tool execution in milliseconds */
  duration?: number;
}

/**
 * A reference to an entity in the system
 */
export interface Reference {
  /** Type of the referenced entity */
  type: ReferenceType;
  /** Unique identifier of the entity */
  id: string;
  /** Display title for the reference */
  title: string;
  /** Source system or location */
  source: string;
  /** Optional URL to the entity */
  url?: string;
}

/**
 * A message in the conversation
 */
export interface Message {
  /** Unique identifier for the message */
  id: string;
  /** Role of the message sender */
  role: MessageRole;
  /** Content of the message */
  content: string;
  /** Timestamp when the message was created */
  timestamp: Date;
  /** Tool calls made in this message */
  toolCalls?: ToolCall[];
  /** References cited in this message */
  references?: Reference[];
  /** Whether the message is currently streaming */
  isStreaming?: boolean;
}

// ==================== Entity Reference for Pronoun Resolution ====================

/**
 * Reference to an entity mentioned in conversation for pronoun resolution
 */
export interface EntityReference {
  /** Type of the entity (report, cde, issue, etc.) */
  entityType: string;
  /** Unique identifier of the entity */
  entityId: string;
  /** Display name of the entity */
  displayName: string;
  /** When the entity was last mentioned */
  lastMentioned: Date;
  /** Additional context about the entity */
  context?: Record<string, unknown>;
}

// ==================== Short-Term Memory (Session Context) ====================

/**
 * Session context for short-term memory
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */
export interface SessionContext {
  /** Unique session identifier */
  sessionId: string;
  /** User ID for the session */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Messages in the current conversation */
  messages: Message[];
  /** Entities mentioned for pronoun resolution */
  entities: Map<string, EntityReference>;
  /** Timestamp of last activity */
  lastActivity: Date;
  /** Summarized older context when messages exceed limit */
  summary?: string;
  /** Whether the session is active */
  isActive: boolean;
}

// ==================== Long-Term Memory (User Preferences) ====================

/**
 * Notification settings for a user
 */
export interface NotificationSettings {
  /** Enable email notifications */
  emailEnabled: boolean;
  /** Enable in-app notifications */
  inAppEnabled: boolean;
  /** Notification frequency preference */
  frequency: 'immediate' | 'daily' | 'weekly';
  /** Types of notifications to receive */
  enabledTypes: string[];
}

/**
 * Display preferences for a user
 */
export interface DisplayPreferences {
  /** Preferred theme */
  theme: 'light' | 'dark' | 'system';
  /** Preferred date format */
  dateFormat: string;
  /** Preferred timezone */
  timezone: string;
  /** Number of items per page */
  pageSize: number;
  /** Compact or expanded view */
  viewMode: 'compact' | 'expanded';
}

/**
 * User preferences stored in long-term memory
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
export interface UserPreferences {
  /** User ID */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Preferred regulatory reports */
  preferredReports: string[];
  /** Notification settings */
  notificationSettings: NotificationSettings;
  /** Display preferences */
  displayPreferences: DisplayPreferences;
  /** Custom quick actions */
  customQuickActions?: string[];
  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Learned knowledge stored in long-term memory
 */
export interface LearnedKnowledge {
  /** Unique identifier */
  id: string;
  /** User ID who learned this */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Type of knowledge (mapping, preference, pattern) */
  knowledgeType: 'mapping' | 'preference' | 'pattern' | 'correction';
  /** The learned content */
  content: string;
  /** Structured data for the knowledge */
  data: Record<string, unknown>;
  /** Confidence score (0-1) */
  confidence: number;
  /** When this was learned */
  learnedAt: Date;
  /** When this was last used */
  lastUsedAt?: Date;
  /** Number of times this knowledge was applied */
  usageCount: number;
  /** Related entities */
  relatedEntities: string[];
}

// ==================== Episodic Memory (Historical Interactions) ====================

/**
 * Type of episode in episodic memory
 */
export type EpisodeType = 'query' | 'decision' | 'recommendation' | 'action' | 'error';

/**
 * An episode recorded in episodic memory
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
export interface Episode {
  /** Unique identifier for the episode */
  id: string;
  /** Session ID where this occurred */
  sessionId: string;
  /** User ID who was involved */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Timestamp of the episode */
  timestamp: Date;
  /** Type of episode */
  type: EpisodeType;
  /** Description of what happened */
  content: string;
  /** Additional context data */
  context: Record<string, unknown>;
  /** Outcome of the episode */
  outcome?: string;
  /** Related entities */
  relatedEntities: EntityReference[];
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Query parameters for searching episodes
 */
export interface EpisodeQuery {
  /** User ID to filter by */
  userId: string;
  /** Tenant ID to filter by */
  tenantId: string;
  /** Start date for the query range */
  startDate?: Date;
  /** End date for the query range */
  endDate?: Date;
  /** Episode types to include */
  types?: EpisodeType[];
  /** Entity type to filter by */
  entityType?: string;
  /** Entity ID to filter by */
  entityId?: string;
  /** Tags to filter by */
  tags?: string[];
  /** Maximum number of results */
  limit?: number;
  /** Search text for content */
  searchText?: string;
}

/**
 * A decision recorded in episodic memory
 */
export interface Decision {
  /** Unique identifier */
  id: string;
  /** Episode ID this decision belongs to */
  episodeId: string;
  /** User who made the decision */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Type of decision */
  decisionType: string;
  /** Entity type the decision was about */
  entityType: string;
  /** Entity ID the decision was about */
  entityId: string;
  /** The decision made */
  decision: 'approved' | 'rejected' | 'deferred';
  /** Rationale for the decision */
  rationale: string;
  /** When the decision was made */
  decidedAt: Date;
  /** AI recommendation that was presented */
  aiRecommendation?: string;
  /** Impact of the decision */
  impact?: string;
}

// ==================== Memory Entry (Generic Storage) ====================

/**
 * Type of memory entry
 */
export type MemoryType = 'short_term' | 'long_term' | 'episodic';

/**
 * Scope for memory data isolation
 */
export interface MemoryScope {
  /** Tenant ID for tenant isolation */
  tenantId: string;
  /** User ID for user-scoped data */
  userId?: string;
  /** Session ID for session-scoped data */
  sessionId?: string;
}

/**
 * Metadata for a memory entry
 */
export interface MemoryMetadata {
  /** Source of the memory entry */
  source: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Related entity IDs */
  relatedEntities: string[];
  /** Tags for categorization */
  tags: string[];
}

/**
 * A generic memory entry
 */
export interface MemoryEntry {
  /** Unique identifier */
  id: string;
  /** Type of memory */
  memoryType: MemoryType;
  /** Scope for data isolation */
  scope: MemoryScope;
  /** The stored content */
  content: unknown;
  /** Metadata about the entry */
  metadata: MemoryMetadata;
  /** When the entry was created */
  createdAt: Date;
  /** When the entry expires (optional) */
  expiresAt?: Date;
}

// ==================== Memory Service Interface ====================

/**
 * Memory Service interface for the three-tier memory architecture
 * Validates: Requirements 2.1-2.5, 3.1-3.5, 4.1-4.5, 17.1-17.7
 */
export interface MemoryService {
  // Short-term memory (session-scoped)
  getSessionContext(sessionId: string): Promise<SessionContext | null>;
  updateSessionContext(sessionId: string, messages: Message[]): Promise<void>;
  clearSession(sessionId: string): Promise<void>;
  
  // Long-term memory (user/tenant-scoped)
  getUserPreferences(userId: string, tenantId: string): Promise<UserPreferences | null>;
  updateUserPreferences(userId: string, tenantId: string, prefs: Partial<UserPreferences>): Promise<void>;
  getLearnedKnowledge(userId: string, tenantId: string): Promise<LearnedKnowledge[]>;
  storeLearnedKnowledge(userId: string, tenantId: string, knowledge: Omit<LearnedKnowledge, 'id' | 'userId' | 'tenantId' | 'learnedAt' | 'usageCount'>): Promise<LearnedKnowledge>;
  
  // Episodic memory (historical interactions)
  recordEpisode(episode: Omit<Episode, 'id'>): Promise<Episode>;
  queryEpisodes(query: EpisodeQuery): Promise<Episode[]>;
  getDecisionHistory(userId: string, entityType: string, entityId: string): Promise<Decision[]>;
}

// ==================== Default Values ====================

/**
 * Default notification settings
 */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: true,
  inAppEnabled: true,
  frequency: 'immediate',
  enabledTypes: ['critical', 'high', 'approval_required'],
};

/**
 * Default display preferences
 */
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  theme: 'system',
  dateFormat: 'YYYY-MM-DD',
  timezone: 'UTC',
  pageSize: 20,
  viewMode: 'expanded',
};

/**
 * Maximum messages in short-term memory before summarization
 */
export const MAX_SESSION_MESSAGES = 50;

/**
 * Session timeout in milliseconds (24 hours)
 */
export const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000;
