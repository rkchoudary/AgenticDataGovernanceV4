/**
 * Agent Proxy Lambda Handler
 * 
 * Implements agent routing logic and AgentCore invocation with user context.
 * 
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 * For any API request to /api/agents/{agentType}, the request SHALL be routed
 * to the AgentCore agent ARN corresponding to that agent type.
 * 
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 * For any AgentCore agent invocation, the request SHALL include the user's
 * tenant_id and user_id extracted from the JWT token.
 * 
 * Validates: Requirements 2.2, 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  extractRequestContext,
  validateTenantContext,
  getCorrelationId,
} from '../shared/tenant-validation.js';
import {
  createSuccessResponse,
  createErrorResponse,
  logInfo,
  logError,
  ValidationError,
  NotFoundError,
  LambdaError,
} from '../shared/error-handling.js';
import { RequestContext } from '../shared/types.js';

/**
 * Valid agent types for routing
 * 
 * Validates: Requirements 2.2, 5.2
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
 * Agent ARN mapping from environment variables
 */
export interface AgentArns {
  regulatory: string;
  dataRequirements: string;
  cdeIdentification: string;
  dataQuality: string;
  lineageMapping: string;
  issueManagement: string;
  documentation: string;
  orchestrator: string;
}

/**
 * Agent invocation request structure
 * 
 * Validates: Requirements 5.4
 */
export interface AgentInvocationRequest {
  agentId: string;
  sessionId?: string;
  inputText: string;
  context: AgentUserContext;
}

/**
 * User context passed to AgentCore agents
 * 
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 * 
 * Validates: Requirements 5.4
 */
export interface AgentUserContext {
  tenantId: string;
  userId: string;
  correlationId: string;
  email?: string;
  roles?: string[];
}

/**
 * Agent invocation response structure
 */
export interface AgentInvocationResponse {
  sessionId: string;
  outputText: string;
  citations?: Citation[];
  trace?: AgentTrace;
  isComplete: boolean;
}

export interface Citation {
  text: string;
  source: string;
}

export interface AgentTrace {
  steps: TraceStep[];
}

export interface TraceStep {
  type: string;
  content: string;
  timestamp: string;
}

/**
 * Agent session information
 */
export interface AgentSession {
  sessionId: string;
  agentType: AgentType;
  tenantId: string;
  userId: string;
  status: 'active' | 'completed' | 'error';
  createdAt: string;
  lastActivityAt: string;
}

/**
 * Error response for agent invocation failures
 * 
 * Validates: Requirements 5.5
 */
export interface AgentErrorResponse {
  error: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  correlationId: string;
}

// Environment variables
const AGENT_ARNS_JSON = process.env.AGENT_ARNS || '{}';

/**
 * AgentCore client interface (to be injected for testing)
 */
