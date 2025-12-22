/**
 * Unit tests for Workflow Engine
 * 
 * Tests task scheduling, deadline alerting, and checklist generation.
 * Requirements: 2.1, 2.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine } from '../../../services/workflow-engine.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import { ReportCatalog } from '../../../types/index.js';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  let repository: InMemoryGovernanceRepository;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    engine = new WorkflowEngine(repository);
  });

  describe('Task Scheduling', () => {
    it('should schedule a task for a valid cycle', async () => {
      // Create a cycle
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const dueDate = new Date('2024-12-15');
      const taskId = await engine.scheduleTask(cycle.id, 'data_validation', dueDate);

      expect(taskId).toBeDefined();
      
      const task = engine.getScheduledTask(taskId);
      expect(task).toBeDefined();
      expect(task?.cycleId).toBe(cycle.id);
      expect(task?.taskType).toBe('data_validation');
      expect(task?.dueDate).toEqual(dueDate);
      expect(task?.status).toBe('pending');
    });

    it('should throw error when scheduling task for non-existent cycle', async () => {
      await expect(
        engine.scheduleTask('non-existent-cycle', 'data_validation', new Date())
      ).rejects.toThrow('Cycle non-existent-cycle not found');
    });

    it('should assign default owner based on task type', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const taskId = await engine.scheduleTask(cycle.id, 'attestation', new Date());
      const task = engine.getScheduledTask(taskId);

      expect(task?.owner).toBe('cfo');
    });

    it('should create audit entry when scheduling task', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      await engine.scheduleTask(cycle.id, 'data_validation', new Date());

      const auditEntries = repository.getAuditEntries('ScheduledTask');
      expect(auditEntries.some(e => e.action === 'schedule_task')).toBe(true);
    });
  });


  describe('Deadline Alerting', () => {
    it('should return warning alerts for tasks within warning threshold', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task due in 5 days (within default 7-day warning threshold)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5);
      await engine.scheduleTask(cycle.id, 'data_validation', dueDate);

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertLevel).toBe('warning');
      expect(alerts[0].daysRemaining).toBeLessThanOrEqual(7);
    });

    it('should return critical alerts for tasks within critical threshold', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task due in 2 days (within default 3-day critical threshold)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 2);
      await engine.scheduleTask(cycle.id, 'data_validation', dueDate);

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertLevel).toBe('critical');
    });

    it('should return escalation alerts for tasks within escalation threshold', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task due tomorrow (within default 1-day escalation threshold)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      await engine.scheduleTask(cycle.id, 'data_validation', dueDate);

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertLevel).toBe('escalation');
    });

    it('should not return alerts for completed tasks', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task due tomorrow
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      const taskId = await engine.scheduleTask(cycle.id, 'data_validation', dueDate);

      // Complete the task
      await engine.completeTask(taskId);

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      expect(alerts.length).toBe(0);
    });

    it('should sort alerts by days remaining (most urgent first)', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule multiple tasks with different due dates
      const dueDate1 = new Date();
      dueDate1.setDate(dueDate1.getDate() + 5);
      await engine.scheduleTask(cycle.id, 'task1', dueDate1);

      const dueDate2 = new Date();
      dueDate2.setDate(dueDate2.getDate() + 2);
      await engine.scheduleTask(cycle.id, 'task2', dueDate2);

      const dueDate3 = new Date();
      dueDate3.setDate(dueDate3.getDate() + 1);
      await engine.scheduleTask(cycle.id, 'task3', dueDate3);

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      expect(alerts.length).toBe(3);
      expect(alerts[0].daysRemaining).toBeLessThanOrEqual(alerts[1].daysRemaining);
      expect(alerts[1].daysRemaining).toBeLessThanOrEqual(alerts[2].daysRemaining);
    });

    it('should throw error for non-existent cycle', async () => {
      await expect(
        engine.getDeadlineAlerts('non-existent-cycle')
      ).rejects.toThrow('Cycle non-existent-cycle not found');
    });

    it('should use custom alert thresholds when provided', async () => {
      const customEngine = new WorkflowEngine(repository, {
        warningThresholdDays: 14,
        criticalThresholdDays: 7,
        escalationThresholdDays: 3
      });

      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task due in 10 days (within custom 14-day warning threshold)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 10);
      await customEngine.scheduleTask(cycle.id, 'data_validation', dueDate);

      const alerts = await customEngine.getDeadlineAlerts(cycle.id);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].alertLevel).toBe('warning');
    });
  });


  describe('Submission Checklist Generation', () => {
    beforeEach(() => {
      // Set up report catalog with different report types
      const catalog: ReportCatalog = {
        reports: [
          {
            id: 'daily-report',
            name: 'Daily Report',
            jurisdiction: 'US',
            regulator: 'FED',
            frequency: 'daily',
            dueDate: { daysAfterPeriodEnd: 1, businessDaysOnly: false, timezone: 'America/New_York' },
            submissionFormat: 'XML',
            submissionPlatform: 'Portal',
            description: 'Daily regulatory report',
            lastUpdated: new Date(),
            responsibleUnit: 'Finance'
          },
          {
            id: 'monthly-report',
            name: 'Monthly Report',
            jurisdiction: 'US',
            regulator: 'FED',
            frequency: 'monthly',
            dueDate: { daysAfterPeriodEnd: 15, businessDaysOnly: true, timezone: 'America/New_York' },
            submissionFormat: 'XML',
            submissionPlatform: 'Portal',
            description: 'Monthly regulatory report',
            lastUpdated: new Date(),
            responsibleUnit: 'Finance'
          },
          {
            id: 'quarterly-report',
            name: 'Quarterly Report',
            jurisdiction: 'CA',
            regulator: 'OSFI',
            frequency: 'quarterly',
            dueDate: { daysAfterPeriodEnd: 30, businessDaysOnly: false, timezone: 'America/Toronto' },
            submissionFormat: 'XML',
            submissionPlatform: 'RRS',
            description: 'Quarterly regulatory report',
            lastUpdated: new Date(),
            responsibleUnit: 'Risk'
          }
        ],
        version: 1,
        lastScanned: new Date(),
        status: 'approved'
      };
      repository.setReportCatalog(catalog);
    });

    it('should generate checklist for daily report', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'daily-report',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('daily-report', cycle.id);

      expect(items.length).toBeGreaterThan(0);
      expect(items.every(item => item.id && item.description && item.owner && item.dueDate !== undefined)).toBe(true);
      expect(items.every(item => item.completed === false)).toBe(true);
    });

    it('should generate checklist for monthly report with more items', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'monthly-report',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('monthly-report', cycle.id);

      // Monthly reports should have more checklist items than daily
      expect(items.length).toBeGreaterThan(4);
      expect(items.some(item => item.description.includes('CFO attestation'))).toBe(true);
    });

    it('should generate checklist for quarterly report with BCBS 239 review', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'quarterly-report',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('quarterly-report', cycle.id);

      expect(items.some(item => item.description.includes('BCBS 239'))).toBe(true);
    });

    it('should calculate due dates based on submission deadline', async () => {
      const periodEnd = new Date('2024-12-31');
      const cycle = repository.createCycleInstance({
        reportId: 'monthly-report',
        periodEnd,
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('monthly-report', cycle.id);

      // All due dates should be after period end
      expect(items.every(item => item.dueDate >= periodEnd)).toBe(true);
      
      // Final submission approval should have the latest due date
      const finalApproval = items.find(item => item.description.includes('Final submission'));
      expect(finalApproval).toBeDefined();
    });

    it('should throw error for non-existent cycle', async () => {
      await expect(
        engine.generateSubmissionChecklist('daily-report', 'non-existent-cycle')
      ).rejects.toThrow('Cycle non-existent-cycle not found');
    });

    it('should throw error for non-existent report', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'non-existent-report',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      await expect(
        engine.generateSubmissionChecklist('non-existent-report', cycle.id)
      ).rejects.toThrow('Report non-existent-report not found in catalog');
    });

    it('should throw error when report catalog does not exist', async () => {
      // Create a new repository without catalog
      const emptyRepository = new InMemoryGovernanceRepository();
      const emptyEngine = new WorkflowEngine(emptyRepository);

      const cycle = emptyRepository.createCycleInstance({
        reportId: 'daily-report',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      await expect(
        emptyEngine.generateSubmissionChecklist('daily-report', cycle.id)
      ).rejects.toThrow('Report catalog not found');
    });

    it('should create audit entry when generating checklist', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'daily-report',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      await engine.generateSubmissionChecklist('daily-report', cycle.id);

      const auditEntries = repository.getAuditEntries('SubmissionChecklist');
      expect(auditEntries.some(e => e.action === 'generate_checklist')).toBe(true);
    });
  });


  describe('Checklist Status Tracking', () => {
    beforeEach(() => {
      const catalog: ReportCatalog = {
        reports: [{
          id: 'report-1',
          name: 'Test Report',
          jurisdiction: 'US',
          regulator: 'FED',
          frequency: 'monthly',
          dueDate: { daysAfterPeriodEnd: 15, businessDaysOnly: false, timezone: 'America/New_York' },
          submissionFormat: 'XML',
          submissionPlatform: 'Portal',
          description: 'Test',
          lastUpdated: new Date(),
          responsibleUnit: 'Finance'
        }],
        version: 1,
        lastScanned: new Date(),
        status: 'approved'
      };
      repository.setReportCatalog(catalog);
    });

    it('should update checklist item status to completed', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('report-1', cycle.id);
      const checklists = engine.getChecklistsForCycle(cycle.id);
      const checklistId = checklists[0].id;
      const itemId = items[0].id;

      await engine.updateChecklistStatus(checklistId, itemId, true);

      const updatedChecklist = engine.getChecklist(checklistId);
      const updatedItem = updatedChecklist?.items.find(i => i.id === itemId);

      expect(updatedItem?.completed).toBe(true);
      expect(updatedItem?.completedAt).toBeDefined();
    });

    it('should mark checklist as completed when all items are done', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('report-1', cycle.id);
      const checklists = engine.getChecklistsForCycle(cycle.id);
      const checklistId = checklists[0].id;

      // Complete all items
      for (const item of items) {
        await engine.updateChecklistStatus(checklistId, item.id, true);
      }

      const updatedChecklist = engine.getChecklist(checklistId);
      expect(updatedChecklist?.status).toBe('completed');
    });

    it('should allow uncompleting an item', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('report-1', cycle.id);
      const checklists = engine.getChecklistsForCycle(cycle.id);
      const checklistId = checklists[0].id;
      const itemId = items[0].id;

      // Complete then uncomplete
      await engine.updateChecklistStatus(checklistId, itemId, true);
      await engine.updateChecklistStatus(checklistId, itemId, false);

      const updatedChecklist = engine.getChecklist(checklistId);
      const updatedItem = updatedChecklist?.items.find(i => i.id === itemId);

      expect(updatedItem?.completed).toBe(false);
      expect(updatedItem?.completedAt).toBeUndefined();
    });

    it('should throw error for non-existent checklist', async () => {
      await expect(
        engine.updateChecklistStatus('non-existent', 'item-1', true)
      ).rejects.toThrow('Checklist non-existent not found');
    });

    it('should throw error for non-existent item', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      await engine.generateSubmissionChecklist('report-1', cycle.id);
      const checklists = engine.getChecklistsForCycle(cycle.id);
      const checklistId = checklists[0].id;

      await expect(
        engine.updateChecklistStatus(checklistId, 'non-existent-item', true)
      ).rejects.toThrow('Checklist item non-existent-item not found');
    });

    it('should create audit entry when updating checklist status', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('report-1', cycle.id);
      const checklists = engine.getChecklistsForCycle(cycle.id);
      const checklistId = checklists[0].id;

      await engine.updateChecklistStatus(checklistId, items[0].id, true);

      const auditEntries = repository.getAuditEntries('ChecklistItem');
      expect(auditEntries.some(e => e.action === 'update_checklist_item')).toBe(true);
    });
  });

  describe('Task Completion and Overdue Marking', () => {
    it('should complete a scheduled task', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const taskId = await engine.scheduleTask(cycle.id, 'data_validation', new Date());
      await engine.completeTask(taskId);

      const task = engine.getScheduledTask(taskId);
      expect(task?.status).toBe('completed');
      expect(task?.completedAt).toBeDefined();
    });

    it('should throw error when completing non-existent task', async () => {
      await expect(
        engine.completeTask('non-existent-task')
      ).rejects.toThrow('Task non-existent-task not found');
    });

    it('should mark overdue tasks', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task with past due date
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 1);
      const taskId = await engine.scheduleTask(cycle.id, 'data_validation', pastDueDate);

      const overdueTasks = await engine.markOverdueTasks();

      expect(overdueTasks).toContain(taskId);
      
      const task = engine.getScheduledTask(taskId);
      expect(task?.status).toBe('overdue');
    });

    it('should not mark completed tasks as overdue', async () => {
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-12-31'),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      // Schedule task with past due date and complete it
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 1);
      const taskId = await engine.scheduleTask(cycle.id, 'data_validation', pastDueDate);
      await engine.completeTask(taskId);

      const overdueTasks = await engine.markOverdueTasks();

      expect(overdueTasks).not.toContain(taskId);
    });
  });

  describe('Checklist Alerts Integration', () => {
    beforeEach(() => {
      const catalog: ReportCatalog = {
        reports: [{
          id: 'report-1',
          name: 'Test Report',
          jurisdiction: 'US',
          regulator: 'FED',
          frequency: 'daily',
          dueDate: { daysAfterPeriodEnd: 1, businessDaysOnly: false, timezone: 'America/New_York' },
          submissionFormat: 'XML',
          submissionPlatform: 'Portal',
          description: 'Test',
          lastUpdated: new Date(),
          responsibleUnit: 'Finance'
        }],
        version: 1,
        lastScanned: new Date(),
        status: 'approved'
      };
      repository.setReportCatalog(catalog);
    });

    it('should include checklist items in deadline alerts', async () => {
      // Create cycle with period end tomorrow
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 1);
      
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd,
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      await engine.generateSubmissionChecklist('report-1', cycle.id);

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      // Should have alerts for checklist items
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should not include completed checklist items in alerts', async () => {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 1);
      
      const cycle = repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd,
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date()
      });

      const items = await engine.generateSubmissionChecklist('report-1', cycle.id);
      const checklists = engine.getChecklistsForCycle(cycle.id);
      const checklistId = checklists[0].id;

      // Complete all items
      for (const item of items) {
        await engine.updateChecklistStatus(checklistId, item.id, true);
      }

      const alerts = await engine.getDeadlineAlerts(cycle.id);

      // Should have no alerts for completed items
      const checklistItemIds = items.map(i => i.id);
      const checklistAlerts = alerts.filter(a => checklistItemIds.includes(a.taskId));
      expect(checklistAlerts.length).toBe(0);
    });
  });
});
