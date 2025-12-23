/**
 * Workflow Operations Lambda Handler
 * 
 * Implements workflow CRUD operations and phase progression.
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
  ValidationError,
  NotFoundError,
  ForbiddenError,
  LambdaError,
} from '../shared/error-handling.js';
import { Workflow, WorkflowStatus, WorkflowPhase, PaginatedResponse, RequestContext } from '../shared/types.js';

// Environment variables
const WORKFLOWS_TABLE = process.env.WORKFLOWS_TABLE || 'governance-dev-workflows';

/**
 * DynamoDB client interface (to be injected for testing)
 */
export interface DynamoDBClient {
  get(params: { TableName: string; Key: Record<string, unknown> }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown>; ConditionExpression?: string }): Promise<void>;
  update(params: { 
    TableName: string; 
    Key: Record<string, unknown>; 
    UpdateExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ReturnValues?: string;
    ConditionExpression?: string;
  }): Promise<{ Attributes?: Record<string, unknown> }>;
  delete(params: { TableName: string; Key: Record<string, unknown> }): Promise<void>;
  query(params: { 
    TableName: string; 
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
    IndexName?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
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
 * Default workflow phases for governance workflows
 */
const DEFAULT_PHASES: WorkflowPhase[] = [
  { name: 'regulatory_intelligence', status: 'pending' },
  { name: 'data_requirements', status: 'pending' },
  { name: 'cde_identification', status: 'pending' },
  { name: 'data_quality_rules', status: 'pending' },
  { name: 'lineage_mapping', status: 'pending' },
  { name: 'issue_management', status: 'pending' },
  { name: 'controls_management', status: 'pending' },
  { name: 'documentation', status: 'pending' },
  { name: 'attestation', status: 'pending' },
];

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

    logInfo('Processing workflow request', correlationId, {
      tenantId: requestContext.tenantId,
      userId: requestContext.userId,
      action: `${event.requestContext.http.method} ${event.rawPath}`,
    });

    // Route to appropriate handler based on HTTP method and path
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const pathParams = event.pathParameters || {};

    if (path === '/api/workflows' && method === 'GET') {
      return await listWorkflows(requestContext, event, correlationId);
    }
    
    if (path === '/api/workflows' && method === 'POST') {
      return await createWorkflow(requestContext, event, correlationId);
    }
    
    if (path.match(/^\/api\/workflows\/[^/]+$/) && method === 'GET') {
      return await getWorkflow(requestContext, pathParams.workflowId!, correlationId);
    }
    
    if (path.match(/^\/api\/workflows\/[^/]+$/) && method === 'PUT') {
      return await updateWorkflow(requestContext, pathParams.workflowId!, event, correlationId);
    }
    
    if (path.match(/^\/api\/workflows\/[^/]+$/) && method === 'DELETE') {
      return await deleteWorkflow(requestContext, pathParams.workflowId!, correlationId);
    }
    
    if (path.match(/^\/api\/workflows\/[^/]+\/phase$/) && method === 'POST') {
      return await progressPhase(requestContext, pathParams.workflowId!, event, correlationId);
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
 * Lists workflows for the tenant
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function listWorkflows(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
  const nextToken = event.queryStringParameters?.nextToken;
  const statusFilter = event.queryStringParameters?.status;

  const pk = createTenantPartitionKey(context.tenantId);
  
  const params: Parameters<DynamoDBClient['query']>[0] = {
    TableName: WORKFLOWS_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'WORKFLOW#',
    },
    Limit: Math.min(limit, 100),
  };

  // Add status filter if provided
  if (statusFilter && ['draft', 'in_progress', 'completed', 'cancelled'].includes(statusFilter)) {
    params.FilterExpression = '#status = :status';
    params.ExpressionAttributeNames = { '#status': 'status' };
    params.ExpressionAttributeValues[':status'] = statusFilter;
  }

  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
  }

  const result = await dynamoClient.query(params);
  
  const response: PaginatedResponse<Omit<Workflow, 'PK' | 'SK'>> = {
    items: (result.Items || []).map(item => ({
      workflowId: item.workflowId as string,
      tenantId: item.tenantId as string,
      name: item.name as string,
      type: item.type as string,
      status: item.status as WorkflowStatus,
      currentPhase: item.currentPhase as string,
      phases: item.phases as WorkflowPhase[],
      createdBy: item.createdBy as string,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
    })),
    count: result.Items?.length || 0,
    nextToken: result.LastEvaluatedKey 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };

  logInfo('Listed workflows', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'listWorkflows',
    metadata: { count: response.count },
  });

  return createSuccessResponse(response, correlationId);
}

/**
 * Creates a new workflow
 * 
 * Validates: Requirements 6.1
 */
