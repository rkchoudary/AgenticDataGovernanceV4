/**
 * Audit Trail Service for the Regulatory AI Assistant
 * 
 * Provides integration with the existing audit trail system for:
 * - Logging assistant actions and tool executions
 * - Recording human gate decisions
 * - Tracking data access for compliance
 * 
 * Validates: Requirements 10.3, 16.8
 */

import { v4 as uuidv4 } from 'uuid';
import { AuditEntry, CreateAuditEntryParams } from '../types/audit.js';
import { ActorType } from '../types/common.js';
import { ToolExecutionLog } from '../types/tool-service.js';
import { HumanGateAction, HumanGateResult } from '../types/human-gate.js';
import { AccessAuditEntry } from '../types/assistant.js';

// ==================== Types ====================

/**
 * Audit action types for the assistant
 */
export type AssistantAuditAction =
  | 'chat_message'
  | 'tool_execution'
  | 'tool_execution_failed'
  | 'human_gate_requested'
  | 'human_gate_approved'
  | 'human_gate_rejected'
  | 'human_gate_deferred'
  | 'data_access'
  | 'data_access_denied'
  | 'session_started'
  | 'session_restored'
  | 'session_cleared'
  | 'error_occurred';

/**
 * Audit context for assistant operations
 */
export interface AssistantAuditContext {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Source of the action */
  source?: string;
}

/**
 * Configuration for the audit trail service
 */
export interface AuditTrailServiceConfig {
  /** Whether to enable audit logging */
  enabled: boolean;
  /** Whether to log to console (for debugging) */
  logToConsole: boolean;
  /** Maximum entries to keep in memory */
  maxInMemoryEntries: number;
  /** Backend API URL for persisting audit entries */
  apiUrl?: string;
}

// ==================== Default Configuration ====================

const DEFAULT_CONFIG: AuditTrailServiceConfig = {
  enabled: true,
  logToConsole: process.env.NODE_ENV === 'development',
  maxInMemoryEntries: 10000,
  apiUrl: process.env.AUDIT_API_URL,
};

// ==================== Actor Type Constants ====================

const ACTOR_USER: ActorType = 'human';
const ACTOR_AGENT: ActorType = 'agent';
const ACTOR_SYSTEM: ActorType = 'system';

// ==================== Audit Trail Service ====================

/**
 * Service for logging audit trail entries
 * 
 * Validates: Requirements 10.3, 16.8
 */
export class AuditTrailService {
  private config: AuditTrailServiceConfig;
  private entries: AuditEntry[] = [];
  private pendingEntries: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<AuditTrailServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==================== Core Audit Methods ====================

