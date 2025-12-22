/**
 * **Feature: workflow-wizard-ui, Property 10: Validation Error Completeness**
 * 
 * For any phase transition attempt that fails validation, the error modal 
 * shall contain exactly the set of incomplete required items, with no 
 * false positives or false negatives.
 * 
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ============================================================================
// Type Definitions (mirroring frontend types for testing)
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

type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';
type StepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

interface StepState {
  id: string;
  name: string;
  status: StepStatus;
  isRequired: boolean;
  validationErrors: string[];
  data: Record<string, unknown>;
}

interface PhaseState {
  id: Phase;
  name: string;
  description: string;
  estimatedMinutes: number;
  status: PhaseStatus;
  blockingReason?: string;
  steps: StepState[];
}

interface ValidationError {
  field: string;
  message: string;
  stepId?: string;
}

interface ValidationResult {
  isValid: boolean;
  incompleteItems: StepState[];
  validationErrors: ValidationError[];
}

const PHASE_ORDER: Phase[] = [
  'regulatory_intelligence',
  'data_requirements',
  'cde_identification',
  'lineage_mapping',
  'data_quality_rules',
  'issue_management',
  'controls_management',
  'documentation',
  'attestation',
];

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Get all incomplete required items in a phase
 * These are items that should appear in the validation error modal
 */
function getIncompleteRequiredItems(phase: PhaseState): StepState[] {
  return phase.steps.filter(
    step => step.isRequired && step.status !== 'completed'
  );
}

/**
 * Get all steps with validation errors
 */
function getStepsWithValidationErrors(phase: PhaseState): StepState[] {
  return phase.steps.filter(step => step.validationErrors.length > 0);
}

/**
 * Get all validation errors from a phase
 */
function getPhaseValidationErrors(phase: PhaseState): ValidationError[] {
  return phase.steps.flatMap(step =>
    step.validationErrors.map(message => ({
      field: step.id,
      message,
      stepId: step.id,
    }))
  );
}

/**
 * Validate a phase transition attempt
 * Property 10: Returns exactly the set of incomplete items with no false positives/negatives
 */
function validatePhaseTransition(phase: PhaseState): ValidationResult {
  const incompleteItems = getIncompleteRequiredItems(phase);
  const stepsWithErrors = getStepsWithValidationErrors(phase);
  const validationErrors = getPhaseValidationErrors(phase);
  
  // Combine incomplete items and steps with errors (avoiding duplicates)
  const allProblematicSteps = new Map<string, StepState>();
  
  for (const step of incompleteItems) {
    allProblematicSteps.set(step.id, step);
  }
  
  for (const step of stepsWithErrors) {
    allProblematicSteps.set(step.id, step);
  }
  
  const isValid = incompleteItems.length === 0 && validationErrors.length === 0;
  
  return {
    isValid,
    incompleteItems: Array.from(allProblematicSteps.values()),
    validationErrors,
  };
}

/**
 * Check if a step should be flagged as problematic
 */
function shouldStepBeFlagged(step: StepState): boolean {
  return (step.isRequired && step.status !== 'completed') || 
         step.validationErrors.length > 0;
}

/**
 * Verify validation result completeness
 * No false positives: every item in result is actually problematic
 * No false negatives: every problematic item is in result
 */
function verifyValidationCompleteness(
  phase: PhaseState,
  result: ValidationResult
): { noFalsePositives: boolean; noFalseNegatives: boolean } {
  // Check for false positives: items in result that shouldn't be there
  const noFalsePositives = result.incompleteItems.every(item => {
    const originalStep = phase.steps.find(s => s.id === item.id);
    return originalStep && shouldStepBeFlagged(originalStep);
  });
  
  // Check for false negatives: problematic items not in result
  const problematicStepIds = new Set(
    phase.steps.filter(shouldStepBeFlagged).map(s => s.id)
  );
  const resultStepIds = new Set(result.incompleteItems.map(s => s.id));
  
  const noFalseNegatives = [...problematicStepIds].every(id => resultStepIds.has(id));
  
  return { noFalsePositives, noFalseNegatives };
}

