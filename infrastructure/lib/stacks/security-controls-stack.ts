import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as config from 'aws-cdk-lib/aws-config';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the SecurityControlsStack
 */
export interface SecurityControlsStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * KMS key for encryption (from BaseStack)
   */
  encryptionKey: kms.IKey;
}

/**
 * Security Controls Stack for the Governance Platform
 * 
 * Creates:
 * - VPC with private subnets for Lambda functions (Requirements 13.2)
 * - VPC endpoints for DynamoDB, S3, Secrets Manager (Requirements 13.2)
 * - CloudTrail trail for API audit logging (Requirements 13.3)
 * - AWS Config rules for compliance monitoring (Requirements 13.4)
 * 
 * Validates: Requirements 13.2, 13.3, 13.4
 */
export class SecurityControlsStack extends cdk.Stack {
  /**
   * VPC for Lambda functions
   */
  public readonly vpc: ec2.Vpc;

  /**
   * Security group for Lambda functions
   */
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;

  /**
   * CloudTrail trail
   */
  public readonly trail: cloudtrail.Trail;

  /**
   * S3 bucket for CloudTrail logs
   */
  public readonly cloudTrailBucket: s3.Bucket;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: SecurityControlsStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // Create VPC for Lambda functions
    // Validates: Requirements 13.2
    this.vpc = this.createVpc(props.environment);

    // Create security group for Lambda functions
    this.lambdaSecurityGroup = this.createLambdaSecurityGroup(props.environment);

    // Create VPC endpoints for AWS services
    // Validates: Requirements 13.2
    this.createVpcEndpoints(props.environment);

    // Create CloudTrail
    // Validates: Requirements 13.3
    const { bucket, trail } = this.createCloudTrail(
      props.environment,
      props.encryptionKey,
      removalPolicy
    );
    this.cloudTrailBucket = bucket;
    this.trail = trail;

    // Create AWS Config rules
    // Validates: Requirements 13.4
    this.createConfigRules(props.environment, removalPolicy);

