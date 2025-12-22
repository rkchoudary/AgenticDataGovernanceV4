/**
 * Governance Orchestrator for the Agentic Data Governance System
 * Central coordinator that manages the reporting lifecycle and agent sequencing
 * 
 * Implements Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { v4 as uuidv4 } from 'uuid';
import {
  CycleInstance,
  HumanTask,
  Decision,
  AgentContext,
  AgentResult,
  AgentStatusInfo,
  TaskId,
  AgentType,
  Phase,
  TaskType,
  Checkpoint,
  WorkflowStep,
  Issue
} from '../types/index.js';
import { IGovernanceOrchestrator } from '../interfaces/index.js';
import { IGovernanceRepository } from '../repository/index.js';

/**
 * Agent dependency configuration
 * Defines which agents must complete before others can run
 */
const AGENT_DEPENDENCIES: Record<AgentType, AgentType[]> = {
  'regulatory_intelligence': [],
  'data_requirements': ['regulatory_intelligence'],
  'cde_identification': ['data_requirements'],
  'data_quality_rule': ['cde_identification'],
  'lineage_mapping': ['data_requirements'],
  'issue_management': ['data_quality_rule'],
  'documentation': ['data_quality_rule', 'lineage_mapping', 'issue_management']
};

/**
 * Phase to agent mapping
 */
const PHASE_AGENTS: Record<Phase, AgentType[]> = {
  'data_gathering': ['regulatory_intelligence', 'data_requirements'],
  'validation': ['cde_identification', 'data_quality_rule', 'lineage_mapping'],
  'review': ['issue_management'],
  'approval': ['documentation'],
  'submission': []
};

/**
 * Human checkpoint configuration
 */
interface HumanCheckpointConfig {
  phase: Phase;
  taskType: TaskType;
  requiredRole: string;
  description: string;
}

const HUMAN_CHECKPOINTS: HumanCheckpointConfig[] = [
  {
    phase: 'data_gathering',
    taskType: 'catalog_review',
    requiredRole: 'compliance_officer',
    description: 'Review and approve the regulatory report catalog'
  },
  {
    phase: 'data_gathering',
    taskType: 'requirements_validation',
    requiredRole: 'data_steward',
    description: 'Validate data requirements document'
  },
  {
    phase: 'validation',
    taskType: 'cde_approval',
    requiredRole: 'data_governance_lead',
    description: 'Approve critical data element inventory'
  },
  {
    phase: 'validation',
    taskType: 'rule_review',
    requiredRole: 'data_steward',
    description: 'Review data quality rules'
  },
  {
    phase: 'validation',
    taskType: 'lineage_validation',
    requiredRole: 'data_architect',
    description: 'Validate data lineage mappings'
  },
  {
    phase: 'approval',
    taskType: 'attestation',
    requiredRole: 'cfo',
    description: 'Management attestation for regulatory submission'
  },
  {
    phase: 'submission',
    taskType: 'submission_approval',
    requiredRole: 'regulatory_reporting_manager',
    description: 'Final approval for regulatory submission'
  }
];

/**
 * Implementation of the Governance Orchestrator
 */
export class GovernanceOrchestrator implements IGovernanceOrchestrator {
  private agentStatuses: Map<string, AgentStatusInfo> = new Map();
  private workflowSteps: Map<string, WorkflowStep[]> = new Map();

  constructor(private repository: IGovernanceRepository) {}