// ============================================================================
// Generators
// ============================================================================

const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Generator for step status
 */
const stepStatusGenerator = (): fc.Arbitrary<StepStatus> =>
  fc.constantFrom('pending', 'in_progress', 'completed', 'skipped');

/**
 * Generator for phase
 */
const phaseGenerator = (): fc.Arbitrary<Phase> =>
  fc.constantFrom(...PHASE_ORDER);

/**
 * Generator for validation errors
 */
const validationErrorsGenerator = (): fc.Arbitrary<string[]> =>
  fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 3 });

/**
 * Generator for a single step
 */
const stepGenerator = (): fc.Arbitrary<StepState> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    status: stepStatusGenerator(),
    isRequired: fc.boolean(),
    validationErrors: validationErrorsGenerator(),
    data: fc.constant({} as Record<string, unknown>),
  });

/**
 * Generator for a phase with steps
 */
const phaseStateGenerator = (): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: phaseGenerator(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 200 }),
    estimatedMinutes: fc.integer({ min: 5, max: 120 }),
    status: fc.constantFrom('pending', 'in_progress', 'completed', 'blocked') as fc.Arbitrary<PhaseStatus>,
    steps: fc.array(stepGenerator(), { minLength: 1, maxLength: 8 }),
  });

/**
 * Generator for a phase with known incomplete required steps
 */
const phaseWithIncompleteStepsGenerator = (): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: phaseGenerator(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 200 }),
    estimatedMinutes: fc.integer({ min: 5, max: 120 }),
    status: fc.constant('in_progress' as PhaseStatus),
    steps: fc.tuple(
      // At least one incomplete required step
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        status: fc.constantFrom('pending', 'in_progress') as fc.Arbitrary<StepStatus>,
        isRequired: fc.constant(true),
        validationErrors: fc.constant([] as string[]),
        data: fc.constant({} as Record<string, unknown>),
      }),
      // Additional steps
      fc.array(stepGenerator(), { minLength: 0, maxLength: 5 })
    ).map(([required, others]) => [required, ...others]),
  });

/**
 * Generator for a phase with known validation errors
 */
const phaseWithValidationErrorsGenerator = (): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: phaseGenerator(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 200 }),
    estimatedMinutes: fc.integer({ min: 5, max: 120 }),
    status: fc.constant('in_progress' as PhaseStatus),
    steps: fc.tuple(
      // At least one step with validation errors
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        status: stepStatusGenerator(),
        isRequired: fc.boolean(),
        validationErrors: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
        data: fc.constant({} as Record<string, unknown>),
      }),
      // Additional steps
      fc.array(stepGenerator(), { minLength: 0, maxLength: 5 })
    ).map(([withErrors, others]) => [withErrors, ...others]),
  });

/**
 * Generator for a valid phase (all required complete, no errors)
 */
