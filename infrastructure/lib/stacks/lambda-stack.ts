import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags, AgentArns } from '../config/environment.js';
import * as path from 'path';

/**
 * Secrets configuration for Lambda functions
 * Validates: Requirements 16.2, 16.3
 */
export interface LambdaSecretsConfig {
  /**
   * Cognito client secret
   */
  cognitoClientSecret?: secretsmanager.ISecret;

  /**
   * API keys secret
   */
  apiKeysSecret?: secretsmanager.ISecret;
}

/**
 * Properties for the LambdaStack
 */
export interface LambdaStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * DynamoDB tables
   */
  tables: {
    tenants: dynamodb.ITable;
    users: dynamodb.ITable;
    workflows: dynamodb.ITable;
    cdes: dynamodb.ITable;
    issues: dynamodb.ITable;
    audit: dynamodb.ITable;
  };

  /**
   * Cognito User Pool
   */
  userPool: cognito.IUserPool;

  /**
   * AgentCore agent ARNs
   */
  agentArns: AgentArns;

  /**
   * Secrets configuration (optional)
   * Validates: Requirements 16.2, 16.3
   */
  secrets?: LambdaSecretsConfig;
}

/**
 * Lambda Stack for the Governance Platform
 * 
 * Creates Lambda functions for:
 * - User management operations (Requirements 6.1, 14.2)
 * - Workflow operations (Requirements 6.1)
 * - Data queries (Requirements 6.1)
 * - Agent proxy for AgentCore integration (Requirements 5.1, 5.2, 5.3, 5.4, 5.5)
 * 
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 14.2
 */
export class LambdaStack extends cdk.Stack {
  /**
   * User management Lambda function
   */
  public readonly userManagementLambda: lambda.Function;

  /**
   * Workflow operations Lambda function
   */
  public readonly workflowOperationsLambda: lambda.Function;

  /**
   * Data queries Lambda function
   */
  public readonly dataQueriesLambda: lambda.Function;

  /**
   * Agent proxy Lambda function
   */
  public readonly agentProxyLambda: lambda.Function;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    // Create User Management Lambda
    // Validates: Requirements 6.1, 14.2
    this.userManagementLambda = this.createUserManagementLambda(props, removalPolicy);

    // Create Workflow Operations Lambda
    // Validates: Requirements 6.1
    this.workflowOperationsLambda = this.createWorkflowOperationsLambda(props, removalPolicy);

    // Create Data Queries Lambda
    // Validates: Requirements 6.1
    this.dataQueriesLambda = this.createDataQueriesLambda(props, removalPolicy);

    // Create Agent Proxy Lambda
    // Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
    this.agentProxyLambda = this.createAgentProxyLambda(props, removalPolicy);

