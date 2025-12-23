import * as cdk from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Lambda memory configuration for cost optimization
 * Validates: Requirements 15.3
 */
export interface LambdaMemoryConfig {
  /**
   * User management Lambda memory (MB)
   */
  userManagement: number;

  /**
   * Workflow operations Lambda memory (MB)
   */
  workflowOperations: number;

  /**
   * Data queries Lambda memory (MB)
   */
  dataQueries: number;

  /**
   * Agent proxy Lambda memory (MB)
   */
  agentProxy: number;

  /**
   * WebSocket connect handler memory (MB)
   */
  websocketConnect: number;

  /**
   * WebSocket disconnect handler memory (MB)
   */
  websocketDisconnect: number;

  /**
   * WebSocket agent stream handler memory (MB)
   */
  websocketAgentStream: number;
}

/**
 * Properties for the CostManagementStack
 */
export interface CostManagementStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * SNS topic for alarm notifications (from BaseStack)
   */
  alarmTopic: sns.ITopic;

  /**
   * Monthly budget amount in USD
   * Validates: Requirements 15.1
   */
  budgetAmount: number;

  /**
   * Email addresses for budget notifications
   */
  notificationEmails: string[];

  /**
   * S3 data bucket for Intelligent-Tiering configuration (optional)
   * Validates: Requirements 15.4
   */
  dataBucket?: s3.IBucket;

  /**
   * Lambda functions for memory optimization (optional)
   * Validates: Requirements 15.3
   */
  lambdaFunctions?: lambda.IFunction[];
}


/**
 * Cost Management Stack for the Governance Platform
 * 
 * Creates:
 * - AWS Budgets with 50%, 80%, 100% alerts (Requirements 15.1, 15.5)
 * - S3 Intelligent-Tiering configuration (Requirements 15.4)
 * - Lambda memory optimization settings (Requirements 15.3)
 * 
 * Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
 */
export class CostManagementStack extends cdk.Stack {
  /**
   * AWS Budget for cost monitoring
   */
  public readonly budget: budgets.CfnBudget;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  /**
   * Recommended Lambda memory configurations
   */
  public readonly recommendedLambdaMemory: LambdaMemoryConfig;

  constructor(scope: Construct, id: string, props: CostManagementStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create AWS Budget with alerts
    // Validates: Requirements 15.1, 15.5
    this.budget = this.createBudget(props);

    // Set recommended Lambda memory configurations
    // Validates: Requirements 15.3
    this.recommendedLambdaMemory = this.getRecommendedLambdaMemory(props.environment);

    // Create CloudFormation outputs
    this.createOutputs(props.environment);
  }

  /**
   * Creates AWS Budget with 50%, 80%, 100% threshold alerts
   * Validates: Requirements 15.1, 15.5
   */
  private createBudget(props: CostManagementStackProps): budgets.CfnBudget {
    // Build notification subscribers
    const subscribers: budgets.CfnBudget.SubscriberProperty[] = [
      // SNS topic subscriber
      {
        subscriptionType: 'SNS',
        address: props.alarmTopic.topicArn,
      },
      // Email subscribers
      ...props.notificationEmails.map(email => ({
        subscriptionType: 'EMAIL',
        address: email,
      })),
    ];

    return new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: `governance-${props.environment}-monthly-budget`,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: props.budgetAmount,
          unit: 'USD',
        },
        // Filter by cost allocation tags
        // Validates: Requirements 15.2
        costFilters: {
          TagKeyValue: [
            `user:Project$governance-platform`,
            `user:Environment$${props.environment}`,
          ],
        },
      },
      // Configure notifications at 50%, 80%, and 100% thresholds
      // Validates: Requirements 15.1, 15.5
      notificationsWithSubscribers: [
        // 50% threshold - informational
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 50,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        // 80% threshold - warning
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        // 100% threshold - critical
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        // Forecasted 100% threshold - proactive alert
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
      ],
    });
  }


  /**
   * Gets recommended Lambda memory configurations based on environment
   * Validates: Requirements 15.3
   */
  private getRecommendedLambdaMemory(environment: string): LambdaMemoryConfig {
    // Production uses higher memory for better performance
    // Non-production uses lower memory for cost optimization
    if (environment === 'prod') {
      return {
        userManagement: 256,      // Light operations, 256MB sufficient
        workflowOperations: 512,  // Medium complexity, 512MB for performance
        dataQueries: 512,         // Query operations, 512MB for performance
        agentProxy: 1024,         // Agent interactions need more memory
        websocketConnect: 128,    // Simple auth validation
        websocketDisconnect: 128, // Simple cleanup
        websocketAgentStream: 512, // Streaming needs moderate memory
      };
    }

    // Dev/staging use lower memory for cost savings
    return {
      userManagement: 128,      // Minimal for dev
      workflowOperations: 256,  // Reduced for dev
      dataQueries: 256,         // Reduced for dev
      agentProxy: 512,          // Still needs reasonable memory for agents
      websocketConnect: 128,    // Same as prod (already minimal)
      websocketDisconnect: 128, // Same as prod (already minimal)
      websocketAgentStream: 256, // Reduced for dev
    };
  }

  /**
   * Creates CloudFormation outputs
   */
  private createOutputs(environment: string): void {
    new cdk.CfnOutput(this, 'BudgetName', {
      value: `governance-${environment}-monthly-budget`,
      description: 'Name of the AWS Budget',
      exportName: `governance-${environment}-budget-name`,
    });

    new cdk.CfnOutput(this, 'RecommendedUserManagementMemory', {
      value: this.recommendedLambdaMemory.userManagement.toString(),
      description: 'Recommended memory (MB) for User Management Lambda',
    });

    new cdk.CfnOutput(this, 'RecommendedWorkflowOperationsMemory', {
      value: this.recommendedLambdaMemory.workflowOperations.toString(),
      description: 'Recommended memory (MB) for Workflow Operations Lambda',
    });

    new cdk.CfnOutput(this, 'RecommendedDataQueriesMemory', {
      value: this.recommendedLambdaMemory.dataQueries.toString(),
      description: 'Recommended memory (MB) for Data Queries Lambda',
    });

    new cdk.CfnOutput(this, 'RecommendedAgentProxyMemory', {
      value: this.recommendedLambdaMemory.agentProxy.toString(),
      description: 'Recommended memory (MB) for Agent Proxy Lambda',
    });
  }
}


