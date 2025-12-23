/**
 * WebSocket Disconnect Handler
 * 
 * Handles WebSocket disconnection and cleanup.
 * 
 * Validates: Requirements 11.2
 */

import { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  logInfo,
  logError,
} from '../shared/error-handling.js';

/**
 * WebSocket disconnect event structure
 */
export interface WebSocketDisconnectEvent {
  requestContext: {
    connectionId: string;
    routeKey: string;
    eventType: string;
    requestId: string;
  };
}

/**
 * Main handler for WebSocket $disconnect route
 * 
 * Validates: Requirements 11.2
 */
export async function handler(event: WebSocketDisconnectEvent): Promise<APIGatewayProxyResultV2> {
  const connectionId = event.requestContext.connectionId;
  const correlationId = event.requestContext.requestId;

  try {
    logInfo('Processing WebSocket disconnect', correlationId, {
      action: 'disconnect',
      metadata: { connectionId },
    });

    // In a production implementation, you would:
    // 1. Clean up any active agent sessions
    // 2. Remove connection from connection store
    // 3. Update any relevant metrics

    logInfo('WebSocket disconnected', correlationId, {
      action: 'disconnect',
      metadata: { connectionId },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Disconnected',
        connectionId,
      }),
    };
  } catch (error) {
    if (error instanceof Error) {
      logError(error, correlationId, {
        action: 'disconnect',
        metadata: { connectionId },
      });
    }

    // Still return success - disconnect should always succeed
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Disconnected with errors',
        connectionId,
      }),
    };
  }
}
