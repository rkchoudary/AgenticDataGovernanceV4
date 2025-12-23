/**
 * Backend Agent Client
 * 
 * Connects the TypeScript Tool Service to existing Python agents via API endpoints.
 * Implements request/response serialization and authentication handling.
 * 
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4
 */

import { v4 as uuidv4 } from 'uuid';

// ==================== Types ====================

/**
 * Configuration for the backend agent client
 */
export interface BackendAgentClientConfig {
  /** Base URL for the Python agent API */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff */
  baseDelayMs: number;
  /** Whether to enable request logging */
  enableLogging: boolean;
}

/**
 * Authentication context for API requests
 */
export interface AuthContext {
  /** User ID making the request */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Access token for authentication */
  accessToken?: string;
  /** User permissions */
  permissions: string[];
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  requestId: string;
  duration: number;
}

/**
 * Request log entry
 */
export interface RequestLog {
  id: string;
  timestamp: Date;
  endpoint: string;
  method: string;
  userId: string;
  tenantId: string;
  duration: number;
  success: boolean;
  error?: string;
}

// ==================== Default Configuration ====================

const DEFAULT_CONFIG: BackendAgentClientConfig = {
  baseUrl: process.env.AGENT_API_URL || 'http://localhost:8000/api/v1',
  timeout: 30000,
  maxRetries: 3,
  baseDelayMs: 1000,
  enableLogging: true,
};

// ==================== Backend Agent Client ====================

/**
 * Client for communicating with Python backend agents
 * 
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4
 */
export class BackendAgentClient {
  private config: BackendAgentClientConfig;
  private requestLogs: RequestLog[] = [];
  private authContext: AuthContext | null = null;

  constructor(config: Partial<BackendAgentClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the authentication context for requests
   */
  setAuthContext(context: AuthContext): void {
    this.authContext = context;
  }

  /**
   * Get the current authentication context
   */
  getAuthContext(): AuthContext | null {
    return this.authContext;
  }

  // ==================== HTTP Methods ====================

  /**
   * Make a GET request to the backend
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>('GET', endpoint, undefined, params);
  }

  /**
   * Make a POST request to the backend
   */
  async post<T>(endpoint: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request<T>('POST', endpoint, body);
  }

  /**
   * Make a PUT request to the backend
   */
  async put<T>(endpoint: string, body?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', endpoint, body);
  }

  /**
   * Make a DELETE request to the backend
   */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', endpoint);
  }

  // ==================== Core Request Method ====================

