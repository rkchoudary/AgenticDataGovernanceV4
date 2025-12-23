/**
 * Assistant Service for the Regulatory AI Assistant
 * 
 * Core service that orchestrates AI interactions including:
 * - Streaming chat responses
 * - Tool execution with transparency
 * - Human gate handling for critical actions
 * - Conversation context management
 * - Access control enforcement
 * 
 * Validates: Requirements 1.1, 1.2, 2.1, 2.3, 9.1-9.5, 10.1-10.5, 13.1, 13.3
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ChatRequest,
  ChatResponse,
  ChatResponseType,
  ConversationContext,
  AccessControlContext,
  AccessAuditEntry,
  UserPermissions,
  AssistantExecutionContext,
  ErrorResponse,
  ErrorCategory,
  QuickAction,
  ERROR_RESPONSES,
  PRONOUN_PATTERNS,
} from '../types/assistant.js';
import {
  HumanGateAction,
  HumanGateResult,
  HumanGateDecision,
  HumanGateService,
  isCriticalAction,
} from '../types/human-gate.js';
import {
  MemoryService,
  Message,
  EntityReference,
  SessionContext,
  Reference,
  ToolCall,
} from '../types/memory.js';
import {
  ToolService,
  ToolResult,
  ToolExecutionContext,
} from '../types/tool-service.js';
import { ActorType } from '../types/common.js';
import { AuditEntry, CreateAuditEntryParams } from '../types/audit.js';


// ==================== Assistant Service Interface ====================

/**
 * Assistant Service interface
 * Validates: Requirements 1.1, 1.2
 */
export interface AssistantService {
  /**
   * Main conversation method - returns an async generator for streaming
   * Validates: Requirements 1.1, 1.2
   */
  chat(request: ChatRequest): AsyncGenerator<ChatResponse>;

  /**
   * Execute a tool with access control and logging
   * Validates: Requirements 11.1, 11.5
   */
  executeTool(
    toolName: string,
    parameters: Record<string, unknown>,
    context: AssistantExecutionContext
  ): Promise<ToolResult>;

  /**
   * Request human approval for a critical action
   * Validates: Requirements 9.1, 9.2
   */
  requestHumanApproval(action: HumanGateAction): Promise<HumanGateResult | null>;

  /**
   * Process a human gate decision
   * Validates: Requirements 9.3, 9.4
   */
  processHumanGateDecision(
    actionId: string,
    decision: HumanGateDecision,
    rationale: string,
    decidedBy: string
  ): Promise<HumanGateResult>;

  /**
   * Get conversation context for a session
   * Validates: Requirements 2.1, 13.1
   */
  getConversationContext(sessionId: string): Promise<ConversationContext | null>;

  /**
   * Summarize conversation context
   * Validates: Requirements 2.2, 13.3
   */
  summarizeContext(messages: Message[]): Promise<string>;

  /**
   * Resolve a pronoun reference to an entity
   * Validates: Requirements 2.3
   */
  resolveEntityReference(
    sessionId: string,
    text: string
  ): Promise<EntityReference | null>;

  /**
   * Filter data based on access control
   * Validates: Requirements 10.1, 10.2
   */
  filterByAccessControl<T extends { id?: string; entityType?: string }>(
    data: T[],
    entityType: string,
    context: AccessControlContext
  ): Promise<T[]>;

  /**
   * Log data access for audit trail
   * Validates: Requirements 10.3
   */
  logDataAccess(entry: Omit<AccessAuditEntry, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Check if user has permission for an action
   * Validates: Requirements 10.1, 10.4
   */
  hasPermission(
    permissions: UserPermissions,
    requiredPermission: string
  ): boolean;
}


// ==================== Configuration ====================

/**
 * Configuration for the Assistant Service
 */
export interface AssistantServiceConfig {
  /** Response timeout in milliseconds */
  responseTimeoutMs: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff */
  baseDelayMs: number;
  /** Maximum delay for exponential backoff */
  maxDelayMs: number;
  /** Whether to enable audit logging */
  enableAuditLogging: boolean;
  /** Human gate timeout in milliseconds */
  humanGateTimeoutMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: AssistantServiceConfig = {
  responseTimeoutMs: 30000,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  enableAuditLogging: true,
  humanGateTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
};

// ==================== Implementation ====================

/**
 * Implementation of the Assistant Service
 * 
 * Validates: Requirements 1.1, 1.2, 2.1, 2.3, 9.1-9.5, 10.1-10.5, 13.1, 13.3
 */
export class AssistantServiceImpl implements AssistantService {
  private config: AssistantServiceConfig;
  private memoryService: MemoryService;
  private toolService: ToolService;
  private humanGateService: HumanGateService | null;
  
