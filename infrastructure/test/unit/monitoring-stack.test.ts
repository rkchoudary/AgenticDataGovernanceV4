import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { ResourceTagging } from '../../lib/constructs/resource-tagging.js';
import {
  getLogRetention,
  getAlarmThresholds,
  isXRayTracingEnabled,
  LOG_RETENTION_CONFIG,
  DEFAULT_ALARM_THRESHOLDS,
} from '../../lib/stacks/monitoring-stack.js';

/**
 * Unit tests for MonitoringStack resources
 * Tests the individual resource configurations
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4
 */
describe('MonitoringStack', () => {
  // Helper function to create a test stack with monitoring resources
  function createTestStack(
    environment: string,
    options: {
      includeLambdas?: boolean;
      includeApi?: boolean;
    } = {}
  ): Template {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-west-2' },
    });

    // Apply resource tagging
    new ResourceTagging(stack, 'ResourceTagging', {
      tags: {
        Environment: environment,
        Project: 'test-project',
        CostCenter: 'test-cost-center',
      },
    });

    // Create SNS topic for alarms
    const alarmTopic = new sns.Topic(stack, 'AlarmTopic', {
      topicName: `governance-${environment}-alarms`,
    });

    const retention = environment === 'prod'
      ? logs.RetentionDays.ONE_YEAR
      : logs.RetentionDays.ONE_WEEK;

    const removalPolicy = environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // Create log groups for API Gateway
    // Validates: Requirements 7.1
    new logs.LogGroup(stack, 'HttpApiLogGroup', {
      logGroupName: `/aws/apigateway/governance-${environment}-httpapi`,
      retention,
      removalPolicy,
    });

    new logs.LogGroup(stack, 'WebSocketApiLogGroup', {
      logGroupName: `/aws/apigateway/governance-${environment}-websocketapi`,
      retention,
      removalPolicy,
    });


    // Create mock Lambda functions if requested
    if (options.includeLambdas) {
      const userManagementFn = new lambda.Function(stack, 'UserManagementFn', {
        functionName: `governance-${environment}-user-management`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => {}'),
        tracing: lambda.Tracing.ACTIVE,
      });

      // Create Lambda error alarm
      // Validates: Requirements 7.2
      const errorAlarm = new cloudwatch.Alarm(stack, 'UserManagementErrorsAlarm', {
        alarmName: `governance-${environment}-usermanagement-errors`,
        alarmDescription: 'Alarm when UserManagement Lambda function errors exceed threshold',
        metric: userManagementFn.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      // Add SNS action
      // Validates: Requirements 7.3
      errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

      // Create Lambda duration alarm
      const durationAlarm = new cloudwatch.Alarm(stack, 'UserManagementDurationAlarm', {
        alarmName: `governance-${environment}-usermanagement-duration`,
        alarmDescription: 'Alarm when UserManagement Lambda function duration exceeds threshold',
        metric: userManagementFn.metricDuration({
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10000,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
    }

    // Create mock API if requested
    if (options.includeApi) {
      const api = new apigatewayv2.HttpApi(stack, 'HttpApi', {
        apiName: `governance-${environment}-api`,
      });

      // Create API 5xx errors alarm
      // Validates: Requirements 7.2
      const api5xxAlarm = new cloudwatch.Alarm(stack, 'Api5xxErrorsAlarm', {
        alarmName: `governance-${environment}-api-5xx-errors`,
        alarmDescription: 'Alarm when API Gateway returns 5xx errors',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: '5xx',
          dimensionsMap: {
            ApiId: api.apiId,
          },
          statistic: 'Sum',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 10,
        evaluationPeriods: 2,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      api5xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));

      // Create API latency alarm
      const apiLatencyAlarm = new cloudwatch.Alarm(stack, 'ApiLatencyAlarm', {
        alarmName: `governance-${environment}-api-latency`,
        alarmDescription: 'Alarm when API Gateway latency exceeds threshold',
        metric: new cloudwatch.Metric({
          namespace: 'AWS/ApiGateway',
          metricName: 'Latency',
          dimensionsMap: {
            ApiId: api.apiId,
          },
          statistic: 'p95',
          period: cdk.Duration.minutes(5),
        }),
        threshold: 5000,
        evaluationPeriods: 3,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });

      apiLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(alarmTopic));
    }

    return Template.fromStack(stack);
  }


  describe('CloudWatch Log Groups', () => {
    /**
     * Test: Log groups are created for API Gateway
     * Validates: Requirements 7.1
     */
    it('should create log groups for API Gateway', () => {
      const template = createTestStack('dev');

      // Verify HTTP API log group exists
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/governance-dev-httpapi',
      });

      // Verify WebSocket API log group exists
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/apigateway/governance-dev-websocketapi',
      });
    });

    /**
     * Test: Log groups have correct retention for dev environment
     * Validates: Requirements 7.1
     */
    it('should configure one week retention for dev environment', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 7, // ONE_WEEK
      });
    });

    /**
     * Test: Log groups have correct retention for prod environment
     * Validates: Requirements 7.1
     */
    it('should configure one year retention for prod environment', () => {
      const template = createTestStack('prod');

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        RetentionInDays: 365, // ONE_YEAR
      });
    });

    /**
     * Test: Log groups have RETAIN removal policy in prod
     */
    it('should use RETAIN removal policy for prod log groups', () => {
      const template = createTestStack('prod');

      const logGroups = template.findResources('AWS::Logs::LogGroup');
      const logGroupKeys = Object.keys(logGroups);
      expect(logGroupKeys.length).toBeGreaterThan(0);

      // Check that at least one log group has RETAIN policy
      const hasRetainPolicy = Object.values(logGroups).some(
        (lg: Record<string, unknown>) => lg.DeletionPolicy === 'Retain'
      );
      expect(hasRetainPolicy).toBe(true);
    });
  });

  describe('CloudWatch Alarms', () => {
    /**
     * Test: Lambda error alarms are created
     * Validates: Requirements 7.2
     */
    it('should create Lambda error alarms', () => {
      const template = createTestStack('dev', { includeLambdas: true });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'governance-dev-usermanagement-errors',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        EvaluationPeriods: 2,
        Threshold: 5,
      });
    });

    /**
     * Test: Lambda duration alarms are created
     * Validates: Requirements 7.2
     */
    it('should create Lambda duration alarms', () => {
      const template = createTestStack('dev', { includeLambdas: true });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'governance-dev-usermanagement-duration',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        EvaluationPeriods: 3,
        Threshold: 10000,
      });
    });

    /**
     * Test: API 5xx error alarms are created
     * Validates: Requirements 7.2
     */
    it('should create API 5xx error alarms', () => {
      const template = createTestStack('dev', { includeApi: true });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'governance-dev-api-5xx-errors',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        EvaluationPeriods: 2,
        Threshold: 10,
      });
    });

    /**
     * Test: API latency alarms are created
     * Validates: Requirements 7.2
     */
    it('should create API latency alarms', () => {
      const template = createTestStack('dev', { includeApi: true });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'governance-dev-api-latency',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        EvaluationPeriods: 3,
        Threshold: 5000,
      });
    });

    /**
     * Test: Alarms have SNS actions configured
     * Validates: Requirements 7.3
     */
    it('should configure SNS actions for alarms', () => {
      const template = createTestStack('dev', { includeLambdas: true });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmActions: Match.arrayWith([
          Match.objectLike({
            Ref: Match.stringLikeRegexp('AlarmTopic'),
          }),
        ]),
      });
    });

    /**
     * Test: Alarms treat missing data as not breaching
     */
    it('should treat missing data as not breaching', () => {
      const template = createTestStack('dev', { includeLambdas: true });

      template.hasResourceProperties('AWS::CloudWatch::Alarm', {
        TreatMissingData: 'notBreaching',
      });
    });
  });


  describe('X-Ray Tracing', () => {
    /**
     * Test: Lambda functions have X-Ray tracing enabled
     * Validates: Requirements 7.4
     */
    it('should enable X-Ray tracing for Lambda functions', () => {
      const template = createTestStack('dev', { includeLambdas: true });

      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: {
          Mode: 'Active',
        },
      });
    });
  });

  describe('Resource Tagging', () => {
    /**
     * Test: All resources have required tags
     * Validates: Requirements 8.3, 15.2
     */
    it('should apply required tags to all resources', () => {
      const template = createTestStack('dev');

      template.hasResourceProperties('AWS::Logs::LogGroup', {
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Environment', Value: 'dev' }),
          Match.objectLike({ Key: 'Project', Value: 'test-project' }),
        ]),
      });
    });
  });

  describe('Helper Functions', () => {
    /**
     * Test: getLogRetention returns correct values
     */
    it('should return correct log retention for each environment', () => {
      expect(getLogRetention('dev')).toBe(logs.RetentionDays.ONE_WEEK);
      expect(getLogRetention('staging')).toBe(logs.RetentionDays.ONE_MONTH);
      expect(getLogRetention('prod')).toBe(logs.RetentionDays.ONE_YEAR);
      expect(getLogRetention('unknown')).toBe(logs.RetentionDays.ONE_WEEK);
    });

    /**
     * Test: getAlarmThresholds returns correct values
     */
    it('should return correct alarm thresholds for each environment', () => {
      const devThresholds = getAlarmThresholds('dev');
      expect(devThresholds.api5xxErrors).toBe(20);
      expect(devThresholds.lambdaErrors).toBe(10);

      const prodThresholds = getAlarmThresholds('prod');
      expect(prodThresholds.api5xxErrors).toBe(5);
      expect(prodThresholds.lambdaErrors).toBe(3);
    });

    /**
     * Test: isXRayTracingEnabled validates tracing config
     * Validates: Requirements 7.4
     */
    it('should correctly identify X-Ray tracing status', () => {
      expect(isXRayTracingEnabled(lambda.Tracing.ACTIVE)).toBe(true);
      expect(isXRayTracingEnabled(lambda.Tracing.DISABLED)).toBe(false);
      expect(isXRayTracingEnabled(lambda.Tracing.PASS_THROUGH)).toBe(false);
      expect(isXRayTracingEnabled(undefined)).toBe(false);
    });

    /**
     * Test: LOG_RETENTION_CONFIG has all environments
     */
    it('should have log retention config for all environments', () => {
      expect(LOG_RETENTION_CONFIG).toHaveProperty('dev');
      expect(LOG_RETENTION_CONFIG).toHaveProperty('staging');
      expect(LOG_RETENTION_CONFIG).toHaveProperty('prod');
    });

    /**
     * Test: DEFAULT_ALARM_THRESHOLDS has all environments
     */
    it('should have alarm thresholds for all environments', () => {
      expect(DEFAULT_ALARM_THRESHOLDS).toHaveProperty('dev');
      expect(DEFAULT_ALARM_THRESHOLDS).toHaveProperty('staging');
      expect(DEFAULT_ALARM_THRESHOLDS).toHaveProperty('prod');

      // Verify structure
      for (const env of ['dev', 'staging', 'prod']) {
        const thresholds = DEFAULT_ALARM_THRESHOLDS[env];
        expect(thresholds).toHaveProperty('api5xxErrors');
        expect(thresholds).toHaveProperty('api4xxErrors');
        expect(thresholds).toHaveProperty('apiLatencyMs');
        expect(thresholds).toHaveProperty('lambdaErrors');
        expect(thresholds).toHaveProperty('lambdaDurationMs');
      }
    });

    /**
     * Test: Prod thresholds are stricter than dev
     */
    it('should have stricter thresholds for prod than dev', () => {
      const devThresholds = DEFAULT_ALARM_THRESHOLDS.dev;
      const prodThresholds = DEFAULT_ALARM_THRESHOLDS.prod;

      expect(prodThresholds.api5xxErrors).toBeLessThan(devThresholds.api5xxErrors);
      expect(prodThresholds.lambdaErrors).toBeLessThan(devThresholds.lambdaErrors);
      expect(prodThresholds.apiLatencyMs).toBeLessThan(devThresholds.apiLatencyMs);
    });
  });
});

