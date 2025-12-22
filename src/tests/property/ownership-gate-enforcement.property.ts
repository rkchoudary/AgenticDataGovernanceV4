/**
 * **Feature: workflow-wizard-ui, Property 7: Ownership Gate Enforcement**
 * 
 * For any CDE in the CDE Identification phase without an assigned owner,
 * the system shall block progression to the Data Quality Rules phase.
 * 
 * **Validates: Requirements 5.3**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ============================================================================
// Type Definitions (mirroring frontend types for testing)
// ============================================================================

interface CDEOwner {
  userId: string;
  name: string;
  email: string;
  department: string;
  role: string;
  assignedAt: string;
  assignedBy: string;
}

type CDEStatus = 'pending' | 'approved' | 'rejected' | 'needs_review';

interface CDE {
  id: string;
  elementId: string;
  name: string;
  businessDefinition: string;
  dataType: string;
  sourceSystem: string;
  sourceTable: string;
  sourceField: string;
  criticalityRationale: string;
  overallScore: number;
  scoringFactors: {
    regulatoryCalculationUsage: number;
    crossReportUsage: number;
    financialImpact: number;
    regulatoryScrutiny: number;
  };
  aiRationale: string;
  status: CDEStatus;
  owner?: CDEOwner;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
}

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

interface PhaseState {
  id: Phase;
  status: PhaseStatus;
  blockingReason?: string;
}

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Check if all CDEs have owners assigned
 * Property 7: Ownership Gate Enforcement
 */
function allCDEsHaveOwners(cdes: CDE[]): boolean {
  return cdes.every(cde => cde.owner !== undefined && cde.owner !== null);
}

/**
 * Get CDEs without owners
 */
function getCDEsWithoutOwners(cdes: CDE[]): CDE[] {
  return cdes.filter(cde => !cde.owner);
}

/**
 * Check if progression to Data Quality Rules phase is allowed
 * Property 7: Ownership Gate Enforcement
 */
function canProgressToDataQualityRules(cdes: CDE[]): boolean {
  return allCDEsHaveOwners(cdes);
}

/**
 * Get blocking reason for Data Quality Rules phase
 */
function getBlockingReason(cdes: CDE[]): string | undefined {
  const cdesWithoutOwners = getCDEsWithoutOwners(cdes);
  if (cdesWithoutOwners.length > 0) {
    return `${cdesWithoutOwners.length} CDE(s) require owner assignment before proceeding`;
  }
  return undefined;
}

/**
 * Determine phase status based on CDE ownership
 */
function determineDataQualityRulesPhaseStatus(cdes: CDE[]): PhaseState {
  const canProgress = canProgressToDataQualityRules(cdes);
  return {
    id: 'data_quality_rules',
    status: canProgress ? 'pending' : 'blocked',
    blockingReason: canProgress ? undefined : getBlockingReason(cdes),
  };
}

/**
 * Assign owner to a CDE
 */
function assignOwner(cde: CDE, owner: CDEOwner): CDE {
  return {
    ...cde,
    owner,
  };
}

/**
 * Remove owner from a CDE
 */
function removeOwner(cde: CDE): CDE {
  const { owner, ...rest } = cde;
  return rest as CDE;
}

// ============================================================================
// Generators
// ============================================================================

const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Generator for CDE owner
 */
const ownerGenerator = (): fc.Arbitrary<CDEOwner> =>
  fc.record({
    userId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    department: fc.constantFrom('Risk Management', 'Finance', 'Compliance', 'Operations', 'IT'),
    role: fc.constantFrom('Data Steward', 'Data Owner', 'Business Analyst', 'Data Engineer'),
    assignedAt: fc.date().map(d => d.toISOString()),
    assignedBy: fc.string({ minLength: 1, maxLength: 50 }),
  });

/**
 * Generator for CDE status
 */
const cdeStatusGenerator = (): fc.Arbitrary<CDEStatus> =>
  fc.constantFrom('pending', 'approved', 'rejected', 'needs_review');

/**
 * Generator for scoring factors
 */
const scoringFactorsGenerator = () =>
  fc.record({
    regulatoryCalculationUsage: fc.integer({ min: 0, max: 100 }),
    crossReportUsage: fc.integer({ min: 0, max: 100 }),
    financialImpact: fc.integer({ min: 0, max: 100 }),
    regulatoryScrutiny: fc.integer({ min: 0, max: 100 }),
  });

