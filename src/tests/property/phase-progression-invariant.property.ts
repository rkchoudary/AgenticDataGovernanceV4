/**
 * **Feature: workflow-wizard-ui, Property 1: Phase Progression Invariant**
 * 
 * For any workflow cycle, a phase can only transition to 'completed' status 
 * if all required steps within that phase have status 'completed' and all 
 * validation rules pass.
 * 
 * **Validates: Requirements 2.1, 2.2**
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
  completedAt?: string;
  completedBy?: string;
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
 * Check if all required steps in a phase are completed
 * This is the core invariant being tested
 */
function areAllRequiredStepsCompleted(phase: PhaseState): boolean {
  return phase.steps
    .filter(step => step.isRequired)
    .every(step => step.status === 'completed');
}

/**
 * Check if a phase has any validation errors
 */
function hasValidationErrors(phase: PhaseState): boolean {
  return phase.steps.some(step => step.validationErrors.length > 0);
}

/**
 * Attempt to complete a phase - returns true only if invariant is satisfied
 * Property 1: Phase Progression Invariant
 */
function canCompletePhase(phase: PhaseState): boolean {
  // All required steps must be completed
  if (!areAllRequiredStepsCompleted(phase)) {
    return false;
  }
  
  // No validation errors allowed
  if (hasValidationErrors(phase)) {
    return false;
  }
  
  return true;
}

/**
 * Complete a phase if allowed
 */
function completePhase(phase: PhaseState): PhaseState | null {
  if (!canCompletePhase(phase)) {
    return null;
  }
  
  return {
    ...phase,
    status: 'completed',
    completedAt: new Date().toISOString(),
  };
}

/**
 * Calculate overall progress percentage
 * Property 4: Progress Calculation Accuracy
 */
function calculateOverallProgress(phases: PhaseState[]): number {
  if (phases.length === 0) return 0;
  
  let totalSteps = 0;
  let completedSteps = 0;
  
  for (const phase of phases) {
    totalSteps += phase.steps.length;
    completedSteps += phase.steps.filter(s => s.status === 'completed').length;
  }
  
  if (totalSteps === 0) return 0;
  return Math.round((completedSteps / totalSteps) * 100);
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
    steps: fc.array(stepGenerator(), { minLength: 1, maxLength: 6 }),
  });

/**
 * Generator for a phase where all required steps are completed and no validation errors
 */
const completablePhaseGenerator = (): fc.Arbitrary<PhaseState> =>
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

/**
 * Generator for a phase with at least one incomplete required step
 */
const incompletePhaseGenerator = (): fc.Arbitrary<PhaseState> =>
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
      // Additional steps (may be complete or incomplete)
      fc.array(stepGenerator(), { minLength: 0, maxLength: 5 })
    ).map(([requiredIncomplete, others]) => [requiredIncomplete, ...others]),
  });

/**
 * Generator for a phase with validation errors
 */
