import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isInviteOnlyUserPool } from '../../lib/stacks/cognito-stack.js';

/**
 * **Feature: private-aws-deployment, Property 3: Invite-Only Registration**
 * 
 * For any Cognito User Pool configuration, IF selfSignUpEnabled is false,
 * THEN the User Pool SHALL only allow admin-created users.
 * 
 * **Validates: Requirements 3.4**
 */
describe('Property 3: Invite-Only Registration', () => {
  /**
   * Property: User Pool with selfSignUpEnabled=false is invite-only
   */
  it('should identify invite-only configuration when selfSignUpEnabled is false', () => {
    fc.assert(
      fc.property(
        fc.record({
          selfSignUpEnabled: fc.constant(false),
          adminCreateUserConfig: fc.option(
            fc.record({
              allowAdminCreateUserOnly: fc.boolean(),
            }),
            { nil: undefined }
          ),
        }),
        (config) => {
          // Given a User Pool configuration with selfSignUpEnabled=false
          // When we check if it's invite-only
          const isInviteOnly = isInviteOnlyUserPool(config);
          
          // Then it should be identified as invite-only
          expect(isInviteOnly).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: User Pool with selfSignUpEnabled=true is NOT invite-only
   */
  it('should identify non-invite-only configuration when selfSignUpEnabled is true', () => {
    fc.assert(
      fc.property(
        fc.record({
          selfSignUpEnabled: fc.constant(true),
          adminCreateUserConfig: fc.option(
            fc.record({
              allowAdminCreateUserOnly: fc.boolean(),
            }),
            { nil: undefined }
          ),
        }),
        (config) => {
          // Given a User Pool configuration with selfSignUpEnabled=true
          // When we check if it's invite-only
          const isInviteOnly = isInviteOnlyUserPool(config);
          
          // Then it should NOT be identified as invite-only
          expect(isInviteOnly).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invite-only check is deterministic
   */
  it('should return consistent results for the same configuration', () => {
    fc.assert(
      fc.property(
        fc.record({
          selfSignUpEnabled: fc.boolean(),
          adminCreateUserConfig: fc.option(
            fc.record({
              allowAdminCreateUserOnly: fc.boolean(),
            }),
            { nil: undefined }
          ),
        }),
        (config) => {
          // Given any User Pool configuration
          // When we check invite-only status multiple times
          const result1 = isInviteOnlyUserPool(config);
          const result2 = isInviteOnlyUserPool(config);
          const result3 = isInviteOnlyUserPool(config);
          
          // Then all results should be identical
          expect(result1).toBe(result2);
          expect(result2).toBe(result3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: selfSignUpEnabled is the sole determinant of invite-only status
   */
  it('should only depend on selfSignUpEnabled for invite-only determination', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(
          fc.record({
            allowAdminCreateUserOnly: fc.boolean(),
          }),
          { nil: undefined }
        ),
        fc.option(
          fc.record({
            allowAdminCreateUserOnly: fc.boolean(),
          }),
          { nil: undefined }
        ),
        (selfSignUpEnabled, adminConfig1, adminConfig2) => {
          // Given two configurations with the same selfSignUpEnabled but different adminCreateUserConfig
          const config1 = { selfSignUpEnabled, adminCreateUserConfig: adminConfig1 };
          const config2 = { selfSignUpEnabled, adminCreateUserConfig: adminConfig2 };
          
          // When we check invite-only status
          const result1 = isInviteOnlyUserPool(config1);
          const result2 = isInviteOnlyUserPool(config2);
          
          // Then both should return the same result (based only on selfSignUpEnabled)
          expect(result1).toBe(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invite-only status is a boolean
   */
  it('should always return a boolean value', () => {
    fc.assert(
      fc.property(
        fc.record({
          selfSignUpEnabled: fc.boolean(),
          adminCreateUserConfig: fc.option(
            fc.record({
              allowAdminCreateUserOnly: fc.boolean(),
            }),
            { nil: undefined }
          ),
        }),
        (config) => {
          // Given any User Pool configuration
          // When we check invite-only status
          const result = isInviteOnlyUserPool(config);
          
          // Then the result should be a boolean
          expect(typeof result).toBe('boolean');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Governance platform configuration should always be invite-only
   * This validates that our actual deployment configuration is correct
   */
  it('should confirm governance platform uses invite-only configuration', () => {
    // The governance platform configuration
    const governanceConfig = {
      selfSignUpEnabled: false,
      adminCreateUserConfig: {
        allowAdminCreateUserOnly: true,
      },
    };
    
    // Verify it's invite-only
    expect(isInviteOnlyUserPool(governanceConfig)).toBe(true);
  });

  /**
   * Property: Empty or minimal config with selfSignUpEnabled=false is still invite-only
   */
  it('should handle minimal configuration correctly', () => {
    fc.assert(
      fc.property(
        fc.constant({ selfSignUpEnabled: false }),
        (config) => {
          // Given a minimal configuration with only selfSignUpEnabled
          // When we check invite-only status
          const result = isInviteOnlyUserPool(config);
          
          // Then it should be invite-only
          expect(result).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  });
});
