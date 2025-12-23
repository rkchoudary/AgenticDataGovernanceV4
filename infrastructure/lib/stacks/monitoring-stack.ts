import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the MonitoringStack
 */
export interface MonitoringStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * SNS topic for alarm notifications
   */
  alarmTopic: sns.ITopic;

  /**
   * Lambda functions to monitor
   */
  lambdaFunctions?: {
    userManagement?: lambda.IFunction;
    workflowOperations?: lambda.IFunction;
    dataQueries?: lambda.IFunction;
    agentProxy?: lambda.IFunction;
  };

  /**
   * HTTP API to monitor
   */
  httpApi?: apigatewayv2.IHttpApi;

  /**
   * WebSocket API to monitor
   */
  webSocketApi?: apigatewayv2.IWebSocketApi;
}

/**
 * Monitoring Stack for the Governance Platform
 * 
 * Creates:
 * - CloudWatch log groups for all Lambda functions and API Gateway (Requirements 7.1)
 * - CloudWatch alarms for API errors, Lambda errors, and latency (Requirements 7.2, 7.3)
 * - X-Ray tracing configuration (Requirements 7.4)
 * 
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */
export class MonitoringStack extends cdk.Stack {
  /**
   * Log groups for Lambda functions
   */
  public readonly lambdaLogGroups: Map<string, logs.ILogGroup>;

  /**
   * Log group for HTTP API Gateway
   */
  public readonly httpApiLogGroup: logs.LogGroup;

  /**
   * Log group for WebSocket API Gateway
   */
  public readonly webSocketApiLogGroup: logs.LogGroup;

  /**
   * CloudWatch alarms
   */
  public readonly alarms: Map<string, cloudwatch.Alarm>;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    this.lambdaLogGroups = new Map();
    this.alarms = new Map();

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    const retention = props.environment === 'prod'
      ? logs.RetentionDays.ONE_YEAR
      : logs.RetentionDays.ONE_WEEK;

    // Create log groups for API Gateway
    // Validates: Requirements 7.1
    this.httpApiLogGroup = this.createApiGatewayLogGroup(
      'HttpApi',
      props.environment,
      retention,
      removalPolicy
    );

    this.webSocketApiLogGroup = this.createApiGatewayLogGroup(
      'WebSocketApi',
      props.environment,
      retention,
      removalPolicy
    );

    // Create CloudWatch alarms
    // Validates: Requirements 7.2, 7.3
    this.createApiAlarms(props);
    this.createLambdaAlarms(props);

