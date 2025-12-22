/**
 * Common test generators for property-based testing
 */

import fc from 'fast-check';
import {
  ActorType,
  Severity,
  IssueStatus,
  ArtifactStatus,
  CDEStatus,
  TaskStatus,
  TaskType
} from '../../types/index.js';

export const actorTypeGenerator = (): fc.Arbitrary<ActorType> =>
  fc.constantFrom('agent', 'human', 'system');

export const severityGenerator = (): fc.Arbitrary<Severity> =>
  fc.constantFrom('critical', 'high', 'medium', 'low');

export const issueStatusGenerator = (): fc.Arbitrary<IssueStatus> =>
  fc.constantFrom('open', 'in_progress', 'pending_verification', 'resolved', 'closed');

export const artifactStatusGenerator = (): fc.Arbitrary<ArtifactStatus> =>
  fc.constantFrom('draft', 'pending_review', 'approved', 'rejected');

export const cdeStatusGenerator = (): fc.Arbitrary<CDEStatus> =>
  fc.constantFrom('pending_approval', 'approved', 'rejected');

export const taskStatusGenerator = (): fc.Arbitrary<TaskStatus> =>
  fc.constantFrom('pending', 'in_progress', 'completed', 'escalated');

export const taskTypeGenerator = (): fc.Arbitrary<TaskType> =>
  fc.constantFrom(
    'catalog_review',
    'requirements_validation',
    'cde_approval',
    'rule_review',
    'lineage_validation',
    'issue_resolution_confirmation',
    'submission_approval',
    'attestation'
  );

export const nonEmptyStringGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 });

export const emailGenerator = (): fc.Arbitrary<string> =>
  fc.emailAddress();

export const dateGenerator = (): fc.Arbitrary<Date> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

export const issueGenerator = () => 
  fc.record({
    id: fc.uuid(),
    title: nonEmptyStringGenerator(),
    description: nonEmptyStringGenerator(),
    source: nonEmptyStringGenerator(),
    impactedReports: fc.array(fc.uuid(), { maxLength: 5 }),
    impactedCDEs: fc.array(fc.uuid(), { maxLength: 10 }),
    severity: severityGenerator(),
    status: issueStatusGenerator(),
    createdAt: dateGenerator(),
    dueDate: fc.option(dateGenerator()),
    assignee: fc.option(nonEmptyStringGenerator()),
    rootCause: fc.option(nonEmptyStringGenerator())
  });
