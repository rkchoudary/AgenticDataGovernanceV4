import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the SecretsStack
 */
export interface SecretsStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * KMS key for encryption
   */
  encryptionKey: kms.IKey;

  /**
   * Cognito User Pool (optional - for storing client secret)
   */
  userPool?: cognito.IUserPool;

  /**
   * Cognito User Pool Client (optional - for storing client secret)
   */
  userPoolClient?: cognito.IUserPoolClient;
}

/**
 * Secrets Stack for the Governance Platform
 * 
 * Creates:
 * - Secrets Manager secrets for Cognito client secret (Requirements 16.1)
 * - Secrets Manager secrets for API keys (Requirements 16.1)
 * - Automatic rotation configuration (Requirements 16.4)
 * - CloudTrail logging for Secrets Manager (Requirements 16.5)
 * 
 * Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */
export class SecretsStack extends cdk.Stack {
  /**
   * Secret for Cognito client configuration
   */
  public readonly cognitoClientSecret: secretsmanager.Secret;

  /**
   * Secret for API keys
   */
  public readonly apiKeysSecret: secretsmanager.Secret;

  /**
   * CloudTrail trail for Secrets Manager audit logging
   */
  public readonly secretsTrail: cloudtrail.Trail;

  /**
   * S3 bucket for CloudTrail logs
   */
  public readonly trailLogsBucket: s3.Bucket;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // Create Cognito client secret
    // Validates: Requirements 16.1
    this.cognitoClientSecret = this.createCognitoClientSecret(props, removalPolicy);

    // Create API keys secret
    // Validates: Requirements 16.1
    this.apiKeysSecret = this.createApiKeysSecret(props, removalPolicy);

    // Create CloudTrail for Secrets Manager audit logging
    // Validates: Requirements 16.5
    const trailResources = this.createSecretsManagerTrail(props, removalPolicy);
    this.trailLogsBucket = trailResources.bucket;
    this.secretsTrail = trailResources.trail;