async function createWorkflow(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  
  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    throw new ValidationError('name is required');
  }
  if (!body.type || typeof body.type !== 'string') {
    throw new ValidationError('type is required');
  }

  const workflowId = generateWorkflowId();
  const now = new Date().toISOString();
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('WORKFLOW', workflowId);

  // Use custom phases if provided, otherwise use defaults
  const phases: WorkflowPhase[] = body.phases && Array.isArray(body.phases)
    ? body.phases.map((p: { name: string }) => ({ name: p.name, status: 'pending' as const }))
    : DEFAULT_PHASES.map(p => ({ ...p }));

  const workflow: Workflow = {
    PK: pk,
    SK: sk,
    workflowId,
    tenantId: context.tenantId,
    name: body.name,
    type: body.type,
    status: 'draft',
    currentPhase: phases[0]?.name || '',
    phases,
    createdBy: context.userId,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoClient.put({
    TableName: WORKFLOWS_TABLE,
    Item: workflow as unknown as Record<string, unknown>,
  });

  logInfo('Created workflow', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'createWorkflow',
    entityType: 'workflow',
    entityId: workflowId,
  });

  // Return workflow without PK/SK
  const { PK, SK, ...workflowResponse } = workflow;
  return createSuccessResponse(workflowResponse, correlationId, 201);
}

/**
 * Gets a workflow by ID
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function getWorkflow(
  context: RequestContext,
  workflowId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('WORKFLOW', workflowId);

  const result = await dynamoClient.get({
    TableName: WORKFLOWS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!result.Item) {
    throw new NotFoundError(`Workflow not found: ${workflowId}`);
  }

  logInfo('Retrieved workflow', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getWorkflow',
    entityType: 'workflow',
    entityId: workflowId,
  });

  // Return workflow without PK/SK
  const { PK, SK, ...workflowResponse } = result.Item;
  return createSuccessResponse(workflowResponse, correlationId);
}

/**
 * Updates a workflow
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function updateWorkflow(
  context: RequestContext,
  workflowId: string,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('WORKFLOW', workflowId);

  // Build update expression
  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  if (body.name) {
    updateParts.push('#name = :name');
    expressionNames['#name'] = 'name';
    expressionValues[':name'] = body.name;
  }

  if (body.status && ['draft', 'in_progress', 'completed', 'cancelled'].includes(body.status)) {
    updateParts.push('#status = :status');
    expressionNames['#status'] = 'status';
    expressionValues[':status'] = body.status;
  }

  if (updateParts.length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  // Always update updatedAt
  updateParts.push('#updatedAt = :updatedAt');
  expressionNames['#updatedAt'] = 'updatedAt';
  expressionValues[':updatedAt'] = new Date().toISOString();

  const result = await dynamoClient.update({
    TableName: WORKFLOWS_TABLE,
    Key: { PK: pk, SK: sk },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  });

  if (!result.Attributes) {
    throw new NotFoundError(`Workflow not found: ${workflowId}`);
  }

  logInfo('Updated workflow', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'updateWorkflow',
    entityType: 'workflow',
    entityId: workflowId,
  });

  const { PK, SK, ...workflowResponse } = result.Attributes;
  return createSuccessResponse(workflowResponse, correlationId);
}

/**
 * Deletes a workflow
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function deleteWorkflow(
  context: RequestContext,
  workflowId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('WORKFLOW', workflowId);

  // Verify workflow exists
  const existingWorkflow = await dynamoClient.get({
    TableName: WORKFLOWS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!existingWorkflow.Item) {
    throw new NotFoundError(`Workflow not found: ${workflowId}`);
  }

  // Only allow deletion of draft or cancelled workflows
  if (!['draft', 'cancelled'].includes(existingWorkflow.Item.status as string)) {
    throw new ForbiddenError('Only draft or cancelled workflows can be deleted');
  }

  await dynamoClient.delete({
    TableName: WORKFLOWS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  logInfo('Deleted workflow', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'deleteWorkflow',
    entityType: 'workflow',
    entityId: workflowId,
  });

  return createSuccessResponse({ message: 'Workflow deleted successfully' }, correlationId);
}

/**
 * Progresses a workflow to the next phase
 * 
 * Validates: Requirements 6.1
 */
