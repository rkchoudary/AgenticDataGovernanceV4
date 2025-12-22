/**
 * **Feature: agentic-data-governance, Property 20: Critical Issue Escalation**
 * 
 * For any issue with severity 'critical', the issue must be escalated (escalation level > 0) 
 * within the configured escalation time threshold.
 */

import fc from 'fast-check';
import { describe, it, beforeEach } from 'vitest';
import { IssueManagementAgent } from '../../agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { criticalIssueGenerator, ruleExecutionResultGenerator } from '../generators/index.js';
import { Issue, RuleExecutionResult, IssueContext, CDE, CDEInventory, Severity } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 20: Critical Issue Escalation', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: IssueManagementAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new IssueManagementAgent(repository);
  });

  it('should escalate critical issues immediately upon creation', async () => {
    await fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        async (ruleResult: RuleExecutionResult) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Create context that will result in critical severity (has CDE)
          const context: IssueContext = {
            reportId: 'test-report',
            cdeId: 'test-critical-cde'
          };
          
          // Set up CDE inventory to make this critical
          const cde: CDE = {
            id: 'test-critical-cde',
            elementId: 'test-critical-cde',
            name: 'Critical Test CDE',
            businessDefinition: 'Critical test definition',
            criticalityRationale: 'Critical test rationale',
            dataOwnerEmail: 'critical-owner@company.com',
            status: 'approved'
          };
          
          const inventory: CDEInventory = {
            id: 'critical-inventory',
            reportId: 'test-report',
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setCDEInventory('test-report', inventory);
          
          // Create issue - this should auto-escalate critical issues
          const issue = await agent.createIssue(failedRuleResult, context);
          
          // Critical issues should be escalated immediately
          return (
            issue.severity === 'critical' &&
            issue.escalationLevel > 0 &&
            issue.escalatedAt instanceof Date
          );
        }
      ),
      propertyConfig
    );
  });

  it('should escalate overdue critical issues through checkEscalationNeeded', async () => {
    await fc.assert(
      fc.asyncProperty(
        criticalIssueGenerator(),
        async (issue: Issue) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Create a critical issue that is overdue (past due date)
          const pastDueDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
          const overdueIssue = {
            ...issue,
            severity: 'critical' as const,
            status: 'open' as const,
            dueDate: pastDueDate,
            escalationLevel: 0,
            escalatedAt: undefined
          };
          
          // Store the issue in repository
          const storedIssue = repository.createIssue(overdueIssue);
          
          // Check for escalation needed
          const issuesNeedingEscalation = await agent.checkEscalationNeeded();
          
          // The overdue critical issue should be in the list and escalated
          const escalatedIssue = repository.getIssue(storedIssue.id);
          
          return (
            issuesNeedingEscalation.some(i => i.id === storedIssue.id) &&
            escalatedIssue !== undefined &&
            escalatedIssue.escalationLevel > 0
          );
        }
      ),
      propertyConfig
    );
  });

  it('should not escalate non-critical issues immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          ruleId: fc.uuid(),
          passed: fc.constant(false),
          actualValue: fc.oneof(fc.string(), fc.float(), fc.integer()),
          expectedValue: fc.oneof(fc.string(), fc.float(), fc.integer()),
          // Use low failure rate to ensure non-critical severity
          failedRecords: fc.constant(undefined),
          totalRecords: fc.integer({ min: 100, max: 1000 }),
          executedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
        }),
        fc.constantFrom('finance', 'risk', 'operations', 'compliance'),
        async (ruleResult: RuleExecutionResult, dataDomain: string) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Create context that will NOT result in critical severity (no CDE)
          const context: IssueContext = {
            reportId: 'test-report',
            dataDomain // This will result in non-critical severity
          };
          
          // Create issue - this should NOT auto-escalate
          const issue = await agent.createIssue(failedRuleResult, context);
          
          // Non-critical issues should not be escalated immediately
          // Note: severity is determined by the implementation based on context
          if (issue.severity === 'critical') {
            // If somehow critical, it should be escalated
            return issue.escalationLevel > 0;
          }
          
          // Non-critical issues should not be escalated immediately
          return (
            issue.escalationLevel === 0 &&
            (issue.escalatedAt === undefined || issue.escalatedAt === null)
          );
        }
      ),
      propertyConfig
    );
  });

  it('should escalate issues based on time thresholds for different severities', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<Severity>('critical', 'high', 'medium', 'low'),
        fc.integer({ min: 2, max: 100 }), // hours past due (min 2 to ensure we're past critical threshold)
        async (severity: Severity, hoursPastDue: number) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          const pastDueDate = new Date(Date.now() - hoursPastDue * 60 * 60 * 1000);
          const overdueIssue = {
            id: 'test-id',
            title: 'Test Issue',
            description: 'Test Description',
            source: 'Test Source',
            impactedReports: [] as string[],
            impactedCDEs: [] as string[],
            severity,
            status: 'open' as const,
            assignee: 'test@example.com',
            createdAt: new Date(Date.now() - (hoursPastDue + 1) * 60 * 60 * 1000),
            dueDate: pastDueDate,
            escalationLevel: 0,
            escalatedAt: undefined
          };
          
          // Store the issue in repository
          const storedIssue = repository.createIssue(overdueIssue);
          
          // Check for escalation needed
          const issuesNeedingEscalation = await agent.checkEscalationNeeded();
          
          // Determine if escalation should happen based on severity and time
          let shouldEscalate = false;
          switch (severity) {
            case 'critical':
              shouldEscalate = hoursPastDue > 1;
              break;
            case 'high':
              shouldEscalate = hoursPastDue > 4;
              break;
            case 'medium':
              shouldEscalate = hoursPastDue > 24;
              break;
            case 'low':
              shouldEscalate = hoursPastDue > 72;
              break;
          }
          
          const isInEscalationList = issuesNeedingEscalation.some(i => i.id === storedIssue.id);
          
          // The escalation behavior should match the expected threshold
          if (shouldEscalate) {
            return isInEscalationList;
          }
          // If shouldn't escalate, verify it's not in the list
          return !isInEscalationList;
        }
      ),
      propertyConfig
    );
  });
});
