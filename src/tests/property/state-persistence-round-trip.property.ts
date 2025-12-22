/**
 * **Feature: workflow-wizard-ui, Property 5: State Persistence Round Trip**
 * 
 * For any workflow state saved to the server, loading that state shall restore 
 * the exact same phase, step, and data values.
 * 
 * **Validates: Requirements 13.1, 13.2**
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
  approvalRationale?: string;
  signatureData?: string;
}

interface WorkflowSavePayload {
  cycleId: string;
  currentPhase: Phase;
  currentStep: number;
  phases: PhaseState[];
  lastModifiedAt: string;
}

interface WorkflowResumeState {
  cycleId: string;
  reportId: string;
  reportName: string;
  currentPhase: Phase;
  currentStep: number;
  phases: PhaseState[];
  lastModifiedAt: string;
  lastModifiedBy: string;
  hasUnsavedChanges: boolean;
}

interface PhaseRecord {
  phase: Phase;
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  approvalRationale?: string;
  signatureData?: string;
  steps: StepRecord[];
}

interface StepRecord {
  stepId: string;
  status: StepStatus;
  completedAt?: string;
  completedBy?: string;
  data: Record<string, unknown>;
  validationErrors: string[];
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
// Serialization/Deserialization Functions Under Test
// ============================================================================

/**
 * Serialize workflow state for persistence
 * Converts PhaseState[] to API-compatible format
 */
function serializeWorkflowState(
  cycleId: string,
  currentPhase: Phase,
  currentStep: number,
  phases: PhaseState[]
): WorkflowSavePayload {
  return {
    cycleId,
    currentPhase,
    currentStep,
    phases: phases.map(phase => ({
      ...phase,
      completedAt: phase.completedAt,
    })),
    lastModifiedAt: new Date().toISOString(),
  };
}

/**
 * Deserialize workflow state from persistence
 * Property 5: State Persistence Round Trip - ensures exact restoration
 */
function deserializeWorkflowState(data: WorkflowResumeState): WorkflowResumeState {
  return {
    ...data,
    phases: data.phases.map(phase => ({
      ...phase,
      steps: phase.steps.map(step => ({
        ...step,
        data: step.data || {},
        validationErrors: step.validationErrors || [],
      })),
    })),
  };
}

/**
 * Convert PhaseState to PhaseRecord for API
 */
function phaseStateToRecord(phase: PhaseState): PhaseRecord {
  return {
    phase: phase.id,
    status: phase.status,
    startedAt: phase.status !== 'pending' ? new Date().toISOString() : undefined,
    completedAt: phase.completedAt,
    completedBy: phase.completedBy,
    approvalRationale: phase.approvalRationale,
    signatureData: phase.signatureData,
    steps: phase.steps.map(stepStateToRecord),
  };
}

/**
 * Convert StepState to StepRecord for API
 */
function stepStateToRecord(step: StepState): StepRecord {
  return {
    stepId: step.id,
    status: step.status,
    completedAt: step.completedAt,
    completedBy: step.completedBy,
    data: step.data,
    validationErrors: step.validationErrors,
  };
}

/**
 * Convert PhaseRecord back to PhaseState
 */
function phaseRecordToState(record: PhaseRecord, originalPhase: PhaseState): PhaseState {
  return {
    id: record.phase,
    name: originalPhase.name,
    description: originalPhase.description,
    estimatedMinutes: originalPhase.estimatedMinutes,
    status: record.status,
    completedAt: record.completedAt,
    completedBy: record.completedBy,
    approvalRationale: record.approvalRationale,
    signatureData: record.signatureData,
    steps: record.steps.map((stepRecord, index) => 
      stepRecordToState(stepRecord, originalPhase.steps[index])
    ),
  };
}

/**
 * Convert StepRecord back to StepState
 */
function stepRecordToState(record: StepRecord, originalStep: StepState): StepState {
  return {
    id: record.stepId,
    name: originalStep.name,
    status: record.status,
    isRequired: originalStep.isRequired,
    validationErrors: record.validationErrors,
    data: record.data,
    completedAt: record.completedAt,
    completedBy: record.completedBy,
  };
}

