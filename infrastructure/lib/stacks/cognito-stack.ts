import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the CognitoStack
 */
export interface CognitoStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * CloudFront distribution domain for callback URLs
   */
  cloudFrontDomain?: string;

  /**
   * Custom domain name (optional)
   */
  domainName?: string;

  /**
   * Initial admin user email
   */
  adminEmail: string;
}

/**
 * Cognito Stack for the Governance Platform
 *
 * Creates:
 * - Cognito User Pool with invite-only registration (Requirements 3.1, 3.2, 3.3, 3.4)
 * - Cognito User Pool groups for RBAC (Requirements 14.1)
 * - Cognito User Pool client (Requirements 3.5)
 * - Initial admin user (Requirements 3.6)
 */
export class CognitoStack extends cdk.Stack {
  /**
   * Cognito User Pool
   */
  public readonly userPool: cognito.UserPool;

  /**
   * Cognito User Pool client
   */
  public readonly userPoolClient: cognito.UserPoolClient;

  /**
   * User Pool domain
   */
  public readonly userPoolDomain: cognito.UserPoolDomain;

  /**
   * Admin group
   */
  public readonly adminGroup: cognito.CfnUserPoolGroup;

  /**
   * Compliance Officer group
   */
  public readonly complianceOfficerGroup: cognito.CfnUserPoolGroup;

  /**
   * Data Steward group
   */
  public readonly dataStewardGroup: cognito.CfnUserPoolGroup;

  /**
   * Viewer group
   */
  public readonly viewerGroup: cognito.CfnUserPoolGroup;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create Cognito User Pool
    // Validates: Requirements 3.1, 3.2, 3.3, 3.4
    this.userPool = this.createUserPool(props);

    // Create User Pool groups for RBAC
    // Validates: Requirements 14.1
    const groups = this.createUserPoolGroups(props);
    this.adminGroup = groups.adminGroup;
    this.complianceOfficerGroup = groups.complianceOfficerGroup;
    this.dataStewardGroup = groups.dataStewardGroup;
    this.viewerGroup = groups.viewerGroup;

    // Create User Pool client
    // Validates: Requirements 3.5
    this.userPoolClient = this.createUserPoolClient(props);

    // Create User Pool domain
    this.userPoolDomain = this.createUserPoolDomain(props);

    // Create initial admin user
    // Validates: Requirements 3.6
    this.createInitialAdminUser(props);

