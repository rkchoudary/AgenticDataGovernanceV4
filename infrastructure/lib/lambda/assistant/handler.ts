/**
 * Assistant API Lambda Handler
 * 
 * Handles API requests for the AI Assistant including:
 * - Chat message streaming
 * - Tool execution
 * - Human gate decisions
 * - Session management
 * 
 * Validates: Requirements 1.1, 1.2, 13.1, 16.1-16.8
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayProxyEventV2 } from 'aws-lambda';
import { validateTenant, extractUserContext } from '../shared/tenant-validation';
import { createErrorResponse, createSuccessResponse, handleError } from '../shared/error-handling';

// ==================== Types ====================

interface ChatRequest {
  session_id: string;
  message: string;
  user_id: string;
  tenant_id: string;
  page_context?: {
    path: string;
    pageType: string;
    entityId?: string;
    entityType?: string;
    metadata?: Record<string, unknown>;
  };
}

interface ToolExecuteRequest {
  session_id: string;
  tool_name: string;
  parameters: Record<string, unknown>;
  user_id: string;
  tenant_id: string;
}

interface HumanGateDecisionRequest {
  action_id: string;
  decision: 'approved' | 'rejected' | 'deferred';
  rationale: string;
  decided_by: string;
}

interface SessionRequest {
  session_id: string;
  user_id: string;
  tenant_id: string;
}

// ==================== Main Handler ====================

/**
 * Main Lambda handler for assistant API endpoints
 */
export async function handler(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2
): Promise<APIGatewayProxyResult> {
  try {
    // Extract path and method
    const path = 'rawPath' in event ? event.rawPath : event.path;
    const method = 'requestContext' in event && 'http' in (event.requestContext as any)
      ? (event.requestContext as any).http.method
      : event.httpMethod;

    // Validate tenant context
    const userContext = extractUserContext(event);
    if (!userContext.tenantId) {
      return createErrorResponse(401, 'Unauthorized', 'Missing tenant context');
    }

    // Route to appropriate handler
    if (path.endsWith('/chat/stream') && method === 'POST') {
      return handleChatStream(event, userContext);
    }
    
    if (path.endsWith('/tool/execute') && method === 'POST') {
      return handleToolExecute(event, userContext);
    }
    
    if (path.endsWith('/human-gate/decision') && method === 'POST') {
      return handleHumanGateDecision(event, userContext);
    }
    
    if (path.endsWith('/human-gate/pending') && method === 'GET') {
      return handleGetPendingHumanGates(event, userContext);
    }
    
    if (path.endsWith('/session/restore') && method === 'POST') {
      return handleSessionRestore(event, userContext);
    }
    
    if (path.endsWith('/session/clear') && method === 'POST') {
      return handleSessionClear(event, userContext);
    }

    return createErrorResponse(404, 'Not Found', `Unknown endpoint: ${path}`);
  } catch (error) {
    return handleError(error);
  }
}

// ==================== Chat Handlers ====================

/**
 * Handle streaming chat request
 * Note: For actual streaming, use WebSocket or API Gateway HTTP API with streaming
 * This handler returns a non-streaming response for REST API compatibility
 * 
 * Validates: Requirements 1.1, 1.2
 */
async function handleChatStream(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  userContext: { userId: string; tenantId: string }
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as ChatRequest;

  // Validate request
  if (!body.session_id || !body.message || !body.user_id || !body.tenant_id) {
    return createErrorResponse(400, 'Bad Request', 'Missing required fields');
  }

  // Validate tenant isolation
  if (body.tenant_id !== userContext.tenantId) {
    return createErrorResponse(403, 'Forbidden', 'Tenant mismatch');
  }

  try {
    // In production, this would:
    // 1. Initialize the AssistantService with MemoryService and ToolService
    // 2. Call the chat method and stream responses
    // 3. For REST API, collect all chunks and return as single response
    
    // For now, return a mock response structure
    const response = {
      message_id: generateId(),
      content: `I received your message: "${body.message}". How can I help you further?`,
      tool_calls: [],
      references: [],
      quick_actions: [
        { id: generateId(), label: 'Show report catalog', type: 'query', action: 'Show me the regulatory report catalog' },
        { id: generateId(), label: 'Check issues', type: 'query', action: 'Are there any open data quality issues?' },
      ],
    };

    return createSuccessResponse(response);
  } catch (error) {
    return handleError(error);
  }
}

