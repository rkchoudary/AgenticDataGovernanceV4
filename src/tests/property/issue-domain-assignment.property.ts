/**
 * **Feature: agentic-data-governance, Property 19: Issue Domain-Based Assignment**
 * 
 * For any automatically created issue, the assignee must be set to the data owner of the 
 * primary impacted CDE, or to the domain steward if no CDE owner is defined.
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

describe('Property 19: Issue Domain-Based Assignment', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: IssueManagementAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new IssueManagementAgent(repository);
  });

  it('should assign issues to CDE data owner when available', () => {
    fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        issueContextGenerator(),
        fc.emailAddress(),
        async (ruleResult: RuleExecutionResult, context: IssueContext, dataOwnerEmail: string) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Ensure we have both cdeId and reportId for this test
          if (!context.cdeId || !context.reportId) {
            return true; // Skip this test case
          }
          
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Set up CDE inventory with data owner
          const cde: CDE = {
            id: context.cdeId,
            elementId: context.cdeId,
            name: 'Test CDE with Owner',
            businessDefinition: 'Test definition',
            criticalityRationale: 'Test rationale',
            dataOwnerEmail: dataOwnerEmail,
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
          
          // Create issue from rule failure
          const issue = await agent.createIssue(failedRuleResult, context);
          
          // Issue should be assigned to the CDE data owner
          return issue.assignee === dataOwnerEmail;
        }
      ),
      propertyConfig
    );
  });

  it('should assign issues to domain steward when no CDE owner is defined', () => {
    fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        fc.constantFrom('finance', 'risk', 'operations', 'compliance'), // Ensure valid domain
        async (ruleResult: RuleExecutionResult, dataDomain: string) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Set up context with dataDomain but no CDE
          const contextWithoutCDEOwner: IssueContext = {
            reportId: 'test-report',
            dataDomain,
            // No cdeId to ensure no CDE owner lookup
          };
          
          // Create issue from rule failure
          const issue = await agent.createIssue(failedRuleResult, contextWithoutCDEOwner);
          
          // Issue should be assigned to domain steward
          const expectedDomainSteward = `${dataDomain}-steward@company.com`;
          return issue.assignee === expectedDomainSteward;
        }
      ),
      propertyConfig
    );
  });

  it('should handle cases where CDE exists but has no owner', () => {
    fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        fc.constantFrom('finance', 'risk', 'operations', 'compliance'), // Ensure valid domain
        async (ruleResult: RuleExecutionResult, dataDomain: string) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          const failedRuleResult = { ...ruleResult, passed: false };
          const reportId = 'test-report';
          const cdeId = 'test-cde-without-owner';
          
          // Set up CDE inventory with CDE that has no owner
          const cde: CDE = {
            id: cdeId,
            elementId: cdeId,
            name: 'Test CDE without Owner',
            businessDefinition: 'Test definition',
            criticalityRationale: 'Test rationale',
            // No dataOwnerEmail set
            status: 'approved'
          };
          
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId: reportId,
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setCDEInventory(reportId, inventory);
          
          const context: IssueContext = {
            reportId,
            cdeId,
            dataDomain
          };
          
          // Create issue from rule failure
          const issue = await agent.createIssue(failedRuleResult, context);
          
          // Issue should fall back to domain steward
          const expectedDomainSteward = `${dataDomain}-steward@company.com`;
          return issue.assignee === expectedDomainSteward;
        }
      ),
      propertyConfig
    );
  });

  it('should handle cases where no assignment information is available', () => {
    fc.assert(
      fc.asyncProperty(
        ruleExecutionResultGenerator(),
        async (ruleResult: RuleExecutionResult) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          const failedRuleResult = { ...ruleResult, passed: false };
          
          // Create context with no assignment information
          const contextWithoutAssignmentInfo: IssueContext = {
            reportId: 'test-report',
            // No cdeId, no dataDomain
          };
          
          // Create issue from rule failure
          const issue = await agent.createIssue(failedRuleResult, contextWithoutAssignmentInfo);
          
          // Issue should have default assignee when no assignment info is available
          return issue.assignee === 'unassigned@company.com';
        }
      ),
      propertyConfig
    );
  });
});