/**
 * **Feature: workflow-wizard-ui, Property 2: Blocking Condition Enforcement**
 * 
 * For any workflow cycle with critical issues in the Issue Management phase,
 * the system shall prevent progression to the Controls Management phase until
 * all critical issues are resolved or escalated.
 * 
 * **Validates: Requirements 8.5**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ============================================================================
// Type Definitions (mirroring frontend types for testing)
// ============================================================================

type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

type IssueStatus = 
  | 'open'
  | 'triaged'
  | 'analyzing'
  | 'resolving'
  | 'pending_verification'
  | 'verified'
  | 'closed'
  | 'escalated';

type IssueSource = 
  | 'dq_rule_failure'
  | 'reconciliation_mismatch'
  | 'lineage_break'
  | 'manual_report'
  | 'audit_finding';

interface Issue {
  id: string;
  title: string;
  description: string;
  source: IssueSource;
  severity: IssueSeverity;
  status: IssueStatus;
  priority: number;
  impactedCDEs: string[];
  impactedReports: string[];
  assignee?: string;
  createdAt: string;
  escalationLevel: number;
  isBlocking: boolean;
}

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Check if an issue is critical and unresolved (blocking)
 * Property 2: Blocking Condition Enforcement
 */
function isCriticalUnresolved(issue: Issue): boolean {
  return (
    issue.severity === 'critical' &&
    !['verified', 'closed', 'escalated'].includes(issue.status)
  );
}

/**
 * Check if there are any blocking issues
 * Property 2: Blocking Condition Enforcement
 */
function hasBlockingIssues(issues: Issue[]): boolean {
  return issues.some(issue => isCriticalUnresolved(issue));
}

/**
 * Get all blocking issues
 */
function getBlockingIssues(issues: Issue[]): Issue[] {
  return issues.filter(issue => isCriticalUnresolved(issue));
}

/**
 * Check if the workflow can proceed from Issue Management to Controls Management
 * Property 2: Blocking Condition Enforcement
 */
function canProceedToControlsManagement(issues: Issue[]): boolean {
  return !hasBlockingIssues(issues);
}

/**
 * Resolve an issue (mark as verified)
 */
function resolveIssue(issue: Issue): Issue {
  return {
    ...issue,
    status: 'verified',
  };
}

/**
 * Escalate an issue
 */
function escalateIssue(issue: Issue, reason: string): Issue {
  return {
    ...issue,
    status: 'escalated',
    escalationLevel: issue.escalationLevel + 1,
  };
}

/**
 * Close an issue
 */
function closeIssue(issue: Issue): Issue {
  return {
    ...issue,
    status: 'closed',
  };
}

// ============================================================================
// Generators
// ============================================================================

const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Generator for issue severity
 */
const severityGenerator = (): fc.Arbitrary<IssueSeverity> =>
  fc.constantFrom('critical', 'high', 'medium', 'low');

/**
 * Generator for issue status
 */
const statusGenerator = (): fc.Arbitrary<IssueStatus> =>
  fc.constantFrom(
    'open',
    'triaged',
    'analyzing',
    'resolving',
    'pending_verification',
    'verified',
    'closed',
    'escalated'
  );

/**
 * Generator for issue source
 */
const sourceGenerator = (): fc.Arbitrary<IssueSource> =>
  fc.constantFrom(
    'dq_rule_failure',
    'reconciliation_mismatch',
    'lineage_break',
    'manual_report',
    'audit_finding'
  );

/**
 * Generator for a single issue
 */
const issueGenerator = (): fc.Arbitrary<Issue> =>
  fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    source: sourceGenerator(),
    severity: severityGenerator(),
    status: statusGenerator(),
    priority: fc.integer({ min: 1, max: 10 }),
    impactedCDEs: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    impactedReports: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    assignee: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    createdAt: fc.date().map(d => d.toISOString()),
    escalationLevel: fc.integer({ min: 0, max: 3 }),
    isBlocking: fc.boolean(),
  });

/**
 * Generator for a critical unresolved issue (blocking)
 */
const criticalUnresolvedIssueGenerator = (): fc.Arbitrary<Issue> =>
  fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    source: sourceGenerator(),
    severity: fc.constant('critical' as IssueSeverity),
    status: fc.constantFrom('open', 'triaged', 'analyzing', 'resolving', 'pending_verification') as fc.Arbitrary<IssueStatus>,
    priority: fc.integer({ min: 1, max: 3 }),
    impactedCDEs: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
    impactedReports: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    assignee: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    createdAt: fc.date().map(d => d.toISOString()),
    escalationLevel: fc.integer({ min: 0, max: 3 }),
    isBlocking: fc.constant(true),
  });

