/**
 * **Feature: agentic-data-governance, Property 2: Audit Trail Completeness**
 * 
 * For any state-changing action in the system (modifications, approvals, 
 * escalations, resolutions), an audit entry must be created containing 
 * timestamp, actor identifier, actor type, action description, and outcome.
 * 
 * **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import {
  Issue,
  HumanTask,
  CycleInstance,
  ReportCatalog,
  CDEInventory,
  AuditEntry,
  Severity,
  IssueStatus,
  TaskStatus,
  TaskType,
  ArtifactStatus,
  Phase,
  CycleStatus
} from '../../types/index.js';
import {
  severityGenerator,
  issueStatusGenerator,
  taskStatusGenerator,
  taskTypeGenerator,
  nonEmptyStringGenerator,
  dateGenerator,
  artifactStatusGenerator
} from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 2: Audit Trail Completeness', () => {
  let repository: InMemoryGovernanceRepository;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
  });

  /**
   * Helper to validate audit entry has all required fields
   */
  function validateAuditEntry(entry: AuditEntry): boolean {
    return (
      typeof entry.id === 'string' && entry.id.length > 0 &&
      entry.timestamp instanceof Date &&
      typeof entry.actor === 'string' && entry.actor.length > 0 &&
      typeof entry.actorType === 'string' && 
      ['agent', 'human', 'system'].includes(entry.actorType) &&
      typeof entry.action === 'string' && entry.action.length > 0 &&
      typeof entry.entityType === 'string' && entry.entityType.length > 0 &&
      typeof entry.entityId === 'string' && entry.entityId.length > 0
    );
  }


  /**
   * Generator for Issue creation data
   */
  const issueDataGenerator = (): fc.Arbitrary<Omit<Issue, 'id'>> =>
    fc.record({
      title: nonEmptyStringGenerator(),
      description: nonEmptyStringGenerator(),
      source: nonEmptyStringGenerator(),
      impactedReports: fc.array(fc.uuid(), { minLength: 1, maxLength: 3 }),
      impactedCDEs: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
      severity: severityGenerator(),
      status: issueStatusGenerator(),
      assignee: fc.option(nonEmptyStringGenerator()),
      createdAt: dateGenerator(),
      dueDate: fc.option(dateGenerator()),
      rootCause: fc.option(nonEmptyStringGenerator()),
      resolution: fc.option(fc.record({
        type: fc.constantFrom('data_correction', 'process_change', 'system_fix', 'exception_approved'),
        description: nonEmptyStringGenerator(),
        implementedBy: nonEmptyStringGenerator(),
        implementedAt: dateGenerator(),
        verifiedBy: fc.option(nonEmptyStringGenerator()),
        verifiedAt: fc.option(dateGenerator())
      })),
      compensatingControl: fc.option(nonEmptyStringGenerator()),
      escalationLevel: fc.integer({ min: 0, max: 5 }),
      escalatedAt: fc.option(dateGenerator())
    });

  /**
   * Generator for HumanTask creation data
   */
  const humanTaskDataGenerator = (): fc.Arbitrary<Omit<HumanTask, 'id' | 'createdAt' | 'escalationLevel'>> =>
    fc.record({
      cycleId: fc.uuid(),
      type: taskTypeGenerator(),
      title: nonEmptyStringGenerator(),
      description: nonEmptyStringGenerator(),
      assignedTo: nonEmptyStringGenerator(),
      assignedRole: nonEmptyStringGenerator(),
      dueDate: dateGenerator(),
      status: taskStatusGenerator(),
      decision: fc.option(fc.record({
        outcome: fc.constantFrom('approved', 'rejected', 'approved_with_changes'),
        changes: fc.option(fc.anything())
      })),
      decisionRationale: fc.option(nonEmptyStringGenerator()),
      completedAt: fc.option(dateGenerator()),
      completedBy: fc.option(nonEmptyStringGenerator())
    });

  /**
   * Generator for CycleInstance creation data
   */
  const cycleInstanceDataGenerator = (): fc.Arbitrary<Omit<CycleInstance, 'id'>> =>
    fc.record({
      reportId: fc.uuid(),
      periodEnd: dateGenerator(),
      status: fc.constantFrom('active', 'paused', 'completed', 'failed') as fc.Arbitrary<CycleStatus>,
      currentPhase: fc.constantFrom('data_gathering', 'validation', 'review', 'approval', 'submission') as fc.Arbitrary<Phase>,
      checkpoints: fc.array(fc.record({
        id: fc.uuid(),
        name: nonEmptyStringGenerator(),
        phase: fc.constantFrom('data_gathering', 'validation', 'review', 'approval', 'submission') as fc.Arbitrary<Phase>,
        requiredApprovals: fc.array(nonEmptyStringGenerator(), { minLength: 0, maxLength: 2 }),
        completedApprovals: fc.array(nonEmptyStringGenerator(), { minLength: 0, maxLength: 2 }),
        status: fc.constantFrom('pending', 'completed', 'skipped')
      }), { minLength: 0, maxLength: 3 }),
      auditTrail: fc.constant([]),
      startedAt: dateGenerator(),
      completedAt: fc.option(dateGenerator()),
      pausedAt: fc.option(dateGenerator()),
      pauseReason: fc.option(nonEmptyStringGenerator())
    });

  it('should create audit entry with all required fields when creating an Issue', () => {
    fc.assert(
      fc.property(
        issueDataGenerator(),
        (issueData) => {
          const initialAuditCount = repository.getAuditEntries().length;
          
          // Create issue
          const issue = repository.createIssue(issueData);
          
          // Get audit entries for this issue
          const auditEntries = repository.getAuditEntries('Issue', issue.id);
          
          // Should have exactly one new audit entry
          expect(auditEntries.length).toBe(1);
          
          // Validate the audit entry has all required fields
          const entry = auditEntries[0];
          expect(validateAuditEntry(entry)).toBe(true);
          expect(entry.action).toBe('create');
          expect(entry.entityType).toBe('Issue');
          expect(entry.entityId).toBe(issue.id);
          expect(entry.newState).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should create audit entry with all required fields when updating an Issue', () => {
    fc.assert(
      fc.property(
        issueDataGenerator(),
        fc.record({
          status: issueStatusGenerator(),
          assignee: fc.option(nonEmptyStringGenerator())
        }),
        (issueData, updates) => {
          // Create initial issue
          const issue = repository.createIssue(issueData);
          
          // Update the issue
          const updated = repository.updateIssue(issue.id, updates);
          expect(updated).toBeDefined();
          
          // Get audit entries for this issue
          const auditEntries = repository.getAuditEntries('Issue', issue.id);
          
          // Should have two audit entries (create + update)
          expect(auditEntries.length).toBe(2);
          
          // Validate the update audit entry
          const updateEntry = auditEntries.find(e => e.action === 'update');
          expect(updateEntry).toBeDefined();
          expect(validateAuditEntry(updateEntry!)).toBe(true);
          expect(updateEntry!.previousState).toBeDefined();
          expect(updateEntry!.newState).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create audit entry with all required fields when deleting an Issue', () => {
    fc.assert(
      fc.property(
        issueDataGenerator(),
        (issueData) => {
          // Create initial issue
          const issue = repository.createIssue(issueData);
          
          // Delete the issue
          const deleted = repository.deleteIssue(issue.id);
          expect(deleted).toBe(true);
          
          // Get audit entries for this issue
          const auditEntries = repository.getAuditEntries('Issue', issue.id);
          
          // Should have two audit entries (create + delete)
          expect(auditEntries.length).toBe(2);
          
          // Validate the delete audit entry
          const deleteEntry = auditEntries.find(e => e.action === 'delete');
          expect(deleteEntry).toBeDefined();
          expect(validateAuditEntry(deleteEntry!)).toBe(true);
          expect(deleteEntry!.previousState).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create audit entry with all required fields when creating a HumanTask', () => {
    fc.assert(
      fc.property(
        humanTaskDataGenerator(),
        (taskData) => {
          // Create human task
          const task = repository.createHumanTask(taskData);
          
          // Get audit entries for this task
          const auditEntries = repository.getAuditEntries('HumanTask', task.id);
          
          // Should have exactly one audit entry
          expect(auditEntries.length).toBe(1);
          
          // Validate the audit entry
          const entry = auditEntries[0];
          expect(validateAuditEntry(entry)).toBe(true);
          expect(entry.action).toBe('create');
          expect(entry.entityType).toBe('HumanTask');
          expect(entry.entityId).toBe(task.id);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create audit entry with all required fields when updating a HumanTask (approval/escalation)', () => {
    fc.assert(
      fc.property(
        humanTaskDataGenerator(),
        fc.record({
          status: taskStatusGenerator(),
          escalationLevel: fc.integer({ min: 1, max: 5 })
        }),
        (taskData, updates) => {
          // Create initial task
          const task = repository.createHumanTask(taskData);
          
          // Update the task (simulating approval or escalation)
          const updated = repository.updateHumanTask(task.id, updates);
          expect(updated).toBeDefined();
          
          // Get audit entries for this task
          const auditEntries = repository.getAuditEntries('HumanTask', task.id);
          
          // Should have two audit entries (create + update)
          expect(auditEntries.length).toBe(2);
          
          // Validate the update audit entry
          const updateEntry = auditEntries.find(e => e.action === 'update');
          expect(updateEntry).toBeDefined();
          expect(validateAuditEntry(updateEntry!)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should create audit entry with all required fields when creating a CycleInstance', () => {
    fc.assert(
      fc.property(
        cycleInstanceDataGenerator(),
        (cycleData) => {
          // Create cycle instance
          const cycle = repository.createCycleInstance(cycleData);
          
          // Get audit entries for this cycle
          const auditEntries = repository.getAuditEntries('CycleInstance', cycle.id);
          
          // Should have exactly one audit entry
          expect(auditEntries.length).toBe(1);
          
          // Validate the audit entry
          const entry = auditEntries[0];
          expect(validateAuditEntry(entry)).toBe(true);
          expect(entry.action).toBe('create');
          expect(entry.entityType).toBe('CycleInstance');
          expect(entry.entityId).toBe(cycle.id);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create audit entry with all required fields when updating a CycleInstance', () => {
    fc.assert(
      fc.property(
        cycleInstanceDataGenerator(),
        fc.record({
          status: fc.constantFrom('active', 'paused', 'completed', 'failed') as fc.Arbitrary<CycleStatus>,
          pauseReason: fc.option(nonEmptyStringGenerator())
        }),
        (cycleData, updates) => {
          // Create initial cycle
          const cycle = repository.createCycleInstance(cycleData);
          
          // Update the cycle
          const updated = repository.updateCycleInstance(cycle.id, updates);
          expect(updated).toBeDefined();
          
          // Get audit entries for this cycle
          const auditEntries = repository.getAuditEntries('CycleInstance', cycle.id);
          
          // Should have two audit entries (create + update)
          expect(auditEntries.length).toBe(2);
          
          // Validate the update audit entry
          const updateEntry = auditEntries.find(e => e.action === 'update');
          expect(updateEntry).toBeDefined();
          expect(validateAuditEntry(updateEntry!)).toBe(true);
          expect(updateEntry!.previousState).toBeDefined();
          expect(updateEntry!.newState).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create audit entry when setting ReportCatalog', () => {
    fc.assert(
      fc.property(
        fc.record({
          reports: fc.array(fc.record({
            id: fc.uuid(),
            name: nonEmptyStringGenerator(),
            jurisdiction: fc.constantFrom('US', 'CA'),
            regulator: nonEmptyStringGenerator(),
            frequency: fc.constantFrom('daily', 'weekly', 'monthly', 'quarterly', 'annual'),
            dueDate: fc.record({
              daysAfterPeriodEnd: fc.integer({ min: 1, max: 90 }),
              businessDaysOnly: fc.boolean(),
              timezone: fc.constant('America/New_York')
            }),
            submissionFormat: nonEmptyStringGenerator(),
            submissionPlatform: nonEmptyStringGenerator(),
            description: nonEmptyStringGenerator(),
            templateUrl: fc.option(fc.webUrl()),
            lastUpdated: dateGenerator(),
            responsibleUnit: nonEmptyStringGenerator()
          }), { minLength: 1, maxLength: 5 }),
          version: fc.integer({ min: 1, max: 100 }),
          lastScanned: dateGenerator(),
          status: artifactStatusGenerator(),
          approvedBy: fc.option(nonEmptyStringGenerator()),
          approvedAt: fc.option(dateGenerator())
        }),
        (catalogData) => {
          // Set report catalog
          repository.setReportCatalog(catalogData as ReportCatalog);
          
          // Get audit entries for ReportCatalog
          const auditEntries = repository.getAuditEntries('ReportCatalog');
          
          // Should have at least one audit entry
          expect(auditEntries.length).toBeGreaterThanOrEqual(1);
          
          // Validate the audit entry
          const entry = auditEntries[auditEntries.length - 1];
          expect(validateAuditEntry(entry)).toBe(true);
          expect(entry.entityType).toBe('ReportCatalog');
          
          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should create audit entry when setting CDEInventory', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.record({
          id: fc.uuid(),
          reportId: fc.uuid(),
          cdes: fc.array(fc.record({
            id: fc.uuid(),
            elementId: fc.uuid(),
            name: nonEmptyStringGenerator(),
            businessDefinition: nonEmptyStringGenerator(),
            criticalityRationale: nonEmptyStringGenerator(),
            dataOwner: fc.option(nonEmptyStringGenerator()),
            dataOwnerEmail: fc.option(fc.emailAddress()),
            status: fc.constantFrom('pending_approval', 'approved', 'rejected'),
            approvedBy: fc.option(nonEmptyStringGenerator()),
            approvedAt: fc.option(dateGenerator())
          }), { minLength: 0, maxLength: 5 }),
          version: fc.integer({ min: 1, max: 100 }),
          status: artifactStatusGenerator(),
          createdAt: dateGenerator(),
          updatedAt: dateGenerator()
        }),
        (reportId, inventoryData) => {
          // Set CDE inventory
          repository.setCDEInventory(reportId, inventoryData as CDEInventory);
          
          // Get audit entries for CDEInventory
          const auditEntries = repository.getAuditEntries('CDEInventory');
          
          // Should have at least one audit entry
          expect(auditEntries.length).toBeGreaterThanOrEqual(1);
          
          // Validate the audit entry
          const entry = auditEntries[auditEntries.length - 1];
          expect(validateAuditEntry(entry)).toBe(true);
          expect(entry.entityType).toBe('CDEInventory');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should create audit entry when adding an Annotation (dashboard comment)', () => {
    fc.assert(
      fc.property(
        fc.record({
          metricId: fc.uuid(),
          comment: nonEmptyStringGenerator(),
          createdBy: nonEmptyStringGenerator()
        }),
        (annotationData) => {
          // Create annotation
          const annotation = repository.createAnnotation(annotationData);
          
          // Get audit entries for Annotation
          const auditEntries = repository.getAuditEntries('Annotation', annotation.id);
          
          // Should have exactly one audit entry
          expect(auditEntries.length).toBe(1);
          
          // Validate the audit entry
          const entry = auditEntries[0];
          expect(validateAuditEntry(entry)).toBe(true);
          expect(entry.action).toBe('create');
          expect(entry.entityType).toBe('Annotation');
          expect(entry.actor).toBe(annotationData.createdBy);
          expect(entry.actorType).toBe('human');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should ensure all audit entries have valid timestamps', () => {
    fc.assert(
      fc.property(
        issueDataGenerator(),
        humanTaskDataGenerator(),
        (issueData, taskData) => {
          const beforeTime = new Date();
          
          // Perform multiple operations
          const issue = repository.createIssue(issueData);
          repository.updateIssue(issue.id, { status: 'in_progress' });
          const task = repository.createHumanTask(taskData);
          repository.updateHumanTask(task.id, { status: 'completed' });
          
          const afterTime = new Date();
          
          // Get all audit entries
          const allEntries = repository.getAuditEntries();
          
          // All entries should have timestamps within the operation window
          for (const entry of allEntries) {
            expect(entry.timestamp).toBeInstanceOf(Date);
            expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime() - 1000);
            expect(entry.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 1000);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
