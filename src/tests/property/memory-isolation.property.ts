/**
 * **Feature: regulatory-ai-assistant, Property 1: Memory Isolation**
 * 
 * Memory data is strictly isolated by tenant and user scope.
 * - Memory queries never return data from other tenants
 * - Long-term memory is user-scoped within tenant
 * 
 * **Validates: Requirements 3.5, 10.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryMemoryService } from '../../services/memory-service.js';
import {
  Message,
  LearnedKnowledge,
  Episode,
  EpisodeType,
} from '../../types/memory.js';

// Property test configuration - reduced for faster execution
const propertyConfig = {
  numRuns: 25,
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
 * Generator for message role
 */
const messageRoleGenerator = (): fc.Arbitrary<'user' | 'assistant' | 'system'> =>
  fc.constantFrom('user', 'assistant', 'system');

/**
 * Generator for episode type
 */
const episodeTypeGenerator = (): fc.Arbitrary<EpisodeType> =>
  fc.constantFrom('query', 'decision', 'recommendation', 'action', 'error');

/**
 * Generator for knowledge type
 */
const knowledgeTypeGenerator = (): fc.Arbitrary<'mapping' | 'preference' | 'pattern' | 'correction'> =>
  fc.constantFrom('mapping', 'preference', 'pattern', 'correction');

/**
 * Generator for non-empty strings
 */
const nonEmptyStringGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 });

/**
 * Generator for dates
 */
const dateGenerator = (): fc.Arbitrary<Date> =>
  fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') });

/**
 * Generator for Message
 */
const messageGenerator = (): fc.Arbitrary<Message> =>
  fc.record({
    id: fc.uuid(),
    role: messageRoleGenerator(),
    content: nonEmptyStringGenerator(),
    timestamp: dateGenerator(),
    toolCalls: fc.constant(undefined),
    references: fc.constant(undefined),
    isStreaming: fc.constant(false),
  });

/**
 * Generator for learned knowledge data (without id, userId, tenantId, learnedAt, usageCount)
 */
const learnedKnowledgeDataGenerator = (): fc.Arbitrary<Omit<LearnedKnowledge, 'id' | 'userId' | 'tenantId' | 'learnedAt' | 'usageCount'>> =>
  fc.record({
    knowledgeType: knowledgeTypeGenerator(),
    content: nonEmptyStringGenerator(),
    data: fc.record({
      key: nonEmptyStringGenerator(),
      value: nonEmptyStringGenerator(),
    }),
    confidence: fc.float({ min: 0, max: 1 }),
    lastUsedAt: fc.option(dateGenerator()),
    relatedEntities: fc.array(fc.uuid(), { minLength: 0, maxLength: 3 }),
  });

/**
 * Generator for two distinct tenant IDs
 */
const distinctTenantPairGenerator = (): fc.Arbitrary<[string, string]> =>
  fc.tuple(tenantIdGenerator(), tenantIdGenerator())
    .filter(([t1, t2]) => t1 !== t2);

/**
 * Generator for two distinct user IDs
 */
const distinctUserPairGenerator = (): fc.Arbitrary<[string, string]> =>
  fc.tuple(userIdGenerator(), userIdGenerator())
    .filter(([u1, u2]) => u1 !== u2);

// ==================== Property Tests ====================

