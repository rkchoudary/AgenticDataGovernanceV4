/**
 * User Management Lambda Handler
 * 
 * Implements user CRUD operations, invitation flow, and role assignment.
 * 
 * Validates: Requirements 6.1, 14.2
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
  logError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  LambdaError,
} from '../shared/error-handling.js';
import { User, UserRole, UserStatus, PaginatedResponse, RequestContext } from '../shared/types.js';

// Environment variables
const USERS_TABLE = process.env.USERS_TABLE || 'governance-dev-users';
const TENANTS_TABLE = process.env.TENANTS_TABLE || 'governance-dev-tenants';
const USER_POOL_ID = process.env.USER_POOL_ID || '';

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
  }): Promise<{ Attributes?: Record<string, unknown> }>;
  delete(params: { TableName: string; Key: Record<string, unknown> }): Promise<void>;
  query(params: { 
    TableName: string; 
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    Limit?: number;
    ExclusiveStartKey?: Record<string, unknown>;
  }): Promise<{ Items?: Record<string, unknown>[]; LastEvaluatedKey?: Record<string, unknown> }>;
}

/**
 * Cognito client interface (to be injected for testing)
 */
export interface CognitoClient {
  adminCreateUser(params: {
    UserPoolId: string;
    Username: string;
    UserAttributes: Array<{ Name: string; Value: string }>;
    DesiredDeliveryMediums: string[];
  }): Promise<{ User?: { Username: string } }>;
  adminAddUserToGroup(params: {
    UserPoolId: string;
    Username: string;
    GroupName: string;
  }): Promise<void>;
  adminRemoveUserFromGroup(params: {
    UserPoolId: string;
    Username: string;
    GroupName: string;
  }): Promise<void>;
  adminDisableUser(params: {
    UserPoolId: string;
    Username: string;
  }): Promise<void>;
  adminDeleteUser(params: {
    UserPoolId: string;
    Username: string;
  }): Promise<void>;
}

// Default clients (will be replaced with actual AWS SDK clients in production)
let dynamoClient: DynamoDBClient;
let cognitoClient: CognitoClient;

/**
 * Sets the DynamoDB client (for dependency injection in tests)
 */
export function setDynamoClient(client: DynamoDBClient): void {
  dynamoClient = client;
}

/**
 * Sets the Cognito client (for dependency injection in tests)
 */
export function setCognitoClient(client: CognitoClient): void {
  cognitoClient = client;
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

    logInfo('Processing user management request', correlationId, {
      tenantId: requestContext.tenantId,
      userId: requestContext.userId,
      action: `${event.requestContext.http.method} ${event.rawPath}`,
    });

    // Route to appropriate handler based on HTTP method and path
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const pathParams = event.pathParameters || {};

    if (path === '/api/users' && method === 'GET') {
      return await listUsers(requestContext, event, correlationId);
    }
    
    if (path === '/api/users' && method === 'POST') {
      return await createUser(requestContext, event, correlationId);
    }
    
    if (path.match(/^\/api\/users\/[^/]+$/) && method === 'GET') {
      return await getUser(requestContext, pathParams.userId!, correlationId);
    }
    
    if (path.match(/^\/api\/users\/[^/]+$/) && method === 'PUT') {
      return await updateUser(requestContext, pathParams.userId!, event, correlationId);
    }
    
    if (path.match(/^\/api\/users\/[^/]+$/) && method === 'DELETE') {
      return await deleteUser(requestContext, pathParams.userId!, correlationId);
    }
    
    if (path.match(/^\/api\/users\/[^/]+\/role$/) && method === 'PUT') {
      return await assignRole(requestContext, pathParams.userId!, event, correlationId);
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
 * Lists users for the tenant
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function listUsers(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const limit = parseInt(event.queryStringParameters?.limit || '50', 10);
  const nextToken = event.queryStringParameters?.nextToken;

  const pk = createTenantPartitionKey(context.tenantId);
  
  const params: Parameters<DynamoDBClient['query']>[0] = {
    TableName: USERS_TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': pk,
      ':skPrefix': 'USER#',
    },
    Limit: Math.min(limit, 100),
  };

  if (nextToken) {
    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
  }

  const result = await dynamoClient.query(params);
  
  const response: PaginatedResponse<Omit<User, 'PK' | 'SK'>> = {
    items: (result.Items || []).map(item => ({
      userId: item.userId as string,
      tenantId: item.tenantId as string,
      email: item.email as string,
      name: item.name as string,
      givenName: item.givenName as string,
      familyName: item.familyName as string,
      role: item.role as UserRole,
      status: item.status as UserStatus,
      cognitoSub: item.cognitoSub as string | undefined,
      createdAt: item.createdAt as string,
      updatedAt: item.updatedAt as string,
      lastLoginAt: item.lastLoginAt as string | undefined,
    })),
    count: result.Items?.length || 0,
    nextToken: result.LastEvaluatedKey 
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };

  logInfo('Listed users', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'listUsers',
    metadata: { count: response.count },
  });

  return createSuccessResponse(response, correlationId);
}

