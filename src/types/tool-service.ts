/**
 * Tool Service types for the Regulatory AI Assistant
 * 
 * Defines types for tool execution, results, and the Tool Service interface
 * that bridges the assistant to existing agent tools.
 * 
 * Validates: Requirements 11.1, 11.5
 */

import { 
  ReportCatalog, 
  RegulatoryChange, 
  ScanResult 
} from './regulatory.js';
import { 
  LineageGraph, 
  ImpactAnalysis 
} from './lineage.js';
import { Issue } from './issues.js';
import { CDE } from './cde.js';
import { 
  CycleInstance, 
  HumanTask, 
  AgentResult 
} from './workflow.js';

// ==================== Tool Call Types ====================

/**
 * Status of a tool call execution
 */
export type ToolExecutionStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled';

/**
 * A tool call request
 */
export interface ToolCallRequest {
  /** Unique identifier for the tool call */
  id: string;
  /** Name of the tool being called */
  toolName: string;
  /** Parameters passed to the tool */
  parameters: Record<string, unknown>;
  /** Timestamp when the call was initiated */
  initiatedAt: Date;
  /** User ID who initiated the call */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Session ID for context */
  sessionId: string;
}

/**
 * Result of a tool execution
 */
export interface ToolResult<T = unknown> {
  /** The tool call ID this result belongs to */
  callId: string;
  /** Name of the tool that was called */
  toolName: string;
  /** Whether the execution was successful */
  success: boolean;
  /** The result data if successful */
  data?: T;
  /** Error message if failed */
  error?: string;
  /** Error code for categorization */
  errorCode?: string;
  /** Execution status */
  status: ToolExecutionStatus;
  /** Duration of execution in milliseconds */
  duration: number;
  /** Timestamp when execution completed */
  completedAt: Date;
  /** Whether the result can be retried */
  retryable: boolean;
}

/**
 * Tool execution event for UI display
 * Validates: Requirements 11.1, 11.2, 11.3
 */
export interface ToolExecutionEvent {
  /** Unique identifier for the event */
  id: string;
  /** The tool call request */
  request: ToolCallRequest;
  /** Current status of the execution */
  status: ToolExecutionStatus;
  /** Result if completed */
  result?: ToolResult;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Status message for display */
  statusMessage?: string;
  /** Sequence number for ordering multiple tool calls */
  sequenceNumber: number;
}

/**
 * Tool execution log entry for audit trail
 */
export interface ToolExecutionLog {
  /** Unique identifier */
  id: string;
  /** Tool call ID */
  callId: string;
  /** Tool name */
  toolName: string;
  /** Parameters (sanitized for logging) */
  parameters: Record<string, unknown>;
  /** User ID */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Session ID */
  sessionId: string;
  /** Execution status */
  status: ToolExecutionStatus;
  /** Duration in milliseconds */
  duration: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp */
  timestamp: Date;
  /** Whether the execution was displayed to user */
  displayedToUser: boolean;
}

// ==================== Tool Categories ====================

/**
 * Categories of tools available in the system
 */
export type ToolCategory = 
  | 'regulatory_intelligence'
  | 'governance_orchestrator'
  | 'lineage_mapping'
  | 'issue_management'
  | 'cde_identification'
  | 'data_quality';

/**
 * Tool metadata for discovery and documentation
 */
export interface ToolMetadata {
  /** Tool name */
  name: string;
  /** Tool category */
  category: ToolCategory;
  /** Human-readable description */
  description: string;
  /** Required parameters */
  requiredParams: string[];
  /** Optional parameters */
  optionalParams: string[];
  /** Whether the tool requires human approval */
  requiresHumanApproval: boolean;
  /** Required permissions to execute */
  requiredPermissions: string[];
}

// ==================== Regulatory Intelligence Tool Types ====================

/**
 * Parameters for scanning regulatory sources
 */
export interface ScanRegulatorySourcesParams {
  jurisdictions: string[];
}

/**
 * Parameters for detecting regulatory changes
 */