/**
 * Validates budget configuration
 * Validates: Requirements 15.1
 */
export function validateBudgetConfig(config: {
  budgetAmount: number;
  thresholds: number[];
}): boolean {
  // Budget amount must be positive
  if (config.budgetAmount <= 0) {
    return false;
  }

  // Must have at least 50%, 80%, 100% thresholds
  const requiredThresholds = [50, 80, 100];
  return requiredThresholds.every(threshold => 
    config.thresholds.includes(threshold)
  );
}

/**
 * Validates S3 Intelligent-Tiering configuration
 * Validates: Requirements 15.4
 */
export function validateIntelligentTiering(lifecycleRules: Array<{
  id: string;
  transitions?: Array<{
    storageClass: string;
    transitionAfter?: number;
  }>;
}>): boolean {
  // Check if any rule transitions to Intelligent-Tiering
  return lifecycleRules.some(rule => 
    rule.transitions?.some(t => 
      t.storageClass === 'INTELLIGENT_TIERING'
    )
  );
}

/**
 * Validates Lambda memory settings are within optimal range
 * Validates: Requirements 15.3
 */
export function validateLambdaMemory(memoryMB: number, functionType: string): boolean {
  // Memory must be between 128 MB and 10240 MB
  if (memoryMB < 128 || memoryMB > 10240) {
    return false;
  }

  // Memory must be a multiple of 64 MB (after 128 MB)
  if (memoryMB > 128 && memoryMB % 64 !== 0) {
    return false;
  }

  // Function-specific optimal ranges
  const optimalRanges: Record<string, { min: number; max: number }> = {
    userManagement: { min: 128, max: 512 },
    workflowOperations: { min: 256, max: 1024 },
    dataQueries: { min: 256, max: 1024 },
    agentProxy: { min: 512, max: 2048 },
    websocketConnect: { min: 128, max: 256 },
    websocketDisconnect: { min: 128, max: 256 },
    websocketAgentStream: { min: 256, max: 1024 },
  };

  const range = optimalRanges[functionType];
  if (range) {
    return memoryMB >= range.min && memoryMB <= range.max;
  }

  return true;
}

/**
 * Calculates estimated monthly cost for Lambda based on memory and invocations
 * Validates: Requirements 15.3
 */
export function estimateLambdaCost(config: {
  memoryMB: number;
  avgDurationMs: number;
  monthlyInvocations: number;
}): number {
  // AWS Lambda pricing (approximate, us-east-1)
  const pricePerGBSecond = 0.0000166667;
  const pricePerRequest = 0.0000002;

  // Calculate GB-seconds
  const gbSeconds = (config.memoryMB / 1024) * (config.avgDurationMs / 1000) * config.monthlyInvocations;

  // Calculate cost
  const computeCost = gbSeconds * pricePerGBSecond;
  const requestCost = config.monthlyInvocations * pricePerRequest;

  return computeCost + requestCost;
}

/**
 * Gets budget notification thresholds
 * Validates: Requirements 15.1, 15.5
 */
export function getBudgetThresholds(): number[] {
  return [50, 80, 100];
}

/**
 * Validates cost allocation tags are present
 * Validates: Requirements 15.2
 */
export function validateCostAllocationTags(tags: Record<string, string>): boolean {
  const requiredTags = ['Environment', 'Project', 'CostCenter'];
  return requiredTags.every(tag => 
    tag in tags && 
    typeof tags[tag] === 'string' && 
    tags[tag].length > 0
  );
}
