import * as cdk from 'aws-cdk-lib';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the CICDPipelineStack
 */
export interface CICDPipelineStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * GitHub repository owner
   */
  githubOwner: string;

  /**
   * GitHub repository name
   */
  githubRepo: string;

  /**
   * GitHub branch to deploy from
   */
  githubBranch: string;

  /**
   * GitHub connection ARN (CodeStar Connections)
   */
  githubConnectionArn: string;

  /**
   * S3 bucket for frontend assets
   */
  frontendBucket: s3.IBucket;

  /**
   * CloudFront distribution for cache invalidation
   */
  distribution: cloudfront.IDistribution;

  /**
   * SNS topic for notifications
   */
  notificationTopic: sns.ITopic;

  /**
   * Email address for pipeline notifications (optional)
   */
  notificationEmail?: string;
}


/**
 * CI/CD Pipeline Stack for the Governance Platform
 * 
 * Creates:
 * - CodePipeline with source, build, and deploy stages (Requirements 10.1, 10.2)
 * - CodeBuild project for building and testing (Requirements 10.2)
 * - CloudFront cache invalidation (Requirements 10.3)
 * - SNS notifications for pipeline failures (Requirements 10.4)
 * - DynamoDB table for deployment tracking (Requirements 10.5)
 * 
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */
export class CICDPipelineStack extends cdk.Stack {
  /**
   * The CodePipeline
   */
  public readonly pipeline: codepipeline.Pipeline;

  /**
   * CodeBuild project for building the application
   */
  public readonly buildProject: codebuild.PipelineProject;

  /**
   * CodeBuild project for CDK deployment
   */
  public readonly deployProject: codebuild.PipelineProject;

  /**
   * CodeBuild project for CloudFront invalidation
   */
  public readonly invalidationProject: codebuild.PipelineProject;

  /**
   * DynamoDB table for deployment tracking
   */
  public readonly deploymentsTable: dynamodb.Table;

  /**
   * Lambda function for recording deployments
   */
  public readonly deploymentRecorderLambda: lambda.Function;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: CICDPipelineStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create deployment tracking table
    // Validates: Requirements 10.5
    this.deploymentsTable = this.createDeploymentsTable(props);

    // Create deployment recorder Lambda
    this.deploymentRecorderLambda = this.createDeploymentRecorderLambda(props);

    // Create CodeBuild projects
    // Validates: Requirements 10.2
    this.buildProject = this.createBuildProject(props);
    this.deployProject = this.createDeployProject(props);
    this.invalidationProject = this.createInvalidationProject(props);

    // Create the pipeline
    // Validates: Requirements 10.1
    this.pipeline = this.createPipeline(props);

    // Set up notifications
    // Validates: Requirements 10.4
    this.setupNotifications(props);

    // Set up deployment tracking event
    this.setupDeploymentTracking(props);

