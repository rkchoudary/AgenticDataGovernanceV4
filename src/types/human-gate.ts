/**
 * Human Gate types for the Regulatory AI Assistant
 * 
 * Defines types for human-in-the-loop oversight including:
 * - Human gate actions requiring approval
 * - Human gate results and decisions
 * - Critical action type definitions
 * 
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { ToolResult } from './tool-service.js';

// ==================== Human Gate Action Types ====================

/**
 * Type of human gate action requiring approval
 * Validates: Requirements 9.1, 9.5
 */
export type HumanGateActionType =
  | 'approval'           // General approval (e.g., catalog approval)
  | 'sign_off'           // Sign-off on completed work
  | 'mapping_change'     // Source mapping modifications
  | 'ownership_change'   // CDE ownership changes
  | 'control_effectiveness'; // Control effectiveness sign-offs

/**
 * Decision made at a human gate
 * Validates: Requirements 9.3, 9.4
 */
export type HumanGateDecision = 'approved' | 'rejected' | 'deferred';

/**
 * Status of a human gate action
 */
export type HumanGateStatus = 'pending' | 'approved' | 'rejected' | 'deferred' | 'expired';

// ==================== Human Gate Action ====================

/**
 * Human gate action requiring user confirmation
 * Validates: Requirements 9.1, 9.2, 9.5
 */
export interface HumanGateAction {
  /** Unique identifier for the action */
  id: string;
  /** Type of action requiring approval */
  type: HumanGateActionType;
  /** Display title */
  title: string;
  /** Detailed description of the action */
  description: string;
  /** Impact assessment */
  impact: string;
  /** Required role to approve */
  requiredRole: string;
  /** Entity type being affected */
  entityType: string;
  /** Entity ID being affected */
  entityId: string;
  /** Proposed changes (if applicable) */
  proposedChanges?: Record<string, unknown>;
  /** AI's rationale for the recommendation */
  aiRationale: string;
  /** Tool name that triggered this gate */
  toolName?: string;
  /** Tool parameters */
  toolParameters?: Record<string, unknown>;
  /** Session ID where this was created */
  sessionId?: string;
  /** User ID who triggered this action */
  requestedBy?: string;
  /** Tenant ID for data isolation */
  tenantId?: string;
  /** Created timestamp */
  createdAt: Date;
  /** Expiration timestamp */
  expiresAt?: Date;
  /** Current status */
  status: HumanGateStatus;
}

/**
 * Result of a human gate decision
 * Validates: Requirements 9.3, 9.4
 */
export interface HumanGateResult {
  /** Action ID this result belongs to */
  actionId: string;
  /** Decision made */
  decision: HumanGateDecision;
  /** Rationale for the decision */
  rationale: string;
  /** User who made the decision */
  decidedBy: string;
  /** Timestamp of the decision */
  decidedAt: Date;
  /** Tool result if action was executed after approval */
  toolResult?: ToolResult;
  /** Digital signature if required */
  signature?: string;
}

// ==================== Critical Action Types ====================

/**
 * Critical action types that require human gate
 * Validates: Requirements 9.1, 9.5
 */
export const CRITICAL_ACTION_TYPES: string[] = [
  'approveCatalog',
  'completeHumanTask',
  'startReportCycle',
  'ownership_change',
  'source_mapping_change',
  'control_effectiveness_signoff',
];

/**
 * Map of tool names to human gate action types
 */
export const TOOL_TO_GATE_TYPE: Record<string, HumanGateActionType> = {
  approveCatalog: 'approval',
  completeHumanTask: 'sign_off',
  startReportCycle: 'approval',
  ownership_change: 'ownership_change',
  source_mapping_change: 'mapping_change',
  control_effectiveness_signoff: 'control_effectiveness',
};

/**
 * Impact descriptions for critical actions
 */
export const CRITICAL_ACTION_IMPACTS: Record<string, string> = {
  approveCatalog: 'This will approve the regulatory report catalog, making it the official reference for compliance.',
  completeHumanTask: 'This will complete a workflow task and may trigger subsequent workflow steps.',
  startReportCycle: 'This will initiate a new reporting cycle for the specified report.',
  ownership_change: 'This will change the ownership of a Critical Data Element, affecting accountability.',
  source_mapping_change: 'This will modify source mappings, potentially affecting data lineage and quality.',
  control_effectiveness_signoff: 'This will sign off on control effectiveness, impacting compliance status.',
};