describe('Property 1: Memory Isolation', () => {
  let memoryService: InMemoryMemoryService;

  beforeEach(() => {
    memoryService = new InMemoryMemoryService();
  });

  describe('Tenant Isolation', () => {
    it('should never return learned knowledge from other tenants', async () => {
      await fc.assert(
        fc.asyncProperty(
          distinctTenantPairGenerator(),
          userIdGenerator(),
          learnedKnowledgeDataGenerator(),
          async ([tenantA, tenantB], userId, knowledgeData) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Store knowledge for tenant A
            const storedKnowledge = await memoryService.storeLearnedKnowledge(
              userId,
              tenantA,
              knowledgeData
            );

            // Query knowledge for tenant B (should be empty)
            const tenantBKnowledge = await memoryService.getLearnedKnowledge(userId, tenantB);

            // Verify tenant B cannot see tenant A's data
            expect(tenantBKnowledge).toHaveLength(0);

            // Verify tenant A can see their own data
            const tenantAKnowledge = await memoryService.getLearnedKnowledge(userId, tenantA);
            expect(tenantAKnowledge).toHaveLength(1);
            expect(tenantAKnowledge[0].id).toBe(storedKnowledge.id);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should never return episodes from other tenants', async () => {
      await fc.assert(
        fc.asyncProperty(
          distinctTenantPairGenerator(),
          userIdGenerator(),
          sessionIdGenerator(),
          episodeTypeGenerator(),
          nonEmptyStringGenerator(),
          async ([tenantA, tenantB], userId, sessionId, episodeType, content) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Create episode data for tenant A
            const episodeData: Omit<Episode, 'id'> = {
              sessionId,
              userId,
              tenantId: tenantA,
              timestamp: new Date(),
              type: episodeType,
              content,
              context: { key: 'value' },
              relatedEntities: [],
            };

            // Record episode for tenant A
            const recordedEpisode = await memoryService.recordEpisode(episodeData);

            // Query episodes for tenant B (should be empty)
            const tenantBEpisodes = await memoryService.queryEpisodes({
              userId,
              tenantId: tenantB,
            });

            // Verify tenant B cannot see tenant A's episodes
            expect(tenantBEpisodes).toHaveLength(0);

            // Verify tenant A can see their own episodes
            const tenantAEpisodes = await memoryService.queryEpisodes({
              userId,
              tenantId: tenantA,
            });
            expect(tenantAEpisodes.length).toBeGreaterThanOrEqual(1);
            expect(tenantAEpisodes.some(e => e.id === recordedEpisode.id)).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should never return user preferences from other tenants', async () => {
      await fc.assert(
        fc.asyncProperty(
          distinctTenantPairGenerator(),
          userIdGenerator(),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          async ([tenantA, tenantB], userId, preferredReports) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Store preferences for tenant A
            await memoryService.updateUserPreferences(userId, tenantA, {
              preferredReports,
            });

            // Query preferences for tenant B (should be null or default)
            const tenantBPrefs = await memoryService.getUserPreferences(userId, tenantB);

            // Verify tenant B cannot see tenant A's preferences
            if (tenantBPrefs !== null) {
              // If preferences exist, they should not contain tenant A's data
              expect(tenantBPrefs.preferredReports).not.toEqual(preferredReports);
            }

            // Verify tenant A can see their own preferences
            const tenantAPrefs = await memoryService.getUserPreferences(userId, tenantA);
            expect(tenantAPrefs).not.toBeNull();
            expect(tenantAPrefs!.preferredReports).toEqual(preferredReports);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('User Isolation within Tenant', () => {
    it('should scope long-term memory to user within tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdGenerator(),
          distinctUserPairGenerator(),
          learnedKnowledgeDataGenerator(),
          async (tenantId, [userA, userB], knowledgeData) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Store knowledge for user A
            const storedKnowledge = await memoryService.storeLearnedKnowledge(
              userA,
              tenantId,
              knowledgeData
            );

            // Query knowledge for user B in same tenant (should be empty)
            const userBKnowledge = await memoryService.getLearnedKnowledge(userB, tenantId);

            // Verify user B cannot see user A's data
            expect(userBKnowledge).toHaveLength(0);

            // Verify user A can see their own data
            const userAKnowledge = await memoryService.getLearnedKnowledge(userA, tenantId);
            expect(userAKnowledge).toHaveLength(1);
            expect(userAKnowledge[0].id).toBe(storedKnowledge.id);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should scope user preferences to user within tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdGenerator(),
          distinctUserPairGenerator(),
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }),
          async (tenantId, [userA, userB], preferredReports) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Store preferences for user A
            await memoryService.updateUserPreferences(userA, tenantId, {
              preferredReports,
            });

            // Query preferences for user B in same tenant (should be null or default)
            const userBPrefs = await memoryService.getUserPreferences(userB, tenantId);

            // Verify user B cannot see user A's preferences
            if (userBPrefs !== null) {
              expect(userBPrefs.preferredReports).not.toEqual(preferredReports);
            }

            // Verify user A can see their own preferences
            const userAPrefs = await memoryService.getUserPreferences(userA, tenantId);
            expect(userAPrefs).not.toBeNull();
            expect(userAPrefs!.preferredReports).toEqual(preferredReports);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should scope episodes to user within tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          tenantIdGenerator(),
          distinctUserPairGenerator(),
          sessionIdGenerator(),
          episodeTypeGenerator(),
          nonEmptyStringGenerator(),
          async (tenantId, [userA, userB], sessionId, episodeType, content) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Create episode data for user A
            const episodeData: Omit<Episode, 'id'> = {
              sessionId,
              userId: userA,
              tenantId,
              timestamp: new Date(),
              type: episodeType,
              content,
              context: { key: 'value' },
              relatedEntities: [],
            };

            // Record episode for user A
            const recordedEpisode = await memoryService.recordEpisode(episodeData);

            // Query episodes for user B in same tenant (should be empty)
            const userBEpisodes = await memoryService.queryEpisodes({
              userId: userB,
              tenantId,
            });

            // Verify user B cannot see user A's episodes
            expect(userBEpisodes).toHaveLength(0);

            // Verify user A can see their own episodes
            const userAEpisodes = await memoryService.queryEpisodes({
              userId: userA,
              tenantId,
            });
            expect(userAEpisodes.length).toBeGreaterThanOrEqual(1);
            expect(userAEpisodes.some(e => e.id === recordedEpisode.id)).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Cross-Tenant and Cross-User Isolation', () => {
    it('should isolate data across both tenant and user boundaries', async () => {
      await fc.assert(
        fc.asyncProperty(
          distinctTenantPairGenerator(),
          distinctUserPairGenerator(),
          learnedKnowledgeDataGenerator(),
          async ([tenantA, tenantB], [userA, userB], knowledgeData) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Store knowledge for userA in tenantA
            const storedKnowledge = await memoryService.storeLearnedKnowledge(
              userA,
              tenantA,
              knowledgeData
            );

            // Test all other combinations should not see the data
            const combinations = [
              { userId: userA, tenantId: tenantB },  // Same user, different tenant
              { userId: userB, tenantId: tenantA },  // Different user, same tenant
              { userId: userB, tenantId: tenantB },  // Different user, different tenant
            ];

            for (const combo of combinations) {
              const knowledge = await memoryService.getLearnedKnowledge(combo.userId, combo.tenantId);
              expect(knowledge).toHaveLength(0);
            }

            // Only userA in tenantA should see the data
            const userAKnowledge = await memoryService.getLearnedKnowledge(userA, tenantA);
            expect(userAKnowledge).toHaveLength(1);
            expect(userAKnowledge[0].id).toBe(storedKnowledge.id);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Session Isolation', () => {
    it('should isolate session context by session ID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(sessionIdGenerator(), sessionIdGenerator()).filter(([s1, s2]) => s1 !== s2),
          userIdGenerator(),
          tenantIdGenerator(),
          fc.array(messageGenerator(), { minLength: 1, maxLength: 5 }),
          async ([sessionA, sessionB], userId, tenantId, messages) => {
            // Clear memory service for clean state
            await memoryService.clearAll();

            // Initialize session A
            await memoryService.initializeSession(sessionA, userId, tenantId);
            await memoryService.updateSessionContext(sessionA, messages);

            // Session B should not have session A's messages
            const sessionBContext = await memoryService.getSessionContext(sessionB);
            expect(sessionBContext).toBeNull();

            // Session A should have its messages
            const sessionAContext = await memoryService.getSessionContext(sessionA);
            expect(sessionAContext).not.toBeNull();
            expect(sessionAContext!.messages).toHaveLength(messages.length);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
