/**
 * **Feature: agentic-data-governance, Property 25: Critical Issue Workflow Blocking**
 * 
 * For any active workflow cycle, if a critical issue is created that impacts 
 * the cycle's report, the cycle status must transition to 'paused' until the 
 * issue is resolved or an exception is approved.
 * 
 * **Validates: Requirements 12.4**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { GovernanceOrchestrator } from '../../orchestrator/governance-orchestrator.js';
import { Issue, Phase } from '../../types/index.js';
import { dateGenerator, nonEmptyStringGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 25: Critical Issue Workflow Blocking', () => {
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
   * Generator for critical issue data
   */
  const criticalIssueGenerator = (reportId: string): fc.Arbitrary<Omit<Issue, 'id'>> =>
    fc.record({
      title: nonEmptyStringGenerator(),
      description: nonEmptyStringGenerator(),
      source: nonEmptyStringGenerator(),
      impactedReports: fc.constant([reportId]),
      impactedCDEs: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
      severity: fc.constant('critical' as const),
      status: fc.constant('open' as const),
      assignee: fc.emailAddress(),
      createdAt: dateGenerator(),
      dueDate: fc.option(dateGenerator()),
      escalationLevel: fc.constant(0)
    });

  it('should block agent execution when critical issue exists for the report', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a critical issue for this report
          repository.createIssue({
            title: 'Critical data quality issue',
            description: 'Severe data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [reportId],
            impactedCDEs: [],
            severity: 'critical',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Try to trigger an agent
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          // Should throw an error due to critical issue
          await expect(
            orchestrator.triggerAgent('regulatory_intelligence', context)
          ).rejects.toThrow(/critical issue.*requires resolution/i);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should pause cycle when critical issue is detected during agent execution', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a critical issue for this report
          repository.createIssue({
            title: 'Critical data quality issue',
            description: 'Severe data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [reportId],
            impactedCDEs: [],
            severity: 'critical',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Try to trigger an agent (will fail)
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          try {
            await orchestrator.triggerAgent('regulatory_intelligence', context);
          } catch {
            // Expected to fail
          }
          
          // Verify cycle is paused
          const updatedCycle = repository.getCycleInstance(cycle.id);
          expect(updatedCycle?.status).toBe('paused');
          expect(updatedCycle?.pauseReason).toContain('Critical issue');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow workflow to continue when critical issue is resolved', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a critical issue
          const issue = repository.createIssue({
            title: 'Critical data quality issue',
            description: 'Severe data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [reportId],
            impactedCDEs: [],
            severity: 'critical',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Try to trigger agent (will fail and pause cycle)
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          try {
            await orchestrator.triggerAgent('regulatory_intelligence', context);
          } catch {
            // Expected to fail
          }
          
          // Resolve the critical issue
          repository.updateIssue(issue.id, { status: 'closed' });
          
          // Resume the cycle
          await orchestrator.resumeCycle(cycle.id);
          
          // Now agent should be able to execute
          const result = await orchestrator.triggerAgent('regulatory_intelligence', context);
          expect(result.success).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not block workflow for non-critical issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        fc.constantFrom('high', 'medium', 'low'),
        async (reportId, periodEnd, severity) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a non-critical issue
          repository.createIssue({
            title: 'Data quality issue',
            description: 'Data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [reportId],
            impactedCDEs: [],
            severity: severity as 'high' | 'medium' | 'low',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Agent should still be able to execute
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          const result = await orchestrator.triggerAgent('regulatory_intelligence', context);
          expect(result.success).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not block workflow for critical issues affecting other reports', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, otherReportId, periodEnd) => {
          // Ensure different report IDs
          if (reportId === otherReportId) {
            return true; // Skip this case
          }
          
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a critical issue for a DIFFERENT report
          repository.createIssue({
            title: 'Critical data quality issue',
            description: 'Severe data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [otherReportId], // Different report
            impactedCDEs: [],
            severity: 'critical',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Agent should still be able to execute for our report
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          const result = await orchestrator.triggerAgent('regulatory_intelligence', context);
          expect(result.success).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should check for critical issues using checkCriticalIssueBlocking method', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Initially no blocking
          let isBlocking = await orchestrator.checkCriticalIssueBlocking(cycle.id);
          expect(isBlocking).toBe(false);
          
          // Create a critical issue
          repository.createIssue({
            title: 'Critical data quality issue',
            description: 'Severe data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [reportId],
            impactedCDEs: [],
            severity: 'critical',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Now should be blocking
          isBlocking = await orchestrator.checkCriticalIssueBlocking(cycle.id);
          expect(isBlocking).toBe(true);
          
          // Cycle should be paused
          const updatedCycle = repository.getCycleInstance(cycle.id);
          expect(updatedCycle?.status).toBe('paused');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should prevent resuming cycle while critical issue is still open', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Create a critical issue
          repository.createIssue({
            title: 'Critical data quality issue',
            description: 'Severe data quality problem detected',
            source: 'Rule: DQ-001',
            impactedReports: [reportId],
            impactedCDEs: [],
            severity: 'critical',
            status: 'open',
            assignee: 'steward@company.com',
            createdAt: new Date(),
            escalationLevel: 0
          });
          
          // Pause the cycle manually
          await orchestrator.pauseCycle(cycle.id, 'Manual pause');
          
          // Try to resume - should fail due to critical issue
          await expect(
            orchestrator.resumeCycle(cycle.id)
          ).rejects.toThrow(/critical issues blocking/i);
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
