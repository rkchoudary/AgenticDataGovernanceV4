/**
 * Governance Orchestrator interface for the Agentic Data Governance System
 */

import {
  AgentType,
  CycleInstance,
  HumanTask,
  Decision,
  AgentContext,
  AgentResult,
  AgentStatusInfo,
  TaskId
} from '../types/index.js';

/**
 * Governance Orchestrator interface
 * Central coordinator that manages the reporting lifecycle and agent sequencing
 */
export interface IGovernanceOrchestrator {
  // Lifecycle management
  startReportCycle(reportId: string, periodEnd: Date): Promise<CycleInstance>;
  pauseCycle(cycleId: string, reason: string): Promise<void>;
  resumeCycle(cycleId: string): Promise<void>;
  
  // Agent coordination
  triggerAgent(agentType: AgentType, context: AgentContext): Promise<AgentResult>;
  getAgentStatus(agentType: AgentType, cycleId: string): Promise<AgentStatusInfo>;
  
  // HITL management
  createHumanTask(task: Omit<HumanTask, 'id' | 'createdAt' | 'escalationLevel'>): Promise<TaskId>;
  completeHumanTask(taskId: TaskId, decision: Decision, rationale: string): Promise<void>;
  escalateTask(taskId: TaskId, escalationLevel: number): Promise<void>;
}