  // Pending human gate actions (fallback if no HumanGateService)
  private pendingHumanGates: Map<string, HumanGateAction> = new Map();
  private humanGateResults: Map<string, HumanGateResult> = new Map();
  
  // Access audit log
  private accessAuditLog: AccessAuditEntry[] = [];

  constructor(
    memoryService: MemoryService,
    toolService: ToolService,
    config: Partial<AssistantServiceConfig> = {},
    humanGateService?: HumanGateService
  ) {
    this.memoryService = memoryService;
    this.toolService = toolService;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.humanGateService = humanGateService || null;
  }


  // ==================== Chat Method ====================

  /**
   * Main conversation method with streaming response
   * Validates: Requirements 1.1, 1.2
   */
  async *chat(request: ChatRequest): AsyncGenerator<ChatResponse> {
    const { sessionId, userId, tenantId, message, pageContext } = request;
    const messageId = uuidv4();
    const startTime = Date.now();

    try {
      // Get or create session context
      let sessionContext = await this.memoryService.getSessionContext(sessionId);
      if (!sessionContext) {
        // Initialize new session
        sessionContext = await this.initializeSession(sessionId, userId, tenantId);
      }

      // Add user message to context
      const userMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: message,
        timestamp: new Date(),
      };

      // Yield context summary if restoring session
      if (sessionContext.summary) {
        yield {
          type: 'context_summary',
          content: `Continuing from previous conversation: ${sessionContext.summary}`,
          isComplete: false,
          messageId,
          timestamp: new Date(),
        };
      }

      // Process the message and generate response
      const response = await this.processMessage(
        message,
        sessionContext,
        { userId, tenantId, sessionId, permissions: [], requireHumanApproval: true, pageContext }
      );

      // Yield the response chunks
      for (const chunk of response.chunks) {
        yield chunk;
      }

      // Create assistant message
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: response.textContent,
        timestamp: new Date(),
        toolCalls: response.toolCalls,
        references: response.references,
      };

      // Update session context with new messages
      const updatedMessages = [...sessionContext.messages, userMessage, assistantMessage];
      await this.memoryService.updateSessionContext(sessionId, updatedMessages);

      // Record episode for audit trail
      await this.memoryService.recordEpisode({
        sessionId,
        userId,
        tenantId,
        timestamp: new Date(),
        type: 'query',
        content: message,
        context: { response: response.textContent, duration: Date.now() - startTime },
        relatedEntities: response.references?.map(r => ({
          entityType: r.type,
          entityId: r.id,
          displayName: r.title,
          lastMentioned: new Date(),
        })) || [],
      });

      // Yield quick actions if available
      const quickActions = this.generateQuickActions(message, response, pageContext);
      for (const action of quickActions) {
        yield {
          type: 'quick_action',
          content: action,
          isComplete: false,
          messageId,
          timestamp: new Date(),
        };
      }

      // Final completion marker
      yield {
        type: 'text',
        content: '',
        isComplete: true,
        messageId,
        timestamp: new Date(),
      };

    } catch (error) {
      const errorResponse = this.createErrorResponse(error);
      yield {
        type: 'error',
        content: errorResponse,
        isComplete: true,
        messageId,
        timestamp: new Date(),
      };
    }
  }


  // ==================== Message Processing ====================

