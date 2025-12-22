/**
 * Test generators for Workflow and Orchestration property tests
 * 
 * **Feature: agentic-data-governance, Property 3: Workflow Dependency Enforcement**
 * **Feature: agentic-data-governance, Property 4: Attestation Gate Invariant**
 * **Feature: agentic-data-governance, Property 24: Human Checkpoint Pause Behavior**
 * **Feature: agentic-data-governance, Property 25: Critical Issue Workflow Blocking**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 12.1, 12.2, 12.3, 12.4, 12.5**
 */

import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  CycleInstance,
  Checkpoint,
  HumanTask,
  Decision,
  AgentContext,
  AgentResult,
  AgentStatusInfo,
  WorkflowAction,
  Notification,
  WorkflowStep,
  ValidationError
} from '../../types/workflow.js';
import { AuditEntry } from '../../types/audit.js';
import {
  CycleStatus,
  Phase,
  TaskType,
  TaskStatus,
  DecisionOutcome,
  AgentType,
  AgentStatus,
  WorkflowActionType
} from '../../types/common.js';
import { actorTypeGenerator, taskStatusGenerator, taskTypeGenerator } from './common.generator.js';

/**
 * Generator for CycleStatus
 */
export const cycleStatusGenerator = (): fc.Arbitrary<CycleStatus> =>
  fc.constantFrom('active', 'paused', 'completed', 'failed');

/**
 * Generator for Phase
 */
export const phaseGenerator = (): fc.Arbitrary<Phase> =>
  fc.constantFrom('data_gathering', 'validation', 'review', 'approval', 'submission');

/**
 * Generator for DecisionOutcome
 */
export const decisionOutcomeGenerator = (): fc.Arbitrary<DecisionOutcome> =>
  fc.constantFrom('approved', 'rejected', 'approved_with_changes');

/**
 * Generator for AgentType
 */
export const agentTypeGenerator = (): fc.Arbitrary<AgentType> =>
  fc.constantFrom(
    'regulatory_intelligence',
    'data_requirements',
    'cde_identification',
    'data_quality_rule',
    'lineage_mapping',
    'issue_management',
    'documentation'
  );

/**
 * Generator for AgentStatus
 */
export const agentStatusGenerator = (): fc.Arbitrary<AgentStatus> =>
  fc.constantFrom('idle', 'running', 'completed', 'failed', 'waiting');

/**
 * Generator for WorkflowActionType
 */
export const workflowActionTypeGenerator = (): fc.Arbitrary<WorkflowActionType> =>
  fc.constantFrom('retry', 'skip', 'pause', 'fail');

/**
 * Generator for Decision
 */
export const decisionGenerator = (): fc.Arbitrary<Decision> =>
  fc.record({
    outcome: decisionOutcomeGenerator(),
    changes: fc.option(fc.dictionary(fc.string(), fc.string()))
  });

/**
 * Generator for Checkpoint
 */
export const checkpointGenerator = (): fc.Arbitrary<Checkpoint> =>
  fc.record({
    id: fc.constant(uuidv4()),
    name: fc.string({ minLength: 5, maxLength: 50 }),
    phase: phaseGenerator(),
    requiredApprovals: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 1, maxLength: 5 }),
    completedApprovals: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { minLength: 0, maxLength: 5 }),
    status: fc.constantFrom('pending', 'completed', 'skipped')
  });

/**
 * Generator for AuditEntry
 */
export const auditEntryGenerator = (): fc.Arbitrary<AuditEntry> =>
  fc.record({
    id: fc.constant(uuidv4()),
    timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    actor: fc.string({ minLength: 3, maxLength: 50 }),
    actorType: actorTypeGenerator(),
    action: fc.string({ minLength: 5, maxLength: 100 }),
    entityType: fc.constantFrom('report', 'cde', 'rule', 'issue', 'control', 'cycle', 'task'),
    entityId: fc.constant(uuidv4()),
    previousState: fc.option(fc.dictionary(fc.string(), fc.string())),
    newState: fc.option(fc.dictionary(fc.string(), fc.string())),
    rationale: fc.option(fc.string({ minLength: 10, maxLength: 200 }))
  });

/**
 * Generator for CycleInstance
 */
export const cycleInstanceGenerator = (): fc.Arbitrary<CycleInstance> =>
  fc.record({
    id: fc.constant(uuidv4()),
    reportId: fc.constant(uuidv4()),
    periodEnd: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
    status: cycleStatusGenerator(),
    currentPhase: phaseGenerator(),
    checkpoints: fc.array(checkpointGenerator(), { minLength: 0, maxLength: 5 }),
    auditTrail: fc.array(auditEntryGenerator(), { minLength: 0, maxLength: 20 }),
    startedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    completedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    pausedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    pauseReason: fc.option(fc.string({ minLength: 10, maxLength: 200 }))
  });

