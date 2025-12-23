import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the DynamoDBStack
 */
export interface DynamoDBStackProps extends cdk.StackProps {
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
 * DynamoDB table configuration interface
 */
export interface TableConfig {
  tableName: string;
  partitionKey: { name: string; type: dynamodb.AttributeType };
  sortKey?: { name: string; type: dynamodb.AttributeType };
  globalSecondaryIndexes?: GSIConfig[];
}

/**
 * Global Secondary Index configuration
 */
export interface GSIConfig {
  indexName: string;
  partitionKey: { name: string; type: dynamodb.AttributeType };
  sortKey?: { name: string; type: dynamodb.AttributeType };
}

/**
 * DynamoDB Stack for the Governance Platform
 * 
 * Creates DynamoDB tables with tenant isolation:
 * - Tenants table
 * - Users table (with email-index GSI)
 * - Workflows table (with status-index GSI)
 * - CDEs table
 * - Issues table
 * - Audit logs table
 * 
 * All tables use:
 * - Partition key with tenant prefix for isolation (Requirements 4.2, 4.3)
 * - Point-in-time recovery enabled (Requirements 4.4)
 * - On-demand capacity mode (Requirements 4.5)
 * - KMS encryption with customer-managed key (Requirements 13.5)
 * 
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
 */
export class DynamoDBStack extends cdk.Stack {
  /**
   * Tenants table
   */
  public readonly tenantsTable: dynamodb.Table;

  /**
   * Users table
   */
  public readonly usersTable: dynamodb.Table;

  /**
   * Workflows table
   */
  public readonly workflowsTable: dynamodb.Table;

  /**
   * CDEs table
   */
  public readonly cdesTable: dynamodb.Table;

  /**
   * Issues table
   */
  public readonly issuesTable: dynamodb.Table;

  /**
   * Audit logs table
   */
  public readonly auditTable: dynamodb.Table;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // Create Tenants table
    // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
    this.tenantsTable = this.createTable('Tenants', {
      tableName: `governance-${props.environment}-tenants`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    }, props.encryptionKey, removalPolicy);

    // Create Users table with email-index GSI
    // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
    this.usersTable = this.createTable('Users', {
      tableName: `governance-${props.environment}-users`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'email-index',
          partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
        },
      ],
    }, props.encryptionKey, removalPolicy);

    // Create Workflows table with status-index GSI
    // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
    this.workflowsTable = this.createTable('Workflows', {
      tableName: `governance-${props.environment}-workflows`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      globalSecondaryIndexes: [
        {
          indexName: 'status-index',
          partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
        },
      ],
    }, props.encryptionKey, removalPolicy);

    // Create CDEs table
    // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
    this.cdesTable = this.createTable('CDEs', {
      tableName: `governance-${props.environment}-cdes`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    }, props.encryptionKey, removalPolicy);

    // Create Issues table
    // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
    this.issuesTable = this.createTable('Issues', {
      tableName: `governance-${props.environment}-issues`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    }, props.encryptionKey, removalPolicy);

    // Create Audit logs table
    // Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 13.5
    this.auditTable = this.createTable('Audit', {
      tableName: `governance-${props.environment}-audit`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
    }, props.encryptionKey, removalPolicy);

    // Output table ARNs for use in other stacks
    this.createOutputs(props.environment);
  }

  /**
   * Creates a DynamoDB table with standard configuration
   */
  private createTable(
    logicalId: string,
    config: TableConfig,
    encryptionKey: kms.IKey,
    removalPolicy: cdk.RemovalPolicy
  ): dynamodb.Table {
    const table = new dynamodb.Table(this, `${logicalId}Table`, {
      tableName: config.tableName,
      partitionKey: config.partitionKey,
      sortKey: config.sortKey,
      // On-demand capacity mode for automatic scaling
      // Validates: Requirements 4.5
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Point-in-time recovery enabled
      // Validates: Requirements 4.4
      pointInTimeRecovery: true,
      // KMS encryption with customer-managed key
      // Validates: Requirements 13.5
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: encryptionKey,
      removalPolicy: removalPolicy,
      // Enable deletion protection in production
      deletionProtection: removalPolicy === cdk.RemovalPolicy.RETAIN,
    });

    // Add Global Secondary Indexes if configured
    if (config.globalSecondaryIndexes) {
      for (const gsi of config.globalSecondaryIndexes) {
        table.addGlobalSecondaryIndex({
          indexName: gsi.indexName,
          partitionKey: gsi.partitionKey,
          sortKey: gsi.sortKey,
          projectionType: dynamodb.ProjectionType.ALL,
        });
      }
    }

    return table;
  }

  /**
   * Creates CloudFormation outputs for table ARNs
   */
  private createOutputs(environment: string): void {
    new cdk.CfnOutput(this, 'TenantsTableArn', {
      value: this.tenantsTable.tableArn,
      description: 'ARN of the Tenants DynamoDB table',
      exportName: `governance-${environment}-tenants-table-arn`,
    });

    new cdk.CfnOutput(this, 'UsersTableArn', {
      value: this.usersTable.tableArn,
      description: 'ARN of the Users DynamoDB table',
      exportName: `governance-${environment}-users-table-arn`,
    });

    new cdk.CfnOutput(this, 'WorkflowsTableArn', {
      value: this.workflowsTable.tableArn,
      description: 'ARN of the Workflows DynamoDB table',
      exportName: `governance-${environment}-workflows-table-arn`,
    });

    new cdk.CfnOutput(this, 'CDEsTableArn', {
      value: this.cdesTable.tableArn,
      description: 'ARN of the CDEs DynamoDB table',
      exportName: `governance-${environment}-cdes-table-arn`,
    });

    new cdk.CfnOutput(this, 'IssuesTableArn', {
      value: this.issuesTable.tableArn,
      description: 'ARN of the Issues DynamoDB table',
      exportName: `governance-${environment}-issues-table-arn`,
    });

    new cdk.CfnOutput(this, 'AuditTableArn', {
      value: this.auditTable.tableArn,
      description: 'ARN of the Audit DynamoDB table',
      exportName: `governance-${environment}-audit-table-arn`,
    });

    new cdk.CfnOutput(this, 'TenantsTableName', {
      value: this.tenantsTable.tableName,
      description: 'Name of the Tenants DynamoDB table',
      exportName: `governance-${environment}-tenants-table-name`,
    });

    new cdk.CfnOutput(this, 'UsersTableName', {
      value: this.usersTable.tableName,
      description: 'Name of the Users DynamoDB table',
      exportName: `governance-${environment}-users-table-name`,
    });

    new cdk.CfnOutput(this, 'WorkflowsTableName', {
      value: this.workflowsTable.tableName,
      description: 'Name of the Workflows DynamoDB table',
      exportName: `governance-${environment}-workflows-table-name`,
    });

    new cdk.CfnOutput(this, 'CDEsTableName', {
      value: this.cdesTable.tableName,
      description: 'Name of the CDEs DynamoDB table',
      exportName: `governance-${environment}-cdes-table-name`,
    });

    new cdk.CfnOutput(this, 'IssuesTableName', {
      value: this.issuesTable.tableName,
      description: 'Name of the Issues DynamoDB table',
      exportName: `governance-${environment}-issues-table-name`,
    });

    new cdk.CfnOutput(this, 'AuditTableName', {
      value: this.auditTable.tableName,
      description: 'Name of the Audit DynamoDB table',
      exportName: `governance-${environment}-audit-table-name`,
    });
  }
}


