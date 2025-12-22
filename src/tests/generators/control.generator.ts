/**
 * Property-based test generators for Control entities
 */

import fc from 'fast-check';
import { 
  Control, 
  ControlEvidence, 
  ControlMatrix,
  ControlType,
  ControlCategory,
  ControlStatus,
  AutomationStatus,
  ControlEvidenceOutcome,
  ReportFrequency
} from '../../types/controls.js';

/**
 * Generator for valid control types
 */
export const controlTypeGenerator = (): fc.Arbitrary<ControlType> => {
  return fc.constantFrom('organizational', 'process', 'access', 'change_management');
};

/**
 * Generator for valid control categories
 */
export const controlCategoryGenerator = (): fc.Arbitrary<ControlCategory> => {
  return fc.constantFrom('preventive', 'detective');
};

/**
 * Generator for valid control statuses
 */
export const controlStatusGenerator = (): fc.Arbitrary<ControlStatus> => {
  return fc.constantFrom('active', 'inactive', 'compensating');
};

/**
 * Generator for valid automation statuses
 */
export const automationStatusGenerator = (): fc.Arbitrary<AutomationStatus> => {
  return fc.constantFrom('manual', 'semi_automated', 'fully_automated');
};

/**
 * Generator for valid control evidence outcomes
 */
export const controlEvidenceOutcomeGenerator = (): fc.Arbitrary<ControlEvidenceOutcome> => {
  return fc.constantFrom('pass', 'fail', 'exception');
};

/**
 * Generator for report frequencies
 */
export const reportFrequencyGenerator = (): fc.Arbitrary<ReportFrequency> => {
  return fc.constantFrom('daily', 'weekly', 'monthly', 'quarterly', 'annual');
};

/**
 * Generator for control evidence
 */
export const controlEvidenceGenerator = (): fc.Arbitrary<ControlEvidence> => {
  return fc.record({
    id: fc.uuid(),
    controlId: fc.uuid(),
    executionDate: fc.date(),
    outcome: controlEvidenceOutcomeGenerator(),
    details: fc.string({ minLength: 1, maxLength: 500 }),
    executedBy: fc.string({ minLength: 1, maxLength: 100 })
  });
};

/**
 * Generator for valid controls (all fields valid)
 */
export const validControlGenerator = (): fc.Arbitrary<Control> => {
  return fc.oneof(
    // Non-compensating controls
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 200 }),
      description: fc.string({ minLength: 1, maxLength: 1000 }),
      type: controlTypeGenerator(),
      category: controlCategoryGenerator(),
      owner: fc.string({ minLength: 1, maxLength: 100 }),
      frequency: fc.oneof(reportFrequencyGenerator(), fc.constant('continuous' as const)),
      linkedCDEs: fc.array(fc.uuid(), { maxLength: 10 }),
      linkedProcesses: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
      automationStatus: automationStatusGenerator(),
      ruleId: fc.option(fc.uuid()),
      status: fc.constantFrom('active', 'inactive'), // Only non-compensating statuses
      expirationDate: fc.option(fc.date()),
      linkedIssueId: fc.option(fc.uuid()),
      evidence: fc.array(controlEvidenceGenerator(), { maxLength: 10 })
    }),
    // Valid compensating controls
    compensatingControlGenerator()
  );
};

/**
 * Generator for compensating controls (must have linkedIssueId and expirationDate)
 */
export const compensatingControlGenerator = (): fc.Arbitrary<Control> => {
  return fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 200 }),
    description: fc.string({ minLength: 1, maxLength: 1000 }),
    type: controlTypeGenerator(),
    category: controlCategoryGenerator(),
    owner: fc.string({ minLength: 1, maxLength: 100 }),
    frequency: fc.oneof(reportFrequencyGenerator(), fc.constant('continuous' as const)),
    linkedCDEs: fc.array(fc.uuid(), { maxLength: 10 }),
    linkedProcesses: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
    automationStatus: automationStatusGenerator(),
    ruleId: fc.option(fc.uuid()),
    status: fc.constant('compensating' as const),
    expirationDate: fc.date(),
    linkedIssueId: fc.uuid(),
    evidence: fc.array(controlEvidenceGenerator(), { maxLength: 10 })
  });
};