/**
 * Generator for a resolved/escalated critical issue (non-blocking)
 */
const resolvedCriticalIssueGenerator = (): fc.Arbitrary<Issue> =>
  fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    source: sourceGenerator(),
    severity: fc.constant('critical' as IssueSeverity),
    status: fc.constantFrom('verified', 'closed', 'escalated') as fc.Arbitrary<IssueStatus>,
    priority: fc.integer({ min: 1, max: 3 }),
    impactedCDEs: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
    impactedReports: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
    assignee: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    createdAt: fc.date().map(d => d.toISOString()),
    escalationLevel: fc.integer({ min: 0, max: 3 }),
    isBlocking: fc.constant(false),
  });

/**
 * Generator for a non-critical issue (never blocking regardless of status)
 */
const nonCriticalIssueGenerator = (): fc.Arbitrary<Issue> =>
  fc.record({
    id: fc.uuid(),
    title: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.string({ minLength: 1, maxLength: 500 }),
    source: sourceGenerator(),
    severity: fc.constantFrom('high', 'medium', 'low') as fc.Arbitrary<IssueSeverity>,
    status: statusGenerator(),
    priority: fc.integer({ min: 1, max: 10 }),
    impactedCDEs: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
    impactedReports: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
    assignee: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    createdAt: fc.date().map(d => d.toISOString()),
    escalationLevel: fc.integer({ min: 0, max: 3 }),
    isBlocking: fc.boolean(),
  });

/**
 * Generator for a list of issues with at least one critical unresolved
 */
const issuesWithBlockingGenerator = (): fc.Arbitrary<Issue[]> =>
  fc.tuple(
    criticalUnresolvedIssueGenerator(),
    fc.array(issueGenerator(), { minLength: 0, maxLength: 10 })
  ).map(([blocking, others]) => [blocking, ...others]);

/**
 * Generator for a list of issues with no blocking issues
 */
