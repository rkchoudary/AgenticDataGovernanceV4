/**
 * Error Handling Service for the Regulatory AI Assistant
 * 
 * Provides:
 * - Retry strategy with exponential backoff
 * - Graceful degradation management
 * - Service health monitoring
 * - Fallback mechanisms
 * 
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 17.7
 */

import {
  ErrorCategory,
  ErrorResponse,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  DegradationLevel,
  ServiceStatus,
  DegradationStrategy,
  GracefulDegradationConfig,
  AssistantError,
  createErrorResponse,
  isRetryableError,
  logError,
  generateCorrelationId,
} from '../types/error-handling.js';

// ==================== Retry Strategy ====================

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** The result if successful */
  result?: T;
  /** The error if failed */
  error?: Error;
  /** Number of attempts made */
  attempts: number;
  /** Total time spent in milliseconds */
  totalTimeMs: number;
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attempt: number,
  config: RetryConfig
): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  if (config.jitter) {
    // Add random jitter between 0% and 25% of the delay
    const jitter = cappedDelay * Math.random() * 0.25;
    return Math.floor(cappedDelay + jitter);
  }
  
  return Math.floor(cappedDelay);
}

/**
 * Execute an operation with retry logic and exponential backoff
 * Validates: Requirements 15.5
 * 
 * @param operation - The async operation to execute
 * @param config - Retry configuration (defaults to DEFAULT_RETRY_CONFIG)
 * @returns Promise with the result or throws after all retries exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (!isRetryableError(error, config)) {
        throw lastError;
      }

      // Don't wait after the last attempt
      if (attempt < config.maxAttempts) {
        const delay = calculateDelay(attempt, config);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Operation failed after all retry attempts');
}

/**
 * Execute an operation with retry logic and return detailed result
 * Validates: Requirements 15.5
 */