/**
 * Validates that a partition key follows the tenant isolation pattern
 * Pattern: TENANT#<tenant_id> or <ENTITY_TYPE>#<tenant_id>#<entity_id>
 * 
 * **Feature: private-aws-deployment, Property 5: Tenant Data Isolation**
 * For any DynamoDB write operation, the partition key SHALL include the tenant_id.
 * 
 * Validates: Requirements 4.2, 4.3
 */
export function validateTenantPartitionKey(partitionKey: string): boolean {
  if (!partitionKey || typeof partitionKey !== 'string') {
    return false;
  }
  
  // Check if the partition key starts with TENANT# prefix
  if (partitionKey.startsWith('TENANT#')) {
    const tenantId = partitionKey.substring(7); // Remove 'TENANT#' prefix
    return tenantId.length > 0;
  }
  
  return false;
}

/**
 * Creates a tenant-scoped partition key
 * 
 * Validates: Requirements 4.2, 4.3
 */
export function createTenantPartitionKey(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
    throw new Error('tenantId is required and must be a non-empty string');
  }
  return `TENANT#${tenantId}`;
}

/**
 * Extracts tenant ID from a partition key
 * Returns null if the partition key doesn't follow the tenant pattern
 * 
 * Validates: Requirements 4.2, 4.3
 */
export function extractTenantIdFromPartitionKey(partitionKey: string): string | null {
  if (!validateTenantPartitionKey(partitionKey)) {
    return null;
  }
  return partitionKey.substring(7); // Remove 'TENANT#' prefix
}

/**
 * Creates a sort key for different entity types
 * 
 * Validates: Requirements 4.1
 */
export function createSortKey(entityType: string, entityId: string): string {
  if (!entityType || !entityId) {
    throw new Error('entityType and entityId are required');
  }
  return `${entityType.toUpperCase()}#${entityId}`;
}

/**
 * Table names for the governance platform
 */
export const TABLE_NAMES = {
  TENANTS: 'tenants',
  USERS: 'users',
  WORKFLOWS: 'workflows',
  CDES: 'cdes',
  ISSUES: 'issues',
  AUDIT: 'audit',
} as const;

/**
 * Entity types for sort keys
 */
export const ENTITY_TYPES = {
  METADATA: 'METADATA',
  USER: 'USER',
  WORKFLOW: 'WORKFLOW',
  CDE: 'CDE',
  ISSUE: 'ISSUE',
  AUDIT: 'AUDIT',
} as const;
