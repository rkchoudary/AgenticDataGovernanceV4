import { describe, it, expect, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CostManagementStack } from '../../lib/stacks/cost-management-stack.js';
import { BaseStack } from '../../lib/stacks/base-stack.js';
import { ResourceTags } from '../../lib/config/environment.js';
import {
  validateBudgetConfig,
  validateIntelligentTiering,
  validateLambdaMemory,
  estimateLambdaCost,
  getBudgetThresholds,
  validateCostAllocationTags,
} from '../../lib/stacks/cost-management-stack.js';

describe('CostManagementStack', () => {
  let app: cdk.App;
  let baseStack: BaseStack;
  let costManagementStack: CostManagementStack;
  let template: Template;
  const testTags: ResourceTags = {
    Environment: 'test',
    Project: 'governance-platform',
    CostCenter: 'test-cost-center',
  };

  beforeEach(() => {
    app = new cdk.App();

    // Create base stack to get the alarm topic
    baseStack = new BaseStack(app, 'TestBaseStack', {
      environment: 'test',
      tags: testTags,
    });

    // Create cost management stack
    costManagementStack = new CostManagementStack(app, 'TestCostManagementStack', {
      environment: 'test',
      tags: testTags,
      alarmTopic: baseStack.alarmTopic,
      budgetAmount: 1000,
      notificationEmails: ['admin@example.com'],
    });

    template = Template.fromStack(costManagementStack);
  });

  describe('AWS Budget - Requirements 15.1, 15.5', () => {
    it('should create a budget with correct name', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          BudgetName: 'governance-test-monthly-budget',
        }),
      });
    });

    it('should configure budget type as COST', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          BudgetType: 'COST',
        }),
      });
    });

    it('should configure budget time unit as MONTHLY', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          TimeUnit: 'MONTHLY',
        }),
      });
    });

    it('should configure budget limit amount', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          BudgetLimit: Match.objectLike({
            Amount: 1000,
            Unit: 'USD',
          }),
        }),
      });
    });
  });


  describe('Budget Notifications - Requirements 15.1, 15.5', () => {
    it('should configure 50% threshold notification', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Notification: Match.objectLike({
              NotificationType: 'ACTUAL',
              ComparisonOperator: 'GREATER_THAN',
              Threshold: 50,
              ThresholdType: 'PERCENTAGE',
            }),
          }),
        ]),
      });
    });

    it('should configure 80% threshold notification', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Notification: Match.objectLike({
              NotificationType: 'ACTUAL',
              ComparisonOperator: 'GREATER_THAN',
              Threshold: 80,
              ThresholdType: 'PERCENTAGE',
            }),
          }),
        ]),
      });
    });

    it('should configure 100% threshold notification', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Notification: Match.objectLike({
              NotificationType: 'ACTUAL',
              ComparisonOperator: 'GREATER_THAN',
              Threshold: 100,
              ThresholdType: 'PERCENTAGE',
            }),
          }),
        ]),
      });
    });

    it('should configure forecasted 100% threshold notification', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Notification: Match.objectLike({
              NotificationType: 'FORECASTED',
              ComparisonOperator: 'GREATER_THAN',
              Threshold: 100,
              ThresholdType: 'PERCENTAGE',
            }),
          }),
        ]),
      });
    });

    it('should configure SNS subscriber for notifications', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Subscribers: Match.arrayWith([
              Match.objectLike({
                SubscriptionType: 'SNS',
              }),
            ]),
          }),
        ]),
      });
    });

    it('should configure email subscriber for notifications', () => {
      template.hasResourceProperties('AWS::Budgets::Budget', {
        NotificationsWithSubscribers: Match.arrayWith([
          Match.objectLike({
            Subscribers: Match.arrayWith([
              Match.objectLike({
                SubscriptionType: 'EMAIL',
                Address: 'admin@example.com',
              }),
            ]),
          }),
        ]),
      });
    });
  });


  describe('Lambda Memory Recommendations - Requirements 15.3', () => {
    it('should provide recommended memory for user management Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.userManagement).toBeGreaterThanOrEqual(128);
      expect(costManagementStack.recommendedLambdaMemory.userManagement).toBeLessThanOrEqual(512);
    });

    it('should provide recommended memory for workflow operations Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.workflowOperations).toBeGreaterThanOrEqual(256);
      expect(costManagementStack.recommendedLambdaMemory.workflowOperations).toBeLessThanOrEqual(1024);
    });

    it('should provide recommended memory for data queries Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.dataQueries).toBeGreaterThanOrEqual(256);
      expect(costManagementStack.recommendedLambdaMemory.dataQueries).toBeLessThanOrEqual(1024);
    });

    it('should provide recommended memory for agent proxy Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.agentProxy).toBeGreaterThanOrEqual(512);
      expect(costManagementStack.recommendedLambdaMemory.agentProxy).toBeLessThanOrEqual(2048);
    });

    it('should provide recommended memory for WebSocket connect Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.websocketConnect).toBeGreaterThanOrEqual(128);
      expect(costManagementStack.recommendedLambdaMemory.websocketConnect).toBeLessThanOrEqual(256);
    });

    it('should provide recommended memory for WebSocket disconnect Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.websocketDisconnect).toBeGreaterThanOrEqual(128);
      expect(costManagementStack.recommendedLambdaMemory.websocketDisconnect).toBeLessThanOrEqual(256);
    });

    it('should provide recommended memory for WebSocket agent stream Lambda', () => {
      expect(costManagementStack.recommendedLambdaMemory.websocketAgentStream).toBeGreaterThanOrEqual(256);
      expect(costManagementStack.recommendedLambdaMemory.websocketAgentStream).toBeLessThanOrEqual(1024);
    });
  });

  describe('Production Environment', () => {
    let prodTemplate: Template;
    let prodStack: CostManagementStack;

    beforeEach(() => {
      const prodApp = new cdk.App();
      const prodTags = { ...testTags, Environment: 'prod' };

      const prodBaseStack = new BaseStack(prodApp, 'ProdBaseStack', {
        environment: 'prod',
        tags: prodTags,
      });

      prodStack = new CostManagementStack(prodApp, 'ProdCostManagementStack', {
        environment: 'prod',
        tags: prodTags,
        alarmTopic: prodBaseStack.alarmTopic,
        budgetAmount: 5000,
        notificationEmails: ['admin@example.com', 'finance@example.com'],
      });

      prodTemplate = Template.fromStack(prodStack);
    });

    it('should configure higher budget amount for production', () => {
      prodTemplate.hasResourceProperties('AWS::Budgets::Budget', {
        Budget: Match.objectLike({
          BudgetLimit: Match.objectLike({
            Amount: 5000,
          }),
        }),
      });
    });

    it('should use higher memory recommendations for production', () => {
      expect(prodStack.recommendedLambdaMemory.userManagement).toBe(256);
      expect(prodStack.recommendedLambdaMemory.workflowOperations).toBe(512);
      expect(prodStack.recommendedLambdaMemory.dataQueries).toBe(512);
      expect(prodStack.recommendedLambdaMemory.agentProxy).toBe(1024);
    });
  });


  describe('CloudFormation Outputs', () => {
    it('should export budget name', () => {
      template.hasOutput('BudgetName', {});
    });

    it('should export recommended user management memory', () => {
      template.hasOutput('RecommendedUserManagementMemory', {});
    });

    it('should export recommended workflow operations memory', () => {
      template.hasOutput('RecommendedWorkflowOperationsMemory', {});
    });

    it('should export recommended data queries memory', () => {
      template.hasOutput('RecommendedDataQueriesMemory', {});
    });

    it('should export recommended agent proxy memory', () => {
      template.hasOutput('RecommendedAgentProxyMemory', {});
    });
  });
});

