import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateAuthorizationHeader,
  getCorrelationId,
} from '../../lib/stacks/api-gateway-stack.js';

/**
 * **Feature: private-aws-deployment, Property 2: Authentication Enforcement**
 *
 * For any API request without a valid Cognito JWT token, the API Gateway
 * SHALL return a 401 Unauthorized response.
 *
 * **Validates: Requirements 2.4, 2.5**
 */
describe('Property 2: Authentication Enforcement', () => {
  // Arbitrary for generating valid JWT-like tokens (three base64-like parts)
  const validJwtToken = fc.tuple(
    fc.base64String({ minLength: 10, maxLength: 100 }),
    fc.base64String({ minLength: 10, maxLength: 200 }),
    fc.base64String({ minLength: 10, maxLength: 100 })
  ).map(([header, payload, signature]) => 
    `${header.replace(/=/g, '')}.${payload.replace(/=/g, '')}.${signature.replace(/=/g, '')}`
  );

  // Arbitrary for generating valid Bearer authorization headers
  const validBearerHeader = validJwtToken.map(token => `Bearer ${token}`);

  // Arbitrary for generating invalid authorization headers (not Bearer format)
  const invalidAuthHeaderFormat = fc.oneof(
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.startsWith('Bearer ')),
    fc.constant('Basic dXNlcjpwYXNz'),
    fc.constant('Digest username="test"'),
    fc.constant('bearer token'), // lowercase bearer
    fc.constant('BEARER token'), // uppercase BEARER
  );

  // Arbitrary for generating invalid JWT formats (not three parts)
  const invalidJwtFormat = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.split('.').length !== 3),
    fc.constant('invalid'),
    fc.constant('part1.part2'),
    fc.constant('part1.part2.part3.part4'),
    fc.constant(''),
  );

  /**
   * Property: Missing Authorization header should fail validation
   */
  it('should reject requests without Authorization header', () => {
    fc.assert(
      fc.property(
        fc.constant(undefined),
        (authHeader) => {
          // Given no Authorization header
          // When we validate the header
          const result = validateAuthorizationHeader(authHeader);

          // Then validation should fail
          expect(result.isValid).toBe(false);
          expect(result.error).toBe('Missing Authorization header');
          expect(result.token).toBeUndefined();
        }
      ),
      { numRuns: 10 }
    );
  });

  /**
   * Property: Non-Bearer authorization headers should fail validation
   */
  it('should reject non-Bearer authorization headers', () => {
    fc.assert(
      fc.property(invalidAuthHeaderFormat, (authHeader) => {
        // Given an Authorization header that doesn't start with 'Bearer '
        // When we validate the header
        const result = validateAuthorizationHeader(authHeader);

        // Then validation should fail
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('Invalid Authorization header format. Expected: Bearer <token>');
        expect(result.token).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty token after Bearer should fail validation
   */
  it('should reject Bearer headers with empty token', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('Bearer ', 'Bearer  ', 'Bearer   '),
        (authHeader) => {
          // Given a Bearer header with empty or whitespace-only token
          // When we validate the header
          const result = validateAuthorizationHeader(authHeader);

          // Then validation should fail
          expect(result.isValid).toBe(false);
          expect(result.error).toBe('Empty token in Authorization header');
        }
      ),
      { numRuns: 10 }
    );
  });


  /**
   * Property: Invalid JWT format should fail validation
   */
  it('should reject tokens with invalid JWT format', () => {
    fc.assert(
      fc.property(invalidJwtFormat, (invalidToken) => {
        // Given a Bearer header with an invalid JWT format
        const authHeader = `Bearer ${invalidToken}`;

        // When we validate the header
        const result = validateAuthorizationHeader(authHeader);

        // Then validation should fail (either empty token or invalid format)
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Valid Bearer token with proper JWT format should pass validation
   */
  it('should accept valid Bearer tokens with JWT format', () => {
    fc.assert(
      fc.property(validBearerHeader, (authHeader) => {
        // Given a valid Bearer authorization header with JWT format
        // When we validate the header
        const result = validateAuthorizationHeader(authHeader);

        // Then validation should pass
        expect(result.isValid).toBe(true);
        expect(result.token).toBeDefined();
        expect(result.error).toBeUndefined();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Extracted token should match the original token
   */
  it('should extract the correct token from Bearer header', () => {
    fc.assert(
      fc.property(validJwtToken, (token) => {
        // Given a valid JWT token
        const authHeader = `Bearer ${token}`;

        // When we validate the header
        const result = validateAuthorizationHeader(authHeader);

        // Then the extracted token should match the original
        expect(result.isValid).toBe(true);
        expect(result.token).toBe(token);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Validation is deterministic
   */
  it('should return consistent results for the same input', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined }),
        (authHeader) => {
          // Given any authorization header (or undefined)
          // When we validate it multiple times
          const result1 = validateAuthorizationHeader(authHeader);
          const result2 = validateAuthorizationHeader(authHeader);
          const result3 = validateAuthorizationHeader(authHeader);

          // Then all results should be identical
          expect(result1.isValid).toBe(result2.isValid);
          expect(result2.isValid).toBe(result3.isValid);
          expect(result1.error).toBe(result2.error);
          expect(result2.error).toBe(result3.error);
          expect(result1.token).toBe(result2.token);
          expect(result2.token).toBe(result3.token);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Tests for correlation ID extraction
 */
describe('Correlation ID Extraction', () => {
  // Arbitrary for generating valid correlation IDs
  const validCorrelationId = fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => s.trim().length > 0);

  /**
   * Property: Should extract correlation ID from x-correlation-id header
   */
  it('should extract correlation ID from lowercase header', () => {
    fc.assert(
      fc.property(validCorrelationId, (correlationId) => {
        // Given headers with x-correlation-id
        const headers = { 'x-correlation-id': correlationId };

        // When we extract the correlation ID
        const result = getCorrelationId(headers);

        // Then it should match the original
        expect(result).toBe(correlationId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Should extract correlation ID from X-Correlation-Id header
   */
  it('should extract correlation ID from mixed-case header', () => {
    fc.assert(
      fc.property(validCorrelationId, (correlationId) => {
        // Given headers with X-Correlation-Id
        const headers = { 'X-Correlation-Id': correlationId };

        // When we extract the correlation ID
        const result = getCorrelationId(headers);

        // Then it should match the original
        expect(result).toBe(correlationId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Should generate correlation ID when not provided
   */
  it('should generate correlation ID when header is missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          'content-type': fc.constant('application/json'),
          'accept': fc.constant('*/*'),
        }),
        (headers) => {
          // Given headers without correlation ID
          // When we extract the correlation ID
          const result = getCorrelationId(headers);

          // Then a new correlation ID should be generated
          expect(result).toBeDefined();
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Generated correlation IDs should be unique
   */
  it('should generate unique correlation IDs', () => {
    const generatedIds = new Set<string>();
    
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), () => {
        // Given empty headers
        const headers = {};

        // When we generate a correlation ID
        const result = getCorrelationId(headers);

        // Then it should be unique (with high probability)
        expect(generatedIds.has(result)).toBe(false);
        generatedIds.add(result);
      }),
      { numRuns: 100 }
    );
  });
});