export interface DetectChangesParams {
  since: Date;
}

/**
 * Parameters for approving the report catalog
 */
export interface ApproveCatalogParams {
  approver: string;
  rationale: string;
}

// ==================== Governance Orchestrator Tool Types ====================

/**
 * Parameters for starting a report cycle
 */
export interface StartReportCycleParams {
  reportId: string;
  periodEnd: string;
  initiator: string;
}

/**
 * Parameters for triggering an agent
 */
export interface TriggerAgentParams {
  cycleId: string;
  agentType: string;
  parameters?: Record<string, unknown>;
}

/**
 * Parameters for creating a human task
 */
export interface CreateHumanTaskParams {
  cycleId: string;
  taskType: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedRole: string;
  dueDate: string;
}

/**
 * Parameters for completing a human task
 */
export interface CompleteHumanTaskParams {
  taskId: string;
  decision: 'approved' | 'rejected' | 'approved_with_changes';
  rationale: string;
  completedBy: string;
}

// ==================== Lineage Tool Types ====================

/**
 * Parameters for tracing impact
 */
export interface TraceImpactParams {
  nodeId: string;
  direction: 'upstream' | 'downstream';
}

// ==================== Issue Tool Types ====================

/**
 * Parameters for getting issues
 */
export interface GetIssuesParams {
  reportId?: string;
  cdeId?: string;
  status?: string;
}

/**
 * Issue trends data
 */
export interface IssueTrends {
  reportId: string;
  period: string;
  openCount: number;
  resolvedCount: number;
  avgResolutionTimeHours: number;
  trendDirection: 'improving' | 'stable' | 'worsening';
  bySeverity: Record<string, { open: number; resolved: number }>;
}

// ==================== CDE Tool Types ====================

/**
 * Quality score for a CDE
 */
export interface QualityScore {
  cdeId: string;
  overallScore: number;
  dimensions: {
    completeness: number;
    accuracy: number;
    timeliness: number;
    consistency: number;
  };
  lastAssessedAt: Date;
  trend: 'improving' | 'stable' | 'declining';
}

// ==================== Cycle Status Types ====================

/**
 * Detailed cycle status information
 */
export interface CycleStatus {
  cycle: CycleInstance;
  progressPercentage: number;
  completedCheckpoints: number;
  totalCheckpoints: number;
  pendingTasks: HumanTask[];
  blockingIssues: Issue[];
  canProceed: boolean;
}

// ==================== Tool Service Interface ====================

/**
 * Tool Service interface for bridging the assistant to existing agent tools
 * Validates: Requirements 11.1, 11.5, 16.1-16.8
 */
export interface ToolService {
  // ==================== Regulatory Intelligence Tools ====================
  // Validates: Requirements 16.1
  
  /**
   * Scan regulatory body sources for required reports
   */
  scanRegulatorySources(jurisdictions: string[]): Promise<ToolResult<ScanResult[]>>;
  
  /**
   * Detect changes in regulatory requirements since a given date
   */
  detectChanges(since: Date): Promise<ToolResult<RegulatoryChange[]>>;
  
  /**
   * Get the current regulatory report catalog
   */
  getReportCatalog(): Promise<ToolResult<ReportCatalog>>;
  
  /**
   * Approve the report catalog after human review
   * Requires human approval via Human Gate
   */
  approveCatalog(approver: string, rationale: string): Promise<ToolResult<ReportCatalog>>;
  
  // ==================== Governance Orchestrator Tools ====================
  // Validates: Requirements 16.2, 8.1, 8.2, 8.3
  
  /**
   * Start a new report cycle for a regulatory report
   */
  startReportCycle(reportId: string, periodEnd: string): Promise<ToolResult<CycleInstance>>;
  
  /**
   * Get the current status of a report cycle
   */
  getCycleStatus(cycleId: string): Promise<ToolResult<CycleStatus>>;
  
  /**
   * Trigger a specific agent to execute within a cycle
   */
  triggerAgent(cycleId: string, agentType: string, parameters?: Record<string, unknown>): Promise<ToolResult<AgentResult>>;
  
