/**
 * Tool Service for the Regulatory AI Assistant
 * 
 * Bridges the assistant to existing agent tools via API calls.
 * Implements tool execution logging and transparency.
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.5, 16.1-16.8
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ToolService,
  ToolResult,
  ToolExecutionLog,
  ToolMetadata,
  ToolExecutionContext,
  CycleStatus,
  IssueTrends,
  QualityScore,
  CreateHumanTaskParams,
  TOOL_METADATA_REGISTRY,
  TOOLS_REQUIRING_HUMAN_APPROVAL,
} from '../types/tool-service.js';
import {
  ReportCatalog,
  RegulatoryChange,
  ScanResult,
} from '../types/regulatory.js';
import {
  LineageGraph,
  ImpactAnalysis,
} from '../types/lineage.js';
import { Issue } from '../types/issues.js';
import { CDE } from '../types/cde.js';
import {
  CycleInstance,
  HumanTask,
  AgentResult,
} from '../types/workflow.js';
import {
  BackendAgentClient,
  createBackendAgentClient,
  AuthContext,
} from './backend-agent-client.js';

/**
 * Configuration for the Tool Service
 */
export interface ToolServiceConfig {
  /** Base URL for the backend API */
  apiBaseUrl: string;
  /** Timeout for API calls in milliseconds */
  timeout: number;
  /** Whether to enable execution logging */
  enableLogging: boolean;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Whether to use mock responses (for testing) */
  useMockResponses: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ToolServiceConfig = {
  apiBaseUrl: '/api/v1',
  timeout: 30000,
  enableLogging: true,
  maxRetries: 3,
  useMockResponses: process.env.NODE_ENV === 'test',
};

/**
 * Implementation of the Tool Service
 * 
 * This implementation:
 * - Wraps existing Python agent tools via API calls
 * - Logs all tool executions for transparency
 * - Enforces human approval for critical actions
 * - Provides tool metadata for discovery
 * 
 * Validates: Requirements 11.1, 11.2, 11.3, 11.5, 16.1-16.8
 */
export class ToolServiceImpl implements ToolService {
  private config: ToolServiceConfig;
  private executionLogs: ToolExecutionLog[] = [];
  private context: ToolExecutionContext | null = null;
  private backendClient: BackendAgentClient;

  constructor(config: Partial<ToolServiceConfig> = {}, backendClient?: BackendAgentClient) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.backendClient = backendClient || createBackendAgentClient({
      baseUrl: this.config.apiBaseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      enableLogging: this.config.enableLogging,
    });
  }

  /**
   * Set the execution context for tool calls
   */
  setContext(context: ToolExecutionContext): void {
    this.context = context;
    
    // Update backend client auth context
    const authContext: AuthContext = {
      userId: context.userId,
      tenantId: context.tenantId,
      accessToken: context.accessToken,
      permissions: context.permissions,
    };
    this.backendClient.setAuthContext(authContext);
  }

  /**
   * Get the current execution context
   */
  getContext(): ToolExecutionContext | null {
    return this.context;
  }

  // ==================== Helper Methods ====================

  /**
   * Create a successful tool result
   */
  private createSuccessResult<T>(callId: string, toolName: string, data: T, duration: number): ToolResult<T> {
    return {
      callId,
      toolName,
      success: true,
      data,
      status: 'completed',
      duration,
      completedAt: new Date(),
      retryable: false,
    };
  }

  /**
   * Create a failed tool result
   */
  private createErrorResult<T>(
    callId: string,
    toolName: string,
    error: string,
    errorCode: string,
    duration: number,
    retryable: boolean = true
  ): ToolResult<T> {
    return {
      callId,
      toolName,
      success: false,
      error,
      errorCode,
      status: 'failed',
      duration,
      completedAt: new Date(),
      retryable,
    };
  }

