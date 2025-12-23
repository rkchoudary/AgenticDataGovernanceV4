/**
 * WebSocket Agent Stream Handler
 * 
 * Implements response streaming for AgentCore agent interactions via WebSocket.
 * 
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 * 
 * Validates: Requirements 5.3, 5.5, 11.3
 */

import { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  logInfo,
  logError,
  ValidationError,
} from '../shared/error-handling.js';
import {
  AGENT_TYPES,
  AgentType,
  AgentArns,
  AgentUserContext,
  isValidAgentType,
  getAgentArn,
  parseAgentArn,
  generateSessionId,
  isRetryableError,
} from '../agent-proxy/handler.js';

/**
 * WebSocket event structure
 */
export interface WebSocketEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    eventType: string;
    domainName: string;
    stage: string;
    requestId: string;
  };
  body?: string;
  queryStringParameters?: Record<string, string>;
}

/**
 * WebSocket message structure for agent requests
 */
export interface AgentStreamRequest {
  action: 'agent';
  agentType: string;
  inputText: string;
  sessionId?: string;
  context?: {
    tenantId: string;
    userId: string;
    correlationId?: string;
  };
}

/**
 * WebSocket message structure for streaming responses
 */
export interface AgentStreamMessage {
  type: 'chunk' | 'complete' | 'error';
  sessionId: string;
  agentType: string;
  content?: string;
  error?: {
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
  };
  timestamp: string;
}

/**
 * API Gateway Management API client interface
 */
export interface ApiGatewayManagementClient {
  postToConnection(params: {
    ConnectionId: string;
    Data: string | Buffer;
  }): Promise<void>;
}

/**
 * AgentCore client interface for streaming
 */
export interface AgentCoreStreamClient {
  invokeAgentWithResponseStream(params: {
    agentAliasId: string;
    agentId: string;
    sessionId: string;
    inputText: string;
    sessionState?: {
      sessionAttributes?: Record<string, string>;
    };
  }): Promise<{
    completion?: AsyncIterable<{ chunk?: { bytes?: Uint8Array } }>;
    sessionId?: string;
  }>;
}

// Environment variables
const AGENT_ARNS_JSON = process.env.AGENT_ARNS || '{}';

// Clients (to be injected for testing)
let apiGatewayClient: ApiGatewayManagementClient;
let agentCoreClient: AgentCoreStreamClient;

/**
 * Sets the API Gateway Management client (for dependency injection)
 */
export function setApiGatewayClient(client: ApiGatewayManagementClient): void {
  apiGatewayClient = client;
}

/**
 * Sets the AgentCore client (for dependency injection)
 */
export function setAgentCoreStreamClient(client: AgentCoreStreamClient): void {
  agentCoreClient = client;
}

/**
 * Parses agent ARNs from environment variable
 */
function parseAgentArns(): AgentArns {
  try {
    return JSON.parse(AGENT_ARNS_JSON) as AgentArns;
  } catch {
    return {
      regulatory: '',
      dataRequirements: '',
      cdeIdentification: '',
      dataQuality: '',
      lineageMapping: '',
      issueManagement: '',
      documentation: '',
      orchestrator: '',
    };
  }
}


/**
 * Main WebSocket handler for agent streaming
 * 
 * Validates: Requirements 5.3, 11.3
 */
