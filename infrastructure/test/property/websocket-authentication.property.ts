import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateWebSocketAuth,
  createMockJwt,
  shouldAcceptConnection,
  WebSocketConnectionRequest,
} from '../../lib/stacks/websocket-api-stack.js';

/**
 * **Feature: private-aws-deployment, Property 9: WebSocket Authentication**
 *
 * For any WebSocket connection establishment, the connection handler SHALL
 * validate the Cognito JWT token before accepting the connection.
 *
 * **Validates: Requirements 11.5**
 */
describe('Property 9: WebSocket Authentication', () => {
  // Test constants
  const TEST_USER_POOL_ID = 'us-west-2_TestPool123';
  const TEST_CLIENT_ID = 'test-client-id-12345';

  // Arbitrary for generating valid user IDs
  const validUserId = fc.uuid();

  // Arbitrary for generating valid tenant IDs
  const validTenantId = fc.stringMatching(/^tenant-[a-z0-9]{8}$/);

  // Arbitrary for generating valid roles
  const validRoles = fc.subarray(
    ['admin', 'compliance_officer', 'data_steward', 'viewer'],
    { minLength: 1, maxLength: 4 }
  );

  // Arbitrary for generating valid JWT payloads
  const validJwtPayload = fc.record({
    sub: validUserId,
    'custom:tenant_id': validTenantId,
    'cognito:groups': validRoles,
    exp: fc.integer({ min: Math.floor(Date.now() / 1000) + 60, max: Math.floor(Date.now() / 1000) + 7200 }),
  });

  // Arbitrary for generating invalid tokens (not JWT format)
  const invalidTokenFormat = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.split('.').length !== 3),
    fc.constant('invalid-token'),
    fc.constant('part1.part2'),
    fc.constant(''),
  );


  /**
   * Property: Missing token should reject connection
   */
  it('should reject WebSocket connections without authentication token', () => {
    fc.assert(
      fc.property(
        fc.record({
          queryStringParameters: fc.constant({}),
          requestContext: fc.record({
            connectionId: fc.uuid(),
            routeKey: fc.constant('$connect'),
            eventType: fc.constant('CONNECT'),
          }),
        }),
        (request: WebSocketConnectionRequest) => {
          // Given a WebSocket connection request without a token
          // When we validate the authentication
          const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

          // Then authentication should fail
          expect(result.isAuthenticated).toBe(false);
          expect(result.error).toBe('Missing authentication token in query parameters');
          expect(shouldAcceptConnection(result)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid token format should reject connection
   */
  it('should reject WebSocket connections with invalid token format', () => {
    fc.assert(
      fc.property(invalidTokenFormat, (invalidToken) => {
        // Given a WebSocket connection request with an invalid token format
        const request: WebSocketConnectionRequest = {
          queryStringParameters: { token: invalidToken },
          requestContext: {
            connectionId: 'test-connection-id',
            routeKey: '$connect',
            eventType: 'CONNECT',
          },
        };

        // When we validate the authentication
        const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

        // Then authentication should fail
        expect(result.isAuthenticated).toBe(false);
        expect(result.error).toBeDefined();
        expect(shouldAcceptConnection(result)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });


  /**
   * Property: Valid token should accept connection and extract user info
   */
  it('should accept WebSocket connections with valid JWT token', () => {
    fc.assert(
      fc.property(validJwtPayload, (payload) => {
        // Given a valid JWT token
        const token = createMockJwt(payload, TEST_USER_POOL_ID, TEST_CLIENT_ID);
        const request: WebSocketConnectionRequest = {
          queryStringParameters: { token },
          requestContext: {
            connectionId: 'test-connection-id',
            routeKey: '$connect',
            eventType: 'CONNECT',
          },
        };

        // When we validate the authentication
        const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

        // Then authentication should succeed
        expect(result.isAuthenticated).toBe(true);
        expect(result.userId).toBe(payload.sub);
        expect(result.tenantId).toBe(payload['custom:tenant_id']);
        expect(result.roles).toEqual(payload['cognito:groups']);
        expect(result.error).toBeUndefined();
        expect(shouldAcceptConnection(result)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Expired token should reject connection
   */
  it('should reject WebSocket connections with expired token', () => {
    fc.assert(
      fc.property(
        fc.record({
          sub: validUserId,
          'custom:tenant_id': validTenantId,
          'cognito:groups': validRoles,
          // Expired token (in the past)
          exp: fc.integer({ min: 0, max: Math.floor(Date.now() / 1000) - 60 }),
        }),
        (payload) => {
          // Given an expired JWT token
          const token = createMockJwt(payload, TEST_USER_POOL_ID, TEST_CLIENT_ID);
          const request: WebSocketConnectionRequest = {
            queryStringParameters: { token },
            requestContext: {
              connectionId: 'test-connection-id',
              routeKey: '$connect',
              eventType: 'CONNECT',
            },
          };

          // When we validate the authentication
          const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

          // Then authentication should fail due to expiration
          expect(result.isAuthenticated).toBe(false);
          expect(result.error).toBe('Token has expired');
          expect(shouldAcceptConnection(result)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property: Token with wrong issuer should reject connection
   */
  it('should reject WebSocket connections with invalid issuer', () => {
    fc.assert(
      fc.property(
        validJwtPayload,
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => s !== TEST_USER_POOL_ID),
        (payload, wrongPoolId) => {
          // Given a JWT token with wrong issuer
          const token = createMockJwt(payload, wrongPoolId, TEST_CLIENT_ID);
          const request: WebSocketConnectionRequest = {
            queryStringParameters: { token },
            requestContext: {
              connectionId: 'test-connection-id',
              routeKey: '$connect',
              eventType: 'CONNECT',
            },
          };

          // When we validate the authentication against the correct pool
          const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

          // Then authentication should fail due to invalid issuer
          expect(result.isAuthenticated).toBe(false);
          expect(result.error).toBe('Invalid issuer');
          expect(shouldAcceptConnection(result)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Authentication result is deterministic
   */
  it('should return consistent results for the same token', () => {
    fc.assert(
      fc.property(validJwtPayload, (payload) => {
        // Given a valid JWT token
        const token = createMockJwt(payload, TEST_USER_POOL_ID, TEST_CLIENT_ID);
        const request: WebSocketConnectionRequest = {
          queryStringParameters: { token },
          requestContext: {
            connectionId: 'test-connection-id',
            routeKey: '$connect',
            eventType: 'CONNECT',
          },
        };

        // When we validate the same token multiple times
        const result1 = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);
        const result2 = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);
        const result3 = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

        // Then all results should be identical
        expect(result1.isAuthenticated).toBe(result2.isAuthenticated);
        expect(result2.isAuthenticated).toBe(result3.isAuthenticated);
        expect(result1.userId).toBe(result2.userId);
        expect(result2.userId).toBe(result3.userId);
        expect(result1.tenantId).toBe(result2.tenantId);
        expect(result2.tenantId).toBe(result3.tenantId);
      }),
      { numRuns: 100 }
    );
  });


  /**
   * Property: User info is correctly extracted from valid tokens
   */
  it('should correctly extract user information from valid tokens', () => {
    fc.assert(
      fc.property(
        validUserId,
        validTenantId,
        validRoles,
        (userId, tenantId, roles) => {
          // Given a JWT token with specific user info
          const payload = {
            sub: userId,
            'custom:tenant_id': tenantId,
            'cognito:groups': roles,
            exp: Math.floor(Date.now() / 1000) + 3600,
          };
          const token = createMockJwt(payload, TEST_USER_POOL_ID, TEST_CLIENT_ID);
          const request: WebSocketConnectionRequest = {
            queryStringParameters: { token },
            requestContext: {
              connectionId: 'test-connection-id',
              routeKey: '$connect',
              eventType: 'CONNECT',
            },
          };

          // When we validate the authentication
          const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

          // Then the extracted info should match the original
          expect(result.isAuthenticated).toBe(true);
          expect(result.userId).toBe(userId);
          expect(result.tenantId).toBe(tenantId);
          expect(result.roles).toEqual(roles);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: shouldAcceptConnection is consistent with isAuthenticated
   */
  it('should have shouldAcceptConnection consistent with isAuthenticated', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Valid token
          validJwtPayload.map(payload => createMockJwt(payload, TEST_USER_POOL_ID, TEST_CLIENT_ID)),
          // Invalid token
          invalidTokenFormat,
          // No token
          fc.constant(undefined)
        ),
        (token) => {
          // Given any token (valid, invalid, or missing)
          const request: WebSocketConnectionRequest = {
            queryStringParameters: token ? { token } : {},
            requestContext: {
              connectionId: 'test-connection-id',
              routeKey: '$connect',
              eventType: 'CONNECT',
            },
          };

          // When we validate the authentication
          const result = validateWebSocketAuth(request, TEST_USER_POOL_ID, TEST_CLIENT_ID);

          // Then shouldAcceptConnection should match isAuthenticated
          expect(shouldAcceptConnection(result)).toBe(result.isAuthenticated);
        }
      ),
      { numRuns: 100 }
    );
  });
});

