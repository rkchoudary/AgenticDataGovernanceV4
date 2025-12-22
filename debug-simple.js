// Simple debug to understand the failing test
import { IssueManagementAgent } from './dist/agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from './dist/repository/governance-repository.js';

const repository = new InMemoryGovernanceRepository();
const agent = new IssueManagementAgent(repository);

// Exact failing counterexample
const ruleResult = {
  ruleId: "00000000-0000-1000-8000-000000000000",
  passed: false,
  actualValue: 0,
  expectedValue: 0,
  failedRecords: undefined,
  totalRecords: 1,
  executedAt: new Date("2020-01-01T00:00:00.000Z")
};

const context = {
  reportId: "00000000-0000-1000-8000-000000000000",
  cdeId: undefined,
  ruleId: undefined,
  dataDomain: undefined
};

console.log('=== Debugging failing counterexample ===');
console.log('Context:', context);

try {
  const issue = await agent.createIssue(ruleResult, context);
  console.log('Issue created:', {
    id: issue.id,
    assignee: issue.assignee,
    severity: issue.severity,
    escalationLevel: issue.escalationLevel,
    escalatedAt: issue.escalatedAt
  });
  
  // Test the exact assertion from the failing test
  const hasAssignmentInfo = !!(context.cdeId || context.dataDomain);
  console.log('Has assignment info?', hasAssignmentInfo);
  console.log('Expected assignee undefined?', !hasAssignmentInfo);
  console.log('Actual assignee undefined?', issue.assignee === undefined);
  
  const assigneeAssertion = hasAssignmentInfo ? 
    issue.assignee !== undefined : 
    issue.assignee === undefined;
  
  console.log('Assignee assertion passes?', assigneeAssertion);
  
  // Check all the other assertions
  const allAssertions = (
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
    issue.source.includes(ruleResult.ruleId) &&
    
    // Assignee validation: should be set if assignment info is available
    assigneeAssertion
  );
  
  console.log('All assertions pass?', allAssertions);
  
  // Check each assertion individually
  console.log('Individual checks:');
  console.log('- id defined and non-empty:', issue.id !== undefined && issue.id.length > 0);
  console.log('- title defined and non-empty:', issue.title !== undefined && issue.title.length > 0);
  console.log('- description defined and non-empty:', issue.description !== undefined && issue.description.length > 0);
  console.log('- source defined and non-empty:', issue.source !== undefined && issue.source.length > 0);
  console.log('- severity defined:', issue.severity !== undefined);
  console.log('- status is open:', issue.status === 'open');
  console.log('- createdAt is Date:', issue.createdAt instanceof Date);
  console.log('- escalationLevel >= 0:', issue.escalationLevel >= 0);
  console.log('- impactedReports is array:', Array.isArray(issue.impactedReports));
  console.log('- impactedCDEs is array:', Array.isArray(issue.impactedCDEs));
  console.log('- reportId check:', context.reportId ? issue.impactedReports.includes(context.reportId) : true);
  console.log('- cdeId check:', context.cdeId ? issue.impactedCDEs.includes(context.cdeId) : true);
  console.log('- source includes ruleId:', issue.source.includes(ruleResult.ruleId));
  console.log('- assignee assertion:', assigneeAssertion);
  
} catch (error) {
  console.error('Error:', error);
}