/**
 * Generator for CycleInstance with specific status
 */
export const cycleInstanceWithStatusGenerator = (status: CycleStatus): fc.Arbitrary<CycleInstance> =>
  fc.record({
    id: fc.constant(uuidv4()),
    reportId: fc.constant(uuidv4()),
    periodEnd: fc.date({ min: new Date('2020-01-01'), max: new Date('2026-12-31') }),
    status: fc.constant(status),
    currentPhase: phaseGenerator(),
    checkpoints: fc.array(checkpointGenerator(), { minLength: 0, maxLength: 5 }),
    auditTrail: fc.array(auditEntryGenerator(), { minLength: 0, maxLength: 20 }),
    startedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    completedAt: status === 'completed' ? fc.date({ min: new Date('2020-01-01'), max: new Date() }) : fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    pausedAt: status === 'paused' ? fc.date({ min: new Date('2020-01-01'), max: new Date() }) : fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    pauseReason: status === 'paused' ? fc.string({ minLength: 10, maxLength: 200 }) : fc.option(fc.string({ minLength: 10, maxLength: 200 }))
  });

/**
 * Generator for HumanTask
 */
export const humanTaskGenerator = (): fc.Arbitrary<HumanTask> =>
  fc.record({
    id: fc.constant(uuidv4()),
    cycleId: fc.constant(uuidv4()),
    type: taskTypeGenerator(),
    title: fc.string({ minLength: 5, maxLength: 100 }),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    assignedTo: fc.emailAddress(),
    assignedRole: fc.constantFrom('Data Steward', 'Compliance Officer', 'Risk Manager', 'CFO', 'Data Owner'),
    dueDate: fc.date({ min: new Date(), max: new Date('2026-12-31') }),
    status: taskStatusGenerator(),
    decision: fc.option(decisionGenerator()),
    decisionRationale: fc.option(fc.string({ minLength: 10, maxLength: 300 })),
    completedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    completedBy: fc.option(fc.emailAddress()),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    escalationLevel: fc.integer({ min: 0, max: 3 })
  });

/**
 * Generator for HumanTask with specific status
 */
export const humanTaskWithStatusGenerator = (status: TaskStatus): fc.Arbitrary<HumanTask> =>
  fc.record({
    id: fc.constant(uuidv4()),
    cycleId: fc.constant(uuidv4()),
    type: taskTypeGenerator(),
    title: fc.string({ minLength: 5, maxLength: 100 }),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    assignedTo: fc.emailAddress(),
    assignedRole: fc.constantFrom('Data Steward', 'Compliance Officer', 'Risk Manager', 'CFO', 'Data Owner'),
    dueDate: fc.date({ min: new Date(), max: new Date('2026-12-31') }),
    status: fc.constant(status),
    decision: status === 'completed' ? decisionGenerator() : fc.option(decisionGenerator()),
    decisionRationale: status === 'completed' ? fc.string({ minLength: 10, maxLength: 300 }) : fc.option(fc.string({ minLength: 10, maxLength: 300 })),
    completedAt: status === 'completed' ? fc.date({ min: new Date('2020-01-01'), max: new Date() }) : fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    completedBy: status === 'completed' ? fc.emailAddress() : fc.option(fc.emailAddress()),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    escalationLevel: status === 'escalated' ? fc.integer({ min: 1, max: 3 }) : fc.integer({ min: 0, max: 3 })
  });

/**
 * Generator for attestation task (for Property 4)
 */
export const attestationTaskGenerator = (): fc.Arbitrary<HumanTask> =>
  fc.record({
    id: fc.constant(uuidv4()),
    cycleId: fc.constant(uuidv4()),
    type: fc.constant('attestation' as TaskType),
    title: fc.constant('Management Attestation Required'),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    assignedTo: fc.emailAddress(),
    assignedRole: fc.constantFrom('CFO', 'CRO', 'CEO'),
    dueDate: fc.date({ min: new Date(), max: new Date('2026-12-31') }),
    status: taskStatusGenerator(),
    decision: fc.option(decisionGenerator()),
    decisionRationale: fc.option(fc.string({ minLength: 10, maxLength: 300 })),
    completedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    completedBy: fc.option(fc.emailAddress()),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    escalationLevel: fc.integer({ min: 0, max: 3 })
  });

/**
 * Generator for AgentContext
 */
export const agentContextGenerator = (): fc.Arbitrary<AgentContext> =>
  fc.record({
    cycleId: fc.constant(uuidv4()),
    reportId: fc.constant(uuidv4()),
    phase: phaseGenerator(),
    parameters: fc.option(fc.dictionary(fc.string(), fc.string()))
  });

