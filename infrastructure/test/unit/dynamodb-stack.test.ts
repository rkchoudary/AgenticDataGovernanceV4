import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DynamoDBStack } from '../../lib/stacks/dynamodb-stack.js';
import { BaseStack } from '../../lib/stacks/base-stack.js';
import { ResourceTags } from '../../lib/config/environment.js';

describe('DynamoDBStack', () => {
  let app: cdk.App;
  let baseStack: BaseStack;
  let dynamoDBStack: DynamoDBStack;
  let template: Template;
  const testTags: ResourceTags = {
    Environment: 'test',
    Project: 'governance-platform',
    CostCenter: 'test-cost-center',
  };

  beforeEach(() => {
    app = new cdk.App();
    
    // Create base stack to get the encryption key
    baseStack = new BaseStack(app, 'TestBaseStack', {
      environment: 'test',
      tags: testTags,
    });

    // Create DynamoDB stack
    dynamoDBStack = new DynamoDBStack(app, 'TestDynamoDBStack', {
      environment: 'test',
      tags: testTags,
      encryptionKey: baseStack.encryptionKey,
    });

    template = Template.fromStack(dynamoDBStack);
  });

  describe('Table Creation - Requirements 4.1', () => {
    it('should create tenants table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-tenants',
      });
    });

    it('should create users table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-users',
      });
    });

    it('should create workflows table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-workflows',
      });
    });

    it('should create CDEs table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-cdes',
      });
    });

    it('should create issues table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-issues',
      });
    });

    it('should create audit table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-audit',
      });
    });

    it('should create exactly 6 tables', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 6);
    });
  });

  describe('Partition and Sort Keys - Requirements 4.2, 4.3', () => {
    it('should configure PK as partition key for all tables', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      
      for (const [, resource] of Object.entries(tables)) {
        const keySchema = resource.Properties.KeySchema;
        const pkKey = keySchema.find((k: { AttributeName: string }) => k.AttributeName === 'PK');
        expect(pkKey).toBeDefined();
        expect(pkKey.KeyType).toBe('HASH');
      }
    });

    it('should configure SK as sort key for all tables', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      
      for (const [, resource] of Object.entries(tables)) {
        const keySchema = resource.Properties.KeySchema;
        const skKey = keySchema.find((k: { AttributeName: string }) => k.AttributeName === 'SK');
        expect(skKey).toBeDefined();
        expect(skKey.KeyType).toBe('RANGE');
      }
    });
  });

  describe('Point-in-Time Recovery - Requirements 4.4', () => {
    it('should enable point-in-time recovery for all tables', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      
      for (const [, resource] of Object.entries(tables)) {
        expect(resource.Properties.PointInTimeRecoverySpecification).toEqual({
          PointInTimeRecoveryEnabled: true,
        });
      }
    });
  });

  describe('On-Demand Capacity - Requirements 4.5', () => {
    it('should configure on-demand billing mode for all tables', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      
      for (const [, resource] of Object.entries(tables)) {
        expect(resource.Properties.BillingMode).toBe('PAY_PER_REQUEST');
      }
    });
  });

  describe('KMS Encryption - Requirements 13.5', () => {
    it('should configure KMS encryption for all tables', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      
      for (const [, resource] of Object.entries(tables)) {
        expect(resource.Properties.SSESpecification).toBeDefined();
        expect(resource.Properties.SSESpecification.SSEEnabled).toBe(true);
        expect(resource.Properties.SSESpecification.SSEType).toBe('KMS');
      }
    });
  });

  describe('Global Secondary Indexes - Requirements 4.1', () => {
    it('should create email-index GSI on users table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-users',
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'email-index',
            KeySchema: Match.arrayWith([
              Match.objectLike({
                AttributeName: 'email',
                KeyType: 'HASH',
              }),
            ]),
          }),
        ]),
      });
    });

    it('should create status-index GSI on workflows table', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-test-workflows',
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'status-index',
            KeySchema: Match.arrayWith([
              Match.objectLike({
                AttributeName: 'PK',
                KeyType: 'HASH',
              }),
              Match.objectLike({
                AttributeName: 'status',
                KeyType: 'RANGE',
              }),
            ]),
          }),
        ]),
      });
    });
  });

  describe('Resource Tagging - Requirements 8.3, 15.2', () => {
    it('should apply required tags to all tables', () => {
      const tables = template.findResources('AWS::DynamoDB::Table');
      
      for (const [, resource] of Object.entries(tables)) {
        const tags = resource.Properties.Tags || [];
        const tagMap = tags.reduce((acc: Record<string, string>, tag: { Key: string; Value: string }) => {
          acc[tag.Key] = tag.Value;
          return acc;
        }, {});
        
        expect(tagMap.Environment).toBe('test');
        expect(tagMap.Project).toBe('governance-platform');
        expect(tagMap.CostCenter).toBe('test-cost-center');
      }
    });
  });

  describe('CloudFormation Outputs', () => {
    it('should export table ARNs', () => {
      template.hasOutput('TenantsTableArn', {});
      template.hasOutput('UsersTableArn', {});
      template.hasOutput('WorkflowsTableArn', {});
      template.hasOutput('CDEsTableArn', {});
      template.hasOutput('IssuesTableArn', {});
      template.hasOutput('AuditTableArn', {});
    });

    it('should export table names', () => {
      template.hasOutput('TenantsTableName', {});
      template.hasOutput('UsersTableName', {});
      template.hasOutput('WorkflowsTableName', {});
      template.hasOutput('CDEsTableName', {});
      template.hasOutput('IssuesTableName', {});
      template.hasOutput('AuditTableName', {});
    });
  });

  describe('Production Environment', () => {
    it('should set RETAIN removal policy in production', () => {
      const prodApp = new cdk.App();
      const prodBaseStack = new BaseStack(prodApp, 'ProdBaseStack', {
        environment: 'prod',
        tags: { ...testTags, Environment: 'prod' },
      });
      const prodStack = new DynamoDBStack(prodApp, 'ProdDynamoDBStack', {
        environment: 'prod',
        tags: { ...testTags, Environment: 'prod' },
        encryptionKey: prodBaseStack.encryptionKey,
      });
      const prodTemplate = Template.fromStack(prodStack);
      
      const tables = prodTemplate.findResources('AWS::DynamoDB::Table');
      for (const [, resource] of Object.entries(tables)) {
        expect(resource.DeletionPolicy).toBe('Retain');
        expect(resource.UpdateReplacePolicy).toBe('Retain');
      }
    });

    it('should enable deletion protection in production', () => {
      const prodApp = new cdk.App();
      const prodBaseStack = new BaseStack(prodApp, 'ProdBaseStack', {
        environment: 'prod',
        tags: { ...testTags, Environment: 'prod' },
      });
      const prodStack = new DynamoDBStack(prodApp, 'ProdDynamoDBStack', {
        environment: 'prod',
        tags: { ...testTags, Environment: 'prod' },
        encryptionKey: prodBaseStack.encryptionKey,
      });
      const prodTemplate = Template.fromStack(prodStack);
      
      const tables = prodTemplate.findResources('AWS::DynamoDB::Table');
      for (const [, resource] of Object.entries(tables)) {
        expect(resource.Properties.DeletionProtectionEnabled).toBe(true);
      }
    });
  });
});
