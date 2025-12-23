/**
 * Data Queries Lambda Handler
 * 
 * Implements CDE queries, issue queries, and audit log queries.
 * 
 * Validates: Requirements 6.1
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  extractRequestContext,
  createTenantPartitionKey,
  createSortKey,
  validateTenantContext,
  getCorrelationId,
} from '../shared/tenant-validation.js';
import {
  createSuccessResponse,
  createErrorResponse,
  logInfo,
  NotFoundError,
  ForbiddenError,
  LambdaError,
} from '../shared/error-handling.js';
import { CDE, Issue, AuditEntry, PaginatedResponse, RequestContext } from '../shared/types.js';

// Environment variables
const CDES_TABLE = process.env.CDES_TABLE || 'governance-dev-cdes';
const ISSUES_TABLE = process.env.ISSUES_TABLE || 'governance-dev-issues';
const AUDIT_TABLE = process.env.AUDIT_TABLE || 'governance-dev-audit';

/**
 * DynamoDB client interface (to be injected for testing)
 */
export interface DynamoDBClient {
  get(params: { TableName: string; Key: Record<string, unknown> }): Promise<{ Item?: Record<string, unknown> }>;
  query(params: { 
    TableName: string; 
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
    IndexName?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ScanIndexForward?: boolean;
  }): Promise<{ Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> }>;
}

// Default client (will be replaced with actual AWS SDK client in production)
let dynamoClient: DynamoDBClient;

/**
 * Sets the DynamoDB client (for dependency injection in tests)
 */
export function setDynamoClient(client: DynamoDBClient): void {
  dynamoClient = client;
}

