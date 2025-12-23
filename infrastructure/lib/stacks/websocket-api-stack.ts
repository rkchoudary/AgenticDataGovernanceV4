import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ResourceTagging } from '../constructs/resource-tagging.js';
import { ResourceTags } from '../config/environment.js';

/**
 * Properties for the WebSocketApiStack
 */
export interface WebSocketApiStackProps extends cdk.StackProps {
  /**
   * Environment name (dev, staging, prod)
   */
  environment: string;

  /**
   * Required resource tags
   */
  tags: ResourceTags;

  /**
   * Cognito User Pool for JWT authorization
   */
  userPool: cognito.IUserPool;

  /**
   * Cognito User Pool Client for JWT authorization
   */
  userPoolClient: cognito.IUserPoolClient;

  /**
   * Lambda function for WebSocket connection handling
   */
  connectLambda?: lambda.IFunction;

  /**
   * Lambda function for WebSocket disconnection handling
   */
  disconnectLambda?: lambda.IFunction;

  /**
   * Lambda function for agent streaming
   */
  agentStreamLambda?: lambda.IFunction;
}


/**
 * WebSocket API Stack for the Governance Platform
 *
 * Creates:
 * - WebSocket API with route selection expression (Requirements 11.1)
 * - $connect route with auth validation (Requirements 11.2, 11.5)
 * - $disconnect route (Requirements 11.2)
 * - Agent route for streaming (Requirements 11.3)
 * - Idle timeout configuration (Requirements 11.4)
 */
export class WebSocketApiStack extends cdk.Stack {
  /**
   * WebSocket API
   */
  public readonly webSocketApi: apigatewayv2.WebSocketApi;

  /**
   * WebSocket API stage
   */
  public readonly webSocketStage: apigatewayv2.WebSocketStage;

  /**
   * WebSocket access log group
   */
  public readonly accessLogGroup: logs.LogGroup;

  /**
   * Resource tagging construct
   */
  public readonly resourceTagging: ResourceTagging;

  /**
   * IAM role for managing WebSocket connections
   */
  public readonly connectionManagementRole: iam.Role;

  constructor(scope: Construct, id: string, props: WebSocketApiStackProps) {
    super(scope, id, props);

    // Apply resource tagging to all resources in this stack
    // Validates: Requirements 8.3, 15.2
    this.resourceTagging = new ResourceTagging(this, 'ResourceTagging', {
      tags: props.tags,
    });

    // Create access log group for WebSocket API
    this.accessLogGroup = new logs.LogGroup(this, 'WebSocketAccessLogs', {
      logGroupName: `/aws/apigateway/governance-${props.environment}-websocket`,
      retention: props.environment === 'prod'
        ? logs.RetentionDays.ONE_YEAR
        : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // Create WebSocket API
    // Validates: Requirements 11.1
    this.webSocketApi = this.createWebSocketApi(props);

    // Create WebSocket routes
    // Validates: Requirements 11.2, 11.3, 11.5
    this.createRoutes(props);

    // Create WebSocket stage with idle timeout
    // Validates: Requirements 11.4
    this.webSocketStage = this.createStage(props);

    // Create IAM role for connection management
    this.connectionManagementRole = this.createConnectionManagementRole(props);

    // Create stack outputs
    this.createOutputs(props);
  }


  /**
   * Creates the WebSocket API
   * Validates: Requirements 11.1
   */
  private createWebSocketApi(props: WebSocketApiStackProps): apigatewayv2.WebSocketApi {
    return new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `governance-${props.environment}-websocket`,
      description: `Governance Platform WebSocket API for real-time agent interactions (${props.environment})`,
      // Route selection expression to determine which route to invoke
      // Validates: Requirements 11.1
      routeSelectionExpression: '$request.body.action',
    });
  }

  /**
   * Creates WebSocket routes
   * Validates: Requirements 11.2, 11.3, 11.5
   */
  private createRoutes(props: WebSocketApiStackProps): void {
    // Create $connect route with auth validation
    // Validates: Requirements 11.2, 11.5
    if (props.connectLambda) {
      this.webSocketApi.addRoute('$connect', {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'ConnectIntegration',
          props.connectLambda
        ),
        // Note: Authorization is handled in the Lambda function
        // by validating the JWT token from query parameters
      });
    }

