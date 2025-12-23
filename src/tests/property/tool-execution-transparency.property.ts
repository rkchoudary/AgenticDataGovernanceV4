/**
 * **Feature: regulatory-ai-assistant, Property 3: Tool Execution Transparency**
 * 
 * All tool executions are visible to the user with parameters and results.
 * - Every tool execution is logged and displayed
 * - Tool calls show name, parameters, and status
 * - Execution sequence is preserved for multiple tool calls
 * 
 * **Validates: Requirements 11.1, 11.2, 11.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { ToolServiceImpl } from '../../services/tool-service.js';
import {
  ToolExecutionContext,
  TOOL_METADATA_REGISTRY,
} from '../../types/tool-service.js';

// Property test configuration - reduced for faster execution
const propertyConfig = {
  numRuns: 15,
  verbose: false
};

// ==================== Generators ====================

/**
 * Generator for user IDs
 */
const userIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `user-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generator for tenant IDs
 */
const tenantIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `tenant-${s.replace(/[^a-zA-Z0-9]/g, '')}`);

/**
 * Generator for session IDs
 */
const sessionIdGenerator = (): fc.Arbitrary<string> =>
  fc.uuid();

/**
 * Generator for execution context
 */
const executionContextGenerator = (): fc.Arbitrary<ToolExecutionContext> =>
  fc.record({
    userId: userIdGenerator(),
    tenantId: tenantIdGenerator(),
    sessionId: sessionIdGenerator(),
    accessToken: fc.option(fc.string({ minLength: 10, maxLength: 50 })),
    permissions: fc.array(fc.constantFrom(
      'regulatory:read',
      'regulatory:approve',
      'workflow:read',
      'workflow:write',
      'workflow:approve',
      'lineage:read',
      'issues:read',
      'cde:read',
      'data_quality:read'
    ), { minLength: 1, maxLength: 5 }),
    requireHumanApproval: fc.boolean(),
  }).map(ctx => ({
    ...ctx,
    accessToken: ctx.accessToken ?? undefined,
  }));

/**
 * Generator for jurisdiction arrays
 */
const jurisdictionsGenerator = (): fc.Arbitrary<string[]> =>
  fc.array(fc.constantFrom('US', 'CA'), { minLength: 1, maxLength: 2 });

/**
 * Generator for report IDs
 */
const reportIdGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom('ccar', 'dfast', 'fr-y-14a', 'fr-y-14q', 'fr-y-14m', 'lcr', 'nsfr');

/**
 * Generator for CDE IDs
 */
const cdeIdGenerator = (): fc.Arbitrary<string> =>
  fc.uuid();

/**
 * Generator for cycle IDs
 */
const cycleIdGenerator = (): fc.Arbitrary<string> =>
  fc.uuid();

/**
 * Generator for tool names from the registry
 */
const toolNameGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(...TOOL_METADATA_REGISTRY.map(t => t.name));

// ==================== Property Tests ====================

describe('Property 3: Tool Execution Transparency', () => {
  let toolService: ToolServiceImpl;

  beforeEach(() => {
    toolService = new ToolServiceImpl({ enableLogging: true });
    toolService.clearExecutionLogs();
  });

  describe('Tool Execution Logging', () => {
    it('should log every scanRegulatorySources execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          jurisdictionsGenerator(),
          async (context, jurisdictions) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute the tool
            await toolService.scanRegulatorySources(jurisdictions);

            // Verify execution was logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const log = logs.find(l => l.toolName === 'scanRegulatorySources');
            expect(log).toBeDefined();
            expect(log!.toolName).toBe('scanRegulatorySources');
            expect(log!.userId).toBe(context.userId);
            expect(log!.tenantId).toBe(context.tenantId);
            expect(log!.sessionId).toBe(context.sessionId);
            expect(log!.displayedToUser).toBe(true);
            expect(log!.parameters).toEqual({ jurisdictions });

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should log every getReportCatalog execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          async (context) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute the tool
            await toolService.getReportCatalog();

            // Verify execution was logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const log = logs.find(l => l.toolName === 'getReportCatalog');
            expect(log).toBeDefined();
            expect(log!.toolName).toBe('getReportCatalog');
            expect(log!.displayedToUser).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should log every getCycleStatus execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          cycleIdGenerator(),
          async (context, cycleId) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute the tool
            await toolService.getCycleStatus(cycleId);

            // Verify execution was logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const log = logs.find(l => l.toolName === 'getCycleStatus');
            expect(log).toBeDefined();
            expect(log!.toolName).toBe('getCycleStatus');
            expect(log!.parameters).toHaveProperty('cycleId', cycleId);
            expect(log!.displayedToUser).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should log every getLineageForReport execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          reportIdGenerator(),
          async (context, reportId) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute the tool
            await toolService.getLineageForReport(reportId);

            // Verify execution was logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const log = logs.find(l => l.toolName === 'getLineageForReport');
            expect(log).toBeDefined();
            expect(log!.toolName).toBe('getLineageForReport');
            expect(log!.parameters).toHaveProperty('reportId', reportId);
            expect(log!.displayedToUser).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should log every getIssuesForReport execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          reportIdGenerator(),
          fc.option(fc.constantFrom('open', 'in_progress', 'resolved', 'closed')),
          async (context, reportId, status) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute the tool
            await toolService.getIssuesForReport(reportId, status ?? undefined);

            // Verify execution was logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const log = logs.find(l => l.toolName === 'getIssuesForReport');
            expect(log).toBeDefined();
            expect(log!.toolName).toBe('getIssuesForReport');
            expect(log!.parameters).toHaveProperty('reportId', reportId);
            expect(log!.displayedToUser).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should log every getCDEDetails execution', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          cdeIdGenerator(),
          async (context, cdeId) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute the tool
            await toolService.getCDEDetails(cdeId);

            // Verify execution was logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBeGreaterThanOrEqual(1);
            
            const log = logs.find(l => l.toolName === 'getCDEDetails');
            expect(log).toBeDefined();
            expect(log!.toolName).toBe('getCDEDetails');
            expect(log!.parameters).toHaveProperty('cdeId', cdeId);
            expect(log!.displayedToUser).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Execution Sequence Preservation', () => {
    it('should preserve execution order for multiple tool calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          jurisdictionsGenerator(),
          reportIdGenerator(),
          cdeIdGenerator(),
          async (context, jurisdictions, reportId, cdeId) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute multiple tools in sequence
            await toolService.scanRegulatorySources(jurisdictions);
            await toolService.getReportCatalog();
            await toolService.getLineageForReport(reportId);
            await toolService.getCDEDetails(cdeId);

            // Verify all executions were logged
            const logs = await toolService.getExecutionLogs(context.sessionId);
            
            expect(logs.length).toBe(4);

            // Verify order is preserved (timestamps should be increasing)
            for (let i = 1; i < logs.length; i++) {
              expect(logs[i].timestamp.getTime()).toBeGreaterThanOrEqual(logs[i - 1].timestamp.getTime());
            }

            // Verify all tool names are present
            const toolNames = logs.map(l => l.toolName);
            expect(toolNames).toContain('scanRegulatorySources');
            expect(toolNames).toContain('getReportCatalog');
            expect(toolNames).toContain('getLineageForReport');
            expect(toolNames).toContain('getCDEDetails');

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Log Completeness', () => {
    it('should include all required fields in execution logs', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          jurisdictionsGenerator(),
          async (context, jurisdictions) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute a tool
            await toolService.scanRegulatorySources(jurisdictions);

            // Verify log has all required fields
            const logs = await toolService.getExecutionLogs(context.sessionId);
            expect(logs.length).toBeGreaterThanOrEqual(1);

            const log = logs[0];
            
            // Required fields per Requirements 11.1, 11.2, 11.3
            expect(log).toHaveProperty('id');
            expect(log).toHaveProperty('callId');
            expect(log).toHaveProperty('toolName');
            expect(log).toHaveProperty('parameters');
            expect(log).toHaveProperty('userId');
            expect(log).toHaveProperty('tenantId');
            expect(log).toHaveProperty('sessionId');
            expect(log).toHaveProperty('status');
            expect(log).toHaveProperty('duration');
            expect(log).toHaveProperty('timestamp');
            expect(log).toHaveProperty('displayedToUser');

            // Verify types
            expect(typeof log.id).toBe('string');
            expect(typeof log.callId).toBe('string');
            expect(typeof log.toolName).toBe('string');
            expect(typeof log.parameters).toBe('object');
            expect(typeof log.userId).toBe('string');
            expect(typeof log.tenantId).toBe('string');
            expect(typeof log.sessionId).toBe('string');
            expect(typeof log.status).toBe('string');
            expect(typeof log.duration).toBe('number');
            expect(log.timestamp instanceof Date).toBe(true);
            expect(typeof log.displayedToUser).toBe('boolean');

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should record duration for all tool executions', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          reportIdGenerator(),
          async (context, reportId) => {
            // Clear logs for clean state
            toolService.clearExecutionLogs();
            toolService.setContext(context);

            // Execute a tool
            await toolService.getLineageForReport(reportId);

            // Verify duration is recorded
            const logs = await toolService.getExecutionLogs(context.sessionId);
            expect(logs.length).toBeGreaterThanOrEqual(1);

            const log = logs[0];
            expect(log.duration).toBeGreaterThanOrEqual(0);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Tool Metadata Availability', () => {
    it('should provide metadata for all registered tools', async () => {
      await fc.assert(
        fc.asyncProperty(
          toolNameGenerator(),
          async (toolName) => {
            const metadata = toolService.getToolMetadata(toolName);
            
            expect(metadata).toBeDefined();
            expect(metadata!.name).toBe(toolName);
            expect(metadata!.category).toBeDefined();
            expect(metadata!.description).toBeDefined();
            expect(Array.isArray(metadata!.requiredParams)).toBe(true);
            expect(Array.isArray(metadata!.optionalParams)).toBe(true);
            expect(typeof metadata!.requiresHumanApproval).toBe('boolean');
            expect(Array.isArray(metadata!.requiredPermissions)).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should return all available tools from registry', async () => {
      const tools = toolService.getAvailableTools();
      
      expect(tools.length).toBe(TOOL_METADATA_REGISTRY.length);
      
      // Verify each tool has required metadata
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.category).toBeDefined();
        expect(tool.description).toBeDefined();
      }
    });
  });

  describe('Session Isolation for Logs', () => {
    it('should isolate execution logs by session', async () => {
      await fc.assert(
        fc.asyncProperty(
          executionContextGenerator(),
          executionContextGenerator(),
          jurisdictionsGenerator(),
          reportIdGenerator(),
          async (contextA, contextB, jurisdictions, reportId) => {
            // Ensure different sessions
            fc.pre(contextA.sessionId !== contextB.sessionId);

            // Clear logs for clean state
            toolService.clearExecutionLogs();

            // Execute tool with context A
            toolService.setContext(contextA);
            await toolService.scanRegulatorySources(jurisdictions);

            // Execute tool with context B
            toolService.setContext(contextB);
            await toolService.getLineageForReport(reportId);

            // Verify session A only sees its logs
            const logsA = await toolService.getExecutionLogs(contextA.sessionId);
            expect(logsA.length).toBe(1);
            expect(logsA[0].toolName).toBe('scanRegulatorySources');
            expect(logsA[0].sessionId).toBe(contextA.sessionId);

            // Verify session B only sees its logs
            const logsB = await toolService.getExecutionLogs(contextB.sessionId);
            expect(logsB.length).toBe(1);
            expect(logsB[0].toolName).toBe('getLineageForReport');
            expect(logsB[0].sessionId).toBe(contextB.sessionId);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