const phaseWithErrorsGenerator = (): fc.Arbitrary<PhaseState> =>
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
        status: fc.constantFrom('pending', 'in_progress', 'completed') as fc.Arbitrary<StepStatus>,
        isRequired: fc.boolean(),
        validationErrors: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
        data: fc.constant({} as Record<string, unknown>),
      }),
      // Additional steps
      fc.array(stepGenerator(), { minLength: 0, maxLength: 5 })
    ).map(([stepWithErrors, others]) => [stepWithErrors, ...others]),
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 1: Phase Progression Invariant', () => {
  
  it('should allow phase completion only when all required steps are completed', async () => {
    await fc.assert(
      fc.property(
        phaseStateGenerator(),
        (phase) => {
          const canComplete = canCompletePhase(phase);
          const allRequiredCompleted = areAllRequiredStepsCompleted(phase);
          const noErrors = !hasValidationErrors(phase);
          
          // Invariant: canComplete implies (allRequiredCompleted AND noErrors)
          if (canComplete) {
            expect(allRequiredCompleted).toBe(true);
            expect(noErrors).toBe(true);
          }
          
          // Contrapositive: (!allRequiredCompleted OR hasErrors) implies !canComplete
          if (!allRequiredCompleted || !noErrors) {
            expect(canComplete).toBe(false);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should successfully complete a phase when all conditions are met', async () => {
    await fc.assert(
      fc.property(
        completablePhaseGenerator(),
        (phase) => {
          // All required steps are completed and no validation errors
          expect(areAllRequiredStepsCompleted(phase)).toBe(true);
          expect(hasValidationErrors(phase)).toBe(false);
          
          // Should be able to complete
          expect(canCompletePhase(phase)).toBe(true);
          
          // Completing should return a new phase with completed status
          const completed = completePhase(phase);
          expect(completed).not.toBeNull();
          expect(completed!.status).toBe('completed');
          expect(completed!.completedAt).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should prevent phase completion when required steps are incomplete', async () => {
    await fc.assert(
      fc.property(
        incompletePhaseGenerator(),
        (phase) => {
          // Has at least one incomplete required step
          expect(areAllRequiredStepsCompleted(phase)).toBe(false);
          
          // Should NOT be able to complete
          expect(canCompletePhase(phase)).toBe(false);
          
          // Attempting to complete should return null
          const result = completePhase(phase);
          expect(result).toBeNull();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should prevent phase completion when validation errors exist', async () => {
    await fc.assert(
      fc.property(
        phaseWithErrorsGenerator(),
        (phase) => {
          // Has validation errors
          expect(hasValidationErrors(phase)).toBe(true);
          
          // Should NOT be able to complete (regardless of step completion status)
          expect(canCompletePhase(phase)).toBe(false);
          
          // Attempting to complete should return null
          const result = completePhase(phase);
          expect(result).toBeNull();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should correctly identify required steps completion status', async () => {
    await fc.assert(
      fc.property(
        fc.array(stepGenerator(), { minLength: 1, maxLength: 10 }),
        (steps) => {
          const phase: PhaseState = {
            id: 'regulatory_intelligence',
            name: 'Test Phase',
            description: 'Test',
            estimatedMinutes: 30,
            status: 'in_progress',
            steps,
          };
          
          const requiredSteps = steps.filter(s => s.isRequired);
          const allRequiredCompleted = requiredSteps.every(s => s.status === 'completed');
          
          expect(areAllRequiredStepsCompleted(phase)).toBe(allRequiredCompleted);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should correctly detect validation errors', async () => {
    await fc.assert(
      fc.property(
        fc.array(stepGenerator(), { minLength: 1, maxLength: 10 }),
        (steps) => {
          const phase: PhaseState = {
            id: 'regulatory_intelligence',
            name: 'Test Phase',
            description: 'Test',
            estimatedMinutes: 30,
            status: 'in_progress',
            steps,
          };
          
          const anyStepHasErrors = steps.some(s => s.validationErrors.length > 0);
          
          expect(hasValidationErrors(phase)).toBe(anyStepHasErrors);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve phase data when completion fails', async () => {
    await fc.assert(
      fc.property(
        incompletePhaseGenerator(),
        (phase) => {
          const originalPhase = { ...phase };
          
          // Attempt to complete (should fail)
          const result = completePhase(phase);
          
          // Original phase should be unchanged
          expect(phase.status).toBe(originalPhase.status);
          expect(phase.steps).toEqual(originalPhase.steps);
          expect(result).toBeNull();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should calculate progress accurately based on completed steps', async () => {
    await fc.assert(
      fc.property(
        fc.array(phaseStateGenerator(), { minLength: 1, maxLength: 9 }),
        (phases) => {
          const progress = calculateOverallProgress(phases);
          
          // Progress should be between 0 and 100
          expect(progress).toBeGreaterThanOrEqual(0);
          expect(progress).toBeLessThanOrEqual(100);
          
          // Calculate expected progress
          let totalSteps = 0;
          let completedSteps = 0;
          for (const phase of phases) {
            totalSteps += phase.steps.length;
            completedSteps += phase.steps.filter(s => s.status === 'completed').length;
          }
          
          const expectedProgress = totalSteps > 0 
            ? Math.round((completedSteps / totalSteps) * 100) 
            : 0;
          
          expect(progress).toBe(expectedProgress);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should return 0 progress for empty phases array', () => {
    const progress = calculateOverallProgress([]);
    expect(progress).toBe(0);
  });

  it('should return 100 progress when all steps are completed', async () => {
    await fc.assert(
      fc.property(
        fc.array(completablePhaseGenerator(), { minLength: 1, maxLength: 9 }),
        (phases) => {
          const progress = calculateOverallProgress(phases);
          expect(progress).toBe(100);
          return true;
        }
      ),
      propertyConfig
    );
  });
});
