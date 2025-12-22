/**
 * Test generators for Issue Management
 */

import fc from 'fast-check';
import {
  Issue,
  IssueContext,
  Resolution,
  RuleExecutionResult,
  Severity,
  IssueStatus,
  ResolutionType,
  IssueFilters
} from '../../types/index.js';

/**
 * Generates random Issue objects
 */
export const issueGenerator = (): fc.Arbitrary<Issue> => {
  return fc.record({
    id: fc.uuid().map(id => `issue-${id}`), // Ensure unique IDs
    title: fc.string({ minLength: 10, maxLength: 100 }),
    description: fc.string({ minLength: 20, maxLength: 500 }),
    source: fc.oneof(
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `Rule: ${s}`),
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `System: ${s}`),
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `Manual: ${s}`)
    ),
    impactedReports: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    impactedCDEs: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    severity: fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<Severity>,
    status: fc.constantFrom('open', 'in_progress', 'pending_verification', 'resolved', 'closed') as fc.Arbitrary<IssueStatus>,
    assignee: fc.emailAddress(),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    dueDate: fc.option(fc.date({ min: new Date(), max: new Date('2025-12-31') }), { nil: undefined }),
    rootCause: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    resolution: fc.option(resolutionGenerator(), { nil: undefined }),
    compensatingControl: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
    escalationLevel: fc.integer({ min: 0, max: 3 }),
    escalatedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }), { nil: undefined })
  });
};

/**
 * Generates random Resolution objects
 */
export const resolutionGenerator = (): fc.Arbitrary<Resolution> => {
  return fc.record({
    type: fc.constantFrom('data_correction', 'process_change', 'system_fix', 'exception_approved') as fc.Arbitrary<ResolutionType>,
    description: fc.string({ minLength: 20, maxLength: 300 }),
    implementedBy: fc.emailAddress(),
    implementedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    verifiedBy: fc.option(fc.emailAddress(), { nil: undefined }),
    verifiedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }), { nil: undefined })
  });
};

/**
 * Generates random IssueContext objects
 */
export const issueContextGenerator = (): fc.Arbitrary<IssueContext> => {
  return fc.record({
    reportId: fc.uuid(),
    cdeId: fc.option(fc.uuid(), { nil: undefined }),
    ruleId: fc.option(fc.uuid(), { nil: undefined }),
    dataDomain: fc.option(fc.constantFrom('finance', 'risk', 'operations', 'compliance'), { nil: undefined })
  });
};

/**
 * Generates random RuleExecutionResult objects for testing issue creation
 */
export const ruleExecutionResultGenerator = (): fc.Arbitrary<RuleExecutionResult> => {
  return fc.record({
    ruleId: fc.uuid(),
    passed: fc.constant(false), // For issue creation, we want failed rules
    actualValue: fc.oneof(fc.string(), fc.float(), fc.integer(), fc.constant(null)),
    expectedValue: fc.oneof(fc.string(), fc.float(), fc.integer()),
    failedRecords: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
    totalRecords: fc.integer({ min: 1, max: 1000 }),
    executedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
  });
};

/**
 * Generates random IssueFilters objects
 */
export const issueFiltersGenerator = (): fc.Arbitrary<IssueFilters> => {
  return fc.record({
    status: fc.option(fc.array(fc.constantFrom('open', 'in_progress', 'pending_verification', 'resolved', 'closed') as fc.Arbitrary<IssueStatus>, { minLength: 1, maxLength: 3 })),
    severity: fc.option(fc.array(fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<Severity>, { minLength: 1, maxLength: 3 })),
    assignee: fc.option(fc.emailAddress()),
    reportId: fc.option(fc.uuid()),
    cdeId: fc.option(fc.uuid()),
    fromDate: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() })),
    toDate: fc.option(fc.date({ min: new Date(), max: new Date('2025-12-31') }))
  });
};

/**
 * Generates issues with critical or high severity for escalation testing
 */
export const criticalIssueGenerator = (): fc.Arbitrary<Issue> => {
  return fc.record({
    id: fc.uuid().map(id => `issue-${id}`),
    title: fc.string({ minLength: 10, maxLength: 100 }),
    description: fc.string({ minLength: 20, maxLength: 500 }),
    source: fc.oneof(
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `Rule: ${s}`),
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `System: ${s}`),
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `Manual: ${s}`)
    ),
    impactedReports: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    impactedCDEs: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    severity: fc.constantFrom('critical', 'high') as fc.Arbitrary<Severity>,
    status: fc.constantFrom('open', 'in_progress') as fc.Arbitrary<IssueStatus>,
    assignee: fc.emailAddress(),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    dueDate: fc.date({ min: new Date('2020-01-01'), max: new Date() }), // Always provide a due date for escalation testing
    rootCause: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    resolution: fc.option(resolutionGenerator(), { nil: undefined }),
    compensatingControl: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
    escalationLevel: fc.constant(0), // Start at 0 for escalation testing
    escalatedAt: fc.constant(undefined) as fc.Arbitrary<Date | undefined>
  });
};

/**
 * Generates resolved issues for metrics testing
 */
export const resolvedIssueGenerator = (): fc.Arbitrary<Issue> => {
  return fc.record({
    id: fc.uuid().map(id => `issue-${id}`),
    title: fc.string({ minLength: 10, maxLength: 100 }),
    description: fc.string({ minLength: 20, maxLength: 500 }),
    source: fc.oneof(
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `Rule: ${s}`),
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `System: ${s}`),
      fc.string({ minLength: 5, maxLength: 50 }).map(s => `Manual: ${s}`)
    ),
    impactedReports: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    impactedCDEs: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
    severity: fc.constantFrom('critical', 'high', 'medium', 'low') as fc.Arbitrary<Severity>,
    status: fc.constant('closed') as fc.Arbitrary<IssueStatus>,
    assignee: fc.emailAddress(),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') }),
    dueDate: fc.option(fc.date({ min: new Date(), max: new Date('2025-12-31') }), { nil: undefined }),
    rootCause: fc.option(fc.string({ minLength: 10, maxLength: 200 }), { nil: undefined }),
    resolution: resolutionGenerator(), // Always have a resolution for resolved issues
    compensatingControl: fc.option(fc.string({ minLength: 10, maxLength: 100 }), { nil: undefined }),
    escalationLevel: fc.integer({ min: 0, max: 3 }),
    escalatedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }), { nil: undefined })
  });
};