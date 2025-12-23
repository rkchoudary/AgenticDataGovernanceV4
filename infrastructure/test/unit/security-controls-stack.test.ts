import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import {
  SecurityControlsStack,
  validateVpcEndpoints,
  validateCloudTrailConfig,
  CONFIG_RULE_IDENTIFIERS,
  REQUIRED_VPC_ENDPOINTS,
} from '../../lib/stacks/security-controls-stack.js';

/**
 * Unit tests for SecurityControlsStack resources
 * Tests VPC endpoints, CloudTrail, and AWS Config rules
 * Validates: Requirements 13.2, 13.3, 13.4
 */
describe('SecurityControlsStack', () => {
  // Helper function to create a test stack
  function createTestStack(environment: string): Template {
    const app = new cdk.App();
    
    // Create a base stack with KMS key
    const baseStack = new cdk.Stack(app, 'BaseStack', {
      env: { account: '123456789012', region: 'us-west-2' },
    });
    
    const encryptionKey = new kms.Key(baseStack, 'EncryptionKey', {
      enableKeyRotation: true,
    });

    const stack = new SecurityControlsStack(app, 'TestSecurityStack', {
      env: { account: '123456789012', region: 'us-west-2' },
      environment,
      tags: {
        Environment: environment,
        Project: 'governance-platform',
        CostCenter: 'test-cost-center',
      },
      encryptionKey,
    });

    return Template.fromStack(stack);
  }

  describe('VPC Configuration', () => {
    /**
     * Test: VPC is created with correct configuration
     * Validates: Requirements 13.2
     */
    it('should create VPC with DNS support enabled', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPC', {
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    /**
     * Test: VPC has private subnets
     * Validates: Requirements 13.2
     */
    it('should create private subnets for Lambda functions', () => {
      const template = createTestStack('dev');

      // Check that private subnets exist
      const subnets = template.findResources('AWS::EC2::Subnet');
      expect(Object.keys(subnets).length).toBeGreaterThan(0);
    });

    /**
     * Test: NAT Gateway is created for private subnet egress
     * Validates: Requirements 13.2
     */
    it('should create NAT Gateway for private subnet egress', () => {
      const template = createTestStack('dev');

      template.resourceCountIs('AWS::EC2::NatGateway', 1);
    });

    /**
     * Test: Production has multiple NAT Gateways for HA
     */
    it('should create multiple NAT Gateways in production', () => {
      const template = createTestStack('prod');

      template.resourceCountIs('AWS::EC2::NatGateway', 2);
    });
  });

  describe('VPC Endpoints', () => {
    /**
     * Test: DynamoDB Gateway Endpoint is created
     * Validates: Requirements 13.2
     */
    it('should create DynamoDB Gateway Endpoint', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('dynamodb'),
            ]),
          ]),
        }),
        VpcEndpointType: 'Gateway',
      });
    });

    /**
     * Test: S3 Gateway Endpoint is created
     * Validates: Requirements 13.2
     */
    it('should create S3 Gateway Endpoint', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.objectLike({
          'Fn::Join': Match.arrayWith([
            Match.arrayWith([
              Match.stringLikeRegexp('\\.s3'),
            ]),
          ]),
        }),
        VpcEndpointType: 'Gateway',
      });
    });

    /**
     * Test: Secrets Manager Interface Endpoint is created
     * Validates: Requirements 13.2
     */
    it('should create Secrets Manager Interface Endpoint', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.stringLikeRegexp('secretsmanager'),
        VpcEndpointType: 'Interface',
        PrivateDnsEnabled: true,
      });
    });

    /**
     * Test: KMS Interface Endpoint is created
     */
    it('should create KMS Interface Endpoint', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.stringLikeRegexp('\\.kms'),
        VpcEndpointType: 'Interface',
        PrivateDnsEnabled: true,
      });
    });

    /**
     * Test: CloudWatch Logs Interface Endpoint is created
     */
    it('should create CloudWatch Logs Interface Endpoint', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.stringLikeRegexp('\\.logs'),
        VpcEndpointType: 'Interface',
        PrivateDnsEnabled: true,
      });
    });

    /**
     * Test: X-Ray Interface Endpoint is created
     */
    it('should create X-Ray Interface Endpoint', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.stringLikeRegexp('xray'),
        VpcEndpointType: 'Interface',
        PrivateDnsEnabled: true,
      });
    });

    /**
     * Test: VPC Endpoint security group is created
     */
    it('should create security group for VPC endpoints', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for VPC endpoints',
      });
    });
  });


  describe('CloudTrail Configuration', () => {
    /**
     * Test: CloudTrail trail is created
     * Validates: Requirements 13.3
     */
    it('should create CloudTrail trail', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        TrailName: 'governance-dev-trail',
        IsLogging: true,
        EnableLogFileValidation: true,
        IncludeGlobalServiceEvents: true,
      });
    });

    /**
     * Test: CloudTrail S3 bucket is created with encryption
     * Validates: Requirements 13.3
     */
    it('should create encrypted S3 bucket for CloudTrail logs', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: Match.arrayWith([
            Match.objectLike({
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'aws:kms',
              },
            }),
          ]),
        },
      });
    });

    /**
     * Test: CloudTrail bucket blocks public access
     * Validates: Requirements 13.3
     */
    it('should block public access on CloudTrail bucket', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    /**
     * Test: CloudTrail sends logs to CloudWatch
     * Validates: Requirements 13.3
     */
    it('should configure CloudTrail to send logs to CloudWatch', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        CloudWatchLogsLogGroupArn: Match.anyValue(),
      });
    });

    /**
     * Test: CloudTrail log group is created
     * Validates: Requirements 13.3
     */
    it('should create CloudWatch log group for CloudTrail', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/cloudtrail/governance-dev',
      });
    });

    /**
     * Test: Production CloudTrail is multi-region
     */
    it('should enable multi-region trail in production', () => {
      const template = createTestStack('prod');

      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        IsMultiRegionTrail: true,
      });
    });

    /**
     * Test: Dev CloudTrail is single-region
     */
    it('should use single-region trail in dev', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::CloudTrail::Trail', {
        IsMultiRegionTrail: false,
      });
    });
  });

  describe('AWS Config Rules', () => {
    /**
     * Test: AWS Config recorder is created
     * Validates: Requirements 13.4
     */
    it('should create AWS Config recorder', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigurationRecorder', {
        Name: 'governance-dev-recorder',
        RecordingGroup: {
          AllSupported: true,
          IncludeGlobalResourceTypes: true,
        },
      });
    });

    /**
     * Test: AWS Config delivery channel is created
     * Validates: Requirements 13.4
     */
    it('should create AWS Config delivery channel', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::DeliveryChannel', {
        Name: 'governance-dev-delivery-channel',
      });
    });

    /**
     * Test: S3 encryption rule is created
     * Validates: Requirements 13.4
     */
    it('should create S3 encryption compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-s3-encryption',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED',
        },
      });
    });

    /**
     * Test: S3 public read rule is created
     * Validates: Requirements 13.4
     */
    it('should create S3 public read compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-s3-public-read',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'S3_BUCKET_PUBLIC_READ_PROHIBITED',
        },
      });
    });

    /**
     * Test: S3 public write rule is created
     * Validates: Requirements 13.4
     */
    it('should create S3 public write compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-s3-public-write',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'S3_BUCKET_PUBLIC_WRITE_PROHIBITED',
        },
      });
    });

    /**
     * Test: DynamoDB encryption rule is created
     * Validates: Requirements 13.4
     */
    it('should create DynamoDB encryption compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-dynamodb-encryption',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'DYNAMODB_TABLE_ENCRYPTED_KMS',
        },
      });
    });

    /**
     * Test: Lambda VPC rule is created
     * Validates: Requirements 13.4
     */
    it('should create Lambda VPC compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-lambda-vpc',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'LAMBDA_INSIDE_VPC',
        },
      });
    });

    /**
     * Test: CloudTrail enabled rule is created
     * Validates: Requirements 13.4
     */
    it('should create CloudTrail enabled compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-cloudtrail-enabled',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'CLOUD_TRAIL_ENABLED',
        },
      });
    });

    /**
     * Test: KMS rotation rule is created
     * Validates: Requirements 13.4
     */
    it('should create KMS rotation compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-kms-rotation',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'CMK_BACKING_KEY_ROTATION_ENABLED',
        },
      });
    });

    /**
     * Test: Secrets rotation rule is created
     * Validates: Requirements 13.4
     */
    it('should create Secrets Manager rotation compliance rule', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Config::ConfigRule', {
        ConfigRuleName: 'governance-dev-secrets-rotation',
        Source: {
          Owner: 'AWS',
          SourceIdentifier: 'SECRETSMANAGER_ROTATION_ENABLED_CHECK',
        },
      });
    });
  });


  describe('Security Groups', () => {
    /**
     * Test: Lambda security group is created
     */
    it('should create security group for Lambda functions', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::SecurityGroup', {
        GroupDescription: 'Security group for Lambda functions',
      });
    });
  });

  describe('Resource Tagging', () => {
    /**
     * Test: All resources have required tags
     * Validates: Requirements 8.3, 15.2
     */
    it('should apply required tags to VPC', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Environment', Value: 'dev' }),
          Match.objectLike({ Key: 'Project', Value: 'governance-platform' }),
        ]),
      });
    });
  });

  describe('CloudFormation Outputs', () => {
    /**
     * Test: VPC ID is exported
     */
    it('should export VPC ID', () => {
      const template = createTestStack('dev');

      template.hasOutput('VpcId', {
        Export: {
          Name: 'governance-dev-vpc-id',
        },
      });
    });

    /**
     * Test: Private subnet IDs are exported
     */
    it('should export private subnet IDs', () => {
      const template = createTestStack('dev');

      template.hasOutput('PrivateSubnetIds', {
        Export: {
          Name: 'governance-dev-private-subnet-ids',
        },
      });
    });

    /**
     * Test: Lambda security group ID is exported
     */
    it('should export Lambda security group ID', () => {
      const template = createTestStack('dev');

      template.hasOutput('LambdaSecurityGroupId', {
        Export: {
          Name: 'governance-dev-lambda-sg-id',
        },
      });
    });

    /**
     * Test: CloudTrail bucket ARN is exported
     */
    it('should export CloudTrail bucket ARN', () => {
      const template = createTestStack('dev');

      template.hasOutput('CloudTrailBucketArn', {
        Export: {
          Name: 'governance-dev-cloudtrail-bucket-arn',
        },
      });
    });

    /**
     * Test: CloudTrail ARN is exported
     */
    it('should export CloudTrail ARN', () => {
      const template = createTestStack('dev');

      template.hasOutput('CloudTrailArn', {
        Export: {
          Name: 'governance-dev-cloudtrail-arn',
        },
      });
    });
  });

  describe('Helper Functions', () => {
    describe('validateVpcEndpoints', () => {
      /**
       * Test: Returns valid when all required endpoints are present
       */
      it('should return valid when all required endpoints are present', () => {
        const endpoints = ['dynamodb', 's3', 'secretsmanager', 'kms', 'logs'];
        const result = validateVpcEndpoints(endpoints);

        expect(result.valid).toBe(true);
        expect(result.missingEndpoints).toHaveLength(0);
      });

      /**
       * Test: Returns invalid when endpoints are missing
       */
      it('should return invalid when required endpoints are missing', () => {
        const endpoints = ['dynamodb'];
        const result = validateVpcEndpoints(endpoints);

        expect(result.valid).toBe(false);
        expect(result.missingEndpoints).toContain('s3');
        expect(result.missingEndpoints).toContain('secretsmanager');
      });

      /**
       * Test: Handles case-insensitive endpoint names
       */
      it('should handle case-insensitive endpoint names', () => {
        const endpoints = ['DYNAMODB', 'S3', 'SECRETSMANAGER'];
        const result = validateVpcEndpoints(endpoints);

        expect(result.valid).toBe(true);
      });

      /**
       * Test: Handles partial matches in endpoint names
       */
      it('should handle partial matches in endpoint names', () => {
        const endpoints = [
          'com.amazonaws.us-west-2.dynamodb',
          'com.amazonaws.us-west-2.s3',
          'com.amazonaws.us-west-2.secretsmanager',
        ];
        const result = validateVpcEndpoints(endpoints);

        expect(result.valid).toBe(true);
      });
    });

    describe('validateCloudTrailConfig', () => {
      /**
       * Test: Returns valid for properly configured CloudTrail
       */
      it('should return valid for properly configured CloudTrail', () => {
        const config = {
          isLogging: true,
          s3BucketName: 'my-cloudtrail-bucket',
          isMultiRegionTrail: true,
          logFileValidationEnabled: true,
          cloudWatchLogsLogGroupArn: 'arn:aws:logs:us-west-2:123456789012:log-group:cloudtrail',
        };
        const result = validateCloudTrailConfig(config);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      /**
       * Test: Returns invalid when logging is disabled
       */
      it('should return invalid when logging is disabled', () => {
        const config = {
          isLogging: false,
          s3BucketName: 'my-cloudtrail-bucket',
          logFileValidationEnabled: true,
          cloudWatchLogsLogGroupArn: 'arn:aws:logs:us-west-2:123456789012:log-group:cloudtrail',
        };
        const result = validateCloudTrailConfig(config);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('CloudTrail logging is not enabled');
      });

      /**
       * Test: Returns invalid when S3 bucket is missing
       */
      it('should return invalid when S3 bucket is missing', () => {
        const config = {
          isLogging: true,
          logFileValidationEnabled: true,
          cloudWatchLogsLogGroupArn: 'arn:aws:logs:us-west-2:123456789012:log-group:cloudtrail',
        };
        const result = validateCloudTrailConfig(config);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('CloudTrail S3 bucket is not configured');
      });

      /**
       * Test: Returns invalid when log file validation is disabled
       */
      it('should return invalid when log file validation is disabled', () => {
        const config = {
          isLogging: true,
          s3BucketName: 'my-cloudtrail-bucket',
          logFileValidationEnabled: false,
          cloudWatchLogsLogGroupArn: 'arn:aws:logs:us-west-2:123456789012:log-group:cloudtrail',
        };
        const result = validateCloudTrailConfig(config);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('CloudTrail log file validation is not enabled');
      });

      /**
       * Test: Returns invalid when CloudWatch Logs is not configured
       */
      it('should return invalid when CloudWatch Logs is not configured', () => {
        const config = {
          isLogging: true,
          s3BucketName: 'my-cloudtrail-bucket',
          logFileValidationEnabled: true,
        };
        const result = validateCloudTrailConfig(config);

        expect(result.valid).toBe(false);
        expect(result.issues).toContain('CloudTrail CloudWatch Logs integration is not configured');
      });

      /**
       * Test: Returns multiple issues when multiple problems exist
       */
      it('should return multiple issues when multiple problems exist', () => {
        const config = {
          isLogging: false,
          logFileValidationEnabled: false,
        };
        const result = validateCloudTrailConfig(config);

        expect(result.valid).toBe(false);
        expect(result.issues.length).toBeGreaterThan(1);
      });
    });

    describe('CONFIG_RULE_IDENTIFIERS', () => {
      /**
       * Test: Contains all required rule identifiers
       */
      it('should contain all required rule identifiers', () => {
        expect(CONFIG_RULE_IDENTIFIERS.S3_ENCRYPTION).toBe('S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED');
        expect(CONFIG_RULE_IDENTIFIERS.S3_PUBLIC_READ).toBe('S3_BUCKET_PUBLIC_READ_PROHIBITED');
        expect(CONFIG_RULE_IDENTIFIERS.S3_PUBLIC_WRITE).toBe('S3_BUCKET_PUBLIC_WRITE_PROHIBITED');
        expect(CONFIG_RULE_IDENTIFIERS.DYNAMODB_ENCRYPTION).toBe('DYNAMODB_TABLE_ENCRYPTED_KMS');
        expect(CONFIG_RULE_IDENTIFIERS.LAMBDA_VPC).toBe('LAMBDA_INSIDE_VPC');
        expect(CONFIG_RULE_IDENTIFIERS.CLOUDTRAIL_ENABLED).toBe('CLOUD_TRAIL_ENABLED');
        expect(CONFIG_RULE_IDENTIFIERS.KMS_ROTATION).toBe('CMK_BACKING_KEY_ROTATION_ENABLED');
        expect(CONFIG_RULE_IDENTIFIERS.SECRETS_ROTATION).toBe('SECRETSMANAGER_ROTATION_ENABLED_CHECK');
      });
    });

    describe('REQUIRED_VPC_ENDPOINTS', () => {
      /**
       * Test: Contains all required VPC endpoints
       */
      it('should contain all required VPC endpoints', () => {
        expect(REQUIRED_VPC_ENDPOINTS).toContain('dynamodb');
        expect(REQUIRED_VPC_ENDPOINTS).toContain('s3');
        expect(REQUIRED_VPC_ENDPOINTS).toContain('secretsmanager');
        expect(REQUIRED_VPC_ENDPOINTS).toContain('kms');
        expect(REQUIRED_VPC_ENDPOINTS).toContain('logs');
        expect(REQUIRED_VPC_ENDPOINTS).toContain('xray');
      });
    });
  });
});