    // Stack outputs
    this.createOutputs(props);
  }


  /**
   * Creates the Cognito User Pool with invite-only registration
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4
   */
  private createUserPool(props: CognitoStackProps): cognito.UserPool {
    return new cognito.UserPool(this, 'UserPool', {
      userPoolName: `governance-${props.environment}-users`,
      
      // Disable self-registration - invite only
      // Validates: Requirements 3.1, 3.4
      selfSignUpEnabled: false,
      
      // Sign-in configuration
      signInAliases: {
        email: true,
        username: false,
      },
      
      // Auto-verify email
      autoVerify: {
        email: true,
      },
      
      // Standard attributes
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      
      // Custom attributes for tenant isolation
      customAttributes: {
        tenant_id: new cognito.StringAttribute({
          mutable: false,
          minLen: 1,
          maxLen: 256,
        }),
      },
      
      // Password policy
      // Validates: Requirements 3.2
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      
      // MFA configuration
      // Validates: Requirements 3.3
      mfa: props.environment === 'prod'
        ? cognito.Mfa.REQUIRED
        : cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      
      // Account recovery
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      
      // Email configuration for invitations
      // Validates: Requirements 3.2
      userInvitation: {
        emailSubject: 'Welcome to the Governance Platform',
        emailBody: `Hello {username},

You have been invited to join the Governance Platform.

Your temporary password is: {####}

Please sign in at the platform URL and change your password on first login.

This invitation will expire in 7 days.

Best regards,
The Governance Platform Team`,
        smsMessage: 'Your Governance Platform temporary password is {####}',
      },
      
      // Verification messages
      userVerification: {
        emailSubject: 'Verify your Governance Platform account',
        emailBody: 'Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      
      // Advanced security
      advancedSecurityMode: props.environment === 'prod'
        ? cognito.AdvancedSecurityMode.ENFORCED
        : cognito.AdvancedSecurityMode.AUDIT,
      
      // Device tracking
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true,
      },
      
      // Removal policy
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });
  }

  /**
   * Creates User Pool groups for RBAC
   * Validates: Requirements 14.1
   */
  private createUserPoolGroups(_props: CognitoStackProps): {
    adminGroup: cognito.CfnUserPoolGroup;
    complianceOfficerGroup: cognito.CfnUserPoolGroup;
    dataStewardGroup: cognito.CfnUserPoolGroup;
    viewerGroup: cognito.CfnUserPoolGroup;
  } {
    // Admin group - highest precedence
    const adminGroup = new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Platform administrators with full access',
      precedence: 1,
    });

    // Compliance Officer group
    const complianceOfficerGroup = new cognito.CfnUserPoolGroup(
      this,
      'ComplianceOfficerGroup',
      {
        userPoolId: this.userPool.userPoolId,
        groupName: 'compliance_officer',
        description: 'Compliance officers with regulatory oversight access',
        precedence: 2,
      }
    );

    // Data Steward group
    const dataStewardGroup = new cognito.CfnUserPoolGroup(
      this,
      'DataStewardGroup',
      {
        userPoolId: this.userPool.userPoolId,
        groupName: 'data_steward',
        description: 'Data stewards with data management access',
        precedence: 3,
      }
    );

    // Viewer group - lowest precedence
    const viewerGroup = new cognito.CfnUserPoolGroup(this, 'ViewerGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'viewer',
      description: 'Read-only access to platform data',
      precedence: 4,
    });

    return {
      adminGroup,
      complianceOfficerGroup,
      dataStewardGroup,
      viewerGroup,
    };
  }


  /**
   * Creates the User Pool client
   * Validates: Requirements 3.5
   */
  private createUserPoolClient(props: CognitoStackProps): cognito.UserPoolClient {
    // Determine callback URLs
    const callbackUrls: string[] = [];
    const logoutUrls: string[] = [];

    if (props.cloudFrontDomain) {
      callbackUrls.push(`https://${props.cloudFrontDomain}/callback`);
      logoutUrls.push(`https://${props.cloudFrontDomain}/logout`);
    }

    if (props.domainName) {
      callbackUrls.push(`https://${props.domainName}/callback`);
      logoutUrls.push(`https://${props.domainName}/logout`);
    }

    // Add localhost for development
    if (props.environment === 'dev') {
      callbackUrls.push('http://localhost:3000/callback');
      logoutUrls.push('http://localhost:3000/logout');
    }

    // Default callback if none specified
    if (callbackUrls.length === 0) {
      callbackUrls.push('https://localhost/callback');
      logoutUrls.push('https://localhost/logout');
    }

    return this.userPool.addClient('WebClient', {
      userPoolClientName: `governance-${props.environment}-web-client`,
      
      // OAuth configuration
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls,
        logoutUrls,
      },
      
      // Token validity
      // Validates: Requirements 3.5
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      
      // Prevent user existence errors
      preventUserExistenceErrors: true,
      
      // Auth flows
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      
      // Read/write attributes
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true,
        })
        .withCustomAttributes('tenant_id'),
      
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
        }),
      
      // Generate client secret for server-side apps
      generateSecret: false,
      
      // Enable token revocation
      enableTokenRevocation: true,
    });
  }

  /**
   * Creates the User Pool domain
   */
  private createUserPoolDomain(props: CognitoStackProps): cognito.UserPoolDomain {
    // Use Cognito domain prefix
    const domainPrefix = `governance-${props.environment}-${this.account}`;
    
    return this.userPool.addDomain('Domain', {
      cognitoDomain: {
        domainPrefix,
      },
    });
  }

  /**
   * Creates the initial admin user
   * Validates: Requirements 3.6
   */
  private createInitialAdminUser(props: CognitoStackProps): void {
    // Create admin user using CloudFormation custom resource
    const adminUser = new cognito.CfnUserPoolUser(this, 'InitialAdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: props.adminEmail,
      userAttributes: [
        {
          name: 'email',
          value: props.adminEmail,
        },
        {
          name: 'email_verified',
          value: 'true',
        },
        {
          name: 'given_name',
          value: 'Platform',
        },
        {
          name: 'family_name',
          value: 'Administrator',
        },
        {
          name: 'custom:tenant_id',
          value: 'system',
        },
      ],
      desiredDeliveryMediums: ['EMAIL'],
      forceAliasCreation: false,
    });

    // Add admin user to admin group
    const adminGroupMembership = new cognito.CfnUserPoolUserToGroupAttachment(
      this,
      'AdminUserGroupAttachment',
      {
        userPoolId: this.userPool.userPoolId,
        groupName: 'admin',
        username: props.adminEmail,
      }
    );

    // Ensure group is created before adding user
    adminGroupMembership.addDependency(this.adminGroup);
    adminGroupMembership.node.addDependency(adminUser);
  }

  /**
   * Creates stack outputs
   */
  private createOutputs(props: CognitoStackProps): void {
    // User Pool ID
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `governance-${props.environment}-user-pool-id`,
    });

    // User Pool ARN
    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: this.userPool.userPoolArn,
      description: 'Cognito User Pool ARN',
      exportName: `governance-${props.environment}-user-pool-arn`,
    });

    // User Pool Client ID
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `governance-${props.environment}-user-pool-client-id`,
    });

    // User Pool Domain
    new cdk.CfnOutput(this, 'UserPoolDomainUrl', {
      value: `https://${this.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito User Pool Domain URL',
      exportName: `governance-${props.environment}-user-pool-domain`,
    });

    // Cognito Issuer URL (for JWT validation)
    new cdk.CfnOutput(this, 'CognitoIssuerUrl', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      description: 'Cognito Issuer URL for JWT validation',
      exportName: `governance-${props.environment}-cognito-issuer`,
    });
  }
}


/**
 * User roles for the governance platform
 */
export type UserRole = 'admin' | 'compliance_officer' | 'data_steward' | 'viewer';

/**
 * Group precedence mapping (lower number = higher precedence)
 */
export const GROUP_PRECEDENCE: Record<UserRole, number> = {
  admin: 1,
  compliance_officer: 2,
  data_steward: 3,
  viewer: 4,
};

/**
 * Helper function to check if a Cognito User Pool is configured for invite-only
 */
export function isInviteOnlyUserPool(config: {
  selfSignUpEnabled: boolean;
  adminCreateUserConfig?: {
    allowAdminCreateUserOnly?: boolean;
  };
}): boolean {
  return config.selfSignUpEnabled === false;
}

/**
 * Helper function to validate JWT claims contain required fields
 */
export function hasRequiredJwtClaims(claims: Record<string, unknown>): boolean {
  const requiredClaims = ['sub', 'email', 'cognito:groups'];
  return requiredClaims.every(claim => claim in claims);
}

/**
 * Helper function to extract tenant_id from JWT claims
 */
export function extractTenantId(claims: Record<string, unknown>): string | null {
  const tenantId = claims['custom:tenant_id'];
  if (typeof tenantId === 'string' && tenantId.length > 0) {
    return tenantId;
  }
  return null;
}

/**
 * Helper function to extract roles from JWT claims
 */
export function extractRoles(claims: Record<string, unknown>): UserRole[] {
  const groups = claims['cognito:groups'];
  if (Array.isArray(groups)) {
    return groups.filter((g): g is UserRole => 
      ['admin', 'compliance_officer', 'data_steward', 'viewer'].includes(g)
    );
  }
  return [];
}
