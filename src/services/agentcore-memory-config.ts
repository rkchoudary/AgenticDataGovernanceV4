/**
 * AgentCore Memory Configuration
 * 
 * Provides configuration and initialization for AWS Bedrock AgentCore Memory.
 * Implements session initialization with memory_id, session_id, and actor_id.
 * 
 * Validates: Requirements 17.1, 17.2, 17.3
 */

import { v4 as uuidv4 } from 'uuid';
import { AgentCoreMemoryConfig, MemoryService } from '../types/memory.js';
import { AgentCoreMemoryService, AgentCoreMemoryClient, MockAgentCoreMemoryClient } from './agentcore-memory-adapter.js';
import { InMemoryMemoryService } from './memory-service.js';

// ==================== Types ====================

/**
 * Environment configuration for AgentCore Memory
 */
export interface AgentCoreEnvironmentConfig {
  /** AWS Region for AgentCore */
  region: string;
  /** Memory namespace/identifier */
  memoryId: string;
  /** Whether to use mock client for testing */
  useMockClient: boolean;
  /** Fallback to in-memory if AgentCore unavailable */
  enableFallback: boolean;
}

/**
 * Session initialization parameters
 */
export interface SessionInitParams {
  /** User ID for the session */
  userId: string;
  /** Tenant ID for data isolation */
  tenantId: string;
  /** Optional existing session ID to restore */
  sessionId?: string;
}

/**
 * Initialized session context
 */
export interface InitializedSession {
  /** Session ID */
  sessionId: string;
  /** Memory configuration */
  config: AgentCoreMemoryConfig;
  /** Memory service instance */
  memoryService: MemoryService;
  /** Whether this is a restored session */
  isRestored: boolean;
}

// ==================== Default Configuration ====================

/**
 * Get default environment configuration
 */
function getDefaultEnvironmentConfig(): AgentCoreEnvironmentConfig {
  return {
    region: process.env.AWS_REGION || process.env.AGENTCORE_REGION || 'us-east-1',
    memoryId: process.env.AGENTCORE_MEMORY_ID || 'regulatory-ai-assistant',
    useMockClient: process.env.NODE_ENV === 'test' || process.env.USE_MOCK_AGENTCORE === 'true',
    enableFallback: process.env.AGENTCORE_ENABLE_FALLBACK !== 'false',
  };
}

// ==================== AgentCore Memory Manager ====================

/**
 * Manager for AgentCore Memory connections and sessions
 * 
 * Validates: Requirements 17.1, 17.2, 17.3
 */
export class AgentCoreMemoryManager {
  private envConfig: AgentCoreEnvironmentConfig;
  private memoryServices: Map<string, MemoryService> = new Map();
  private agentCoreClient: AgentCoreMemoryClient | null = null;
  private fallbackService: MemoryService | null = null;

  constructor(envConfig?: Partial<AgentCoreEnvironmentConfig>) {
    this.envConfig = { ...getDefaultEnvironmentConfig(), ...envConfig };
  }

