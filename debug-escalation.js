// Debug the escalation issue
import { IssueManagementAgent } from './dist/agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from './dist/repository/governance-repository.js';

const repository = new InMemoryGovernanceRepository();
const agent = new IssueManagementAgent(repository);

// Exact failing counterexample
const ruleResult = {
  ruleId: "00000000-0000-1000-8000-000000000000",
  passed: false,
  actualValue: "",
  expectedValue: 0,
  totalRecords: 1,
  executedAt: new Date("1970-01-01T00:00:00.000Z")
};

const context = {
  reportId: 'test-report',
  dataDomain: 'finance'
  // No cdeId - should be non-critical
};

console.log('=== Debugging non-critical escalation ===');
console.log('Context:', context);
console.log('Has CDE?', !!context.cdeId);

try {
  const issue = await agent.createIssue(ruleResult, context);
  console.log('Issue created:', {
    id: issue.id,
    severity: issue.severity,
    escalationLevel: issue.escalationLevel,
    escalatedAt: issue.escalatedAt
  });
  
  console.log('Expected: severity !== "critical" and escalationLevel === 0');
  console.log('Actual: severity =', issue.severity, ', escalationLevel =', issue.escalationLevel);
  
  const testPasses = (
    issue.severity !== 'critical' &&
    issue.escalationLevel === 0 &&
    (issue.escalatedAt === undefined || issue.escalatedAt === null)
  );
  
  console.log('Test passes?', testPasses);
  
} catch (error) {
  console.error('Error:', error);
}