  /**
   * Make an HTTP request with retry logic and error handling
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    const requestId = uuidv4();
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest<T>(method, endpoint, body, params, requestId);
        
        // Log successful request
        if (this.config.enableLogging) {
          this.logRequest(requestId, endpoint, method, Date.now() - startTime, true);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on authentication or authorization errors
        if (this.isNonRetryableError(lastError)) {
          break;
        }

        // Wait before retrying with exponential backoff
        if (attempt < this.config.maxRetries) {
          const delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    // Log failed request
    if (this.config.enableLogging) {
      this.logRequest(requestId, endpoint, method, Date.now() - startTime, false, lastError?.message);
    }

    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      errorCode: 'REQUEST_FAILED',
      requestId,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a single HTTP request
   */
  private async executeRequest<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>,
    requestId?: string
  ): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    
    // Build URL with query parameters
    let url = `${this.config.baseUrl}${endpoint}`;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId || uuidv4(),
    };

    // Add authentication headers
    if (this.authContext) {
      if (this.authContext.accessToken) {
        headers['Authorization'] = `Bearer ${this.authContext.accessToken}`;
      }
      headers['X-User-ID'] = this.authContext.userId;
      headers['X-Tenant-ID'] = this.authContext.tenantId;
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;

      // Parse response
      const responseData = await response.json().catch(() => ({})) as Record<string, unknown>;

      if (!response.ok) {
        return {
          success: false,
          error: (responseData.message as string) || (responseData.error as string) || `HTTP ${response.status}`,
          errorCode: (responseData.code as string) || `HTTP_${response.status}`,
          requestId: requestId || '',
          duration,
        };
      }

      return {
        success: true,
        data: (responseData.data || responseData) as T,
        requestId: requestId || '',
        duration,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  // ==================== Regulatory Intelligence Agent ====================

  /**
   * Scan regulatory sources for required reports
   * Validates: Requirements 16.1
   */
  async scanRegulatorySources(jurisdictions: string[]): Promise<ApiResponse<unknown>> {
    return this.post('/regulatory/scan', { jurisdictions });
  }

  /**
   * Detect changes in regulatory requirements
   * Validates: Requirements 16.1
   */
  async detectChanges(since: Date): Promise<ApiResponse<unknown>> {
    return this.post('/regulatory/changes', { since: since.toISOString() });
  }

  /**
   * Get the regulatory report catalog
   * Validates: Requirements 16.1
   */
  async getReportCatalog(): Promise<ApiResponse<unknown>> {
    return this.get('/regulatory/catalog');
  }

  /**
   * Approve the report catalog
   * Validates: Requirements 16.1
   */
  async approveCatalog(approver: string, rationale: string): Promise<ApiResponse<unknown>> {
    return this.post('/regulatory/catalog/approve', { approver, rationale });
  }

  // ==================== Governance Orchestrator ====================

  /**
   * Start a new report cycle
   * Validates: Requirements 16.2
   */
  async startReportCycle(reportId: string, periodEnd: string): Promise<ApiResponse<unknown>> {
    return this.post('/orchestrator/cycles', {
      report_id: reportId,
      period_end: periodEnd,
      initiator: this.authContext?.userId,
    });
  }

  /**
   * Get cycle status
   * Validates: Requirements 16.2
   */
  async getCycleStatus(cycleId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/orchestrator/cycles/${cycleId}/status`);
  }

  /**
   * Trigger an agent within a cycle
   * Validates: Requirements 16.2
   */
  async triggerAgent(
    cycleId: string,
    agentType: string,
    parameters?: Record<string, unknown>
  ): Promise<ApiResponse<unknown>> {
    return this.post(`/orchestrator/cycles/${cycleId}/agents/${agentType}`, { parameters });
  }

  /**
   * Create a human task
   * Validates: Requirements 16.2
   */
  async createHumanTask(task: {
    cycleId: string;
    taskType: string;
    title: string;
    description: string;
    assignedTo: string;
    assignedRole: string;
    dueDate: string;
  }): Promise<ApiResponse<unknown>> {
    return this.post('/orchestrator/tasks', {
      cycle_id: task.cycleId,
      task_type: task.taskType,
      title: task.title,
      description: task.description,
      assigned_to: task.assignedTo,
      assigned_role: task.assignedRole,
      due_date: task.dueDate,
    });
  }

  /**
   * Complete a human task
   * Validates: Requirements 16.2
   */
  async completeHumanTask(
    taskId: string,
    decision: string,
    rationale: string
  ): Promise<ApiResponse<unknown>> {
    return this.post(`/orchestrator/tasks/${taskId}/complete`, {
      decision,
      rationale,
      completed_by: this.authContext?.userId,
    });
  }

  // ==================== Lineage Mapping Agent ====================

  /**
   * Get lineage for a report
   * Validates: Requirements 16.6
   */
  async getLineageForReport(reportId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/lineage/reports/${reportId}`);
  }

  /**
   * Get lineage for a CDE
   * Validates: Requirements 16.6
   */
  async getLineageForCDE(cdeId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/lineage/cdes/${cdeId}`);
  }

  /**
   * Trace impact upstream or downstream
   * Validates: Requirements 16.6
   */
  async traceImpact(
    nodeId: string,
    direction: 'upstream' | 'downstream'
  ): Promise<ApiResponse<unknown>> {
    return this.post('/lineage/impact', { node_id: nodeId, direction });
  }

  // ==================== Issue Management Agent ====================

  /**
   * Get issues for a report
   * Validates: Requirements 16.7
   */
  async getIssuesForReport(reportId: string, status?: string): Promise<ApiResponse<unknown>> {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    return this.get(`/issues/reports/${reportId}`, params);
  }

  /**
   * Get issues for a CDE
   * Validates: Requirements 16.7
   */
  async getIssuesForCDE(cdeId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/issues/cdes/${cdeId}`);
  }

  /**
   * Get issue trends
   * Validates: Requirements 16.7
   */
  async getIssueTrends(reportId: string, period: string): Promise<ApiResponse<unknown>> {
    return this.get(`/issues/reports/${reportId}/trends`, { period });
  }

  // ==================== CDE Identification Agent ====================

  /**
   * Get CDE details
   * Validates: Requirements 16.5
   */
  async getCDEDetails(cdeId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/cdes/${cdeId}`);
  }

  /**
   * Get CDEs for a report
   * Validates: Requirements 16.5
   */
  async getCDEsForReport(reportId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/cdes/reports/${reportId}`);
  }

  /**
   * Get CDE quality score
   * Validates: Requirements 16.5
   */
  async getCDEQualityScore(cdeId: string): Promise<ApiResponse<unknown>> {
    return this.get(`/cdes/${cdeId}/quality`);
  }

  // ==================== Utility Methods ====================

  /**
   * Check if an error is non-retryable
   */
  private isNonRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('authentication') ||
      message.includes('401') ||
      message.includes('403')
    );
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Log a request
   */
  private logRequest(
    id: string,
    endpoint: string,
    method: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    const log: RequestLog = {
      id,
      timestamp: new Date(),
      endpoint,
      method,
      userId: this.authContext?.userId || 'unknown',
      tenantId: this.authContext?.tenantId || 'unknown',
      duration,
      success,
      error,
    };
    this.requestLogs.push(log);

    // Keep only last 1000 logs
    if (this.requestLogs.length > 1000) {
      this.requestLogs = this.requestLogs.slice(-1000);
    }
  }

  /**
   * Get request logs
   */
  getRequestLogs(): RequestLog[] {
    return [...this.requestLogs];
  }

  /**
   * Clear request logs
   */
  clearRequestLogs(): void {
    this.requestLogs = [];
  }
}

// ==================== Factory Function ====================

/**
 * Create a new Backend Agent Client instance
 */
export function createBackendAgentClient(
  config?: Partial<BackendAgentClientConfig>
): BackendAgentClient {
  return new BackendAgentClient(config);
}

// ==================== Singleton Instance ====================

let defaultClient: BackendAgentClient | null = null;

/**
 * Get the default Backend Agent Client instance
 */
export function getBackendAgentClient(): BackendAgentClient {
  if (!defaultClient) {
    defaultClient = createBackendAgentClient();
  }
  return defaultClient;
}

/**
 * Set the default Backend Agent Client instance
 */
export function setBackendAgentClient(client: BackendAgentClient): void {
  defaultClient = client;
}