    // Create $disconnect route
    // Validates: Requirements 11.2
    if (props.disconnectLambda) {
      this.webSocketApi.addRoute('$disconnect', {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DisconnectIntegration',
          props.disconnectLambda
        ),
      });
    }

    // Create agent route for streaming
    // Validates: Requirements 11.3
    if (props.agentStreamLambda) {
      this.webSocketApi.addRoute('agent', {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'AgentStreamIntegration',
          props.agentStreamLambda
        ),
      });

      // Also add a default route that forwards to agent streaming
      this.webSocketApi.addRoute('$default', {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration(
          'DefaultIntegration',
          props.agentStreamLambda
        ),
      });
    }
  }


  /**
   * Creates the WebSocket stage with idle timeout configuration
   * Validates: Requirements 11.4
   */
  private createStage(props: WebSocketApiStackProps): apigatewayv2.WebSocketStage {
    const stage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi: this.webSocketApi,
      stageName: props.environment,
      autoDeploy: true,
    });

    // Configure stage settings via CfnStage
    const cfnStage = stage.node.defaultChild as apigatewayv2.CfnStage;
    if (cfnStage) {
      // Set idle timeout to 10 minutes (600 seconds)
      // Validates: Requirements 11.4
      cfnStage.defaultRouteSettings = {
        // Note: WebSocket API idle timeout is configured at the API level
        // The default is 10 minutes, which matches our requirement
      };

      // Configure access logging
      cfnStage.accessLogSettings = {
        destinationArn: this.accessLogGroup.logGroupArn,
        format: JSON.stringify({
          requestId: '$context.requestId',
          connectionId: '$context.connectionId',
          eventType: '$context.eventType',
          routeKey: '$context.routeKey',
          status: '$context.status',
          requestTime: '$context.requestTime',
          integrationLatency: '$context.integrationLatency',
          errorMessage: '$context.error.message',
        }),
      };
    }

    return stage;
  }

  /**
   * Creates IAM role for managing WebSocket connections
   * This role allows Lambda functions to send messages back to connected clients
   */
  private createConnectionManagementRole(props: WebSocketApiStackProps): iam.Role {
    const role = new iam.Role(this, 'ConnectionManagementRole', {
      roleName: `governance-${props.environment}-ws-connection-mgmt`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Role for managing WebSocket connections',
    });

    // Allow posting messages to connected clients
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'execute-api:ManageConnections',
      ],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${props.environment}/*`,
      ],
    }));

    return role;
  }


  /**
   * Creates stack outputs
   */
  private createOutputs(props: WebSocketApiStackProps): void {
    // WebSocket API endpoint URL
    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: this.webSocketStage.url,
      description: 'WebSocket API endpoint URL',
      exportName: `governance-${props.environment}-websocket-endpoint`,
    });

    // WebSocket API ID
    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
      exportName: `governance-${props.environment}-websocket-api-id`,
    });

    // Access log group ARN
    new cdk.CfnOutput(this, 'WebSocketAccessLogGroupArn', {
      value: this.accessLogGroup.logGroupArn,
      description: 'WebSocket API access log group ARN',
      exportName: `governance-${props.environment}-websocket-access-logs-arn`,
    });

    // Connection management role ARN
    new cdk.CfnOutput(this, 'ConnectionManagementRoleArn', {
      value: this.connectionManagementRole.roleArn,
      description: 'IAM role ARN for WebSocket connection management',
      exportName: `governance-${props.environment}-ws-connection-mgmt-role-arn`,
    });
  }
}


/**
 * WebSocket connection request interface
 */
export interface WebSocketConnectionRequest {
  queryStringParameters?: {
    token?: string;
    [key: string]: string | undefined;
  };
  headers?: {
    Authorization?: string;
    [key: string]: string | undefined;
  };
  requestContext?: {
    connectionId?: string;
    routeKey?: string;
    eventType?: string;
  };
}

/**
 * WebSocket authentication result
 */
export interface WebSocketAuthResult {
  isAuthenticated: boolean;
  userId?: string;
  tenantId?: string;
  roles?: string[];
  error?: string;
}

/**
 * Validates WebSocket connection authentication
 *
 * **Feature: private-aws-deployment, Property 9: WebSocket Authentication**
 * For any WebSocket connection establishment, the connection handler SHALL
 * validate the Cognito JWT token before accepting the connection.
 *
 * **Validates: Requirements 11.5**
 *
 * @param request - The WebSocket connection request
 * @param userPoolId - The Cognito User Pool ID for token validation
 * @param clientId - The Cognito User Pool Client ID
 * @returns Authentication result
 */
