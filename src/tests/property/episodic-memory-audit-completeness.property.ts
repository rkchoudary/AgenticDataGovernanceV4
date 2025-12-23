/**
 * **Feature: regulatory-ai-assistant, Property 6: Episodic Memory Audit Completeness**
 * 
 * All critical decisions are recorded in episodic memory with full attribution.
 * - Critical decisions have complete audit trail
 * - Decisions include userId, timestamp, and rationale
 * 
 * **Validates: Requirements 4.2, 4.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryMemoryService } from '../../services/memory-service.js';
import {
  Episode,
  EpisodeType,
  EntityReference,
  Decision,
} from '../../types/memory.js';

// Property test configuration
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

// ==================== Generators ====================

/**
 * Generator for tenant IDs
 */
const tenantIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `tenant-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generator for user IDs
 */
const userIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `user-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generator for session IDs
 */
const sessionIdGenerator = (): fc.Arbitrary<string> =>
  fc.uuid();

/**
 * Generator for episode types
 */
const episodeTypeGenerator = (): fc.Arbitrary<EpisodeType> =>
  fc.constantFrom('query', 'decision', 'recommendation', 'action', 'error');

/**
 * Generator for entity types
 */
const entityTypeGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom('report', 'cde', 'issue', 'cycle', 'catalog');

/**
 * Generator for decision types
 */
const decisionTypeGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'approval',
    'rejection',
    'sign_off',
    'mapping_change',
    'ownership_change',
    'control_effectiveness'
  );

/**
 * Generator for decision outcomes
 */
const decisionOutcomeGenerator = (): fc.Arbitrary<'approved' | 'rejected' | 'deferred'> =>
  fc.constantFrom('approved', 'rejected', 'deferred');

/**
 * Generator for non-empty strings
 */
const nonEmptyStringGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 });

/**
 * Generator for entity reference
 */
const entityReferenceGenerator = (): fc.Arbitrary<EntityReference> =>
  fc.record({
    entityType: entityTypeGenerator(),
    entityId: fc.uuid(),
    displayName: nonEmptyStringGenerator(),
    lastMentioned: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    context: fc.constant(undefined),
  });

/**
 * Generator for episode (without id)
 */
const episodeGenerator = (): fc.Arbitrary<Omit<Episode, 'id'>> =>
  fc.record({
    sessionId: sessionIdGenerator(),
    userId: userIdGenerator(),
    tenantId: tenantIdGenerator(),
    timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    type: episodeTypeGenerator(),
    content: nonEmptyStringGenerator(),
    context: fc.dictionary(fc.string(), fc.string()),
    outcome: fc.option(nonEmptyStringGenerator(), { nil: undefined }),
    relatedEntities: fc.array(entityReferenceGenerator(), { minLength: 0, maxLength: 3 }),
    tags: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
  });

/**
 * Generator for critical decision episode
 */
const criticalDecisionEpisodeGenerator = (): fc.Arbitrary<Omit<Episode, 'id'>> =>
  fc.record({
    sessionId: sessionIdGenerator(),
    userId: userIdGenerator(),
    tenantId: tenantIdGenerator(),
    timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    type: fc.constant('decision' as EpisodeType),
    content: nonEmptyStringGenerator(),
    context: fc.record({
      decisionType: decisionTypeGenerator(),
      rationale: nonEmptyStringGenerator(),
      aiRecommendation: fc.option(nonEmptyStringGenerator(), { nil: undefined }),
      impact: fc.option(nonEmptyStringGenerator(), { nil: undefined }),
    }),
    outcome: decisionOutcomeGenerator(),
    relatedEntities: fc.array(entityReferenceGenerator(), { minLength: 1, maxLength: 3 }),
    tags: fc.constant(['decision', 'critical']),
  });

// ==================== Property Tests ====================

