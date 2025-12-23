/**
 * Human Gate Service for the Regulatory AI Assistant
 * 
 * Implements human-in-the-loop oversight for critical actions including:
 * - Creating human gate actions for critical operations
 * - Processing human decisions (approve/reject/defer)
 * - Integrating with episodic memory for audit trails
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 4.2
 */

import { v4 as uuidv4 } from 'uuid';
import {
  HumanGateAction,
  HumanGateResult,
  HumanGateDecision,
  HumanGateStatus,
  HumanGateService,
  HumanGateContext,
  HumanGateConfig,
  DEFAULT_HUMAN_GATE_CONFIG,
  CRITICAL_ACTION_TYPES,
  isCriticalAction,
  getGateTypeForTool,
  getImpactDescription,
  getRequiredRole,
  isActionExpired,
} from '../types/human-gate.js';
import { MemoryService, Episode } from '../types/memory.js';
import { ToolService, ToolResult, ToolExecutionContext } from '../types/tool-service.js';

/**
 * Implementation of the Human Gate Service
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 4.2
 */
export class HumanGateServiceImpl implements HumanGateService {
  private config: HumanGateConfig;
  private memoryService: MemoryService | null;
  private toolService: ToolService | null;
  
  // Storage for pending actions and results
  private pendingActions: Map<string, HumanGateAction> = new Map();
  private actionResults: Map<string, HumanGateResult> = new Map();

  constructor(
    memoryService?: MemoryService,
    toolService?: ToolService,
    config: Partial<HumanGateConfig> = {}
  ) {
    this.memoryService = memoryService || null;
    this.toolService = toolService || null;
    this.config = { ...DEFAULT_HUMAN_GATE_CONFIG, ...config };
  }

  /**
   * Create a human gate action for a critical operation
   * Validates: Requirements 9.1, 9.5
   */
  createHumanGateAction(
    toolName: string,
    parameters: Record<string, unknown>,
    context: HumanGateContext
  ): HumanGateAction {
    const actionType = getGateTypeForTool(toolName);
    const impact = getImpactDescription(toolName, parameters);
    const requiredRole = getRequiredRole(actionType);

    // Extract entity information from parameters
    const entityType = this.getEntityTypeFromTool(toolName);
    const entityId = this.extractEntityId(parameters) || 'unknown';

    const action: HumanGateAction = {
      id: uuidv4(),
      type: actionType,
      title: this.generateActionTitle(toolName, parameters),
      description: this.generateActionDescription(toolName, parameters),
      impact,
      requiredRole,
      entityType,
      entityId,
      proposedChanges: parameters,
      aiRationale: context.aiRationale || 'This action was requested based on the conversation context.',
      toolName,
      toolParameters: parameters,
      sessionId: context.sessionId,
      requestedBy: context.userId,
      tenantId: context.tenantId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.actionTimeoutMs),
      status: 'pending',
    };

