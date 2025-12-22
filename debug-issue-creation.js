// Debug script to understand issue creation
import { IssueManagementAgent } from './src/agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from './src/repository/governance-repository.js';

const repository = new InMemoryGovernanceRepository();
const agent = new IssueManagementAgent(repository);

const ruleResult = {
  ruleId: "00000000-0000-1000-8000-000000000000",
  passed: false,
  actualValue: "",
  expectedValue: "",
  failedRecords: null,
  totalRecords: 1,
  executedAt: new Date("2020-01-01T00:00:00.000Z")
};

const context = {
  reportId: "00000000-0000-1000-8000-000000000000",
  cdeId: null,
  ruleId: null,
  dataDomain: null
};

console.log('Creating issue with context:', context);

try {
  const issue = await agent.createIssue(ruleResult, context);
  console.log('Created issue:', {
    id: issue.id,
    assignee: issue.assignee,
    severity: issue.severity,
    escalationLevel: issue.escalationLevel
  });
  
  console.log('Assignment info available?', !!(context.cdeId || context.dataDomain));
  console.log('Expected assignee to be undefined?', !(context.cdeId || context.dataDomain));
  console.log('Actual assignee is undefined?', issue.assignee === undefined);
  
} catch (error) {
  console.error('Error creating issue:', error);
}