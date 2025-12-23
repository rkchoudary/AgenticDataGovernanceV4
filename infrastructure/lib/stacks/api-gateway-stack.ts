import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as apigatewayv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the ApiGatewayStack
 */
export interface ApiGatewayStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * CloudFront distribution domain for CORS
   */
  cloudFrontDomain: string;

  /**
   * Custom domain name (optional)
   */
  domainName?: string;

  /**
   * Cognito User Pool for JWT authorization
   */
  userPool: cognito.IUserPool;

  /**
   * Cognito User Pool Client for JWT authorization
   */
  userPoolClient: cognito.IUserPoolClient;

  /**
   * Lambda function for user management operations
   */
  userManagementLambda?: lambda.IFunction;

  /**
   * Lambda function for workflow operations
   */
  workflowOperationsLambda?: lambda.IFunction;

  /**
   * Lambda function for data queries
   */
  dataQueriesLambda?: lambda.IFunction;

  /**
   * Lambda function for agent proxy
   */
  agentProxyLambda?: lambda.IFunction;
}


/**
 * API Gateway Stack for the Governance Platform
 *
 * Creates:
 * - HTTP API with CORS configuration (Requirements 2.1)
 * - Cognito JWT authorizer (Requirements 2.4, 2.5)
 * - API routes for data operations (Requirements 2.3)
 * - API routes for agent operations (Requirements 2.2)
 */
export class ApiGatewayStack extends cdk.Stack {
  /**
   * HTTP API
   */
  public readonly httpApi: apigatewayv2.HttpApi;

  /**
   * Cognito JWT authorizer
   */
  public readonly jwtAuthorizer: apigatewayv2Authorizers.HttpJwtAuthorizer;

  /**
   * API access log group
   */
  public readonly accessLogGroup: logs.LogGroup;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create access log group for API Gateway
    this.accessLogGroup = new logs.LogGroup(this, 'ApiAccessLogs', {
      logGroupName: `/aws/apigateway/governance-${props.environment}-api`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create Cognito JWT authorizer
    // Validates: Requirements 2.4, 2.5
    this.jwtAuthorizer = this.createJwtAuthorizer(props);

    // Create HTTP API with CORS configuration
    // Validates: Requirements 2.1
    this.httpApi = this.createHttpApi(props);

    // Create API routes
    this.createRoutes(props);

    // Create stack outputs
    this.createOutputs(props);
  }


  /**
   * Creates the Cognito JWT authorizer
   * Validates: Requirements 2.4, 2.5
   */
  private createJwtAuthorizer(props: ApiGatewayStackProps): apigatewayv2Authorizers.HttpJwtAuthorizer {
    const issuerUrl = `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`;
    
    return new apigatewayv2Authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      issuerUrl,
      {
        authorizerName: `governance-${props.environment}-jwt-authorizer`,
        jwtAudience: [props.userPoolClient.userPoolClientId],
        identitySource: ['$request.header.Authorization'],
      }
    );
  }

