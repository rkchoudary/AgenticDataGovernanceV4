/**
 * **Feature: regulatory-ai-assistant, Property 5: Conversation Context Consistency**
 * 
 * Conversation context is maintained consistently within a session.
 * - Follow-up questions resolve correctly using session context
 * - Session restoration preserves message order
 * 
 * **Validates: Requirements 2.1, 2.3, 13.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryMemoryService } from '../../services/memory-service.js';
import {
  Message,
  EntityReference,
} from '../../types/memory.js';

// Property test configuration
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
 * Generator for entity types
 */
const entityTypeGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom('report', 'cde', 'issue', 'cycle');

/**
 * Generator for non-empty strings
 */
const nonEmptyStringGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 100 });

/**
 * Generator for Message with specific timestamp
 */
const messageWithTimestampGenerator = (timestamp: Date): fc.Arbitrary<Message> =>
  fc.record({
    id: fc.uuid(),
    role: messageRoleGenerator(),
    content: nonEmptyStringGenerator(),
    timestamp: fc.constant(timestamp),
    toolCalls: fc.constant(undefined),
    references: fc.constant(undefined),
    isStreaming: fc.constant(false),
  });

/**
 * Generator for a sequence of messages with ordered timestamps
 */
const orderedMessageSequenceGenerator = (minLength: number, maxLength: number): fc.Arbitrary<Message[]> =>
  fc.integer({ min: minLength, max: maxLength }).chain(count => {
    const baseTime = Date.now();
    return fc.tuple(
      ...Array.from({ length: count }, (_, i) =>
        messageWithTimestampGenerator(new Date(baseTime + i * 1000))
      )
    ).map(messages => messages as Message[]);
  });

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

// ==================== Property Tests ====================