const issuesWithoutBlockingGenerator = (): fc.Arbitrary<Issue[]> =>
  fc.array(
    fc.oneof(
      nonCriticalIssueGenerator(),
      resolvedCriticalIssueGenerator()
    ),
    { minLength: 0, maxLength: 10 }
  );

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 2: Blocking Condition Enforcement', () => {
  
  it('should identify critical unresolved issues as blocking', async () => {
    await fc.assert(
      fc.property(
        criticalUnresolvedIssueGenerator(),
        (issue) => {
          // Critical issues with unresolved status should be blocking
          expect(isCriticalUnresolved(issue)).toBe(true);
          
          // Verify the conditions
          expect(issue.severity).toBe('critical');
          expect(['verified', 'closed', 'escalated']).not.toContain(issue.status);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not identify resolved/escalated critical issues as blocking', async () => {
    await fc.assert(
      fc.property(
        resolvedCriticalIssueGenerator(),
        (issue) => {
          // Critical issues that are resolved/escalated should NOT be blocking
          expect(isCriticalUnresolved(issue)).toBe(false);
          
          // Verify the conditions
          expect(issue.severity).toBe('critical');
          expect(['verified', 'closed', 'escalated']).toContain(issue.status);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not identify non-critical issues as blocking regardless of status', async () => {
    await fc.assert(
      fc.property(
        nonCriticalIssueGenerator(),
        (issue) => {
          // Non-critical issues should never be blocking
          expect(isCriticalUnresolved(issue)).toBe(false);
          
          // Verify the condition
          expect(issue.severity).not.toBe('critical');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should prevent progression when blocking issues exist', async () => {
    await fc.assert(
      fc.property(
        issuesWithBlockingGenerator(),
        (issues) => {
          // Should have blocking issues
          expect(hasBlockingIssues(issues)).toBe(true);
          
          // Should NOT be able to proceed
          expect(canProceedToControlsManagement(issues)).toBe(false);
          
          // Blocking issues should be non-empty
          const blocking = getBlockingIssues(issues);
          expect(blocking.length).toBeGreaterThan(0);
          
          // All blocking issues should be critical and unresolved
          for (const issue of blocking) {
            expect(issue.severity).toBe('critical');
            expect(['verified', 'closed', 'escalated']).not.toContain(issue.status);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow progression when no blocking issues exist', async () => {
    await fc.assert(
      fc.property(
        issuesWithoutBlockingGenerator(),
        (issues) => {
          // Should NOT have blocking issues
          expect(hasBlockingIssues(issues)).toBe(false);
          
          // Should be able to proceed
          expect(canProceedToControlsManagement(issues)).toBe(true);
          
          // Blocking issues should be empty
          const blocking = getBlockingIssues(issues);
          expect(blocking.length).toBe(0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow progression after resolving all critical issues', async () => {
    await fc.assert(
      fc.property(
        issuesWithBlockingGenerator(),
        (issues) => {
          // Initially should have blocking issues
          expect(hasBlockingIssues(issues)).toBe(true);
          expect(canProceedToControlsManagement(issues)).toBe(false);
          
          // Resolve all critical unresolved issues
          const resolvedIssues = issues.map(issue => 
            isCriticalUnresolved(issue) ? resolveIssue(issue) : issue
          );
          
          // After resolution, should be able to proceed
          expect(hasBlockingIssues(resolvedIssues)).toBe(false);
          expect(canProceedToControlsManagement(resolvedIssues)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow progression after escalating all critical issues', async () => {
    await fc.assert(
      fc.property(
        issuesWithBlockingGenerator(),
        (issues) => {
          // Initially should have blocking issues
          expect(hasBlockingIssues(issues)).toBe(true);
          expect(canProceedToControlsManagement(issues)).toBe(false);
          
          // Escalate all critical unresolved issues
          const escalatedIssues = issues.map(issue => 
            isCriticalUnresolved(issue) ? escalateIssue(issue, 'Escalated for management review') : issue
          );
          
          // After escalation, should be able to proceed
          expect(hasBlockingIssues(escalatedIssues)).toBe(false);
          expect(canProceedToControlsManagement(escalatedIssues)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow progression after closing all critical issues', async () => {
    await fc.assert(
      fc.property(
        issuesWithBlockingGenerator(),
        (issues) => {
          // Initially should have blocking issues
          expect(hasBlockingIssues(issues)).toBe(true);
          
          // Close all critical unresolved issues
          const closedIssues = issues.map(issue => 
            isCriticalUnresolved(issue) ? closeIssue(issue) : issue
          );
          
          // After closing, should be able to proceed
          expect(hasBlockingIssues(closedIssues)).toBe(false);
          expect(canProceedToControlsManagement(closedIssues)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should correctly count blocking issues', async () => {
    await fc.assert(
      fc.property(
        fc.array(issueGenerator(), { minLength: 0, maxLength: 20 }),
        (issues) => {
          const blockingIssues = getBlockingIssues(issues);
          const manualCount = issues.filter(i => 
            i.severity === 'critical' && 
            !['verified', 'closed', 'escalated'].includes(i.status)
          ).length;
          
          expect(blockingIssues.length).toBe(manualCount);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should maintain blocking status consistency', async () => {
    await fc.assert(
      fc.property(
        fc.array(issueGenerator(), { minLength: 1, maxLength: 20 }),
        (issues) => {
          const hasBlocking = hasBlockingIssues(issues);
          const canProceed = canProceedToControlsManagement(issues);
          const blockingList = getBlockingIssues(issues);
          
          // Invariant: hasBlocking === !canProceed
          expect(hasBlocking).toBe(!canProceed);
          
          // Invariant: hasBlocking === (blockingList.length > 0)
          expect(hasBlocking).toBe(blockingList.length > 0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should handle empty issues list', () => {
    const issues: Issue[] = [];
    
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(canProceedToControlsManagement(issues)).toBe(true);
    expect(getBlockingIssues(issues)).toEqual([]);
  });

  it('should correctly identify blocking status for each issue status', () => {
    const statuses: IssueStatus[] = [
      'open',
      'triaged',
      'analyzing',
      'resolving',
      'pending_verification',
      'verified',
      'closed',
      'escalated',
    ];
    
    const blockingStatuses = ['open', 'triaged', 'analyzing', 'resolving', 'pending_verification'];
    const nonBlockingStatuses = ['verified', 'closed', 'escalated'];
    
    for (const status of statuses) {
      const issue: Issue = {
        id: 'test-id',
        title: 'Test Issue',
        description: 'Test description',
        source: 'dq_rule_failure',
        severity: 'critical',
        status,
        priority: 1,
        impactedCDEs: [],
        impactedReports: [],
        createdAt: new Date().toISOString(),
        escalationLevel: 0,
        isBlocking: true,
      };
      
      if (blockingStatuses.includes(status)) {
        expect(isCriticalUnresolved(issue)).toBe(true);
      } else {
        expect(isCriticalUnresolved(issue)).toBe(false);
      }
    }
  });
});

