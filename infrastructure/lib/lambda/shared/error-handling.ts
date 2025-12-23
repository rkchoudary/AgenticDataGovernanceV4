/**
 * Error handling and logging utilities for Lambda functions
 * 
 * **Feature: private-aws-deployment, Property 7: Error Logging Completeness**
 * For any Lambda function error, the error log entry SHALL include a correlation_id
 * for request tracing.
 * 
 * Validates: Requirements 6.5, 7.5
 */

import { ApiResponse, ErrorResponseBody, RequestContext } from './types.js';

/**
 * Custom error class with additional context
 */
export class LambdaError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number = 500,
    errorCode: string = 'InternalError',
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'LambdaError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.context = context;
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends LambdaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 400, 'ValidationError', context);
    this.name = 'ValidationError';
  }
}

/**
 * Not found error
 */
export class NotFoundError extends LambdaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 404, 'NotFound', context);
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends LambdaError {
  constructor(message: string = 'Unauthorized', context?: Record<string, unknown>) {
    super(message, 401, 'Unauthorized', context);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends LambdaError {
  constructor(message: string = 'Forbidden', context?: Record<string, unknown>) {
    super(message, 403, 'Forbidden', context);
    this.name = 'ForbiddenError';
  }
}

/**
 * Tenant validation error
 */
export class TenantValidationError extends LambdaError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 403, 'TenantValidationError', context);
    this.name = 'TenantValidationError';
  }
}

/**
 * Log entry structure for structured logging
 * 
 * Validates: Requirements 6.5, 7.5
 */
export interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  correlationId: string;
  timestamp: string;
  tenantId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Creates a structured log entry
 * 
 * Validates: Requirements 6.5, 7.5
 */
export function createLogEntry(
  level: LogEntry['level'],
  message: string,
  correlationId: string,
  context?: Partial<Omit<LogEntry, 'level' | 'message' | 'correlationId' | 'timestamp'>>
): LogEntry {
  return {
    level,
    message,
    correlationId,
    timestamp: new Date().toISOString(),
    ...context,
  };
}

/**
 * Logs an info message with structured format
 */
export function logInfo(
  message: string,
  correlationId: string,
  context?: Partial<Omit<LogEntry, 'level' | 'message' | 'correlationId' | 'timestamp'>>
): void {
  const entry = createLogEntry('INFO', message, correlationId, context);
  console.log(JSON.stringify(entry));
}

/**
 * Logs a warning message with structured format
 */
export function logWarn(
  message: string,
  correlationId: string,
  context?: Partial<Omit<LogEntry, 'level' | 'message' | 'correlationId' | 'timestamp'>>
): void {
  const entry = createLogEntry('WARN', message, correlationId, context);
  console.warn(JSON.stringify(entry));
}

/**
 * Logs an error with structured format including correlation ID
 * 
 * **Feature: private-aws-deployment, Property 7: Error Logging Completeness**
 * 
 * Validates: Requirements 6.5, 7.5
 */
export function logError(
  error: Error | LambdaError,
  correlationId: string,
  context?: {
    tenantId?: string;
    userId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  const entry = createLogEntry('ERROR', error.message, correlationId, {
    ...context,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error instanceof LambdaError ? error.errorCode : undefined,
    },
  });
  console.error(JSON.stringify(entry));
}

/**
 * Creates a standard API response
 */
export function createResponse<T>(
  statusCode: number,
  body: T,
  correlationId: string
): ApiResponse<T> {
  return {
    statusCode,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Correlation-Id',
    },
  };
}

/**
 * Creates a success response
 */
export function createSuccessResponse<T>(
  body: T,
  correlationId: string,
  statusCode: number = 200
): ApiResponse<T> {
  return createResponse(statusCode, body, correlationId);
}

/**
 * Creates an error response from an error object
 * 
 * Validates: Requirements 6.5
 */
export function createErrorResponse(
  error: Error | LambdaError,
  correlationId: string,
  requestContext?: RequestContext
): ApiResponse<ErrorResponseBody> {
  // Log the error with correlation ID
  logError(error, correlationId, {
    tenantId: requestContext?.tenantId,
    userId: requestContext?.userId,
  });

  // Determine status code
  const statusCode = error instanceof LambdaError ? error.statusCode : 500;
  const errorCode = error instanceof LambdaError ? error.errorCode : 'InternalError';

  // Don't expose internal error details in production
  const message = statusCode >= 500 
    ? 'An internal error occurred. Please try again later.'
    : error.message;

  const body: ErrorResponseBody = {
    error: errorCode,
    message,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  return createResponse(statusCode, body, correlationId);
}

/**
 * Wraps a Lambda handler with error handling and logging
 */
export function withErrorHandling<TEvent, TResult>(
  handler: (event: TEvent, correlationId: string) => Promise<TResult>,
  getCorrelationId: (event: TEvent) => string
): (event: TEvent) => Promise<TResult | ApiResponse<ErrorResponseBody>> {
  return async (event: TEvent) => {
    const correlationId = getCorrelationId(event);
    
    try {
      return await handler(event, correlationId);
    } catch (error) {
      if (error instanceof Error) {
        return createErrorResponse(error, correlationId);
      }
      return createErrorResponse(
        new LambdaError('Unknown error occurred'),
        correlationId
      );
    }
  };
}
