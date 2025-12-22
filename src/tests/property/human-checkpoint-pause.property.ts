/**
 * **Feature: agentic-data-governance, Property 24: Human Checkpoint Pause Behavior**
 * 
 * For any workflow step configured as a human checkpoint, the workflow must 
 * pause (status='waiting_for_human') and create a HumanTask with the correct 
 * assignedRole before any subsequent steps execute.
 * 
 * **Validates: Requirements 12.2**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { GovernanceOrchestrator } from '../../orchestrator/governance-orchestrator.js';
import { TaskType } from '../../types/index.js';
import { dateGenerator, nonEmptyStringGenerator, taskTypeGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 24: Human Checkpoint Pause Behavior', () => {
  let repository: InMemoryGovernanceRepository;
  let orchestrator: GovernanceOrchestrator;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    orchestrator = new GovernanceOrchestrator(repository);
  });

  /**
   * Generator for report IDs
   */
  const reportIdGenerator = (): fc.Arbitrary<string> => fc.uuid();

  /**
   * Generator for period end dates
   */
  const periodEndGenerator = (): fc.Arbitrary<Date> => dateGenerator();

  /**
   * Generator for human task data
   */
  const humanTaskDataGenerator = () =>
    fc.record({
      type: taskTypeGenerator(),
      title: nonEmptyStringGenerator(),
      description: nonEmptyStringGenerator(),
      assignedTo: fc.emailAddress(),
      assignedRole: nonEmptyStringGenerator(),
      dueDate: dateGenerator()
    });

  it('should pause cycle when human task is created', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        humanTaskDataGenerator(),
        async (reportId, periodEnd, taskData) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Verify cycle is initially active
          const initialCycle = repository.getCycleInstance(cycle.id);
          expect(initialCycle?.status).toBe('active');
          
          // Create a human task
          await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: taskData.type,
            title: taskData.title,
            description: taskData.description,
            assignedTo: taskData.assignedTo,
            assignedRole: taskData.assignedRole,
            dueDate: taskData.dueDate,
            status: 'pending'
          });
          
          // Verify cycle is now paused
          const updatedCycle = repository.getCycleInstance(cycle.id);
          expect(updatedCycle?.status).toBe('paused');
          expect(updatedCycle?.pauseReason).toContain('Waiting for human task');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create human task with correct assigned role', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        humanTaskDataGenerator(),
        async (reportId, periodEnd, taskData) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a human task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: taskData.type,
            title: taskData.title,
            description: taskData.description,
            assignedTo: taskData.assignedTo,
            assignedRole: taskData.assignedRole,
            dueDate: taskData.dueDate,
            status: 'pending'
          });
          
          // Verify task was created with correct role
          const task = repository.getHumanTask(taskId);
          expect(task).toBeDefined();
          expect(task?.assignedRole).toBe(taskData.assignedRole);
          expect(task?.assignedTo).toBe(taskData.assignedTo);
          expect(task?.status).toBe('pending');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should update workflow step to waiting_for_human when checkpoint is reached', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Get workflow steps
          const steps = orchestrator.getWorkflowSteps(cycle.id);
          
          // Find a human checkpoint step
          const humanCheckpointStep = steps.find(s => s.isHumanCheckpoint);
          
          if (humanCheckpointStep && humanCheckpointStep.requiredRole) {
            // Create a human task for this checkpoint
            await orchestrator.createHumanTask({
              cycleId: cycle.id,
              type: 'catalog_review',
              title: 'Review checkpoint',
              description: 'Human review required',
              assignedTo: 'reviewer@company.com',
              assignedRole: humanCheckpointStep.requiredRole,
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              status: 'pending'
            });
            
            // Get updated workflow steps
            const updatedSteps = orchestrator.getWorkflowSteps(cycle.id);
            const updatedCheckpoint = updatedSteps.find(
              s => s.isHumanCheckpoint && s.requiredRole === humanCheckpointStep.requiredRole
            );
            
            // Verify step is waiting for human
            expect(updatedCheckpoint?.status).toBe('waiting_for_human');
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should log audit entry when human task is created', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        humanTaskDataGenerator(),
        async (reportId, periodEnd, taskData) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a human task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: taskData.type,
            title: taskData.title,
            description: taskData.description,
            assignedTo: taskData.assignedTo,
            assignedRole: taskData.assignedRole,
            dueDate: taskData.dueDate,
            status: 'pending'
          });
          
          // Verify audit entry was created
          const auditEntries = repository.getAuditEntries('HumanTask', taskId);
          expect(auditEntries.length).toBeGreaterThanOrEqual(1);
          
          const createEntry = auditEntries.find(e => e.action === 'create');
          expect(createEntry).toBeDefined();
          expect(createEntry?.entityType).toBe('HumanTask');
          expect(createEntry?.entityId).toBe(taskId);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should resume cycle after human task is completed with approval', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a human task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'catalog_review',
            title: 'Review catalog',
            description: 'Human review required',
            assignedTo: 'reviewer@company.com',
            assignedRole: 'compliance_officer',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Verify cycle is paused
          let currentCycle = repository.getCycleInstance(cycle.id);
          expect(currentCycle?.status).toBe('paused');
          
          // Complete the task with approval
          await orchestrator.completeHumanTask(
            taskId,
            { outcome: 'approved' },
            'Approved after review'
          );
          
          // Verify cycle is resumed (active)
          currentCycle = repository.getCycleInstance(cycle.id);
          expect(currentCycle?.status).toBe('active');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should keep cycle paused if there are other pending human tasks', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create two human tasks
          const taskId1 = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'catalog_review',
            title: 'Review catalog',
            description: 'First review',
            assignedTo: 'reviewer1@company.com',
            assignedRole: 'compliance_officer',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          const taskId2 = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'requirements_validation',
            title: 'Validate requirements',
            description: 'Second review',
            assignedTo: 'reviewer2@company.com',
            assignedRole: 'data_steward',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Complete only the first task
          await orchestrator.completeHumanTask(
            taskId1,
            { outcome: 'approved' },
            'First task approved'
          );
          
          // Cycle should still be paused because second task is pending
          const currentCycle = repository.getCycleInstance(cycle.id);
          expect(currentCycle?.status).toBe('paused');
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
