import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createLogEntry,
  logInfo,
  logWarn,
  logError,
  createErrorResponse,
  createSuccessResponse,
  LambdaError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TenantValidationError,
  LogEntry,
} from '../../lib/lambda/shared/error-handling.js';

/**
 * **Feature: private-aws-deployment, Property 7: Error Logging Completeness**
 * 
 * For any Lambda function error, the error log entry SHALL include a correlation_id
 * for request tracing.
 * 
 * **Validates: Requirements 6.5, 7.5**
 */
describe('Property 7: Error Logging Completeness', () => {
  // Capture console output for verification
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let capturedLogs: string[] = [];

  beforeEach(() => {
    capturedLogs = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      capturedLogs.push(msg);
    });
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg: string) => {
      capturedLogs.push(msg);
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
      capturedLogs.push(msg);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // Arbitrary for generating valid correlation IDs
  const validCorrelationId = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

  // Arbitrary for generating valid tenant IDs
  const validTenantId = fc.string({ minLength: 1, maxLength: 36 })
    .filter(s => s.trim().length > 0);

  // Arbitrary for generating valid user IDs
  const validUserId = fc.uuid();

  // Arbitrary for generating log messages
  const validMessage = fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => s.trim().length > 0);

  // Arbitrary for generating error messages
  const validErrorMessage = fc.string({ minLength: 1, maxLength: 200 })
    .filter(s => s.trim().length > 0);

  // Arbitrary for generating action names
  const validAction = fc.constantFrom(
    'createUser', 'updateUser', 'deleteUser',
    'createWorkflow', 'updateWorkflow', 'deleteWorkflow',
    'listCDEs', 'getCDE', 'listIssues', 'getIssue'
  );

  // Arbitrary for generating entity types
  const validEntityType = fc.constantFrom('user', 'workflow', 'cde', 'issue', 'audit');

  // Arbitrary for generating entity IDs
  const validEntityId = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0);

  /**
   * Property: All log entries must include correlation ID
   * 
   * For any log entry created, the correlation_id field must be present
   * and match the provided correlation ID.
   */
  it('should include correlation ID in all log entries', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('INFO', 'WARN', 'ERROR', 'DEBUG') as fc.Arbitrary<LogEntry['level']>,
        validMessage,
        validCorrelationId,
        (level, message, correlationId) => {
          // Given a log level, message, and correlation ID
          // When we create a log entry
          const entry = createLogEntry(level, message, correlationId);
          
          // Then the entry should include the correlation ID
          expect(entry.correlationId).toBe(correlationId);
          
          // And the entry should have the correct level
          expect(entry.level).toBe(level);
          
          // And the entry should have the message
          expect(entry.message).toBe(message);
          
          // And the entry should have a timestamp
          expect(entry.timestamp).toBeTruthy();
          expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Error logs must include correlation ID
   * 
   * For any error logged, the log output must contain the correlation ID.
   */
  it('should include correlation ID in error logs', () => {
    fc.assert(
      fc.property(validErrorMessage, validCorrelationId, (errorMessage, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // Given an error and correlation ID
        const error = new Error(errorMessage);
        
        // When we log the error
        logError(error, correlationId);
        
        // Then the log output should contain the correlation ID
        expect(capturedLogs.length).toBe(1);
        const logOutput = JSON.parse(capturedLogs[0]);
        expect(logOutput.correlationId).toBe(correlationId);
        
        // And the log should have ERROR level
        expect(logOutput.level).toBe('ERROR');
        
        // And the log should include error details
        expect(logOutput.error).toBeTruthy();
        expect(logOutput.error.message).toBe(errorMessage);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Error logs must include tenant and user context when provided
   */
  it('should include tenant and user context in error logs', () => {
    fc.assert(
      fc.property(
        validErrorMessage,
        validCorrelationId,
        validTenantId,
        validUserId,
        validAction,
        (errorMessage, correlationId, tenantId, userId, action) => {
          // Reset captured logs
          capturedLogs = [];
          
          // Given an error with context
          const error = new Error(errorMessage);
          
          // When we log the error with context
          logError(error, correlationId, {
            tenantId,
            userId,
            action,
          });
          
          // Then the log output should contain all context
          expect(capturedLogs.length).toBe(1);
          const logOutput = JSON.parse(capturedLogs[0]);
          
          expect(logOutput.correlationId).toBe(correlationId);
          expect(logOutput.tenantId).toBe(tenantId);
          expect(logOutput.userId).toBe(userId);
          expect(logOutput.action).toBe(action);
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Info logs must include correlation ID
   */
  it('should include correlation ID in info logs', () => {
    fc.assert(
      fc.property(validMessage, validCorrelationId, (message, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // When we log an info message
        logInfo(message, correlationId);
        
        // Then the log output should contain the correlation ID
        expect(capturedLogs.length).toBe(1);
        const logOutput = JSON.parse(capturedLogs[0]);
        expect(logOutput.correlationId).toBe(correlationId);
        expect(logOutput.level).toBe('INFO');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Warning logs must include correlation ID
   */
  it('should include correlation ID in warning logs', () => {
    fc.assert(
      fc.property(validMessage, validCorrelationId, (message, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // When we log a warning message
        logWarn(message, correlationId);
        
        // Then the log output should contain the correlation ID
        expect(capturedLogs.length).toBe(1);
        const logOutput = JSON.parse(capturedLogs[0]);
        expect(logOutput.correlationId).toBe(correlationId);
        expect(logOutput.level).toBe('WARN');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Error responses must include correlation ID in headers
   */
  it('should include correlation ID in error response headers', () => {
    fc.assert(
      fc.property(validErrorMessage, validCorrelationId, (errorMessage, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // Given an error
        const error = new Error(errorMessage);
        
        // When we create an error response
        const response = createErrorResponse(error, correlationId);
        
        // Then the response headers should include the correlation ID
        expect(response.headers['X-Correlation-Id']).toBe(correlationId);
        
        // And the response body should include the correlation ID
        const body = JSON.parse(response.body);
        expect(body.correlationId).toBe(correlationId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Success responses must include correlation ID in headers
   */
  it('should include correlation ID in success response headers', () => {
    fc.assert(
      fc.property(
        fc.record({ data: fc.string() }),
        validCorrelationId,
        (body, correlationId) => {
          // When we create a success response
          const response = createSuccessResponse(body, correlationId);
          
          // Then the response headers should include the correlation ID
          expect(response.headers['X-Correlation-Id']).toBe(correlationId);
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: LambdaError should preserve error code and status
   */
  it('should preserve error code and status in LambdaError', () => {
    const statusCodes = fc.constantFrom(400, 401, 403, 404, 500, 502, 503);
    const errorCodes = fc.constantFrom(
      'ValidationError', 'NotFound', 'Unauthorized', 'Forbidden', 'InternalError'
    );

    fc.assert(
      fc.property(validErrorMessage, statusCodes, errorCodes, (message, statusCode, errorCode) => {
        // When we create a LambdaError
        const error = new LambdaError(message, statusCode, errorCode);
        
        // Then the error should have the correct properties
        expect(error.message).toBe(message);
        expect(error.statusCode).toBe(statusCode);
        expect(error.errorCode).toBe(errorCode);
        expect(error.name).toBe('LambdaError');
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Specific error types should have correct status codes
   */
  it('should have correct status codes for specific error types', () => {
    fc.assert(
      fc.property(validErrorMessage, (message) => {
        // ValidationError should be 400
        const validationError = new ValidationError(message);
        expect(validationError.statusCode).toBe(400);
        expect(validationError.errorCode).toBe('ValidationError');
        
        // NotFoundError should be 404
        const notFoundError = new NotFoundError(message);
        expect(notFoundError.statusCode).toBe(404);
        expect(notFoundError.errorCode).toBe('NotFound');
        
        // UnauthorizedError should be 401
        const unauthorizedError = new UnauthorizedError(message);
        expect(unauthorizedError.statusCode).toBe(401);
        expect(unauthorizedError.errorCode).toBe('Unauthorized');
        
        // ForbiddenError should be 403
        const forbiddenError = new ForbiddenError(message);
        expect(forbiddenError.statusCode).toBe(403);
        expect(forbiddenError.errorCode).toBe('Forbidden');
        
        // TenantValidationError should be 403
        const tenantError = new TenantValidationError(message);
        expect(tenantError.statusCode).toBe(403);
        expect(tenantError.errorCode).toBe('TenantValidationError');
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Error response status code should match error type
   */
  it('should return correct status code in error response', () => {
    fc.assert(
      fc.property(validErrorMessage, validCorrelationId, (message, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // Test different error types
        const errors = [
          { error: new ValidationError(message), expectedStatus: 400 },
          { error: new NotFoundError(message), expectedStatus: 404 },
          { error: new UnauthorizedError(message), expectedStatus: 401 },
          { error: new ForbiddenError(message), expectedStatus: 403 },
          { error: new LambdaError(message, 500, 'InternalError'), expectedStatus: 500 },
        ];
        
        for (const { error, expectedStatus } of errors) {
          const response = createErrorResponse(error, correlationId);
          expect(response.statusCode).toBe(expectedStatus);
        }
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Log entries should have valid ISO timestamps
   */
  it('should have valid ISO timestamps in log entries', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('INFO', 'WARN', 'ERROR', 'DEBUG') as fc.Arbitrary<LogEntry['level']>,
        validMessage,
        validCorrelationId,
        (level, message, correlationId) => {
          // When we create a log entry
          const entry = createLogEntry(level, message, correlationId);
          
          // Then the timestamp should be a valid ISO string
          const timestamp = new Date(entry.timestamp);
          expect(timestamp.getTime()).not.toBeNaN();
          
          // And the timestamp should be recent (within last minute)
          const now = Date.now();
          const entryTime = timestamp.getTime();
          expect(entryTime).toBeLessThanOrEqual(now);
          expect(entryTime).toBeGreaterThan(now - 60000);
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Error logs should include stack trace
   */
  it('should include stack trace in error logs', () => {
    fc.assert(
      fc.property(validErrorMessage, validCorrelationId, (errorMessage, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // Given an error with stack trace
        const error = new Error(errorMessage);
        
        // When we log the error
        logError(error, correlationId);
        
        // Then the log should include the stack trace
        const logOutput = JSON.parse(capturedLogs[0]);
        expect(logOutput.error.stack).toBeTruthy();
        expect(logOutput.error.stack).toContain('Error');
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Log entries with entity context should include entity details
   */
  it('should include entity details in log entries', () => {
    fc.assert(
      fc.property(
        validMessage,
        validCorrelationId,
        validTenantId,
        validUserId,
        validAction,
        validEntityType,
        validEntityId,
        (message, correlationId, tenantId, userId, action, entityType, entityId) => {
          // Reset captured logs
          capturedLogs = [];
          
          // When we log with entity context
          logInfo(message, correlationId, {
            tenantId,
            userId,
            action,
            entityType,
            entityId,
          });
          
          // Then the log should include all entity details
          const logOutput = JSON.parse(capturedLogs[0]);
          expect(logOutput.tenantId).toBe(tenantId);
          expect(logOutput.userId).toBe(userId);
          expect(logOutput.action).toBe(action);
          expect(logOutput.entityType).toBe(entityType);
          expect(logOutput.entityId).toBe(entityId);
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Internal errors should not expose details in response
   */
  it('should not expose internal error details in response', () => {
    fc.assert(
      fc.property(validErrorMessage, validCorrelationId, (message, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // Given an internal error (500)
        const error = new LambdaError(message, 500, 'InternalError');
        
        // When we create an error response
        const response = createErrorResponse(error, correlationId);
        const body = JSON.parse(response.body);
        
        // Then the response should not contain the original error message
        expect(body.message).not.toBe(message);
        expect(body.message).toBe('An internal error occurred. Please try again later.');
        
        // But the error should still be logged with full details
        const logOutput = JSON.parse(capturedLogs[0]);
        expect(logOutput.error.message).toBe(message);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Client errors should expose message in response
   */
  it('should expose client error messages in response', () => {
    fc.assert(
      fc.property(validErrorMessage, validCorrelationId, (message, correlationId) => {
        // Reset captured logs
        capturedLogs = [];
        
        // Given a client error (4xx)
        const error = new ValidationError(message);
        
        // When we create an error response
        const response = createErrorResponse(error, correlationId);
        const body = JSON.parse(response.body);
        
        // Then the response should contain the original error message
        expect(body.message).toBe(message);
      }),
      { numRuns: 50 }
    );
  });
});