/**
 * Generator for controls with invalid types (for negative testing)
 */
export const invalidControlTypeGenerator = (): fc.Arbitrary<string> => {
  return fc.string().filter(s => 
    !['organizational', 'process', 'access', 'change_management'].includes(s)
  );
};

/**
 * Generator for controls with invalid categories (for negative testing)
 */
export const invalidControlCategoryGenerator = (): fc.Arbitrary<string> => {
  return fc.string().filter(s => 
    !['preventive', 'detective'].includes(s)
  );
};

/**
 * Generator for control matrix with properly configured compensating controls
 */
export const controlMatrixGenerator = (): fc.Arbitrary<ControlMatrix> => {
  return fc.record({
    id: fc.uuid(),
    reportId: fc.uuid(),
    controls: fc.array(
      fc.oneof(
        // Regular controls (not compensating)
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 200 }),
          description: fc.string({ minLength: 1, maxLength: 1000 }),
          type: controlTypeGenerator(),
          category: controlCategoryGenerator(),
          owner: fc.string({ minLength: 1, maxLength: 100 }),
          frequency: fc.oneof(reportFrequencyGenerator(), fc.constant('continuous' as const)),
          linkedCDEs: fc.array(fc.uuid(), { maxLength: 10 }),
          linkedProcesses: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
          automationStatus: automationStatusGenerator(),
          ruleId: fc.option(fc.uuid()),
          status: fc.constantFrom('active', 'inactive'), // No compensating controls here
          expirationDate: fc.option(fc.date()),
          linkedIssueId: fc.option(fc.uuid()),
          evidence: fc.array(controlEvidenceGenerator(), { maxLength: 10 })
        }),
        // Properly configured compensating controls
        compensatingControlGenerator()
      ),
      { maxLength: 20 }
    ),
    version: fc.integer({ min: 1, max: 100 }),
    lastReviewed: fc.date(),
    reviewedBy: fc.string({ minLength: 1, maxLength: 100 })
  });
};

/**
 * Generator for control with invalid compensating control setup
 */
export const invalidCompensatingControlGenerator = (): fc.Arbitrary<Control> => {
  return fc.oneof(
    // Missing linkedIssueId
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 200 }),
      description: fc.string({ minLength: 1, maxLength: 1000 }),
      type: controlTypeGenerator(),
      category: controlCategoryGenerator(),
      owner: fc.string({ minLength: 1, maxLength: 100 }),
      frequency: fc.oneof(reportFrequencyGenerator(), fc.constant('continuous' as const)),
      linkedCDEs: fc.array(fc.uuid(), { maxLength: 10 }),
      linkedProcesses: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
      automationStatus: automationStatusGenerator(),
      ruleId: fc.option(fc.uuid()),
      status: fc.constant('compensating' as const),
      expirationDate: fc.date(),
      linkedIssueId: fc.constant(undefined),
      evidence: fc.array(controlEvidenceGenerator(), { maxLength: 10 })
    }),
    // Missing expirationDate
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 200 }),
      description: fc.string({ minLength: 1, maxLength: 1000 }),
      type: controlTypeGenerator(),
      category: controlCategoryGenerator(),
      owner: fc.string({ minLength: 1, maxLength: 100 }),
      frequency: fc.oneof(reportFrequencyGenerator(), fc.constant('continuous' as const)),
      linkedCDEs: fc.array(fc.uuid(), { maxLength: 10 }),
      linkedProcesses: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 5 }),
      automationStatus: automationStatusGenerator(),
      ruleId: fc.option(fc.uuid()),
      status: fc.constant('compensating' as const),
      expirationDate: fc.constant(undefined),
      linkedIssueId: fc.uuid(),
      evidence: fc.array(controlEvidenceGenerator(), { maxLength: 10 })
    })
  );
};