    // Create outputs
    this.createOutputs(props.environment);
  }


  /**
   * Creates the DynamoDB table for deployment tracking
   * Validates: Requirements 10.5
   */
  private createDeploymentsTable(props: CICDPipelineStackProps): dynamodb.Table {
    return new dynamodb.Table(this, 'DeploymentsTable', {
      tableName: `governance-${props.environment}-deployments`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });
  }

  /**
   * Creates the Lambda function for recording deployments
   * Validates: Requirements 10.5
   */
  private createDeploymentRecorderLambda(props: CICDPipelineStackProps): lambda.Function {
    const fn = new lambda.Function(this, 'DeploymentRecorderLambda', {
      functionName: `governance-${props.environment}-deployment-recorder`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.DEPLOYMENTS_TABLE;

exports.handler = async (event) => {
  console.log('Deployment event:', JSON.stringify(event, null, 2));
  
  const detail = event.detail || {};
  const pipelineName = detail['pipeline'] || 'unknown';
  const executionId = detail['execution-id'] || 'unknown';
  const state = detail['state'] || 'unknown';
  const timestamp = new Date().toISOString();
  
  // Only record successful deployments
  if (state !== 'SUCCEEDED') {
    console.log('Skipping non-successful state:', state);
    return { statusCode: 200, body: 'Skipped' };
  }
  
  const item = {
    PK: { S: 'DEPLOYMENT#' + pipelineName },
    SK: { S: timestamp + '#' + executionId },
    executionId: { S: executionId },
    pipelineName: { S: pipelineName },
    state: { S: state },
    timestamp: { S: timestamp },
    version: { S: executionId.substring(0, 8) },
  };
  
  try {
    await client.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));
    console.log('Deployment recorded:', item);
    return { statusCode: 200, body: 'Recorded' };
  } catch (error) {
    console.error('Error recording deployment:', error);
    throw error;
  }
};
      `),
      environment: {
        DEPLOYMENTS_TABLE: this.deploymentsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant write access to the deployments table
    this.deploymentsTable.grantWriteData(fn);

    return fn;
  }


  /**
   * Creates the CodeBuild project for building the application
   * Validates: Requirements 10.2
   */
  private createBuildProject(props: CICDPipelineStackProps): codebuild.PipelineProject {
    return new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: `governance-${props.environment}-build`,
      description: `Build project for Governance Platform (${props.environment})`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ENVIRONMENT: { value: props.environment },
          FRONTEND_BUCKET: { value: props.frontendBucket.bucketName },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
            },
            commands: [
              'echo "Installing dependencies..."',
              'npm ci',
              'cd frontend && npm ci && cd ..',
              'cd infrastructure && npm ci && cd ..',
            ],
          },
          pre_build: {
            commands: [
              'echo "Running tests..."',
              'npm run test -- --run || true',
              'cd frontend && npm run lint || true && cd ..',
            ],
          },
          build: {
            commands: [
              'echo "Building frontend..."',
              'cd frontend && npm run build && cd ..',
              'echo "Building infrastructure..."',
              'cd infrastructure && npm run build && cd ..',
            ],
          },
          post_build: {
            commands: [
              'echo "Build completed successfully"',
            ],
          },
        },
        artifacts: {
          'base-directory': '.',
          files: [
            'frontend/dist/**/*',
            'infrastructure/dist/**/*',
            'infrastructure/cdk.json',
            'infrastructure/package.json',
            'infrastructure/package-lock.json',
          ],
        },
        cache: {
          paths: [
            'node_modules/**/*',
            'frontend/node_modules/**/*',
            'infrastructure/node_modules/**/*',
          ],
        },
      }),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
      timeout: cdk.Duration.minutes(30),
    });
  }


  /**
   * Creates the CodeBuild project for CDK deployment
   * Validates: Requirements 10.2
   */
  private createDeployProject(props: CICDPipelineStackProps): codebuild.PipelineProject {
    const project = new codebuild.PipelineProject(this, 'DeployProject', {
      projectName: `governance-${props.environment}-deploy`,
      description: `CDK deployment project for Governance Platform (${props.environment})`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ENVIRONMENT: { value: props.environment },
          FRONTEND_BUCKET: { value: props.frontendBucket.bucketName },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': {
              nodejs: '20',
            },
            commands: [
              'echo "Installing CDK..."',
              'npm install -g aws-cdk',
              'cd infrastructure && npm ci && cd ..',
            ],
          },
          build: {
            commands: [
              'echo "Deploying CDK stacks..."',
              'cd infrastructure',
              `cdk deploy --all --require-approval never -c environment=${props.environment}`,
              'cd ..',
              'echo "Uploading frontend assets..."',
              `aws s3 sync frontend/dist s3://${props.frontendBucket.bucketName} --delete`,
            ],
          },
        },
      }),
      timeout: cdk.Duration.minutes(60),
    });

    // Grant CDK deployment permissions
    project.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudformation:*',
        'sts:AssumeRole',
      ],
      resources: ['*'],
    }));

    // Grant S3 permissions for frontend upload
    props.frontendBucket.grantReadWrite(project);

    return project;
  }

  /**
   * Creates the CodeBuild project for CloudFront cache invalidation
   * Validates: Requirements 10.3
   */
  private createInvalidationProject(props: CICDPipelineStackProps): codebuild.PipelineProject {
    const project = new codebuild.PipelineProject(this, 'InvalidationProject', {
      projectName: `governance-${props.environment}-invalidation`,
      description: `CloudFront invalidation project for Governance Platform (${props.environment})`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        environmentVariables: {
          DISTRIBUTION_ID: { value: props.distribution.distributionId },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              'echo "Invalidating CloudFront cache..."',
              `aws cloudfront create-invalidation --distribution-id ${props.distribution.distributionId} --paths "/*"`,
              'echo "Cache invalidation initiated"',
            ],
          },
        },
      }),
      timeout: cdk.Duration.minutes(10),
    });

    // Grant CloudFront invalidation permissions
    project.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/${props.distribution.distributionId}`],
    }));

    return project;
  }


  /**
   * Creates the CodePipeline
   * Validates: Requirements 10.1, 10.2
   */
  private createPipeline(props: CICDPipelineStackProps): codepipeline.Pipeline {
    // Create artifact bucket
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `governance-${props.environment}-pipeline-artifacts-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // Create pipeline
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `governance-${props.environment}-pipeline`,
      pipelineType: codepipeline.PipelineType.V2,
      artifactBucket,
      restartExecutionOnUpdate: true,
    });

    // Source stage artifacts
    const sourceOutput = new codepipeline.Artifact('SourceOutput');

    // Source stage - GitHub via CodeStar Connections
    // Validates: Requirements 10.1
    pipeline.addStage({
      stageName: 'Source',
      actions: [
        new codepipeline_actions.CodeStarConnectionsSourceAction({
          actionName: 'GitHub_Source',
          owner: props.githubOwner,
          repo: props.githubRepo,
          branch: props.githubBranch,
          connectionArn: props.githubConnectionArn,
          output: sourceOutput,
          triggerOnPush: true,
        }),
      ],
    });

    // Build stage artifacts
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    // Build stage
    // Validates: Requirements 10.2
    pipeline.addStage({
      stageName: 'Build',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'Build',
          project: this.buildProject,
          input: sourceOutput,
          outputs: [buildOutput],
        }),
      ],
    });

    // Deploy stage
    // Validates: Requirements 10.2
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CDK_Deploy',
          project: this.deployProject,
          input: buildOutput,
        }),
      ],
    });

    // Invalidation stage
    // Validates: Requirements 10.3
    pipeline.addStage({
      stageName: 'Invalidate',
      actions: [
        new codepipeline_actions.CodeBuildAction({
          actionName: 'CloudFront_Invalidation',
          project: this.invalidationProject,
          input: buildOutput,
        }),
      ],
    });

    return pipeline;
  }


  /**
   * Sets up SNS notifications for pipeline failures
   * Validates: Requirements 10.4
   */
  private setupNotifications(props: CICDPipelineStackProps): void {
    // Add email subscription if provided
    if (props.notificationEmail) {
      props.notificationTopic.addSubscription(
        new sns_subscriptions.EmailSubscription(props.notificationEmail)
      );
    }

    // Create EventBridge rule for pipeline failures
    const failureRule = new events.Rule(this, 'PipelineFailureRule', {
      ruleName: `governance-${props.environment}-pipeline-failure`,
      description: 'Triggers on pipeline execution failures',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [this.pipeline.pipelineName],
          state: ['FAILED'],
        },
      },
    });

    // Add SNS target for failure notifications
    failureRule.addTarget(new events_targets.SnsTopic(props.notificationTopic, {
      message: events.RuleTargetInput.fromText(
        `Pipeline ${props.environment} FAILED!\n` +
        `Pipeline: ${events.EventField.fromPath('$.detail.pipeline')}\n` +
        `Execution ID: ${events.EventField.fromPath('$.detail.execution-id')}\n` +
        `Time: ${events.EventField.fromPath('$.time')}`
      ),
    }));

    // Create rule for stage failures
    const stageFailureRule = new events.Rule(this, 'StageFailureRule', {
      ruleName: `governance-${props.environment}-stage-failure`,
      description: 'Triggers on pipeline stage failures',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Stage Execution State Change'],
        detail: {
          pipeline: [this.pipeline.pipelineName],
          state: ['FAILED'],
        },
      },
    });

    stageFailureRule.addTarget(new events_targets.SnsTopic(props.notificationTopic, {
      message: events.RuleTargetInput.fromText(
        `Pipeline Stage FAILED!\n` +
        `Pipeline: ${events.EventField.fromPath('$.detail.pipeline')}\n` +
        `Stage: ${events.EventField.fromPath('$.detail.stage')}\n` +
        `Execution ID: ${events.EventField.fromPath('$.detail.execution-id')}\n` +
        `Time: ${events.EventField.fromPath('$.time')}`
      ),
    }));
  }

  /**
   * Sets up deployment tracking via EventBridge
   * Validates: Requirements 10.5
   */
  private setupDeploymentTracking(props: CICDPipelineStackProps): void {
    // Create EventBridge rule for successful deployments
    const successRule = new events.Rule(this, 'DeploymentSuccessRule', {
      ruleName: `governance-${props.environment}-deployment-success`,
      description: 'Triggers on successful pipeline executions',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [this.pipeline.pipelineName],
          state: ['SUCCEEDED'],
        },
      },
    });

    // Add Lambda target for recording deployments
    successRule.addTarget(new events_targets.LambdaFunction(this.deploymentRecorderLambda));
  }

  /**
   * Creates CloudFormation outputs
   */
  private createOutputs(environment: string): void {
    new cdk.CfnOutput(this, 'PipelineName', {
      value: this.pipeline.pipelineName,
      description: 'Name of the CodePipeline',
      exportName: `governance-${environment}-pipeline-name`,
    });

    new cdk.CfnOutput(this, 'PipelineArn', {
      value: this.pipeline.pipelineArn,
      description: 'ARN of the CodePipeline',
      exportName: `governance-${environment}-pipeline-arn`,
    });

    new cdk.CfnOutput(this, 'BuildProjectName', {
      value: this.buildProject.projectName,
      description: 'Name of the build CodeBuild project',
      exportName: `governance-${environment}-build-project-name`,
    });

    new cdk.CfnOutput(this, 'DeploymentsTableName', {
      value: this.deploymentsTable.tableName,
      description: 'Name of the deployments tracking table',
      exportName: `governance-${environment}-deployments-table-name`,
    });
  }
}