    return action;
  }

  /**
   * Request human approval for an action
   * Validates: Requirements 9.1, 9.2
   */
  async requestApproval(action: HumanGateAction): Promise<void> {
    // Store the pending action
    this.pendingActions.set(action.id, action);

    // Log to episodic memory if configured
    if (this.config.logToEpisodicMemory && this.memoryService && action.tenantId && action.requestedBy) {
      await this.logActionToEpisodicMemory(action, 'requested');
    }
  }

  /**
   * Process a human gate decision
   * Validates: Requirements 9.3, 9.4
   */
  async processDecision(
    actionId: string,
    decision: HumanGateDecision,
    rationale: string,
    decidedBy: string,
    signature?: string
  ): Promise<HumanGateResult> {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      throw new Error(`No pending action found with ID: ${actionId}`);
    }

    // Check if action has expired
    if (isActionExpired(action)) {
      action.status = 'expired';
      this.pendingActions.set(actionId, action);
      throw new Error(`Action ${actionId} has expired`);
    }

    // Validate rationale length
    if (rationale.trim().length < this.config.minRationaleLength) {
      throw new Error(`Rationale must be at least ${this.config.minRationaleLength} characters`);
    }

    // Validate signature if required
    if (this.config.requireSignature && !signature) {
      throw new Error('Digital signature is required for this action');
    }

    // Create the result
    const result: HumanGateResult = {
      actionId,
      decision,
      rationale: rationale.trim(),
      decidedBy,
      decidedAt: new Date(),
      signature,
    };

    // Update action status
    action.status = decision as HumanGateStatus;
    this.pendingActions.set(actionId, action);

    // If approved, execute the tool
    if (decision === 'approved' && action.toolName && action.toolParameters && this.toolService) {
      try {
        const toolResult = await this.executeApprovedTool(action, decidedBy);
        result.toolResult = toolResult;
      } catch (error) {
        // Log error but don't fail the decision
        console.error(`Failed to execute tool after approval: ${error}`);
        result.toolResult = {
          callId: uuidv4(),
          toolName: action.toolName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          errorCode: 'EXECUTION_FAILED',
          status: 'failed',
          duration: 0,
          completedAt: new Date(),
          retryable: true,
        };
      }
    }

    // Store the result
    this.actionResults.set(actionId, result);

    // Remove from pending (keep in results for audit)
    this.pendingActions.delete(actionId);

    // Log to episodic memory
    if (this.config.logToEpisodicMemory && this.memoryService && action.tenantId) {
      await this.logDecisionToEpisodicMemory(action, result);
    }

    return result;
  }

  /**
   * Get pending human gate actions for a user/tenant
   */
  async getPendingActions(tenantId: string, userId?: string): Promise<HumanGateAction[]> {
    const actions: HumanGateAction[] = [];
    
    for (const action of this.pendingActions.values()) {
      // Filter by tenant
      if (action.tenantId !== tenantId) {
        continue;
      }

      // Filter by user if specified
      if (userId && action.requestedBy !== userId) {
        continue;
      }

      // Check if expired
      if (isActionExpired(action)) {
        action.status = 'expired';
        continue;
      }

      if (action.status === 'pending') {
        actions.push(action);
      }
    }

    // Sort by creation date (newest first)
    return actions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get a specific human gate action by ID
   */
  async getAction(actionId: string): Promise<HumanGateAction | null> {
    return this.pendingActions.get(actionId) || null;
  }

  /**
   * Get the result of a human gate decision
   */
  async getResult(actionId: string): Promise<HumanGateResult | null> {
    return this.actionResults.get(actionId) || null;
  }

  /**
   * Check if an action requires human approval
   * Validates: Requirements 9.1, 9.5
   */
  requiresApproval(toolName: string): boolean {
    return isCriticalAction(toolName);
  }

  /**
   * Check if an action has been approved
   */
  async isApproved(actionId: string): Promise<boolean> {
    const result = this.actionResults.get(actionId);
    return result?.decision === 'approved';
  }

  /**
   * Cancel a pending human gate action
   */
  async cancelAction(actionId: string, reason: string): Promise<void> {
    const action = this.pendingActions.get(actionId);
    if (!action) {
      throw new Error(`No pending action found with ID: ${actionId}`);
    }

    // Create a rejection result
    const result: HumanGateResult = {
      actionId,
      decision: 'rejected',
      rationale: `Cancelled: ${reason}`,
      decidedBy: 'system',
      decidedAt: new Date(),
    };

    // Update action status
    action.status = 'rejected';
    this.pendingActions.delete(actionId);
    this.actionResults.set(actionId, result);

    // Log to episodic memory
    if (this.config.logToEpisodicMemory && this.memoryService && action.tenantId) {
      await this.logDecisionToEpisodicMemory(action, result);
    }
  }

  // ==================== Private Helper Methods ====================

  /**
   * Execute an approved tool
   */
  private async executeApprovedTool(
    action: HumanGateAction,
    approvedBy: string
  ): Promise<ToolResult> {
    if (!this.toolService || !action.toolName || !action.toolParameters) {
      throw new Error('Tool service or tool information not available');
    }

    const context: ToolExecutionContext = {
      userId: approvedBy,
      tenantId: action.tenantId || 'unknown',
      sessionId: action.sessionId || uuidv4(),
      permissions: [],
      requireHumanApproval: false, // Already approved
    };

    // Set context on tool service if available
    if ('setContext' in this.toolService) {
      (this.toolService as any).setContext(context);
    }

    // Execute the tool based on name
    return this.executeToolByName(action.toolName, action.toolParameters);
  }

  /**
   * Execute a tool by name
   */
  private async executeToolByName(
    toolName: string,
    parameters: Record<string, unknown>
  ): Promise<ToolResult> {
    if (!this.toolService) {
      return {
        callId: uuidv4(),
        toolName,
        success: false,
        error: 'Tool service not available',
        errorCode: 'SERVICE_UNAVAILABLE',
        status: 'failed',
        duration: 0,
        completedAt: new Date(),
        retryable: false,
      };
    }

    switch (toolName) {
      case 'approveCatalog':
        return this.toolService.approveCatalog(
          parameters.approver as string,
          parameters.rationale as string
        );
      case 'startReportCycle':
        return this.toolService.startReportCycle(
          parameters.reportId as string,
          parameters.period as string
        );
      case 'completeHumanTask':
        return this.toolService.completeHumanTask(
          parameters.taskId as string,
          parameters.decision as string,
          parameters.rationale as string
        );
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
    if (toolName.includes('Report') || toolName.includes('Catalog') || toolName.includes('Cycle')) {
      return 'report';
    }
    if (toolName.includes('CDE') || toolName.includes('ownership')) {
      return 'cde';
    }
    if (toolName.includes('mapping')) {
      return 'lineage';
    }
    if (toolName.includes('control')) {
      return 'control';
    }
    if (toolName.includes('Task')) {
      return 'task';
    }
    return 'unknown';
  }

  /**
   * Extract entity ID from parameters
   */
  private extractEntityId(parameters: Record<string, unknown>): string | null {
    const idKeys = ['reportId', 'cdeId', 'taskId', 'cycleId', 'controlId', 'entityId'];
    for (const key of idKeys) {
      if (parameters[key] && typeof parameters[key] === 'string') {
        return parameters[key] as string;
      }
    }
    return null;
  }

  /**
   * Generate action title
   */
  private generateActionTitle(toolName: string, parameters: Record<string, unknown>): string {
    const entityId = this.extractEntityId(parameters);
    
    switch (toolName) {
      case 'approveCatalog':
        return 'Approve Regulatory Report Catalog';
      case 'startReportCycle':
        return `Start Report Cycle${entityId ? ` for ${entityId}` : ''}`;
      case 'completeHumanTask':
        return `Complete Workflow Task${entityId ? ` ${entityId}` : ''}`;
      case 'ownership_change':
        return `Change CDE Ownership${entityId ? ` for ${entityId}` : ''}`;
      case 'source_mapping_change':
        return 'Modify Source Mapping';
      case 'control_effectiveness_signoff':
        return 'Sign Off on Control Effectiveness';
      default:
        return `Approve ${toolName}`;
    }
  }

  /**
   * Generate action description
   */
  private generateActionDescription(toolName: string, parameters: Record<string, unknown>): string {
    const entityId = this.extractEntityId(parameters);
    
    switch (toolName) {
      case 'approveCatalog':
        return 'The AI assistant is requesting approval to finalize the regulatory report catalog. This will make the catalog the official reference for compliance activities.';
      case 'startReportCycle':
        return `The AI assistant is requesting to initiate a new reporting cycle${entityId ? ` for report ${entityId}` : ''}. This will begin the data collection and validation process.`;
      case 'completeHumanTask':
        return `The AI assistant is requesting to complete a workflow task${entityId ? ` (${entityId})` : ''}. This may trigger subsequent workflow steps.`;
      case 'ownership_change':
        return `The AI assistant is requesting to change the ownership of a Critical Data Element${entityId ? ` (${entityId})` : ''}. This will affect accountability and access permissions.`;
      case 'source_mapping_change':
        return 'The AI assistant is requesting to modify source mappings. This may affect data lineage and quality tracking.';
      case 'control_effectiveness_signoff':
        return 'The AI assistant is requesting sign-off on control effectiveness. This will update the compliance status.';
      default:
        return `The AI assistant is requesting to execute ${toolName} with the provided parameters.`;
    }
  }

  /**
   * Log action request to episodic memory
   * Validates: Requirements 4.2
   */
  private async logActionToEpisodicMemory(
    action: HumanGateAction,
    eventType: 'requested' | 'expired'
  ): Promise<void> {
    if (!this.memoryService || !action.tenantId || !action.requestedBy) {
      return;
    }

    const episode: Omit<Episode, 'id'> = {
      sessionId: action.sessionId || 'unknown',
      userId: action.requestedBy,
      tenantId: action.tenantId,
      timestamp: new Date(),
      type: 'action',
      content: `Human gate ${eventType}: ${action.title}`,
      context: {
        actionId: action.id,
        actionType: action.type,
        toolName: action.toolName,
        entityType: action.entityType,
        entityId: action.entityId,
        aiRationale: action.aiRationale,
      },
      relatedEntities: [{
        entityType: action.entityType,
        entityId: action.entityId,
        displayName: action.title,
        lastMentioned: new Date(),
      }],
      tags: ['human_gate', eventType, action.type],
    };

    await this.memoryService.recordEpisode(episode);
  }

  /**
   * Log decision to episodic memory
   * Validates: Requirements 4.2, 9.3
   */
  private async logDecisionToEpisodicMemory(
    action: HumanGateAction,
    result: HumanGateResult
  ): Promise<void> {
    if (!this.memoryService || !action.tenantId) {
      return;
    }

    const episode: Omit<Episode, 'id'> = {
      sessionId: action.sessionId || 'unknown',
      userId: result.decidedBy,
      tenantId: action.tenantId,
      timestamp: result.decidedAt,
      type: 'decision',
      content: `Human gate decision: ${result.decision} for ${action.title}`,
      context: {
        actionId: action.id,
        actionType: action.type,
        toolName: action.toolName,
        entityType: action.entityType,
        entityId: action.entityId,
        decision: result.decision,
        rationale: result.rationale,
        aiRationale: action.aiRationale,
        toolResult: result.toolResult ? {
          success: result.toolResult.success,
          error: result.toolResult.error,
        } : undefined,
      },
      relatedEntities: [{
        entityType: action.entityType,
        entityId: action.entityId,
        displayName: action.title,
        lastMentioned: result.decidedAt,
      }],
      outcome: result.decision,
      tags: ['human_gate', 'decision', result.decision, action.type],
    };

    await this.memoryService.recordEpisode(episode);
  }

  // ==================== Testing/Debug Methods ====================

  /**
   * Get all pending actions (for testing)
   */
  getAllPendingActions(): HumanGateAction[] {
    return Array.from(this.pendingActions.values());
  }

  /**
   * Get all results (for testing)
   */
  getAllResults(): HumanGateResult[] {
    return Array.from(this.actionResults.values());
  }

  /**
   * Clear all data (for testing)
   */
  clearAll(): void {
    this.pendingActions.clear();
    this.actionResults.clear();
  }
}

/**
 * Create a new Human Gate Service instance
 */
export function createHumanGateService(
  memoryService?: MemoryService,
  toolService?: ToolService,
  config?: Partial<HumanGateConfig>
): HumanGateService {
  return new HumanGateServiceImpl(memoryService, toolService, config);
}