export interface AgentCoreClient {
  invokeAgent(params: {
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

// Default client (will be replaced with actual AWS SDK client in production)
let agentCoreClient: AgentCoreClient;

/**
 * Sets the AgentCore client (for dependency injection in tests)
 */
export function setAgentCoreClient(client: AgentCoreClient): void {
  agentCoreClient = client;
}

/**
 * Parses agent ARNs from environment variable
 */
export function parseAgentArns(): AgentArns {
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
 * Validates if a string is a valid agent type
 * 
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 * 
 * Validates: Requirements 2.2, 5.2
 */
export function isValidAgentType(agentType: string): agentType is AgentType {
  return AGENT_TYPES.includes(agentType as AgentType);
}

/**
 * Gets the agent ARN for a given agent type
 * 
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 * For any API request to /api/agents/{agentType}, the request SHALL be routed
 * to the AgentCore agent ARN corresponding to that agent type.
 * 
 * Validates: Requirements 2.2, 5.2
 */
export function getAgentArn(
  agentType: AgentType,
  agentArns: AgentArns
): string {
  const arn = agentArns[agentType];
  if (!arn || arn.trim().length === 0) {
    throw new NotFoundError(`No ARN configured for agent type: ${agentType}`);
  }
  return arn;
}

/**
 * Extracts agent ID and alias ID from an AgentCore ARN
 * 
 * ARN format: arn:aws:bedrock-agentcore:region:account:runtime/AgentName-agentId
 */
export function parseAgentArn(arn: string): { agentId: string; agentAliasId: string } {
  // Extract the agent ID from the ARN
  const match = arn.match(/runtime\/([^/]+)$/);
  if (!match) {
    throw new ValidationError(`Invalid agent ARN format: ${arn}`);
  }
  
  const agentIdentifier = match[1];
  // The agent identifier contains the name and ID, e.g., "AgentName-agentId"
  const parts = agentIdentifier.split('-');
  if (parts.length < 2) {
    throw new ValidationError(`Invalid agent identifier format: ${agentIdentifier}`);
  }
  
  // The last part is the agent ID
  const agentId = parts[parts.length - 1];
  
  return {
    agentId,
    agentAliasId: 'TSTALIASID', // Default alias for testing; in production, this would be configured
  };
}

/**
 * Creates user context for agent invocation
 * 
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 * For any AgentCore agent invocation, the request SHALL include the user's
 * tenant_id and user_id extracted from the JWT token.
 * 
 * Validates: Requirements 5.4
 */
export function createAgentUserContext(
  requestContext: RequestContext
): AgentUserContext {
  if (!requestContext.tenantId || requestContext.tenantId.trim().length === 0) {
    throw new ValidationError('tenant_id is required in request context');
  }
  
  if (!requestContext.userId || requestContext.userId.trim().length === 0) {
    throw new ValidationError('user_id is required in request context');
  }
  
  return {
    tenantId: requestContext.tenantId,
    userId: requestContext.userId,
    correlationId: requestContext.correlationId,
    email: requestContext.email,
    roles: requestContext.roles,
  };
}

/**
 * Validates that user context contains required fields
 * 
 * Validates: Requirements 5.4
 */
export function validateUserContext(context: AgentUserContext): string | null {
  if (!context.tenantId || context.tenantId.trim().length === 0) {
    return 'tenant_id is required';
  }
  
  if (!context.userId || context.userId.trim().length === 0) {
    return 'user_id is required';
  }
  
  if (!context.correlationId || context.correlationId.trim().length === 0) {
    return 'correlation_id is required';
  }
  
  return null;
}

/**
 * Generates a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Creates an error response with retry guidance
 * 
 * Validates: Requirements 5.5
 */
export function createAgentErrorResponse(
  error: Error,
  correlationId: string,
  retryable: boolean = false,
  retryAfterMs?: number
): AgentErrorResponse {
  return {
    error: error.name || 'AgentError',
    message: error.message || 'Agent invocation failed',
    retryable,
    retryAfterMs,
    correlationId,
  };
}

/**
 * Determines if an error is retryable
 * 
 * Validates: Requirements 5.5
 */
export function isRetryableError(error: Error): boolean {
  const retryableErrors = [
    'ThrottlingException',
    'ServiceUnavailableException',
    'InternalServerException',
    'TooManyRequestsException',
  ];
  
  return retryableErrors.includes(error.name);
}


/**
 * Main Lambda handler
 * 
 * Validates: Requirements 2.2, 5.1, 5.2, 5.3, 5.4, 5.5
 */
export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const correlationId = getCorrelationId(event.headers || {}, event.requestContext?.requestId);
  
  try {
    // Extract and validate request context
    const requestContext = extractRequestContext(event as Parameters<typeof extractRequestContext>[0]);
    const validationError = validateTenantContext(requestContext);
    
    if (validationError || !requestContext) {
      throw new ValidationError(validationError || 'Invalid authentication context');
    }

    logInfo('Processing agent request', correlationId, {
      tenantId: requestContext.tenantId,
      userId: requestContext.userId,
      action: `${event.requestContext.http.method} ${event.rawPath}`,
    });

    // Route to appropriate handler based on HTTP method and path
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    const pathParams = event.pathParameters || {};

    // GET /api/agents - List available agents
    if (path === '/api/agents' && method === 'GET') {
      return await listAgents(requestContext, correlationId);
    }
    
    // POST /api/agents/{agentType} - Invoke specific agent
    if (path.match(/^\/api\/agents\/[^/]+$/) && method === 'POST') {
      return await invokeAgent(requestContext, pathParams.agentType!, event, correlationId);
    }
    
    // POST /api/agents/{agentType}/session - Create agent session
    if (path.match(/^\/api\/agents\/[^/]+\/session$/) && method === 'POST') {
      return await createSession(requestContext, pathParams.agentType!, event, correlationId);
    }
    
    // GET /api/agents/{agentType}/session/{sessionId} - Get session status
    if (path.match(/^\/api\/agents\/[^/]+\/session\/[^/]+$/) && method === 'GET') {
      return await getSessionStatus(
        requestContext,
        pathParams.agentType!,
        pathParams.sessionId!,
        correlationId
      );
    }

    throw new NotFoundError(`Route not found: ${method} ${path}`);
  } catch (error) {
    if (error instanceof Error) {
      logError(error, correlationId);
      return createErrorResponse(error, correlationId);
    }
    return createErrorResponse(new LambdaError('Unknown error'), correlationId);
  }
}

/**
 * Lists available agents
 * 
 * Validates: Requirements 5.1
 */
async function listAgents(
  context: RequestContext,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  const agentArns = parseAgentArns();
  
  const agents = AGENT_TYPES.map(agentType => ({
    type: agentType,
    name: formatAgentName(agentType),
    description: getAgentDescription(agentType),
    available: !!agentArns[agentType] && agentArns[agentType].trim().length > 0,
  }));

  logInfo('Listed agents', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'listAgents',
    metadata: { count: agents.length },
  });

  return createSuccessResponse({ agents }, correlationId);
}

/**
 * Invokes a specific agent
 * 
 * **Feature: private-aws-deployment, Property 1: Agent Routing Correctness**
 * **Feature: private-aws-deployment, Property 12: User Context Propagation**
 * 
 * Validates: Requirements 2.2, 5.2, 5.3, 5.4, 5.5
 */
async function invokeAgent(
  context: RequestContext,
  agentType: string,
  event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  // Validate agent type
  if (!isValidAgentType(agentType)) {
    throw new ValidationError(`Invalid agent type: ${agentType}. Valid types: ${AGENT_TYPES.join(', ')}`);
  }

  // Parse request body
  const body = JSON.parse(event.body || '{}');
  
  if (!body.inputText || typeof body.inputText !== 'string' || body.inputText.trim().length === 0) {
    throw new ValidationError('inputText is required and must be a non-empty string');
  }

  // Get agent ARN
  const agentArns = parseAgentArns();
  const agentArn = getAgentArn(agentType, agentArns);
  
  // Parse agent ARN to get agent ID and alias
  const { agentId, agentAliasId } = parseAgentArn(agentArn);

  // Create user context for agent invocation
  // Validates: Requirements 5.4
  const userContext = createAgentUserContext(context);
  const contextValidationError = validateUserContext(userContext);
  if (contextValidationError) {
    throw new ValidationError(contextValidationError);
  }

  // Generate or use provided session ID
  const sessionId = body.sessionId || generateSessionId();

  logInfo('Invoking agent', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'invokeAgent',
    metadata: { agentType, sessionId },
  });

  try {
    // Invoke the agent with user context
    const response = await agentCoreClient.invokeAgent({
      agentId,
      agentAliasId,
      sessionId,
      inputText: body.inputText,
      sessionState: {
        sessionAttributes: {
          tenant_id: userContext.tenantId,
          user_id: userContext.userId,
          correlation_id: userContext.correlationId,
          email: userContext.email || '',
          roles: JSON.stringify(userContext.roles || []),
        },
      },
    });

    // Collect response chunks
    let outputText = '';
    if (response.completion) {
      for await (const chunk of response.completion) {
        if (chunk.chunk?.bytes) {
          outputText += new TextDecoder().decode(chunk.chunk.bytes);
        }
      }
    }

    const result: AgentInvocationResponse = {
      sessionId: response.sessionId || sessionId,
      outputText,
      isComplete: true,
    };

    logInfo('Agent invocation completed', correlationId, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'invokeAgent',
      metadata: { agentType, sessionId, outputLength: outputText.length },
    });

    return createSuccessResponse(result, correlationId);
  } catch (error) {
    // Handle agent invocation errors with retry guidance
    // Validates: Requirements 5.5
    if (error instanceof Error) {
      const retryable = isRetryableError(error);
      // Create error response for logging purposes
      createAgentErrorResponse(
        error,
        correlationId,
        retryable,
        retryable ? 1000 : undefined
      );

      logError(error, correlationId, {
        tenantId: context.tenantId,
        userId: context.userId,
        action: 'invokeAgent',
        metadata: { agentType, sessionId, retryable },
      });

      return createErrorResponse(
        new LambdaError(
          `Agent invocation failed: ${error.message}${retryable ? '. This error is retryable.' : ''}`,
          502,
          'AgentError'
        ),
        correlationId
      );
    }
    throw error;
  }
}


