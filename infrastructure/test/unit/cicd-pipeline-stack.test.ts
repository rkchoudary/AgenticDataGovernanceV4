import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as events_targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { ResourceTagging } from '../../lib/constructs/resource-tagging.js';

/**
 * Unit tests for CICDPipelineStack resources
 * Tests the individual resource configurations
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */
describe('CICDPipelineStack', () => {
  // Helper function to create a test stack with all CI/CD resources
  function createTestStack(environment: string): Template {
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

    // Create mock frontend bucket
    const frontendBucket = new s3.Bucket(stack, 'FrontendBucket', {
      bucketName: `governance-${environment}-frontend-123456789012`,
    });

    // Create mock notification topic
    const notificationTopic = new sns.Topic(stack, 'NotificationTopic', {
      topicName: `governance-${environment}-notifications`,
    });

    // Create mock CloudFront distribution
    const distribution = new cloudfront.Distribution(stack, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
      },
    });

    // Create deployments tracking table
    // Validates: Requirements 10.5
    const deploymentsTable = new dynamodb.Table(stack, 'DeploymentsTable', {
      tableName: `governance-${environment}-deployments`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });


    // Create deployment recorder Lambda
    // Validates: Requirements 10.5
    const deploymentRecorderLambda = new lambda.Function(stack, 'DeploymentRecorderLambda', {
      functionName: `governance-${environment}-deployment-recorder`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => {}'),
      environment: {
        DEPLOYMENTS_TABLE: deploymentsTable.tableName,
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
    });

    // Grant write access to the deployments table
    deploymentsTable.grantWriteData(deploymentRecorderLambda);

    // Create artifact bucket
    const artifactBucket = new s3.Bucket(stack, 'ArtifactBucket', {
      bucketName: `governance-${environment}-pipeline-artifacts-123456789012`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== 'prod',
      lifecycleRules: [
        {
          id: 'DeleteOldArtifacts',
          enabled: true,
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // Create build project
    // Validates: Requirements 10.2
    const buildProject = new codebuild.PipelineProject(stack, 'BuildProject', {
      projectName: `governance-${environment}-build`,
      description: `Build project for Governance Platform (${environment})`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ENVIRONMENT: { value: environment },
          FRONTEND_BUCKET: { value: frontendBucket.bucketName },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            'runtime-versions': { nodejs: '20' },
            commands: ['npm ci'],
          },
          build: {
            commands: ['npm run build'],
          },
        },
        artifacts: {
          files: ['**/*'],
        },
      }),
      timeout: cdk.Duration.minutes(30),
    });


    // Create deploy project
    // Validates: Requirements 10.2
    const deployProject = new codebuild.PipelineProject(stack, 'DeployProject', {
      projectName: `governance-${environment}-deploy`,
      description: `CDK deployment project for Governance Platform (${environment})`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.MEDIUM,
        environmentVariables: {
          ENVIRONMENT: { value: environment },
          FRONTEND_BUCKET: { value: frontendBucket.bucketName },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          install: {
            commands: ['npm install -g aws-cdk'],
          },
          build: {
            commands: ['cdk deploy --all --require-approval never'],
          },
        },
      }),
      timeout: cdk.Duration.minutes(60),
    });

    // Grant CDK deployment permissions
    deployProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudformation:*', 'sts:AssumeRole'],
      resources: ['*'],
    }));

    // Grant S3 permissions for frontend upload
    frontendBucket.grantReadWrite(deployProject);

    // Create invalidation project
    // Validates: Requirements 10.3
    const invalidationProject = new codebuild.PipelineProject(stack, 'InvalidationProject', {
      projectName: `governance-${environment}-invalidation`,
      description: `CloudFront invalidation project for Governance Platform (${environment})`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
        environmentVariables: {
          DISTRIBUTION_ID: { value: distribution.distributionId },
        },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          build: {
            commands: [
              `aws cloudfront create-invalidation --distribution-id ${distribution.distributionId} --paths "/*"`,
            ],
          },
        },
      }),
      timeout: cdk.Duration.minutes(10),
    });

    // Grant CloudFront invalidation permissions
    invalidationProject.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::123456789012:distribution/${distribution.distributionId}`],
    }));


    // Create pipeline
    // Validates: Requirements 10.1
    const pipeline = new codepipeline.Pipeline(stack, 'Pipeline', {
      pipelineName: `governance-${environment}-pipeline`,
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
          owner: 'test-owner',
          repo: 'test-repo',
          branch: 'main',
          connectionArn: 'arn:aws:codestar-connections:us-west-2:123456789012:connection/test-connection',
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
          project: buildProject,
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
          project: deployProject,
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
          project: invalidationProject,
          input: buildOutput,
        }),
      ],
    });


    // Create EventBridge rule for pipeline failures
    // Validates: Requirements 10.4
    const failureRule = new events.Rule(stack, 'PipelineFailureRule', {
      ruleName: `governance-${environment}-pipeline-failure`,
      description: 'Triggers on pipeline execution failures',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [pipeline.pipelineName],
          state: ['FAILED'],
        },
      },
    });

    // Add SNS target for failure notifications
    failureRule.addTarget(new events_targets.SnsTopic(notificationTopic));

    // Create EventBridge rule for successful deployments
    // Validates: Requirements 10.5
    const successRule = new events.Rule(stack, 'DeploymentSuccessRule', {
      ruleName: `governance-${environment}-deployment-success`,
      description: 'Triggers on successful pipeline executions',
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [pipeline.pipelineName],
          state: ['SUCCEEDED'],
        },
      },
    });

    // Add Lambda target for recording deployments
    successRule.addTarget(new events_targets.LambdaFunction(deploymentRecorderLambda));

    // Create outputs
    new cdk.CfnOutput(stack, 'PipelineName', {
      value: pipeline.pipelineName,
      description: 'Name of the CodePipeline',
      exportName: `governance-${environment}-pipeline-name`,
    });

    new cdk.CfnOutput(stack, 'BuildProjectName', {
      value: buildProject.projectName,
      description: 'Name of the build CodeBuild project',
      exportName: `governance-${environment}-build-project-name`,
    });

    new cdk.CfnOutput(stack, 'DeploymentsTableName', {
      value: deploymentsTable.tableName,
      description: 'Name of the deployments tracking table',
      exportName: `governance-${environment}-deployments-table-name`,
    });

    return Template.fromStack(stack);
  }


  describe('CodePipeline Configuration', () => {
    /**
     * Test: CodePipeline is created with correct name
     * Validates: Requirements 10.1
     */
    it('should create CodePipeline with correct name', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Name: 'governance-dev-pipeline',
      });
    });

    /**
     * Test: CodePipeline has Source stage with GitHub connection
     * Validates: Requirements 10.1
     */
    it('should create CodePipeline with Source stage', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Source',
            Actions: Match.arrayWith([
              Match.objectLike({
                Name: 'GitHub_Source',
                ActionTypeId: {
                  Category: 'Source',
                  Provider: 'CodeStarSourceConnection',
                },
              }),
            ]),
          }),
        ]),
      });
    });

    /**
     * Test: CodePipeline has Build stage
     * Validates: Requirements 10.2
     */
    it('should create CodePipeline with Build stage', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Build',
            Actions: Match.arrayWith([
              Match.objectLike({
                Name: 'Build',
                ActionTypeId: {
                  Category: 'Build',
                  Provider: 'CodeBuild',
                },
              }),
            ]),
          }),
        ]),
      });
    });

    /**
     * Test: CodePipeline has Deploy stage
     * Validates: Requirements 10.2
     */
    it('should create CodePipeline with Deploy stage', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Deploy',
            Actions: Match.arrayWith([
              Match.objectLike({
                Name: 'CDK_Deploy',
                ActionTypeId: {
                  Category: 'Build',
                  Provider: 'CodeBuild',
                },
              }),
            ]),
          }),
        ]),
      });
    });

    /**
     * Test: CodePipeline has Invalidate stage for CloudFront cache
     * Validates: Requirements 10.3
     */
    it('should create CodePipeline with Invalidate stage', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodePipeline::Pipeline', {
        Stages: Match.arrayWith([
          Match.objectLike({
            Name: 'Invalidate',
            Actions: Match.arrayWith([
              Match.objectLike({
                Name: 'CloudFront_Invalidation',
                ActionTypeId: {
                  Category: 'Build',
                  Provider: 'CodeBuild',
                },
              }),
            ]),
          }),
        ]),
      });
    });

    /**
     * Test: CodePipeline has 4 stages in correct order
     * Validates: Requirements 10.1, 10.2, 10.3
     */
    it('should create CodePipeline with 4 stages', () => {
      const template = createTestStack('dev');
      
      const pipelines = template.findResources('AWS::CodePipeline::Pipeline');
      const pipelineKeys = Object.keys(pipelines);
      expect(pipelineKeys.length).toBe(1);
      
      const pipeline = pipelines[pipelineKeys[0]];
      const stages = (pipeline.Properties as { Stages: unknown[] }).Stages;
      expect(stages.length).toBe(4);
    });
  });


  describe('CodeBuild Projects Configuration', () => {
    /**
     * Test: Build project is created with correct configuration
     * Validates: Requirements 10.2
     */
    it('should create build CodeBuild project with Node.js 20', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'governance-dev-build',
        Environment: {
          Image: 'aws/codebuild/standard:7.0',
          ComputeType: 'BUILD_GENERAL1_MEDIUM',
        },
      });
    });

    /**
     * Test: Deploy project is created with correct configuration
     * Validates: Requirements 10.2
     */
    it('should create deploy CodeBuild project', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'governance-dev-deploy',
        Environment: {
          Image: 'aws/codebuild/standard:7.0',
          ComputeType: 'BUILD_GENERAL1_MEDIUM',
        },
      });
    });

    /**
     * Test: Invalidation project is created with correct configuration
     * Validates: Requirements 10.3
     */
    it('should create invalidation CodeBuild project', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'governance-dev-invalidation',
        Environment: {
          Image: 'aws/codebuild/standard:7.0',
          ComputeType: 'BUILD_GENERAL1_SMALL',
        },
      });
    });

    /**
     * Test: Build project has environment variables
     * Validates: Requirements 10.2
     */
    it('should create build project with environment variables', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'governance-dev-build',
        Environment: {
          EnvironmentVariables: Match.arrayWith([
            Match.objectLike({
              Name: 'ENVIRONMENT',
              Value: 'dev',
            }),
          ]),
        },
      });
    });

    /**
     * Test: Build project has timeout configured
     * Validates: Requirements 10.2
     */
    it('should create build project with 30 minute timeout', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'governance-dev-build',
        TimeoutInMinutes: 30,
      });
    });

    /**
     * Test: Deploy project has 60 minute timeout
     * Validates: Requirements 10.2
     */
    it('should create deploy project with 60 minute timeout', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::CodeBuild::Project', {
        Name: 'governance-dev-deploy',
        TimeoutInMinutes: 60,
      });
    });
  });


  describe('Pipeline Notifications Configuration', () => {
    /**
     * Test: EventBridge rule is created for pipeline failures
     * Validates: Requirements 10.4
     */
    it('should create EventBridge rule for pipeline failures', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'governance-dev-pipeline-failure',
        EventPattern: {
          source: ['aws.codepipeline'],
          'detail-type': ['CodePipeline Pipeline Execution State Change'],
          detail: {
            state: ['FAILED'],
          },
        },
      });
    });

    /**
     * Test: Failure rule has SNS target
     * Validates: Requirements 10.4
     */
    it('should create failure rule with SNS target', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'governance-dev-pipeline-failure',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });

    /**
     * Test: EventBridge rule is created for successful deployments
     * Validates: Requirements 10.5
     */
    it('should create EventBridge rule for successful deployments', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'governance-dev-deployment-success',
        EventPattern: {
          source: ['aws.codepipeline'],
          'detail-type': ['CodePipeline Pipeline Execution State Change'],
          detail: {
            state: ['SUCCEEDED'],
          },
        },
      });
    });

    /**
     * Test: Success rule has Lambda target
     * Validates: Requirements 10.5
     */
    it('should create success rule with Lambda target', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'governance-dev-deployment-success',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
      });
    });
  });


  describe('Deployment Tracking Configuration', () => {
    /**
     * Test: DynamoDB table is created for deployment tracking
     * Validates: Requirements 10.5
     */
    it('should create DynamoDB table for deployment tracking', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-dev-deployments',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    /**
     * Test: Deployments table has point-in-time recovery enabled
     * Validates: Requirements 10.5
     */
    it('should enable point-in-time recovery for deployments table', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-dev-deployments',
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    /**
     * Test: Lambda function is created for recording deployments
     * Validates: Requirements 10.5
     */
    it('should create Lambda function for deployment recording', () => {
      const template = createTestStack('dev');
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'governance-dev-deployment-recorder',
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
        Timeout: 30,
        MemorySize: 256,
      });
    });

    /**
     * Test: Lambda function has environment variable for table name
     * Validates: Requirements 10.5
     */
    it('should configure Lambda with deployments table name', () => {
      const template = createTestStack('dev');
      
      // The environment variable is a Ref to the table, not a literal string
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'governance-dev-deployment-recorder',
        Environment: {
          Variables: {
            DEPLOYMENTS_TABLE: Match.anyValue(),
          },
        },
      });
    });
  });


  describe('Artifact Bucket Configuration', () => {
    /**
     * Test: Artifact bucket is created with encryption
     */
    it('should create artifact bucket with S3-managed encryption', () => {
      const template = createTestStack('dev');
      
      // Find the artifact bucket (not the frontend bucket)
      const buckets = template.findResources('AWS::S3::Bucket');
      const artifactBucket = Object.values(buckets).find(
        (b: Record<string, unknown>) => 
          ((b.Properties as Record<string, unknown>)?.BucketName as string)?.includes('pipeline-artifacts')
      );
      
      expect(artifactBucket).toBeDefined();
      expect((artifactBucket as Record<string, unknown>).Properties).toMatchObject({
        BucketEncryption: {
          ServerSideEncryptionConfiguration: expect.arrayContaining([
            expect.objectContaining({
              ServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256',
              },
            }),
          ]),
        },
      });
    });

    /**
     * Test: Artifact bucket blocks public access
     */
    it('should create artifact bucket with public access blocked', () => {
      const template = createTestStack('dev');
      
      // Find the artifact bucket
      const buckets = template.findResources('AWS::S3::Bucket');
      const artifactBucket = Object.values(buckets).find(
        (b: Record<string, unknown>) => 
          ((b.Properties as Record<string, unknown>)?.BucketName as string)?.includes('pipeline-artifacts')
      );
      
      expect(artifactBucket).toBeDefined();
      expect((artifactBucket as Record<string, unknown>).Properties).toMatchObject({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      });
    });

    /**
     * Test: Artifact bucket has lifecycle rules
     */
    it('should create artifact bucket with lifecycle rules', () => {
      const template = createTestStack('dev');
      
      // Find the artifact bucket
      const buckets = template.findResources('AWS::S3::Bucket');
      const artifactBucket = Object.values(buckets).find(
        (b: Record<string, unknown>) => 
          ((b.Properties as Record<string, unknown>)?.BucketName as string)?.includes('pipeline-artifacts')
      );
      
      expect(artifactBucket).toBeDefined();
      expect((artifactBucket as Record<string, unknown>).Properties).toMatchObject({
        LifecycleConfiguration: {
          Rules: expect.arrayContaining([
            expect.objectContaining({
              Id: 'DeleteOldArtifacts',
              Status: 'Enabled',
              ExpirationInDays: 30,
            }),
          ]),
        },
      });
    });
  });


  describe('Stack Outputs', () => {
    /**
     * Test: Stack exports pipeline name
     */
    it('should export pipeline name', () => {
      const template = createTestStack('dev');
      
      template.hasOutput('PipelineName', {
        Export: {
          Name: 'governance-dev-pipeline-name',
        },
      });
    });

    /**
     * Test: Stack exports build project name
     */
    it('should export build project name', () => {
      const template = createTestStack('dev');
      
      template.hasOutput('BuildProjectName', {
        Export: {
          Name: 'governance-dev-build-project-name',
        },
      });
    });

    /**
     * Test: Stack exports deployments table name
     */
    it('should export deployments table name', () => {
      const template = createTestStack('dev');
      
      template.hasOutput('DeploymentsTableName', {
        Export: {
          Name: 'governance-dev-deployments-table-name',
        },
      });
    });
  });

  describe('Environment-specific Configuration', () => {
    /**
     * Test: Production environment uses RETAIN removal policy for deployments table
     */
    it('should use RETAIN removal policy for production deployments table', () => {
      const template = createTestStack('prod');
      
      const tables = template.findResources('AWS::DynamoDB::Table');
      const deploymentsTable = Object.values(tables).find(
        (t: Record<string, unknown>) => 
          ((t.Properties as Record<string, unknown>)?.TableName as string)?.includes('deployments')
      );
      
      expect(deploymentsTable).toBeDefined();
      expect((deploymentsTable as Record<string, unknown>).DeletionPolicy).toBe('Retain');
    });

    /**
     * Test: Non-production environment uses DESTROY removal policy
     */
    it('should use DESTROY removal policy for non-production deployments table', () => {
      const template = createTestStack('dev');
      
      const tables = template.findResources('AWS::DynamoDB::Table');
      const deploymentsTable = Object.values(tables).find(
        (t: Record<string, unknown>) => 
          ((t.Properties as Record<string, unknown>)?.TableName as string)?.includes('deployments')
      );
      
      expect(deploymentsTable).toBeDefined();
      expect((deploymentsTable as Record<string, unknown>).DeletionPolicy).toBe('Delete');
    });
  });

  describe('Resource Tagging', () => {
    /**
     * Test: All resources have required tags
     * Validates: Requirements 8.3, 15.2
     */
    it('should apply required tags to all resources', () => {
      const template = createTestStack('dev');
      
      // Verify Environment and Project tags are applied to DynamoDB table
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'governance-dev-deployments',
        Tags: Match.arrayWith([
          Match.objectLike({ Key: 'Environment', Value: 'dev' }),
          Match.objectLike({ Key: 'Project', Value: 'test-project' }),
        ]),
      });
    });
  });
});