    // Create outputs
    this.createOutputs(props.environment);
  }


  /**
   * Creates the User Management Lambda function
   * Validates: Requirements 6.1, 14.2, 16.2, 16.3
   */
  private createUserManagementLambda(
    props: LambdaStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): lambda.Function {
    const logGroup = new logs.LogGroup(this, 'UserManagementLogs', {
      logGroupName: `/aws/lambda/governance-${props.environment}-user-management`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy,
    });

    // Build environment variables with secrets ARNs
    // Validates: Requirements 16.3
    const environment: Record<string, string> = {
      USERS_TABLE: props.tables.users.tableName,
      TENANTS_TABLE: props.tables.tenants.tableName,
      USER_POOL_ID: props.userPool.userPoolId,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Add secrets ARNs to environment (not plaintext values)
    // Validates: Requirements 16.3
    if (props.secrets?.cognitoClientSecret) {
      environment.COGNITO_CLIENT_SECRET_ARN = props.secrets.cognitoClientSecret.secretArn;
    }

    const fn = new lambdaNodejs.NodejsFunction(this, 'UserManagementFunction', {
      functionName: `governance-${props.environment}-user-management`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/user-management/handler.ts'),
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
      },
    });

    // Grant DynamoDB permissions
    props.tables.users.grantReadWriteData(fn);
    props.tables.tenants.grantReadData(fn);

    // Grant Cognito permissions
    fn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminAddUserToGroup',
        'cognito-idp:AdminRemoveUserFromGroup',
        'cognito-idp:AdminDisableUser',
        'cognito-idp:AdminDeleteUser',
        'cognito-idp:AdminGetUser',
      ],
      resources: [props.userPool.userPoolArn],
    }));

    // Grant secrets read access with least-privilege
    // Validates: Requirements 16.2
    if (props.secrets?.cognitoClientSecret) {
      props.secrets.cognitoClientSecret.grantRead(fn);
    }

    return fn;
  }

  /**
   * Creates the Workflow Operations Lambda function
   * Validates: Requirements 6.1
   */
  private createWorkflowOperationsLambda(
    props: LambdaStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): lambda.Function {
    const logGroup = new logs.LogGroup(this, 'WorkflowOperationsLogs', {
      logGroupName: `/aws/lambda/governance-${props.environment}-workflow-operations`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, 'WorkflowOperationsFunction', {
      functionName: `governance-${props.environment}-workflow-operations`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/workflow-operations/handler.ts'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment: {
        WORKFLOWS_TABLE: props.tables.workflows.tableName,
        AUDIT_TABLE: props.tables.audit.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
      },
    });

    // Grant DynamoDB permissions
    props.tables.workflows.grantReadWriteData(fn);
    props.tables.audit.grantWriteData(fn);

    return fn;
  }

  /**
   * Creates the Data Queries Lambda function
   * Validates: Requirements 6.1
   */
  private createDataQueriesLambda(
    props: LambdaStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): lambda.Function {
    const logGroup = new logs.LogGroup(this, 'DataQueriesLogs', {
      logGroupName: `/aws/lambda/governance-${props.environment}-data-queries`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy,
    });

    const fn = new lambdaNodejs.NodejsFunction(this, 'DataQueriesFunction', {
      functionName: `governance-${props.environment}-data-queries`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/data-queries/handler.ts'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment: {
        CDES_TABLE: props.tables.cdes.tableName,
        ISSUES_TABLE: props.tables.issues.tableName,
        AUDIT_TABLE: props.tables.audit.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
      },
    });

    // Grant DynamoDB permissions
    props.tables.cdes.grantReadData(fn);
    props.tables.issues.grantReadData(fn);
    props.tables.audit.grantReadData(fn);

    return fn;
  }


  /**
   * Creates the Agent Proxy Lambda function
   * 
   * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
   * For any API request to /api/agents/{agentType}, the request SHALL be routed
   * to the AgentCore agent ARN corresponding to that agent type.
   * 
   * **Feature: private-aws-deployment, Property 12: User Context Propagation**
   * For any AgentCore agent invocation, the request SHALL include the user's
   * tenant_id and user_id extracted from the JWT token.
   * 
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 16.2, 16.3
   */
  private createAgentProxyLambda(
    props: LambdaStackProps,
    removalPolicy: cdk.RemovalPolicy
  ): lambda.Function {
    const logGroup = new logs.LogGroup(this, 'AgentProxyLogs', {
      logGroupName: `/aws/lambda/governance-${props.environment}-agent-proxy`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy,
    });

    // Build environment variables with secrets ARNs
    // Validates: Requirements 16.3
    const environment: Record<string, string> = {
      AGENT_ARNS: JSON.stringify(props.agentArns),
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Add API keys secret ARN to environment (not plaintext values)
    // Validates: Requirements 16.3
    if (props.secrets?.apiKeysSecret) {
      environment.API_KEYS_SECRET_ARN = props.secrets.apiKeysSecret.secretArn;
    }

    const fn = new lambdaNodejs.NodejsFunction(this, 'AgentProxyFunction', {
      functionName: `governance-${props.environment}-agent-proxy`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/agent-proxy/handler.ts'),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(300), // 5 minutes for agent interactions
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment,
      bundling: {
        minify: true,
        sourceMap: true,
        target: 'node20',
      },
    });

    // Grant permissions to invoke AgentCore agents
    // Validates: Requirements 5.1, 5.2
    this.grantAgentCorePermissions(fn, props.agentArns);

    // Grant secrets read access with least-privilege
    // Validates: Requirements 16.2
    if (props.secrets?.apiKeysSecret) {
      props.secrets.apiKeysSecret.grantRead(fn);
    }

    return fn;
  }

  /**
   * Grants IAM permissions to invoke AgentCore agents
   * 
   * Validates: Requirements 5.1, 5.2
   */
  private grantAgentCorePermissions(fn: lambda.Function, agentArns: AgentArns): void {
    // Collect all agent ARNs
    const arns = Object.values(agentArns).filter(arn => arn && arn.trim().length > 0);

    if (arns.length === 0) {
      return;
    }

    // Grant bedrock-agentcore:InvokeAgent permission for all agents
    fn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeAgent',
        'bedrock:InvokeAgentWithResponseStream',
      ],
      resources: arns,
    }));

    // Grant additional Bedrock permissions for agent runtime
    fn.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:GetAgent',
        'bedrock:GetAgentAlias',
      ],
      resources: arns.map(arn => {
        // Convert runtime ARN to agent ARN pattern
        // From: arn:aws:bedrock-agentcore:region:account:runtime/AgentName-id
        // To: arn:aws:bedrock:region:account:agent/*
        const match = arn.match(/arn:aws:bedrock-agentcore:([^:]+):([^:]+):/);
        if (match) {
          return `arn:aws:bedrock:${match[1]}:${match[2]}:agent/*`;
        }
        return arn;
      }),
    }));
  }

  /**
   * Creates CloudFormation outputs for Lambda function ARNs
   */
  private createOutputs(environment: string): void {
    new cdk.CfnOutput(this, 'UserManagementLambdaArn', {
      value: this.userManagementLambda.functionArn,
      description: 'ARN of the User Management Lambda function',
      exportName: `governance-${environment}-user-management-lambda-arn`,
    });

    new cdk.CfnOutput(this, 'WorkflowOperationsLambdaArn', {
      value: this.workflowOperationsLambda.functionArn,
      description: 'ARN of the Workflow Operations Lambda function',
      exportName: `governance-${environment}-workflow-operations-lambda-arn`,
    });

    new cdk.CfnOutput(this, 'DataQueriesLambdaArn', {
      value: this.dataQueriesLambda.functionArn,
      description: 'ARN of the Data Queries Lambda function',
      exportName: `governance-${environment}-data-queries-lambda-arn`,
    });

    new cdk.CfnOutput(this, 'AgentProxyLambdaArn', {
      value: this.agentProxyLambda.functionArn,
      description: 'ARN of the Agent Proxy Lambda function',
      exportName: `governance-${environment}-agent-proxy-lambda-arn`,
    });
  }
}


