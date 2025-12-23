import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  hasRequiredJwtClaims,
  extractTenantId,
  extractRoles,
  UserRole,
} from '../../lib/stacks/cognito-stack.js';

/**
 * **Feature: private-aws-deployment, Property 4: JWT Claims Completeness**
 * 
 * For any successfully authenticated user, the issued JWT token SHALL contain 
 * tenant_id and roles claims.
 * 
 * **Validates: Requirements 3.5, 14.3**
 */
describe('Property 4: JWT Claims Completeness', () => {
  // Valid roles for the governance platform
  const validRoles: UserRole[] = ['admin', 'compliance_officer', 'data_steward', 'viewer'];

  // Arbitrary for generating valid tenant IDs
  const validTenantId = fc.string({ minLength: 1, maxLength: 256 })
    .filter(s => s.trim().length > 0);

  // Arbitrary for generating valid email addresses
  const validEmail = fc.emailAddress();

  // Arbitrary for generating valid user IDs (sub claim)
  const validSub = fc.uuid();

  // Arbitrary for generating valid role arrays
  const validRolesArray = fc.array(fc.constantFrom(...validRoles), { minLength: 1, maxLength: 4 })
    .map(roles => [...new Set(roles)]); // Remove duplicates

  // Arbitrary for generating complete valid JWT claims
  const validJwtClaims = fc.record({
    sub: validSub,
    email: validEmail,
    'cognito:groups': validRolesArray,
    'custom:tenant_id': validTenantId,
    iss: fc.constant('https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example'),
    aud: fc.constant('client-id'),
    exp: fc.integer({ min: Math.floor(Date.now() / 1000), max: Math.floor(Date.now() / 1000) + 3600 }),
    iat: fc.integer({ min: Math.floor(Date.now() / 1000) - 3600, max: Math.floor(Date.now() / 1000) }),
  });

  /**
   * Property: Valid JWT claims should pass the required claims check
   */
  it('should validate JWT claims with all required fields', () => {
    fc.assert(
      fc.property(validJwtClaims, (claims) => {
        // Given valid JWT claims with all required fields
        // When we check for required claims
        const hasRequired = hasRequiredJwtClaims(claims);
        
        // Then validation should pass
        expect(hasRequired).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing 'sub' claim should fail validation
   */
  it('should reject JWT claims missing sub', () => {
    fc.assert(
      fc.property(validJwtClaims, (claims) => {
        // Given valid JWT claims
        // When we remove the sub claim
        const { sub, ...claimsWithoutSub } = claims;
        
        // Then validation should fail
        const hasRequired = hasRequiredJwtClaims(claimsWithoutSub);
        expect(hasRequired).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing 'email' claim should fail validation
   */
  it('should reject JWT claims missing email', () => {
    fc.assert(
      fc.property(validJwtClaims, (claims) => {
        // Given valid JWT claims
        // When we remove the email claim
        const { email, ...claimsWithoutEmail } = claims;
        
        // Then validation should fail
        const hasRequired = hasRequiredJwtClaims(claimsWithoutEmail);
        expect(hasRequired).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Missing 'cognito:groups' claim should fail validation
   */
  it('should reject JWT claims missing cognito:groups', () => {
    fc.assert(
      fc.property(validJwtClaims, (claims) => {
        // Given valid JWT claims
        // When we remove the cognito:groups claim
        const { 'cognito:groups': _, ...claimsWithoutGroups } = claims;
        
        // Then validation should fail
        const hasRequired = hasRequiredJwtClaims(claimsWithoutGroups);
        expect(hasRequired).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractTenantId should return the tenant_id from valid claims
   */
  it('should extract tenant_id from valid claims', () => {
    fc.assert(
      fc.property(validTenantId, (tenantId) => {
        // Given claims with a valid tenant_id
        const claims = { 'custom:tenant_id': tenantId };
        
        // When we extract the tenant_id
        const extracted = extractTenantId(claims);
        
        // Then it should match the original
        expect(extracted).toBe(tenantId);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractTenantId should return null for missing tenant_id
   */
  it('should return null when tenant_id is missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          sub: validSub,
          email: validEmail,
        }),
        (claims) => {
          // Given claims without tenant_id
          // When we extract the tenant_id
          const extracted = extractTenantId(claims);
          
          // Then it should be null
          expect(extracted).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractTenantId should return null for empty tenant_id
   */
  it('should return null when tenant_id is empty', () => {
    const claims = { 'custom:tenant_id': '' };
    const extracted = extractTenantId(claims);
    expect(extracted).toBeNull();
  });

  /**
   * Property: extractRoles should return valid roles from cognito:groups
   */
  it('should extract valid roles from cognito:groups', () => {
    fc.assert(
      fc.property(validRolesArray, (roles) => {
        // Given claims with valid roles
        const claims = { 'cognito:groups': roles };
        
        // When we extract the roles
        const extracted = extractRoles(claims);
        
        // Then all extracted roles should be valid
        extracted.forEach(role => {
          expect(validRoles).toContain(role);
        });
        
        // And all original roles should be extracted
        roles.forEach(role => {
          expect(extracted).toContain(role);
        });
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractRoles should filter out invalid roles
   */
  it('should filter out invalid roles from cognito:groups', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
        (mixedRoles) => {
          // Given claims with a mix of valid and invalid roles
          const claims = { 'cognito:groups': mixedRoles };
          
          // When we extract the roles
          const extracted = extractRoles(claims);
          
          // Then only valid roles should be returned
          extracted.forEach(role => {
            expect(validRoles).toContain(role);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractRoles should return empty array for missing cognito:groups
   */
  it('should return empty array when cognito:groups is missing', () => {
    fc.assert(
      fc.property(
        fc.record({
          sub: validSub,
          email: validEmail,
        }),
        (claims) => {
          // Given claims without cognito:groups
          // When we extract the roles
          const extracted = extractRoles(claims);
          
          // Then it should be an empty array
          expect(extracted).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractRoles should return empty array for non-array cognito:groups
   */
  it('should return empty array when cognito:groups is not an array', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
        (invalidGroups) => {
          // Given claims with non-array cognito:groups
          const claims = { 'cognito:groups': invalidGroups };
          
          // When we extract the roles
          const extracted = extractRoles(claims);
          
          // Then it should be an empty array
          expect(extracted).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Role extraction is idempotent
   */
  it('should return consistent results for the same claims', () => {
    fc.assert(
      fc.property(validJwtClaims, (claims) => {
        // Given valid JWT claims
        // When we extract roles multiple times
        const result1 = extractRoles(claims);
        const result2 = extractRoles(claims);
        const result3 = extractRoles(claims);
        
        // Then all results should be identical
        expect(result1).toEqual(result2);
        expect(result2).toEqual(result3);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Tenant ID extraction is idempotent
   */
  it('should return consistent tenant_id for the same claims', () => {
    fc.assert(
      fc.property(validJwtClaims, (claims) => {
        // Given valid JWT claims
        // When we extract tenant_id multiple times
        const result1 = extractTenantId(claims);
        const result2 = extractTenantId(claims);
        const result3 = extractTenantId(claims);
        
        // Then all results should be identical
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
      }),
      { numRuns: 100 }
    );
  });
});
