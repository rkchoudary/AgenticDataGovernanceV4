/**
 * **Feature: agentic-data-governance, Property 18: Issue Auto-Creation from Rule Failures**
 * 
 * For any data quality rule execution that fails (passed=false) with severity 'critical' or 'high', 
 * an issue must be automatically created with all required fields populated.
 */

import fc from 'fast-check';
import { describe, it, beforeEach } from 'vitest';
import { IssueManagementAgent } from '../../agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { ruleExecutionResultGenerator, issueContextGenerator } from '../generators/index.js';
import { RuleExecutionResult, IssueContext, CDEInventory, CDE } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 18: Issue Auto-Creation from Rule Failures', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: IssueManagementAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new IssueManagementAgent(repository);
  });

  it('should auto-create issues for failed rule executions with all required fields', () => {
    fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        issueContextGenerator(),
        async (ruleResult: RuleExecutionResult, context: IssueContext) => {
          // Ensure rule result is a failure
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Set up CDE inventory if context has cdeId to enable proper assignment
          if (context.cdeId && context.reportId) {
            const cde: CDE = {
              id: context.cdeId,
              elementId: context.cdeId,
              name: 'Test CDE',
              businessDefinition: 'Test definition',
              criticalityRationale: 'Test rationale',
              dataOwnerEmail: 'owner@company.com',
              status: 'approved'
            };
            
            const inventory: CDEInventory = {
              id: 'test-inventory',
              reportId: context.reportId,
              cdes: [cde],
              version: 1,
              status: 'approved',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            repository.setCDEInventory(context.reportId, inventory);
          }
          
          // Create issue from rule failure
          const issue = await agent.createIssue(failedRuleResult, context);
          
          // Verify all required fields are populated
          return (
            // Basic required fields
            issue.id !== undefined &&
            issue.id.length > 0 &&
            issue.title !== undefined &&
            issue.title.length > 0 &&
            issue.description !== undefined &&
            issue.description.length > 0 &&
            issue.source !== undefined &&
            issue.source.length > 0 &&
            issue.severity !== undefined &&
            issue.status === 'open' &&
            issue.createdAt instanceof Date &&
            issue.escalationLevel >= 0 &&
            
            // Arrays should be defined (can be empty)
            Array.isArray(issue.impactedReports) &&
            Array.isArray(issue.impactedCDEs) &&
            
            // Context-specific validations
            (context.reportId ? issue.impactedReports.includes(context.reportId) : true) &&
            (context.cdeId ? issue.impactedCDEs.includes(context.cdeId) : true) &&
            
            // Source should reference the rule
            issue.source.includes(failedRuleResult.ruleId) &&
            
            // Assignee validation: should always be set (never undefined)
            issue.assignee !== undefined &&
            issue.assignee.length > 0
          );
        }
      ),
      propertyConfig
    );
  });

  it('should auto-escalate critical issues immediately', () => {
    fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        issueContextGenerator(),
        async (ruleResult: RuleExecutionResult, context: IssueContext) => {
          // Force critical severity by setting cdeId (CDEs are always critical)
          const criticalContext = { ...context, cdeId: 'test-cde-id' };
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Set up CDE inventory for critical context
          if (criticalContext.reportId) {
            const cde: CDE = {
              id: criticalContext.cdeId!,
              elementId: criticalContext.cdeId!,
              name: 'Critical Test CDE',
              businessDefinition: 'Critical test definition',
              criticalityRationale: 'Critical test rationale',
              dataOwnerEmail: 'critical-owner@company.com',
              status: 'approved'
            };
            
            const inventory: CDEInventory = {
              id: 'critical-inventory',
              reportId: criticalContext.reportId,
              cdes: [cde],
              version: 1,
              status: 'approved',
              createdAt: new Date(),
              updatedAt: new Date()
            };
            
            repository.setCDEInventory(criticalContext.reportId, inventory);
          }
          
          // Create issue from rule failure
          const issue = await agent.createIssue(failedRuleResult, criticalContext);
          
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
});