/**
 * Generator for AgentResult
 */
export const agentResultGenerator = (): fc.Arbitrary<AgentResult> =>
  fc.record({
    agentType: agentTypeGenerator(),
    success: fc.boolean(),
    output: fc.option(fc.dictionary(fc.string(), fc.string())),
    errors: fc.option(fc.array(fc.string({ minLength: 10, maxLength: 100 }), { minLength: 0, maxLength: 5 })),
    executedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    duration: fc.integer({ min: 100, max: 60000 })
  });

/**
 * Generator for AgentStatusInfo
 */
export const agentStatusInfoGenerator = (): fc.Arbitrary<AgentStatusInfo> =>
  fc.record({
    agentType: agentTypeGenerator(),
    status: agentStatusGenerator(),
    lastRun: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    lastResult: fc.option(agentResultGenerator())
  });

/**
 * Generator for Notification
 */
export const notificationGenerator = (): fc.Arbitrary<Notification> =>
  fc.record({
    id: fc.constant(uuidv4()),
    type: fc.constantFrom('info', 'warning', 'error', 'escalation'),
    title: fc.string({ minLength: 5, maxLength: 100 }),
    message: fc.string({ minLength: 10, maxLength: 500 }),
    recipients: fc.array(fc.emailAddress(), { minLength: 1, maxLength: 5 }),
    sentAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }))
  });

/**
 * Generator for WorkflowAction
 */
export const workflowActionGenerator = (): fc.Arbitrary<WorkflowAction> =>
  fc.oneof(
    fc.record({
      type: fc.constant('retry' as WorkflowActionType),
      delay: fc.integer({ min: 1000, max: 60000 }),
      reason: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined })
    }),
    fc.record({
      type: fc.constant('skip' as WorkflowActionType),
      reason: fc.string({ minLength: 10, maxLength: 100 })
    }),
    fc.record({
      type: fc.constant('pause' as WorkflowActionType),
      notification: notificationGenerator()
    }),
    fc.record({
      type: fc.constant('fail' as WorkflowActionType),
      error: fc.constant(new Error('Workflow failed'))
    })
  );

/**
 * Generator for WorkflowStep
 */
export const workflowStepGenerator = (): fc.Arbitrary<WorkflowStep> =>
  fc.record({
    id: fc.constant(uuidv4()),
    name: fc.string({ minLength: 5, maxLength: 50 }),
    agentType: fc.option(agentTypeGenerator()),
    isHumanCheckpoint: fc.boolean(),
    requiredRole: fc.option(fc.constantFrom('Data Steward', 'Compliance Officer', 'Risk Manager', 'CFO', 'Data Owner')),
    dependencies: fc.array(fc.constant(uuidv4()), { minLength: 0, maxLength: 3 }),
    status: fc.constantFrom('pending', 'in_progress', 'completed', 'failed', 'waiting_for_human')
  });

/**
 * Generator for WorkflowStep with dependencies (for Property 3)
 */
export const workflowStepWithDependenciesGenerator = (dependencyIds: string[]): fc.Arbitrary<WorkflowStep> =>
  fc.record({
    id: fc.constant(uuidv4()),
    name: fc.string({ minLength: 5, maxLength: 50 }),
    agentType: fc.option(agentTypeGenerator()),
    isHumanCheckpoint: fc.boolean(),
    requiredRole: fc.option(fc.constantFrom('Data Steward', 'Compliance Officer', 'Risk Manager', 'CFO', 'Data Owner')),
    dependencies: fc.constant(dependencyIds),
    status: fc.constantFrom('pending', 'in_progress', 'completed', 'failed', 'waiting_for_human')
  });

/**
 * Generator for ValidationError
 */
export const validationErrorGenerator = (): fc.Arbitrary<ValidationError> =>
  fc.record({
    field: fc.string({ minLength: 3, maxLength: 30 }),
    message: fc.string({ minLength: 10, maxLength: 200 }),
    code: fc.constantFrom('REQUIRED', 'INVALID_FORMAT', 'OUT_OF_RANGE', 'DUPLICATE', 'REFERENCE_ERROR')
  });

/**
 * Generator for a workflow with proper dependency chain
 */
export const workflowWithDependencyChainGenerator = (): fc.Arbitrary<WorkflowStep[]> =>
  fc.integer({ min: 2, max: 6 }).chain(stepCount => {
    return fc.array(workflowStepGenerator(), { minLength: stepCount, maxLength: stepCount }).map(steps => {
      // Create a proper dependency chain
      for (let i = 1; i < steps.length; i++) {
        steps[i].dependencies = [steps[i - 1].id];
      }
      steps[0].dependencies = [];
      return steps;
    });
  });