async function progressPhase(
  context: RequestContext,
  workflowId: string,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('WORKFLOW', workflowId);

  // Get current workflow
  const existingWorkflow = await dynamoClient.get({
    TableName: WORKFLOWS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!existingWorkflow.Item) {
    throw new NotFoundError(`Workflow not found: ${workflowId}`);
  }

  const workflow = existingWorkflow.Item as unknown as Workflow;
  
  // Validate workflow is in progress
  if (workflow.status !== 'in_progress' && workflow.status !== 'draft') {
    throw new ValidationError('Workflow must be in draft or in_progress status to progress phases');
  }

  const phases = [...workflow.phases];
  const currentPhaseIndex = phases.findIndex(p => p.name === workflow.currentPhase);
  
  if (currentPhaseIndex === -1) {
    throw new ValidationError('Current phase not found in workflow');
  }

  const now = new Date().toISOString();

  // Handle phase action
  const action = body.action || 'complete';
  
  if (action === 'complete') {
    // Mark current phase as completed
    phases[currentPhaseIndex] = {
      ...phases[currentPhaseIndex],
      status: 'completed',
      completedAt: now,
    };

    // Find next pending phase
    const nextPhaseIndex = phases.findIndex((p, i) => i > currentPhaseIndex && p.status === 'pending');
    
    let newStatus: WorkflowStatus = workflow.status === 'draft' ? 'in_progress' : workflow.status;
    let newCurrentPhase = workflow.currentPhase;

    if (nextPhaseIndex !== -1) {
      // Start next phase
      phases[nextPhaseIndex] = {
        ...phases[nextPhaseIndex],
        status: 'in_progress',
        startedAt: now,
      };
      newCurrentPhase = phases[nextPhaseIndex].name;
    } else {
      // All phases completed
      newStatus = 'completed';
    }

    const result = await dynamoClient.update({
      TableName: WORKFLOWS_TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression: 'SET #phases = :phases, #currentPhase = :currentPhase, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#phases': 'phases',
        '#currentPhase': 'currentPhase',
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':phases': phases,
        ':currentPhase': newCurrentPhase,
        ':status': newStatus,
        ':updatedAt': now,
      },
      ReturnValues: 'ALL_NEW',
    });

    logInfo('Progressed workflow phase', correlationId, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'progressPhase',
      entityType: 'workflow',
      entityId: workflowId,
      metadata: { 
        completedPhase: workflow.currentPhase,
        newPhase: newCurrentPhase,
        newStatus,
      },
    });

    const { PK, SK, ...workflowResponse } = result.Attributes!;
    return createSuccessResponse(workflowResponse, correlationId);
  } else if (action === 'skip') {
    // Mark current phase as skipped
    phases[currentPhaseIndex] = {
      ...phases[currentPhaseIndex],
      status: 'skipped',
      completedAt: now,
    };

    // Find next pending phase
    const nextPhaseIndex = phases.findIndex((p, i) => i > currentPhaseIndex && p.status === 'pending');
    
    let newStatus: WorkflowStatus = workflow.status === 'draft' ? 'in_progress' : workflow.status;
    let newCurrentPhase = workflow.currentPhase;

    if (nextPhaseIndex !== -1) {
      phases[nextPhaseIndex] = {
        ...phases[nextPhaseIndex],
        status: 'in_progress',
        startedAt: now,
      };
      newCurrentPhase = phases[nextPhaseIndex].name;
    } else {
      newStatus = 'completed';
    }

    const result = await dynamoClient.update({
      TableName: WORKFLOWS_TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression: 'SET #phases = :phases, #currentPhase = :currentPhase, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#phases': 'phases',
        '#currentPhase': 'currentPhase',
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':phases': phases,
        ':currentPhase': newCurrentPhase,
        ':status': newStatus,
        ':updatedAt': now,
      },
      ReturnValues: 'ALL_NEW',
    });

    logInfo('Skipped workflow phase', correlationId, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'skipPhase',
      entityType: 'workflow',
      entityId: workflowId,
      metadata: { skippedPhase: workflow.currentPhase, newPhase: newCurrentPhase },
    });

    const { PK, SK, ...workflowResponse } = result.Attributes!;
    return createSuccessResponse(workflowResponse, correlationId);
  } else if (action === 'start') {
    // Start the current phase (for draft workflows)
    if (workflow.status !== 'draft') {
      throw new ValidationError('Can only start phases for draft workflows');
    }

    phases[currentPhaseIndex] = {
      ...phases[currentPhaseIndex],
      status: 'in_progress',
      startedAt: now,
    };

    const result = await dynamoClient.update({
      TableName: WORKFLOWS_TABLE,
      Key: { PK: pk, SK: sk },
      UpdateExpression: 'SET #phases = :phases, #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#phases': 'phases',
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':phases': phases,
        ':status': 'in_progress',
        ':updatedAt': now,
      },
      ReturnValues: 'ALL_NEW',
    });

    logInfo('Started workflow', correlationId, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'startWorkflow',
      entityType: 'workflow',
      entityId: workflowId,
    });

    const { PK, SK, ...workflowResponse } = result.Attributes!;
    return createSuccessResponse(workflowResponse, correlationId);
  }

  throw new ValidationError('Invalid action. Must be one of: complete, skip, start');
}

/**
 * Generates a unique workflow ID
 */
function generateWorkflowId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
