import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AgentUserContext,
  createAgentUserContext,
  validateUserContext,
} from '../../lib/lambda/agent-proxy/handler.js';
import { RequestContext } from '../../lib/lambda/shared/types.js';

/**
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 *
 * For any AgentCore agent invocation, the request SHALL include the user's
 * tenant_id and user_id extracted from the JWT token.
 *
 * **Validates: Requirements 5.4**
 */
describe('Property 12: User Context Propagation', () => {
  // Arbitrary for generating valid tenant IDs
  const validTenantId = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  // Arbitrary for generating valid user IDs
  const validUserId = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  // Arbitrary for generating valid emails
  const validEmail = fc.emailAddress();

  // Arbitrary for generating valid roles
  const validRoles = fc.array(
    fc.constantFrom('admin', 'compliance_officer', 'data_steward', 'viewer'),
    { minLength: 0, maxLength: 4 }
  );

  // Arbitrary for generating valid correlation IDs
  const validCorrelationId = fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  // Arbitrary for generating valid request contexts
  const validRequestContext = fc.record({
    tenantId: validTenantId,
    userId: validUserId,
    email: validEmail,
    roles: validRoles,
    correlationId: validCorrelationId,
  }) as fc.Arbitrary<RequestContext>;

  /**
   * Property: Valid request context should produce valid user context
   */
  it('should create valid user context from valid request context', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context
        // When we create user context
        const userContext = createAgentUserContext(requestContext);

        // Then the user context should contain the required fields
        expect(userContext.tenantId).toBe(requestContext.tenantId);
        expect(userContext.userId).toBe(requestContext.userId);
        expect(userContext.correlationId).toBe(requestContext.correlationId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: User context should preserve tenant_id exactly
   */
  it('should preserve tenant_id exactly from request context', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context
        // When we create user context
        const userContext = createAgentUserContext(requestContext);

        // Then tenant_id should be preserved exactly
        expect(userContext.tenantId).toBe(requestContext.tenantId);
        expect(userContext.tenantId.length).toBe(requestContext.tenantId.length);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: User context should preserve user_id exactly
   */
  it('should preserve user_id exactly from request context', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context
        // When we create user context
        const userContext = createAgentUserContext(requestContext);

        // Then user_id should be preserved exactly
        expect(userContext.userId).toBe(requestContext.userId);
        expect(userContext.userId.length).toBe(requestContext.userId.length);
      }),
      { numRuns: 100 }
    );
  });


  /**
   * Property: User context should include optional fields when present
   */
  it('should include optional fields when present in request context', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context with optional fields
        // When we create user context
        const userContext = createAgentUserContext(requestContext);

        // Then optional fields should be included
        expect(userContext.email).toBe(requestContext.email);
        expect(userContext.roles).toEqual(requestContext.roles);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: User context creation is deterministic
   */
  it('should return consistent results for the same request context', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context
        // When we create user context multiple times
        const context1 = createAgentUserContext(requestContext);
        const context2 = createAgentUserContext(requestContext);
        const context3 = createAgentUserContext(requestContext);

        // Then all results should be identical
        expect(context1.tenantId).toBe(context2.tenantId);
        expect(context2.tenantId).toBe(context3.tenantId);
        expect(context1.userId).toBe(context2.userId);
        expect(context2.userId).toBe(context3.userId);
        expect(context1.correlationId).toBe(context2.correlationId);
        expect(context2.correlationId).toBe(context3.correlationId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing tenant_id should throw ValidationError
   */
  it('should throw error when tenant_id is missing', () => {
    fc.assert(
      fc.property(
        validUserId,
        validEmail,
        validRoles,
        validCorrelationId,
        (userId, email, roles, correlationId) => {
          // Given a request context with missing tenant_id
          const invalidContext: RequestContext = {
            tenantId: '',
            userId,
            email,
            roles,
            correlationId,
          };

          // When we try to create user context
          // Then it should throw an error
          expect(() => createAgentUserContext(invalidContext)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing user_id should throw ValidationError
   */
  it('should throw error when user_id is missing', () => {
    fc.assert(
      fc.property(
        validTenantId,
        validEmail,
        validRoles,
        validCorrelationId,
        (tenantId, email, roles, correlationId) => {
          // Given a request context with missing user_id
          const invalidContext: RequestContext = {
            tenantId,
            userId: '',
            email,
            roles,
            correlationId,
          };

          // When we try to create user context
          // Then it should throw an error
          expect(() => createAgentUserContext(invalidContext)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Whitespace-only tenant_id should throw ValidationError
   */
  it('should throw error when tenant_id is whitespace only', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n')).filter(s => s.length > 0),
        validUserId,
        validEmail,
        validRoles,
        validCorrelationId,
        (whitespace, userId, email, roles, correlationId) => {
          // Given a request context with whitespace-only tenant_id
          const invalidContext: RequestContext = {
            tenantId: whitespace,
            userId,
            email,
            roles,
            correlationId,
          };

          // When we try to create user context
          // Then it should throw an error
          expect(() => createAgentUserContext(invalidContext)).toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Tests for user context validation
 */
describe('User Context Validation', () => {
  const validTenantId = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  const validUserId = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  const validCorrelationId = fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => s.trim().length > 0)
    .map(s => s.trim());

  const validUserContext = fc.record({
    tenantId: validTenantId,
    userId: validUserId,
    correlationId: validCorrelationId,
    email: fc.option(fc.emailAddress(), { nil: undefined }),
    roles: fc.option(fc.array(fc.string(), { minLength: 0, maxLength: 4 }), { nil: undefined }),
  }) as fc.Arbitrary<AgentUserContext>;

  /**
   * Property: Valid user context should pass validation
   */
  it('should pass validation for valid user context', () => {
    fc.assert(
      fc.property(validUserContext, (userContext) => {
        // Given a valid user context
        // When we validate it
        const error = validateUserContext(userContext);

        // Then validation should pass (no error)
        expect(error).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing tenant_id should fail validation
   */
  it('should fail validation when tenant_id is missing', () => {
    fc.assert(
      fc.property(
        validUserId,
        validCorrelationId,
        (userId, correlationId) => {
          // Given a user context with missing tenant_id
          const invalidContext: AgentUserContext = {
            tenantId: '',
            userId,
            correlationId,
          };

          // When we validate it
          const error = validateUserContext(invalidContext);

          // Then validation should fail
          expect(error).not.toBeNull();
          expect(error).toContain('tenant_id');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing user_id should fail validation
   */
  it('should fail validation when user_id is missing', () => {
    fc.assert(
      fc.property(
        validTenantId,
        validCorrelationId,
        (tenantId, correlationId) => {
          // Given a user context with missing user_id
          const invalidContext: AgentUserContext = {
            tenantId,
            userId: '',
            correlationId,
          };

          // When we validate it
          const error = validateUserContext(invalidContext);

          // Then validation should fail
          expect(error).not.toBeNull();
          expect(error).toContain('user_id');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing correlation_id should fail validation
   */
  it('should fail validation when correlation_id is missing', () => {
    fc.assert(
      fc.property(
        validTenantId,
        validUserId,
        (tenantId, userId) => {
          // Given a user context with missing correlation_id
          const invalidContext: AgentUserContext = {
            tenantId,
            userId,
            correlationId: '',
          };

          // When we validate it
          const error = validateUserContext(invalidContext);

          // Then validation should fail
          expect(error).not.toBeNull();
          expect(error).toContain('correlation_id');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Validation is deterministic
   */
  it('should return consistent validation results', () => {
    fc.assert(
      fc.property(
        fc.record({
          tenantId: fc.string({ minLength: 0, maxLength: 50 }),
          userId: fc.string({ minLength: 0, maxLength: 50 }),
          correlationId: fc.string({ minLength: 0, maxLength: 100 }),
        }) as fc.Arbitrary<AgentUserContext>,
        (userContext) => {
          // Given any user context
          // When we validate it multiple times
          const error1 = validateUserContext(userContext);
          const error2 = validateUserContext(userContext);
          const error3 = validateUserContext(userContext);

          // Then all results should be identical
          expect(error1).toBe(error2);
          expect(error2).toBe(error3);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Tests for complete user context propagation flow
 */
describe('Complete User Context Propagation Flow', () => {
  const validRequestContext = fc.record({
    tenantId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0).map(s => s.trim()),
    userId: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0).map(s => s.trim()),
    email: fc.emailAddress(),
    roles: fc.array(fc.constantFrom('admin', 'compliance_officer', 'data_steward', 'viewer'), { minLength: 0, maxLength: 4 }),
    correlationId: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0).map(s => s.trim()),
  }) as fc.Arbitrary<RequestContext>;

  /**
   * Property: Complete flow - create context and validate
   */
  it('should complete full context propagation flow', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context
        // Step 1: Create user context
        const userContext = createAgentUserContext(requestContext);

        // Step 2: Validate user context
        const validationError = validateUserContext(userContext);

        // Then the flow should complete successfully
        expect(validationError).toBeNull();
        expect(userContext.tenantId).toBe(requestContext.tenantId);
        expect(userContext.userId).toBe(requestContext.userId);
        expect(userContext.correlationId).toBe(requestContext.correlationId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Context propagation preserves all required fields
   */
  it('should preserve all required fields through propagation', () => {
    fc.assert(
      fc.property(validRequestContext, (requestContext) => {
        // Given a valid request context
        // When we create and validate user context
        const userContext = createAgentUserContext(requestContext);

        // Then all required fields should be present and correct
        expect(userContext.tenantId).toBeDefined();
        expect(userContext.tenantId.length).toBeGreaterThan(0);
        expect(userContext.userId).toBeDefined();
        expect(userContext.userId.length).toBeGreaterThan(0);
        expect(userContext.correlationId).toBeDefined();
        expect(userContext.correlationId.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });
});
