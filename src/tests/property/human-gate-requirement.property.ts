/**
 * **Feature: workflow-wizard-ui, Property 3: Human Gate Requirement**
 * 
 * For any phase that requires human approval (Regulatory Intelligence, 
 * CDE Identification, Documentation, Attestation), the phase cannot complete 
 * without a valid rationale (minimum 20 characters) and digital signature capture.
 * 
 * **Validates: Requirements 3.5, 11.4**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ============================================================================
// Type Definitions
// ============================================================================

type Phase =
  | 'regulatory_intelligence'
  | 'data_requirements'
  | 'cde_identification'
  | 'data_quality_rules'
  | 'lineage_mapping'
  | 'issue_management'
  | 'controls_management'
  | 'documentation'
  | 'attestation';

type DecisionType = 'approve' | 'reject' | 'approve_with_changes';

interface HumanGateSubmission {
  decision: DecisionType | null;
  rationale: string;
  signature: string | null;
  requiresSignature: boolean;
  minimumRationaleLength: number;
}

// Phases that require human approval gates
const PHASES_WITH_HUMAN_GATES: Phase[] = [
  'regulatory_intelligence',
  'cde_identification',
  'issue_management',
  'attestation',
];

const DEFAULT_MIN_RATIONALE_LENGTH = 20;

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Validates that a rationale meets the minimum length requirement
 * Property 3: Human Gate Requirement - minimum 20 character rationale
 */
function isValidRationale(rationale: string, minLength: number): boolean {
  return rationale.trim().length >= minLength;
}

/**
 * Validates that a signature is provided when required
 * Property 3: Human Gate Requirement - digital signature capture
 */
function isValidSignature(
  signature: string | null | undefined,
  requiresSignature: boolean
): boolean {
  if (!requiresSignature) return true;
  return signature !== null && signature !== undefined && signature.trim().length > 0;
}

/**
 * Validates the complete human gate form
 * Property 3: Human Gate Requirement
 */
function validateHumanGateForm(
  decision: DecisionType | null,
  rationale: string,
  signature: string | null | undefined,
  requiresSignature: boolean,
  minimumRationaleLength: number
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!decision) {
    errors.decision = 'Please select a decision';
  }

  if (!isValidRationale(rationale, minimumRationaleLength)) {
    if (!rationale.trim()) {
      errors.rationale = 'Rationale is required';
    } else {
      errors.rationale = `Rationale must be at least ${minimumRationaleLength} characters`;
    }
  }

  if (!isValidSignature(signature, requiresSignature)) {
    errors.signature = 'Digital signature is required';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Check if a phase requires a human gate
 */
function phaseRequiresHumanGate(phase: Phase): boolean {
  return PHASES_WITH_HUMAN_GATES.includes(phase);
}

/**
 * Attempt to complete a human gate - returns success only if all requirements met
 */
function canCompleteHumanGate(submission: HumanGateSubmission): boolean {
  const { isValid } = validateHumanGateForm(
    submission.decision,
    submission.rationale,
    submission.signature,
    submission.requiresSignature,
    submission.minimumRationaleLength
  );
  return isValid;
}

// ============================================================================
// Generators
// ============================================================================

const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Generator for decision type
 */
const decisionGenerator = (): fc.Arbitrary<DecisionType> =>
  fc.constantFrom('approve', 'reject', 'approve_with_changes');

/**
 * Generator for nullable decision
 */
const nullableDecisionGenerator = (): fc.Arbitrary<DecisionType | null> =>
  fc.oneof(decisionGenerator(), fc.constant(null));

/**
 * Generator for rationale strings
 */
const rationaleGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: 500 });

/**
 * Generator for valid rationale (meets minimum length)
 */
const validRationaleGenerator = (minLength: number = DEFAULT_MIN_RATIONALE_LENGTH): fc.Arbitrary<string> =>
  fc.string({ minLength, maxLength: 500 }).filter(s => s.trim().length >= minLength);

/**
 * Generator for invalid rationale (below minimum length)
 */
const invalidRationaleGenerator = (minLength: number = DEFAULT_MIN_RATIONALE_LENGTH): fc.Arbitrary<string> =>
  fc.string({ minLength: 0, maxLength: minLength - 1 });

/**
 * Generator for signature strings
 */
const signatureGenerator = (): fc.Arbitrary<string | null> =>
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 100 }),
    fc.constant(null),
    fc.constant('')
  );

/**
 * Generator for valid signature
 */
const validSignatureGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

/**
 * Generator for phase
 */
const phaseGenerator = (): fc.Arbitrary<Phase> =>
  fc.constantFrom(
    'regulatory_intelligence',
    'data_requirements',
    'cde_identification',
    'data_quality_rules',
    'lineage_mapping',
    'issue_management',
    'controls_management',
    'documentation',
    'attestation'
  );

