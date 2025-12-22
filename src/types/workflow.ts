/**
 * Workflow and orchestration types for the Agentic Data Governance System
 */

import { 
  CycleStatus, 
  Phase, 
  TaskType, 
  TaskStatus, 
  DecisionOutcome,
  AgentType,
  AgentStatus,
  WorkflowActionType
} from './common.js';
import { AuditEntry } from './audit.js';

/**
 * Checkpoint in a workflow cycle
 */
export interface Checkpoint {
  id: string;
  name: string;
  phase: Phase;
  requiredApprovals: string[];
  completedApprovals: string[];
  status: 'pending' | 'completed' | 'skipped';
}

/**
 * Cycle instance for a report
 */
export interface CycleInstance {
  id: string;
  reportId: string;
  periodEnd: Date;
  status: CycleStatus;
  currentPhase: Phase;
  checkpoints: Checkpoint[];
  auditTrail: AuditEntry[];
  startedAt: Date;
  completedAt?: Date;
  pausedAt?: Date;
  pauseReason?: string;
}

/**
 * Decision made at a checkpoint
 */
export interface Decision {
  outcome: DecisionOutcome;
  changes?: unknown;
}

/**
 * Human task in the workflow
 */
export interface HumanTask {
  id: string;
  cycleId: string;
  type: TaskType;
  title: string;
  description: string;
  assignedTo: string;
  assignedRole: string;
  dueDate: Date;
  status: TaskStatus;
  decision?: Decision;
  decisionRationale?: string;
  completedAt?: Date;
  completedBy?: string;
  createdAt: Date;
  escalationLevel: number;
}

/**
 * Context passed to agents
 */
export interface AgentContext {
  cycleId: string;
  reportId: string;
  phase: Phase;
  parameters?: Record<string, unknown>;
}

/**
 * Result from agent execution
 */
export interface AgentResult {
  agentType: AgentType;
  success: boolean;
  output?: unknown;
  errors?: string[];
  executedAt: Date;
  duration: number;
}

/**
 * Status of an agent
 */
export interface AgentStatusInfo {
  agentType: AgentType;
  status: AgentStatus;
  lastRun?: Date;
  lastResult?: AgentResult;
}

/**
 * Workflow action
 */
export interface WorkflowAction {
  type: WorkflowActionType;
  delay?: number;
  reason?: string;
  notification?: Notification;
  error?: Error;
}

/**
 * Notification for workflow events
 */
export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'escalation';
  title: string;
  message: string;
  recipients: string[];
  sentAt?: Date;
}

/**
 * Task ID type
 */
export type TaskId = string;

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  name: string;
  agentType?: AgentType;
  isHumanCheckpoint: boolean;
  requiredRole?: string;
  dependencies: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'waiting_for_human';
}

/**
 * Validation error in workflow
 */
export interface ValidationError {
  field: string;
  message: string;
  code: string;
}