    // Create outputs
    this.createOutputs(props.environment);
  }


  /**
   * Creates VPC for Lambda functions with private subnets
   * Validates: Requirements 13.2
   */
  private createVpc(environment: string): ec2.Vpc {
    return new ec2.Vpc(this, 'GovernanceVpc', {
      vpcName: `governance-${environment}-vpc`,
      maxAzs: 2,
      natGateways: environment === 'prod' ? 2 : 1,
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });
  }

  /**
   * Creates security group for Lambda functions
   */
  private createLambdaSecurityGroup(environment: string): ec2.SecurityGroup {
    const sg = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `governance-${environment}-lambda-sg`,
      description: 'Security group for Lambda functions',
      allowAllOutbound: true,
    });

    // Allow HTTPS outbound for VPC endpoints
    sg.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS outbound'
    );

    return sg;
  }

  /**
   * Creates VPC endpoints for AWS services to avoid public internet traffic
   * Validates: Requirements 13.2
   */
  private createVpcEndpoints(environment: string): void {
    // Create security group for VPC endpoints
    const endpointSecurityGroup = new ec2.SecurityGroup(this, 'VpcEndpointSecurityGroup', {
      vpc: this.vpc,
      securityGroupName: `governance-${environment}-vpce-sg`,
      description: 'Security group for VPC endpoints',
      allowAllOutbound: false,
    });

    // Allow HTTPS from Lambda security group
    endpointSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'Allow HTTPS from Lambda functions'
    );

    // DynamoDB Gateway Endpoint (free, no interface endpoint needed)
    // Validates: Requirements 13.2
    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // S3 Gateway Endpoint (free, no interface endpoint needed)
    // Validates: Requirements 13.2
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
    });

    // Secrets Manager Interface Endpoint
    // Validates: Requirements 13.2
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });

    // KMS Interface Endpoint
    this.vpc.addInterfaceEndpoint('KmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });

    // CloudWatch Logs Interface Endpoint
    this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });

    // X-Ray Interface Endpoint
    this.vpc.addInterfaceEndpoint('XRayEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.XRAY,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
    });
  }


  /**
   * Creates CloudTrail trail for API audit logging
   * Validates: Requirements 13.3
   */
  private createCloudTrail(
    environment: string,
    encryptionKey: kms.IKey,
    removalPolicy: cdk.RemovalPolicy
  ): { bucket: s3.Bucket; trail: cloudtrail.Trail } {
    // Create S3 bucket for CloudTrail logs
    const bucket = new s3.Bucket(this, 'CloudTrailBucket', {
      bucketName: `governance-${environment}-cloudtrail-${this.account}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: encryptionKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: removalPolicy,
      autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(365),
            },
          ],
        },
        {
          id: 'ExpireOldVersions',
          noncurrentVersionExpiration: cdk.Duration.days(90),
        },
      ],
    });

    // Create CloudWatch log group for CloudTrail
    const logGroup = new logs.LogGroup(this, 'CloudTrailLogGroup', {
      logGroupName: `/aws/cloudtrail/governance-${environment}`,
      retention: environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_MONTH,
      removalPolicy: removalPolicy,
    });

    // Create IAM role for CloudTrail to write to CloudWatch Logs
    const cloudTrailRole = new iam.Role(this, 'CloudTrailRole', {
      roleName: `governance-${environment}-cloudtrail-role`,
      assumedBy: new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
    });

    logGroup.grantWrite(cloudTrailRole);

    // Create CloudTrail trail
    // Validates: Requirements 13.3
    const trail = new cloudtrail.Trail(this, 'GovernanceTrail', {
      trailName: `governance-${environment}-trail`,
      bucket: bucket,
      s3KeyPrefix: 'cloudtrail',
      encryptionKey: encryptionKey,
      cloudWatchLogGroup: logGroup,
      cloudWatchLogsRetention: environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_MONTH,
      sendToCloudWatchLogs: true,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: environment === 'prod',
      enableFileValidation: true,
    });

    // Add management events
    trail.addEventSelector(cloudtrail.DataResourceType.S3_OBJECT, ['arn:aws:s3'], {
      includeManagementEvents: true,
      readWriteType: cloudtrail.ReadWriteType.ALL,
    });

    return { bucket, trail };
  }


  /**
   * Creates AWS Config rules for compliance monitoring
   * Validates: Requirements 13.4
   */
  private createConfigRules(
    environment: string,
    removalPolicy: cdk.RemovalPolicy
  ): void {
    // Create S3 bucket for AWS Config
    const configBucket = new s3.Bucket(this, 'ConfigBucket', {
      bucketName: `governance-${environment}-config-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: removalPolicy,
      autoDeleteObjects: removalPolicy === cdk.RemovalPolicy.DESTROY,
    });

    // Create IAM role for AWS Config
    const configRole = new iam.Role(this, 'ConfigRole', {
      roleName: `governance-${environment}-config-role`,
      assumedBy: new iam.ServicePrincipal('config.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWS_ConfigRole'),
      ],
    });

    configBucket.grantReadWrite(configRole);

    // Create Configuration Recorder
    const recorder = new config.CfnConfigurationRecorder(this, 'ConfigRecorder', {
      name: `governance-${environment}-recorder`,
      roleArn: configRole.roleArn,
      recordingGroup: {
        allSupported: true,
        includeGlobalResourceTypes: true,
      },
    });

    // Create Delivery Channel
    const deliveryChannel = new config.CfnDeliveryChannel(this, 'ConfigDeliveryChannel', {
      name: `governance-${environment}-delivery-channel`,
      s3BucketName: configBucket.bucketName,
      configSnapshotDeliveryProperties: {
        deliveryFrequency: 'TwentyFour_Hours',
      },
    });

    deliveryChannel.addDependency(recorder);

    // AWS Config Rules for compliance monitoring
    // Validates: Requirements 13.4

    // Rule: S3 buckets should have encryption enabled
    new config.ManagedRule(this, 'S3BucketEncryptionRule', {
      identifier: 'S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED',
      configRuleName: `governance-${environment}-s3-encryption`,
      description: 'Checks that S3 buckets have server-side encryption enabled',
    });

    // Rule: S3 buckets should block public access
    new config.ManagedRule(this, 'S3BucketPublicAccessRule', {
      identifier: 'S3_BUCKET_PUBLIC_READ_PROHIBITED',
      configRuleName: `governance-${environment}-s3-public-read`,
      description: 'Checks that S3 buckets do not allow public read access',
    });

    new config.ManagedRule(this, 'S3BucketPublicWriteRule', {
      identifier: 'S3_BUCKET_PUBLIC_WRITE_PROHIBITED',
      configRuleName: `governance-${environment}-s3-public-write`,
      description: 'Checks that S3 buckets do not allow public write access',
    });

    // Rule: DynamoDB tables should have encryption enabled
    new config.ManagedRule(this, 'DynamoDBEncryptionRule', {
      identifier: 'DYNAMODB_TABLE_ENCRYPTED_KMS',
      configRuleName: `governance-${environment}-dynamodb-encryption`,
      description: 'Checks that DynamoDB tables are encrypted with KMS',
    });

    // Rule: Lambda functions should be in VPC
    new config.ManagedRule(this, 'LambdaVpcRule', {
      identifier: 'LAMBDA_INSIDE_VPC',
      configRuleName: `governance-${environment}-lambda-vpc`,
      description: 'Checks that Lambda functions are deployed in a VPC',
    });

    // Rule: CloudTrail should be enabled
    new config.ManagedRule(this, 'CloudTrailEnabledRule', {
      identifier: 'CLOUD_TRAIL_ENABLED',
      configRuleName: `governance-${environment}-cloudtrail-enabled`,
      description: 'Checks that CloudTrail is enabled',
    });

    // Rule: KMS keys should have rotation enabled
    new config.ManagedRule(this, 'KmsKeyRotationRule', {
      identifier: 'CMK_BACKING_KEY_ROTATION_ENABLED',
      configRuleName: `governance-${environment}-kms-rotation`,
      description: 'Checks that KMS customer master keys have rotation enabled',
    });

    // Rule: IAM policies should not allow full admin access
    new config.ManagedRule(this, 'IamNoAdminRule', {
      identifier: 'IAM_POLICY_NO_STATEMENTS_WITH_ADMIN_ACCESS',
      configRuleName: `governance-${environment}-iam-no-admin`,
      description: 'Checks that IAM policies do not allow full administrative access',
    });

    // Rule: RDS instances should have encryption enabled (if used)
    new config.ManagedRule(this, 'RdsEncryptionRule', {
      identifier: 'RDS_STORAGE_ENCRYPTED',
      configRuleName: `governance-${environment}-rds-encryption`,
      description: 'Checks that RDS instances have storage encryption enabled',
    });

    // Rule: Secrets Manager secrets should have rotation enabled
    new config.ManagedRule(this, 'SecretsRotationRule', {
      identifier: 'SECRETSMANAGER_ROTATION_ENABLED_CHECK',
      configRuleName: `governance-${environment}-secrets-rotation`,
      description: 'Checks that Secrets Manager secrets have rotation enabled',
    });
  }


  /**
   * Creates CloudFormation outputs
   */
  private createOutputs(environment: string): void {
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID for Lambda functions',
      exportName: `governance-${environment}-vpc-id`,
    });

    new cdk.CfnOutput(this, 'PrivateSubnetIds', {
      value: this.vpc.privateSubnets.map(s => s.subnetId).join(','),
      description: 'Private subnet IDs for Lambda functions',
      exportName: `governance-${environment}-private-subnet-ids`,
    });

    new cdk.CfnOutput(this, 'LambdaSecurityGroupId', {
      value: this.lambdaSecurityGroup.securityGroupId,
      description: 'Security group ID for Lambda functions',
      exportName: `governance-${environment}-lambda-sg-id`,
    });

    new cdk.CfnOutput(this, 'CloudTrailBucketArn', {
      value: this.cloudTrailBucket.bucketArn,
      description: 'ARN of the CloudTrail S3 bucket',
      exportName: `governance-${environment}-cloudtrail-bucket-arn`,
    });

    new cdk.CfnOutput(this, 'CloudTrailArn', {
      value: this.trail.trailArn,
      description: 'ARN of the CloudTrail trail',
      exportName: `governance-${environment}-cloudtrail-arn`,
    });
  }
}