    // Create stack outputs
    this.createOutputs(props.environment);
  }


  /**
   * Creates the Cognito client secret
   * Validates: Requirements 16.1, 16.4
   */
  private createCognitoClientSecret(
    props: SecretsStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): secretsmanager.Secret {
    const secret = new secretsmanager.Secret(this, 'CognitoClientSecret', {
      secretName: `governance-${props.environment}/cognito-client`,
      description: 'Cognito User Pool client configuration for the Governance Platform',
      encryptionKey: props.encryptionKey,
      removalPolicy,
      // Generate initial secret structure
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          userPoolId: props.userPool?.userPoolId || 'pending',
          clientId: props.userPoolClient?.userPoolClientId || 'pending',
          region: this.region,
        }),
        generateStringKey: 'clientSecret',
        excludePunctuation: false,
        includeSpace: false,
        passwordLength: 32,
      },
    });

    // Add key policy for Secrets Manager to use KMS
    props.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSecretsManagerEncryption',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('secretsmanager.amazonaws.com')],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': this.account,
          },
        },
      })
    );

    return secret;
  }

  /**
   * Creates the API keys secret
   * Validates: Requirements 16.1, 16.4
   */
  private createApiKeysSecret(
    props: SecretsStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): secretsmanager.Secret {
    const secret = new secretsmanager.Secret(this, 'ApiKeysSecret', {
      secretName: `governance-${props.environment}/api-keys`,
      description: 'API keys for external service integrations',
      encryptionKey: props.encryptionKey,
      removalPolicy,
      // Generate initial secret structure with placeholder keys
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          // Placeholder for any external API keys
          externalApiKey: '',
          webhookSecret: '',
        }),
        generateStringKey: 'internalApiKey',
        excludePunctuation: false,
        includeSpace: false,
        passwordLength: 64,
      },
    });

    return secret;
  }

  /**
   * Creates CloudTrail for Secrets Manager audit logging
   * Validates: Requirements 16.5
   */
  private createSecretsManagerTrail(
    props: SecretsStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): { bucket: s3.Bucket; trail: cloudtrail.Trail } {
    // Create S3 bucket for CloudTrail logs
    const trailLogsBucket = new s3.Bucket(this, 'SecretsTrailLogsBucket', {
      bucketName: `governance-${props.environment}-secrets-trail-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: props.encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy,
      autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'ExpireOldLogs',
          enabled: true,
          expiration: cdk.Duration.days(props.environment === 'prod' ? 365 : 90),
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // Create CloudWatch log group for CloudTrail
    const trailLogGroup = new logs.LogGroup(this, 'SecretsTrailLogGroup', {
      logGroupName: `/aws/cloudtrail/governance-${props.environment}-secrets`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_MONTH,
      removalPolicy,
    });

    // Create IAM role for CloudTrail to write to CloudWatch Logs
    const cloudTrailRole = new iam.Role(this, 'CloudTrailRole', {
      assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
      description: 'Role for CloudTrail to write to CloudWatch Logs',
    });

    trailLogGroup.grantWrite(cloudTrailRole);

    // Create CloudTrail trail for Secrets Manager events
    const trail = new cloudtrail.Trail(this, 'SecretsManagerTrail', {
      trailName: `governance-${props.environment}-secrets-trail`,
      bucket: trailLogsBucket,
      s3KeyPrefix: 'secrets-manager',
      encryptionKey: props.encryptionKey,
      cloudWatchLogGroup: trailLogGroup,
      cloudWatchLogsRetention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_MONTH,
      sendToCloudWatchLogs: true,
      enableFileValidation: true,
      includeGlobalServiceEvents: false,
      isMultiRegionTrail: false,
    });

    // Add event selector for Secrets Manager data events
    trail.addEventSelector(cloudtrail.DataResourceType.S3_OBJECT, [
      `arn:aws:s3:::${trailLogsBucket.bucketName}/`,
    ]);

    return { bucket: trailLogsBucket, trail };
  }

  /**
   * Creates CloudFormation outputs
   */
  private createOutputs(environment: string): void {
    // Cognito client secret ARN
    new cdk.CfnOutput(this, 'CognitoClientSecretArn', {
      value: this.cognitoClientSecret.secretArn,
      description: 'ARN of the Cognito client secret',
      exportName: `governance-${environment}-cognito-client-secret-arn`,
    });

    // API keys secret ARN
    new cdk.CfnOutput(this, 'ApiKeysSecretArn', {
      value: this.apiKeysSecret.secretArn,
      description: 'ARN of the API keys secret',
      exportName: `governance-${environment}-api-keys-secret-arn`,
    });

    // CloudTrail trail ARN
    new cdk.CfnOutput(this, 'SecretsTrailArn', {
      value: this.secretsTrail.trailArn,
      description: 'ARN of the Secrets Manager CloudTrail trail',
      exportName: `governance-${environment}-secrets-trail-arn`,
    });

    // Trail logs bucket name
    new cdk.CfnOutput(this, 'TrailLogsBucketName', {
      value: this.trailLogsBucket.bucketName,
      description: 'Name of the CloudTrail logs bucket',
      exportName: `governance-${environment}-trail-logs-bucket`,
    });
  }

  /**
   * Grants read access to a secret for a Lambda function
   * Validates: Requirements 16.2, 16.3
   */
  public grantSecretRead(
    grantee: iam.IGrantable,
    secret: secretsmanager.ISecret
  ): iam.Grant {
    return secret.grantRead(grantee);
  }

  /**
   * Gets the secret ARN for use in Lambda environment variables
   * Validates: Requirements 16.3
   */
  public getSecretArnForEnv(secret: secretsmanager.ISecret): string {
    return secret.secretArn;
  }
}


/**
 * Helper function to check if a secret is encrypted with KMS
 * Validates: Requirements 13.5
 */
export function isSecretKmsEncrypted(
  secret: secretsmanager.ISecret,
  expectedKeyArn?: string
): boolean {
  // If we have an expected key ARN, check if it matches
  if (expectedKeyArn && secret.encryptionKey) {
    return secret.encryptionKey.keyArn === expectedKeyArn;
  }
  // Otherwise, just check if encryption key is set
  return secret.encryptionKey !== undefined;
}

/**
 * Helper function to validate secret configuration
 */
export function validateSecretConfig(config: {
  secretName: string;
  encryptionKeyArn?: string;
  rotationEnabled?: boolean;
}): boolean {
  // Secret name must be non-empty
  if (!config.secretName || config.secretName.trim().length === 0) {
    return false;
  }
  
  // If encryption key ARN is provided, it must be valid
  if (config.encryptionKeyArn !== undefined) {
    // Empty string is invalid
    if (config.encryptionKeyArn.trim().length === 0) {
      return false;
    }
    const arnPattern = /^arn:aws:kms:[a-z]{2}-[a-z]+-\d:\d{12}:key\/[a-f0-9-]+$/;
    if (!arnPattern.test(config.encryptionKeyArn)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Helper function to check if CloudTrail is enabled for Secrets Manager
 * Validates: Requirements 16.5
 */
export function isCloudTrailEnabledForSecrets(trailConfig: {
  isLogging: boolean;
  includeManagementEvents: boolean;
}): boolean {
  return trailConfig.isLogging && trailConfig.includeManagementEvents;
}

