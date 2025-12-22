// Debug the failing test case
import { IssueManagementAgent } from './dist/agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from './dist/repository/governance-repository.js';

const repository = new InMemoryGovernanceRepository();
const agent = new IssueManagementAgent(repository);

// Test case 1: No assignment info
const ruleResult1 = {
  ruleId: "00000000-0000-1000-8000-000000000000",
  passed: false,
  actualValue: 0,
  expectedValue: "",
  failedRecords: undefined,
  totalRecords: 1,
  executedAt: new Date("2020-01-01T00:00:00.000Z")
};

const context1 = {
  reportId: "00000000-0000-1000-8000-000000000000",
  cdeId: undefined,
  ruleId: undefined,
  dataDomain: undefined
};

console.log('=== Test Case 1: No assignment info ===');
console.log('Context:', context1);
console.log('Has assignment info?', !!(context1.cdeId || context1.dataDomain));

try {
  const issue1 = await agent.createIssue(ruleResult1, context1);
  console.log('Issue created:', {
    assignee: issue1.assignee,
    severity: issue1.severity,
    escalationLevel: issue1.escalationLevel
  });
  
  // Test the assertion logic
  const hasAssignmentInfo = !!(context1.cdeId || context1.dataDomain);
  const assigneeAssertion = hasAssignmentInfo ? 
    issue1.assignee !== undefined : 
    issue1.assignee === undefined;
  
  console.log('Expected assignee undefined?', !hasAssignmentInfo);
  console.log('Actual assignee undefined?', issue1.assignee === undefined);
  console.log('Assertion passes?', assigneeAssertion);
  
} catch (error) {
  console.error('Error:', error);
}

console.log('\n=== Test Case 2: Has dataDomain but no CDE ===');
const context2 = {
  reportId: "00000000-0000-1000-8000-000000000000",
  cdeId: undefined,
  ruleId: undefined,
  dataDomain: "finance"
};

console.log('Context:', context2);
console.log('Has assignment info?', !!(context2.cdeId || context2.dataDomain));

try {
  const issue2 = await agent.createIssue(ruleResult1, context2);
  console.log('Issue created:', {
    assignee: issue2.assignee,
    severity: issue2.severity,
    escalationLevel: issue2.escalationLevel
  });
  
  // Test the assertion logic
  const hasAssignmentInfo2 = !!(context2.cdeId || context2.dataDomain);
  const assigneeAssertion2 = hasAssignmentInfo2 ? 
    issue2.assignee !== undefined : 
    issue2.assignee === undefined;
  
  console.log('Expected assignee defined?', hasAssignmentInfo2);
  console.log('Actual assignee defined?', issue2.assignee !== undefined);
  console.log('Assertion passes?', assigneeAssertion2);
  
} catch (error) {
  console.error('Error:', error);
}