  /**
   * Execute an API call with timing and error handling
   */
  private async executeApiCall<T>(
    toolName: string,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    body?: Record<string, unknown>
  ): Promise<ToolResult<T>> {
    const callId = uuidv4();
    const startTime = Date.now();

    try {
      let response;
      
      // Use mock responses in test mode or when configured
      if (this.config.useMockResponses) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 100));
        response = {
          success: true,
          data: this.getMockResponse<T>(toolName, body),
          requestId: callId,
          duration: Date.now() - startTime,
        };
      } else {
        // Use real backend client
        switch (method) {
          case 'GET':
            response = await this.backendClient.get<T>(endpoint, body as Record<string, string>);
            break;
          case 'POST':
            response = await this.backendClient.post<T>(endpoint, body);
            break;
          case 'PUT':
            response = await this.backendClient.put<T>(endpoint, body);
            break;
          case 'DELETE':
            response = await this.backendClient.delete<T>(endpoint);
            break;
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Log the execution
      if (this.config.enableLogging) {
        await this.logExecution({
          callId,
          toolName,
          parameters: body || {},
          userId: this.context?.userId || 'unknown',
          tenantId: this.context?.tenantId || 'unknown',
          sessionId: this.context?.sessionId || 'unknown',
          status: response.success ? 'completed' : 'failed',
          duration,
          error: response.error,
          displayedToUser: true,
        });
      }

      if (response.success) {
        return this.createSuccessResult(callId, toolName, response.data as T, duration);
      } else {
        return this.createErrorResult(
          callId,
          toolName,
          response.error || 'Unknown error',
          response.errorCode || 'API_ERROR',
          duration
        );
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Log the failed execution
      if (this.config.enableLogging) {
        await this.logExecution({
          callId,
          toolName,
          parameters: body || {},
          userId: this.context?.userId || 'unknown',
          tenantId: this.context?.tenantId || 'unknown',
          sessionId: this.context?.sessionId || 'unknown',
          status: 'failed',
          duration,
          error: errorMessage,
          displayedToUser: true,
        });
      }

      return this.createErrorResult(callId, toolName, errorMessage, 'API_ERROR', duration);
    }
  }

  /**
   * Simulate API call - used for testing only
   * @deprecated Use real backend client in production
   */
  private async simulateApiCall<T>(
    toolName: string,
    _endpoint: string,
    _method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    // This is a placeholder that simulates API responses
    // In production, this would be replaced with actual fetch/axios calls
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));

    // Return mock data based on tool name
    return this.getMockResponse<T>(toolName, body);
  }

  /**
   * Get mock response for testing - replace with actual API calls in production
   */
  private getMockResponse<T>(toolName: string, params?: Record<string, unknown>): T {
    const mockResponses: Record<string, unknown> = {
      scanRegulatorySources: [{
        jurisdiction: 'US',
        scannedAt: new Date(),
        reportsFound: 15,
        changesDetected: [],
      }],
      detectChanges: [],
      getReportCatalog: {
        reports: [],
        version: 1,
        lastScanned: new Date(),
        status: 'approved',
      },
      approveCatalog: {
        reports: [],
        version: 2,
        lastScanned: new Date(),
        status: 'approved',
        approvedBy: params?.approver,
        approvedAt: new Date(),
      },
      startReportCycle: {
        id: uuidv4(),
        reportId: params?.reportId,
        periodEnd: params?.periodEnd ? new Date(params.periodEnd as string) : new Date(),
        status: 'active',
        currentPhase: 'data_gathering',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date(),
      },
      getCycleStatus: {
        cycle: {
          id: params?.cycleId,
          status: 'active',
          currentPhase: 'validation',
        },
        progressPercentage: 40,
        completedCheckpoints: 2,
        totalCheckpoints: 5,
        pendingTasks: [],
        blockingIssues: [],
        canProceed: true,
      },
      triggerAgent: {
        agentType: params?.agentType,
        success: true,
        output: { status: 'triggered' },
        errors: [],
        executedAt: new Date(),
        duration: 1500,
      },
      createHumanTask: {
        id: uuidv4(),
        cycleId: params?.cycleId,
        type: params?.taskType,
        title: params?.title,
        description: params?.description,
        assignedTo: params?.assignedTo,
        assignedRole: params?.assignedRole,
        dueDate: params?.dueDate ? new Date(params.dueDate as string) : new Date(),
        status: 'pending',
        createdAt: new Date(),
        escalationLevel: 0,
      },
      completeHumanTask: {
        id: params?.taskId,
        status: 'completed',
        decision: { outcome: params?.decision },
        decisionRationale: params?.rationale,
        completedAt: new Date(),
        completedBy: params?.completedBy,
      },
      getLineageForReport: {
        id: uuidv4(),
        reportId: params?.reportId,
        nodes: [],
        edges: [],
        version: 1,
        capturedAt: new Date(),
      },
      getLineageForCDE: {
        id: uuidv4(),
        reportId: 'derived',
        nodes: [],
        edges: [],
        version: 1,
        capturedAt: new Date(),
      },
      traceImpact: {
        changedSource: params?.nodeId,
        impactedCDEs: [],
        impactedReports: [],
        impactedNodes: [],
        analyzedAt: new Date(),
      },
      getIssuesForReport: [],
      getIssuesForCDE: [],
      getIssueTrends: {
        reportId: params?.reportId,
        period: params?.period,
        openCount: 5,
        resolvedCount: 12,
        avgResolutionTimeHours: 48,
        trendDirection: 'improving',
        bySeverity: {
          critical: { open: 0, resolved: 2 },
          high: { open: 2, resolved: 5 },
          medium: { open: 2, resolved: 3 },
          low: { open: 1, resolved: 2 },
        },
      },
      getCDEDetails: {
        id: params?.cdeId,
        elementId: params?.cdeId,
        name: 'Sample CDE',
        businessDefinition: 'A critical data element',
        criticalityRationale: 'High regulatory impact',
        status: 'approved',
      },
      getCDEsForReport: [],
      getCDEQualityScore: {
        cdeId: params?.cdeId,
        overallScore: 0.85,
        dimensions: {
          completeness: 0.9,
          accuracy: 0.85,
          timeliness: 0.8,
          consistency: 0.85,
        },
        lastAssessedAt: new Date(),
        trend: 'stable',
      },
    };

    return (mockResponses[toolName] || {}) as T;
  }

  // ==================== Regulatory Intelligence Tools ====================

  async scanRegulatorySources(jurisdictions: string[]): Promise<ToolResult<ScanResult[]>> {
    return this.executeApiCall<ScanResult[]>(
      'scanRegulatorySources',
      '/regulatory/scan',
      'POST',
      { jurisdictions }
    );
  }

  async detectChanges(since: Date): Promise<ToolResult<RegulatoryChange[]>> {
    return this.executeApiCall<RegulatoryChange[]>(
      'detectChanges',
      '/regulatory/changes',
      'POST',
      { since: since.toISOString() }
    );
  }

  async getReportCatalog(): Promise<ToolResult<ReportCatalog>> {
    return this.executeApiCall<ReportCatalog>(
      'getReportCatalog',
      '/regulatory/catalog',
      'GET'
    );
  }

  async approveCatalog(approver: string, rationale: string): Promise<ToolResult<ReportCatalog>> {
    // Check if human approval is required
    if (this.context?.requireHumanApproval && TOOLS_REQUIRING_HUMAN_APPROVAL.includes('approveCatalog')) {
      return this.createErrorResult(
        uuidv4(),
        'approveCatalog',
        'Human approval required for this action',
        'HUMAN_APPROVAL_REQUIRED',
        0,
        false
      );
    }

    return this.executeApiCall<ReportCatalog>(
      'approveCatalog',
      '/regulatory/catalog/approve',
      'POST',
      { approver, rationale, access_token: this.context?.accessToken }
    );
  }

  // ==================== Governance Orchestrator Tools ====================

  async startReportCycle(reportId: string, periodEnd: string): Promise<ToolResult<CycleInstance>> {
    // Check if human approval is required
    if (this.context?.requireHumanApproval && TOOLS_REQUIRING_HUMAN_APPROVAL.includes('startReportCycle')) {
      return this.createErrorResult(
        uuidv4(),
        'startReportCycle',
        'Human approval required for this action',
        'HUMAN_APPROVAL_REQUIRED',
        0,
        false
      );
    }

    return this.executeApiCall<CycleInstance>(
      'startReportCycle',
      '/orchestrator/cycles',
      'POST',
      { 
        reportId, 
        periodEnd, 
        initiator: this.context?.userId || 'unknown' 
      }
    );
  }

  async getCycleStatus(cycleId: string): Promise<ToolResult<CycleStatus>> {
    return this.executeApiCall<CycleStatus>(
      'getCycleStatus',
      `/orchestrator/cycles/${cycleId}/status`,
      'GET',
      { cycleId }
    );
  }

  async triggerAgent(
    cycleId: string,
    agentType: string,
    parameters?: Record<string, unknown>
  ): Promise<ToolResult<AgentResult>> {
    return this.executeApiCall<AgentResult>(
      'triggerAgent',
      `/orchestrator/cycles/${cycleId}/agents/${agentType}`,
      'POST',
      { cycleId, agentType, parameters }
    );
  }

  async createHumanTask(task: CreateHumanTaskParams): Promise<ToolResult<HumanTask>> {
    return this.executeApiCall<HumanTask>(
      'createHumanTask',
      '/orchestrator/tasks',
      'POST',
      task as unknown as Record<string, unknown>
    );
  }

  async completeHumanTask(
    taskId: string,
    decision: string,
    rationale: string,
    completedBy: string
  ): Promise<ToolResult<HumanTask>> {
    // Check if human approval is required
    if (this.context?.requireHumanApproval && TOOLS_REQUIRING_HUMAN_APPROVAL.includes('completeHumanTask')) {
      return this.createErrorResult(
        uuidv4(),
        'completeHumanTask',
        'Human approval required for this action',
        'HUMAN_APPROVAL_REQUIRED',
        0,
        false
      );
    }

    return this.executeApiCall<HumanTask>(
      'completeHumanTask',
      `/orchestrator/tasks/${taskId}/complete`,
      'POST',
      { taskId, decision, rationale, completedBy, access_token: this.context?.accessToken }
    );
  }

  // ==================== Lineage Tools ====================

  async getLineageForReport(reportId: string): Promise<ToolResult<LineageGraph>> {
    return this.executeApiCall<LineageGraph>(
      'getLineageForReport',
      `/lineage/reports/${reportId}`,
      'GET',
      { reportId }
    );
  }

  async getLineageForCDE(cdeId: string): Promise<ToolResult<LineageGraph>> {
    return this.executeApiCall<LineageGraph>(
      'getLineageForCDE',
      `/lineage/cdes/${cdeId}`,
      'GET',
      { cdeId }
    );
  }

  async traceImpact(
    nodeId: string,
    direction: 'upstream' | 'downstream'
  ): Promise<ToolResult<ImpactAnalysis>> {
    return this.executeApiCall<ImpactAnalysis>(
      'traceImpact',
      '/lineage/impact',
      'POST',
      { nodeId, direction }
    );
  }

  // ==================== Issue Tools ====================

  async getIssuesForReport(reportId: string, status?: string): Promise<ToolResult<Issue[]>> {
    return this.executeApiCall<Issue[]>(
      'getIssuesForReport',
      `/issues/reports/${reportId}`,
      'GET',
      { reportId, status }
    );
  }

  async getIssuesForCDE(cdeId: string): Promise<ToolResult<Issue[]>> {
    return this.executeApiCall<Issue[]>(
      'getIssuesForCDE',
      `/issues/cdes/${cdeId}`,
      'GET',
      { cdeId }
    );
  }

  async getIssueTrends(reportId: string, period: string): Promise<ToolResult<IssueTrends>> {
    return this.executeApiCall<IssueTrends>(
      'getIssueTrends',
      `/issues/reports/${reportId}/trends`,
      'GET',
      { reportId, period }
    );
  }

  // ==================== CDE Tools ====================

  async getCDEDetails(cdeId: string): Promise<ToolResult<CDE>> {
    return this.executeApiCall<CDE>(
      'getCDEDetails',
      `/cdes/${cdeId}`,
      'GET',
      { cdeId }
    );
  }

  async getCDEsForReport(reportId: string): Promise<ToolResult<CDE[]>> {
    return this.executeApiCall<CDE[]>(
      'getCDEsForReport',
      `/cdes/reports/${reportId}`,
      'GET',
      { reportId }
    );
  }

  async getCDEQualityScore(cdeId: string): Promise<ToolResult<QualityScore>> {
    return this.executeApiCall<QualityScore>(
      'getCDEQualityScore',
      `/cdes/${cdeId}/quality`,
      'GET',
      { cdeId }
    );
  }

  // ==================== Tool Metadata ====================

  getAvailableTools(): ToolMetadata[] {
    return TOOL_METADATA_REGISTRY;
  }

  getToolMetadata(toolName: string): ToolMetadata | undefined {
    return TOOL_METADATA_REGISTRY.find(t => t.name === toolName);
  }

  // ==================== Execution Logging ====================

  async logExecution(log: Omit<ToolExecutionLog, 'id' | 'timestamp'>): Promise<void> {
    const entry: ToolExecutionLog = {
      ...log,
      id: uuidv4(),
      timestamp: new Date(),
    };
    this.executionLogs.push(entry);
  }

  async getExecutionLogs(sessionId: string): Promise<ToolExecutionLog[]> {
    return this.executionLogs.filter(log => log.sessionId === sessionId);
  }

  /**
   * Get all execution logs (for testing/debugging)
   */
  getAllExecutionLogs(): ToolExecutionLog[] {
    return [...this.executionLogs];
  }

  /**
   * Clear execution logs (for testing)
   */
  clearExecutionLogs(): void {
    this.executionLogs = [];
  }
}

/**
 * Create a new Tool Service instance
 */
export function createToolService(config?: Partial<ToolServiceConfig>): ToolService {
  return new ToolServiceImpl(config);
}
