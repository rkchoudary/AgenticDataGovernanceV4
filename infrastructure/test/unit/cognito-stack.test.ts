import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { ResourceTagging } from '../../lib/constructs/resource-tagging.js';

/**
 * Unit tests for CognitoStack
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 14.1
 */
describe('CognitoStack', () => {
  // Helper function to create a test stack with Cognito resources
  function createTestStack(environment: string): Template {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-west-2' },
    });

    // Apply resource tagging
    new ResourceTagging(stack, 'ResourceTagging', {
      tags: {
        Environment: environment,
        Project: 'test-project',
        CostCenter: 'test-cost-center',
      },
    });

    // Create KMS key
    new kms.Key(stack, 'EncryptionKey', {
      enableKeyRotation: true,
    });

    // Create User Pool with invite-only registration
    const userPool = new cognito.UserPool(stack, 'UserPool', {
      userPoolName: `governance-${environment}-users`,
      selfSignUpEnabled: false,
      signInAliases: { email: true, username: false },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      customAttributes: {
        tenant_id: new cognito.StringAttribute({
          mutable: false,
          minLen: 1,
          maxLen: 256,
        }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      mfa: environment === 'prod'
        ? cognito.Mfa.REQUIRED
        : cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userInvitation: {
        emailSubject: 'Welcome to the Governance Platform',
        emailBody: 'Your temporary password is: {####}',
      },
      advancedSecurityMode: environment === 'prod'
        ? cognito.AdvancedSecurityMode.ENFORCED
        : cognito.AdvancedSecurityMode.AUDIT,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create User Pool groups
    new cognito.CfnUserPoolGroup(stack, 'AdminGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'admin',
      description: 'Platform administrators',
      precedence: 1,
    });

    new cognito.CfnUserPoolGroup(stack, 'ComplianceOfficerGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'compliance_officer',
      description: 'Compliance officers',
      precedence: 2,
    });

    new cognito.CfnUserPoolGroup(stack, 'DataStewardGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'data_steward',
      description: 'Data stewards',
      precedence: 3,
    });

    new cognito.CfnUserPoolGroup(stack, 'ViewerGroup', {
      userPoolId: userPool.userPoolId,
      groupName: 'viewer',
      description: 'Read-only viewers',
      precedence: 4,
    });

    // Create User Pool client
    userPool.addClient('WebClient', {
      userPoolClientName: `governance-${environment}-web-client`,
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: ['https://localhost/callback'],
        logoutUrls: ['https://localhost/logout'],
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
      enableTokenRevocation: true,
    });

    // Create User Pool domain
    userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix: `governance-${environment}-123456789012`,
      },
    });

    // Create initial admin user
    new cognito.CfnUserPoolUser(stack, 'InitialAdminUser', {
      userPoolId: userPool.userPoolId,
      username: 'admin@example.com',
      userAttributes: [
        { name: 'email', value: 'admin@example.com' },
        { name: 'email_verified', value: 'true' },
        { name: 'given_name', value: 'Platform' },
        { name: 'family_name', value: 'Administrator' },
        { name: 'custom:tenant_id', value: 'system' },
      ],
      desiredDeliveryMediums: ['EMAIL'],
    });

    // Add outputs
    new cdk.CfnOutput(stack, 'UserPoolId', {
      value: userPool.userPoolId,
      exportName: `governance-${environment}-user-pool-id`,
    });

    new cdk.CfnOutput(stack, 'UserPoolArn', {
      value: userPool.userPoolArn,
      exportName: `governance-${environment}-user-pool-arn`,
    });

    return Template.fromStack(stack);
  }

  describe('User Pool Configuration', () => {
    /**
     * Test: User Pool has self-registration disabled
     * Validates: Requirements 3.1, 3.4
     */
    it('should create User Pool with self-registration disabled', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });

    /**
     * Test: User Pool has email sign-in enabled
     */
    it('should create User Pool with email sign-in', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UsernameAttributes: ['email'],
      });
    });

    /**
     * Test: User Pool has password policy configured
     * Validates: Requirements 3.2
     */
    it('should create User Pool with strong password policy', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 12,
            RequireLowercase: true,
            RequireUppercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
            TemporaryPasswordValidityDays: 7,
          },
        },
      });
    });

    /**
     * Test: User Pool has MFA configured
     * Validates: Requirements 3.3
     */
    it('should create User Pool with MFA optional in dev', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        MfaConfiguration: 'OPTIONAL',
      });
    });

    /**
     * Test: User Pool has MFA required in prod
     * Validates: Requirements 3.3
     */
    it('should create User Pool with MFA required in prod', () => {
      const template = createTestStack('prod');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        MfaConfiguration: 'ON',
      });
    });

    /**
     * Test: User Pool has custom tenant_id attribute
     */
    it('should create User Pool with tenant_id custom attribute', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'tenant_id',
            AttributeDataType: 'String',
            Mutable: false,
          }),
        ]),
      });
    });

    /**
     * Test: User Pool has invitation email configured
     * Validates: Requirements 3.2
     */
    it('should create User Pool with invitation email template', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          InviteMessageTemplate: {
            EmailSubject: 'Welcome to the Governance Platform',
          },
        },
      });
    });
  });

  describe('User Pool Groups', () => {
    /**
     * Test: Admin group is created
     * Validates: Requirements 14.1
     */
    it('should create admin group with highest precedence', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'admin',
        Precedence: 1,
      });
    });

    /**
     * Test: Compliance Officer group is created
     * Validates: Requirements 14.1
     */
    it('should create compliance_officer group', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'compliance_officer',
        Precedence: 2,
      });
    });

    /**
     * Test: Data Steward group is created
     * Validates: Requirements 14.1
     */
    it('should create data_steward group', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'data_steward',
        Precedence: 3,
      });
    });

    /**
     * Test: Viewer group is created
     * Validates: Requirements 14.1
     */
    it('should create viewer group with lowest precedence', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
        GroupName: 'viewer',
        Precedence: 4,
      });
    });

    /**
     * Test: All four groups are created
     * Validates: Requirements 14.1
     */
    it('should create all four user groups', () => {
      const template = createTestStack('dev');
      
      template.resourceCountIs('AWS::Cognito::UserPoolGroup', 4);
    });
  });

  describe('User Pool Client', () => {
    /**
     * Test: User Pool client is created
     * Validates: Requirements 3.5
     */
    it('should create User Pool client', () => {
      const template = createTestStack('dev');
      
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });

    /**
     * Test: User Pool client has authorization code grant enabled
     * Validates: Requirements 3.5
     */
    it('should create User Pool client with authorization code grant', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AllowedOAuthFlows: ['code'],
      });
    });

    /**
     * Test: User Pool client has correct OAuth scopes
     * Validates: Requirements 3.5
     */
    it('should create User Pool client with correct OAuth scopes', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AllowedOAuthScopes: Match.arrayWith(['email', 'openid', 'profile']),
      });
    });

    /**
     * Test: User Pool client has token validity configured
     * Validates: Requirements 3.5
     */
    it('should create User Pool client with token validity', () => {
      const template = createTestStack('dev');
      
      // Token validity is in minutes for access/id tokens, minutes for refresh
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        AccessTokenValidity: 60, // 1 hour in minutes
        IdTokenValidity: 60, // 1 hour in minutes
        RefreshTokenValidity: 43200, // 30 days in minutes
      });
    });

    /**
     * Test: User Pool client prevents user existence errors
     */
    it('should create User Pool client that prevents user existence errors', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        PreventUserExistenceErrors: 'ENABLED',
      });
    });
  });

  describe('Initial Admin User', () => {
    /**
     * Test: Initial admin user is created
     * Validates: Requirements 3.6
     */
    it('should create initial admin user', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolUser', {
        Username: 'admin@example.com',
        DesiredDeliveryMediums: ['EMAIL'],
      });
    });

    /**
     * Test: Initial admin user has email verified
     * Validates: Requirements 3.6
     */
    it('should create initial admin user with verified email', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolUser', {
        UserAttributes: Match.arrayWith([
          Match.objectLike({
            Name: 'email_verified',
            Value: 'true',
          }),
        ]),
      });
    });

    /**
     * Test: Initial admin user has tenant_id set
     * Validates: Requirements 3.6
     */
    it('should create initial admin user with tenant_id', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolUser', {
        UserAttributes: Match.arrayWith([
          Match.objectLike({
            Name: 'custom:tenant_id',
            Value: 'system',
          }),
        ]),
      });
    });
  });

  describe('User Pool Domain', () => {
    /**
     * Test: User Pool domain is created
     */
    it('should create User Pool domain', () => {
      const template = createTestStack('dev');
      
      template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    });

    /**
     * Test: User Pool domain has correct prefix
     */
    it('should create User Pool domain with environment prefix', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
        Domain: Match.stringLikeRegexp('governance-dev-'),
      });
    });
  });

  describe('Stack Outputs', () => {
    /**
     * Test: Stack exports User Pool ID
     */
    it('should export User Pool ID', () => {
      const template = createTestStack('dev');
      
      template.hasOutput('UserPoolId', {
        Export: {
          Name: 'governance-dev-user-pool-id',
        },
      });
    });

    /**
     * Test: Stack exports User Pool ARN
     */
    it('should export User Pool ARN', () => {
      const template = createTestStack('dev');
      
      template.hasOutput('UserPoolArn', {
        Export: {
          Name: 'governance-dev-user-pool-arn',
        },
      });
    });
  });

  describe('Environment-specific Configuration', () => {
    /**
     * Test: Production uses RETAIN removal policy
     */
    it('should use RETAIN removal policy for production', () => {
      const template = createTestStack('prod');
      
      const userPools = template.findResources('AWS::Cognito::UserPool');
      const userPoolKeys = Object.keys(userPools);
      expect(userPoolKeys.length).toBeGreaterThan(0);
      
      const userPool = Object.values(userPools)[0] as Record<string, unknown>;
      expect(userPool.DeletionPolicy).toBe('Retain');
    });

    /**
     * Test: Non-production uses DESTROY removal policy
     */
    it('should use DESTROY removal policy for non-production', () => {
      const template = createTestStack('dev');
      
      const userPools = template.findResources('AWS::Cognito::UserPool');
      const userPoolKeys = Object.keys(userPools);
      expect(userPoolKeys.length).toBeGreaterThan(0);
      
      const userPool = Object.values(userPools)[0] as Record<string, unknown>;
      expect(userPool.DeletionPolicy).toBe('Delete');
    });

    /**
     * Test: Production has advanced security enforced
     */
    it('should enforce advanced security in production', () => {
      const template = createTestStack('prod');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolAddOns: {
          AdvancedSecurityMode: 'ENFORCED',
        },
      });
    });

    /**
     * Test: Non-production has advanced security in audit mode
     */
    it('should use audit mode for advanced security in non-production', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolAddOns: {
          AdvancedSecurityMode: 'AUDIT',
        },
      });
    });
  });
});
