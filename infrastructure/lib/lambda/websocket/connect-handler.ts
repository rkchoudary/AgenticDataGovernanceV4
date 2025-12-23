/**
 * WebSocket Connect Handler
 * 
 * Handles WebSocket connection establishment with JWT authentication.
 * 
 * **Feature: private-aws-deployment, Property 9: WebSocket Authentication**
 * For any WebSocket connection establishment, the connection handler SHALL
 * validate the Cognito JWT token before accepting the connection.
 * 
 * Validates: Requirements 11.2, 11.5
 */

import { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  logInfo,
  logError,
  UnauthorizedError,
} from '../shared/error-handling.js';
import {
  validateWebSocketAuth,
  WebSocketConnectionRequest,
  shouldAcceptConnection,
} from '../../stacks/websocket-api-stack.js';

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID || '';
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID || '';

/**
 * WebSocket connect event structure
 */
export interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    eventType: string;
    requestId: string;
  };
  queryStringParameters?: Record<string, string>;
  headers?: Record<string, string>;
}

/**
 * Main handler for WebSocket $connect route
 * 
 * **Feature: private-aws-deployment, Property 9: WebSocket Authentication**
 * 
 * Validates: Requirements 11.2, 11.5
 */
export async function handler(event: WebSocketConnectEvent): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const correlationId = event.requestContext.requestId;

  try {
    logInfo('Processing WebSocket connect request', correlationId, {
      action: 'connect',
      metadata: { connectionId },
    });

    // Validate JWT token from query parameters
    // Validates: Requirements 11.5
    const authResult = validateWebSocketAuth(
      event as WebSocketConnectionRequest,
      USER_POOL_ID,
      USER_POOL_CLIENT_ID
    );

    if (!shouldAcceptConnection(authResult)) {
      logInfo('WebSocket connection rejected - authentication failed', correlationId, {
        action: 'connect',
        metadata: { connectionId, error: authResult.error },
      });

      throw new UnauthorizedError(authResult.error || 'Authentication failed');
    }

    logInfo('WebSocket connection accepted', correlationId, {
      tenantId: authResult.tenantId,
      userId: authResult.userId,
      action: 'connect',
      metadata: { connectionId },
    });

    // Return success to accept the connection
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Connected',
        connectionId,
      }),
    };
  } catch (error) {
    if (error instanceof Error) {
      logError(error, correlationId, {
        action: 'connect',
        metadata: { connectionId },
      });
    }

    // Return 401 to reject the connection
    return {
      statusCode: 401,
      body: JSON.stringify({
        error: 'Unauthorized',
        message: error instanceof Error ? error.message : 'Authentication failed',
      }),
    };
  }
}
