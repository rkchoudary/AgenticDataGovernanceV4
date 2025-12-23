/**
 * Unit tests for Error Handling Service
 * 
 * Tests:
 * - Retry strategy with exponential backoff
 * - Graceful degradation
 * - Error categorization
 * 
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 17.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  withRetry,
  withRetryResult,
  GracefulDegradationService,
  ErrorHandlingService,
  createErrorHandlingService,
  createMemoryServiceStrategy,
  createLongTermMemoryStrategy,
  createToolServiceStrategy,
} from '../../../services/error-handling-service.js';
import {
  ErrorCategory,
  DEFAULT_RETRY_CONFIG,
  AssistantError,
  ToolExecutionError,
  MemoryServiceError,
  TimeoutError,
  AuthorizationError,
  createErrorResponse,
  categorizeError,
  isRetryableError,
} from '../../../types/error-handling.js';

describe('Error Handling Service', () => {
  describe('withRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should succeed on first attempt if operation succeeds', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const resultPromise = withRetry(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed on subsequent attempt', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('success');
      
      const resultPromise = withRetry(operation, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts exhausted', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      
      const resultPromise = withRetry(operation, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 3 });
      await vi.runAllTimersAsync();
      
      await expect(resultPromise).rejects.toThrow('timeout');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new AuthorizationError('Access denied', 'admin:write'));
      
      const resultPromise = withRetry(operation, DEFAULT_RETRY_CONFIG);
      await vi.runAllTimersAsync();
      
      await expect(resultPromise).rejects.toThrow('Access denied');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff between retries', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('success');
      
      const config = {
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        jitter: false,
      };
      
      const resultPromise = withRetry(operation, config);
      
      // First attempt fails immediately
      await vi.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Wait for first delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Wait for second delay (2000ms with backoff)
      await vi.advanceTimersByTimeAsync(2000);
      expect(operation).toHaveBeenCalledTimes(3);
      
      const result = await resultPromise;
      expect(result).toBe('success');
    });
  });

  describe('withRetryResult', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return success result with attempt count', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const resultPromise = withRetryResult(operation);
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return failure result with error after max attempts', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('timeout'));
      
      const resultPromise = withRetryResult(operation, { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2 });
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('timeout');
      expect(result.attempts).toBe(2);
    });
  });

  describe('GracefulDegradationService', () => {
    let service: GracefulDegradationService;

    beforeEach(() => {
      service = new GracefulDegradationService();
    });

    it('should track service status', () => {
      service.updateServiceStatus('memory-service', true);
      
      const status = service.getServiceStatus('memory-service');
      expect(status?.available).toBe(true);
      expect(status?.degradationLevel).toBe('full');
    });

    it('should mark service as offline when unavailable', () => {
      service.updateServiceStatus('memory-service', false, 'Connection failed');
      
      const status = service.getServiceStatus('memory-service');
      expect(status?.available).toBe(false);
      expect(status?.degradationLevel).toBe('offline');
      expect(status?.error).toBe('Connection failed');
    });

    it('should execute fallback when service is unavailable', async () => {
      service.updateServiceStatus('memory-service', false);
      
      const operation = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockResolvedValue('fallback');
      
      const result = await service.executeWithFallback(
        'memory-service',
        operation,
        fallback
      );
      
      expect(result).toBe('fallback');
      expect(operation).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('should execute primary operation when service is available', async () => {
      service.updateServiceStatus('memory-service', true);
      
      const operation = vi.fn().mockResolvedValue('primary');
      const fallback = vi.fn().mockResolvedValue('fallback');
      
      const result = await service.executeWithFallback(
        'memory-service',
        operation,
        fallback
      );
      
      expect(result).toBe('primary');
      expect(operation).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should fall back when primary operation fails', async () => {
      // Service starts as available (not tracked)
      const operation = vi.fn().mockRejectedValue(new Error('Service error'));
      const fallback = vi.fn().mockResolvedValue('fallback');
      const notification = vi.fn();
      
      const result = await service.executeWithFallback(
        'memory-service',
        operation,
        fallback,
        notification
      );
      
      expect(result).toBe('fallback');
      expect(notification).toHaveBeenCalled();
      
      // Service should now be marked as unavailable
      const status = service.getServiceStatus('memory-service');
      expect(status?.available).toBe(false);
    });

    it('should calculate overall system health', () => {
      service.updateServiceStatus('service-a', true);
      service.updateServiceStatus('service-b', false);
      service.updateServiceStatus('service-c', true);
      
      const health = service.getSystemHealth();
      
      expect(health.overall).toBe('minimal');
      expect(health.offlineCount).toBe(1);
      expect(health.services).toHaveLength(3);
    });

    it('should register and use degradation strategies', () => {
      const strategy = createMemoryServiceStrategy(
        () => false, // Service unavailable
        () => Promise.resolve({ fallback: true })
      );
      
      service.registerStrategy(strategy);
      
      // Strategy should be registered
      expect(service.getAllServiceStatuses()).toHaveLength(0); // Not checked yet
    });
  });

  describe('ErrorHandlingService', () => {
    let service: ErrorHandlingService;

    beforeEach(() => {
      vi.useFakeTimers();
      service = createErrorHandlingService();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle errors and return user-friendly response', () => {
      const error = new Error('Something went wrong');
      
      const response = service.handleError(error, { operation: 'test' });
      
      expect(response.userMessage).toBeDefined();
      expect(response.category).toBeDefined();
      expect(response.suggestedActions).toBeDefined();
      expect(response.correlationId).toBeDefined();
    });

    it('should execute with error handling and retry', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce('success');
      
      const resultPromise = service.executeWithErrorHandling(operation, {
        retryConfig: { maxAttempts: 2 },
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use fallback when operation fails', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Failed'));
      const fallback = vi.fn().mockResolvedValue('fallback');
      
      const resultPromise = service.executeWithErrorHandling(operation, {
        fallback,
        retryConfig: { maxAttempts: 1 },
      });
      await vi.runAllTimersAsync();
      const result = await resultPromise;
      
      expect(result).toBe('fallback');
    });

    it('should track recent errors', () => {
      service.handleError(new Error('Error 1'));
      service.handleError(new Error('Error 2'));
      
      const recentErrors = service.getRecentErrors(10);
      
      expect(recentErrors).toHaveLength(2);
    });

    it('should get system health from degradation service', () => {
      const health = service.getSystemHealth();
      
      expect(health.overall).toBe('full');
      expect(health.services).toHaveLength(0);
    });
  });

  describe('Error Categorization', () => {
    it('should categorize timeout errors', () => {
      const error = new Error('Request timed out');
      expect(categorizeError(error)).toBe(ErrorCategory.TIMEOUT);
    });

    it('should categorize authorization errors', () => {
      const error = new Error('Permission denied');
      expect(categorizeError(error)).toBe(ErrorCategory.AUTHORIZATION_DENIED);
    });

    it('should categorize authentication errors', () => {
      const error = new Error('Session expired');
      expect(categorizeError(error)).toBe(ErrorCategory.AUTHENTICATION_FAILED);
    });

    it('should categorize rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      expect(categorizeError(error)).toBe(ErrorCategory.RATE_LIMIT_EXCEEDED);
    });

    it('should categorize network errors', () => {
      const error = new Error('Network connection failed');
      expect(categorizeError(error)).toBe(ErrorCategory.NETWORK_ERROR);
    });

    it('should categorize AssistantError correctly', () => {
      const error = new ToolExecutionError('testTool', 'Tool failed');
      expect(categorizeError(error)).toBe(ErrorCategory.TOOL_EXECUTION_FAILED);
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      const error = new Error('Some random error');
      expect(categorizeError(error)).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response from Error', () => {
      const error = new Error('Test error');
      const response = createErrorResponse(error);
      
      expect(response.category).toBeDefined();
      expect(response.userMessage).toBeDefined();
      expect(response.technicalDetails).toBe('Test error');
      expect(response.correlationId).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });

    it('should create error response from AssistantError', () => {
      const error = new TimeoutError('Request timed out', 5000);
      const response = createErrorResponse(error);
      
      expect(response.category).toBe(ErrorCategory.TIMEOUT);
      expect(response.retryable).toBe(true);
    });

    it('should use provided correlation ID', () => {
      const error = new Error('Test');
      const response = createErrorResponse(error, 'custom-id');
      
      expect(response.correlationId).toBe('custom-id');
    });
  });

  describe('isRetryableError', () => {
    it('should return true for retryable errors', () => {
      const error = new Error('timeout');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = new AuthorizationError('Access denied', 'admin');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should respect custom retry config', () => {
      const error = new Error('timeout');
      const config = {
        ...DEFAULT_RETRY_CONFIG,
        retryableCategories: [], // No retryable categories
      };
      expect(isRetryableError(error, config)).toBe(false);
    });
  });

  describe('Custom Error Classes', () => {
    it('should create ToolExecutionError with tool details', () => {
      const error = new ToolExecutionError('getReport', 'Failed to get report', { id: '123' });
      
      expect(error.toolName).toBe('getReport');
      expect(error.parameters).toEqual({ id: '123' });
      expect(error.category).toBe(ErrorCategory.TOOL_EXECUTION_FAILED);
      expect(error.retryable).toBe(true);
    });

    it('should create MemoryServiceError with operation details', () => {
      const error = new MemoryServiceError('getSession', 'Session not found');
      
      expect(error.operation).toBe('getSession');
      expect(error.category).toBe(ErrorCategory.MEMORY_RETRIEVAL_FAILED);
      expect(error.retryable).toBe(false);
    });

    it('should create TimeoutError with timeout value', () => {
      const error = new TimeoutError('Request timed out', 5000);
      
      expect(error.timeoutMs).toBe(5000);
      expect(error.category).toBe(ErrorCategory.TIMEOUT);
      expect(error.retryable).toBe(true);
    });

    it('should create AuthorizationError with permission details', () => {
      const error = new AuthorizationError('Access denied', 'admin:write');
      
      expect(error.requiredPermission).toBe('admin:write');
      expect(error.category).toBe(ErrorCategory.AUTHORIZATION_DENIED);
      expect(error.retryable).toBe(false);
    });

    it('should convert AssistantError to ErrorResponse', () => {
      const error = new AssistantError('Test error', ErrorCategory.TOOL_EXECUTION_FAILED, true);
      const response = error.toErrorResponse();
      
      expect(response.category).toBe(ErrorCategory.TOOL_EXECUTION_FAILED);
      expect(response.technicalDetails).toBe('Test error');
      expect(response.correlationId).toBe(error.correlationId);
    });
  });

  describe('Degradation Strategies', () => {
    it('should create memory service strategy', () => {
      const strategy = createMemoryServiceStrategy(
        () => true,
        () => Promise.resolve({})
      );
      
      expect(strategy.serviceName).toBe('memory-service');
      expect(strategy.priority).toBe(1);
      expect(strategy.notification).toContain('local storage');
    });

    it('should create long-term memory strategy', () => {
      const strategy = createLongTermMemoryStrategy(
        () => true,
        () => Promise.resolve({})
      );
      
      expect(strategy.serviceName).toBe('long-term-memory');
      expect(strategy.priority).toBe(2);
      expect(strategy.notification).toContain('Personalization');
    });

    it('should create tool service strategy', () => {
      const strategy = createToolServiceStrategy(
        () => true,
        () => Promise.resolve({})
      );
      
      expect(strategy.serviceName).toBe('tool-service');
      expect(strategy.priority).toBe(3);
      expect(strategy.notification).toContain('actions');
    });
  });
});