  /**
   * Process a user message and generate response
   */
  private async processMessage(
    message: string,
    sessionContext: SessionContext,
    context: AssistantExecutionContext
  ): Promise<{
    chunks: ChatResponse[];
    textContent: string;
    toolCalls?: ToolCall[];
    references?: Reference[];
  }> {
    const chunks: ChatResponse[] = [];
    const toolCalls: ToolCall[] = [];
    const references: Reference[] = [];
    let textContent = '';

    // Resolve any pronoun references
    const resolvedMessage = await this.resolvePronouns(message, sessionContext);

    // Simulate AI processing - in production, this would call Claude
    // For now, we'll generate a simple response based on the message
    const responseText = this.generateSimpleResponse(resolvedMessage, sessionContext);
    textContent = responseText;

    // Yield text response
    chunks.push({
      type: 'text',
      content: responseText,
      isComplete: false,
      timestamp: new Date(),
    });

    return { chunks, textContent, toolCalls, references };
  }

  /**
   * Generate a simple response (placeholder for AI integration)
   */
  private generateSimpleResponse(message: string, context: SessionContext): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
      return "I can help you with regulatory compliance queries, data quality issues, lineage mapping, and workflow management. Try asking about specific reports like CCAR, DFAST, or FR Y-14, or ask about data quality issues for a specific report.";
    }

    if (lowerMessage.includes('report') || lowerMessage.includes('ccar') || lowerMessage.includes('dfast')) {
      return "I can provide information about regulatory reports. Would you like me to show you the report catalog, check for regulatory changes, or get details about a specific report?";
    }

    if (lowerMessage.includes('issue') || lowerMessage.includes('quality')) {
      return "I can help you track and manage data quality issues. Would you like to see outstanding issues for a specific report or CDE?";
    }

    if (lowerMessage.includes('lineage')) {
      return "I can show you data lineage information. Would you like to see the lineage for a specific report or trace the impact of a data source change?";
    }

    return "I understand you're asking about: " + message + ". How can I help you further with this?";
  }

  /**
   * Resolve pronouns in the message using session context
   * Validates: Requirements 2.3
   */
  private async resolvePronouns(message: string, context: SessionContext): Promise<string> {
    let resolvedMessage = message;

    for (const [entityType, patterns] of Object.entries(PRONOUN_PATTERNS)) {
      for (const pattern of patterns) {
        if (message.toLowerCase().includes(pattern)) {
          // Find the most recently mentioned entity of this type
          const entity = this.findMostRecentEntity(context.entities, entityType);
          if (entity) {
            resolvedMessage = resolvedMessage.replace(
              new RegExp(pattern, 'gi'),
              `${entity.displayName} (${entity.entityId})`
            );
          }
        }
      }
    }

    return resolvedMessage;
  }

  /**
   * Find the most recently mentioned entity of a given type
   */
  private findMostRecentEntity(
    entities: Map<string, EntityReference>,
    entityType: string
  ): EntityReference | null {
    let mostRecent: EntityReference | null = null;
    let mostRecentTime = new Date(0);

    for (const entity of entities.values()) {
      if (entity.entityType === entityType && entity.lastMentioned > mostRecentTime) {
        mostRecent = entity;
        mostRecentTime = entity.lastMentioned;
      }
    }

    return mostRecent;
  }


  // ==================== Tool Execution ====================

  /**
   * Execute a tool with access control and logging
   * Validates: Requirements 11.1, 11.5
   */
  async executeTool(
    toolName: string,
    parameters: Record<string, unknown>,
    context: AssistantExecutionContext
  ): Promise<ToolResult> {
    // Check if tool requires human approval
    if (isCriticalAction(toolName) && context.requireHumanApproval) {
      // Create human gate action using the service if available
      if (this.humanGateService) {
        const humanGateAction = this.humanGateService.createHumanGateAction(
          toolName,
          parameters,
          {
            userId: context.userId,
            tenantId: context.tenantId,
            sessionId: context.sessionId,
          }
        );
        await this.humanGateService.requestApproval(humanGateAction);
        this.pendingHumanGates.set(humanGateAction.id, humanGateAction);
      } else {
        // Fallback to internal storage
        const humanGateAction = this.createHumanGateAction(toolName, parameters, context);
        this.pendingHumanGates.set(humanGateAction.id, humanGateAction);
      }

      return {
        callId: uuidv4(),
        toolName,
        success: false,
        error: 'Human approval required for this action',
        errorCode: 'HUMAN_APPROVAL_REQUIRED',
        status: 'pending',
        duration: 0,
        completedAt: new Date(),
        retryable: false,
      };
    }

    // Set tool execution context
    const toolContext: ToolExecutionContext = {
      userId: context.userId,
      tenantId: context.tenantId,
      sessionId: context.sessionId,
      accessToken: context.accessToken,
      permissions: context.permissions,
      requireHumanApproval: context.requireHumanApproval,
    };

    // Execute the tool via the tool service
    // This is a simplified version - in production, we'd call the specific tool method
    const result = await this.executeToolByName(toolName, parameters, toolContext);

    // Log the execution for audit
    if (this.config.enableAuditLogging) {
      await this.logDataAccess({
        userId: context.userId,
        tenantId: context.tenantId,
        sessionId: context.sessionId,
        action: 'query',
        entityType: this.getEntityTypeFromTool(toolName),
        entityIds: this.extractEntityIds(parameters),
        accessGranted: result.success,
        source: toolName,
      });
    }

    return result;
  }

  /**
   * Execute a tool by name
   */
  private async executeToolByName(
    toolName: string,
    parameters: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    // Set context on tool service
    (this.toolService as any).setContext?.(context);

    // Map tool names to service methods
    switch (toolName) {
      case 'scanRegulatorySources':
        return this.toolService.scanRegulatorySources(parameters.jurisdictions as string[]);
      case 'detectChanges':
        return this.toolService.detectChanges(new Date(parameters.since as string));
      case 'getReportCatalog':
        return this.toolService.getReportCatalog();
      case 'approveCatalog':
        return this.toolService.approveCatalog(
          parameters.approver as string,
          parameters.rationale as string
        );
      case 'getCycleStatus':
        return this.toolService.getCycleStatus(parameters.cycleId as string);
      case 'getLineageForReport':
        return this.toolService.getLineageForReport(parameters.reportId as string);
      case 'getLineageForCDE':
        return this.toolService.getLineageForCDE(parameters.cdeId as string);
      case 'getIssuesForReport':
        return this.toolService.getIssuesForReport(
          parameters.reportId as string,
          parameters.status as string | undefined
        );
      case 'getIssuesForCDE':
        return this.toolService.getIssuesForCDE(parameters.cdeId as string);
      case 'getCDEDetails':
        return this.toolService.getCDEDetails(parameters.cdeId as string);
      case 'getCDEsForReport':
        return this.toolService.getCDEsForReport(parameters.reportId as string);
      case 'getCDEQualityScore':
        return this.toolService.getCDEQualityScore(parameters.cdeId as string);
      default:
        return {
          callId: uuidv4(),
          toolName,
          success: false,
          error: `Unknown tool: ${toolName}`,
          errorCode: 'UNKNOWN_TOOL',
          status: 'failed',
          duration: 0,
          completedAt: new Date(),
          retryable: false,
        };
    }
  }

  /**
   * Get entity type from tool name
   */
  private getEntityTypeFromTool(toolName: string): string {
    if (toolName.includes('Report') || toolName.includes('Catalog')) return 'report';
    if (toolName.includes('CDE')) return 'cde';
    if (toolName.includes('Issue')) return 'issue';
    if (toolName.includes('Lineage')) return 'lineage';
    if (toolName.includes('Cycle')) return 'cycle';
    return 'unknown';
  }

  /**
   * Extract entity IDs from parameters
   */
  private extractEntityIds(parameters: Record<string, unknown>): string[] {
    const ids: string[] = [];
    const idKeys = ['reportId', 'cdeId', 'issueId', 'cycleId', 'nodeId', 'taskId'];
    
    for (const key of idKeys) {
      if (parameters[key] && typeof parameters[key] === 'string') {
        ids.push(parameters[key] as string);
      }
    }
    
    return ids;
  }


  // ==================== Human Gate ====================

  /**
   * Request human approval for a critical action
   * Validates: Requirements 9.1, 9.2
   */
  async requestHumanApproval(action: HumanGateAction): Promise<HumanGateResult | null> {
    // Use HumanGateService if available
    if (this.humanGateService) {
      await this.humanGateService.requestApproval(action);
      this.pendingHumanGates.set(action.id, action);
      
      // Check if there's already a result
      const existingResult = await this.humanGateService.getResult(action.id);
      if (existingResult) {
        return existingResult;
      }
      return null;
    }

    // Fallback: Store the pending action internally
    this.pendingHumanGates.set(action.id, action);

    // Check if there's already a result (for testing/immediate approval scenarios)
    const existingResult = this.humanGateResults.get(action.id);
    if (existingResult) {
      return existingResult;
    }

    // Return null to indicate waiting for human decision
    return null;
  }

  /**
   * Process a human gate decision
   * Validates: Requirements 9.3, 9.4
   */
  async processHumanGateDecision(
    actionId: string,
    decision: HumanGateDecision,
    rationale: string,
    decidedBy: string,
    signature?: string
  ): Promise<HumanGateResult> {
    // Use HumanGateService if available
    if (this.humanGateService) {
      const result = await this.humanGateService.processDecision(
        actionId,
        decision,
        rationale,
        decidedBy,
        signature
      );
      
      // Store result locally for quick access
      this.humanGateResults.set(actionId, result);
      this.pendingHumanGates.delete(actionId);
      
      return result;
    }

    // Fallback: Process internally
    const action = this.pendingHumanGates.get(actionId);
    if (!action) {
      throw new Error(`No pending action found with ID: ${actionId}`);
    }

    const result: HumanGateResult = {
      actionId,
      decision,
      rationale,
      decidedBy,
      decidedAt: new Date(),
      signature,
    };

    // If approved, execute the tool
    if (decision === 'approved' && action.toolName && action.toolParameters) {
      const toolResult = await this.executeToolByName(
        action.toolName,
        action.toolParameters,
        {
          userId: decidedBy,
          tenantId: action.tenantId || 'unknown',
          sessionId: uuidv4(),
          permissions: [],
          requireHumanApproval: false, // Already approved
        }
      );
      result.toolResult = toolResult;
    }

    // Store the result
    this.humanGateResults.set(actionId, result);

    // Remove from pending
    this.pendingHumanGates.delete(actionId);

    // Log to episodic memory
    if (action.tenantId && action.requestedBy) {
      await this.memoryService.recordEpisode({
        sessionId: action.sessionId || 'unknown',
        userId: decidedBy,
        tenantId: action.tenantId,
        timestamp: new Date(),
        type: 'decision',
        content: `Human gate decision: ${decision} for ${action.title}`,
        context: {
          actionId: action.id,
          decision,
          rationale,
          toolName: action.toolName,
        },
        relatedEntities: [{
          entityType: action.entityType,
          entityId: action.entityId,
          displayName: action.title,
          lastMentioned: new Date(),
        }],
        outcome: decision,
        tags: ['human_gate', 'decision', decision],
      });
    }

    return result;
  }

  /**
   * Create a human gate action for a tool
   */
  private createHumanGateAction(
    toolName: string,
    parameters: Record<string, unknown>,
    context: AssistantExecutionContext
  ): HumanGateAction {
    const actionTypeMap: Record<string, HumanGateAction['type']> = {
      approveCatalog: 'approval',
      completeHumanTask: 'sign_off',
      startReportCycle: 'approval',
      ownership_change: 'ownership_change',
      source_mapping_change: 'mapping_change',
      control_effectiveness_signoff: 'control_effectiveness',
    };

    return {
      id: uuidv4(),
      type: actionTypeMap[toolName] || 'approval',
      title: `Approve ${toolName}`,
      description: `The AI assistant is requesting to execute ${toolName} with the provided parameters.`,
      impact: this.assessImpact(toolName, parameters),
      requiredRole: 'approver',
      entityType: this.getEntityTypeFromTool(toolName),
      entityId: this.extractEntityIds(parameters)[0] || 'unknown',
      proposedChanges: parameters,
      aiRationale: `This action was requested based on the conversation context.`,
      toolName,
      toolParameters: parameters,
      sessionId: context.sessionId,
      requestedBy: context.userId,
      tenantId: context.tenantId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.humanGateTimeoutMs),
      status: 'pending',
    };
  }

  /**
   * Assess the impact of an action
   */
  private assessImpact(toolName: string, parameters: Record<string, unknown>): string {
    switch (toolName) {
      case 'approveCatalog':
        return 'This will approve the regulatory report catalog, making it the official reference for compliance.';
      case 'completeHumanTask':
        return 'This will complete a workflow task and may trigger subsequent workflow steps.';
      case 'startReportCycle':
        return `This will initiate a new reporting cycle for ${parameters.reportId || 'the specified report'}.`;
      default:
        return 'This action may affect regulatory compliance data.';
    }
  }

  /**
   * Get pending human gate actions
   */
  getPendingHumanGates(): HumanGateAction[] {
    return Array.from(this.pendingHumanGates.values());
  }

  /**
   * Get human gate result
   */
  getHumanGateResult(actionId: string): HumanGateResult | undefined {
    return this.humanGateResults.get(actionId);
  }


  // ==================== Conversation Context ====================

  /**
   * Get conversation context for a session
   * Validates: Requirements 2.1, 13.1
   */
  async getConversationContext(sessionId: string): Promise<ConversationContext | null> {
    const sessionContext = await this.memoryService.getSessionContext(sessionId);
    if (!sessionContext) {
      return null;
    }

    // Get user preferences if available
    const preferences = await this.memoryService.getUserPreferences(
      sessionContext.userId,
      sessionContext.tenantId
    );

    // Query relevant episodes
    const episodes = await this.memoryService.queryEpisodes({
      userId: sessionContext.userId,
      tenantId: sessionContext.tenantId,
      limit: 5,
    });

    return {
      sessionId: sessionContext.sessionId,
      userId: sessionContext.userId,
      tenantId: sessionContext.tenantId,
      messages: sessionContext.messages,
      entities: sessionContext.entities,
      summary: sessionContext.summary,
      preferences: preferences ? {
        preferredReports: preferences.preferredReports,
        customQuickActions: preferences.customQuickActions,
        displayPreferences: {
          theme: preferences.displayPreferences.theme,
          dateFormat: preferences.displayPreferences.dateFormat,
        },
      } : undefined,
      relevantEpisodes: episodes.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        summary: e.content,
        relatedEntities: e.relatedEntities.map(re => re.entityId),
      })),
    };
  }

  /**
   * Summarize conversation context
   * Validates: Requirements 2.2, 13.3
   */
  async summarizeContext(messages: Message[]): Promise<string> {
    if (messages.length === 0) {
      return '';
    }

    // Extract key topics and entities
    const topics: Set<string> = new Set();
    const entities: Set<string> = new Set();

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
          entities.add(`${ref.type}: ${ref.title}`);
        }
      }
    }

    const topicList = Array.from(topics).slice(0, 5).join(', ');
    const entityList = Array.from(entities).slice(0, 5).join(', ');

    return `Discussed ${messages.length} messages covering: ${topicList || 'general queries'}. ` +
      `Referenced: ${entityList || 'no specific entities'}.`;
  }

  /**
   * Resolve a pronoun reference to an entity
   * Validates: Requirements 2.3
   */
  async resolveEntityReference(
    sessionId: string,
    text: string
  ): Promise<EntityReference | null> {
    const sessionContext = await this.memoryService.getSessionContext(sessionId);
    if (!sessionContext) {
      return null;
    }

    // Check for pronoun patterns
    const lowerText = text.toLowerCase();
    for (const [entityType, patterns] of Object.entries(PRONOUN_PATTERNS)) {
      for (const pattern of patterns) {
        if (lowerText.includes(pattern)) {
          return this.findMostRecentEntity(sessionContext.entities, entityType);
        }
      }
    }

    return null;
  }

  /**
   * Initialize a new session
   */
  private async initializeSession(
    sessionId: string,
    userId: string,
    tenantId: string
  ): Promise<SessionContext> {
    // Create initial session context
    const session: SessionContext = {
      sessionId,
      userId,
      tenantId,
      messages: [],
      entities: new Map(),
      lastActivity: new Date(),
      isActive: true,
    };

    // Store in memory service
    await this.memoryService.updateSessionContext(sessionId, []);

    return session;
  }


  // ==================== Access Control ====================

  /**
   * Filter data based on access control
   * Validates: Requirements 10.1, 10.2
   */
  async filterByAccessControl<T extends { id?: string; entityType?: string }>(
    data: T[],
    entityType: string,
    context: AccessControlContext
  ): Promise<T[]> {
    const { permissions } = context;

    // Find applicable data scope
    const scope = permissions.dataScopes.find(s => s.entityType === entityType);
    
    if (!scope) {
      // No scope defined - check if user has general read permission
      const hasReadPermission = this.hasPermission(permissions, `${entityType}:read`);
      if (!hasReadPermission) {
        // Log unauthorized access attempt
        if (context.enableAuditLogging) {
          await this.logDataAccess({
            userId: permissions.userId,
            tenantId: permissions.tenantId,
            sessionId: 'access-control-check',
            action: 'unauthorized_attempt',
            entityType,
            entityIds: data.map(d => d.id || 'unknown'),
            accessGranted: false,
            denialReason: `No ${entityType}:read permission`,
            source: 'filterByAccessControl',
          });
        }
        return [];
      }
      return data;
    }

    // Filter based on scope
    let filtered = data;

    // Filter by allowed IDs if specified
    if (scope.allowedIds && scope.allowedIds.length > 0) {
      filtered = filtered.filter(item => 
        item.id && scope.allowedIds!.includes(item.id)
      );
    }

    // Filter out denied IDs
    if (scope.deniedIds && scope.deniedIds.length > 0) {
      filtered = filtered.filter(item => 
        !item.id || !scope.deniedIds!.includes(item.id)
      );
    }

    // Log access
    if (context.enableAuditLogging && filtered.length !== data.length) {
      await this.logDataAccess({
        userId: permissions.userId,
        tenantId: permissions.tenantId,
        sessionId: 'access-control-check',
        action: 'query',
        entityType,
        entityIds: filtered.map(d => d.id || 'unknown'),
        accessGranted: true,
        source: 'filterByAccessControl',
      });
    }

    return filtered;
  }

  /**
   * Log data access for audit trail
   * Validates: Requirements 10.3
   */
  async logDataAccess(entry: Omit<AccessAuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const auditEntry: AccessAuditEntry = {
      ...entry,
      id: uuidv4(),
      timestamp: new Date(),
    };

    this.accessAuditLog.push(auditEntry);

    // Also record as an episode for long-term audit
    if (entry.action === 'unauthorized_attempt') {
      await this.memoryService.recordEpisode({
        sessionId: entry.sessionId,
        userId: entry.userId,
        tenantId: entry.tenantId,
        timestamp: new Date(),
        type: 'action',
        content: `Unauthorized access attempt to ${entry.entityType}`,
        context: {
          entityIds: entry.entityIds,
          denialReason: entry.denialReason,
          source: entry.source,
        },
        relatedEntities: entry.entityIds.map(id => ({
          entityType: entry.entityType,
          entityId: id,
          displayName: id,
          lastMentioned: new Date(),
        })),
        tags: ['security', 'unauthorized_access'],
      });
    }
  }

  /**
   * Check if user has permission for an action
   * Validates: Requirements 10.1, 10.4
   */
  hasPermission(permissions: UserPermissions, requiredPermission: string): boolean {
    // Check direct permission
    if (permissions.permissions.includes(requiredPermission)) {
      return true;
    }

    // Check wildcard permissions (e.g., 'admin:*' grants all admin permissions)
    const [category] = requiredPermission.split(':');
    if (permissions.permissions.includes(`${category}:*`)) {
      return true;
    }

    // Check super admin
    if (permissions.permissions.includes('*:*') || permissions.permissions.includes('admin')) {
      return true;
    }

    return false;
  }

  /**
   * Get access audit log (for testing/debugging)
   */
  getAccessAuditLog(): AccessAuditEntry[] {
    return [...this.accessAuditLog];
  }

  /**
   * Clear access audit log (for testing)
   */
  clearAccessAuditLog(): void {
    this.accessAuditLog = [];
  }


  // ==================== Quick Actions ====================

  /**
   * Generate quick action suggestions based on context
   */
  private generateQuickActions(
    message: string,
    response: { textContent: string; references?: Reference[] },
    pageContext?: { pageType?: string; entityId?: string }
  ): QuickAction[] {
    const actions: QuickAction[] = [];
    const lowerMessage = message.toLowerCase();

    // Context-based suggestions
    if (lowerMessage.includes('report') || pageContext?.pageType === 'report') {
      actions.push({
        id: uuidv4(),
        label: 'Show report catalog',
        type: 'query',
        action: 'Show me the regulatory report catalog',
        icon: 'list',
      });
      actions.push({
        id: uuidv4(),
        label: 'Check for changes',
        type: 'query',
        action: 'Are there any recent regulatory changes?',
        icon: 'refresh',
      });
    }

    if (lowerMessage.includes('issue') || lowerMessage.includes('quality')) {
      actions.push({
        id: uuidv4(),
        label: 'View open issues',
        type: 'query',
        action: 'Show me all open data quality issues',
        icon: 'alert',
      });
    }

    if (lowerMessage.includes('lineage')) {
      actions.push({
        id: uuidv4(),
        label: 'Trace impact',
        type: 'query',
        action: 'What would be impacted by changes to this data source?',
        icon: 'git-branch',
      });
    }

    // Default actions if none generated
    if (actions.length === 0) {
      actions.push({
        id: uuidv4(),
        label: 'View dashboard',
        type: 'navigation',
        action: '/dashboard',
        icon: 'home',
      });
      actions.push({
        id: uuidv4(),
        label: 'Help',
        type: 'query',
        action: 'What can you help me with?',
        icon: 'help',
      });
    }

    // Limit to 4 actions
    return actions.slice(0, 4);
  }

  // ==================== Error Handling ====================

  /**
   * Create an error response from an error
   */
  private createErrorResponse(error: unknown): ErrorResponse {
    if (error instanceof Error) {
      // Map known error types
      if (error.message.includes('timeout')) {
        return { ...ERROR_RESPONSES.TIMEOUT, technicalDetails: error.message };
      }
      if (error.message.includes('unauthorized') || error.message.includes('permission')) {
        return { ...ERROR_RESPONSES.AUTHORIZATION_DENIED, technicalDetails: error.message };
      }
      if (error.message.includes('authentication') || error.message.includes('session')) {
        return { ...ERROR_RESPONSES.AUTHENTICATION_FAILED, technicalDetails: error.message };
      }
      if (error.message.includes('rate limit')) {
        return { ...ERROR_RESPONSES.RATE_LIMIT_EXCEEDED, technicalDetails: error.message };
      }
      if (error.message.includes('human approval')) {
        return { ...ERROR_RESPONSES.HUMAN_APPROVAL_REQUIRED, technicalDetails: error.message };
      }

      // Default to tool execution failed
      return { ...ERROR_RESPONSES.TOOL_EXECUTION_FAILED, technicalDetails: error.message };
    }

    return { ...ERROR_RESPONSES.AI_SERVICE_UNAVAILABLE, technicalDetails: String(error) };
  }
}

// ==================== Factory Function ====================

/**
 * Create a new Assistant Service instance
 */
export function createAssistantService(
  memoryService: MemoryService,
  toolService: ToolService,
  config?: Partial<AssistantServiceConfig>,
  humanGateService?: HumanGateService
): AssistantService {
  return new AssistantServiceImpl(memoryService, toolService, config, humanGateService);
}
