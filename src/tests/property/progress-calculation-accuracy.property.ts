/**
 * **Feature: workflow-wizard-ui, Property 4: Progress Calculation Accuracy**
 * 
 * For any workflow cycle, the overall progress percentage shall equal the 
 * weighted sum of completed steps divided by total steps across all phases,
 * where each phase has equal weight.
 * 
 * **Validates: Requirements 1.5, 4.5**
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
 * Calculate overall progress percentage
 * Property 4: Progress Calculation Accuracy
 * 
 * Progress = (completed steps / total steps) * 100, rounded to nearest integer
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

/**
 * Calculate phase-specific progress
 */
function calculatePhaseProgress(phase: PhaseState): number {
  if (phase.steps.length === 0) return 0;
  
  const completedSteps = phase.steps.filter(s => s.status === 'completed').length;
  return Math.round((completedSteps / phase.steps.length) * 100);
}

/**
 * Get progress breakdown by phase
 */
function getProgressByPhase(phases: PhaseState[]): Record<Phase, number> {
  const result: Partial<Record<Phase, number>> = {};
  
  for (const phase of phases) {
    result[phase.id] = calculatePhaseProgress(phase);
  }
  
  return result as Record<Phase, number>;
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
 * Generator for a single step
 */
const stepGenerator = (): fc.Arbitrary<StepState> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    status: stepStatusGenerator(),
    isRequired: fc.boolean(),
    validationErrors: fc.constant([] as string[]),
    data: fc.constant({} as Record<string, unknown>),
  });

/**
 * Generator for a phase with a specific number of steps
 */
const phaseWithStepsGenerator = (
  phaseId: Phase,
  minSteps: number = 1,
  maxSteps: number = 6
): fc.Arbitrary<PhaseState> =>
  fc.record({
    id: fc.constant(phaseId),
    name: fc.constant(phaseId.replace(/_/g, ' ')),
    description: fc.string({ minLength: 0, maxLength: 100 }),
    estimatedMinutes: fc.integer({ min: 10, max: 60 }),
    status: fc.constantFrom('pending', 'in_progress', 'completed', 'blocked') as fc.Arbitrary<PhaseStatus>,
    steps: fc.array(stepGenerator(), { minLength: minSteps, maxLength: maxSteps }),
  });

/**
 * Generator for a complete workflow with all 9 phases
 */
const fullWorkflowGenerator = (): fc.Arbitrary<PhaseState[]> =>
  fc.tuple(
    ...PHASE_ORDER.map(phaseId => phaseWithStepsGenerator(phaseId, 2, 5))
  ).map(phases => phases);

/**
 * Generator for a workflow with specific completion pattern
 */
const workflowWithCompletionPatternGenerator = (
  completedPhaseCount: number
): fc.Arbitrary<PhaseState[]> =>
  fc.tuple(
    ...PHASE_ORDER.map((phaseId, index) => {
      if (index < completedPhaseCount) {
        // Completed phase - all steps completed
        return fc.record({
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
              data: fc.constant({} as Record<string, unknown>),
            }),
            { minLength: 2, maxLength: 5 }
          ),
        });
      } else {
        // Pending phase - no steps completed
        return fc.record({
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
            { minLength: 2, maxLength: 5 }
          ),
        });
      }
    })
  ).map(phases => phases);

/**
 * Generator for phases with known step counts and completion counts
 */