/**
 * Creates a new agent session
 * 
 * Validates: Requirements 5.1, 5.4
 */
async function createSession(
  context: RequestContext,
  agentType: string,
  _event: APIGatewayProxyEventV2,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  // Validate agent type
  if (!isValidAgentType(agentType)) {
    throw new ValidationError(`Invalid agent type: ${agentType}. Valid types: ${AGENT_TYPES.join(', ')}`);
  }

  // Verify agent is available
  const agentArns = parseAgentArns();
  getAgentArn(agentType, agentArns); // Throws if not configured

  // Generate session ID
  const sessionId = generateSessionId();
  const now = new Date().toISOString();

  const session: AgentSession = {
    sessionId,
    agentType,
    tenantId: context.tenantId,
    userId: context.userId,
    status: 'active',
    createdAt: now,
    lastActivityAt: now,
  };

  logInfo('Created agent session', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'createSession',
    metadata: { agentType, sessionId },
  });

  return createSuccessResponse(session, correlationId, 201);
}

/**
 * Gets the status of an agent session
 * 
 * Validates: Requirements 5.1
 */
async function getSessionStatus(
  context: RequestContext,
  agentType: string,
  sessionId: string,
  correlationId: string
): Promise<APIGatewayProxyResultV2> {
  // Validate agent type
  if (!isValidAgentType(agentType)) {
    throw new ValidationError(`Invalid agent type: ${agentType}. Valid types: ${AGENT_TYPES.join(', ')}`);
  }

  // In a real implementation, this would query a session store
  // For now, return a mock session status
  const session: AgentSession = {
    sessionId,
    agentType,
    tenantId: context.tenantId,
    userId: context.userId,
    status: 'active',
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };

  logInfo('Retrieved session status', correlationId, {
    tenantId: context.tenantId,
    userId: context.userId,
    action: 'getSessionStatus',
    metadata: { agentType, sessionId },
  });

  return createSuccessResponse(session, correlationId);
}