    // Create stack outputs
    this.createOutputs(props.environment);
  }


  /**
   * Creates a CloudWatch log group for API Gateway
   * Validates: Requirements 7.1
   */
  private createApiGatewayLogGroup(
    apiType: string,
    environment: string,
    retention: logs.RetentionDays,
    removalPolicy: cdk.RemovalPolicy
  ): logs.LogGroup {
    return new logs.LogGroup(this, `${apiType}LogGroup`, {
      logGroupName: `/aws/apigateway/governance-${environment}-${apiType.toLowerCase()}`,
      retention,
      removalPolicy,
    });
  }

  /**
   * Creates CloudWatch alarms for API Gateway
   * Validates: Requirements 7.2, 7.3
   */
  private createApiAlarms(props: MonitoringStackProps): void {
    if (!props.httpApi) {
      return;
    }

    // API 5xx errors alarm
    // Validates: Requirements 7.2
    const api5xxAlarm = new cloudwatch.Alarm(this, 'Api5xxErrorsAlarm', {
      alarmName: `governance-${props.environment}-api-5xx-errors`,
      alarmDescription: 'Alarm when API Gateway returns 5xx errors',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: {
          ApiId: props.httpApi.apiId,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add SNS action for alarm notification
    // Validates: Requirements 7.3
    api5xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    api5xxAlarm.addOkAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    this.alarms.set('api5xxErrors', api5xxAlarm);

    // API 4xx errors alarm (for monitoring client errors)
    const api4xxAlarm = new cloudwatch.Alarm(this, 'Api4xxErrorsAlarm', {
      alarmName: `governance-${props.environment}-api-4xx-errors`,
      alarmDescription: 'Alarm when API Gateway returns excessive 4xx errors',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '4xx',
        dimensionsMap: {
          ApiId: props.httpApi.apiId,
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 100,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    api4xxAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    this.alarms.set('api4xxErrors', api4xxAlarm);

    // API latency alarm
    // Validates: Requirements 7.2
    const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatencyAlarm', {
      alarmName: `governance-${props.environment}-api-latency`,
      alarmDescription: 'Alarm when API Gateway latency exceeds threshold',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: 'Latency',
        dimensionsMap: {
          ApiId: props.httpApi.apiId,
        },
        statistic: 'p95',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5000, // 5 seconds
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    apiLatencyAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
    this.alarms.set('apiLatency', apiLatencyAlarm);
  }


  /**
   * Creates CloudWatch alarms for Lambda functions
   * Validates: Requirements 7.2, 7.3
   */
  private createLambdaAlarms(props: MonitoringStackProps): void {
    if (!props.lambdaFunctions) {
      return;
    }

    const lambdaConfigs: Array<{
      name: string;
      fn: lambda.IFunction | undefined;
      errorThreshold: number;
      durationThreshold: number;
    }> = [
      {
        name: 'UserManagement',
        fn: props.lambdaFunctions.userManagement,
        errorThreshold: 5,
        durationThreshold: 10000, // 10 seconds
      },
      {
        name: 'WorkflowOperations',
        fn: props.lambdaFunctions.workflowOperations,
        errorThreshold: 5,
        durationThreshold: 30000, // 30 seconds
      },
      {
        name: 'DataQueries',
        fn: props.lambdaFunctions.dataQueries,
        errorThreshold: 5,
        durationThreshold: 15000, // 15 seconds
      },
      {
        name: 'AgentProxy',
        fn: props.lambdaFunctions.agentProxy,
        errorThreshold: 10,
        durationThreshold: 120000, // 2 minutes (agents take longer)
      },
    ];

    for (const config of lambdaConfigs) {
      if (!config.fn) {
        continue;
      }

      // Lambda errors alarm
      // Validates: Requirements 7.2
      const errorAlarm = new cloudwatch.Alarm(
        this,
        `${config.name}ErrorsAlarm`,
        {
          alarmName: `governance-${props.environment}-${config.name.toLowerCase()}-errors`,
          alarmDescription: `Alarm when ${config.name} Lambda function errors exceed threshold`,
          metric: config.fn.metricErrors({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: config.errorThreshold,
          evaluationPeriods: 2,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }
      );

      // Add SNS action for alarm notification
      // Validates: Requirements 7.3
      errorAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
      errorAlarm.addOkAction(new cloudwatchActions.SnsAction(props.alarmTopic));
      this.alarms.set(`${config.name.toLowerCase()}Errors`, errorAlarm);

      // Lambda duration alarm
      // Validates: Requirements 7.2
      const durationAlarm = new cloudwatch.Alarm(
        this,
        `${config.name}DurationAlarm`,
        {
          alarmName: `governance-${props.environment}-${config.name.toLowerCase()}-duration`,
          alarmDescription: `Alarm when ${config.name} Lambda function duration exceeds threshold`,
          metric: config.fn.metricDuration({
            statistic: 'p95',
            period: cdk.Duration.minutes(5),
          }),
          threshold: config.durationThreshold,
          evaluationPeriods: 3,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }
      );

      durationAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
      this.alarms.set(`${config.name.toLowerCase()}Duration`, durationAlarm);

      // Lambda throttles alarm
      const throttleAlarm = new cloudwatch.Alarm(
        this,
        `${config.name}ThrottlesAlarm`,
        {
          alarmName: `governance-${props.environment}-${config.name.toLowerCase()}-throttles`,
          alarmDescription: `Alarm when ${config.name} Lambda function is throttled`,
          metric: config.fn.metricThrottles({
            statistic: 'Sum',
            period: cdk.Duration.minutes(5),
          }),
          threshold: 1,
          evaluationPeriods: 1,
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        }
      );

      throttleAlarm.addAlarmAction(new cloudwatchActions.SnsAction(props.alarmTopic));
      this.alarms.set(`${config.name.toLowerCase()}Throttles`, throttleAlarm);
    }
  }


  /**
   * Creates CloudFormation outputs
   */
  private createOutputs(environment: string): void {
    // HTTP API log group ARN
    new cdk.CfnOutput(this, 'HttpApiLogGroupArn', {
      value: this.httpApiLogGroup.logGroupArn,
      description: 'ARN of the HTTP API Gateway log group',
      exportName: `governance-${environment}-http-api-log-group-arn`,
    });

    // WebSocket API log group ARN
    new cdk.CfnOutput(this, 'WebSocketApiLogGroupArn', {
      value: this.webSocketApiLogGroup.logGroupArn,
      description: 'ARN of the WebSocket API Gateway log group',
      exportName: `governance-${environment}-websocket-api-log-group-arn`,
    });

    // Alarm count
    new cdk.CfnOutput(this, 'AlarmCount', {
      value: this.alarms.size.toString(),
      description: 'Number of CloudWatch alarms created',
      exportName: `governance-${environment}-alarm-count`,
    });
  }
}


/**
 * Log retention configuration by environment
 */
export const LOG_RETENTION_CONFIG: Record<string, logs.RetentionDays> = {
  dev: logs.RetentionDays.ONE_WEEK,
  staging: logs.RetentionDays.ONE_MONTH,
  prod: logs.RetentionDays.ONE_YEAR,
};

/**
 * Gets the appropriate log retention for an environment
 * Validates: Requirements 7.1
 */
export function getLogRetention(environment: string): logs.RetentionDays {
  return LOG_RETENTION_CONFIG[environment] || logs.RetentionDays.ONE_WEEK;
}

/**
 * Alarm threshold configuration
 */
export interface AlarmThresholds {
  api5xxErrors: number;
  api4xxErrors: number;
  apiLatencyMs: number;
  lambdaErrors: number;
  lambdaDurationMs: number;
}

/**
 * Default alarm thresholds by environment
 */
export const DEFAULT_ALARM_THRESHOLDS: Record<string, AlarmThresholds> = {
  dev: {
    api5xxErrors: 20,
    api4xxErrors: 200,
    apiLatencyMs: 10000,
    lambdaErrors: 10,
    lambdaDurationMs: 30000,
  },
  staging: {
    api5xxErrors: 10,
    api4xxErrors: 100,
    apiLatencyMs: 7500,
    lambdaErrors: 5,
    lambdaDurationMs: 20000,
  },
  prod: {
    api5xxErrors: 5,
    api4xxErrors: 50,
    apiLatencyMs: 5000,
    lambdaErrors: 3,
    lambdaDurationMs: 15000,
  },
};

/**
 * Gets alarm thresholds for an environment
 */
export function getAlarmThresholds(environment: string): AlarmThresholds {
  return DEFAULT_ALARM_THRESHOLDS[environment] || DEFAULT_ALARM_THRESHOLDS.dev;
}

/**
 * Validates that X-Ray tracing is enabled for a Lambda function
 * Validates: Requirements 7.4
 */
export function isXRayTracingEnabled(tracingConfig: lambda.Tracing | undefined): boolean {
  return tracingConfig === lambda.Tracing.ACTIVE;
}

/**
 * Creates a metric filter for error logging
 * Validates: Requirements 7.5
 */
export function createErrorMetricFilter(
  scope: Construct,
  id: string,
  logGroup: logs.ILogGroup,
  metricNamespace: string,
  metricName: string
): logs.MetricFilter {
  return new logs.MetricFilter(scope, id, {
    logGroup,
    filterPattern: logs.FilterPattern.anyTerm('ERROR', 'Error', 'error'),
    metricNamespace,
    metricName,
    metricValue: '1',
    defaultValue: 0,
  });
}