  /**
   * Starts a new report cycle
   * Implements Requirements 12.1: Orchestrate agent activities
   */
  async startReportCycle(reportId: string, periodEnd: Date): Promise<CycleInstance> {
    // Create initial checkpoints for the cycle
    const checkpoints = this.createCheckpoints();

    // Create the cycle instance
    const cycle = this.repository.createCycleInstance({
      reportId,
      periodEnd,
      status: 'active',
      currentPhase: 'data_gathering',
      checkpoints,
      auditTrail: [],
      startedAt: new Date()
    });

    // Initialize workflow steps for this cycle
    this.initializeWorkflowSteps(cycle.id);

    // Log the cycle start
    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'start_cycle',
      entityType: 'CycleInstance',
      entityId: cycle.id,
      newState: cycle
    });

    return cycle;
  }

  /**
   * Pauses an active cycle
   * Implements Requirements 12.1: Lifecycle management
   */
  async pauseCycle(cycleId: string, reason: string): Promise<void> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    if (cycle.status !== 'active') {
      throw new Error(`Cannot pause cycle in ${cycle.status} status`);
    }

    const previousState = { ...cycle };
    
    this.repository.updateCycleInstance(cycleId, {
      status: 'paused',
      pausedAt: new Date(),
      pauseReason: reason
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'pause_cycle',
      entityType: 'CycleInstance',
      entityId: cycleId,
      previousState,
      newState: { status: 'paused', pauseReason: reason },
      rationale: reason
    });
  }

  /**
   * Resumes a paused cycle
   * Implements Requirements 12.1: Lifecycle management
   */
  async resumeCycle(cycleId: string): Promise<void> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    if (cycle.status !== 'paused') {
      throw new Error(`Cannot resume cycle in ${cycle.status} status`);
    }

    // Check for blocking critical issues before resuming
    const blockingIssues = await this.getBlockingCriticalIssues(cycle.reportId);
    if (blockingIssues.length > 0) {
      throw new Error(`Cannot resume cycle: ${blockingIssues.length} critical issues blocking workflow`);
    }

    const previousState = { ...cycle };

    this.repository.updateCycleInstance(cycleId, {
      status: 'active',
      pausedAt: undefined,
      pauseReason: undefined
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'resume_cycle',
      entityType: 'CycleInstance',
      entityId: cycleId,
      previousState,
      newState: { status: 'active' }
    });
  }


  /**
   * Triggers an agent to execute
   * Implements Requirements 12.1: Agent coordination with dependency handling
   */
  async triggerAgent(agentType: AgentType, context: AgentContext): Promise<AgentResult> {
    const cycle = this.repository.getCycleInstance(context.cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${context.cycleId} not found`);
    }

    // Check if cycle is active
    if (cycle.status !== 'active') {
      throw new Error(`Cannot trigger agent: cycle is ${cycle.status}`);
    }

    // Check dependencies
    const dependencies = AGENT_DEPENDENCIES[agentType];
    for (const dep of dependencies) {
      const depStatus = await this.getAgentStatus(dep, context.cycleId);
      if (depStatus.status !== 'completed') {
        throw new Error(`Cannot trigger ${agentType}: dependency ${dep} is not completed (status: ${depStatus.status})`);
      }
    }

    // Check for blocking critical issues
    const blockingIssues = await this.getBlockingCriticalIssues(context.reportId);
    if (blockingIssues.length > 0) {
      // Pause the cycle due to critical issues
      await this.pauseCycleForCriticalIssue(context.cycleId, blockingIssues[0]);
      throw new Error(`Agent execution blocked: critical issue ${blockingIssues[0].id} requires resolution`);
    }

    // Update agent status to running
    const statusKey = `${context.cycleId}:${agentType}`;
    this.agentStatuses.set(statusKey, {
      agentType,
      status: 'running',
      lastRun: new Date()
    });

    const startTime = Date.now();

    try {
      // Execute the agent (in real implementation, this would call the actual agent)
      const result: AgentResult = {
        agentType,
        success: true,
        executedAt: new Date(),
        duration: Date.now() - startTime
      };

      // Update agent status to completed
      this.agentStatuses.set(statusKey, {
        agentType,
        status: 'completed',
        lastRun: new Date(),
        lastResult: result
      });

      // Update workflow step status
      this.updateWorkflowStepStatus(context.cycleId, agentType, 'completed');

      // Log the agent execution
      this.repository.createAuditEntry({
        actor: agentType,
        actorType: 'agent',
        action: 'execute',
        entityType: 'AgentExecution',
        entityId: `${context.cycleId}:${agentType}`,
        newState: result
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: AgentResult = {
        agentType,
        success: false,
        errors: [errorMessage],
        executedAt: new Date(),
        duration: Date.now() - startTime
      };

      // Update agent status to failed
      this.agentStatuses.set(statusKey, {
        agentType,
        status: 'failed',
        lastRun: new Date(),
        lastResult: result
      });

      this.repository.createAuditEntry({
        actor: agentType,
        actorType: 'agent',
        action: 'execute_failed',
        entityType: 'AgentExecution',
        entityId: `${context.cycleId}:${agentType}`,
        newState: result,
        rationale: errorMessage
      });

      throw error;
    }
  }

  /**
   * Gets the status of an agent for a specific cycle
   */
  async getAgentStatus(agentType: AgentType, cycleId: string): Promise<AgentStatusInfo> {
    const statusKey = `${cycleId}:${agentType}`;
    const status = this.agentStatuses.get(statusKey);
    
    if (status) {
      return status;
    }

    // Return default idle status if not found
    return {
      agentType,
      status: 'idle'
    };
  }

  /**
   * Creates a human task for HITL workflow
   * Implements Requirements 12.2: Human checkpoint management
   */
  async createHumanTask(task: Omit<HumanTask, 'id' | 'createdAt' | 'escalationLevel'>): Promise<TaskId> {
    // Create the task in the repository
    const createdTask = this.repository.createHumanTask(task);

    // Update workflow step status if applicable
    const steps = this.workflowSteps.get(task.cycleId);
    if (steps) {
      const step = steps.find(s => s.isHumanCheckpoint && s.requiredRole === task.assignedRole);
      if (step) {
        step.status = 'waiting_for_human';
      }
    }

    // Pause the cycle while waiting for human input
    const cycle = this.repository.getCycleInstance(task.cycleId);
    if (cycle && cycle.status === 'active') {
      this.repository.updateCycleInstance(task.cycleId, {
        status: 'paused',
        pauseReason: `Waiting for human task: ${task.title}`
      });
    }

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'create_human_task',
      entityType: 'HumanTask',
      entityId: createdTask.id,
      newState: createdTask
    });

    return createdTask.id;
  }

  /**
   * Completes a human task with decision logging
   * Implements Requirements 12.2, 12.3: Decision logging
   */
  async completeHumanTask(taskId: TaskId, decision: Decision, rationale: string): Promise<void> {
    const task = this.repository.getHumanTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === 'completed') {
      throw new Error(`Task ${taskId} is already completed`);
    }

    const previousState = { ...task };

    // Update the task
    this.repository.updateHumanTask(taskId, {
      status: 'completed',
      decision,
      decisionRationale: rationale,
      completedAt: new Date(),
      completedBy: task.assignedTo
    });

    // Log the decision
    this.repository.createAuditEntry({
      actor: task.assignedTo,
      actorType: 'human',
      action: 'complete_task',
      entityType: 'HumanTask',
      entityId: taskId,
      previousState,
      newState: { status: 'completed', decision, decisionRationale: rationale },
      rationale
    });

    // Update workflow step status
    const steps = this.workflowSteps.get(task.cycleId);
    if (steps) {
      const step = steps.find(s => s.isHumanCheckpoint && s.requiredRole === task.assignedRole);
      if (step) {
        step.status = decision.outcome === 'rejected' ? 'failed' : 'completed';
      }
    }

    // Update checkpoint status
    await this.updateCheckpointStatus(task.cycleId, task.type, decision);

    // Resume cycle if decision was approved
    if (decision.outcome === 'approved' || decision.outcome === 'approved_with_changes') {
      const cycle = this.repository.getCycleInstance(task.cycleId);
      if (cycle && cycle.status === 'paused') {
        // Check if there are other pending tasks
        const pendingTasks = this.repository.getAllHumanTasks(task.cycleId)
          .filter(t => t.status === 'pending' || t.status === 'in_progress');
        
        if (pendingTasks.length === 0) {
          await this.resumeCycleAfterHumanTask(task.cycleId);
        }
      }
    }
  }

  /**
   * Escalates a task to a higher level
   * Implements Requirements 12.2: Task escalation
   */
  async escalateTask(taskId: TaskId, escalationLevel: number): Promise<void> {
    const task = this.repository.getHumanTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status === 'completed') {
      throw new Error(`Cannot escalate completed task ${taskId}`);
    }

    const previousState = { ...task };

    this.repository.updateHumanTask(taskId, {
      status: 'escalated',
      escalationLevel
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'escalate_task',
      entityType: 'HumanTask',
      entityId: taskId,
      previousState,
      newState: { status: 'escalated', escalationLevel },
      rationale: `Escalated to level ${escalationLevel}`
    });
  }


  /**
   * Checks for critical issues that should block the workflow
   * Implements Requirements 12.4: Critical issue workflow blocking
   */
  async checkCriticalIssueBlocking(cycleId: string): Promise<boolean> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      return false;
    }

    const blockingIssues = await this.getBlockingCriticalIssues(cycle.reportId);
    
    if (blockingIssues.length > 0 && cycle.status === 'active') {
      await this.pauseCycleForCriticalIssue(cycleId, blockingIssues[0]);
      return true;
    }

    return false;
  }

  /**
   * Initiates a retrospective review workflow
   * Implements Requirements 12.5: Retrospective review support
   */
  async initiateRetrospective(cycleId: string): Promise<HumanTask> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    if (cycle.status !== 'completed') {
      throw new Error(`Cannot initiate retrospective for cycle in ${cycle.status} status`);
    }

    // Create a retrospective review task
    const task = this.repository.createHumanTask({
      cycleId,
      type: 'catalog_review', // Using catalog_review as a general review type
      title: `Retrospective Review for Cycle ${cycleId}`,
      description: 'Review the completed report cycle and capture improvement suggestions',
      assignedTo: 'governance-team@company.com',
      assignedRole: 'data_governance_lead',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      status: 'pending'
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'initiate_retrospective',
      entityType: 'CycleInstance',
      entityId: cycleId,
      newState: { retrospectiveTaskId: task.id }
    });

    return task;
  }

  /**
   * Advances the cycle to the next phase
   */
  async advancePhase(cycleId: string): Promise<Phase> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const phaseOrder: Phase[] = ['data_gathering', 'validation', 'review', 'approval', 'submission'];
    const currentIndex = phaseOrder.indexOf(cycle.currentPhase);
    
    if (currentIndex === phaseOrder.length - 1) {
      // Complete the cycle
      this.repository.updateCycleInstance(cycleId, {
        status: 'completed',
        completedAt: new Date()
      });
      return cycle.currentPhase;
    }

    const nextPhase = phaseOrder[currentIndex + 1];
    
    this.repository.updateCycleInstance(cycleId, {
      currentPhase: nextPhase
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'advance_phase',
      entityType: 'CycleInstance',
      entityId: cycleId,
      previousState: { currentPhase: cycle.currentPhase },
      newState: { currentPhase: nextPhase }
    });

    return nextPhase;
  }

  /**
   * Checks if attestation is required and complete
   * Used for Property 4: Attestation Gate Invariant
   */
  isAttestationComplete(cycleId: string): boolean {
    const tasks = this.repository.getAllHumanTasks(cycleId);
    const attestationTask = tasks.find(t => t.type === 'attestation');
    
    if (!attestationTask) {
      return false;
    }

    return attestationTask.status === 'completed' && 
           attestationTask.decision?.outcome === 'approved';
  }

  /**
   * Checks if cycle can transition to submission ready
   * Implements attestation gate invariant
   */
  canTransitionToSubmissionReady(cycleId: string): boolean {
    return this.isAttestationComplete(cycleId);
  }

  /**
   * Gets all workflow steps for a cycle
   */
  getWorkflowSteps(cycleId: string): WorkflowStep[] {
    return this.workflowSteps.get(cycleId) || [];
  }

  /**
   * Checks if a task's dependencies are satisfied
   * Used for Property 3: Workflow Dependency Enforcement
   */
  areDependenciesSatisfied(cycleId: string, stepId: string): boolean {
    const steps = this.workflowSteps.get(cycleId);
    if (!steps) {
      return false;
    }

    const step = steps.find(s => s.id === stepId);
    if (!step) {
      return false;
    }

    // Check all dependencies
    for (const depId of step.dependencies) {
      const depStep = steps.find(s => s.id === depId);
      if (!depStep || depStep.status !== 'completed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Creates checkpoints for a new cycle
   */
  private createCheckpoints(): Checkpoint[] {
    return HUMAN_CHECKPOINTS.map((config) => ({
      id: uuidv4(),
      name: config.description,
      phase: config.phase,
      requiredApprovals: [config.requiredRole],
      completedApprovals: [],
      status: 'pending' as const
    }));
  }

  /**
   * Initializes workflow steps for a cycle
   */
  private initializeWorkflowSteps(cycleId: string): void {
    const steps: WorkflowStep[] = [];
    let stepIndex = 0;

    // Create steps for each phase and agent
    const phaseOrder: Phase[] = ['data_gathering', 'validation', 'review', 'approval', 'submission'];
    
    for (const phase of phaseOrder) {
      const agents = PHASE_AGENTS[phase];
      
      // Add agent steps
      for (const agentType of agents) {
        const dependencies = AGENT_DEPENDENCIES[agentType];
        const depStepIds = steps
          .filter(s => s.agentType && dependencies.includes(s.agentType))
          .map(s => s.id);

        steps.push({
          id: `step-${stepIndex++}`,
          name: `Execute ${agentType}`,
          agentType,
          isHumanCheckpoint: false,
          dependencies: depStepIds,
          status: 'pending'
        });
      }

      // Add human checkpoint steps for this phase
      const checkpoints = HUMAN_CHECKPOINTS.filter(c => c.phase === phase);
      for (const checkpoint of checkpoints) {
        // Human checkpoints depend on all agent steps in the same phase
        const phaseAgentSteps = steps
          .filter(s => s.agentType && PHASE_AGENTS[phase].includes(s.agentType))
          .map(s => s.id);

        steps.push({
          id: `step-${stepIndex++}`,
          name: checkpoint.description,
          isHumanCheckpoint: true,
          requiredRole: checkpoint.requiredRole,
          dependencies: phaseAgentSteps,
          status: 'pending'
        });
      }
    }

    this.workflowSteps.set(cycleId, steps);
  }

  /**
   * Updates the status of a workflow step for an agent
   */
  private updateWorkflowStepStatus(
    cycleId: string, 
    agentType: AgentType, 
    status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'waiting_for_human'
  ): void {
    const steps = this.workflowSteps.get(cycleId);
    if (!steps) {
      return;
    }

    const step = steps.find(s => s.agentType === agentType);
    if (step) {
      step.status = status;
    }
  }

  /**
   * Gets critical issues that should block the workflow
   */
  private async getBlockingCriticalIssues(reportId: string): Promise<Issue[]> {
    const allIssues = this.repository.getAllIssues();
    
    return allIssues.filter(issue => 
      issue.severity === 'critical' &&
      issue.impactedReports.includes(reportId) &&
      issue.status !== 'closed' &&
      issue.status !== 'resolved'
    );
  }

  /**
   * Pauses cycle due to critical issue
   */
  private async pauseCycleForCriticalIssue(cycleId: string, issue: Issue): Promise<void> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle || cycle.status !== 'active') {
      return;
    }

    this.repository.updateCycleInstance(cycleId, {
      status: 'paused',
      pausedAt: new Date(),
      pauseReason: `Critical issue blocking workflow: ${issue.id} - ${issue.title}`
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'pause_for_critical_issue',
      entityType: 'CycleInstance',
      entityId: cycleId,
      newState: { status: 'paused', blockingIssueId: issue.id },
      rationale: `Critical issue ${issue.id} requires resolution before workflow can continue`
    });
  }

  /**
   * Updates checkpoint status after human task completion
   */
  private async updateCheckpointStatus(
    cycleId: string, 
    taskType: TaskType, 
    decision: Decision
  ): Promise<void> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      return;
    }

    const checkpointConfig = HUMAN_CHECKPOINTS.find(c => c.taskType === taskType);
    if (!checkpointConfig) {
      return;
    }

    const updatedCheckpoints = cycle.checkpoints.map(checkpoint => {
      if (checkpoint.phase === checkpointConfig.phase && 
          checkpoint.requiredApprovals.includes(checkpointConfig.requiredRole)) {
        return {
          ...checkpoint,
          completedApprovals: [...checkpoint.completedApprovals, checkpointConfig.requiredRole],
          status: decision.outcome === 'rejected' ? 'skipped' as const : 'completed' as const
        };
      }
      return checkpoint;
    });

    this.repository.updateCycleInstance(cycleId, {
      checkpoints: updatedCheckpoints
    });
  }

  /**
   * Resumes cycle after human task completion
   */
  private async resumeCycleAfterHumanTask(cycleId: string): Promise<void> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      return;
    }

    // Check for blocking critical issues before resuming
    const blockingIssues = await this.getBlockingCriticalIssues(cycle.reportId);
    if (blockingIssues.length > 0) {
      return; // Keep paused due to critical issues
    }

    this.repository.updateCycleInstance(cycleId, {
      status: 'active',
      pausedAt: undefined,
      pauseReason: undefined
    });

    this.repository.createAuditEntry({
      actor: 'orchestrator',
      actorType: 'system',
      action: 'resume_after_human_task',
      entityType: 'CycleInstance',
      entityId: cycleId,
      newState: { status: 'active' }
    });
  }
}