/**
 * Validates that a VPC has the required endpoints for security compliance
 * 
 * Validates: Requirements 13.2
 */
export function validateVpcEndpoints(
  vpcEndpoints: string[]
): { valid: boolean; missingEndpoints: string[] } {
  const requiredEndpoints = [
    'dynamodb',
    's3',
    'secretsmanager',
  ];

  const normalizedEndpoints = vpcEndpoints.map(e => e.toLowerCase());
  const missingEndpoints = requiredEndpoints.filter(
    required => !normalizedEndpoints.some(e => e.includes(required))
  );

  return {
    valid: missingEndpoints.length === 0,
    missingEndpoints,
  };
}

/**
 * Validates that CloudTrail is properly configured
 * 
 * Validates: Requirements 13.3
 */
export function validateCloudTrailConfig(config: {
  isLogging: boolean;
  s3BucketName?: string;
  isMultiRegionTrail?: boolean;
  logFileValidationEnabled?: boolean;
  cloudWatchLogsLogGroupArn?: string;
}): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (!config.isLogging) {
    issues.push('CloudTrail logging is not enabled');
  }

  if (!config.s3BucketName) {
    issues.push('CloudTrail S3 bucket is not configured');
  }

  if (!config.logFileValidationEnabled) {
    issues.push('CloudTrail log file validation is not enabled');
  }

  if (!config.cloudWatchLogsLogGroupArn) {
    issues.push('CloudTrail CloudWatch Logs integration is not configured');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * AWS Config rule identifiers for compliance checks
 */
export const CONFIG_RULE_IDENTIFIERS = {
  S3_ENCRYPTION: 'S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED',
  S3_PUBLIC_READ: 'S3_BUCKET_PUBLIC_READ_PROHIBITED',
  S3_PUBLIC_WRITE: 'S3_BUCKET_PUBLIC_WRITE_PROHIBITED',
  DYNAMODB_ENCRYPTION: 'DYNAMODB_TABLE_ENCRYPTED_KMS',
  LAMBDA_VPC: 'LAMBDA_INSIDE_VPC',
  CLOUDTRAIL_ENABLED: 'CLOUD_TRAIL_ENABLED',
  KMS_ROTATION: 'CMK_BACKING_KEY_ROTATION_ENABLED',
  IAM_NO_ADMIN: 'IAM_POLICY_NO_STATEMENTS_WITH_ADMIN_ACCESS',
  RDS_ENCRYPTION: 'RDS_STORAGE_ENCRYPTED',
  SECRETS_ROTATION: 'SECRETSMANAGER_ROTATION_ENABLED_CHECK',
} as const;

/**
 * Required VPC endpoints for security compliance
 */
export const REQUIRED_VPC_ENDPOINTS = [
  'dynamodb',
  's3',
  'secretsmanager',
  'kms',
  'logs',
  'xray',
] as const;