  /**
   * Create an audit entry
   * Validates: Requirements 10.3, 16.8
   */
  async createAuditEntry(params: CreateAuditEntryParams): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      ...params,
    };

    if (this.config.enabled) {
      this.entries.push(entry);
      this.pendingEntries.push(entry);

      // Trim in-memory entries if needed
      if (this.entries.length > this.config.maxInMemoryEntries) {
        this.entries = this.entries.slice(-this.config.maxInMemoryEntries);
      }

      // Log to console if enabled
      if (this.config.logToConsole) {
        console.log('[AUDIT]', JSON.stringify(entry, null, 2));
      }

      // Schedule flush to backend
      this.scheduleFlush();
    }

    return entry;
  }

  /**
   * Log a chat message
   */
  async logChatMessage(
    context: AssistantAuditContext,
    message: string,
    role: 'user' | 'assistant'
  ): Promise<AuditEntry> {
    return this.createAuditEntry({
      actor: context.userId,
      actorType: role === 'user' ? ACTOR_USER : ACTOR_AGENT,
      action: 'chat_message',
      entityType: 'session',
      entityId: context.sessionId,
      newState: { message, role },
      rationale: `${role} message in session ${context.sessionId}`,
    });
  }

  /**
   * Log a tool execution
   * Validates: Requirements 16.8
   */
  async logToolExecution(
    context: AssistantAuditContext,
    toolLog: ToolExecutionLog
  ): Promise<AuditEntry> {
    const action = toolLog.status === 'failed' ? 'tool_execution_failed' : 'tool_execution';
    
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_AGENT,
      action,
      entityType: 'tool',
      entityId: toolLog.toolName,
      newState: {
        callId: toolLog.callId,
        parameters: toolLog.parameters,
        status: toolLog.status,
        duration: toolLog.duration,
        error: toolLog.error,
      },
      rationale: `Tool ${toolLog.toolName} executed with status ${toolLog.status}`,
    });
  }

  /**
   * Log a human gate request
   */
  async logHumanGateRequest(
    context: AssistantAuditContext,
    action: HumanGateAction
  ): Promise<AuditEntry> {
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_AGENT,
      action: 'human_gate_requested',
      entityType: action.entityType,
      entityId: action.entityId,
      newState: {
        actionId: action.id,
        type: action.type,
        title: action.title,
        impact: action.impact,
        toolName: action.toolName,
      },
      rationale: `Human gate requested: ${action.title}`,
    });
  }

  /**
   * Log a human gate decision
   */
  async logHumanGateDecision(
    _context: AssistantAuditContext,
    action: HumanGateAction,
    result: HumanGateResult
  ): Promise<AuditEntry> {
    const auditAction = `human_gate_${result.decision}` as AssistantAuditAction;
    
    return this.createAuditEntry({
      actor: result.decidedBy,
      actorType: ACTOR_USER,
      action: auditAction,
      entityType: action.entityType,
      entityId: action.entityId,
      previousState: {
        actionId: action.id,
        status: 'pending',
      },
      newState: {
        actionId: action.id,
        decision: result.decision,
        rationale: result.rationale,
        decidedAt: result.decidedAt,
        signature: result.signature,
      },
      rationale: `Human gate ${result.decision}: ${result.rationale}`,
    });
  }

  /**
   * Log data access
   * Validates: Requirements 10.3
   */
  async logDataAccess(
    context: AssistantAuditContext,
    accessEntry: AccessAuditEntry
  ): Promise<AuditEntry> {
    const action = accessEntry.accessGranted ? 'data_access' : 'data_access_denied';
    
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_USER,
      action,
      entityType: accessEntry.entityType,
      entityId: accessEntry.entityIds.join(','),
      newState: {
        action: accessEntry.action,
        entityIds: accessEntry.entityIds,
        accessGranted: accessEntry.accessGranted,
        denialReason: accessEntry.denialReason,
        source: accessEntry.source,
      },
      rationale: accessEntry.accessGranted
        ? `Data access granted for ${accessEntry.entityType}`
        : `Data access denied: ${accessEntry.denialReason}`,
    });
  }

  /**
   * Log session start
   */
  async logSessionStart(context: AssistantAuditContext): Promise<AuditEntry> {
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_USER,
      action: 'session_started',
      entityType: 'session',
      entityId: context.sessionId,
      newState: {
        tenantId: context.tenantId,
        startedAt: new Date().toISOString(),
      },
      rationale: `Session started for user ${context.userId}`,
    });
  }

  /**
   * Log session restoration
   */
  async logSessionRestored(
    context: AssistantAuditContext,
    messageCount: number
  ): Promise<AuditEntry> {
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_SYSTEM,
      action: 'session_restored',
      entityType: 'session',
      entityId: context.sessionId,
      newState: {
        messageCount,
        restoredAt: new Date().toISOString(),
      },
      rationale: `Session restored with ${messageCount} messages`,
    });
  }

  /**
   * Log session cleared
   */
  async logSessionCleared(context: AssistantAuditContext): Promise<AuditEntry> {
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_USER,
      action: 'session_cleared',
      entityType: 'session',
      entityId: context.sessionId,
      newState: {
        clearedAt: new Date().toISOString(),
      },
      rationale: `Session cleared by user ${context.userId}`,
    });
  }

  /**
   * Log an error
   */
  async logError(
    context: AssistantAuditContext,
    error: Error,
    operation: string
  ): Promise<AuditEntry> {
    return this.createAuditEntry({
      actor: context.userId,
      actorType: ACTOR_SYSTEM,
      action: 'error_occurred',
      entityType: 'error',
      entityId: operation,
      newState: {
        errorMessage: error.message,
        errorName: error.name,
        operation,
        timestamp: new Date().toISOString(),
      },
      rationale: `Error in ${operation}: ${error.message}`,
    });
  }

  // ==================== Query Methods ====================

  /**
   * Get audit entries for a session
   */
  getEntriesForSession(sessionId: string): AuditEntry[] {
    return this.entries.filter(
      entry => entry.entityType === 'session' && entry.entityId === sessionId
    );
  }

  /**
   * Get audit entries for a user
   */
  getEntriesForUser(userId: string): AuditEntry[] {
    return this.entries.filter(entry => entry.actor === userId);
  }

  /**
   * Get audit entries by action type
   */
  getEntriesByAction(action: string): AuditEntry[] {
    return this.entries.filter(entry => entry.action === action);
  }

  /**
   * Get audit entries in a time range
   */
  getEntriesInRange(startDate: Date, endDate: Date): AuditEntry[] {
    return this.entries.filter(
      entry => entry.timestamp >= startDate && entry.timestamp <= endDate
    );
  }

  /**
   * Get all audit entries
   */
  getAllEntries(): AuditEntry[] {
    return [...this.entries];
  }

  // ==================== Persistence Methods ====================

  /**
   * Schedule a flush of pending entries to the backend
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return; // Already scheduled
    }

    this.flushTimer = setTimeout(() => {
      this.flushPendingEntries();
      this.flushTimer = null;
    }, 5000); // Flush every 5 seconds
  }

  /**
   * Flush pending entries to the backend
   */
  private async flushPendingEntries(): Promise<void> {
    if (this.pendingEntries.length === 0 || !this.config.apiUrl) {
      return;
    }

    const entriesToFlush = [...this.pendingEntries];
    this.pendingEntries = [];

    try {
      await fetch(`${this.config.apiUrl}/audit/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries: entriesToFlush }),
      });
    } catch (error) {
      // Re-add entries to pending on failure
      this.pendingEntries = [...entriesToFlush, ...this.pendingEntries];
      console.error('Failed to flush audit entries:', error);
    }
  }

  /**
   * Force flush all pending entries
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flushPendingEntries();
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.entries = [];
    this.pendingEntries = [];
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

// ==================== Factory Functions ====================

/**
 * Create a new Audit Trail Service
 */
export function createAuditTrailService(
  config?: Partial<AuditTrailServiceConfig>
): AuditTrailService {
  return new AuditTrailService(config);
}

// ==================== Singleton Instance ====================

let defaultService: AuditTrailService | null = null;

/**
 * Get the default Audit Trail Service
 */
export function getAuditTrailService(): AuditTrailService {
  if (!defaultService) {
    defaultService = createAuditTrailService();
  }
  return defaultService;
}

/**
 * Set the default Audit Trail Service
 */
export function setAuditTrailService(service: AuditTrailService): void {
  defaultService = service;
}

// ==================== Helper Functions ====================

/**
 * Create audit context from request parameters
 */
export function createAuditContext(
  sessionId: string,
  userId: string,
  tenantId: string,
  requestId?: string
): AssistantAuditContext {
  return {
    sessionId,
    userId,
    tenantId,
    requestId: requestId || uuidv4(),
  };
}