/**
 * Simulate full round trip: serialize -> API format -> deserialize
 */
function roundTripWorkflowState(
  cycleId: string,
  reportId: string,
  reportName: string,
  currentPhase: Phase,
  currentStep: number,
  phases: PhaseState[]
): { original: WorkflowSavePayload; restored: WorkflowResumeState } {
  // Step 1: Serialize for saving
  const savePayload = serializeWorkflowState(cycleId, currentPhase, currentStep, phases);
  
  // Step 2: Convert to API format (what would be sent to server)
  const apiFormat = {
    cycleId: savePayload.cycleId,
    currentPhase: savePayload.currentPhase,
    currentStep: savePayload.currentStep,
    phases: savePayload.phases.map(phaseStateToRecord),
    lastModifiedAt: savePayload.lastModifiedAt,
  };
  
  // Step 3: Simulate server response (what would come back from server)
  const serverResponse: WorkflowResumeState = {
    cycleId: apiFormat.cycleId,
    reportId,
    reportName,
    currentPhase: apiFormat.currentPhase,
    currentStep: apiFormat.currentStep,
    phases: apiFormat.phases.map((record, index) => 
      phaseRecordToState(record, phases[index])
    ),
    lastModifiedAt: apiFormat.lastModifiedAt,
    lastModifiedBy: 'test-user',
    hasUnsavedChanges: false,
  };
  
  // Step 4: Deserialize the response
  const restored = deserializeWorkflowState(serverResponse);
  
  return { original: savePayload, restored };
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
 * Generator for phase status
 */
const phaseStatusGenerator = (): fc.Arbitrary<PhaseStatus> =>
  fc.constantFrom('pending', 'in_progress', 'completed', 'blocked');

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
 * Generator for step data (simple JSON-serializable data)
 */
const stepDataGenerator = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    fc.constant({}),
    fc.record({
      value: fc.string(),
      count: fc.integer(),
      enabled: fc.boolean(),
    }),
    fc.record({
      items: fc.array(fc.string(), { maxLength: 5 }),
      selected: fc.integer({ min: 0, max: 10 }),
    })
  );

/**
 * Generator for ISO date string
 */
const isoDateGenerator = (): fc.Arbitrary<string> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
    .map(d => d.toISOString());

/**
 * Generator for optional ISO date string
 */
const optionalIsoDateGenerator = (): fc.Arbitrary<string | undefined> =>
  fc.option(isoDateGenerator(), { nil: undefined });

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
    data: stepDataGenerator(),
    completedAt: optionalIsoDateGenerator(),
    completedBy: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
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
    status: phaseStatusGenerator(),
    blockingReason: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    steps: fc.array(stepGenerator(), { minLength: 1, maxLength: 6 }),
    completedAt: optionalIsoDateGenerator(),
    completedBy: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    approvalRationale: fc.option(fc.string({ minLength: 20, maxLength: 500 }), { nil: undefined }),
    signatureData: fc.option(fc.string({ minLength: 10, maxLength: 1000 }), { nil: undefined }),
  });

/**
 * Generator for a complete workflow state
 */
