/**
 * Unit tests for Resilient Memory Service
 * 
 * Tests graceful degradation capabilities:
 * - Fallback to local storage when memory service unavailable
 * - Continue without personalization when long-term memory fails
 * - Service health monitoring
 * 
 * Validates: Requirements 15.2, 15.3, 17.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ResilientMemoryService,
  createResilientMemoryService,
} from '../../../services/resilient-memory-service.js';
import { InMemoryMemoryService } from '../../../services/memory-service.js';
import { MemoryService, Message, SessionContext } from '../../../types/memory.js';

describe('ResilientMemoryService', () => {
  let primaryService: MemoryService;
  let resilientService: ResilientMemoryService;
  let degradationCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    primaryService = new InMemoryMemoryService();
    degradationCallback = vi.fn();
    resilientService = createResilientMemoryService(primaryService, {
      onDegradation: degradationCallback,
      retryConfig: {
        maxAttempts: 1, // Fast tests
        baseDelayMs: 10,
        maxDelayMs: 100,
        backoffMultiplier: 2,
        jitter: false,
        retryableCategories: [],
      },
    });
  });

  describe('Health Status', () => {
    it('should report healthy status when all services work', () => {
      const status = resilientService.getHealthStatus();
      
      expect(status.overall).toBe('healthy');
      expect(status.shortTermMemory).toBe(true);
      expect(status.longTermMemory).toBe(true);
      expect(status.episodicMemory).toBe(true);
    });

    it('should not be degraded initially', () => {
      expect(resilientService.isDegraded()).toBe(false);
    });
  });

  describe('Short-Term Memory with Fallback', () => {
    it('should get session context from primary service', async () => {
      // Setup session in primary service
      await primaryService.updateSessionContext('test-session', [
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date() },
      ]);
      
      const context = await resilientService.getSessionContext('test-session');
      
      expect(context).not.toBeNull();
      expect(context?.messages).toHaveLength(1);
    });

    it('should fall back to local storage when primary fails', async () => {
      // Create a failing primary service
      const failingService: MemoryService = {
        ...primaryService,
        getSessionContext: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        updateSessionContext: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        clearSession: vi.fn(),
        getUserPreferences: vi.fn().mockResolvedValue(null),
        updateUserPreferences: vi.fn(),
        getLearnedKnowledge: vi.fn().mockResolvedValue([]),
        storeLearnedKnowledge: vi.fn(),
        recordEpisode: vi.fn(),
        queryEpisodes: vi.fn().mockResolvedValue([]),
        getDecisionHistory: vi.fn().mockResolvedValue([]),
      };
      
      const service = createResilientMemoryService(failingService, {
        onDegradation: degradationCallback,
        retryConfig: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2, jitter: false, retryableCategories: [] },
      });
      
      // First call should fail and use fallback
      const context = await service.getSessionContext('test-session');
      
      expect(context).toBeNull(); // No local data yet
      expect(degradationCallback).toHaveBeenCalledWith(
        expect.stringContaining('local storage')
      );
    });

    it('should update session context with fallback', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Test', timestamp: new Date() },
      ];
      
      await resilientService.updateSessionContext('test-session', messages);
      
      const context = await resilientService.getSessionContext('test-session');
      expect(context?.messages).toHaveLength(1);
    });

    it('should clear session from both primary and fallback', async () => {
      await resilientService.updateSessionContext('test-session', [
        { id: '1', role: 'user', content: 'Test', timestamp: new Date() },
      ]);
      
      await resilientService.clearSession('test-session');
      
      const context = await resilientService.getSessionContext('test-session');
      expect(context).toBeNull();
    });
  });

  describe('Long-Term Memory with Fallback', () => {
    it('should get user preferences from primary service', async () => {
      await primaryService.updateUserPreferences('user1', 'tenant1', {
        preferredReports: ['ccar', 'dfast'],
      });
      
      const prefs = await resilientService.getUserPreferences('user1', 'tenant1');
      
      expect(prefs?.preferredReports).toContain('ccar');
    });

    it('should return default preferences when primary fails', async () => {
      const failingService: MemoryService = {
        ...primaryService,
        getUserPreferences: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        updateUserPreferences: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        getSessionContext: vi.fn().mockResolvedValue(null),
        updateSessionContext: vi.fn(),
        clearSession: vi.fn(),
        getLearnedKnowledge: vi.fn().mockResolvedValue([]),
        storeLearnedKnowledge: vi.fn(),
        recordEpisode: vi.fn(),
        queryEpisodes: vi.fn().mockResolvedValue([]),
        getDecisionHistory: vi.fn().mockResolvedValue([]),
      };
      
      const service = createResilientMemoryService(failingService, {
        onDegradation: degradationCallback,
        retryConfig: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2, jitter: false, retryableCategories: [] },
      });
      
      const prefs = await service.getUserPreferences('user1', 'tenant1');
      
      expect(prefs).not.toBeNull();
      expect(prefs?.userId).toBe('user1');
      expect(prefs?.tenantId).toBe('tenant1');
      expect(degradationCallback).toHaveBeenCalledWith(
        expect.stringContaining('Personalization')
      );
    });

    it('should return empty array when learned knowledge fails', async () => {
      const failingService: MemoryService = {
        ...primaryService,
        getLearnedKnowledge: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        getSessionContext: vi.fn().mockResolvedValue(null),
        updateSessionContext: vi.fn(),
        clearSession: vi.fn(),
        getUserPreferences: vi.fn().mockResolvedValue(null),
        updateUserPreferences: vi.fn(),
        storeLearnedKnowledge: vi.fn(),
        recordEpisode: vi.fn(),
        queryEpisodes: vi.fn().mockResolvedValue([]),
        getDecisionHistory: vi.fn().mockResolvedValue([]),
      };
      
      const service = createResilientMemoryService(failingService, {
        onDegradation: degradationCallback,
        retryConfig: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2, jitter: false, retryableCategories: [] },
      });
      
      const knowledge = await service.getLearnedKnowledge('user1', 'tenant1');
      
      expect(knowledge).toEqual([]);
      expect(degradationCallback).toHaveBeenCalledWith(
        expect.stringContaining('learnings')
      );
    });
  });

  describe('Episodic Memory with Fallback', () => {
    it('should record episode in primary service', async () => {
      const episode = await resilientService.recordEpisode({
        sessionId: 'session1',
        userId: 'user1',
        tenantId: 'tenant1',
        timestamp: new Date(),
        type: 'query',
        content: 'Test query',
        context: {},
        relatedEntities: [],
      });
      
      expect(episode.id).toBeDefined();
    });

    it('should return placeholder when recording fails', async () => {
      const failingService: MemoryService = {
        ...primaryService,
        recordEpisode: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        getSessionContext: vi.fn().mockResolvedValue(null),
        updateSessionContext: vi.fn(),
        clearSession: vi.fn(),
        getUserPreferences: vi.fn().mockResolvedValue(null),
        updateUserPreferences: vi.fn(),
        getLearnedKnowledge: vi.fn().mockResolvedValue([]),
        storeLearnedKnowledge: vi.fn(),
        queryEpisodes: vi.fn().mockResolvedValue([]),
        getDecisionHistory: vi.fn().mockResolvedValue([]),
      };
      
      const service = createResilientMemoryService(failingService, {
        onDegradation: degradationCallback,
        retryConfig: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2, jitter: false, retryableCategories: [] },
      });
      
      const episode = await service.recordEpisode({
        sessionId: 'session1',
        userId: 'user1',
        tenantId: 'tenant1',
        timestamp: new Date(),
        type: 'query',
        content: 'Test query',
        context: {},
        relatedEntities: [],
      });
      
      // Should return a placeholder with an ID
      expect(episode.id).toBeDefined();
      expect(episode.content).toBe('Test query');
    });

    it('should return empty array when query fails', async () => {
      const failingService: MemoryService = {
        ...primaryService,
        queryEpisodes: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        getSessionContext: vi.fn().mockResolvedValue(null),
        updateSessionContext: vi.fn(),
        clearSession: vi.fn(),
        getUserPreferences: vi.fn().mockResolvedValue(null),
        updateUserPreferences: vi.fn(),
        getLearnedKnowledge: vi.fn().mockResolvedValue([]),
        storeLearnedKnowledge: vi.fn(),
        recordEpisode: vi.fn(),
        getDecisionHistory: vi.fn().mockResolvedValue([]),
      };
      
      const service = createResilientMemoryService(failingService, {
        onDegradation: degradationCallback,
        retryConfig: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2, jitter: false, retryableCategories: [] },
      });
      
      const episodes = await service.queryEpisodes({
        userId: 'user1',
        tenantId: 'tenant1',
      });
      
      expect(episodes).toEqual([]);
      expect(degradationCallback).toHaveBeenCalledWith(
        expect.stringContaining('Historical interactions')
      );
    });
  });

  describe('Service Recovery', () => {
    it('should attempt recovery and report results', async () => {
      const results = await resilientService.attemptRecovery();
      
      // All services should be healthy with in-memory implementation
      expect(results.shortTermMemory).toBe(true);
      expect(results.longTermMemory).toBe(true);
      expect(results.episodicMemory).toBe(true);
    });
  });

  describe('Degradation Service Integration', () => {
    it('should expose degradation service for monitoring', () => {
      const degradationService = resilientService.getDegradationService();
      
      expect(degradationService).toBeDefined();
      expect(degradationService.getAllServiceStatuses()).toHaveLength(3);
    });

    it('should update degradation service status on failures', async () => {
      const failingService: MemoryService = {
        ...primaryService,
        getSessionContext: vi.fn().mockRejectedValue(new Error('Service unavailable')),
        updateSessionContext: vi.fn(),
        clearSession: vi.fn(),
        getUserPreferences: vi.fn().mockResolvedValue(null),
        updateUserPreferences: vi.fn(),
        getLearnedKnowledge: vi.fn().mockResolvedValue([]),
        storeLearnedKnowledge: vi.fn(),
        recordEpisode: vi.fn(),
        queryEpisodes: vi.fn().mockResolvedValue([]),
        getDecisionHistory: vi.fn().mockResolvedValue([]),
      };
      
      const service = createResilientMemoryService(failingService, {
        retryConfig: { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100, backoffMultiplier: 2, jitter: false, retryableCategories: [] },
      });
      
      await service.getSessionContext('test');
      
      const degradationService = service.getDegradationService();
      const status = degradationService.getServiceStatus('short-term-memory');
      
      expect(status?.available).toBe(false);
    });
  });
});