/**
 * Generator for CDE with owner
 */
const cdeWithOwnerGenerator = (): fc.Arbitrary<CDE> =>
  fc.record({
    id: fc.uuid(),
    elementId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    businessDefinition: fc.string({ minLength: 1, maxLength: 500 }),
    dataType: fc.constantFrom('string', 'integer', 'decimal', 'date', 'boolean'),
    sourceSystem: fc.string({ minLength: 1, maxLength: 50 }),
    sourceTable: fc.string({ minLength: 1, maxLength: 50 }),
    sourceField: fc.string({ minLength: 1, maxLength: 50 }),
    criticalityRationale: fc.string({ minLength: 1, maxLength: 500 }),
    overallScore: fc.integer({ min: 0, max: 100 }),
    scoringFactors: scoringFactorsGenerator(),
    aiRationale: fc.string({ minLength: 1, maxLength: 500 }),
    status: cdeStatusGenerator(),
    owner: ownerGenerator(),
  });

/**
 * Generator for CDE without owner
 */
const cdeWithoutOwnerGenerator = (): fc.Arbitrary<CDE> =>
  fc.record({
    id: fc.uuid(),
    elementId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    businessDefinition: fc.string({ minLength: 1, maxLength: 500 }),
    dataType: fc.constantFrom('string', 'integer', 'decimal', 'date', 'boolean'),
    sourceSystem: fc.string({ minLength: 1, maxLength: 50 }),
    sourceTable: fc.string({ minLength: 1, maxLength: 50 }),
    sourceField: fc.string({ minLength: 1, maxLength: 50 }),
    criticalityRationale: fc.string({ minLength: 1, maxLength: 500 }),
    overallScore: fc.integer({ min: 0, max: 100 }),
    scoringFactors: scoringFactorsGenerator(),
    aiRationale: fc.string({ minLength: 1, maxLength: 500 }),
    status: cdeStatusGenerator(),
    // No owner field
  });

/**
 * Generator for CDE with optional owner
 */
const cdeGenerator = (): fc.Arbitrary<CDE> =>
  fc.oneof(cdeWithOwnerGenerator(), cdeWithoutOwnerGenerator());

/**
 * Generator for list of CDEs where all have owners
 */
const allCDEsWithOwnersGenerator = (): fc.Arbitrary<CDE[]> =>
  fc.array(cdeWithOwnerGenerator(), { minLength: 1, maxLength: 10 });

/**
 * Generator for list of CDEs where at least one lacks an owner
 */