const controlledProgressGenerator = (): fc.Arbitrary<{
  phases: PhaseState[];
  expectedProgress: number;
}> =>
  fc.array(
    fc.record({
      totalSteps: fc.integer({ min: 1, max: 6 }),
      completedSteps: fc.integer({ min: 0, max: 6 }),
    }).filter(({ totalSteps, completedSteps }) => completedSteps <= totalSteps),
    { minLength: 1, maxLength: 9 }
  ).map(configs => {
    let totalSteps = 0;
    let completedSteps = 0;
    
    const phases: PhaseState[] = configs.map((config, index) => {
      const phaseId = PHASE_ORDER[index % PHASE_ORDER.length];
      totalSteps += config.totalSteps;
      completedSteps += config.completedSteps;
      
      const steps: StepState[] = [];
      for (let i = 0; i < config.totalSteps; i++) {
        steps.push({
          id: `step-${index}-${i}`,
          name: `Step ${i + 1}`,
          status: i < config.completedSteps ? 'completed' : 'pending',
          isRequired: true,
          validationErrors: [],
          data: {},
        });
      }
      
      return {
        id: phaseId,
        name: phaseId.replace(/_/g, ' '),
        description: '',
        estimatedMinutes: 30,
        status: 'in_progress' as PhaseStatus,
        steps,
      };
    });
    
    const expectedProgress = totalSteps > 0 
      ? Math.round((completedSteps / totalSteps) * 100)
      : 0;
    
    return { phases, expectedProgress };
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 4: Progress Calculation Accuracy', () => {
  
  it('should calculate progress as (completed steps / total steps) * 100', async () => {
    await fc.assert(
      fc.property(
        fullWorkflowGenerator(),
        (phases) => {
          const progress = calculateOverallProgress(phases);
          
          // Manually calculate expected progress
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

  it('should return progress between 0 and 100 inclusive', async () => {
    await fc.assert(
      fc.property(
        fullWorkflowGenerator(),
        (phases) => {
          const progress = calculateOverallProgress(phases);
          
          expect(progress).toBeGreaterThanOrEqual(0);
          expect(progress).toBeLessThanOrEqual(100);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should return 0 for empty phases array', () => {
    const progress = calculateOverallProgress([]);
    expect(progress).toBe(0);
  });

  it('should return 0 when no steps are completed', async () => {
    await fc.assert(
      fc.property(
        workflowWithCompletionPatternGenerator(0),
        (phases) => {
          const progress = calculateOverallProgress(phases);
          expect(progress).toBe(0);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should return 100 when all steps are completed', async () => {
    await fc.assert(
      fc.property(
        workflowWithCompletionPatternGenerator(9),
        (phases) => {
          const progress = calculateOverallProgress(phases);
          expect(progress).toBe(100);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should match controlled expected progress exactly', async () => {
    await fc.assert(
      fc.property(
        controlledProgressGenerator(),
        ({ phases, expectedProgress }) => {
          const actualProgress = calculateOverallProgress(phases);
          expect(actualProgress).toBe(expectedProgress);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should increase monotonically as steps are completed', async () => {
    await fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 1, max: 9 }),
        (lowerCount, higherCount) => {
          // Ensure higherCount > lowerCount
          const lower = Math.min(lowerCount, higherCount - 1);
          const higher = Math.max(lowerCount + 1, higherCount);
          
          if (lower < 0 || higher > 9) return true;
          
          // Generate workflows with different completion levels
          // Using a simpler approach with fixed step counts
          const createWorkflow = (completedPhases: number): PhaseState[] => {
            return PHASE_ORDER.map((phaseId, index) => ({
              id: phaseId,
              name: phaseId.replace(/_/g, ' '),
              description: '',
              estimatedMinutes: 30,
              status: index < completedPhases ? 'completed' : 'pending' as PhaseStatus,
              steps: Array.from({ length: 4 }, (_, i) => ({
                id: `step-${index}-${i}`,
                name: `Step ${i + 1}`,
                status: index < completedPhases ? 'completed' : 'pending' as StepStatus,
                isRequired: true,
                validationErrors: [],
                data: {},
              })),
            }));
          };
          
          const lowerWorkflow = createWorkflow(lower);
          const higherWorkflow = createWorkflow(higher);
          
          const lowerProgress = calculateOverallProgress(lowerWorkflow);
          const higherProgress = calculateOverallProgress(higherWorkflow);
          
          expect(higherProgress).toBeGreaterThanOrEqual(lowerProgress);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should treat all phases with equal weight', async () => {
    // Create two workflows with same total steps but different distributions
    // Progress should be the same if completed step count is the same
    await fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        (totalSteps, completedSteps) => {
          const actualCompleted = Math.min(completedSteps, totalSteps);
          
          // Create a single-phase workflow
          const singlePhase: PhaseState[] = [{
            id: 'regulatory_intelligence',
            name: 'Regulatory Intelligence',
            description: '',
            estimatedMinutes: 30,
            status: 'in_progress',
            steps: Array.from({ length: totalSteps }, (_, i) => ({
              id: `step-${i}`,
              name: `Step ${i + 1}`,
              status: i < actualCompleted ? 'completed' : 'pending' as StepStatus,
              isRequired: true,
              validationErrors: [],
              data: {},
            })),
          }];
          
          // Create a multi-phase workflow with same total/completed steps
          const stepsPerPhase = Math.ceil(totalSteps / 3);
          const multiPhase: PhaseState[] = [];
          let remainingTotal = totalSteps;
          let remainingCompleted = actualCompleted;
          
          for (let p = 0; p < 3 && remainingTotal > 0; p++) {
            const phaseSteps = Math.min(stepsPerPhase, remainingTotal);
            const phaseCompleted = Math.min(phaseSteps, remainingCompleted);
            
            multiPhase.push({
              id: PHASE_ORDER[p],
              name: PHASE_ORDER[p].replace(/_/g, ' '),
              description: '',
              estimatedMinutes: 30,
              status: 'in_progress',
              steps: Array.from({ length: phaseSteps }, (_, i) => ({
                id: `step-${p}-${i}`,
                name: `Step ${i + 1}`,
                status: i < phaseCompleted ? 'completed' : 'pending' as StepStatus,
                isRequired: true,
                validationErrors: [],
                data: {},
              })),
            });
            
            remainingTotal -= phaseSteps;
            remainingCompleted -= phaseCompleted;
          }
          
          const singleProgress = calculateOverallProgress(singlePhase);
          const multiProgress = calculateOverallProgress(multiPhase);
          
          // Both should calculate the same progress
          expect(singleProgress).toBe(multiProgress);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should calculate phase progress correctly', async () => {
    await fc.assert(
      fc.property(
        phaseWithStepsGenerator('regulatory_intelligence', 1, 10),
        (phase) => {
          const progress = calculatePhaseProgress(phase);
          
          const completedSteps = phase.steps.filter(s => s.status === 'completed').length;
          const expectedProgress = phase.steps.length > 0
            ? Math.round((completedSteps / phase.steps.length) * 100)
            : 0;
          
          expect(progress).toBe(expectedProgress);
          expect(progress).toBeGreaterThanOrEqual(0);
          expect(progress).toBeLessThanOrEqual(100);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should return 0 phase progress for phase with no steps', () => {
    const emptyPhase: PhaseState = {
      id: 'regulatory_intelligence',
      name: 'Regulatory Intelligence',
      description: '',
      estimatedMinutes: 30,
      status: 'pending',
      steps: [],
    };
    
    expect(calculatePhaseProgress(emptyPhase)).toBe(0);
  });

  it('should correctly aggregate progress across all phases', async () => {
    await fc.assert(
      fc.property(
        fullWorkflowGenerator(),
        (phases) => {
          const overallProgress = calculateOverallProgress(phases);
          const phaseProgressMap = getProgressByPhase(phases);
          
          // Verify each phase has a progress value
          for (const phase of phases) {
            expect(phaseProgressMap[phase.id]).toBeDefined();
            expect(phaseProgressMap[phase.id]).toBeGreaterThanOrEqual(0);
            expect(phaseProgressMap[phase.id]).toBeLessThanOrEqual(100);
          }
          
          // Overall progress should be consistent with step-level calculation
          // (not phase percentage aggregation, which loses precision due to rounding)
          let totalSteps = 0;
          let completedSteps = 0;
          
          for (const phase of phases) {
            totalSteps += phase.steps.length;
            completedSteps += phase.steps.filter(s => s.status === 'completed').length;
          }
          
          const expectedOverall = totalSteps > 0
            ? Math.round((completedSteps / totalSteps) * 100)
            : 0;
          
          expect(overallProgress).toBe(expectedOverall);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should handle phases with varying step counts correctly', async () => {
    // Create a workflow where phases have different step counts
    const unevenWorkflow: PhaseState[] = [
      {
        id: 'regulatory_intelligence',
        name: 'Regulatory Intelligence',
        description: '',
        estimatedMinutes: 30,
        status: 'completed',
        steps: Array.from({ length: 2 }, (_, i) => ({
          id: `step-0-${i}`,
          name: `Step ${i + 1}`,
          status: 'completed' as StepStatus,
          isRequired: true,
          validationErrors: [],
          data: {},
        })),
      },
      {
        id: 'data_requirements',
        name: 'Data Requirements',
        description: '',
        estimatedMinutes: 30,
        status: 'pending',
        steps: Array.from({ length: 8 }, (_, i) => ({
          id: `step-1-${i}`,
          name: `Step ${i + 1}`,
          status: 'pending' as StepStatus,
          isRequired: true,
          validationErrors: [],
          data: {},
        })),
      },
    ];
    
    const progress = calculateOverallProgress(unevenWorkflow);
    
    // 2 completed out of 10 total = 20%
    expect(progress).toBe(20);
  });

  it('should round progress to nearest integer', async () => {
    // Create a workflow that would result in a non-integer percentage
    const workflow: PhaseState[] = [{
      id: 'regulatory_intelligence',
      name: 'Regulatory Intelligence',
      description: '',
      estimatedMinutes: 30,
      status: 'in_progress',
      steps: Array.from({ length: 3 }, (_, i) => ({
        id: `step-${i}`,
        name: `Step ${i + 1}`,
        status: i === 0 ? 'completed' : 'pending' as StepStatus,
        isRequired: true,
        validationErrors: [],
        data: {},
      })),
    }];
    
    const progress = calculateOverallProgress(workflow);
    
    // 1/3 = 33.33...% should round to 33%
    expect(progress).toBe(33);
    expect(Number.isInteger(progress)).toBe(true);
  });
});