describe('Cost Management Helper Functions', () => {
  describe('validateBudgetConfig - Requirements 15.1', () => {
    it('should return true for valid budget configuration', () => {
      const result = validateBudgetConfig({
        budgetAmount: 1000,
        thresholds: [50, 80, 100],
      });
      expect(result).toBe(true);
    });

    it('should return false for zero budget amount', () => {
      const result = validateBudgetConfig({
        budgetAmount: 0,
        thresholds: [50, 80, 100],
      });
      expect(result).toBe(false);
    });

    it('should return false for negative budget amount', () => {
      const result = validateBudgetConfig({
        budgetAmount: -100,
        thresholds: [50, 80, 100],
      });
      expect(result).toBe(false);
    });

    it('should return false for missing 50% threshold', () => {
      const result = validateBudgetConfig({
        budgetAmount: 1000,
        thresholds: [80, 100],
      });
      expect(result).toBe(false);
    });

    it('should return false for missing 80% threshold', () => {
      const result = validateBudgetConfig({
        budgetAmount: 1000,
        thresholds: [50, 100],
      });
      expect(result).toBe(false);
    });

    it('should return false for missing 100% threshold', () => {
      const result = validateBudgetConfig({
        budgetAmount: 1000,
        thresholds: [50, 80],
      });
      expect(result).toBe(false);
    });

    it('should return true with additional thresholds', () => {
      const result = validateBudgetConfig({
        budgetAmount: 1000,
        thresholds: [25, 50, 75, 80, 90, 100],
      });
      expect(result).toBe(true);
    });
  });


  describe('validateIntelligentTiering - Requirements 15.4', () => {
    it('should return true when Intelligent-Tiering is configured', () => {
      const result = validateIntelligentTiering([
        {
          id: 'TransitionToIntelligentTiering',
          transitions: [
            { storageClass: 'INTELLIGENT_TIERING', transitionAfter: 30 },
          ],
        },
      ]);
      expect(result).toBe(true);
    });

    it('should return false when no Intelligent-Tiering is configured', () => {
      const result = validateIntelligentTiering([
        {
          id: 'TransitionToGlacier',
          transitions: [
            { storageClass: 'GLACIER', transitionAfter: 90 },
          ],
        },
      ]);
      expect(result).toBe(false);
    });

    it('should return false for empty lifecycle rules', () => {
      const result = validateIntelligentTiering([]);
      expect(result).toBe(false);
    });

    it('should return false for rules without transitions', () => {
      const result = validateIntelligentTiering([
        { id: 'DeleteOldVersions' },
      ]);
      expect(result).toBe(false);
    });

    it('should return true when Intelligent-Tiering is one of multiple transitions', () => {
      const result = validateIntelligentTiering([
        {
          id: 'MultipleTransitions',
          transitions: [
            { storageClass: 'INTELLIGENT_TIERING', transitionAfter: 30 },
            { storageClass: 'GLACIER', transitionAfter: 90 },
          ],
        },
      ]);
      expect(result).toBe(true);
    });
  });

  describe('validateLambdaMemory - Requirements 15.3', () => {
    it('should return true for valid user management memory', () => {
      expect(validateLambdaMemory(256, 'userManagement')).toBe(true);
      expect(validateLambdaMemory(128, 'userManagement')).toBe(true);
      expect(validateLambdaMemory(512, 'userManagement')).toBe(true);
    });

    it('should return false for user management memory outside optimal range', () => {
      expect(validateLambdaMemory(1024, 'userManagement')).toBe(false);
    });

    it('should return true for valid agent proxy memory', () => {
      expect(validateLambdaMemory(1024, 'agentProxy')).toBe(true);
      expect(validateLambdaMemory(512, 'agentProxy')).toBe(true);
      expect(validateLambdaMemory(2048, 'agentProxy')).toBe(true);
    });

    it('should return false for agent proxy memory outside optimal range', () => {
      expect(validateLambdaMemory(256, 'agentProxy')).toBe(false);
    });

    it('should return false for memory below minimum', () => {
      expect(validateLambdaMemory(64, 'userManagement')).toBe(false);
    });

    it('should return false for memory above maximum', () => {
      expect(validateLambdaMemory(20480, 'userManagement')).toBe(false);
    });

    it('should return false for memory not multiple of 64 (after 128)', () => {
      expect(validateLambdaMemory(200, 'userManagement')).toBe(false);
    });

    it('should return true for unknown function type within general limits', () => {
      expect(validateLambdaMemory(512, 'unknownFunction')).toBe(true);
    });
  });


  describe('estimateLambdaCost - Requirements 15.3', () => {
    it('should calculate cost for typical Lambda usage', () => {
      const cost = estimateLambdaCost({
        memoryMB: 256,
        avgDurationMs: 100,
        monthlyInvocations: 1000000,
      });
      expect(cost).toBeGreaterThan(0);
    });

    it('should return higher cost for higher memory', () => {
      const lowMemoryCost = estimateLambdaCost({
        memoryMB: 128,
        avgDurationMs: 100,
        monthlyInvocations: 1000000,
      });
      const highMemoryCost = estimateLambdaCost({
        memoryMB: 1024,
        avgDurationMs: 100,
        monthlyInvocations: 1000000,
      });
      expect(highMemoryCost).toBeGreaterThan(lowMemoryCost);
    });

    it('should return higher cost for longer duration', () => {
      const shortDurationCost = estimateLambdaCost({
        memoryMB: 256,
        avgDurationMs: 100,
        monthlyInvocations: 1000000,
      });
      const longDurationCost = estimateLambdaCost({
        memoryMB: 256,
        avgDurationMs: 1000,
        monthlyInvocations: 1000000,
      });
      expect(longDurationCost).toBeGreaterThan(shortDurationCost);
    });

    it('should return higher cost for more invocations', () => {
      const lowInvocationsCost = estimateLambdaCost({
        memoryMB: 256,
        avgDurationMs: 100,
        monthlyInvocations: 100000,
      });
      const highInvocationsCost = estimateLambdaCost({
        memoryMB: 256,
        avgDurationMs: 100,
        monthlyInvocations: 10000000,
      });
      expect(highInvocationsCost).toBeGreaterThan(lowInvocationsCost);
    });

    it('should return zero cost for zero invocations', () => {
      const cost = estimateLambdaCost({
        memoryMB: 256,
        avgDurationMs: 100,
        monthlyInvocations: 0,
      });
      expect(cost).toBe(0);
    });
  });

  describe('getBudgetThresholds - Requirements 15.1, 15.5', () => {
    it('should return 50, 80, 100 thresholds', () => {
      const thresholds = getBudgetThresholds();
      expect(thresholds).toContain(50);
      expect(thresholds).toContain(80);
      expect(thresholds).toContain(100);
    });

    it('should return exactly 3 thresholds', () => {
      const thresholds = getBudgetThresholds();
      expect(thresholds).toHaveLength(3);
    });
  });

  describe('validateCostAllocationTags - Requirements 15.2', () => {
    it('should return true for valid tags', () => {
      const result = validateCostAllocationTags({
        Environment: 'prod',
        Project: 'governance-platform',
        CostCenter: 'engineering',
      });
      expect(result).toBe(true);
    });

    it('should return false for missing Environment tag', () => {
      const result = validateCostAllocationTags({
        Project: 'governance-platform',
        CostCenter: 'engineering',
      });
      expect(result).toBe(false);
    });

    it('should return false for missing Project tag', () => {
      const result = validateCostAllocationTags({
        Environment: 'prod',
        CostCenter: 'engineering',
      });
      expect(result).toBe(false);
    });

    it('should return false for missing CostCenter tag', () => {
      const result = validateCostAllocationTags({
        Environment: 'prod',
        Project: 'governance-platform',
      });
      expect(result).toBe(false);
    });

    it('should return false for empty tag values', () => {
      const result = validateCostAllocationTags({
        Environment: '',
        Project: 'governance-platform',
        CostCenter: 'engineering',
      });
      expect(result).toBe(false);
    });

    it('should return true with additional tags', () => {
      const result = validateCostAllocationTags({
        Environment: 'prod',
        Project: 'governance-platform',
        CostCenter: 'engineering',
        Team: 'platform',
        Owner: 'admin@example.com',
      });
      expect(result).toBe(true);
    });
  });
});
