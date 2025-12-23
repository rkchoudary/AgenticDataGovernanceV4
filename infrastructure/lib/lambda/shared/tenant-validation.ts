/**
 * Tenant validation middleware for Lambda functions
 * 
 * **Feature: private-aws-deployment, Property 6: Lambda Tenant Validation**
 * For any Lambda function invocation, the function SHALL validate that the tenant_id
 * in the request context matches the authenticated user's tenant.
 * 
 * Validates: Requirements 6.2, 6.3
 */

import { RequestContext } from './types.js';

/**
 * JWT claims structure from Cognito
 */
export interface JwtClaims {
  sub: string;
  email?: string;
  'cognito:groups'?: string[];
  'custom:tenant_id'?: string;
  given_name?: string;
  family_name?: string;
  [key: string]: unknown;
}

/**
 * API Gateway event authorizer context
 */
export interface AuthorizerContext {
  claims?: JwtClaims;
  jwt?: {
    claims: JwtClaims;
  };
}

/**
 * Extracts and validates tenant context from API Gateway event
 * 
 * Validates: Requirements 6.2, 6.3
 */
export function extractRequestContext(
  event: {
    requestContext?: {
      authorizer?: AuthorizerContext;
      requestId?: string;
    };
    headers?: Record<string, string | undefined>;
  }
): RequestContext | null {
  const authorizer = event.requestContext?.authorizer;
  if (!authorizer) {
    return null;
  }

  // Extract claims from JWT authorizer
  const claims = authorizer.jwt?.claims || authorizer.claims;
  if (!claims) {
    return null;
  }

  // Extract tenant_id from custom claim
  const tenantId = claims['custom:tenant_id'];
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    return null;
  }

  // Extract user ID from sub claim
  const userId = claims.sub;
  if (!userId || typeof userId !== 'string') {
    return null;
  }

  // Extract email
  const email = claims.email;
  if (!email || typeof email !== 'string') {
    return null;
  }

  // Extract roles from cognito:groups
  const groups = claims['cognito:groups'];
  const roles = Array.isArray(groups) ? groups.filter(g => typeof g === 'string') : [];

  // Get or generate correlation ID
  const correlationId = getCorrelationId(event.headers || {}, event.requestContext?.requestId);

  return {
    tenantId: tenantId.trim(),
    userId,
    email,
    roles,
    correlationId,
  };
}

/**
 * Validates that a tenant ID matches the authenticated user's tenant
 * 
 * Validates: Requirements 6.2, 6.3
 */
export function validateTenantAccess(
  requestContext: RequestContext,
  resourceTenantId: string
): boolean {
  if (!requestContext || !resourceTenantId) {
    return false;
  }

  // Tenant IDs must match exactly
  return requestContext.tenantId === resourceTenantId;
}

/**
 * Creates a tenant-scoped partition key for DynamoDB
 * 
 * Validates: Requirements 4.2, 4.3
 */
export function createTenantPartitionKey(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new Error('tenantId is required and must be a non-empty string');
  }
  return `TENANT#${tenantId}`;
}

/**
 * Extracts tenant ID from a partition key
 */
export function extractTenantIdFromPartitionKey(partitionKey: string): string | null {
  if (!partitionKey || !partitionKey.startsWith('TENANT#')) {
    return null;
  }
  const tenantId = partitionKey.substring(7);
  return tenantId.length > 0 ? tenantId : null;
}

/**
 * Creates a sort key for an entity
 */
export function createSortKey(entityType: string, entityId: string): string {
  if (!entityType || !entityId) {
    throw new Error('entityType and entityId are required');
  }
  return `${entityType.toUpperCase()}#${entityId}`;
}

/**
 * Gets or generates a correlation ID
 */
export function getCorrelationId(
  headers: Record<string, string | undefined>,
  requestId?: string
): string {
  const correlationId = headers['x-correlation-id'] || headers['X-Correlation-Id'];
  if (correlationId && typeof correlationId === 'string') {
    return correlationId;
  }
  if (requestId) {
    return requestId;
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Validates that a request has a valid tenant context
 * Returns an error message if validation fails, null if valid
 */
export function validateTenantContext(context: RequestContext | null): string | null {
  if (!context) {
    return 'Missing authentication context';
  }

  if (!context.tenantId || context.tenantId.trim().length === 0) {
    return 'Missing tenant_id in authentication context';
  }

  if (!context.userId || context.userId.trim().length === 0) {
    return 'Missing user_id in authentication context';
  }

  return null;
}