  /**
   * Create a human task at a workflow checkpoint
   */
  createHumanTask(task: CreateHumanTaskParams): Promise<ToolResult<HumanTask>>;
  
  /**
   * Complete a human task with decision and rationale
   * Requires human approval via Human Gate
   */
  completeHumanTask(taskId: string, decision: string, rationale: string, completedBy: string): Promise<ToolResult<HumanTask>>;
  
  // ==================== Lineage Tools ====================
  // Validates: Requirements 16.6
  
  /**
   * Get the lineage graph for a report
   */
  getLineageForReport(reportId: string): Promise<ToolResult<LineageGraph>>;
  
  /**
   * Get the lineage graph for a specific CDE
   */
  getLineageForCDE(cdeId: string): Promise<ToolResult<LineageGraph>>;
  
  /**
   * Trace the impact of a change upstream or downstream
   */
  traceImpact(nodeId: string, direction: 'upstream' | 'downstream'): Promise<ToolResult<ImpactAnalysis>>;
  
  // ==================== Issue Tools ====================
  // Validates: Requirements 16.7
  
  /**
   * Get issues for a specific report
   */
  getIssuesForReport(reportId: string, status?: string): Promise<ToolResult<Issue[]>>;
  
  /**
   * Get issues for a specific CDE
   */
  getIssuesForCDE(cdeId: string): Promise<ToolResult<Issue[]>>;
  
  /**
   * Get issue trends for a report over a period
   */
  getIssueTrends(reportId: string, period: string): Promise<ToolResult<IssueTrends>>;
  
  // ==================== CDE Tools ====================
  // Validates: Requirements 16.5
  
  /**
   * Get details for a specific CDE
   */
  getCDEDetails(cdeId: string): Promise<ToolResult<CDE>>;
  
  /**
   * Get all CDEs for a report
   */
  getCDEsForReport(reportId: string): Promise<ToolResult<CDE[]>>;
  
  /**
   * Get the quality score for a CDE
   */
  getCDEQualityScore(cdeId: string): Promise<ToolResult<QualityScore>>;
  
  // ==================== Tool Metadata ====================
  
  /**
   * Get metadata for all available tools
   */
  getAvailableTools(): ToolMetadata[];
  
  /**
   * Get metadata for a specific tool
   */
  getToolMetadata(toolName: string): ToolMetadata | undefined;
  
  // ==================== Execution Logging ====================
  // Validates: Requirements 11.1, 11.2, 11.3
  
  /**
   * Log a tool execution for audit trail
   */
  logExecution(log: Omit<ToolExecutionLog, 'id' | 'timestamp'>): Promise<void>;
  
  /**
   * Get execution logs for a session
   */
  getExecutionLogs(sessionId: string): Promise<ToolExecutionLog[]>;
}

// ==================== Tool Execution Context ====================

/**
 * Context for tool execution including user permissions and tenant isolation
 */
export interface ToolExecutionContext {
  /** User ID executing the tool */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Session ID for context */
  sessionId: string;
  /** Access token for authentication */
  accessToken?: string;
  /** User permissions */
  permissions: string[];
  /** Whether to require human approval for critical actions */
  requireHumanApproval: boolean;
}

// ==================== Constants ====================

/**
 * Tools that require human approval before execution
 */
export const TOOLS_REQUIRING_HUMAN_APPROVAL: string[] = [
  'approveCatalog',
  'completeHumanTask',
  'startReportCycle',
];

/**
 * Tool metadata registry
 */
