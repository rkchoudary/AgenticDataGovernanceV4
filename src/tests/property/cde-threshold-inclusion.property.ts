/**
 * **Feature: agentic-data-governance, Property 9: CDE Threshold Inclusion**
 * 
 * For any data element with a criticality score at or above the configured threshold, 
 * the element must be included in the CDE Inventory with a non-empty rationale field.
 * 
 * **Validates: Requirements 4.2**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { CDEIdentificationAgent } from '../../agents/cde-identification-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { DataElement, CDEScore, ScoringContext } from '../../types/index.js';
import { dataElementGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 9: CDE Threshold Inclusion', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: CDEIdentificationAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new CDEIdentificationAgent(repository);
  });

  it('should include all elements scoring at or above threshold in inventory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 15 }),
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.9), noNaN: true }),
        async (elements, threshold) => {
          const context: ScoringContext = {
            reportId: 'test-report',
            threshold
          };

          // Score all elements
          const scores = await agent.scoreDataElements(elements, context);
          
          // Generate inventory with the threshold
          const inventory = await agent.generateCDEInventory(scores, threshold);

          // Find scores at or above threshold
          const scoresAboveThreshold = scores.filter(s => s.overallScore >= threshold);
          
          // Property: All elements scoring at or above threshold are in inventory
          expect(inventory.cdes.length).toBe(scoresAboveThreshold.length);

          // Property: Each CDE in inventory corresponds to a score at or above threshold
          for (const cde of inventory.cdes) {
            const correspondingScore = scores.find(s => s.elementId === cde.elementId);
            expect(correspondingScore).toBeDefined();
            expect(correspondingScore!.overallScore).toBeGreaterThanOrEqual(threshold);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should exclude all elements scoring below threshold from inventory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 15 }),
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.9), noNaN: true }),
        async (elements, threshold) => {
          const context: ScoringContext = {
            reportId: 'test-report',
            threshold
          };

          const scores = await agent.scoreDataElements(elements, context);
          const inventory = await agent.generateCDEInventory(scores, threshold);

          // Find scores below threshold
          const scoresBelowThreshold = scores.filter(s => s.overallScore < threshold);
          const belowThresholdElementIds = new Set(scoresBelowThreshold.map(s => s.elementId));

          // Property: No element scoring below threshold is in inventory
          for (const cde of inventory.cdes) {
            expect(belowThresholdElementIds.has(cde.elementId)).toBe(false);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should include non-empty rationale for all CDEs in inventory', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 15 }),
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.9), noNaN: true }),
        async (elements, threshold) => {
          const context: ScoringContext = {
            reportId: 'test-report',
            threshold
          };

          const scores = await agent.scoreDataElements(elements, context);
          const inventory = await agent.generateCDEInventory(scores, threshold);

          // Property: Every CDE has a non-empty rationale
          for (const cde of inventory.cdes) {
            expect(cde.criticalityRationale).toBeDefined();
            expect(cde.criticalityRationale.length).toBeGreaterThan(0);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve rationale from score in CDE', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 15 }),
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.9), noNaN: true }),
        async (elements, threshold) => {
          const context: ScoringContext = {
            reportId: 'test-report',
            threshold
          };

          const scores = await agent.scoreDataElements(elements, context);
          const inventory = await agent.generateCDEInventory(scores, threshold);

          // Property: CDE rationale matches the score rationale
          for (const cde of inventory.cdes) {
            const correspondingScore = scores.find(s => s.elementId === cde.elementId);
            expect(correspondingScore).toBeDefined();
            expect(cde.criticalityRationale).toBe(correspondingScore!.rationale);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should set initial status to pending_approval for all CDEs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 15 }),
        fc.float({ min: Math.fround(0.3), max: Math.fround(0.9), noNaN: true }),
        async (elements, threshold) => {
          const context: ScoringContext = {
            reportId: 'test-report',
            threshold
          };

          const scores = await agent.scoreDataElements(elements, context);
          const inventory = await agent.generateCDEInventory(scores, threshold);

          // Property: All CDEs start with pending_approval status
          for (const cde of inventory.cdes) {
            expect(cde.status).toBe('pending_approval');
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should handle edge case of threshold at exactly score value', async () => {
    await fc.assert(
      fc.asyncProperty(
        dataElementGenerator(),
        async (element) => {
          const context: ScoringContext = {
            reportId: 'test-report',
            threshold: 0.5 // Will be compared against actual score
          };

          const scores = await agent.scoreDataElements([element], context);
          const score = scores[0];
          
          // Use the exact score as threshold
          const inventory = await agent.generateCDEInventory(scores, score.overallScore);

          // Property: Element with score exactly at threshold should be included
          expect(inventory.cdes.length).toBe(1);
          expect(inventory.cdes[0].elementId).toBe(element.id);

          return true;
        }
      ),
      propertyConfig
    );
  });
});