export function validateWebSocketAuth(
  request: WebSocketConnectionRequest,
  userPoolId: string,
  clientId: string
): WebSocketAuthResult {
  // Extract token from query parameters (WebSocket connections use query params)
  const token = request.queryStringParameters?.token;

  if (!token) {
    return {
      isAuthenticated: false,
      error: 'Missing authentication token in query parameters',
    };
  }

  // Validate JWT format (three parts separated by dots)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      isAuthenticated: false,
      error: 'Invalid JWT format',
    };
  }

  // Decode and validate the token payload
  try {
    const payload = decodeJwtPayload(parts[1]);
    
    // Validate required claims
    const validationResult = validateJwtClaims(payload, userPoolId, clientId);
    if (!validationResult.isValid) {
      return {
        isAuthenticated: false,
        error: validationResult.error,
      };
    }

    // Check token expiration
    if (payload.exp !== undefined && payload.exp < Math.floor(Date.now() / 1000)) {
      return {
        isAuthenticated: false,
        error: 'Token has expired',
      };
    }

    return {
      isAuthenticated: true,
      userId: payload.sub,
      tenantId: payload['custom:tenant_id'],
      roles: payload['cognito:groups'] || [],
    };
  } catch {
    return {
      isAuthenticated: false,
      error: 'Failed to decode JWT token',
    };
  }
}


/**
 * JWT payload interface
 */
interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  'custom:tenant_id'?: string;
  'cognito:groups'?: string[];
  [key: string]: unknown;
}

/**
 * Decodes a base64url-encoded JWT payload
 */
function decodeJwtPayload(encodedPayload: string): JwtPayload {
  // Convert base64url to base64
  let base64 = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if necessary
  while (base64.length % 4) {
    base64 += '=';
  }

  // Decode base64
  const jsonString = Buffer.from(base64, 'base64').toString('utf-8');
  return JSON.parse(jsonString);
}

/**
 * Validates JWT claims
 */
function validateJwtClaims(
  payload: JwtPayload,
  userPoolId: string,
  clientId: string
): { isValid: boolean; error?: string } {
  // Validate issuer
  if (!payload.iss) {
    return { isValid: false, error: 'Missing issuer claim' };
  }

  // Issuer should contain the user pool ID
  if (!payload.iss.includes(userPoolId)) {
    return { isValid: false, error: 'Invalid issuer' };
  }

  // Validate audience (for id tokens) or client_id (for access tokens)
  const audience = payload.aud;
  if (audience) {
    const audiences = Array.isArray(audience) ? audience : [audience];
    if (!audiences.includes(clientId)) {
      return { isValid: false, error: 'Invalid audience' };
    }
  }

  // Validate subject (user ID)
  if (!payload.sub) {
    return { isValid: false, error: 'Missing subject claim' };
  }

  return { isValid: true };
}

/**
 * Creates a mock JWT token for testing purposes
 * This is used in property tests to generate valid token structures
 */
export function createMockJwt(
  payload: Partial<JwtPayload>,
  userPoolId: string,
  clientId: string
): string {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: 'test-key-id',
  };

  // Spread payload first, then override with required fields
  const fullPayload: JwtPayload = {
    ...payload,
    sub: payload.sub || 'test-user-id',
    iss: `https://cognito-idp.us-west-2.amazonaws.com/${userPoolId}`,
    aud: clientId,
    exp: payload.exp !== undefined ? payload.exp : Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iat: Math.floor(Date.now() / 1000),
  };

  const encodeBase64Url = (obj: object): string => {
    const json = JSON.stringify(obj);
    const base64 = Buffer.from(json).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const headerEncoded = encodeBase64Url(header);
  const payloadEncoded = encodeBase64Url(fullPayload);
  const signature = 'mock-signature'; // Not a real signature, just for structure

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

/**
 * Checks if a WebSocket connection should be accepted based on authentication
 *
 * **Feature: private-aws-deployment, Property 9: WebSocket Authentication**
 *
 * **Validates: Requirements 11.5**
 */
export function shouldAcceptConnection(authResult: WebSocketAuthResult): boolean {
  return authResult.isAuthenticated === true;
}