// ==================== Human Gate Service Interface ====================

/**
 * Human Gate Service interface
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
 */
export interface HumanGateService {
  /**
   * Create a human gate action for a critical operation
   * Validates: Requirements 9.1, 9.5
   */
  createHumanGateAction(
    toolName: string,
    parameters: Record<string, unknown>,
    context: HumanGateContext
  ): HumanGateAction;

  /**
   * Request human approval for an action
   * Validates: Requirements 9.1, 9.2
   */
  requestApproval(action: HumanGateAction): Promise<void>;

  /**
   * Process a human gate decision
   * Validates: Requirements 9.3, 9.4
   */
  processDecision(
    actionId: string,
    decision: HumanGateDecision,
    rationale: string,
    decidedBy: string,
    signature?: string
  ): Promise<HumanGateResult>;

  /**
   * Get pending human gate actions for a user/tenant
   */
  getPendingActions(tenantId: string, userId?: string): Promise<HumanGateAction[]>;

  /**
   * Get a specific human gate action by ID
   */
  getAction(actionId: string): Promise<HumanGateAction | null>;

  /**
   * Get the result of a human gate decision
   */
  getResult(actionId: string): Promise<HumanGateResult | null>;

  /**
   * Check if an action requires human approval
   * Validates: Requirements 9.1, 9.5
   */
  requiresApproval(toolName: string): boolean;

  /**
   * Check if an action has been approved
   */
  isApproved(actionId: string): Promise<boolean>;

  /**
   * Cancel a pending human gate action
   */
  cancelAction(actionId: string, reason: string): Promise<void>;
}

/**
 * Context for creating human gate actions
 */
export interface HumanGateContext {
  /** User ID who triggered the action */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Session ID */
  sessionId: string;
  /** AI rationale for the recommendation */
  aiRationale?: string;
}

// ==================== Human Gate Configuration ====================

/**
 * Configuration for the Human Gate Service
 */
export interface HumanGateConfig {
  /** Timeout for human gate actions in milliseconds (default: 24 hours) */
  actionTimeoutMs: number;
  /** Whether to require digital signature for approvals */
  requireSignature: boolean;
  /** Minimum rationale length */
  minRationaleLength: number;
  /** Whether to log all decisions to episodic memory */
  logToEpisodicMemory: boolean;
}

/**
 * Default Human Gate configuration
 */
export const DEFAULT_HUMAN_GATE_CONFIG: HumanGateConfig = {
  actionTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  requireSignature: false,
  minRationaleLength: 10,
  logToEpisodicMemory: true,
};

// ==================== Utility Functions ====================

/**
 * Check if a tool requires human approval
 * Validates: Requirements 9.1, 9.5
 */
export function isCriticalAction(toolName: string): boolean {
  return CRITICAL_ACTION_TYPES.includes(toolName);
}

/**
 * Get the human gate action type for a tool
 */
export function getGateTypeForTool(toolName: string): HumanGateActionType {
  return TOOL_TO_GATE_TYPE[toolName] || 'approval';
}

/**
 * Get the impact description for a critical action
 */
export function getImpactDescription(toolName: string, parameters?: Record<string, unknown>): string {
  const baseImpact = CRITICAL_ACTION_IMPACTS[toolName] || 'This action may affect regulatory compliance data.';
  
  // Add parameter-specific context if available
  if (parameters) {
    if (parameters.reportId) {
      return `${baseImpact} Affects report: ${parameters.reportId}`;
    }
    if (parameters.cdeId) {
      return `${baseImpact} Affects CDE: ${parameters.cdeId}`;
    }
  }
  
  return baseImpact;
}

/**
 * Check if a human gate action has expired
 */
export function isActionExpired(action: HumanGateAction): boolean {
  if (!action.expiresAt) {
    return false;
  }
  return new Date() > action.expiresAt;
}

/**
 * Get the required role for a human gate action type
 */
export function getRequiredRole(actionType: HumanGateActionType): string {
  switch (actionType) {
    case 'approval':
      return 'approver';
    case 'sign_off':
      return 'reviewer';
    case 'mapping_change':
      return 'data_steward';
    case 'ownership_change':
      return 'data_owner';
    case 'control_effectiveness':
      return 'control_owner';
    default:
      return 'approver';
  }
}