// ==================== Tool Handlers ====================

/**
 * Handle tool execution request
 * Validates: Requirements 11.1, 11.5
 */
async function handleToolExecute(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  userContext: { userId: string; tenantId: string }
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as ToolExecuteRequest;

  // Validate request
  if (!body.session_id || !body.tool_name || !body.user_id || !body.tenant_id) {
    return createErrorResponse(400, 'Bad Request', 'Missing required fields');
  }

  // Validate tenant isolation
  if (body.tenant_id !== userContext.tenantId) {
    return createErrorResponse(403, 'Forbidden', 'Tenant mismatch');
  }

  try {
    // In production, this would:
    // 1. Initialize the ToolService
    // 2. Execute the requested tool with parameters
    // 3. Log the execution for audit trail
    
    const response = {
      call_id: generateId(),
      tool_name: body.tool_name,
      success: true,
      result: { status: 'executed' },
      duration: 150,
    };

    return createSuccessResponse(response);
  } catch (error) {
    return handleError(error);
  }
}

// ==================== Human Gate Handlers ====================

/**
 * Handle human gate decision submission
 * Validates: Requirements 9.1, 9.3
 */
async function handleHumanGateDecision(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  userContext: { userId: string; tenantId: string }
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as HumanGateDecisionRequest;

  // Validate request
  if (!body.action_id || !body.decision || !body.rationale || !body.decided_by) {
    return createErrorResponse(400, 'Bad Request', 'Missing required fields');
  }

  try {
    // In production, this would:
    // 1. Retrieve the pending human gate action
    // 2. Validate the user has permission to decide
    // 3. Process the decision via AssistantService
    // 4. Log to episodic memory for audit trail
    
    const response = {
      action_id: body.action_id,
      decision: body.decision,
      rationale: body.rationale,
      decided_by: body.decided_by,
      decided_at: new Date().toISOString(),
    };

    return createSuccessResponse(response);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Get pending human gate actions for a user
 * Validates: Requirements 9.1
 */
async function handleGetPendingHumanGates(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  userContext: { userId: string; tenantId: string }
): Promise<APIGatewayProxyResult> {
  const queryParams = 'queryStringParameters' in event ? event.queryStringParameters : {};
  const userId = queryParams?.user_id;
  const tenantId = queryParams?.tenant_id;

  // Validate tenant isolation
  if (tenantId && tenantId !== userContext.tenantId) {
    return createErrorResponse(403, 'Forbidden', 'Tenant mismatch');
  }

  try {
    // In production, this would:
    // 1. Query pending human gate actions for the user
    // 2. Filter by tenant and user permissions
    
    const response: unknown[] = [];

    return createSuccessResponse(response);
  } catch (error) {
    return handleError(error);
  }
}

// ==================== Session Handlers ====================

/**
 * Restore session from memory service
 * Validates: Requirements 13.1, 13.3
 */
async function handleSessionRestore(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  userContext: { userId: string; tenantId: string }
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as SessionRequest;

  // Validate request
  if (!body.session_id || !body.user_id || !body.tenant_id) {
    return createErrorResponse(400, 'Bad Request', 'Missing required fields');
  }

  // Validate tenant isolation
  if (body.tenant_id !== userContext.tenantId) {
    return createErrorResponse(403, 'Forbidden', 'Tenant mismatch');
  }

  try {
    // In production, this would:
    // 1. Initialize MemoryService with AgentCore
    // 2. Retrieve session context from short-term memory
    // 3. Return messages and context summary
    
    const response = {
      messages: [],
      context_summary: null,
      entities: [],
    };

    return createSuccessResponse(response);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Clear session in memory service
 * Validates: Requirements 13.5
 */
async function handleSessionClear(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
  userContext: { userId: string; tenantId: string }
): Promise<APIGatewayProxyResult> {
  const body = JSON.parse(event.body || '{}') as SessionRequest;

  // Validate request
  if (!body.session_id || !body.user_id || !body.tenant_id) {
    return createErrorResponse(400, 'Bad Request', 'Missing required fields');
  }

  // Validate tenant isolation
  if (body.tenant_id !== userContext.tenantId) {
    return createErrorResponse(403, 'Forbidden', 'Tenant mismatch');
  }

  try {
    // In production, this would:
    // 1. Initialize MemoryService with AgentCore
    // 2. Clear the session from short-term memory
    
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

// ==================== Utility Functions ====================

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