export async function withRetryResult<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<RetryResult<T>> {
  let lastError: Error | undefined;
  let attempts = 0;
  const startTime = Date.now();

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    attempts = attempt;
    try {
      const result = await operation();
      return {
        success: true,
        result,
        attempts,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if (!isRetryableError(error, config)) {
        break;
      }

      // Don't wait after the last attempt
      if (attempt < config.maxAttempts) {
        const delay = calculateDelay(attempt, config);
        await sleep(delay);
      }
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
    totalTimeMs: Date.now() - startTime,
  };
}

// ==================== Graceful Degradation Service ====================

/**
 * Service for managing graceful degradation
 * Validates: Requirements 15.2, 15.3, 17.7
 */
export class GracefulDegradationService {
  private serviceStatuses: Map<string, ServiceStatus> = new Map();
  private strategies: DegradationStrategy[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private config: GracefulDegradationConfig;

  constructor(config?: Partial<GracefulDegradationConfig>) {
    this.config = {
      enabled: true,
      healthCheckIntervalMs: 30000, // 30 seconds
      strategies: [],
      ...config,
    };
    
    if (config?.strategies) {
      this.strategies = [...config.strategies];
    }
  }

  /**
   * Register a degradation strategy
   */
  registerStrategy(strategy: DegradationStrategy): void {
    this.strategies.push(strategy);
    // Sort by priority
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get current status of a service
   */
  getServiceStatus(serviceName: string): ServiceStatus | undefined {
    return this.serviceStatuses.get(serviceName);
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): ServiceStatus[] {
    return Array.from(this.serviceStatuses.values());
  }

  /**
   * Update service status
   */
  updateServiceStatus(
    serviceName: string,
    available: boolean,
    error?: string
  ): void {
    const existing = this.serviceStatuses.get(serviceName);
    const status: ServiceStatus = {
      name: serviceName,
      available,
      degradationLevel: available ? 'full' : 'offline',
      lastCheck: new Date(),
      error,
      fallbackActive: !available && existing?.fallbackActive,
    };
    this.serviceStatuses.set(serviceName, status);
  }

  /**
   * Check if a service is available
   */
  isServiceAvailable(serviceName: string): boolean {
    const status = this.serviceStatuses.get(serviceName);
    return status?.available ?? true; // Assume available if not tracked
  }

  /**
   * Get the current degradation level for a service
   */
  getDegradationLevel(serviceName: string): DegradationLevel {
    const status = this.serviceStatuses.get(serviceName);
    return status?.degradationLevel ?? 'full';
  }

  /**
   * Execute with fallback if service is unavailable
   * Validates: Requirements 15.2, 15.3, 17.7
   */
  async executeWithFallback<T>(
    serviceName: string,
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
    notificationCallback?: (message: string) => void
  ): Promise<T> {
    // Check if service is known to be unavailable
    if (!this.isServiceAvailable(serviceName)) {
      if (notificationCallback) {
        const strategy = this.strategies.find(s => s.serviceName === serviceName);
        notificationCallback(strategy?.notification || `${serviceName} is temporarily unavailable. Using fallback.`);
      }
      
      // Update status to show fallback is active
      const status = this.serviceStatuses.get(serviceName);
      if (status) {
        status.fallbackActive = true;
        this.serviceStatuses.set(serviceName, status);
      }
      
      return fallback();
    }

    try {
      const result = await operation();
      // Service is working, update status
      this.updateServiceStatus(serviceName, true);
      return result;
    } catch (error) {
      // Service failed, update status and use fallback
      this.updateServiceStatus(
        serviceName,
        false,
        error instanceof Error ? error.message : String(error)
      );
      
      if (notificationCallback) {
        const strategy = this.strategies.find(s => s.serviceName === serviceName);
        notificationCallback(strategy?.notification || `${serviceName} encountered an error. Using fallback.`);
      }
      
      // Update status to show fallback is active
      const status = this.serviceStatuses.get(serviceName);
      if (status) {
        status.fallbackActive = true;
        this.serviceStatuses.set(serviceName, status);
      }
      
      return fallback();
    }
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return; // Already running
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.runHealthChecks();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Run health checks for all registered strategies
   */
  async runHealthChecks(): Promise<void> {
    for (const strategy of this.strategies) {
      try {
        const needsDegradation = await strategy.condition();
        this.updateServiceStatus(strategy.serviceName, !needsDegradation);
      } catch (error) {
        this.updateServiceStatus(
          strategy.serviceName,
          false,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  /**
   * Get overall system health
   */
  getSystemHealth(): {
    overall: DegradationLevel;
    services: ServiceStatus[];
    degradedCount: number;
    offlineCount: number;
  } {
    const services = this.getAllServiceStatuses();
    const degradedCount = services.filter(s => s.degradationLevel === 'partial' || s.degradationLevel === 'minimal').length;
    const offlineCount = services.filter(s => s.degradationLevel === 'offline').length;

    let overall: DegradationLevel = 'full';
    if (offlineCount > 0) {
      overall = offlineCount === services.length ? 'offline' : 'minimal';
    } else if (degradedCount > 0) {
      overall = 'partial';
    }

    return {
      overall,
      services,
      degradedCount,
      offlineCount,
    };
  }
}

// ==================== Predefined Degradation Strategies ====================

/**
 * Create memory service degradation strategy
 * Validates: Requirements 17.7
 */
export function createMemoryServiceStrategy(
  memoryServiceAvailable: () => boolean | Promise<boolean>,
  localStorageFallback: () => unknown | Promise<unknown>
): DegradationStrategy {
  return {
    serviceName: 'memory-service',
    condition: async () => !(await memoryServiceAvailable()),
    fallback: localStorageFallback,
    notification: 'Using local storage for this session. Some features may be limited.',
    priority: 1,
  };
}

/**
 * Create long-term memory degradation strategy
 * Validates: Requirements 15.3
 */
export function createLongTermMemoryStrategy(
  longTermMemoryAvailable: () => boolean | Promise<boolean>,
  defaultPreferencesFallback: () => unknown | Promise<unknown>
): DegradationStrategy {
  return {
    serviceName: 'long-term-memory',
    condition: async () => !(await longTermMemoryAvailable()),
    fallback: defaultPreferencesFallback,
    notification: 'Personalization temporarily unavailable.',
    priority: 2,
  };
}

/**
 * Create tool service degradation strategy
 * Validates: Requirements 15.2
 */
export function createToolServiceStrategy(
  toolServiceAvailable: () => boolean | Promise<boolean>,
  disableToolsFallback: () => unknown | Promise<unknown>
): DegradationStrategy {
  return {
    serviceName: 'tool-service',
    condition: async () => !(await toolServiceAvailable()),
    fallback: disableToolsFallback,
    notification: 'Some actions are temporarily unavailable.',
    priority: 3,
  };
}

// ==================== Error Handling Service ====================

/**
 * Comprehensive error handling service
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 17.7
 */
export class ErrorHandlingService {
  private degradationService: GracefulDegradationService;
  private retryConfig: RetryConfig;
  private errorLog: Array<{ error: ErrorResponse; context: Record<string, unknown> }> = [];
  private maxErrorLogSize: number = 100;

  constructor(
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG,
    degradationConfig?: Partial<GracefulDegradationConfig>
  ) {
    this.retryConfig = retryConfig;
    this.degradationService = new GracefulDegradationService(degradationConfig);
  }

  /**
   * Get the degradation service
   */
  getDegradationService(): GracefulDegradationService {
    return this.degradationService;
  }

  /**
   * Execute an operation with full error handling
   * Includes retry logic and graceful degradation
   */
  async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    options: {
      serviceName?: string;
      fallback?: () => Promise<T>;
      retryConfig?: Partial<RetryConfig>;
      context?: Record<string, unknown>;
      notificationCallback?: (message: string) => void;
    } = {}
  ): Promise<T> {
    const config = { ...this.retryConfig, ...options.retryConfig };
    const correlationId = generateCorrelationId();

    try {
      // If service name provided, check degradation status
      if (options.serviceName && options.fallback) {
        return await this.degradationService.executeWithFallback(
          options.serviceName,
          () => withRetry(operation, config),
          options.fallback,
          options.notificationCallback
        );
      }

      // Standard retry execution
      return await withRetry(operation, config);
    } catch (error) {
      // Log the error
      const errorResponse = createErrorResponse(error, correlationId);
      this.logErrorInternal(errorResponse, options.context || {});

      // If fallback available and not already tried via degradation service
      if (options.fallback && !options.serviceName) {
        try {
          if (options.notificationCallback) {
            options.notificationCallback('Encountered an error. Using fallback.');
          }
          return await options.fallback();
        } catch (fallbackError) {
          // Fallback also failed
          throw error;
        }
      }

      throw error;
    }
  }

  /**
   * Handle an error and return user-friendly response
   */
  handleError(
    error: unknown,
    context: Record<string, unknown> = {}
  ): ErrorResponse {
    const errorResponse = createErrorResponse(error);
    this.logErrorInternal(errorResponse, context);
    return errorResponse;
  }

  /**
   * Log error internally
   */
  private logErrorInternal(
    error: ErrorResponse,
    context: Record<string, unknown>
  ): void {
    // Add to internal log
    this.errorLog.push({ error, context });
    
    // Trim log if too large
    if (this.errorLog.length > this.maxErrorLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxErrorLogSize);
    }

    // Also log to console/external service
    logError(error, context);
  }

  /**
   * Get recent errors (for debugging)
   */
  getRecentErrors(limit: number = 10): Array<{ error: ErrorResponse; context: Record<string, unknown> }> {
    return this.errorLog.slice(-limit);
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Register a degradation strategy
   */
  registerDegradationStrategy(strategy: DegradationStrategy): void {
    this.degradationService.registerStrategy(strategy);
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(): void {
    this.degradationService.startHealthChecks();
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring(): void {
    this.degradationService.stopHealthChecks();
  }

  /**
   * Get system health status
   */
  getSystemHealth(): ReturnType<GracefulDegradationService['getSystemHealth']> {
    return this.degradationService.getSystemHealth();
  }
}

// ==================== Factory Functions ====================

/**
 * Create a new ErrorHandlingService instance
 */
export function createErrorHandlingService(
  retryConfig?: Partial<RetryConfig>,
  degradationConfig?: Partial<GracefulDegradationConfig>
): ErrorHandlingService {
  return new ErrorHandlingService(
    { ...DEFAULT_RETRY_CONFIG, ...retryConfig },
    degradationConfig
  );
}

/**
 * Create a new GracefulDegradationService instance
 */
export function createGracefulDegradationService(
  config?: Partial<GracefulDegradationConfig>
): GracefulDegradationService {
  return new GracefulDegradationService(config);
}

// ==================== Re-exports ====================

export {
  ErrorCategory,
  ErrorResponse,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  DegradationLevel,
  ServiceStatus,
  DegradationStrategy,
  GracefulDegradationConfig,
  AssistantError,
  ToolExecutionError,
  MemoryServiceError,
  TimeoutError,
  AuthorizationError,
  ERROR_HANDLERS,
  createErrorResponse,
  isRetryableError,
  categorizeError,
  logError,
  generateCorrelationId,
} from '../types/error-handling.js';