/**
 * Main Lambda handler
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const correlationId = getCorrelationId(event.headers || {}, event.requestContext?.requestId);
  
  try {
    // Extract and validate request context
    const requestContext = extractRequestContext(event as Parameters<typeof extractRequestContext>[0]);
    const validationError = validateTenantContext(requestContext);
    
    if (validationError || !requestContext) {
      throw new ForbiddenError(validationError || 'Invalid authentication context');
    }

    logInfo('Processing data query request', correlationId, {
      tenantId: requestContext.tenantId,
      userId: requestContext.userId,
      action: `${event.requestContext.http.method} ${event.rawPath}`,
    });

    // Route to appropriate handler based on HTTP method and path
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const pathParams = event.pathParameters || {};

    // CDE routes
    if (path === '/api/data/cdes' && method === 'GET') {
      return await listCDEs(requestContext, event, correlationId);
    }
    
    if (path.match(/^\/api\/data\/cdes\/[^/]+$/) && method === 'GET') {
      return await getCDE(requestContext, pathParams.cdeId!, correlationId);
    }

    // Issue routes
    if (path === '/api/data/issues' && method === 'GET') {
      return await listIssues(requestContext, event, correlationId);
    }
    
    if (path.match(/^\/api\/data\/issues\/[^/]+$/) && method === 'GET') {
      return await getIssue(requestContext, pathParams.issueId!, correlationId);
    }

    // Audit routes
    if (path === '/api/data/audit' && method === 'GET') {
      return await listAuditLogs(requestContext, event, correlationId);
    }
    
    if (path.match(/^\/api\/data\/audit\/[^/]+$/) && method === 'GET') {
      return await getAuditEntry(requestContext, pathParams.auditId!, correlationId);
    }

    // Dashboard route
    if (path === '/api/data/dashboard' && method === 'GET') {
      return await getDashboardMetrics(requestContext, correlationId);
    }

    throw new NotFoundError(`Route not found: ${method} ${path}`);
  } catch (error) {
    if (error instanceof Error) {
      return createErrorResponse(error, correlationId);
    }
    return createErrorResponse(new LambdaError('Unknown error'), correlationId);
  }
}

/**
 * Lists CDEs for the tenant
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function listCDEs(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
  const nextToken = event.queryStringParameters?.nextToken;
  const statusFilter = event.queryStringParameters?.status;

  const pk = createTenantPartitionKey(context.tenantId);
  
  const params: Parameters<DynamoDBClient['query']>[0] = {
    TableName: CDES_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'CDE#',
    },
    Limit: Math.min(limit, 100),
  };

  if (statusFilter) {
    params.FilterExpression = '#status = :status';
    params.ExpressionAttributeNames = { '#status': 'status' };
    params.ExpressionAttributeValues[':status'] = statusFilter;
  }

  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
  }

  const result = await dynamoClient.query(params);
  
  const response: PaginatedResponse<Omit<CDE, 'PK' | 'SK'>> = {
    items: (result.Items || []).map(item => ({
      cdeId: item.cdeId as string,
      tenantId: item.tenantId as string,
      name: item.name as string,
      description: item.description as string,
      dataType: item.dataType as string,
      owner: item.owner as string,
      status: item.status as string,
      score: item.score as number,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    })),
    count: result.Items?.length || 0,
    nextToken: result.LastEvaluatedKey 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };

  logInfo('Listed CDEs', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'listCDEs',
    metadata: { count: response.count },
  });

  return createSuccessResponse(response, correlationId);
}

/**
 * Gets a CDE by ID
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function getCDE(
  context: RequestContext,
  cdeId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('CDE', cdeId);

  const result = await dynamoClient.get({
    TableName: CDES_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!result.Item) {
    throw new NotFoundError(`CDE not found: ${cdeId}`);
  }

  logInfo('Retrieved CDE', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getCDE',
    entityType: 'cde',
    entityId: cdeId,
  });

  const { PK, SK, ...cdeResponse } = result.Item;
  return createSuccessResponse(cdeResponse, correlationId);
}

/**
 * Lists issues for the tenant
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function listIssues(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
  const nextToken = event.queryStringParameters?.nextToken;
  const statusFilter = event.queryStringParameters?.status;
  const severityFilter = event.queryStringParameters?.severity;

  const pk = createTenantPartitionKey(context.tenantId);
  
  const params: Parameters<DynamoDBClient['query']>[0] = {
    TableName: ISSUES_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'ISSUE#',
    },
    Limit: Math.min(limit, 100),
  };

  // Build filter expression
  const filterParts: string[] = [];
  params.ExpressionAttributeNames = {};

  if (statusFilter && ['open', 'in_progress', 'resolved', 'closed'].includes(statusFilter)) {
    filterParts.push('#status = :status');
    params.ExpressionAttributeNames['#status'] = 'status';
    params.ExpressionAttributeValues[':status'] = statusFilter;
  }

  if (severityFilter && ['low', 'medium', 'high', 'critical'].includes(severityFilter)) {
    filterParts.push('#severity = :severity');
    params.ExpressionAttributeNames['#severity'] = 'severity';
    params.ExpressionAttributeValues[':severity'] = severityFilter;
  }

  if (filterParts.length > 0) {
    params.FilterExpression = filterParts.join(' AND ');
  }

  if (Object.keys(params.ExpressionAttributeNames).length === 0) {
    delete params.ExpressionAttributeNames;
  }

  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
  }

  const result = await dynamoClient.query(params);
  
  const response: PaginatedResponse<Omit<Issue, 'PK' | 'SK'>> = {
    items: (result.Items || []).map(item => ({
      issueId: item.issueId as string,
      tenantId: item.tenantId as string,
      title: item.title as string,
      description: item.description as string,
      severity: item.severity as Issue['severity'],
      status: item.status as Issue['status'],
      assignee: item.assignee as string | undefined,
      createdBy: item.createdBy as string,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
      resolvedAt: item.resolvedAt as string | undefined,
    })),
    count: result.Items?.length || 0,
    nextToken: result.LastEvaluatedKey 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };

  logInfo('Listed issues', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'listIssues',
    metadata: { count: response.count },
  });

  return createSuccessResponse(response, correlationId);
}

/**
 * Gets an issue by ID
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function getIssue(
  context: RequestContext,
  issueId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('ISSUE', issueId);

  const result = await dynamoClient.get({
    TableName: ISSUES_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!result.Item) {
    throw new NotFoundError(`Issue not found: ${issueId}`);
  }

  logInfo('Retrieved issue', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getIssue',
    entityType: 'issue',
    entityId: issueId,
  });

  const { PK, SK, ...issueResponse } = result.Item;
  return createSuccessResponse(issueResponse, correlationId);
}

/**
 * Lists audit logs for the tenant
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function listAuditLogs(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
  const nextToken = event.queryStringParameters?.nextToken;
  const entityType = event.queryStringParameters?.entityType;
  const entityId = event.queryStringParameters?.entityId;
  const startDate = event.queryStringParameters?.startDate;
  const endDate = event.queryStringParameters?.endDate;

  const pk = createTenantPartitionKey(context.tenantId);
  
  const params: Parameters<DynamoDBClient['query']>[0] = {
    TableName: AUDIT_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'AUDIT#',
    },
    Limit: Math.min(limit, 100),
    ScanIndexForward: false, // Most recent first
  };

  // Build filter expression
  const filterParts: string[] = [];
  params.ExpressionAttributeNames = {};

  if (entityType) {
    filterParts.push('#entityType = :entityType');
    params.ExpressionAttributeNames['#entityType'] = 'entityType';
    params.ExpressionAttributeValues[':entityType'] = entityType;
  }

  if (entityId) {
    filterParts.push('#entityId = :entityId');
    params.ExpressionAttributeNames['#entityId'] = 'entityId';
    params.ExpressionAttributeValues[':entityId'] = entityId;
  }

  if (startDate) {
    filterParts.push('#timestamp >= :startDate');
    params.ExpressionAttributeNames['#timestamp'] = 'timestamp';
    params.ExpressionAttributeValues[':startDate'] = startDate;
  }

  if (endDate) {
    filterParts.push('#timestamp <= :endDate');
    if (!params.ExpressionAttributeNames['#timestamp']) {
      params.ExpressionAttributeNames['#timestamp'] = 'timestamp';
    }
    params.ExpressionAttributeValues[':endDate'] = endDate;
  }

  if (filterParts.length > 0) {
    params.FilterExpression = filterParts.join(' AND ');
  }

  if (Object.keys(params.ExpressionAttributeNames).length === 0) {
    delete params.ExpressionAttributeNames;
  }

  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
  }

  const result = await dynamoClient.query(params);
  
  const response: PaginatedResponse<Omit<AuditEntry, 'PK' | 'SK'>> = {
    items: (result.Items || []).map(item => ({
      auditId: item.auditId as string,
      tenantId: item.tenantId as string,
      timestamp: item.timestamp as string,
      actor: item.actor as string,
      actorType: item.actorType as AuditEntry['actorType'],
      action: item.action as string,
      entityType: item.entityType as string,
      entityId: item.entityId as string,
      previousState: item.previousState as Record<string, unknown> | undefined,
      newState: item.newState as Record<string, unknown> | undefined,
      correlationId: item.correlationId as string,
    })),
    count: result.Items?.length || 0,
    nextToken: result.LastEvaluatedKey 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };

  logInfo('Listed audit logs', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'listAuditLogs',
    metadata: { count: response.count },
  });

  return createSuccessResponse(response, correlationId);
}

/**
 * Gets an audit entry by ID
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function getAuditEntry(
  context: RequestContext,
  auditId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('AUDIT', auditId);

  const result = await dynamoClient.get({
    TableName: AUDIT_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!result.Item) {
    throw new NotFoundError(`Audit entry not found: ${auditId}`);
  }

  logInfo('Retrieved audit entry', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getAuditEntry',
    entityType: 'audit',
    entityId: auditId,
  });

  const { PK, SK, ...auditResponse } = result.Item;
  return createSuccessResponse(auditResponse, correlationId);
}

/**
 * Gets dashboard metrics for the tenant
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function getDashboardMetrics(
  context: RequestContext,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);

  // Query CDEs count
  const cdesResult = await dynamoClient.query({
    TableName: CDES_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'CDE#',
    },
  });

  // Query Issues by status
  const issuesResult = await dynamoClient.query({
    TableName: ISSUES_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'ISSUE#',
    },
  });

  // Calculate issue metrics
  const issues = issuesResult.Items || [];
  const openIssues = issues.filter(i => i.status === 'open').length;
  const inProgressIssues = issues.filter(i => i.status === 'in_progress').length;
  const resolvedIssues = issues.filter(i => i.status === 'resolved').length;
  const criticalIssues = issues.filter(i => i.severity === 'critical' && i.status !== 'closed').length;

  // Calculate CDE metrics
  const cdes = cdesResult.Items || [];
  const avgScore = cdes.length > 0
    ? cdes.reduce((sum, c) => sum + (c.score as number || 0), 0) / cdes.length
    : 0;

  const metrics = {
    cdes: {
      total: cdes.length,
      averageScore: Math.round(avgScore * 100) / 100,
    },
    issues: {
      total: issues.length,
      open: openIssues,
      inProgress: inProgressIssues,
      resolved: resolvedIssues,
      critical: criticalIssues,
    },
    lastUpdated: new Date().toISOString(),
  };

  logInfo('Retrieved dashboard metrics', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getDashboardMetrics',
  });

  return createSuccessResponse(metrics, correlationId);
}