  /**
   * Initialize the AgentCore Memory client
   * Validates: Requirements 17.1
   */
  async initialize(): Promise<void> {
    if (this.envConfig.useMockClient) {
      this.agentCoreClient = new MockAgentCoreMemoryClient();
      return;
    }

    try {
      // In production, this would initialize the actual AWS SDK client
      // For now, we use the mock client
      this.agentCoreClient = await this.createAgentCoreClient();
    } catch (error) {
      console.error('Failed to initialize AgentCore Memory client:', error);
      
      if (this.envConfig.enableFallback) {
        console.warn('Falling back to in-memory storage');
        this.fallbackService = new InMemoryMemoryService();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create the AgentCore Memory client
   * In production, this would use the AWS SDK
   */
  private async createAgentCoreClient(): Promise<AgentCoreMemoryClient> {
    // TODO: Replace with actual AWS SDK initialization
    // const { BedrockAgentCoreClient } = await import('@aws-sdk/client-bedrock-agentcore');
    // return new BedrockAgentCoreClient({ region: this.envConfig.region });
    
    // For now, return mock client
    return new MockAgentCoreMemoryClient();
  }

  /**
   * Initialize a session with AgentCore Memory
   * Validates: Requirements 17.2, 17.3
   */
  async initializeSession(params: SessionInitParams): Promise<InitializedSession> {
    const sessionId = params.sessionId || uuidv4();
    const actorId = `${params.tenantId}:${params.userId}`;

    // Create memory configuration
    const config: AgentCoreMemoryConfig = {
      memoryId: this.envConfig.memoryId,
      sessionId,
      actorId,
      region: this.envConfig.region,
    };

    // Get or create memory service for this session
    let memoryService = this.memoryServices.get(sessionId);
    let isRestored = false;

    if (!memoryService) {
      if (this.fallbackService) {
        // Use fallback in-memory service
        memoryService = this.fallbackService;
      } else if (this.agentCoreClient) {
        // Create AgentCore memory service
        memoryService = new AgentCoreMemoryService(config, this.agentCoreClient);
      } else {
        // Initialize client if not done yet
        await this.initialize();
        
        if (this.fallbackService) {
          memoryService = this.fallbackService;
        } else if (this.agentCoreClient) {
          memoryService = new AgentCoreMemoryService(config, this.agentCoreClient);
        } else {
          throw new Error('Failed to initialize memory service');
        }
      }

      this.memoryServices.set(sessionId, memoryService);
    }

    // Check if session exists (for restoration)
    if (params.sessionId) {
      const existingContext = await memoryService.getSessionContext(sessionId);
      isRestored = existingContext !== null && existingContext.messages.length > 0;
    }

    // Initialize session context if new
    if (!isRestored) {
      await memoryService.updateSessionContext(sessionId, []);
    }

    return {
      sessionId,
      config,
      memoryService,
      isRestored,
    };
  }

  /**
   * Get memory service for an existing session
   */
  getMemoryService(sessionId: string): MemoryService | null {
    return this.memoryServices.get(sessionId) || this.fallbackService;
  }

  /**
   * Close a session and cleanup resources
   */
  async closeSession(sessionId: string): Promise<void> {
    const memoryService = this.memoryServices.get(sessionId);
    if (memoryService) {
      await memoryService.clearSession(sessionId);
      this.memoryServices.delete(sessionId);
    }
  }

  /**
   * Get all active session IDs
   */
  getActiveSessions(): string[] {
    return Array.from(this.memoryServices.keys());
  }

  /**
   * Check if AgentCore is available
   */
  isAgentCoreAvailable(): boolean {
    return this.agentCoreClient !== null && this.fallbackService === null;
  }

  /**
   * Check if using fallback storage
   */
  isUsingFallback(): boolean {
    return this.fallbackService !== null;
  }

  /**
   * Get environment configuration
   */
  getEnvironmentConfig(): AgentCoreEnvironmentConfig {
    return { ...this.envConfig };
  }
}

// ==================== Factory Functions ====================

/**
 * Create a new AgentCore Memory Manager
 */
export function createAgentCoreMemoryManager(
  config?: Partial<AgentCoreEnvironmentConfig>
): AgentCoreMemoryManager {
  return new AgentCoreMemoryManager(config);
}

// ==================== Singleton Instance ====================

let defaultManager: AgentCoreMemoryManager | null = null;

/**
 * Get the default AgentCore Memory Manager
 */
export function getAgentCoreMemoryManager(): AgentCoreMemoryManager {
  if (!defaultManager) {
    defaultManager = createAgentCoreMemoryManager();
  }
  return defaultManager;
}

/**
 * Set the default AgentCore Memory Manager
 */
export function setAgentCoreMemoryManager(manager: AgentCoreMemoryManager): void {
  defaultManager = manager;
}

/**
 * Initialize the default AgentCore Memory Manager
 */
export async function initializeAgentCoreMemory(
  config?: Partial<AgentCoreEnvironmentConfig>
): Promise<AgentCoreMemoryManager> {
  const manager = createAgentCoreMemoryManager(config);
  await manager.initialize();
  setAgentCoreMemoryManager(manager);
  return manager;
}

// ==================== Helper Functions ====================

/**
 * Create a memory configuration for a session
 * Validates: Requirements 17.1, 17.2, 17.3
 */
export function createMemoryConfig(
  userId: string,
  tenantId: string,
  sessionId?: string
): AgentCoreMemoryConfig {
  const envConfig = getDefaultEnvironmentConfig();
  
  return {
    memoryId: envConfig.memoryId,
    sessionId: sessionId || uuidv4(),
    actorId: `${tenantId}:${userId}`,
    region: envConfig.region,
  };
}

/**
 * Create a memory service with AgentCore configuration
 * Validates: Requirements 17.1, 17.2, 17.3
 */
export async function createConfiguredMemoryService(
  userId: string,
  tenantId: string,
  sessionId?: string
): Promise<{ memoryService: MemoryService; config: AgentCoreMemoryConfig }> {
  const manager = getAgentCoreMemoryManager();
  
  // Ensure manager is initialized
  if (!manager.isAgentCoreAvailable() && !manager.isUsingFallback()) {
    await manager.initialize();
  }

  const session = await manager.initializeSession({
    userId,
    tenantId,
    sessionId,
  });

  return {
    memoryService: session.memoryService,
    config: session.config,
  };
}
