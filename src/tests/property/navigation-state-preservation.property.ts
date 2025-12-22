/**
 * **Feature: workflow-wizard-ui, Property 6: Navigation State Preservation**
 * 
 * For any navigation from a later phase back to an earlier completed phase,
 * all progress in the later phase shall be preserved and accessible when returning.
 * 
 * **Validates: Requirements 2.4**
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
  completedAt?: string;
  completedBy?: string;
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

interface WorkflowState {
  currentPhase: Phase;
  currentStep: number;
  phases: PhaseState[];
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
 * Get the index of a phase in the workflow order
 */
function getPhaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

/**
 * Check if navigation to a target phase is allowed
 * Can navigate to completed phases or current phase
 */
function canNavigateToPhase(
  targetPhase: Phase,
  currentPhase: Phase,
  phases: PhaseState[]
): boolean {
  const targetState = phases.find(p => p.id === targetPhase);
  if (!targetState) return false;
  
  // Can always navigate to current phase
  if (targetPhase === currentPhase) return true;
  
  // Can navigate to completed or in_progress phases
  return targetState.status === 'completed' || targetState.status === 'in_progress';
}

/**
 * Navigate to a phase - returns new state with preserved progress
 * Property 6: Navigation State Preservation
 */
function navigateToPhase(
  state: WorkflowState,
  targetPhase: Phase
): WorkflowState | null {
  if (!canNavigateToPhase(targetPhase, state.currentPhase, state.phases)) {
    return null;
  }
  
  // Navigation preserves all phase states - only changes currentPhase
  return {
    ...state,
    currentPhase: targetPhase,
    currentStep: 0, // Reset to first step of target phase
  };
}

/**
 * Navigate back to an earlier phase
 */
function navigateBack(
  state: WorkflowState,
  targetPhase: Phase
): WorkflowState | null {
  const currentIndex = getPhaseIndex(state.currentPhase);
  const targetIndex = getPhaseIndex(targetPhase);
  
  // Can only navigate back to earlier phases
  if (targetIndex >= currentIndex) {
    return null;
  }
  
  return navigateToPhase(state, targetPhase);
}

/**
 * Navigate forward to return to a later phase
 */
function navigateForward(
  state: WorkflowState,
  targetPhase: Phase
): WorkflowState | null {
  const currentIndex = getPhaseIndex(state.currentPhase);
  const targetIndex = getPhaseIndex(targetPhase);
  
  // Can only navigate forward to later phases
  if (targetIndex <= currentIndex) {
    return null;
  }
  
  return navigateToPhase(state, targetPhase);
}

/**
 * Deep equality check for phase states
 */
function phasesAreEqual(phases1: PhaseState[], phases2: PhaseState[]): boolean {
  if (phases1.length !== phases2.length) return false;
  
  for (let i = 0; i < phases1.length; i++) {
    const p1 = phases1[i];
    const p2 = phases2[i];
    
    if (p1.id !== p2.id) return false;
    if (p1.status !== p2.status) return false;
    if (p1.steps.length !== p2.steps.length) return false;
    
    for (let j = 0; j < p1.steps.length; j++) {
      const s1 = p1.steps[j];
      const s2 = p2.steps[j];
      
      if (s1.id !== s2.id) return false;
      if (s1.status !== s2.status) return false;
      if (JSON.stringify(s1.data) !== JSON.stringify(s2.data)) return false;
    }
  }
  
  return true;
}

// ============================================================================
// Generators
// ============================================================================

const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Generator for a completed phase with preserved data
 */
const completedPhaseGenerator = (phaseId: Phase): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: fc.constant(phaseId),
    name: fc.constant(phaseId.replace(/_/g, ' ')),
    description: fc.string({ minLength: 0, maxLength: 100 }),
    estimatedMinutes: fc.integer({ min: 10, max: 60 }),
    status: fc.constant('completed' as PhaseStatus),
    steps: fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        status: fc.constant('completed' as StepStatus),
        isRequired: fc.boolean(),
        validationErrors: fc.constant([] as string[]),
        data: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.oneof(fc.string(), fc.integer(), fc.boolean())
        ),
        completedAt: fc.date().map(d => d.toISOString()),
      }),
      { minLength: 2, maxLength: 4 }
    ),
    completedAt: fc.date().map(d => d.toISOString()),
  });

