import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { BackupDRStack } from '../../lib/stacks/backup-dr-stack.js';
import { BaseStack } from '../../lib/stacks/base-stack.js';
import { DynamoDBStack } from '../../lib/stacks/dynamodb-stack.js';
import { ResourceTags } from '../../lib/config/environment.js';

describe('BackupDRStack', () => {
  let app: cdk.App;
  let baseStack: BaseStack;
  let dynamoDBStack: DynamoDBStack;
  let backupDRStack: BackupDRStack;
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

    // Create DynamoDB stack to get tables
    dynamoDBStack = new DynamoDBStack(app, 'TestDynamoDBStack', {
      environment: 'test',
      tags: testTags,
      encryptionKey: baseStack.encryptionKey,
    });

    // Create Backup DR stack
    backupDRStack = new BackupDRStack(app, 'TestBackupDRStack', {
      environment: 'test',
      tags: testTags,
      encryptionKey: baseStack.encryptionKey,
      dynamoDBTables: [
        dynamoDBStack.tenantsTable,
        dynamoDBStack.usersTable,
        dynamoDBStack.workflowsTable,
        dynamoDBStack.cdesTable,
        dynamoDBStack.issuesTable,
        dynamoDBStack.auditTable,
      ],
      secondaryRegion: 'us-east-1',
    });

    template = Template.fromStack(backupDRStack);
  });

  describe('AWS Backup Vault - Requirements 12.1, 12.5', () => {
    it('should create a backup vault', () => {
      template.hasResourceProperties('AWS::Backup::BackupVault', {
        BackupVaultName: 'governance-test-backup-vault',
      });
    });

    it('should configure KMS encryption for backup vault', () => {
      template.hasResourceProperties('AWS::Backup::BackupVault', {
        EncryptionKeyArn: Match.anyValue(),
      });
    });
  });

  describe('AWS Backup Plan - Requirements 12.1', () => {
    it('should create a backup plan', () => {
      template.hasResourceProperties('AWS::Backup::BackupPlan', {
        BackupPlan: Match.objectLike({
          BackupPlanName: 'governance-test-backup-plan',
        }),
      });
    });

    it('should configure daily backup rule', () => {
      template.hasResourceProperties('AWS::Backup::BackupPlan', {
        BackupPlan: Match.objectLike({
          BackupPlanRule: Match.arrayWith([
            Match.objectLike({
              RuleName: 'DailyBackup',
              ScheduleExpression: Match.stringLikeRegexp('cron.*'),
            }),
          ]),
        }),
      });
    });

    it('should configure 35-day retention for daily backups', () => {
      template.hasResourceProperties('AWS::Backup::BackupPlan', {
        BackupPlan: Match.objectLike({
          BackupPlanRule: Match.arrayWith([
            Match.objectLike({
              RuleName: 'DailyBackup',
              Lifecycle: Match.objectLike({
                DeleteAfterDays: 35,
              }),
            }),
          ]),
        }),
      });
    });

    it('should enable continuous backup for PITR', () => {
      template.hasResourceProperties('AWS::Backup::BackupPlan', {
        BackupPlan: Match.objectLike({
          BackupPlanRule: Match.arrayWith([
            Match.objectLike({
              RuleName: 'DailyBackup',
              EnableContinuousBackup: true,
            }),
          ]),
        }),
      });
    });
  });

  describe('Backup Selection - Requirements 12.1', () => {
    it('should create backup selections for DynamoDB tables', () => {
      // Should have 6 backup selections (one for each table)
      template.resourceCountIs('AWS::Backup::BackupSelection', 6);
    });

    it('should allow restores for backup selections', () => {
      const selections = template.findResources('AWS::Backup::BackupSelection');
      for (const [, resource] of Object.entries(selections)) {
        expect(resource.Properties.BackupPlanId).toBeDefined();
      }
    });
  });

  describe('S3 Data Bucket - Requirements 12.2', () => {
    it('should create exactly 2 S3 buckets (data and replica)', () => {
      template.resourceCountIs('AWS::S3::Bucket', 2);
    });

    it('should enable versioning on all buckets', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      for (const [, resource] of Object.entries(buckets)) {
        expect(resource.Properties.VersioningConfiguration).toEqual({
          Status: 'Enabled',
        });
      }
    });

    it('should configure lifecycle rules for old versions on data bucket', () => {
      // Find the data bucket (has ReplicationConfiguration)
      const buckets = template.findResources('AWS::S3::Bucket');
      const dataBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration !== undefined
      );
      
      expect(dataBucket).toBeDefined();
      const lifecycleRules = dataBucket!.Properties.LifecycleConfiguration.Rules;
      const deleteOldVersionsRule = lifecycleRules.find(
        (r: { Id: string }) => r.Id === 'DeleteOldVersions'
      );
      
      expect(deleteOldVersionsRule).toBeDefined();
      expect(deleteOldVersionsRule.Status).toBe('Enabled');
      expect(deleteOldVersionsRule.NoncurrentVersionExpiration.NoncurrentDays).toBe(90);
    });

    it('should configure transition to Intelligent-Tiering on data bucket', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const dataBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration !== undefined
      );
      
      expect(dataBucket).toBeDefined();
      const lifecycleRules = dataBucket!.Properties.LifecycleConfiguration.Rules;
      const transitionRule = lifecycleRules.find(
        (r: { Id: string }) => r.Id === 'TransitionToIntelligentTiering'
      );
      
      expect(transitionRule).toBeDefined();
      expect(transitionRule.Status).toBe('Enabled');
      expect(transitionRule.Transitions[0].StorageClass).toBe('INTELLIGENT_TIERING');
      expect(transitionRule.Transitions[0].TransitionInDays).toBe(30);
    });

    it('should block public access on all buckets', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      for (const [, resource] of Object.entries(buckets)) {
        expect(resource.Properties.PublicAccessBlockConfiguration).toEqual({
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        });
      }
    });

    it('should configure KMS encryption on all buckets', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      for (const [, resource] of Object.entries(buckets)) {
        const sseConfig = resource.Properties.BucketEncryption.ServerSideEncryptionConfiguration;
        expect(sseConfig).toBeDefined();
        expect(sseConfig[0].ServerSideEncryptionByDefault.SSEAlgorithm).toBe('aws:kms');
      }
    });
  });


  describe('S3 Replica Bucket - Requirements 12.3', () => {
    it('should create a replica bucket without replication configuration', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const replicaBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration === undefined
      );
      
      expect(replicaBucket).toBeDefined();
    });

    it('should enable versioning on replica bucket', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const replicaBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration === undefined
      );
      
      expect(replicaBucket).toBeDefined();
      expect(replicaBucket!.Properties.VersioningConfiguration).toEqual({
        Status: 'Enabled',
      });
    });

    it('should configure KMS encryption on replica bucket', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const replicaBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration === undefined
      );
      
      expect(replicaBucket).toBeDefined();
      const sseConfig = replicaBucket!.Properties.BucketEncryption.ServerSideEncryptionConfiguration;
      expect(sseConfig[0].ServerSideEncryptionByDefault.SSEAlgorithm).toBe('aws:kms');
    });

    it('should configure lifecycle rules on replica bucket', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const replicaBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration === undefined
      );
      
      expect(replicaBucket).toBeDefined();
      const lifecycleRules = replicaBucket!.Properties.LifecycleConfiguration.Rules;
      const transitionRule = lifecycleRules.find(
        (r: { Id: string }) => r.Id === 'TransitionToIA'
      );
      
      expect(transitionRule).toBeDefined();
      expect(transitionRule.Status).toBe('Enabled');
    });
  });

  describe('Cross-Region Replication - Requirements 12.3', () => {
    it('should create replication IAM role', () => {
      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'governance-test-replication-role',
        AssumeRolePolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Principal: {
                Service: 's3.amazonaws.com',
              },
            }),
          ]),
        }),
      });
    });

    it('should configure replication rules on data bucket', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const dataBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration !== undefined
      );
      
      expect(dataBucket).toBeDefined();
      const replicationConfig = dataBucket!.Properties.ReplicationConfiguration;
      expect(replicationConfig.Role).toBeDefined();
      expect(replicationConfig.Rules).toBeDefined();
      expect(replicationConfig.Rules.length).toBeGreaterThan(0);
    });

    it('should configure replication for critical data', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const dataBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration !== undefined
      );
      
      expect(dataBucket).toBeDefined();
      const rules = dataBucket!.Properties.ReplicationConfiguration.Rules;
      const criticalRule = rules.find(
        (r: { Id: string }) => r.Id === 'CriticalDataReplication'
      );
      
      expect(criticalRule).toBeDefined();
      expect(criticalRule.Status).toBe('Enabled');
      expect(criticalRule.Filter.Prefix).toBe('critical/');
    });

    it('should configure replication for audit data', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const dataBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration !== undefined
      );
      
      expect(dataBucket).toBeDefined();
      const rules = dataBucket!.Properties.ReplicationConfiguration.Rules;
      const auditRule = rules.find(
        (r: { Id: string }) => r.Id === 'AuditDataReplication'
      );
      
      expect(auditRule).toBeDefined();
      expect(auditRule.Status).toBe('Enabled');
      expect(auditRule.Filter.Prefix).toBe('audit/');
    });

    it('should configure delete marker replication', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      const dataBucket = Object.values(buckets).find(
        (b) => b.Properties.ReplicationConfiguration !== undefined
      );
      
      expect(dataBucket).toBeDefined();
      const rules = dataBucket!.Properties.ReplicationConfiguration.Rules;
      
      for (const rule of rules) {
        expect(rule.DeleteMarkerReplication.Status).toBe('Enabled');
      }
    });
  });


  describe('Resource Tagging - Requirements 8.3, 15.2', () => {
    it('should apply required tags to S3 buckets', () => {
      const buckets = template.findResources('AWS::S3::Bucket');
      
      for (const [, resource] of Object.entries(buckets)) {
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
    it('should export backup vault ARN', () => {
      template.hasOutput('BackupVaultArn', {});
    });

    it('should export backup vault name', () => {
      template.hasOutput('BackupVaultName', {});
    });

    it('should export backup plan ID', () => {
      template.hasOutput('BackupPlanId', {});
    });

    it('should export data bucket ARN', () => {
      template.hasOutput('DataBucketArn', {});
    });

    it('should export data bucket name', () => {
      template.hasOutput('DataBucketName', {});
    });

    it('should export replica bucket ARN', () => {
      template.hasOutput('ReplicaBucketArn', {});
    });

    it('should export replica bucket name', () => {
      template.hasOutput('ReplicaBucketName', {});
    });
  });

  describe('Production Environment', () => {
    let prodTemplate: Template;

    beforeEach(() => {
      const prodApp = new cdk.App();
      const prodTags = { ...testTags, Environment: 'prod' };
      
      const prodBaseStack = new BaseStack(prodApp, 'ProdBaseStack', {
        environment: 'prod',
        tags: prodTags,
      });

      const prodDynamoDBStack = new DynamoDBStack(prodApp, 'ProdDynamoDBStack', {
        environment: 'prod',
        tags: prodTags,
        encryptionKey: prodBaseStack.encryptionKey,
      });

      const prodBackupDRStack = new BackupDRStack(prodApp, 'ProdBackupDRStack', {
        environment: 'prod',
        tags: prodTags,
        encryptionKey: prodBaseStack.encryptionKey,
        dynamoDBTables: [
          prodDynamoDBStack.tenantsTable,
          prodDynamoDBStack.usersTable,
          prodDynamoDBStack.workflowsTable,
          prodDynamoDBStack.cdesTable,
          prodDynamoDBStack.issuesTable,
          prodDynamoDBStack.auditTable,
        ],
        secondaryRegion: 'us-east-1',
      });

      prodTemplate = Template.fromStack(prodBackupDRStack);
    });

    it('should configure weekly backup rule in production', () => {
      prodTemplate.hasResourceProperties('AWS::Backup::BackupPlan', {
        BackupPlan: Match.objectLike({
          BackupPlanRule: Match.arrayWith([
            Match.objectLike({
              RuleName: 'WeeklyBackup',
            }),
          ]),
        }),
      });
    });

    it('should set RETAIN removal policy for backup vault in production', () => {
      const vaults = prodTemplate.findResources('AWS::Backup::BackupVault');
      for (const [, resource] of Object.entries(vaults)) {
        expect(resource.DeletionPolicy).toBe('Retain');
      }
    });

    it('should set RETAIN removal policy for S3 buckets in production', () => {
      const buckets = prodTemplate.findResources('AWS::S3::Bucket');
      for (const [, resource] of Object.entries(buckets)) {
        expect(resource.DeletionPolicy).toBe('Retain');
      }
    });
  });
});
