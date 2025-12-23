import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isSecretKmsEncrypted,
  validateSecretConfig,
  isCloudTrailEnabledForSecrets,
} from '../../lib/stacks/secrets-stack.js';
import {
  validateLambdaSecretsConfig,
  isValidSecretArn,
  hasSecretsAccess,
  extractSecretArnsFromEnv,
} from '../../lib/stacks/lambda-stack.js';

/**
 * **Feature: private-aws-deployment, Property 10: KMS Encryption Enforcement**
 * 
 * For any sensitive data stored in DynamoDB or S3, the data SHALL be encrypted
 * using AWS KMS customer-managed keys.
 * 
 * **Validates: Requirements 13.5**
 */
describe('Property 10: KMS Encryption Enforcement', () => {
  // Arbitrary for generating valid AWS account IDs (12 digits)
  const validAccountId = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
    minLength: 12,
    maxLength: 12,
  });

  // Arbitrary for generating valid AWS regions
  const validRegion = fc.constantFrom(
    'us-east-1',
    'us-east-2',
    'us-west-1',
    'us-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-northeast-1',
    'ap-southeast-1'
  );

  // Arbitrary for generating valid KMS key IDs (UUID format)
  const validKeyId = fc.uuid();

  // Arbitrary for generating valid KMS key ARNs
  const validKmsKeyArn = fc.tuple(validRegion, validAccountId, validKeyId).map(
    ([region, account, keyId]) => `arn:aws:kms:${region}:${account}:key/${keyId}`
  );

  // Arbitrary for generating valid secret names
  const validSecretName = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/'),
    { minLength: 1, maxLength: 50 }
  ).filter(s => s.trim().length > 0 && !s.startsWith('/') && !s.endsWith('/'));

  // Arbitrary for generating valid Secrets Manager ARNs
  const validSecretArn = fc.tuple(validRegion, validAccountId, validSecretName).map(
    ([region, account, name]) => `arn:aws:secretsmanager:${region}:${account}:secret:${name}-${Math.random().toString(36).substring(2, 8)}`
  );

  /**
   * Property: Valid KMS key ARNs should be recognized as valid
   */
  it('should validate correct KMS key ARN format', () => {
    fc.assert(
      fc.property(validKmsKeyArn, (keyArn) => {
        // Given a valid KMS key ARN
        const config = {
          secretName: 'test-secret',
          encryptionKeyArn: keyArn,
        };

        // When we validate the config
        const isValid = validateSecretConfig(config);

        // Then validation should pass
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid KMS key ARNs should fail validation
   */
  it('should reject invalid KMS key ARN format', () => {
    const invalidKmsArns = fc.oneof(
      // Missing arn: prefix
      fc.constant('aws:kms:us-east-1:123456789012:key/test-key'),
      // Wrong service
      fc.constant('arn:aws:s3:us-east-1:123456789012:key/test-key'),
      // Invalid region format
      fc.constant('arn:aws:kms:invalid:123456789012:key/test-key'),
      // Invalid account ID (not 12 digits)
      fc.constant('arn:aws:kms:us-east-1:12345:key/test-key'),
      // Empty string
      fc.constant(''),
      // Random string
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.startsWith('arn:aws:kms:'))
    );

    fc.assert(
      fc.property(invalidKmsArns, (invalidArn) => {
        // Given an invalid KMS key ARN
        const config = {
          secretName: 'test-secret',
          encryptionKeyArn: invalidArn,
        };

        // When we validate the config
        const isValid = validateSecretConfig(config);

        // Then validation should fail
        expect(isValid).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Secret configuration without encryption key should still be valid
   * (AWS will use default encryption)
   */
  it('should accept secret config without explicit encryption key', () => {
    fc.assert(
      fc.property(validSecretName, (secretName) => {
        // Given a secret config without encryption key
        const config = {
          secretName,
        };

        // When we validate the config
        const isValid = validateSecretConfig(config);

        // Then validation should pass (AWS uses default encryption)
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty secret names should fail validation
   */
  it('should reject empty secret names', () => {
    const emptyNames = fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      fc.constant('\t'),
      fc.constant('\n')
    );

    fc.assert(
      fc.property(emptyNames, (emptyName) => {
        // Given an empty secret name
        const config = {
          secretName: emptyName,
        };

        // When we validate the config
        const isValid = validateSecretConfig(config);

        // Then validation should fail
        expect(isValid).toBe(false);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: Valid Secrets Manager ARNs should be recognized
   */
  it('should validate correct Secrets Manager ARN format', () => {
    fc.assert(
      fc.property(validSecretArn, (secretArn) => {
        // Given a valid Secrets Manager ARN
        // When we validate the ARN
        const isValid = isValidSecretArn(secretArn);

        // Then validation should pass
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Invalid Secrets Manager ARNs should fail validation
   */
  it('should reject invalid Secrets Manager ARN format', () => {
    const invalidSecretArns = fc.oneof(
      // Missing arn: prefix
      fc.constant('aws:secretsmanager:us-east-1:123456789012:secret:test'),
      // Wrong service
      fc.constant('arn:aws:kms:us-east-1:123456789012:secret:test'),
      // Invalid region
      fc.constant('arn:aws:secretsmanager:invalid:123456789012:secret:test'),
      // Invalid account ID
      fc.constant('arn:aws:secretsmanager:us-east-1:12345:secret:test'),
      // Empty string
      fc.constant(''),
      // Random string
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.startsWith('arn:aws:secretsmanager:'))
    );

    fc.assert(
      fc.property(invalidSecretArns, (invalidArn) => {
        // Given an invalid Secrets Manager ARN
        // When we validate the ARN
        const isValid = isValidSecretArn(invalidArn);

        // Then validation should fail
        expect(isValid).toBe(false);
      }),
      { numRuns: 100 }
    );
  });


  /**
   * Property: Lambda environment variables should reference secret ARNs, not plaintext
   */
  it('should validate Lambda secrets config references ARNs not plaintext', () => {
    fc.assert(
      fc.property(validSecretArn, (secretArn) => {
        // Given a Lambda config with secret ARN in environment
        const config = {
          environment: {
            COGNITO_CLIENT_SECRET_ARN: secretArn,
            TABLE_NAME: 'my-table',
          },
          secretArns: [secretArn],
        };

        // When we validate the config
        const isValid = validateLambdaSecretsConfig(config);

        // Then validation should pass
        expect(isValid).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Lambda environment with invalid secret ARNs should fail validation
   */
  it('should reject Lambda config with invalid secret ARNs', () => {
    const invalidArns = fc.oneof(
      fc.constant('not-an-arn'),
      fc.constant('arn:aws:s3:::bucket'),
      fc.constant('')
    );

    fc.assert(
      fc.property(invalidArns, (invalidArn) => {
        // Given a Lambda config with invalid secret ARN
        const config = {
          environment: {
            TABLE_NAME: 'my-table',
          },
          secretArns: [invalidArn],
        };

        // When we validate the config
        const isValid = validateLambdaSecretsConfig(config);

        // Then validation should fail
        expect(isValid).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Property: hasSecretsAccess should correctly identify when Lambda has access
   */
  it('should correctly identify Lambda secrets access', () => {
    fc.assert(
      fc.property(validSecretArn, (secretArn) => {
        // Given a Lambda environment with a secret ARN
        const lambdaEnv = {
          COGNITO_CLIENT_SECRET_ARN: secretArn,
          TABLE_NAME: 'my-table',
        };

        // When we check for secrets access
        const hasAccess = hasSecretsAccess(lambdaEnv, secretArn);

        // Then it should return true
        expect(hasAccess).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: hasSecretsAccess should return false when secret is not referenced
   */
  it('should return false when secret is not in Lambda environment', () => {
    fc.assert(
      fc.property(validSecretArn, validSecretArn, (secretArn1, secretArn2) => {
        // Skip if ARNs are the same
        fc.pre(secretArn1 !== secretArn2);

        // Given a Lambda environment with one secret ARN
        const lambdaEnv = {
          COGNITO_CLIENT_SECRET_ARN: secretArn1,
          TABLE_NAME: 'my-table',
        };

        // When we check for a different secret
        const hasAccess = hasSecretsAccess(lambdaEnv, secretArn2);

        // Then it should return false
        expect(hasAccess).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: extractSecretArnsFromEnv should extract all secret ARNs
   */
  it('should extract all secret ARNs from Lambda environment', () => {
    fc.assert(
      fc.property(
        fc.array(validSecretArn, { minLength: 1, maxLength: 5 }),
        (secretArns) => {
          // Given a Lambda environment with multiple secret ARNs
          const lambdaEnv: Record<string, string> = {
            TABLE_NAME: 'my-table',
          };
          
          secretArns.forEach((arn, index) => {
            lambdaEnv[`SECRET_${index}_SECRET_ARN`] = arn;
          });

          // When we extract secret ARNs
          const extracted = extractSecretArnsFromEnv(lambdaEnv);

          // Then all secret ARNs should be extracted
          expect(extracted.length).toBe(secretArns.length);
          secretArns.forEach(arn => {
            expect(extracted).toContain(arn);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: CloudTrail config should be valid when logging is enabled
   */
  it('should validate CloudTrail is enabled for Secrets Manager', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isLogging, includeManagement) => {
        // Given a CloudTrail config
        const trailConfig = {
          isLogging,
          includeManagementEvents: includeManagement,
        };

        // When we check if CloudTrail is enabled
        const isEnabled = isCloudTrailEnabledForSecrets(trailConfig);

        // Then it should be enabled only when both flags are true
        expect(isEnabled).toBe(isLogging && includeManagement);
      }),
      { numRuns: 20 }
    );
  });

  /**
   * Property: KMS encryption check should work with mock secret objects
   */
  it('should validate KMS encryption on secrets', () => {
    fc.assert(
      fc.property(validKmsKeyArn, (keyArn) => {
        // Given a mock secret with encryption key
        const mockSecret = {
          encryptionKey: {
            keyArn,
          },
        } as { encryptionKey?: { keyArn: string } };

        // When we check if it's KMS encrypted
        const isEncrypted = isSecretKmsEncrypted(
          mockSecret as any,
          keyArn
        );

        // Then it should return true
        expect(isEncrypted).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: KMS encryption check should fail when key ARN doesn't match
   */
  it('should fail KMS encryption check when key ARN does not match', () => {
    fc.assert(
      fc.property(validKmsKeyArn, validKmsKeyArn, (keyArn1, keyArn2) => {
        // Skip if ARNs are the same
        fc.pre(keyArn1 !== keyArn2);

        // Given a mock secret with one encryption key
        const mockSecret = {
          encryptionKey: {
            keyArn: keyArn1,
          },
        } as { encryptionKey?: { keyArn: string } };

        // When we check against a different key ARN
        const isEncrypted = isSecretKmsEncrypted(
          mockSecret as any,
          keyArn2
        );

        // Then it should return false
        expect(isEncrypted).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Secrets without encryption key should fail KMS check
   */
  it('should fail KMS encryption check when no encryption key is set', () => {
    // Given a mock secret without encryption key
    const mockSecret = {
      encryptionKey: undefined,
    } as { encryptionKey?: { keyArn: string } };

    // When we check if it's KMS encrypted
    const isEncrypted = isSecretKmsEncrypted(mockSecret as any);

    // Then it should return false
    expect(isEncrypted).toBe(false);
  });
});