const validPhaseGenerator = (): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: phaseGenerator(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    description: fc.string({ minLength: 0, maxLength: 200 }),
    estimatedMinutes: fc.integer({ min: 5, max: 120 }),
    status: fc.constant('in_progress' as PhaseStatus),
    steps: fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        status: fc.constant('completed' as StepStatus),
        isRequired: fc.boolean(),
        validationErrors: fc.constant([] as string[]),
        data: fc.constant({} as Record<string, unknown>),
      }),
      { minLength: 1, maxLength: 6 }
    ),
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 10: Validation Error Completeness', () => {
  
  it('should return exactly the set of incomplete required items (no false positives or negatives)', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          const { noFalsePositives, noFalseNegatives } = verifyValidationCompleteness(phase, result);
          
          // Property 10: No false positives or false negatives
          expect(noFalsePositives).toBe(true);
          expect(noFalseNegatives).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should include all incomplete required steps in validation result', async () => {
    await fc.assert(
      fc.property(
        phaseWithIncompleteStepsGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Should not be valid
          expect(result.isValid).toBe(false);
          
          // All incomplete required steps should be in the result
          const incompleteRequired = phase.steps.filter(
            s => s.isRequired && s.status !== 'completed'
          );
          
          for (const step of incompleteRequired) {
            const found = result.incompleteItems.find(item => item.id === step.id);
            expect(found).toBeDefined();
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should include all steps with validation errors in result', async () => {
    await fc.assert(
      fc.property(
        phaseWithValidationErrorsGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Should not be valid
          expect(result.isValid).toBe(false);
          
          // All steps with errors should be in the result
          const stepsWithErrors = phase.steps.filter(s => s.validationErrors.length > 0);
          
          for (const step of stepsWithErrors) {
            const found = result.incompleteItems.find(item => item.id === step.id);
            expect(found).toBeDefined();
          }
          
          // All validation errors should be in the result
          const totalErrors = phase.steps.reduce(
            (sum, s) => sum + s.validationErrors.length, 0
          );
          expect(result.validationErrors.length).toBe(totalErrors);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should return empty incomplete items for valid phases', async () => {
    await fc.assert(
      fc.property(
        validPhaseGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Should be valid
          expect(result.isValid).toBe(true);
          
          // No incomplete items
          expect(result.incompleteItems.length).toBe(0);
          
          // No validation errors
          expect(result.validationErrors.length).toBe(0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not include completed required steps in incomplete items', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // No completed required step should be in incomplete items
          // (unless it has validation errors)
          for (const item of result.incompleteItems) {
            const originalStep = phase.steps.find(s => s.id === item.id);
            if (originalStep && originalStep.status === 'completed') {
              // If completed but in result, must have validation errors
              expect(originalStep.validationErrors.length).toBeGreaterThan(0);
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not include optional incomplete steps without errors', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Optional incomplete steps without errors should NOT be in result
          for (const item of result.incompleteItems) {
            const originalStep = phase.steps.find(s => s.id === item.id);
            if (originalStep && !originalStep.isRequired && originalStep.status !== 'completed') {
              // If optional and incomplete but in result, must have validation errors
              expect(originalStep.validationErrors.length).toBeGreaterThan(0);
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should correctly count validation errors per step', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Count errors per step in result
          const errorCountByStep = new Map<string, number>();
          for (const error of result.validationErrors) {
            const count = errorCountByStep.get(error.stepId || '') || 0;
            errorCountByStep.set(error.stepId || '', count + 1);
          }
          
          // Verify counts match original
          for (const step of phase.steps) {
            const resultCount = errorCountByStep.get(step.id) || 0;
            expect(resultCount).toBe(step.validationErrors.length);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve step data in incomplete items', async () => {
    await fc.assert(
      fc.property(
        phaseWithIncompleteStepsGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Each incomplete item should have the same data as the original step
          for (const item of result.incompleteItems) {
            const originalStep = phase.steps.find(s => s.id === item.id);
            expect(originalStep).toBeDefined();
            expect(item.name).toBe(originalStep!.name);
            expect(item.status).toBe(originalStep!.status);
            expect(item.isRequired).toBe(originalStep!.isRequired);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should have bijection between problematic steps and result items', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const result = validatePhaseTransition(phase);
          
          // Get all problematic steps
          const problematicSteps = phase.steps.filter(shouldStepBeFlagged);
          
          // Result should have exactly the same count
          expect(result.incompleteItems.length).toBe(problematicSteps.length);
          
          // And the same IDs
          const problematicIds = new Set(problematicSteps.map(s => s.id));
          const resultIds = new Set(result.incompleteItems.map(s => s.id));
          
          expect(problematicIds.size).toBe(resultIds.size);
          for (const id of problematicIds) {
            expect(resultIds.has(id)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should be idempotent - calling twice gives same result', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const result1 = validatePhaseTransition(phase);
          const result2 = validatePhaseTransition(phase);
          
          expect(result1.isValid).toBe(result2.isValid);
          expect(result1.incompleteItems.length).toBe(result2.incompleteItems.length);
          expect(result1.validationErrors.length).toBe(result2.validationErrors.length);
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