/**
 * Creates/invites a new user
 * 
 * Validates: Requirements 6.1, 14.2
 */
async function createUser(
  context: RequestContext,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  // Check if user has admin role
  if (!context.roles.includes('admin')) {
    throw new ForbiddenError('Only administrators can invite users');
  }

  const body = JSON.parse(event.body || '{}');
  
  // Validate required fields
  if (!body.email || typeof body.email !== 'string') {
    throw new ValidationError('email is required');
  }
  if (!body.givenName || typeof body.givenName !== 'string') {
    throw new ValidationError('givenName is required');
  }
  if (!body.familyName || typeof body.familyName !== 'string') {
    throw new ValidationError('familyName is required');
  }
  if (!body.role || !['admin', 'compliance_officer', 'data_steward', 'viewer'].includes(body.role)) {
    throw new ValidationError('role must be one of: admin, compliance_officer, data_steward, viewer');
  }

  const userId = generateUserId();
  const now = new Date().toISOString();
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('USER', userId);

  // Create user in Cognito
  const cognitoResult = await cognitoClient.adminCreateUser({
    UserPoolId: USER_POOL_ID,
    Username: body.email,
    UserAttributes: [
      { Name: 'email', Value: body.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'given_name', Value: body.givenName },
      { Name: 'family_name', Value: body.familyName },
      { Name: 'custom:tenant_id', Value: context.tenantId },
    ],
    DesiredDeliveryMediums: ['EMAIL'],
  });

  // Add user to Cognito group
  await cognitoClient.adminAddUserToGroup({
    UserPoolId: USER_POOL_ID,
    Username: body.email,
    GroupName: body.role,
  });

  // Create user record in DynamoDB
  const user: User = {
    PK: pk,
    SK: sk,
    userId,
    tenantId: context.tenantId,
    email: body.email,
    name: `${body.givenName} ${body.familyName}`,
    givenName: body.givenName,
    familyName: body.familyName,
    role: body.role,
    status: 'invited',
    cognitoSub: cognitoResult.User?.Username,
    createdAt: now,
    updatedAt: now,
  };

  await dynamoClient.put({
    TableName: USERS_TABLE,
    Item: user as unknown as Record<string, unknown>,
  });

  logInfo('Created user', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'createUser',
    entityType: 'user',
    entityId: userId,
  });

  // Return user without PK/SK
  const { PK, SK, ...userResponse } = user;
  return createSuccessResponse(userResponse, correlationId, 201);
}

