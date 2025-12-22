/**
 * **Feature: agentic-data-governance, Property 4: Attestation Gate Invariant**
 * 
 * For any report cycle requiring management attestation, the cycle status 
 * cannot transition to 'submission_ready' while the attestation task status 
 * is not 'completed' with outcome 'approved'.
 * 
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { GovernanceOrchestrator } from '../../orchestrator/governance-orchestrator.js';
import { Decision, DecisionOutcome } from '../../types/index.js';
import { dateGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 4: Attestation Gate Invariant', () => {
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
   * Generator for non-approved decision outcomes
   */
  const nonApprovedOutcomeGenerator = (): fc.Arbitrary<DecisionOutcome> =>
    fc.constantFrom('rejected', 'approved_with_changes');

  it('should not allow transition to submission ready without attestation task', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Without creating an attestation task, check if submission ready is allowed
          const canTransition = orchestrator.canTransitionToSubmissionReady(cycle.id);
          
          // Should not be allowed without attestation
          expect(canTransition).toBe(false);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not allow transition to submission ready with pending attestation task', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create an attestation task but leave it pending
          await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'attestation',
            title: 'CFO Attestation',
            description: 'Management attestation for regulatory submission',
            assignedTo: 'cfo@company.com',
            assignedRole: 'cfo',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Check if submission ready is allowed
          const canTransition = orchestrator.canTransitionToSubmissionReady(cycle.id);
          
          // Should not be allowed with pending attestation
          expect(canTransition).toBe(false);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not allow transition to submission ready with rejected attestation', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create an attestation task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'attestation',
            title: 'CFO Attestation',
            description: 'Management attestation for regulatory submission',
            assignedTo: 'cfo@company.com',
            assignedRole: 'cfo',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Complete the task with rejection
          const decision: Decision = {
            outcome: 'rejected'
          };
          await orchestrator.completeHumanTask(taskId, decision, 'Data quality issues found');
          
          // Check if submission ready is allowed
          const canTransition = orchestrator.canTransitionToSubmissionReady(cycle.id);
          
          // Should not be allowed with rejected attestation
          expect(canTransition).toBe(false);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow transition to submission ready only with approved attestation', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create an attestation task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'attestation',
            title: 'CFO Attestation',
            description: 'Management attestation for regulatory submission',
            assignedTo: 'cfo@company.com',
            assignedRole: 'cfo',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Complete the task with approval
          const decision: Decision = {
            outcome: 'approved'
          };
          await orchestrator.completeHumanTask(taskId, decision, 'All data quality checks passed');
          
          // Check if submission ready is allowed
          const canTransition = orchestrator.canTransitionToSubmissionReady(cycle.id);
          
          // Should be allowed with approved attestation
          expect(canTransition).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should verify attestation completion status is correctly tracked', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Initially attestation should not be complete
          expect(orchestrator.isAttestationComplete(cycle.id)).toBe(false);
          
          // Create an attestation task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'attestation',
            title: 'CFO Attestation',
            description: 'Management attestation for regulatory submission',
            assignedTo: 'cfo@company.com',
            assignedRole: 'cfo',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Still not complete (pending)
          expect(orchestrator.isAttestationComplete(cycle.id)).toBe(false);
          
          // Complete with approval
          await orchestrator.completeHumanTask(taskId, { outcome: 'approved' }, 'Approved');
          
          // Now should be complete
          expect(orchestrator.isAttestationComplete(cycle.id)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not consider approved_with_changes as full approval for attestation', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create an attestation task
          const taskId = await orchestrator.createHumanTask({
            cycleId: cycle.id,
            type: 'attestation',
            title: 'CFO Attestation',
            description: 'Management attestation for regulatory submission',
            assignedTo: 'cfo@company.com',
            assignedRole: 'cfo',
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending'
          });
          
          // Complete with approved_with_changes
          const decision: Decision = {
            outcome: 'approved_with_changes',
            changes: { note: 'Minor corrections needed' }
          };
          await orchestrator.completeHumanTask(taskId, decision, 'Approved with changes');
          
          // Should not be considered full approval for attestation gate
          const canTransition = orchestrator.canTransitionToSubmissionReady(cycle.id);
          expect(canTransition).toBe(false);
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