/**
 * Helper function to validate Lambda secrets configuration
 * Validates: Requirements 16.2, 16.3
 */
export function validateLambdaSecretsConfig(config: {
  environment: Record<string, string>;
  secretArns: string[];
}): boolean {
  // Check that environment variables reference ARNs, not plaintext secrets
  for (const [key, value] of Object.entries(config.environment)) {
    // If the key suggests it's a secret, it should be an ARN
    if (key.toLowerCase().includes('secret') && !key.toLowerCase().includes('arn')) {
      // This is a potential plaintext secret - should be an ARN reference
      if (!value.startsWith('arn:aws:secretsmanager:')) {
        return false;
      }
    }
  }
  
  // All secret ARNs should be valid
  for (const arn of config.secretArns) {
    if (!isValidSecretArn(arn)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Helper function to validate a Secrets Manager ARN
 */
export function isValidSecretArn(arn: string): boolean {
  // Must be non-empty
  if (!arn || arn.trim().length === 0) {
    return false;
  }
  // Pattern: arn:aws:secretsmanager:REGION:ACCOUNT:secret:NAME
  // Region must be valid AWS region format (e.g., us-east-1, eu-west-1)
  const arnPattern = /^arn:aws:secretsmanager:[a-z]{2}-[a-z]+-\d:\d{12}:secret:[a-zA-Z0-9/_+=.@-]+$/;
  return arnPattern.test(arn);
}

/**
 * Helper function to check if Lambda has secrets access
 * Validates: Requirements 16.2
 */
export function hasSecretsAccess(
  lambdaEnv: Record<string, string>,
  secretArn: string
): boolean {
  // Check if any environment variable references this secret ARN
  return Object.values(lambdaEnv).some(value => 
    value === secretArn || value.startsWith(secretArn)
  );
}

/**
 * Helper function to extract secret ARNs from Lambda environment
 * Validates: Requirements 16.3
 */
export function extractSecretArnsFromEnv(
  environment: Record<string, string>
): string[] {
  const secretArns: string[] = [];
  
  for (const [key, value] of Object.entries(environment)) {
    if (key.endsWith('_SECRET_ARN') && value.startsWith('arn:aws:secretsmanager:')) {
      secretArns.push(value);
    }
  }
  
  return secretArns;
}