/**
 * Generator for an in-progress phase with partial data
 */
const inProgressPhaseGenerator = (phaseId: Phase): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: fc.constant(phaseId),
    name: fc.constant(phaseId.replace(/_/g, ' ')),
    description: fc.string({ minLength: 0, maxLength: 100 }),
    estimatedMinutes: fc.integer({ min: 10, max: 60 }),
    status: fc.constant('in_progress' as PhaseStatus),
    steps: fc.tuple(
      // Some completed steps
      fc.array(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          status: fc.constant('completed' as StepStatus),
          isRequired: fc.boolean(),
          validationErrors: fc.constant([] as string[]),
          data: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(fc.string(), fc.integer(), fc.boolean())
          ),
          completedAt: fc.date().map(d => d.toISOString()),
        }),
        { minLength: 1, maxLength: 2 }
      ),
      // Some pending steps
      fc.array(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 50 }),
          status: fc.constantFrom('pending', 'in_progress') as fc.Arbitrary<StepStatus>,
          isRequired: fc.boolean(),
          validationErrors: fc.constant([] as string[]),
          data: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.oneof(fc.string(), fc.integer(), fc.boolean())
          ),
        }),
        { minLength: 1, maxLength: 2 }
      )
    ).map(([completed, pending]) => [...completed, ...pending]),
  });

/**
 * Generator for a pending phase
 */
const pendingPhaseGenerator = (phaseId: Phase): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: fc.constant(phaseId),
    name: fc.constant(phaseId.replace(/_/g, ' ')),
    description: fc.string({ minLength: 0, maxLength: 100 }),
    estimatedMinutes: fc.integer({ min: 10, max: 60 }),
    status: fc.constant('pending' as PhaseStatus),
    steps: fc.array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        status: fc.constant('pending' as StepStatus),
        isRequired: fc.boolean(),
        validationErrors: fc.constant([] as string[]),
        data: fc.constant({} as Record<string, unknown>),
      }),
      { minLength: 2, maxLength: 4 }
    ),
  });


/**
 * Simpler generator for workflow state with explicit phase index
 */