  /**
   * Creates the HTTP API with CORS configuration
   * Validates: Requirements 2.1
   */
  private createHttpApi(props: ApiGatewayStackProps): apigatewayv2.HttpApi {
    // Build allowed origins for CORS
    const allowedOrigins = this.buildAllowedOrigins(props);

    const api = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: `governance-${props.environment}-api`,
      description: `Governance Platform HTTP API (${props.environment})`,
      
      // CORS configuration
      // Validates: Requirements 2.1
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.PUT,
          apigatewayv2.CorsHttpMethod.DELETE,
          apigatewayv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: [
          'Authorization',
          'Content-Type',
          'X-Correlation-Id',
          'X-Amz-Date',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
        maxAge: cdk.Duration.days(1),
      },
      
      // Disable default endpoint if custom domain is provided
      disableExecuteApiEndpoint: false,
    });

    // Configure access logging
    const stage = api.defaultStage?.node.defaultChild as apigatewayv2.CfnStage;
    if (stage) {
      stage.accessLogSettings = {
        destinationArn: this.accessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          ip: '$context.identity.sourceIp',
          requestTime: '$context.requestTime',
          httpMethod: '$context.httpMethod',
          routeKey: '$context.routeKey',
          status: '$context.status',
          protocol: '$context.protocol',
          responseLength: '$context.responseLength',
          integrationLatency: '$context.integrationLatency',
          errorMessage: '$context.error.message',
          authorizerError: '$context.authorizer.error',
        }),
      };
    }

    return api;
  }


  /**
   * Builds the list of allowed origins for CORS
   */
  private buildAllowedOrigins(props: ApiGatewayStackProps): string[] {
    const origins: string[] = [];

    // Add CloudFront domain
    if (props.cloudFrontDomain) {
      origins.push(`https://${props.cloudFrontDomain}`);
    }

    // Add custom domain if provided
    if (props.domainName) {
      origins.push(`https://${props.domainName}`);
    }

    // Add localhost for development
    if (props.environment === 'dev') {
      origins.push('http://localhost:3000');
      origins.push('http://localhost:5173'); // Vite default port
    }

    // Ensure at least one origin is present
    if (origins.length === 0) {
      origins.push('https://localhost');
    }

    return origins;
  }

  /**
   * Creates API routes for data and agent operations
   * Validates: Requirements 2.2, 2.3
   */
  private createRoutes(props: ApiGatewayStackProps): void {
    // Create routes for user management operations
    // Validates: Requirements 2.3
    if (props.userManagementLambda) {
      this.createUserRoutes(props.userManagementLambda);
    }

    // Create routes for workflow operations
    // Validates: Requirements 2.3
    if (props.workflowOperationsLambda) {
      this.createWorkflowRoutes(props.workflowOperationsLambda);
    }

    // Create routes for data queries
    // Validates: Requirements 2.3
    if (props.dataQueriesLambda) {
      this.createDataRoutes(props.dataQueriesLambda);
    }

    // Create routes for agent operations
    // Validates: Requirements 2.2
    if (props.agentProxyLambda) {
      this.createAgentRoutes(props.agentProxyLambda);
    }
  }


  /**
   * Creates routes for user management operations
   * Validates: Requirements 2.3
   */
  private createUserRoutes(userLambda: lambda.IFunction): void {
    const integration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'UserManagementIntegration',
      userLambda
    );

    // GET /api/users - List users
    this.httpApi.addRoutes({
      path: '/api/users',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // POST /api/users - Create/invite user
    this.httpApi.addRoutes({
      path: '/api/users',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // GET /api/users/{userId} - Get user by ID
    this.httpApi.addRoutes({
      path: '/api/users/{userId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // PUT /api/users/{userId} - Update user
    this.httpApi.addRoutes({
      path: '/api/users/{userId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // DELETE /api/users/{userId} - Delete user
    this.httpApi.addRoutes({
      path: '/api/users/{userId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // PUT /api/users/{userId}/role - Assign role to user
    this.httpApi.addRoutes({
      path: '/api/users/{userId}/role',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration,
      authorizer: this.jwtAuthorizer,
    });
  }

  /**
   * Creates routes for workflow operations
   * Validates: Requirements 2.3
   */
  private createWorkflowRoutes(workflowLambda: lambda.IFunction): void {
    const integration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'WorkflowOperationsIntegration',
      workflowLambda
    );

    // GET /api/workflows - List workflows
    this.httpApi.addRoutes({
      path: '/api/workflows',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // POST /api/workflows - Create workflow
    this.httpApi.addRoutes({
      path: '/api/workflows',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // GET /api/workflows/{workflowId} - Get workflow by ID
    this.httpApi.addRoutes({
      path: '/api/workflows/{workflowId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // PUT /api/workflows/{workflowId} - Update workflow
    this.httpApi.addRoutes({
      path: '/api/workflows/{workflowId}',
      methods: [apigatewayv2.HttpMethod.PUT],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // DELETE /api/workflows/{workflowId} - Delete workflow
    this.httpApi.addRoutes({
      path: '/api/workflows/{workflowId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // POST /api/workflows/{workflowId}/phase - Progress workflow phase
    this.httpApi.addRoutes({
      path: '/api/workflows/{workflowId}/phase',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: this.jwtAuthorizer,
    });
  }


  /**
   * Creates routes for data queries
   * Validates: Requirements 2.3
   */
  private createDataRoutes(dataLambda: lambda.IFunction): void {
    const integration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'DataQueriesIntegration',
      dataLambda
    );

    // CDE routes
    this.httpApi.addRoutes({
      path: '/api/data/cdes',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/api/data/cdes/{cdeId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // Issue routes
    this.httpApi.addRoutes({
      path: '/api/data/issues',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/api/data/issues/{issueId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // Audit log routes
    this.httpApi.addRoutes({
      path: '/api/data/audit',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    this.httpApi.addRoutes({
      path: '/api/data/audit/{auditId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // Dashboard/metrics routes
    this.httpApi.addRoutes({
      path: '/api/data/dashboard',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });
  }

  /**
   * Creates routes for agent operations
   * Validates: Requirements 2.2
   */
  private createAgentRoutes(agentLambda: lambda.IFunction): void {
    const integration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'AgentProxyIntegration',
      agentLambda
    );

    // POST /api/agents/{agentType} - Invoke specific agent
    this.httpApi.addRoutes({
      path: '/api/agents/{agentType}',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // GET /api/agents - List available agents
    this.httpApi.addRoutes({
      path: '/api/agents',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // POST /api/agents/{agentType}/session - Create agent session
    this.httpApi.addRoutes({
      path: '/api/agents/{agentType}/session',
      methods: [apigatewayv2.HttpMethod.POST],
      integration,
      authorizer: this.jwtAuthorizer,
    });

    // GET /api/agents/{agentType}/session/{sessionId} - Get session status
    this.httpApi.addRoutes({
      path: '/api/agents/{agentType}/session/{sessionId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration,
      authorizer: this.jwtAuthorizer,
    });
  }


  /**
   * Creates stack outputs
   */
  private createOutputs(props: ApiGatewayStackProps): void {
    // API endpoint URL
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.httpApi.apiEndpoint,
      description: 'HTTP API endpoint URL',
      exportName: `governance-${props.environment}-api-endpoint`,
    });

    // API ID
    new cdk.CfnOutput(this, 'ApiId', {
      value: this.httpApi.apiId,
      description: 'HTTP API ID',
      exportName: `governance-${props.environment}-api-id`,
    });

    // Access log group ARN
    new cdk.CfnOutput(this, 'AccessLogGroupArn', {
      value: this.accessLogGroup.logGroupArn,
      description: 'API Gateway access log group ARN',
      exportName: `governance-${props.environment}-api-access-logs-arn`,
    });
  }
}


/**
 * Valid agent types for routing
 */
export const AGENT_TYPES = [
  'regulatory',
  'dataRequirements',
  'cdeIdentification',
  'dataQuality',
  'lineageMapping',
  'issueManagement',
  'documentation',
  'orchestrator',
] as const;

export type AgentType = typeof AGENT_TYPES[number];

/**
 * Validates if a string is a valid agent type
 * 
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 * For any API request to /api/agents/{agentType}, the request SHALL be routed 
 * to the AgentCore agent ARN corresponding to that agent type.
 * 
 * Validates: Requirements 2.2, 5.2
 */
export function isValidAgentType(agentType: string): agentType is AgentType {
  return AGENT_TYPES.includes(agentType as AgentType);
}

/**
 * Gets the agent ARN for a given agent type
 * 
 * Validates: Requirements 2.2, 5.2
 */
export function getAgentArn(
  agentType: AgentType,
  agentArns: Record<AgentType, string>
): string {
  const arn = agentArns[agentType];
  if (!arn) {
    throw new Error(`No ARN configured for agent type: ${agentType}`);
  }
  return arn;
}

/**
 * User roles and their allowed operations
 * 
 * **Feature: private-aws-deployment, Property 11: RBAC Enforcement**
 * For any API request, the API Gateway authorizer SHALL enforce role-based 
 * access control based on the JWT claims.
 * 
 * Validates: Requirements 14.4, 14.5
 */
export const ROLE_PERMISSIONS: Record<string, {
  allowedRoutes: string[];
  allowedMethods: string[];
}> = {
  admin: {
    allowedRoutes: ['*'],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  compliance_officer: {
    allowedRoutes: [
      '/api/workflows/*',
      '/api/data/*',
      '/api/agents/*',
      '/api/users',
    ],
    allowedMethods: ['GET', 'POST', 'PUT'],
  },
  data_steward: {
    allowedRoutes: [
      '/api/workflows/*',
      '/api/data/cdes/*',
      '/api/data/issues/*',
      '/api/agents/*',
    ],
    allowedMethods: ['GET', 'POST', 'PUT'],
  },
  viewer: {
    allowedRoutes: [
      '/api/workflows/*',
      '/api/data/*',
    ],
    allowedMethods: ['GET'],
  },
};


/**
 * Checks if a role has permission to access a route with a given method
 * 
 * Validates: Requirements 14.4, 14.5
 */
export function hasRoutePermission(
  role: string,
  route: string,
  method: string
): boolean {
  // Handle unknown roles - return false for any role not in ROLE_PERMISSIONS
  if (!role || typeof role !== 'string') {
    return false;
  }
  
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions || !permissions.allowedMethods || !permissions.allowedRoutes) {
    return false;
  }

  // Check if method is allowed
  if (!permissions.allowedMethods.includes(method)) {
    return false;
  }

  // Check if route is allowed
  for (const allowedRoute of permissions.allowedRoutes) {
    if (allowedRoute === '*') {
      return true;
    }
    if (matchRoute(allowedRoute, route)) {
      return true;
    }
  }

  return false;
}

/**
 * Matches a route pattern against an actual route
 * Supports wildcard (*) at the end of patterns
 */
function matchRoute(pattern: string, route: string): boolean {
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return route.startsWith(prefix);
  }
  return pattern === route;
}

/**
 * Validates that a request has proper authentication
 * 
 * **Feature: private-aws-deployment, Property 2: Authentication Enforcement**
 * For any API request without a valid Cognito JWT token, the API Gateway 
 * SHALL return a 401 Unauthorized response.
 * 
 * Validates: Requirements 2.4, 2.5
 */
export function validateAuthorizationHeader(authHeader: string | undefined): {
  isValid: boolean;
  token?: string;
  error?: string;
} {
  if (!authHeader) {
    return {
      isValid: false,
      error: 'Missing Authorization header',
    };
  }

  // Check for Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    return {
      isValid: false,
      error: 'Invalid Authorization header format. Expected: Bearer <token>',
    };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!token || token.trim().length === 0) {
    return {
      isValid: false,
      error: 'Empty token in Authorization header',
    };
  }

  // Basic JWT format validation (three parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      isValid: false,
      error: 'Invalid JWT format',
    };
  }

  return {
    isValid: true,
    token,
  };
}

/**
 * Extracts correlation ID from request headers or generates a new one
 */
export function getCorrelationId(headers: Record<string, string | undefined>): string {
  const correlationId = headers['x-correlation-id'] || headers['X-Correlation-Id'];
  if (correlationId && typeof correlationId === 'string') {
    return correlationId;
  }
  // Generate a new correlation ID if not provided
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

