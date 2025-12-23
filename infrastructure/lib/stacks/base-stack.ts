import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the BaseStack
 */
export interface BaseStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;
  
  /**
   * Required resource tags
   */
  tags: ResourceTags;
}

/**
 * Base stack containing shared resources for the Governance Platform
 * 
 * Creates:
 * - KMS key for encryption (Requirements 13.5)
 * - SNS topic for alarms (Requirements 7.3)
 * - Resource tagging for all resources (Requirements 8.3, 15.2)
 */
export class BaseStack extends cdk.Stack {
  /**
   * KMS key for encrypting sensitive data
   */
  public readonly encryptionKey: kms.Key;

  /**
   * SNS topic for alarm notifications
   */
  public readonly alarmTopic: sns.Topic;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: BaseStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create KMS key for encryption
    // Validates: Requirements 13.5
    this.encryptionKey = new kms.Key(this, 'EncryptionKey', {
      alias: `governance-${props.environment}-key`,
      description: `KMS key for Governance Platform encryption (${props.environment})`,
      enableKeyRotation: true,
      removalPolicy: props.environment === 'prod' 
        ? cdk.RemovalPolicy.RETAIN 
        : cdk.RemovalPolicy.DESTROY,
      pendingWindow: cdk.Duration.days(7),
    });

    // Add key policy for Lambda and other services
    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowLambdaEncryption',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
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

    // Add key policy for DynamoDB
    this.encryptionKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowDynamoDBEncryption',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('dynamodb.amazonaws.com')],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
          'kms:CreateGrant',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:CallerAccount': this.account,
          },
        },
      })
    );

    // Create SNS topic for alarm notifications
    // Validates: Requirements 7.3
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `governance-${props.environment}-alarms`,
      displayName: `Governance Platform Alarms (${props.environment})`,
      masterKey: this.encryptionKey,
    });

    // Output the KMS key ARN for use in other stacks
    new cdk.CfnOutput(this, 'EncryptionKeyArn', {
      value: this.encryptionKey.keyArn,
      description: 'ARN of the KMS encryption key',
      exportName: `governance-${props.environment}-encryption-key-arn`,
    });

    // Output the SNS topic ARN for use in other stacks
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'ARN of the SNS alarm topic',
      exportName: `governance-${props.environment}-alarm-topic-arn`,
    });
  }
}