/**
 * Formats agent type to human-readable name
 */
function formatAgentName(agentType: AgentType): string {
  const names: Record<AgentType, string> = {
    regulatory: 'Regulatory Intelligence Agent',
    dataRequirements: 'Data Requirements Agent',
    cdeIdentification: 'CDE Identification Agent',
    dataQuality: 'Data Quality Rule Agent',
    lineageMapping: 'Lineage Mapping Agent',
    issueManagement: 'Issue Management Agent',
    documentation: 'Documentation Agent',
    orchestrator: 'Governance Orchestrator',
  };
  return names[agentType];
}

/**
 * Gets description for an agent type
 */
function getAgentDescription(agentType: AgentType): string {
  const descriptions: Record<AgentType, string> = {
    regulatory: 'Analyzes regulatory requirements and tracks compliance changes',
    dataRequirements: 'Extracts and manages data requirements from regulatory documents',
    cdeIdentification: 'Identifies and scores Critical Data Elements',
    dataQuality: 'Generates and manages data quality rules',
    lineageMapping: 'Maps data lineage and tracks data flow',
    issueManagement: 'Manages data governance issues and remediation',
    documentation: 'Generates compliance documentation and reports',
    orchestrator: 'Coordinates multi-agent governance workflows',
  };
  return descriptions[agentType];
}