export async function handler(event: WebSocketEvent): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const correlationId = event.requestContext.requestId;
  
  try {
    logInfo('Processing WebSocket agent request', correlationId, {
      action: 'agentStream',
      metadata: { connectionId, routeKey: event.requestContext.routeKey },
    });

    // Parse the request body
    if (!event.body) {
      throw new ValidationError('Request body is required');
    }

    const request = JSON.parse(event.body) as AgentStreamRequest;
    
    // Validate request
    validateAgentStreamRequest(request);

    // Stream agent response
    await streamAgentResponse(
      connectionId,
      request,
      event.requestContext.domainName,
      event.requestContext.stage,
      correlationId
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Streaming started' }),
    };
  } catch (error) {
    if (error instanceof Error) {
      logError(error, correlationId, {
        action: 'agentStream',
        metadata: { connectionId },
      });

      // Send error message to client
      await sendErrorToClient(
        connectionId,
        error,
        event.requestContext.domainName,
        event.requestContext.stage,
        correlationId
      );
    }

    return {
      statusCode: error instanceof ValidationError ? 400 : 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

/**
 * Validates the agent stream request
 */
function validateAgentStreamRequest(request: AgentStreamRequest): void {
  if (!request.agentType) {
    throw new ValidationError('agentType is required');
  }

  if (!isValidAgentType(request.agentType)) {
    throw new ValidationError(
      `Invalid agent type: ${request.agentType}. Valid types: ${AGENT_TYPES.join(', ')}`
    );
  }

  if (!request.inputText || request.inputText.trim().length === 0) {
    throw new ValidationError('inputText is required and must be non-empty');
  }

  if (!request.context?.tenantId) {
    throw new ValidationError('context.tenantId is required');
  }

  if (!request.context?.userId) {
    throw new ValidationError('context.userId is required');
  }
}

/**
 * Streams agent response to the WebSocket client
 * 
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 * 
 * Validates: Requirements 5.3, 5.4, 5.5
 */
async function streamAgentResponse(
  connectionId: string,
  request: AgentStreamRequest,
  domainName: string,
  stage: string,
  correlationId: string
): Promise<void> {
  const agentType = request.agentType as AgentType;
  const sessionId = request.sessionId || generateSessionId();
  
  // Get agent ARN
  const agentArns = parseAgentArns();
  const agentArn = getAgentArn(agentType, agentArns);
  const { agentId, agentAliasId } = parseAgentArn(agentArn);

  // Create user context for agent invocation
  // Validates: Requirements 5.4
  const userContext: AgentUserContext = {
    tenantId: request.context!.tenantId,
    userId: request.context!.userId,
    correlationId: request.context?.correlationId || correlationId,
  };

  logInfo('Starting agent stream', correlationId, {
    tenantId: userContext.tenantId,
    userId: userContext.userId,
    action: 'streamAgentResponse',
    metadata: { agentType, sessionId, connectionId },
  });

  try {
    // Invoke agent with streaming
    const response = await agentCoreClient.invokeAgentWithResponseStream({
      agentId,
      agentAliasId,
      sessionId,
      inputText: request.inputText,
      sessionState: {
        sessionAttributes: {
          tenant_id: userContext.tenantId,
          user_id: userContext.userId,
          correlation_id: userContext.correlationId,
        },
      },
    });

    // Stream response chunks to client
    // Validates: Requirements 5.3
    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          const content = new TextDecoder().decode(chunk.chunk.bytes);
          
          const message: AgentStreamMessage = {
            type: 'chunk',
            sessionId,
            agentType,
            content,
            timestamp: new Date().toISOString(),
          };

          await sendMessageToClient(connectionId, message, domainName, stage);
        }
      }
    }

    // Send completion message
    const completeMessage: AgentStreamMessage = {
      type: 'complete',
      sessionId,
      agentType,
      timestamp: new Date().toISOString(),
    };

    await sendMessageToClient(connectionId, completeMessage, domainName, stage);

    logInfo('Agent stream completed', correlationId, {
      tenantId: userContext.tenantId,
      userId: userContext.userId,
      action: 'streamAgentResponse',
      metadata: { agentType, sessionId, connectionId },
    });
  } catch (error) {
    // Handle agent errors with retry guidance
    // Validates: Requirements 5.5
    if (error instanceof Error) {
      const retryable = isRetryableError(error);
      
      const errorMessage: AgentStreamMessage = {
        type: 'error',
        sessionId,
        agentType,
        error: {
          message: error.message,
          retryable,
          retryAfterMs: retryable ? 1000 : undefined,
        },
        timestamp: new Date().toISOString(),
      };

      await sendMessageToClient(connectionId, errorMessage, domainName, stage);

      logError(error, correlationId, {
        tenantId: userContext.tenantId,
        userId: userContext.userId,
        action: 'streamAgentResponse',
        metadata: { agentType, sessionId, connectionId, retryable },
      });
    }
    throw error;
  }
}


/**
 * Sends a message to the WebSocket client
 */
async function sendMessageToClient(
  connectionId: string,
  message: AgentStreamMessage,
  _domainName: string,
  _stage: string
): Promise<void> {
  const data = JSON.stringify(message);
  
  await apiGatewayClient.postToConnection({
    ConnectionId: connectionId,
    Data: data,
  });
}

/**
 * Sends an error message to the WebSocket client
 * 
 * Validates: Requirements 5.5
 */
async function sendErrorToClient(
  connectionId: string,
  error: Error,
  _domainName: string,
  _stage: string,
  correlationId: string
): Promise<void> {
  const retryable = isRetryableError(error);
  
  const errorMessage: AgentStreamMessage = {
    type: 'error',
    sessionId: '',
    agentType: '',
    error: {
      message: error.message,
      retryable,
      retryAfterMs: retryable ? 1000 : undefined,
    },
    timestamp: new Date().toISOString(),
  };

  try {
    await sendMessageToClient(connectionId, errorMessage, _domainName, _stage);
  } catch (sendError) {
    // Log but don't throw - the connection might be closed
    logError(sendError as Error, correlationId, {
      action: 'sendErrorToClient',
      metadata: { connectionId },
    });
  }
}

/**
 * Creates a WebSocket endpoint URL
 */
export function createWebSocketEndpoint(domainName: string, stage: string): string {
  return `https://${domainName}/${stage}`;
}

/**
 * Validates that a connection ID is valid
 */
export function isValidConnectionId(connectionId: string | undefined): boolean {
  return !!connectionId && connectionId.trim().length > 0;
}