/**
 * Gets a user by ID
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function getUser(
  context: RequestContext,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('USER', userId);

  const result = await dynamoClient.get({
    TableName: USERS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!result.Item) {
    throw new NotFoundError(`User not found: ${userId}`);
  }

  logInfo('Retrieved user', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getUser',
    entityType: 'user',
    entityId: userId,
  });

  // Return user without PK/SK
  const { PK, SK, ...userResponse } = result.Item;
  return createSuccessResponse(userResponse, correlationId);
}

/**
 * Updates a user
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function updateUser(
  context: RequestContext,
  userId: string,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const body = JSON.parse(event.body || '{}');
  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('USER', userId);

  // Build update expression
  const updateParts: string[] = [];
  const expressionNames: Record<string, string> = {};
  const expressionValues: Record<string, unknown> = {};

  if (body.givenName) {
    updateParts.push('#givenName = :givenName');
    expressionNames['#givenName'] = 'givenName';
    expressionValues[':givenName'] = body.givenName;
  }

  if (body.familyName) {
    updateParts.push('#familyName = :familyName');
    expressionNames['#familyName'] = 'familyName';
    expressionValues[':familyName'] = body.familyName;
  }

  if (body.status && ['active', 'disabled'].includes(body.status)) {
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

  // Update name if givenName or familyName changed
  if (body.givenName || body.familyName) {
    updateParts.push('#name = :name');
    expressionNames['#name'] = 'name';
    expressionValues[':name'] = `${body.givenName || ''} ${body.familyName || ''}`.trim();
  }

  const result = await dynamoClient.update({
    TableName: USERS_TABLE,
    Key: { PK: pk, SK: sk },
    UpdateExpression: `SET ${updateParts.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  });

  if (!result.Attributes) {
    throw new NotFoundError(`User not found: ${userId}`);
  }

  logInfo('Updated user', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'updateUser',
    entityType: 'user',
    entityId: userId,
  });

  const { PK, SK, ...userResponse } = result.Attributes;
  return createSuccessResponse(userResponse, correlationId);
}

/**
 * Deletes a user
 * 
 * Validates: Requirements 6.1, 6.2, 6.3
 */
async function deleteUser(
  context: RequestContext,
  userId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  // Check if user has admin role
  if (!context.roles.includes('admin')) {
    throw new ForbiddenError('Only administrators can delete users');
  }

  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('USER', userId);

  // Get user first to get email for Cognito deletion
  const existingUser = await dynamoClient.get({
    TableName: USERS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!existingUser.Item) {
    throw new NotFoundError(`User not found: ${userId}`);
  }

  // Delete from Cognito
  await cognitoClient.adminDeleteUser({
    UserPoolId: USER_POOL_ID,
    Username: existingUser.Item.email as string,
  });

  // Delete from DynamoDB
  await dynamoClient.delete({
    TableName: USERS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  logInfo('Deleted user', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'deleteUser',
    entityType: 'user',
    entityId: userId,
  });

  return createSuccessResponse({ message: 'User deleted successfully' }, correlationId);
}

/**
 * Assigns a role to a user
 * 
 * Validates: Requirements 14.2
 */
async function assignRole(
  context: RequestContext,
  userId: string,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  // Check if user has admin role
  if (!context.roles.includes('admin')) {
    throw new ForbiddenError('Only administrators can assign roles');
  }

  const body = JSON.parse(event.body || '{}');
  
  if (!body.role || !['admin', 'compliance_officer', 'data_steward', 'viewer'].includes(body.role)) {
    throw new ValidationError('role must be one of: admin, compliance_officer, data_steward, viewer');
  }

  const pk = createTenantPartitionKey(context.tenantId);
  const sk = createSortKey('USER', userId);

  // Get existing user
  const existingUser = await dynamoClient.get({
    TableName: USERS_TABLE,
    Key: { PK: pk, SK: sk },
  });

  if (!existingUser.Item) {
    throw new NotFoundError(`User not found: ${userId}`);
  }

  const oldRole = existingUser.Item.role as string;
  const newRole = body.role as UserRole;

  // Update Cognito group membership
  if (oldRole !== newRole) {
    // Remove from old group
    await cognitoClient.adminRemoveUserFromGroup({
      UserPoolId: USER_POOL_ID,
      Username: existingUser.Item.email as string,
      GroupName: oldRole,
    });

    // Add to new group
    await cognitoClient.adminAddUserToGroup({
      UserPoolId: USER_POOL_ID,
      Username: existingUser.Item.email as string,
      GroupName: newRole,
    });
  }

  // Update DynamoDB
  const result = await dynamoClient.update({
    TableName: USERS_TABLE,
    Key: { PK: pk, SK: sk },
    UpdateExpression: 'SET #role = :role, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#role': 'role',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':role': newRole,
      ':updatedAt': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW',
  });

  logInfo('Assigned role to user', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'assignRole',
    entityType: 'user',
    entityId: userId,
    metadata: { oldRole, newRole },
  });

  const { PK, SK, ...userResponse } = result.Attributes!;
  return createSuccessResponse(userResponse, correlationId);
}

/**
 * Generates a unique user ID
 */
function generateUserId(): string {
  return `usr_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
