/**
 * Test generators for CDE Identification Agent property tests
 */

import fc from 'fast-check';
import {
  CDE,
  CDEScore,
  CDEScoringFactors,
  CDEInventory,
  OwnerSuggestion,
  ScoringContext,
  CDEStatus,
  ArtifactStatus
} from '../../types/index.js';
import { 
  nonEmptyStringGenerator, 
  dateGenerator,
  emailGenerator,
  cdeStatusGenerator,
  artifactStatusGenerator
} from './common.generator.js';
import { dataElementGenerator } from './data-element.generator.js';

/**
 * Generator for CDEScoringFactors
 * All factors are between 0 and 1
 */
export const cdeScoringFactorsGenerator = (): fc.Arbitrary<CDEScoringFactors> =>
  fc.record({
    regulatoryCalculationUsage: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
    crossReportUsage: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
    financialImpact: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
    regulatoryScrutiny: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true })
  });

/**
 * Generator for CDEScore
 */
export const cdeScoreGenerator = (): fc.Arbitrary<CDEScore> =>
  fc.record({
    elementId: fc.uuid(),
    overallScore: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
    factors: cdeScoringFactorsGenerator(),
    rationale: fc.string({ minLength: 10, maxLength: 200 })
  });

/**
 * Generator for CDE
 */
export const cdeGenerator = (): fc.Arbitrary<CDE> =>
  fc.record({
    id: fc.uuid(),
    elementId: fc.uuid(),
    name: fc.oneof(
      fc.constantFrom('Customer ID', 'Account Balance', 'Transaction Amount', 'Risk Score', 'Credit Rating'),
      fc.string({ minLength: 5, maxLength: 30 })
        .filter(s => s.trim().length >= 5 && /^[a-zA-Z][a-zA-Z0-9\s]*[a-zA-Z0-9]$/.test(s.trim()))
    ),
    businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
    criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
    dataOwner: fc.option(nonEmptyStringGenerator()),
    dataOwnerEmail: fc.option(emailGenerator()),
    status: cdeStatusGenerator(),
    approvedBy: fc.option(nonEmptyStringGenerator()),
    approvedAt: fc.option(dateGenerator())
  });


/**
 * Generator for CDE with specific status
 */
export const cdeWithStatusGenerator = (status: CDEStatus): fc.Arbitrary<CDE> =>
  fc.record({
    id: fc.uuid(),
    elementId: fc.uuid(),
    name: nonEmptyStringGenerator(),
    businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
    criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
    dataOwner: fc.option(nonEmptyStringGenerator()),
    dataOwnerEmail: fc.option(emailGenerator()),
    status: fc.constant(status),
    approvedBy: fc.option(nonEmptyStringGenerator()),
    approvedAt: fc.option(dateGenerator())
  });

/**
 * Generator for approved CDE (must have owner per Property 10)
 */
export const approvedCDEGenerator = (): fc.Arbitrary<CDE> =>
  fc.record({
    id: fc.uuid(),
    elementId: fc.uuid(),
    name: nonEmptyStringGenerator(),
    businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
    criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
    dataOwner: nonEmptyStringGenerator(), // Required for approved CDEs
    dataOwnerEmail: emailGenerator(),
    status: fc.constant('approved' as CDEStatus),
    approvedBy: nonEmptyStringGenerator(),
    approvedAt: dateGenerator()
  });

/**
 * Generator for CDEInventory
 */
export const cdeInventoryGenerator = (): fc.Arbitrary<CDEInventory> =>
  fc.record({
    id: fc.uuid(),
    reportId: fc.uuid(),
    cdes: fc.array(cdeGenerator(), { minLength: 0, maxLength: 10 }),
    version: fc.integer({ min: 1, max: 100 }),
    status: artifactStatusGenerator(),
    createdAt: dateGenerator(),
    updatedAt: dateGenerator()
  });

/**
 * Generator for ScoringContext
 */
export const scoringContextGenerator = (): fc.Arbitrary<ScoringContext> =>
  fc.record({
    reportId: fc.uuid(),
    existingCDEs: fc.option(fc.array(cdeGenerator(), { minLength: 0, maxLength: 5 })),
    threshold: fc.float({ min: Math.fround(0.5), max: Math.fround(0.9), noNaN: true })
  });

/**
 * Generator for OwnerSuggestion
 */
export const ownerSuggestionGenerator = (): fc.Arbitrary<OwnerSuggestion> =>
  fc.record({
    cdeId: fc.uuid(),
    suggestedOwner: nonEmptyStringGenerator(),
    suggestedOwnerEmail: emailGenerator(),
    confidence: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
    rationale: fc.string({ minLength: 10, maxLength: 200 })
  });

/**
 * Generator for a pair of CDEInventories for reconciliation testing
 */
export const cdeInventoryPairGenerator = (): fc.Arbitrary<{ existing: CDEInventory; new: CDEInventory }> =>
  fc.record({
    existing: cdeInventoryGenerator(),
    new: cdeInventoryGenerator()
  });
