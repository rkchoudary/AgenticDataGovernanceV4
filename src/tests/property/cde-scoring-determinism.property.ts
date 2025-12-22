/**
 * **Feature: agentic-data-governance, Property 8: CDE Scoring Determinism**
 * 
 * For any data element with identical characteristics (regulatory calculation usage, 
 * cross-report usage, financial impact, regulatory scrutiny scores), the CDE Identification 
 * Agent must produce identical overall criticality scores.
 * 
 * **Validates: Requirements 4.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { CDEIdentificationAgent } from '../../agents/cde-identification-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { DataElement, ScoringContext } from '../../types/index.js';
import { dataElementGenerator, scoringContextGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 8: CDE Scoring Determinism', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: CDEIdentificationAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new CDEIdentificationAgent(repository);
  });

  it('should produce identical scores for identical elements', async () => {
    await fc.assert(
      fc.asyncProperty(
        dataElementGenerator(),
        scoringContextGenerator(),
        async (element, context) => {
          // Score the same element twice
          const scores1 = await agent.scoreDataElements([element], context);
          const scores2 = await agent.scoreDataElements([element], context);

          // Property: Identical elements produce identical scores
          expect(scores1.length).toBe(1);
          expect(scores2.length).toBe(1);
          expect(scores1[0].overallScore).toBe(scores2[0].overallScore);
          expect(scores1[0].factors).toEqual(scores2[0].factors);

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should produce identical scores for elements with same characteristics', async () => {
    await fc.assert(
      fc.asyncProperty(
        dataElementGenerator(),
        scoringContextGenerator(),
        async (baseElement, context) => {
          // Create two elements with identical characteristics but different IDs
          const element1: DataElement = { ...baseElement, id: 'id-1' };
          const element2: DataElement = { ...baseElement, id: 'id-2' };

          const scores1 = await agent.scoreDataElements([element1], context);
          const scores2 = await agent.scoreDataElements([element2], context);

          // Property: Elements with same characteristics get same scores
          expect(scores1[0].overallScore).toBe(scores2[0].overallScore);
          expect(scores1[0].factors.regulatoryCalculationUsage)
            .toBe(scores2[0].factors.regulatoryCalculationUsage);
          expect(scores1[0].factors.crossReportUsage)
            .toBe(scores2[0].factors.crossReportUsage);
          expect(scores1[0].factors.financialImpact)
            .toBe(scores2[0].factors.financialImpact);
          expect(scores1[0].factors.regulatoryScrutiny)
            .toBe(scores2[0].factors.regulatoryScrutiny);

          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should produce consistent scores across multiple scoring calls', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 10 }),
        scoringContextGenerator(),
        async (elements, context) => {
          // Score elements multiple times
          const scores1 = await agent.scoreDataElements(elements, context);
          const scores2 = await agent.scoreDataElements(elements, context);
          const scores3 = await agent.scoreDataElements(elements, context);

          // Property: All scoring calls produce identical results
          expect(scores1.length).toBe(elements.length);
          expect(scores2.length).toBe(elements.length);
          expect(scores3.length).toBe(elements.length);

          for (let i = 0; i < elements.length; i++) {
            expect(scores1[i].overallScore).toBe(scores2[i].overallScore);
            expect(scores2[i].overallScore).toBe(scores3[i].overallScore);
            expect(scores1[i].factors).toEqual(scores2[i].factors);
            expect(scores2[i].factors).toEqual(scores3[i].factors);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should produce scores within valid range [0, 1]', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 10 }),
        scoringContextGenerator(),
        async (elements, context) => {
          const scores = await agent.scoreDataElements(elements, context);

          // Property: All scores are within valid range
          for (const score of scores) {
            expect(score.overallScore).toBeGreaterThanOrEqual(0);
            expect(score.overallScore).toBeLessThanOrEqual(1);
            expect(score.factors.regulatoryCalculationUsage).toBeGreaterThanOrEqual(0);
            expect(score.factors.regulatoryCalculationUsage).toBeLessThanOrEqual(1);
            expect(score.factors.crossReportUsage).toBeGreaterThanOrEqual(0);
            expect(score.factors.crossReportUsage).toBeLessThanOrEqual(1);
            expect(score.factors.financialImpact).toBeGreaterThanOrEqual(0);
            expect(score.factors.financialImpact).toBeLessThanOrEqual(1);
            expect(score.factors.regulatoryScrutiny).toBeGreaterThanOrEqual(0);
            expect(score.factors.regulatoryScrutiny).toBeLessThanOrEqual(1);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should produce non-empty rationale for all scores', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 10 }),
        scoringContextGenerator(),
        async (elements, context) => {
          const scores = await agent.scoreDataElements(elements, context);

          // Property: All scores have non-empty rationale
          for (const score of scores) {
            expect(score.rationale).toBeDefined();
            expect(score.rationale.length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve element ID in score output', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 10 }),
        scoringContextGenerator(),
        async (elements, context) => {
          const scores = await agent.scoreDataElements(elements, context);

          // Property: Each score references the correct element ID
          const elementIds = new Set(elements.map(e => e.id));
          const scoreElementIds = new Set(scores.map(s => s.elementId));

          expect(scoreElementIds.size).toBe(elementIds.size);
          for (const score of scores) {
            expect(elementIds.has(score.elementId)).toBe(true);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });
});