const someCDEsWithoutOwnersGenerator = (): fc.Arbitrary<CDE[]> =>
  fc.tuple(
    // At least one CDE without owner
    cdeWithoutOwnerGenerator(),
    // Additional CDEs (may or may not have owners)
    fc.array(cdeGenerator(), { minLength: 0, maxLength: 9 })
  ).map(([required, others]) => [required, ...others]);

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 7: Ownership Gate Enforcement', () => {
  
  it('should block progression when any CDE lacks an owner', async () => {
    await fc.assert(
      fc.property(
        someCDEsWithoutOwnersGenerator(),
        (cdes) => {
          // At least one CDE lacks an owner
          expect(allCDEsHaveOwners(cdes)).toBe(false);
          
          // Progression should be blocked
          expect(canProgressToDataQualityRules(cdes)).toBe(false);
          
          // Phase status should be blocked
          const phaseState = determineDataQualityRulesPhaseStatus(cdes);
          expect(phaseState.status).toBe('blocked');
          expect(phaseState.blockingReason).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow progression when all CDEs have owners', async () => {
    await fc.assert(
      fc.property(
        allCDEsWithOwnersGenerator(),
        (cdes) => {
          // All CDEs have owners
          expect(allCDEsHaveOwners(cdes)).toBe(true);
          
          // Progression should be allowed
          expect(canProgressToDataQualityRules(cdes)).toBe(true);
          
          // Phase status should not be blocked
          const phaseState = determineDataQualityRulesPhaseStatus(cdes);
          expect(phaseState.status).not.toBe('blocked');
          expect(phaseState.blockingReason).toBeUndefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should correctly count CDEs without owners', async () => {
    await fc.assert(
      fc.property(
        fc.array(cdeGenerator(), { minLength: 1, maxLength: 10 }),
        (cdes) => {
          const withoutOwners = getCDEsWithoutOwners(cdes);
          const withOwners = cdes.filter(c => c.owner);
          
          // Counts should add up
          expect(withoutOwners.length + withOwners.length).toBe(cdes.length);
          
          // All returned CDEs should lack owners
          withoutOwners.forEach(cde => {
            expect(cde.owner).toBeUndefined();
          });
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should unblock progression after assigning owners to all CDEs', async () => {
    await fc.assert(
      fc.property(
        someCDEsWithoutOwnersGenerator(),
        ownerGenerator(),
        (cdes, owner) => {
          // Initially blocked
          expect(canProgressToDataQualityRules(cdes)).toBe(false);
          
          // Assign owners to all CDEs without owners
          const updatedCDEs = cdes.map(cde => 
            cde.owner ? cde : assignOwner(cde, owner)
          );
          
          // Now all CDEs have owners
          expect(allCDEsHaveOwners(updatedCDEs)).toBe(true);
          
          // Progression should now be allowed
          expect(canProgressToDataQualityRules(updatedCDEs)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should block progression after removing an owner', async () => {
    await fc.assert(
      fc.property(
        allCDEsWithOwnersGenerator(),
        fc.integer({ min: 0, max: 9 }),
        (cdes, indexToRemove) => {
          // Initially allowed
          expect(canProgressToDataQualityRules(cdes)).toBe(true);
          
          // Remove owner from one CDE
          const actualIndex = indexToRemove % cdes.length;
          const updatedCDEs = cdes.map((cde, i) => 
            i === actualIndex ? removeOwner(cde) : cde
          );
          
          // Now at least one CDE lacks an owner
          expect(allCDEsHaveOwners(updatedCDEs)).toBe(false);
          
          // Progression should now be blocked
          expect(canProgressToDataQualityRules(updatedCDEs)).toBe(false);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should provide accurate blocking reason with count', async () => {
    await fc.assert(
      fc.property(
        someCDEsWithoutOwnersGenerator(),
        (cdes) => {
          const withoutOwners = getCDEsWithoutOwners(cdes);
          const blockingReason = getBlockingReason(cdes);
          
          // Blocking reason should exist
          expect(blockingReason).toBeDefined();
          
          // Blocking reason should contain the correct count
          expect(blockingReason).toContain(`${withoutOwners.length}`);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should handle empty CDE list (edge case)', () => {
    const emptyCDEs: CDE[] = [];
    
    // Empty list means all CDEs have owners (vacuously true)
    expect(allCDEsHaveOwners(emptyCDEs)).toBe(true);
    
    // Progression should be allowed
    expect(canProgressToDataQualityRules(emptyCDEs)).toBe(true);
    
    // No blocking reason
    expect(getBlockingReason(emptyCDEs)).toBeUndefined();
  });

  it('should maintain invariant: blocked iff not all CDEs have owners', async () => {
    await fc.assert(
      fc.property(
        fc.array(cdeGenerator(), { minLength: 0, maxLength: 10 }),
        (cdes) => {
          const allHaveOwners = allCDEsHaveOwners(cdes);
          const canProgress = canProgressToDataQualityRules(cdes);
          const phaseState = determineDataQualityRulesPhaseStatus(cdes);
          
          // Invariant: canProgress === allHaveOwners
          expect(canProgress).toBe(allHaveOwners);
          
          // Invariant: blocked iff !allHaveOwners
          if (allHaveOwners) {
            expect(phaseState.status).not.toBe('blocked');
          } else {
            expect(phaseState.status).toBe('blocked');
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should correctly identify which CDEs lack owners', async () => {
    await fc.assert(
      fc.property(
        fc.array(cdeGenerator(), { minLength: 1, maxLength: 10 }),
        (cdes) => {
          const withoutOwners = getCDEsWithoutOwners(cdes);
          
          // Each CDE in withoutOwners should be in original list
          withoutOwners.forEach(cde => {
            expect(cdes.some(c => c.id === cde.id)).toBe(true);
          });
          
          // Each CDE in withoutOwners should lack an owner
          withoutOwners.forEach(cde => {
            expect(cde.owner).toBeUndefined();
          });
          
          // No CDE with owner should be in withoutOwners
          cdes.filter(c => c.owner).forEach(cde => {
            expect(withoutOwners.some(c => c.id === cde.id)).toBe(false);
          });
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