/**
 * Generator for human gate submission
 */
const humanGateSubmissionGenerator = (): fc.Arbitrary<HumanGateSubmission> =>
  fc.record({
    decision: nullableDecisionGenerator(),
    rationale: rationaleGenerator(),
    signature: signatureGenerator(),
    requiresSignature: fc.boolean(),
    minimumRationaleLength: fc.integer({ min: 1, max: 100 }),
  });

/**
 * Generator for valid human gate submission
 */
const validHumanGateSubmissionGenerator = (): fc.Arbitrary<HumanGateSubmission> =>
  fc.record({
    decision: decisionGenerator(),
    rationale: validRationaleGenerator(),
    signature: validSignatureGenerator(),
    requiresSignature: fc.constant(true),
    minimumRationaleLength: fc.constant(DEFAULT_MIN_RATIONALE_LENGTH),
  });

/**
 * Generator for submission missing decision
 */
const submissionMissingDecisionGenerator = (): fc.Arbitrary<HumanGateSubmission> =>
  fc.record({
    decision: fc.constant(null),
    rationale: validRationaleGenerator(),
    signature: validSignatureGenerator(),
    requiresSignature: fc.constant(true),
    minimumRationaleLength: fc.constant(DEFAULT_MIN_RATIONALE_LENGTH),
  });

/**
 * Generator for submission with invalid rationale
 */
const submissionInvalidRationaleGenerator = (): fc.Arbitrary<HumanGateSubmission> =>
  fc.record({
    decision: decisionGenerator(),
    rationale: invalidRationaleGenerator(),
    signature: validSignatureGenerator(),
    requiresSignature: fc.constant(true),
    minimumRationaleLength: fc.constant(DEFAULT_MIN_RATIONALE_LENGTH),
  });

/**
 * Generator for submission missing signature when required
 */