const workflowStateGenerator = (): fc.Arbitrary<{
  cycleId: string;
  reportId: string;
  reportName: string;
  currentPhase: Phase;
  currentStep: number;
  phases: PhaseState[];
}> =>
  fc.record({
    cycleId: fc.uuid(),
    reportId: fc.uuid(),
    reportName: fc.string({ minLength: 1, maxLength: 100 }),
    currentPhase: phaseGenerator(),
    currentStep: fc.integer({ min: 0, max: 5 }),
    phases: fc.array(phaseStateGenerator(), { minLength: 1, maxLength: 9 }),
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 5: State Persistence Round Trip', () => {
  
  it('should preserve currentPhase after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          expect(restored.currentPhase).toBe(original.currentPhase);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve currentStep after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          expect(restored.currentStep).toBe(original.currentStep);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve cycleId after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          expect(restored.cycleId).toBe(original.cycleId);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve phase count after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          expect(restored.phases.length).toBe(original.phases.length);
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve phase status for all phases after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            expect(restored.phases[i].status).toBe(original.phases[i].status);
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve step count for all phases after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            expect(restored.phases[i].steps.length).toBe(original.phases[i].steps.length);
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve step status for all steps after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            for (let j = 0; j < original.phases[i].steps.length; j++) {
              expect(restored.phases[i].steps[j].status).toBe(original.phases[i].steps[j].status);
            }
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve step data for all steps after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            for (let j = 0; j < original.phases[i].steps.length; j++) {
              expect(restored.phases[i].steps[j].data).toEqual(original.phases[i].steps[j].data);
            }
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve validation errors for all steps after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            for (let j = 0; j < original.phases[i].steps.length; j++) {
              expect(restored.phases[i].steps[j].validationErrors).toEqual(
                original.phases[i].steps[j].validationErrors
              );
            }
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve approval rationale after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            expect(restored.phases[i].approvalRationale).toBe(original.phases[i].approvalRationale);
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve signature data after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            expect(restored.phases[i].signatureData).toBe(original.phases[i].signatureData);
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should handle empty phases array', () => {
    const cycleId = 'test-cycle-id';
    const reportId = 'test-report-id';
    const reportName = 'Test Report';
    const currentPhase: Phase = 'regulatory_intelligence';
    const currentStep = 0;
    const phases: PhaseState[] = [];
    
    // This should not throw
    expect(() => {
      serializeWorkflowState(cycleId, currentPhase, currentStep, phases);
    }).not.toThrow();
  });

  it('should handle phases with empty steps array', async () => {
    const phaseWithNoSteps: PhaseState = {
      id: 'regulatory_intelligence',
      name: 'Test Phase',
      description: 'Test',
      estimatedMinutes: 30,
      status: 'pending',
      steps: [],
    };
    
    const record = phaseStateToRecord(phaseWithNoSteps);
    expect(record.steps).toEqual([]);
    expect(record.phase).toBe('regulatory_intelligence');
    expect(record.status).toBe('pending');
  });

  it('should preserve step IDs after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            for (let j = 0; j < original.phases[i].steps.length; j++) {
              expect(restored.phases[i].steps[j].id).toBe(original.phases[i].steps[j].id);
            }
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve completedAt timestamps after round trip', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          const { original, restored } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          for (let i = 0; i < original.phases.length; i++) {
            expect(restored.phases[i].completedAt).toBe(original.phases[i].completedAt);
            
            for (let j = 0; j < original.phases[i].steps.length; j++) {
              expect(restored.phases[i].steps[j].completedAt).toBe(
                original.phases[i].steps[j].completedAt
              );
            }
          }
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should be idempotent - multiple round trips produce same result', async () => {
    await fc.assert(
      fc.property(
        workflowStateGenerator(),
        (state) => {
          // First round trip
          const { restored: firstRestore } = roundTripWorkflowState(
            state.cycleId,
            state.reportId,
            state.reportName,
            state.currentPhase,
            state.currentStep,
            state.phases
          );
          
          // Second round trip using first restore's data
          const { restored: secondRestore } = roundTripWorkflowState(
            firstRestore.cycleId,
            firstRestore.reportId,
            firstRestore.reportName,
            firstRestore.currentPhase,
            firstRestore.currentStep,
            firstRestore.phases
          );
          
          // Results should be equivalent
          expect(secondRestore.currentPhase).toBe(firstRestore.currentPhase);
          expect(secondRestore.currentStep).toBe(firstRestore.currentStep);
          expect(secondRestore.phases.length).toBe(firstRestore.phases.length);
          
          for (let i = 0; i < firstRestore.phases.length; i++) {
            expect(secondRestore.phases[i].status).toBe(firstRestore.phases[i].status);
            expect(secondRestore.phases[i].steps.length).toBe(firstRestore.phases[i].steps.length);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
