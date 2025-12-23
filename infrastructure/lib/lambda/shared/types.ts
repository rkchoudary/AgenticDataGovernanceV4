/**
 * Shared types for Lambda functions
 */

/**
 * API Gateway event context with JWT claims
 */
export interface RequestContext {
  tenantId: string;
  userId: string;
  email: string;
  roles: string[];
  correlationId: string;
}

/**
 * Standard API response structure
 */
export interface ApiResponse<T = unknown> {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

/**
 * Standard error response body
 */
export interface ErrorResponseBody {
  error: string;
  message: string;
  correlationId: string;
  timestamp: string;
}

/**
 * User model for DynamoDB
 */
export interface User {
  PK: string;
  SK: string;
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  givenName: string;
  familyName: string;
  role: UserRole;
  status: UserStatus;
  cognitoSub?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export type UserRole = 'admin' | 'compliance_officer' | 'data_steward' | 'viewer';
export type UserStatus = 'invited' | 'active' | 'disabled';

/**
 * Workflow model for DynamoDB
 */
export interface Workflow {
  PK: string;
  SK: string;
  workflowId: string;
  tenantId: string;
  name: string;
  type: string;
  status: WorkflowStatus;
  currentPhase: string;
  phases: WorkflowPhase[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

export interface WorkflowPhase {
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
}

/**
 * CDE (Critical Data Element) model
 */
export interface CDE {
  PK: string;
  SK: string;
  cdeId: string;
  tenantId: string;
  name: string;
  description: string;
  dataType: string;
  owner: string;
  status: string;
  score: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Issue model
 */
export interface Issue {
  PK: string;
  SK: string;
  issueId: string;
  tenantId: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignee?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

/**
 * Audit entry model
 */
export interface AuditEntry {
  PK: string;
  SK: string;
  auditId: string;
  tenantId: string;
  timestamp: string;
  actor: string;
  actorType: 'human' | 'agent' | 'system';
  action: string;
  entityType: string;
  entityId: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  correlationId: string;
}

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  nextToken?: string;
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  count: number;
}