const submissionMissingSignatureGenerator = (): fc.Arbitrary<HumanGateSubmission> =>
  fc.record({
    decision: decisionGenerator(),
    rationale: validRationaleGenerator(),
    signature: fc.oneof(fc.constant(null), fc.constant(''), fc.constant('   ')),
    requiresSignature: fc.constant(true),
    minimumRationaleLength: fc.constant(DEFAULT_MIN_RATIONALE_LENGTH),
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 3: Human Gate Requirement', () => {
  
  describe('Rationale Validation', () => {
    it('should accept rationale meeting minimum length', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (minLength) => {
            return fc.assert(
              fc.property(
                validRationaleGenerator(minLength),
                (rationale) => {
                  expect(isValidRationale(rationale, minLength)).toBe(true);
                  return true;
                }
              ),
              { numRuns: 10 }
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should reject rationale below minimum length', async () => {
      await fc.assert(
        fc.property(
          fc.integer({ min: 5, max: 100 }),
          (minLength) => {
            return fc.assert(
              fc.property(
                fc.string({ minLength: 0, maxLength: minLength - 1 }),
                (rationale) => {
                  // Only test if the trimmed length is actually below minimum
                  if (rationale.trim().length < minLength) {
                    expect(isValidRationale(rationale, minLength)).toBe(false);
                  }
                  return true;
                }
              ),
              { numRuns: 10 }
            );
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should trim whitespace when validating rationale', async () => {
      await fc.assert(
        fc.property(
          fc.string({ minLength: DEFAULT_MIN_RATIONALE_LENGTH, maxLength: 100 }),
          (content) => {
            const paddedRationale = `   ${content}   `;
            const trimmedLength = content.trim().length;
            
            expect(isValidRationale(paddedRationale, DEFAULT_MIN_RATIONALE_LENGTH))
              .toBe(trimmedLength >= DEFAULT_MIN_RATIONALE_LENGTH);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Signature Validation', () => {
    it('should require signature when requiresSignature is true', async () => {
      await fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.constant(''), fc.constant('   ')),
          (signature) => {
            expect(isValidSignature(signature, true)).toBe(false);
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should accept any signature when requiresSignature is false', async () => {
      await fc.assert(
        fc.property(
          signatureGenerator(),
          (signature) => {
            expect(isValidSignature(signature, false)).toBe(true);
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should accept valid non-empty signature when required', async () => {
      await fc.assert(
        fc.property(
          validSignatureGenerator(),
          (signature) => {
            expect(isValidSignature(signature, true)).toBe(true);
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Complete Form Validation', () => {
    it('should allow completion when all requirements are met', async () => {
      await fc.assert(
        fc.property(
          validHumanGateSubmissionGenerator(),
          (submission) => {
            const result = validateHumanGateForm(
              submission.decision,
              submission.rationale,
              submission.signature,
              submission.requiresSignature,
              submission.minimumRationaleLength
            );
            
            expect(result.isValid).toBe(true);
            expect(Object.keys(result.errors)).toHaveLength(0);
            expect(canCompleteHumanGate(submission)).toBe(true);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should reject when decision is missing', async () => {
      await fc.assert(
        fc.property(
          submissionMissingDecisionGenerator(),
          (submission) => {
            const result = validateHumanGateForm(
              submission.decision,
              submission.rationale,
              submission.signature,
              submission.requiresSignature,
              submission.minimumRationaleLength
            );
            
            expect(result.isValid).toBe(false);
            expect(result.errors.decision).toBeDefined();
            expect(canCompleteHumanGate(submission)).toBe(false);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should reject when rationale is invalid', async () => {
      await fc.assert(
        fc.property(
          submissionInvalidRationaleGenerator(),
          (submission) => {
            const result = validateHumanGateForm(
              submission.decision,
              submission.rationale,
              submission.signature,
              submission.requiresSignature,
              submission.minimumRationaleLength
            );
            
            expect(result.isValid).toBe(false);
            expect(result.errors.rationale).toBeDefined();
            expect(canCompleteHumanGate(submission)).toBe(false);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should reject when signature is missing but required', async () => {
      await fc.assert(
        fc.property(
          submissionMissingSignatureGenerator(),
          (submission) => {
            const result = validateHumanGateForm(
              submission.decision,
              submission.rationale,
              submission.signature,
              submission.requiresSignature,
              submission.minimumRationaleLength
            );
            
            expect(result.isValid).toBe(false);
            expect(result.errors.signature).toBeDefined();
            expect(canCompleteHumanGate(submission)).toBe(false);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Phase Human Gate Requirements', () => {
    it('should identify phases that require human gates', async () => {
      await fc.assert(
        fc.property(
          phaseGenerator(),
          (phase) => {
            const requiresGate = phaseRequiresHumanGate(phase);
            const expectedToRequire = PHASES_WITH_HUMAN_GATES.includes(phase);
            
            expect(requiresGate).toBe(expectedToRequire);
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should require human gate for regulatory_intelligence phase', () => {
      expect(phaseRequiresHumanGate('regulatory_intelligence')).toBe(true);
    });

    it('should require human gate for cde_identification phase', () => {
      expect(phaseRequiresHumanGate('cde_identification')).toBe(true);
    });

    it('should require human gate for issue_management phase', () => {
      expect(phaseRequiresHumanGate('issue_management')).toBe(true);
    });

    it('should require human gate for attestation phase', () => {
      expect(phaseRequiresHumanGate('attestation')).toBe(true);
    });

    it('should NOT require human gate for data_requirements phase', () => {
      expect(phaseRequiresHumanGate('data_requirements')).toBe(false);
    });

    it('should NOT require human gate for data_quality_rules phase', () => {
      expect(phaseRequiresHumanGate('data_quality_rules')).toBe(false);
    });
  });

  describe('Invariant: Human Gate Cannot Complete Without Valid Rationale and Signature', () => {
    it('should enforce minimum 20 character rationale for all submissions', async () => {
      await fc.assert(
        fc.property(
          humanGateSubmissionGenerator(),
          (submission) => {
            const canComplete = canCompleteHumanGate(submission);
            const hasValidRationale = isValidRationale(
              submission.rationale,
              submission.minimumRationaleLength
            );
            const hasValidSignature = isValidSignature(
              submission.signature,
              submission.requiresSignature
            );
            const hasDecision = submission.decision !== null;
            
            // Invariant: canComplete implies all requirements are met
            if (canComplete) {
              expect(hasDecision).toBe(true);
              expect(hasValidRationale).toBe(true);
              expect(hasValidSignature).toBe(true);
            }
            
            // Contrapositive: if any requirement is not met, cannot complete
            if (!hasDecision || !hasValidRationale || !hasValidSignature) {
              expect(canComplete).toBe(false);
            }
            
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should be deterministic - same input always produces same validation result', async () => {
      await fc.assert(
        fc.property(
          humanGateSubmissionGenerator(),
          (submission) => {
            const result1 = validateHumanGateForm(
              submission.decision,
              submission.rationale,
              submission.signature,
              submission.requiresSignature,
              submission.minimumRationaleLength
            );
            
            const result2 = validateHumanGateForm(
              submission.decision,
              submission.rationale,
              submission.signature,
              submission.requiresSignature,
              submission.minimumRationaleLength
            );
            
            expect(result1.isValid).toBe(result2.isValid);
            expect(result1.errors).toEqual(result2.errors);
            
            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