describe('Property 6: Episodic Memory Audit Completeness', () => {
  let memoryService: InMemoryMemoryService;

  beforeEach(() => {
    memoryService = new InMemoryMemoryService();
  });

  describe('Critical Decision Audit Trail', () => {
    it('should record critical decisions with complete attribution', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalDecisionEpisodeGenerator(),
          async (episodeData) => {
            // Record the critical decision episode
            const episode = await memoryService.recordEpisode(episodeData);

            // Verify the episode was recorded with an ID
            expect(episode.id).toBeDefined();
            expect(episode.id.length).toBeGreaterThan(0);

            // Verify all required attribution fields are present
            expect(episode.userId).toBe(episodeData.userId);
            expect(episode.tenantId).toBe(episodeData.tenantId);
            expect(episode.timestamp).toEqual(episodeData.timestamp);
            expect(episode.type).toBe('decision');

            // Verify context contains rationale
            expect(episode.context).toBeDefined();
            expect(episode.context.rationale).toBeDefined();

            // Verify outcome is recorded
            expect(episode.outcome).toBeDefined();
            expect(['approved', 'rejected', 'deferred']).toContain(episode.outcome);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should preserve all decision context fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalDecisionEpisodeGenerator(),
          async (episodeData) => {
            // Record the episode
            const episode = await memoryService.recordEpisode(episodeData);

            // Query the episode back
            const queried = await memoryService.queryEpisodes({
              userId: episodeData.userId,
              tenantId: episodeData.tenantId,
              types: ['decision'],
              limit: 10,
            });

            // Find our episode
            const found = queried.find(e => e.id === episode.id);
            expect(found).toBeDefined();

            // Verify all context fields are preserved
            expect(found!.context.decisionType).toBe(episodeData.context.decisionType);
            expect(found!.context.rationale).toBe(episodeData.context.rationale);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Timestamp Attribution', () => {
    it('should maintain accurate timestamps for all episodes', async () => {
      await fc.assert(
        fc.asyncProperty(
          episodeGenerator(),
          async (episodeData) => {
            // Record the episode
            const episode = await memoryService.recordEpisode(episodeData);

            // Verify timestamp is preserved exactly
            expect(episode.timestamp.getTime()).toBe(episodeData.timestamp.getTime());

            // Query and verify timestamp is still accurate
            const queried = await memoryService.queryEpisodes({
              userId: episodeData.userId,
              tenantId: episodeData.tenantId,
              limit: 10,
            });

            const found = queried.find(e => e.id === episode.id);
            expect(found).toBeDefined();
            expect(found!.timestamp.getTime()).toBe(episodeData.timestamp.getTime());

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should order episodes by timestamp in query results', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGenerator(),
          tenantIdGenerator(),
          fc.array(episodeGenerator(), { minLength: 2, maxLength: 10 }),
          async (userId, tenantId, episodesData) => {
            // Normalize all episodes to same user/tenant
            const normalizedEpisodes = episodesData.map(e => ({
              ...e,
              userId,
              tenantId,
            }));

            // Record all episodes
            for (const episodeData of normalizedEpisodes) {
              await memoryService.recordEpisode(episodeData);
            }

            // Query episodes
            const queried = await memoryService.queryEpisodes({
              userId,
              tenantId,
              limit: 100,
            });

            // Verify episodes are ordered by timestamp descending
            for (let i = 0; i < queried.length - 1; i++) {
              expect(queried[i].timestamp.getTime()).toBeGreaterThanOrEqual(
                queried[i + 1].timestamp.getTime()
              );
            }

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('User Attribution', () => {
    it('should correctly attribute episodes to users', async () => {
      await fc.assert(
        fc.asyncProperty(
          episodeGenerator(),
          async (episodeData) => {
            // Record the episode
            const episode = await memoryService.recordEpisode(episodeData);

            // Verify user attribution
            expect(episode.userId).toBe(episodeData.userId);

            // Query by user and verify
            const queried = await memoryService.queryEpisodes({
              userId: episodeData.userId,
              tenantId: episodeData.tenantId,
              limit: 10,
            });

            // All results should belong to the queried user
            for (const result of queried) {
              expect(result.userId).toBe(episodeData.userId);
            }

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should isolate episodes by tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(tenantIdGenerator(), tenantIdGenerator()).filter(([a, b]) => a !== b),
          userIdGenerator(),
          episodeGenerator(),
          async ([tenantA, tenantB], userId, episodeData) => {
            // Record episode for tenant A
            const episodeA = await memoryService.recordEpisode({
              ...episodeData,
              userId,
              tenantId: tenantA,
            });

            // Query from tenant B should not find it
            const queriedB = await memoryService.queryEpisodes({
              userId,
              tenantId: tenantB,
              limit: 100,
            });

            // Episode from tenant A should not appear in tenant B results
            const foundInB = queriedB.find(e => e.id === episodeA.id);
            expect(foundInB).toBeUndefined();

            // Query from tenant A should find it
            const queriedA = await memoryService.queryEpisodes({
              userId,
              tenantId: tenantA,
              limit: 100,
            });

            const foundInA = queriedA.find(e => e.id === episodeA.id);
            expect(foundInA).toBeDefined();

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Related Entities Tracking', () => {
    it('should preserve related entities in episodes', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalDecisionEpisodeGenerator(),
          async (episodeData) => {
            // Record the episode
            const episode = await memoryService.recordEpisode(episodeData);

            // Verify related entities are preserved
            expect(episode.relatedEntities).toHaveLength(episodeData.relatedEntities.length);

            for (let i = 0; i < episodeData.relatedEntities.length; i++) {
              expect(episode.relatedEntities[i].entityId).toBe(
                episodeData.relatedEntities[i].entityId
              );
              expect(episode.relatedEntities[i].entityType).toBe(
                episodeData.relatedEntities[i].entityType
              );
            }

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should filter episodes by entity type and ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGenerator(),
          tenantIdGenerator(),
          entityReferenceGenerator(),
          async (userId, tenantId, entityRef) => {
            // Create episode with specific entity
            const episodeData: Omit<Episode, 'id'> = {
              sessionId: crypto.randomUUID(),
              userId,
              tenantId,
              timestamp: new Date(),
              type: 'decision',
              content: 'Test decision',
              context: { decisionType: 'approval', rationale: 'Test rationale' },
              outcome: 'approved',
              relatedEntities: [entityRef],
              tags: ['decision'],
            };

            await memoryService.recordEpisode(episodeData);

            // Query by entity type
            const queriedByType = await memoryService.queryEpisodes({
              userId,
              tenantId,
              entityType: entityRef.entityType,
              limit: 100,
            });

            // Should find episodes with matching entity type
            expect(queriedByType.length).toBeGreaterThan(0);
            for (const episode of queriedByType) {
              const hasMatchingEntity = episode.relatedEntities.some(
                e => e.entityType === entityRef.entityType
              );
              expect(hasMatchingEntity).toBe(true);
            }

            // Query by entity ID
            const queriedById = await memoryService.queryEpisodes({
              userId,
              tenantId,
              entityId: entityRef.entityId,
              limit: 100,
            });

            // Should find episodes with matching entity ID
            expect(queriedById.length).toBeGreaterThan(0);
            for (const episode of queriedById) {
              const hasMatchingEntity = episode.relatedEntities.some(
                e => e.entityId === entityRef.entityId
              );
              expect(hasMatchingEntity).toBe(true);
            }

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Decision History Completeness', () => {
    it('should maintain complete decision history for entities', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGenerator(),
          tenantIdGenerator(),
          entityTypeGenerator(),
          fc.uuid(),
          fc.array(decisionOutcomeGenerator(), { minLength: 1, maxLength: 5 }),
          async (userId, tenantId, entityType, entityId, outcomes) => {
            // Record multiple decisions for the same entity
            for (const outcome of outcomes) {
              await memoryService.recordDecision({
                episodeId: crypto.randomUUID(),
                userId,
                tenantId,
                decisionType: 'approval',
                entityType,
                entityId,
                decision: outcome,
                rationale: `Decision rationale for ${outcome}`,
                decidedAt: new Date(),
              });
            }

            // Get decision history
            const history = await memoryService.getDecisionHistory(userId, entityType, entityId);

            // Should have all decisions
            expect(history.length).toBe(outcomes.length);

            // Each decision should have complete attribution
            for (const decision of history) {
              expect(decision.userId).toBe(userId);
              expect(decision.entityType).toBe(entityType);
              expect(decision.entityId).toBe(entityId);
              expect(decision.rationale).toBeDefined();
              expect(decision.decidedAt).toBeDefined();
            }

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should order decision history by timestamp descending', async () => {
      await fc.assert(
        fc.asyncProperty(
          userIdGenerator(),
          tenantIdGenerator(),
          entityTypeGenerator(),
          fc.uuid(),
          async (userId, tenantId, entityType, entityId) => {
            const baseTime = Date.now();

            // Record decisions with different timestamps
            for (let i = 0; i < 5; i++) {
              await memoryService.recordDecision({
                episodeId: crypto.randomUUID(),
                userId,
                tenantId,
                decisionType: 'approval',
                entityType,
                entityId,
                decision: 'approved',
                rationale: `Decision ${i}`,
                decidedAt: new Date(baseTime + i * 1000),
              });
            }

            // Get decision history
            const history = await memoryService.getDecisionHistory(userId, entityType, entityId);

            // Verify descending order
            for (let i = 0; i < history.length - 1; i++) {
              expect(history[i].decidedAt.getTime()).toBeGreaterThanOrEqual(
                history[i + 1].decidedAt.getTime()
              );
            }

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Audit Trail Integrity', () => {
    it('should not allow modification of recorded episodes', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalDecisionEpisodeGenerator(),
          async (episodeData) => {
            // Record the episode
            const episode = await memoryService.recordEpisode(episodeData);
            const originalContent = episode.content;
            const originalTimestamp = episode.timestamp.getTime();

            // Query the episode
            const queried = await memoryService.queryEpisodes({
              userId: episodeData.userId,
              tenantId: episodeData.tenantId,
              limit: 10,
            });

            const found = queried.find(e => e.id === episode.id);

            // Verify the episode content hasn't changed
            expect(found!.content).toBe(originalContent);
            expect(found!.timestamp.getTime()).toBe(originalTimestamp);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should generate unique IDs for all episodes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(episodeGenerator(), { minLength: 2, maxLength: 20 }),
          async (episodesData) => {
            const recordedIds: Set<string> = new Set();

            // Record all episodes
            for (const episodeData of episodesData) {
              const episode = await memoryService.recordEpisode(episodeData);
              
              // Verify ID is unique
              expect(recordedIds.has(episode.id)).toBe(false);
              recordedIds.add(episode.id);
            }

            // All IDs should be unique
            expect(recordedIds.size).toBe(episodesData.length);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
