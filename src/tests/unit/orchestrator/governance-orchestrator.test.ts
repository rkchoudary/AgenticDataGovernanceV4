/**
 * Unit tests for Governance Orchestrator
 * Tests cycle management, agent coordination, and HITL workflows
 * 
 * Requirements: 12.1, 12.2, 12.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import { GovernanceOrchestrator } from '../../../orchestrator/governance-orchestrator.js';
import { Phase } from '../../../types/index.js';

describe('GovernanceOrchestrator', () => {
  let repository: InMemoryGovernanceRepository;
  let orchestrator: GovernanceOrchestrator;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    orchestrator = new GovernanceOrchestrator(repository);
  });

  describe('Cycle Management', () => {
    it('should start a new report cycle', async () => {
      const reportId = 'report-001';
      const periodEnd = new Date('2024-12-31');

      const cycle = await orchestrator.startReportCycle(reportId, periodEnd);

      expect(cycle).toBeDefined();
      expect(cycle.id).toBeDefined();
      expect(cycle.reportId).toBe(reportId);
      expect(cycle.periodEnd).toEqual(periodEnd);
      expect(cycle.status).toBe('active');
      expect(cycle.currentPhase).toBe('data_gathering');
      expect(cycle.checkpoints.length).toBeGreaterThan(0);
    });

    it('should pause an active cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      
      await orchestrator.pauseCycle(cycle.id, 'Manual pause for review');

      const updatedCycle = repository.getCycleInstance(cycle.id);
      expect(updatedCycle?.status).toBe('paused');
      expect(updatedCycle?.pauseReason).toBe('Manual pause for review');
      expect(updatedCycle?.pausedAt).toBeDefined();
    });

    it('should resume a paused cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      await orchestrator.pauseCycle(cycle.id, 'Manual pause');

      await orchestrator.resumeCycle(cycle.id);

      const updatedCycle = repository.getCycleInstance(cycle.id);
      expect(updatedCycle?.status).toBe('active');
      expect(updatedCycle?.pauseReason).toBeUndefined();
    });

    it('should throw error when pausing non-active cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      await orchestrator.pauseCycle(cycle.id, 'First pause');

      await expect(
        orchestrator.pauseCycle(cycle.id, 'Second pause')
      ).rejects.toThrow('Cannot pause cycle in paused status');
    });

    it('should throw error when resuming non-paused cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());

      await expect(
        orchestrator.resumeCycle(cycle.id)
      ).rejects.toThrow('Cannot resume cycle in active status');
    });

    it('should advance phase correctly', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      expect(cycle.currentPhase).toBe('data_gathering');

      const nextPhase = await orchestrator.advancePhase(cycle.id);
      expect(nextPhase).toBe('validation');

      const updatedCycle = repository.getCycleInstance(cycle.id);
      expect(updatedCycle?.currentPhase).toBe('validation');
    });
  });

  describe('Agent Coordination', () => {
    it('should trigger agent with no dependencies', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const context = {
        cycleId: cycle.id,
        reportId: 'report-001',
        phase: 'data_gathering' as Phase
      };

      const result = await orchestrator.triggerAgent('regulatory_intelligence', context);

      expect(result.success).toBe(true);
      expect(result.agentType).toBe('regulatory_intelligence');
      expect(result.executedAt).toBeDefined();
    });

    it('should prevent triggering agent with unmet dependencies', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const context = {
        cycleId: cycle.id,
        reportId: 'report-001',
        phase: 'data_gathering' as Phase
      };

      await expect(
        orchestrator.triggerAgent('data_requirements', context)
      ).rejects.toThrow(/dependency.*not completed/i);
    });

    it('should allow triggering agent after dependencies complete', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const context = {
        cycleId: cycle.id,
        reportId: 'report-001',
        phase: 'data_gathering' as Phase
      };

      // Complete dependency first
      await orchestrator.triggerAgent('regulatory_intelligence', context);

      // Now dependent agent should work
      const result = await orchestrator.triggerAgent('data_requirements', context);
      expect(result.success).toBe(true);
    });

    it('should get agent status', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      
      // Initially idle
      let status = await orchestrator.getAgentStatus('regulatory_intelligence', cycle.id);
      expect(status.status).toBe('idle');

      // After execution
      const context = {
        cycleId: cycle.id,
        reportId: 'report-001',
        phase: 'data_gathering' as Phase
      };
      await orchestrator.triggerAgent('regulatory_intelligence', context);

      status = await orchestrator.getAgentStatus('regulatory_intelligence', cycle.id);
      expect(status.status).toBe('completed');
    });
  });

  describe('HITL Task Management', () => {
    it('should create human task', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());

      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'catalog_review',
        title: 'Review Report Catalog',
        description: 'Please review the regulatory report catalog',
        assignedTo: 'compliance@company.com',
        assignedRole: 'compliance_officer',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: 'pending'
      });

      expect(taskId).toBeDefined();
      const task = repository.getHumanTask(taskId);
      expect(task?.title).toBe('Review Report Catalog');
      expect(task?.status).toBe('pending');
    });

    it('should complete human task with decision', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'catalog_review',
        title: 'Review Report Catalog',
        description: 'Please review',
        assignedTo: 'compliance@company.com',
        assignedRole: 'compliance_officer',
        dueDate: new Date(),
        status: 'pending'
      });

      await orchestrator.completeHumanTask(
        taskId,
        { outcome: 'approved' },
        'All items verified'
      );

      const task = repository.getHumanTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.decision?.outcome).toBe('approved');
      expect(task?.decisionRationale).toBe('All items verified');
    });

    it('should escalate task', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'catalog_review',
        title: 'Review Report Catalog',
        description: 'Please review',
        assignedTo: 'compliance@company.com',
        assignedRole: 'compliance_officer',
        dueDate: new Date(),
        status: 'pending'
      });

      await orchestrator.escalateTask(taskId, 2);

      const task = repository.getHumanTask(taskId);
      expect(task?.status).toBe('escalated');
      expect(task?.escalationLevel).toBe(2);
    });

    it('should not escalate completed task', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'catalog_review',
        title: 'Review',
        description: 'Review',
        assignedTo: 'user@company.com',
        assignedRole: 'reviewer',
        dueDate: new Date(),
        status: 'pending'
      });

      await orchestrator.completeHumanTask(taskId, { outcome: 'approved' }, 'Done');

      await expect(
        orchestrator.escalateTask(taskId, 1)
      ).rejects.toThrow('Cannot escalate completed task');
    });
  });

  describe('Attestation Gate', () => {
    it('should check attestation completion', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());

      // Initially not complete
      expect(orchestrator.isAttestationComplete(cycle.id)).toBe(false);

      // Create and complete attestation task
      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'attestation',
        title: 'CFO Attestation',
        description: 'Management attestation',
        assignedTo: 'cfo@company.com',
        assignedRole: 'cfo',
        dueDate: new Date(),
        status: 'pending'
      });

      await orchestrator.completeHumanTask(taskId, { outcome: 'approved' }, 'Approved');

      expect(orchestrator.isAttestationComplete(cycle.id)).toBe(true);
    });

    it('should check submission ready transition', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());

      // Cannot transition without attestation
      expect(orchestrator.canTransitionToSubmissionReady(cycle.id)).toBe(false);

      // Complete attestation
      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'attestation',
        title: 'CFO Attestation',
        description: 'Management attestation',
        assignedTo: 'cfo@company.com',
        assignedRole: 'cfo',
        dueDate: new Date(),
        status: 'pending'
      });

      await orchestrator.completeHumanTask(taskId, { outcome: 'approved' }, 'Approved');

      expect(orchestrator.canTransitionToSubmissionReady(cycle.id)).toBe(true);
    });
  });

  describe('Workflow Steps', () => {
    it('should initialize workflow steps for cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());

      const steps = orchestrator.getWorkflowSteps(cycle.id);

      expect(steps.length).toBeGreaterThan(0);
      expect(steps.some(s => s.agentType === 'regulatory_intelligence')).toBe(true);
      expect(steps.some(s => s.isHumanCheckpoint)).toBe(true);
    });

    it('should check dependencies satisfaction', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const steps = orchestrator.getWorkflowSteps(cycle.id);

      // Find a step with dependencies
      const stepWithDeps = steps.find(s => s.dependencies.length > 0);
      if (stepWithDeps) {
        // Initially not satisfied
        expect(orchestrator.areDependenciesSatisfied(cycle.id, stepWithDeps.id)).toBe(false);
      }
    });
  });

  describe('Retrospective', () => {
    it('should initiate retrospective for completed cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      
      // Complete the cycle by advancing through all phases
      await orchestrator.advancePhase(cycle.id); // validation
      await orchestrator.advancePhase(cycle.id); // review
      await orchestrator.advancePhase(cycle.id); // approval
      await orchestrator.advancePhase(cycle.id); // submission
      await orchestrator.advancePhase(cycle.id); // completes

      const updatedCycle = repository.getCycleInstance(cycle.id);
      expect(updatedCycle?.status).toBe('completed');

      const retroTask = await orchestrator.initiateRetrospective(cycle.id);
      expect(retroTask).toBeDefined();
      expect(retroTask.title).toContain('Retrospective');
    });

    it('should not initiate retrospective for non-completed cycle', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());

      await expect(
        orchestrator.initiateRetrospective(cycle.id)
      ).rejects.toThrow('Cannot initiate retrospective for cycle in active status');
    });
  });

  describe('Audit Trail', () => {
    it('should create audit entries for cycle operations', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      
      const entries = repository.getAuditEntries('CycleInstance', cycle.id);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some(e => e.action === 'create')).toBe(true);
    });

    it('should create audit entries for human task operations', async () => {
      const cycle = await orchestrator.startReportCycle('report-001', new Date());
      const taskId = await orchestrator.createHumanTask({
        cycleId: cycle.id,
        type: 'catalog_review',
        title: 'Review',
        description: 'Review',
        assignedTo: 'user@company.com',
        assignedRole: 'reviewer',
        dueDate: new Date(),
        status: 'pending'
      });

      const entries = repository.getAuditEntries('HumanTask', taskId);
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});