export const TOOL_METADATA_REGISTRY: ToolMetadata[] = [
  // Regulatory Intelligence Tools
  {
    name: 'scanRegulatorySources',
    category: 'regulatory_intelligence',
    description: 'Scan regulatory body sources for required reports',
    requiredParams: ['jurisdictions'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['regulatory:read'],
  },
  {
    name: 'detectChanges',
    category: 'regulatory_intelligence',
    description: 'Detect changes in regulatory requirements since a given date',
    requiredParams: ['since'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['regulatory:read'],
  },
  {
    name: 'getReportCatalog',
    category: 'regulatory_intelligence',
    description: 'Get the current regulatory report catalog',
    requiredParams: [],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['regulatory:read'],
  },
  {
    name: 'approveCatalog',
    category: 'regulatory_intelligence',
    description: 'Approve the report catalog after human review',
    requiredParams: ['approver', 'rationale'],
    optionalParams: [],
    requiresHumanApproval: true,
    requiredPermissions: ['regulatory:approve'],
  },
  // Governance Orchestrator Tools
  {
    name: 'startReportCycle',
    category: 'governance_orchestrator',
    description: 'Start a new report cycle for a regulatory report',
    requiredParams: ['reportId', 'periodEnd'],
    optionalParams: [],
    requiresHumanApproval: true,
    requiredPermissions: ['workflow:write'],
  },
  {
    name: 'getCycleStatus',
    category: 'governance_orchestrator',
    description: 'Get the current status of a report cycle',
    requiredParams: ['cycleId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['workflow:read'],
  },
  {
    name: 'triggerAgent',
    category: 'governance_orchestrator',
    description: 'Trigger a specific agent to execute within a cycle',
    requiredParams: ['cycleId', 'agentType'],
    optionalParams: ['parameters'],
    requiresHumanApproval: false,
    requiredPermissions: ['workflow:write'],
  },
  {
    name: 'createHumanTask',
    category: 'governance_orchestrator',
    description: 'Create a human task at a workflow checkpoint',
    requiredParams: ['cycleId', 'taskType', 'title', 'description', 'assignedTo', 'assignedRole', 'dueDate'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['workflow:write'],
  },
  {
    name: 'completeHumanTask',
    category: 'governance_orchestrator',
    description: 'Complete a human task with decision and rationale',
    requiredParams: ['taskId', 'decision', 'rationale', 'completedBy'],
    optionalParams: [],
    requiresHumanApproval: true,
    requiredPermissions: ['workflow:approve'],
  },
  // Lineage Tools
  {
    name: 'getLineageForReport',
    category: 'lineage_mapping',
    description: 'Get the lineage graph for a report',
    requiredParams: ['reportId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['lineage:read'],
  },
  {
    name: 'getLineageForCDE',
    category: 'lineage_mapping',
    description: 'Get the lineage graph for a specific CDE',
    requiredParams: ['cdeId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['lineage:read'],
  },
  {
    name: 'traceImpact',
    category: 'lineage_mapping',
    description: 'Trace the impact of a change upstream or downstream',
    requiredParams: ['nodeId', 'direction'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['lineage:read'],
  },
  // Issue Tools
  {
    name: 'getIssuesForReport',
    category: 'issue_management',
    description: 'Get issues for a specific report',
    requiredParams: ['reportId'],
    optionalParams: ['status'],
    requiresHumanApproval: false,
    requiredPermissions: ['issues:read'],
  },
  {
    name: 'getIssuesForCDE',
    category: 'issue_management',
    description: 'Get issues for a specific CDE',
    requiredParams: ['cdeId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['issues:read'],
  },
  {
    name: 'getIssueTrends',
    category: 'issue_management',
    description: 'Get issue trends for a report over a period',
    requiredParams: ['reportId', 'period'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['issues:read'],
  },
  // CDE Tools
  {
    name: 'getCDEDetails',
    category: 'cde_identification',
    description: 'Get details for a specific CDE',
    requiredParams: ['cdeId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['cde:read'],
  },
  {
    name: 'getCDEsForReport',
    category: 'cde_identification',
    description: 'Get all CDEs for a report',
    requiredParams: ['reportId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['cde:read'],
  },
  {
    name: 'getCDEQualityScore',
    category: 'cde_identification',
    description: 'Get the quality score for a CDE',
    requiredParams: ['cdeId'],
    optionalParams: [],
    requiresHumanApproval: false,
    requiredPermissions: ['cde:read', 'data_quality:read'],
  },
];
