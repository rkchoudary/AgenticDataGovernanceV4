import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  extractRequestContext,
  validateTenantAccess,
  createTenantPartitionKey,
  extractTenantIdFromPartitionKey,
  validateTenantContext,
  getCorrelationId,
  JwtClaims,
} from '../../lib/lambda/shared/tenant-validation.js';

/**
 * **Feature: private-aws-deployment, Property 6: Lambda Tenant Validation**
 * 
 * For any Lambda function invocation, the function SHALL validate that the tenant_id
 * in the request context matches the authenticated user's tenant.
 * 
 * **Validates: Requirements 6.2, 6.3**
 */
describe('Property 6: Lambda Tenant Validation', () => {
  // Arbitrary for generating valid tenant IDs
  const validTenantId = fc.string({ minLength: 1, maxLength: 36 })
    .filter(s => s.trim().length > 0 && !s.includes('#'));

  // Arbitrary for generating valid user IDs (UUID-like)
  const validUserId = fc.uuid();

  // Arbitrary for generating valid emails
  const validEmail = fc.emailAddress();

  // Arbitrary for generating valid roles
  const validRole = fc.constantFrom('admin', 'compliance_officer', 'data_steward', 'viewer');

  // Arbitrary for generating valid JWT claims
  const validJwtClaims = fc.record({
    sub: validUserId,
    email: validEmail,
    'cognito:groups': fc.array(validRole, { minLength: 1, maxLength: 4 }),
    'custom:tenant_id': validTenantId,
    given_name: fc.string({ minLength: 1, maxLength: 50 }),
    family_name: fc.string({ minLength: 1, maxLength: 50 }),
  });

  // Arbitrary for generating API Gateway events with valid JWT claims
  const validApiGatewayEvent = validJwtClaims.map(claims => ({
    requestContext: {
      authorizer: {
        jwt: {
          claims: claims as JwtClaims,
        },
      },
      requestId: `req-${Date.now()}`,
    },
    headers: {
      'x-correlation-id': `corr-${Date.now()}`,
    },
  }));

  /**
   * Property: Valid JWT claims should produce valid request context
   * 
   * For any valid JWT claims with tenant_id, the extraction should succeed
   * and produce a request context with matching tenant_id.
   */
  it('should extract valid request context from JWT claims', () => {
    fc.assert(
      fc.property(validApiGatewayEvent, (event) => {
        // Given a valid API Gateway event with JWT claims
        // When we extract the request context
        const context = extractRequestContext(event);
        
        // Then the context should not be null
        expect(context).not.toBeNull();
        
        // And the tenant_id should match the JWT claim
        const expectedTenantId = event.requestContext.authorizer.jwt.claims['custom:tenant_id'];
        expect(context!.tenantId).toBe(expectedTenantId?.trim());
        
        // And the user_id should match the sub claim
        expect(context!.userId).toBe(event.requestContext.authorizer.jwt.claims.sub);
        
        // And the email should match
        expect(context!.email).toBe(event.requestContext.authorizer.jwt.claims.email);
        
        // And roles should be extracted from cognito:groups
        expect(context!.roles).toEqual(event.requestContext.authorizer.jwt.claims['cognito:groups']);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Tenant access validation should only allow matching tenant IDs
   * 
   * For any request context and resource tenant ID, access should only be
   * granted when the tenant IDs match exactly.
   */
  it('should validate tenant access only for matching tenant IDs', () => {
    fc.assert(
      fc.property(validTenantId, validTenantId, validUserId, validEmail, fc.array(validRole), 
        (contextTenantId, resourceTenantId, userId, email, roles) => {
          // Given a request context with a tenant ID
          const context = {
            tenantId: contextTenantId,
            userId,
            email,
            roles,
            correlationId: 'test-correlation-id',
          };
          
          // When we validate access to a resource
          const hasAccess = validateTenantAccess(context, resourceTenantId);
          
          // Then access should be granted only if tenant IDs match
          if (contextTenantId === resourceTenantId) {
            expect(hasAccess).toBe(true);
          } else {
            expect(hasAccess).toBe(false);
          }
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Same tenant ID should always grant access
   * 
   * For any tenant ID, a request context with that tenant ID should always
   * have access to resources with the same tenant ID.
   */
  it('should always grant access for same tenant ID', () => {
    fc.assert(
      fc.property(validTenantId, validUserId, validEmail, fc.array(validRole),
        (tenantId, userId, email, roles) => {
          // Given a request context and resource with the same tenant ID
          const context = {
            tenantId,
            userId,
            email,
            roles,
            correlationId: 'test-correlation-id',
          };
          
          // When we validate access
          const hasAccess = validateTenantAccess(context, tenantId);
          
          // Then access should always be granted
          expect(hasAccess).toBe(true);
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Different tenant IDs should never grant access
   * 
   * For any two different tenant IDs, a request context with one tenant ID
   * should never have access to resources with a different tenant ID.
   */
  it('should never grant access for different tenant IDs', () => {
    fc.assert(
      fc.property(validTenantId, validTenantId, validUserId, validEmail, fc.array(validRole),
        (tenantId1, tenantId2, userId, email, roles) => {
          // Skip if tenant IDs are the same
          fc.pre(tenantId1 !== tenantId2);
          
          // Given a request context with one tenant ID
          const context = {
            tenantId: tenantId1,
            userId,
            email,
            roles,
            correlationId: 'test-correlation-id',
          };
          
          // When we validate access to a resource with a different tenant ID
          const hasAccess = validateTenantAccess(context, tenantId2);
          
          // Then access should be denied
          expect(hasAccess).toBe(false);
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing tenant_id in JWT claims should fail extraction
   */
  it('should fail extraction when tenant_id is missing', () => {
    const eventWithoutTenantId = fc.record({
      sub: validUserId,
      email: validEmail,
      'cognito:groups': fc.array(validRole),
    }).map(claims => ({
      requestContext: {
        authorizer: {
          jwt: {
            claims: claims as JwtClaims,
          },
        },
      },
      headers: {},
    }));

    fc.assert(
      fc.property(eventWithoutTenantId, (event) => {
        // Given an event without tenant_id in claims
        // When we extract the request context
        const context = extractRequestContext(event);
        
        // Then the context should be null
        expect(context).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty tenant_id should fail extraction
   */
  it('should fail extraction when tenant_id is empty', () => {
    const emptyTenantIds = fc.constantFrom('', '   ', '\t', '\n');
    
    const eventWithEmptyTenantId = fc.tuple(validUserId, validEmail, fc.array(validRole), emptyTenantIds)
      .map(([sub, email, groups, tenantId]) => ({
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub,
                email,
                'cognito:groups': groups,
                'custom:tenant_id': tenantId,
              } as JwtClaims,
            },
          },
        },
        headers: {},
      }));

    fc.assert(
      fc.property(eventWithEmptyTenantId, (event) => {
        // Given an event with empty tenant_id
        // When we extract the request context
        const context = extractRequestContext(event);
        
        // Then the context should be null
        expect(context).toBeNull();
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Missing authorizer should fail extraction
   */
  it('should fail extraction when authorizer is missing', () => {
    fc.assert(
      fc.property(fc.constant({}), () => {
        // Given an event without authorizer
        const event = {
          requestContext: {},
          headers: {},
        };
        
        // When we extract the request context
        const context = extractRequestContext(event);
        
        // Then the context should be null
        expect(context).toBeNull();
      }),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Partition key creation should include tenant ID
   * 
   * For any valid tenant ID, the created partition key should contain
   * that tenant ID and follow the TENANT# pattern.
   */
  it('should create partition keys that include tenant ID', () => {
    fc.assert(
      fc.property(validTenantId, (tenantId) => {
        // Given a valid tenant ID
        // When we create a partition key
        const pk = createTenantPartitionKey(tenantId);
        
        // Then the partition key should start with TENANT#
        expect(pk.startsWith('TENANT#')).toBe(true);
        
        // And extracting the tenant ID should return the original
        const extracted = extractTenantIdFromPartitionKey(pk);
        expect(extracted).toBe(tenantId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Tenant context validation should detect missing fields
   */
  it('should detect missing fields in tenant context', () => {
    // Test null context
    expect(validateTenantContext(null)).toBe('Missing authentication context');
    
    // Test missing tenant_id
    const contextWithoutTenant = {
      tenantId: '',
      userId: 'user-123',
      email: 'test@example.com',
      roles: ['admin'],
      correlationId: 'corr-123',
    };
    expect(validateTenantContext(contextWithoutTenant)).toBe('Missing tenant_id in authentication context');
    
    // Test missing user_id
    const contextWithoutUser = {
      tenantId: 'tenant-123',
      userId: '',
      email: 'test@example.com',
      roles: ['admin'],
      correlationId: 'corr-123',
    };
    expect(validateTenantContext(contextWithoutUser)).toBe('Missing user_id in authentication context');
    
    // Test valid context
    const validContext = {
      tenantId: 'tenant-123',
      userId: 'user-123',
      email: 'test@example.com',
      roles: ['admin'],
      correlationId: 'corr-123',
    };
    expect(validateTenantContext(validContext)).toBeNull();
  });

  /**
   * Property: Correlation ID should be extracted or generated
   */
  it('should extract or generate correlation ID', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        fc.option(fc.string({ minLength: 1, maxLength: 50 })),
        (headerCorrelationId, requestId) => {
          // Given headers with optional correlation ID
          const headers: Record<string, string | undefined> = {};
          if (headerCorrelationId !== null) {
            headers['x-correlation-id'] = headerCorrelationId;
          }
          
          // When we get the correlation ID
          const correlationId = getCorrelationId(headers, requestId ?? undefined);
          
          // Then we should get a non-empty string
          expect(correlationId).toBeTruthy();
          expect(typeof correlationId).toBe('string');
          
          // And if header was provided, it should be used
          if (headerCorrelationId !== null) {
            expect(correlationId).toBe(headerCorrelationId);
          } else if (requestId !== null) {
            // Otherwise request ID should be used
            expect(correlationId).toBe(requestId);
          }
          // Otherwise a generated ID is used
        }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Null or undefined context should deny access
   */
  it('should deny access for null or undefined context', () => {
    fc.assert(
      fc.property(validTenantId, (resourceTenantId) => {
        // Given null or undefined context
        // When we validate access
        const hasAccessNull = validateTenantAccess(null as any, resourceTenantId);
        const hasAccessUndefined = validateTenantAccess(undefined as any, resourceTenantId);
        
        // Then access should be denied
        expect(hasAccessNull).toBe(false);
        expect(hasAccessUndefined).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Empty resource tenant ID should deny access
   */
  it('should deny access for empty resource tenant ID', () => {
    fc.assert(
      fc.property(validTenantId, validUserId, validEmail, fc.array(validRole),
        (tenantId, userId, email, roles) => {
          // Given a valid context
          const context = {
            tenantId,
            userId,
            email,
            roles,
            correlationId: 'test-correlation-id',
          };
          
          // When we validate access to empty resource tenant ID
          const hasAccessEmpty = validateTenantAccess(context, '');
          const hasAccessNull = validateTenantAccess(context, null as any);
          const hasAccessUndefined = validateTenantAccess(context, undefined as any);
          
          // Then access should be denied
          expect(hasAccessEmpty).toBe(false);
          expect(hasAccessNull).toBe(false);
          expect(hasAccessUndefined).toBe(false);
        }),
      { numRuns: 50 }
    );
  });
});