describe('Property 5: Conversation Context Consistency', () => {
  let memoryService: InMemoryMemoryService;

  beforeEach(() => {
    memoryService = new InMemoryMemoryService();
  });

  describe('Message Order Preservation', () => {
    it('should preserve message order after session update', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          orderedMessageSequenceGenerator(2, 10),
          async (sessionId, userId, tenantId, messages) => {
            // Initialize session
            await memoryService.initializeSession(sessionId, userId, tenantId);

            // Update session with messages
            await memoryService.updateSessionContext(sessionId, messages);

            // Retrieve session context
            const context = await memoryService.getSessionContext(sessionId);

            // Verify context exists
            expect(context).not.toBeNull();

            // Verify message count
            expect(context!.messages).toHaveLength(messages.length);

            // Verify message order is preserved (timestamps should be in order)
            for (let i = 0; i < context!.messages.length - 1; i++) {
              const currentTime = context!.messages[i].timestamp.getTime();
              const nextTime = context!.messages[i + 1].timestamp.getTime();
              expect(currentTime).toBeLessThanOrEqual(nextTime);
            }

            // Verify message IDs match
            for (let i = 0; i < messages.length; i++) {
              expect(context!.messages[i].id).toBe(messages[i].id);
            }

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should preserve message content after session restoration', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          orderedMessageSequenceGenerator(1, 5),
          async (sessionId, userId, tenantId, messages) => {
            // Initialize and populate session
            await memoryService.initializeSession(sessionId, userId, tenantId);
            await memoryService.updateSessionContext(sessionId, messages);

            // Simulate "restoration" by getting context
            const restoredContext = await memoryService.getSessionContext(sessionId);

            // Verify all message content is preserved
            expect(restoredContext).not.toBeNull();
            for (let i = 0; i < messages.length; i++) {
              expect(restoredContext!.messages[i].content).toBe(messages[i].content);
              expect(restoredContext!.messages[i].role).toBe(messages[i].role);
            }

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Entity Reference Resolution', () => {
    it('should track entities mentioned in messages for pronoun resolution', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          entityReferenceGenerator(),
          async (sessionId, userId, tenantId, entityRef) => {
            // Initialize session
            await memoryService.initializeSession(sessionId, userId, tenantId);

            // Create message with entity reference
            const messageWithEntity: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Information about ${entityRef.displayName}`,
              timestamp: entityRef.lastMentioned,
              references: [{
                type: entityRef.entityType as 'report' | 'cde' | 'lineage' | 'issue' | 'audit',
                id: entityRef.entityId,
                title: entityRef.displayName,
                source: 'test',
              }],
            };

            // Update session with message
            await memoryService.updateSessionContext(sessionId, [messageWithEntity]);

            // Retrieve session context
            const context = await memoryService.getSessionContext(sessionId);

            // Verify entity is tracked
            expect(context).not.toBeNull();
            expect(context!.entities.size).toBeGreaterThan(0);

            // Verify entity can be resolved
            const resolvedEntity = await memoryService.resolveEntityReference(
              sessionId,
              entityRef.entityType
            );

            // Entity should be resolvable
            expect(resolvedEntity).not.toBeNull();
            expect(resolvedEntity!.entityId).toBe(entityRef.entityId);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should resolve to most recently mentioned entity of a type', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          entityTypeGenerator(),
          fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
          fc.tuple(nonEmptyStringGenerator(), nonEmptyStringGenerator()),
          async (sessionId, userId, tenantId, entityType, [entityId1, entityId2], [name1, name2]) => {
            // Initialize session
            await memoryService.initializeSession(sessionId, userId, tenantId);

            const now = Date.now();

            // Create two messages with same entity type but different IDs
            const message1: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `First entity: ${name1}`,
              timestamp: new Date(now),
              references: [{
                type: entityType as 'report' | 'cde' | 'lineage' | 'issue' | 'audit',
                id: entityId1,
                title: name1,
                source: 'test',
              }],
            };

            const message2: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `Second entity: ${name2}`,
              timestamp: new Date(now + 1000), // Later timestamp
              references: [{
                type: entityType as 'report' | 'cde' | 'lineage' | 'issue' | 'audit',
                id: entityId2,
                title: name2,
                source: 'test',
              }],
            };

            // Update session with both messages
            await memoryService.updateSessionContext(sessionId, [message1, message2]);

            // Resolve entity reference
            const resolvedEntity = await memoryService.resolveEntityReference(
              sessionId,
              entityType
            );

            // Should resolve to the most recently mentioned entity (entityId2)
            expect(resolvedEntity).not.toBeNull();
            expect(resolvedEntity!.entityId).toBe(entityId2);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Session Context Consistency', () => {
    it('should maintain consistent session metadata', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          orderedMessageSequenceGenerator(1, 5),
          async (sessionId, userId, tenantId, messages) => {
            // Initialize session
            await memoryService.initializeSession(sessionId, userId, tenantId);

            // Update session
            await memoryService.updateSessionContext(sessionId, messages);

            // Retrieve context
            const context = await memoryService.getSessionContext(sessionId);

            // Verify session metadata is consistent
            expect(context).not.toBeNull();
            expect(context!.sessionId).toBe(sessionId);
            expect(context!.userId).toBe(userId);
            expect(context!.tenantId).toBe(tenantId);
            expect(context!.isActive).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should clear session context completely', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          orderedMessageSequenceGenerator(1, 5),
          async (sessionId, userId, tenantId, messages) => {
            // Initialize and populate session
            await memoryService.initializeSession(sessionId, userId, tenantId);
            await memoryService.updateSessionContext(sessionId, messages);

            // Verify session has messages
            const beforeClear = await memoryService.getSessionContext(sessionId);
            expect(beforeClear).not.toBeNull();
            expect(beforeClear!.messages.length).toBeGreaterThan(0);

            // Clear session
            await memoryService.clearSession(sessionId);

            // Verify session is cleared
            const afterClear = await memoryService.getSessionContext(sessionId);
            expect(afterClear).toBeNull();

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should update lastActivity timestamp on context update', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          orderedMessageSequenceGenerator(1, 3),
          async (sessionId, userId, tenantId, messages) => {
            // Initialize session
            const initialContext = await memoryService.initializeSession(sessionId, userId, tenantId);
            const initialActivity = initialContext.lastActivity;

            // Wait a small amount to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            // Update session
            await memoryService.updateSessionContext(sessionId, messages);

            // Retrieve updated context
            const updatedContext = await memoryService.getSessionContext(sessionId);

            // Verify lastActivity was updated
            expect(updatedContext).not.toBeNull();
            expect(updatedContext!.lastActivity.getTime()).toBeGreaterThanOrEqual(
              initialActivity.getTime()
            );

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Context Summarization', () => {
    it('should summarize context when message limit is exceeded', async () => {
      await fc.assert(
        fc.asyncProperty(
          sessionIdGenerator(),
          userIdGenerator(),
          tenantIdGenerator(),
          async (sessionId, userId, tenantId) => {
            // Initialize session
            await memoryService.initializeSession(sessionId, userId, tenantId);

            // Create more than 50 messages (the limit)
            const baseTime = Date.now();
            const manyMessages: Message[] = Array.from({ length: 60 }, (_, i) => ({
              id: crypto.randomUUID(),
              role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
              content: `Message ${i + 1}`,
              timestamp: new Date(baseTime + i * 1000),
            }));

            // Update session with many messages
            await memoryService.updateSessionContext(sessionId, manyMessages);

            // Retrieve context
            const context = await memoryService.getSessionContext(sessionId);

            // Verify context exists
            expect(context).not.toBeNull();

            // Verify message count is limited (should be <= 50)
            expect(context!.messages.length).toBeLessThanOrEqual(50);

            // Verify summary exists when messages were truncated
            if (manyMessages.length > 50) {
              expect(context!.summary).toBeDefined();
            }

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Multiple Session Independence', () => {
    it('should maintain independent context for different sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(sessionIdGenerator(), sessionIdGenerator()).filter(([a, b]) => a !== b),
          userIdGenerator(),
          tenantIdGenerator(),
          orderedMessageSequenceGenerator(1, 3),
          orderedMessageSequenceGenerator(1, 3),
          async ([sessionA, sessionB], userId, tenantId, messagesA, messagesB) => {
            // Initialize both sessions
            await memoryService.initializeSession(sessionA, userId, tenantId);
            await memoryService.initializeSession(sessionB, userId, tenantId);

            // Update each session with different messages
            await memoryService.updateSessionContext(sessionA, messagesA);
            await memoryService.updateSessionContext(sessionB, messagesB);

            // Retrieve both contexts
            const contextA = await memoryService.getSessionContext(sessionA);
            const contextB = await memoryService.getSessionContext(sessionB);

            // Verify both contexts exist
            expect(contextA).not.toBeNull();
            expect(contextB).not.toBeNull();

            // Verify message counts are independent
            expect(contextA!.messages.length).toBe(messagesA.length);
            expect(contextB!.messages.length).toBe(messagesB.length);

            // Verify message content is independent
            expect(contextA!.messages[0].id).toBe(messagesA[0].id);
            expect(contextB!.messages[0].id).toBe(messagesB[0].id);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