const simpleWorkflowStateGenerator = (): fc.Arbitrary<WorkflowState> =>
  fc.integer({ min: 2, max: 8 }).chain(currentPhaseIndex => {
    // Build phases array
    const phases: fc.Arbitrary<PhaseState>[] = PHASE_ORDER.map((phaseId, index) => {
      if (index < currentPhaseIndex) {
        return completedPhaseGenerator(phaseId);
      } else if (index === currentPhaseIndex) {
        return inProgressPhaseGenerator(phaseId);
      } else {
        return pendingPhaseGenerator(phaseId);
      }
    });
    
    return fc.tuple(...phases).map(phaseArray => ({
      currentPhase: PHASE_ORDER[currentPhaseIndex],
      currentStep: 0,
      phases: phaseArray,
    }));
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 6: Navigation State Preservation', () => {
  
  it('should preserve all phase progress when navigating back to earlier phase', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        fc.integer({ min: 0, max: 7 }),
        (state, targetOffset) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          
          // Only test if we can navigate back (need at least one completed phase before current)
          if (currentIndex === 0) return true;
          
          // Pick a completed phase to navigate back to
          const targetIndex = targetOffset % currentIndex;
          const targetPhase = PHASE_ORDER[targetIndex];
          
          // Store original phases state
          const originalPhases = JSON.parse(JSON.stringify(state.phases));
          
          // Navigate back
          const afterBack = navigateBack(state, targetPhase);
          
          // Navigation should succeed to completed phases
          expect(afterBack).not.toBeNull();
          
          if (afterBack) {
            // Current phase should change
            expect(afterBack.currentPhase).toBe(targetPhase);
            
            // All phase data should be preserved
            expect(phasesAreEqual(afterBack.phases, originalPhases)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve progress when navigating back and then forward', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        (state) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          
          // Need at least one completed phase to navigate back
          if (currentIndex === 0) return true;
          
          // Store original state
          const originalPhase = state.currentPhase;
          const originalPhases = JSON.parse(JSON.stringify(state.phases));
          
          // Navigate back to first completed phase
          const targetPhase = PHASE_ORDER[0];
          const afterBack = navigateBack(state, targetPhase);
          
          expect(afterBack).not.toBeNull();
          if (!afterBack) return true;
          
          // Navigate forward to original phase
          const afterForward = navigateForward(afterBack, originalPhase);
          
          expect(afterForward).not.toBeNull();
          if (!afterForward) return true;
          
          // Should be back at original phase
          expect(afterForward.currentPhase).toBe(originalPhase);
          
          // All phase data should be preserved through round trip
          expect(phasesAreEqual(afterForward.phases, originalPhases)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not allow navigation to pending phases', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        (state) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          
          // Try to navigate to a pending phase (after current)
          if (currentIndex >= PHASE_ORDER.length - 1) return true;
          
          const pendingPhase = PHASE_ORDER[currentIndex + 2]; // Skip one to ensure it's pending
          if (!pendingPhase) return true;
          
          const result = navigateToPhase(state, pendingPhase);
          
          // Should not be able to navigate to pending phase
          expect(result).toBeNull();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve step data within phases during navigation', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        (state) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          if (currentIndex === 0) return true;
          
          // Get step data from a completed phase
          const completedPhase = state.phases[0];
          const originalStepData = completedPhase.steps.map(s => ({
            id: s.id,
            status: s.status,
            data: JSON.parse(JSON.stringify(s.data)),
          }));
          
          // Navigate back to that phase
          const afterNav = navigateBack(state, completedPhase.id);
          expect(afterNav).not.toBeNull();
          
          if (afterNav) {
            const navigatedPhase = afterNav.phases.find(p => p.id === completedPhase.id);
            expect(navigatedPhase).toBeDefined();
            
            if (navigatedPhase) {
              // Verify each step's data is preserved
              navigatedPhase.steps.forEach((step, index) => {
                expect(step.id).toBe(originalStepData[index].id);
                expect(step.status).toBe(originalStepData[index].status);
                expect(JSON.stringify(step.data)).toBe(
                  JSON.stringify(originalStepData[index].data)
                );
              });
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow navigation to current phase (no-op)', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        (state) => {
          const originalPhases = JSON.parse(JSON.stringify(state.phases));
          
          // Navigate to current phase
          const result = navigateToPhase(state, state.currentPhase);
          
          // Should succeed
          expect(result).not.toBeNull();
          
          if (result) {
            // Phase should remain the same
            expect(result.currentPhase).toBe(state.currentPhase);
            
            // All data preserved
            expect(phasesAreEqual(result.phases, originalPhases)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should reset currentStep to 0 when navigating to a different phase', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        fc.integer({ min: 1, max: 3 }),
        (state, stepOffset) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          if (currentIndex === 0) return true;
          
          // Set a non-zero current step
          const stateWithStep = {
            ...state,
            currentStep: stepOffset,
          };
          
          // Navigate back
          const targetPhase = PHASE_ORDER[0];
          const afterNav = navigateBack(stateWithStep, targetPhase);
          
          expect(afterNav).not.toBeNull();
          
          if (afterNav) {
            // Current step should be reset to 0
            expect(afterNav.currentStep).toBe(0);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should maintain phase order invariant after navigation', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        (state) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          if (currentIndex === 0) return true;
          
          // Navigate back
          const targetPhase = PHASE_ORDER[0];
          const afterNav = navigateBack(state, targetPhase);
          
          expect(afterNav).not.toBeNull();
          
          if (afterNav) {
            // Verify phases are still in correct order
            afterNav.phases.forEach((phase, index) => {
              expect(phase.id).toBe(PHASE_ORDER[index]);
            });
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not modify original state during navigation (immutability)', async () => {
    await fc.assert(
      fc.property(
        simpleWorkflowStateGenerator(),
        (state) => {
          const currentIndex = getPhaseIndex(state.currentPhase);
          if (currentIndex === 0) return true;
          
          // Deep copy original state
          const originalState = JSON.parse(JSON.stringify(state));
          
          // Navigate back
          const targetPhase = PHASE_ORDER[0];
          navigateBack(state, targetPhase);
          
          // Original state should be unchanged
          expect(state.currentPhase).toBe(originalState.currentPhase);
          expect(state.currentStep).toBe(originalState.currentStep);
          expect(JSON.stringify(state.phases)).toBe(JSON.stringify(originalState.phases));
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
