/**
 * **Feature: regulatory-ai-assistant, Property 2: Human Gate Enforcement**
 * 
 * Critical actions require explicit human confirmation before execution.
 * - Critical actions are never executed without human approval
 * - Human gate decisions are properly recorded
 * 
 * **Validates: Requirements 9.1, 9.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { HumanGateServiceImpl } from '../../services/human-gate-service.js';
import { InMemoryMemoryService } from '../../services/memory-service.js';
import { ToolServiceImpl } from '../../services/tool-service.js';
import { AssistantServiceImpl } from '../../services/assistant-service.js';
import {
  HumanGateAction,
  HumanGateDecision,
  CRITICAL_ACTION_TYPES,
  isCriticalAction,
} from '../../types/human-gate.js';
import { AssistantExecutionContext } from '../../types/assistant.js';

// Property test configuration - minimum 100 iterations as per design
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

// ==================== Generators ====================

/**
 * Generator for tenant IDs
 */
const tenantIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `tenant-${s.replace(/[^a-zA-Z0-9]/g, '') || 'default'}`);

/**
 * Generator for user IDs
 */
const userIdGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 1, maxLength: 20 }).map(s => `user-${s.replace(/[^a-zA-Z0-9]/g, '') || 'default'}`);

/**
 * Generator for session IDs
 */
const sessionIdGenerator = (): fc.Arbitrary<string> =>
  fc.uuid();

/**
 * Generator for critical action tool names
 */
const criticalToolNameGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(...CRITICAL_ACTION_TYPES);

/**
 * Generator for non-critical action tool names
 */
const nonCriticalToolNameGenerator = (): fc.Arbitrary<string> =>
  fc.constantFrom(
    'getReportCatalog',
    'getCycleStatus',
    'getLineageForReport',
    'getIssuesForReport',
    'getCDEDetails',
    'scanRegulatorySources',
    'detectChanges'
  );

/**
 * Generator for tool parameters based on tool name
 */
const toolParametersForToolGenerator = (toolName: string): fc.Arbitrary<Record<string, unknown>> => {
  switch (toolName) {
    case 'approveCatalog':
      return fc.record({
        approver: userIdGenerator(),
        rationale: fc.string({ minLength: 10, maxLength: 100 }).map(s => s || 'Approval rationale'),
      });
    case 'startReportCycle':
      return fc.record({
        reportId: fc.uuid(),
        period: fc.constantFrom('Q1-2024', 'Q2-2024', 'Q3-2024', 'Q4-2024'),
      });
    case 'completeHumanTask':
      return fc.record({
        taskId: fc.uuid(),
        decision: fc.constantFrom('approved', 'rejected'),
        rationale: fc.string({ minLength: 10, maxLength: 100 }).map(s => s || 'Task rationale'),
      });
    case 'ownership_change':
    case 'source_mapping_change':
    case 'control_effectiveness_signoff':
      return fc.record({
        cdeId: fc.uuid(),
        newOwner: userIdGenerator(),
      });
    case 'getReportCatalog':
    case 'scanRegulatorySources':
      return fc.constant({});
    case 'detectChanges':
      return fc.record({
        since: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
      });
    case 'getCycleStatus':
    case 'getLineageForReport':
    case 'getIssuesForReport':
    case 'getCDEDetails':
      return fc.record({
        reportId: fc.uuid(),
      });
    default:
      return fc.constant({});
  }
};

/**
 * Generator for tool parameters (generic)
 */
const toolParametersGenerator = (): fc.Arbitrary<Record<string, unknown>> =>
  fc.oneof(
    fc.record({
      reportId: fc.uuid(),
      period: fc.constantFrom('Q1-2024', 'Q2-2024', 'Q3-2024', 'Q4-2024'),
    }),
    fc.record({
      approver: userIdGenerator(),
      rationale: fc.string({ minLength: 10, maxLength: 100 }).map(s => s || 'Approval rationale'),
    }),
    fc.record({
      taskId: fc.uuid(),
      decision: fc.constantFrom('approved', 'rejected'),
      rationale: fc.string({ minLength: 10, maxLength: 100 }).map(s => s || 'Task rationale'),
    }),
    fc.record({
      cdeId: fc.uuid(),
      newOwner: userIdGenerator(),
    })
  );

/**
 * Generator for human gate decisions
 */
const humanGateDecisionGenerator = (): fc.Arbitrary<HumanGateDecision> =>
  fc.constantFrom('approved', 'rejected', 'deferred');

/**
 * Generator for rationale strings - ensures minimum length after trimming
 */
const rationaleGenerator = (): fc.Arbitrary<string> =>
  fc.string({ minLength: 15, maxLength: 200 })
    .map(s => {
      // Ensure we have at least 10 non-whitespace characters
      const base = s.replace(/\s+/g, ' ').trim();
      if (base.length < 10) {
        return 'Valid rationale for testing purposes';
      }
      return base;
    });

/**
 * Generator for execution context
 */
const executionContextGenerator = (): fc.Arbitrary<AssistantExecutionContext> =>
  fc.record({
    userId: userIdGenerator(),
    tenantId: tenantIdGenerator(),
    sessionId: sessionIdGenerator(),
    permissions: fc.array(fc.constantFrom('report:read', 'cde:read', 'issue:read'), { minLength: 0, maxLength: 3 }),
    requireHumanApproval: fc.constant(true),
  });

// ==================== Property Tests ====================

describe('Property 2: Human Gate Enforcement', () => {
  let humanGateService: HumanGateServiceImpl;
  let memoryService: InMemoryMemoryService;
  let toolService: ToolServiceImpl;
  let assistantService: AssistantServiceImpl;

  beforeEach(() => {
    memoryService = new InMemoryMemoryService();
    toolService = new ToolServiceImpl({ enableLogging: false });
    humanGateService = new HumanGateServiceImpl(memoryService, toolService, {
      logToEpisodicMemory: true,
      minRationaleLength: 10,
    });
    assistantService = new AssistantServiceImpl(memoryService, toolService, {}, humanGateService);
  });

  describe('Critical Action Identification', () => {
    it('should correctly identify all critical actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          async (toolName) => {
            // All tools in CRITICAL_ACTION_TYPES should be identified as critical
            expect(isCriticalAction(toolName)).toBe(true);
            expect(humanGateService.requiresApproval(toolName)).toBe(true);
            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should correctly identify non-critical actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonCriticalToolNameGenerator(),
          async (toolName) => {
            // Non-critical tools should not require approval
            expect(isCriticalAction(toolName)).toBe(false);
            expect(humanGateService.requiresApproval(toolName)).toBe(false);
            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Critical Actions Require Human Approval', () => {
    it('should block critical action execution without approval', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          executionContextGenerator(),
          async (toolName, parameters, context) => {
            // Attempt to execute a critical action
            const result = await assistantService.executeTool(toolName, parameters, context);

            // Should NOT succeed - should require human approval
            expect(result.success).toBe(false);
            expect(result.errorCode).toBe('HUMAN_APPROVAL_REQUIRED');
            expect(result.status).toBe('pending');

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should create pending human gate action for critical tools', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          async (toolName, parameters, context) => {
            // Create a human gate action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);

            // Verify action was created correctly
            expect(action.id).toBeDefined();
            expect(action.toolName).toBe(toolName);
            expect(action.toolParameters).toEqual(parameters);
            expect(action.status).toBe('pending');
            expect(action.requestedBy).toBe(context.userId);
            expect(action.tenantId).toBe(context.tenantId);
            expect(action.sessionId).toBe(context.sessionId);

            // Request approval
            await humanGateService.requestApproval(action);

            // Verify action is pending
            const pendingActions = await humanGateService.getPendingActions(context.tenantId, context.userId);
            expect(pendingActions.some(a => a.id === action.id)).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should allow non-critical action execution without approval', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonCriticalToolNameGenerator(),
          executionContextGenerator(),
          async (toolName, context) => {
            // Generate appropriate parameters for the tool
            const parameters = toolName === 'detectChanges' 
              ? { since: new Date() }
              : toolName === 'getReportCatalog' || toolName === 'scanRegulatorySources'
              ? {}
              : { reportId: 'test-report-id' };

            // Attempt to execute a non-critical action
            const result = await assistantService.executeTool(toolName, parameters, context);

            // Should NOT require human approval (may succeed or fail for other reasons)
            expect(result.errorCode).not.toBe('HUMAN_APPROVAL_REQUIRED');

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Human Gate Decision Processing', () => {
    it('should process approval decisions correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          rationaleGenerator(),
          async (toolName, parameters, context, decidedBy, rationale) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Process approval
            const result = await humanGateService.processDecision(
              action.id,
              'approved',
              rationale,
              decidedBy
            );

            // Verify result
            expect(result.actionId).toBe(action.id);
            expect(result.decision).toBe('approved');
            expect(result.rationale).toBe(rationale);
            expect(result.decidedBy).toBe(decidedBy);
            expect(result.decidedAt).toBeInstanceOf(Date);

            // Verify action is no longer pending
            const pendingActions = await humanGateService.getPendingActions(context.tenantId, context.userId);
            expect(pendingActions.some(a => a.id === action.id)).toBe(false);

            // Verify result is stored
            const storedResult = await humanGateService.getResult(action.id);
            expect(storedResult).toBeDefined();
            expect(storedResult!.decision).toBe('approved');

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should process rejection decisions correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          rationaleGenerator(),
          async (toolName, parameters, context, decidedBy, rationale) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Process rejection
            const result = await humanGateService.processDecision(
              action.id,
              'rejected',
              rationale,
              decidedBy
            );

            // Verify result
            expect(result.actionId).toBe(action.id);
            expect(result.decision).toBe('rejected');
            expect(result.rationale).toBe(rationale);

            // Rejected actions should NOT have tool result
            // (tool should not be executed on rejection)
            // Note: toolResult may be undefined for rejected actions

            // Verify action is no longer pending
            const pendingActions = await humanGateService.getPendingActions(context.tenantId, context.userId);
            expect(pendingActions.some(a => a.id === action.id)).toBe(false);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should process deferred decisions correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          rationaleGenerator(),
          async (toolName, parameters, context, decidedBy, rationale) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Process deferral
            const result = await humanGateService.processDecision(
              action.id,
              'deferred',
              rationale,
              decidedBy
            );

            // Verify result
            expect(result.actionId).toBe(action.id);
            expect(result.decision).toBe('deferred');
            expect(result.rationale).toBe(rationale);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Rationale Validation', () => {
    it('should reject decisions with insufficient rationale', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          humanGateDecisionGenerator(),
          fc.string({ minLength: 0, maxLength: 5 }), // Short rationale
          async (toolName, parameters, context, decidedBy, decision, shortRationale) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Attempt to process with short rationale
            try {
              await humanGateService.processDecision(
                action.id,
                decision,
                shortRationale,
                decidedBy
              );
              // Should have thrown an error
              return false;
            } catch (error) {
              // Should reject due to insufficient rationale
              expect((error as Error).message).toContain('characters');
              return true;
            }
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Tenant Isolation', () => {
    it('should isolate pending actions by tenant', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.tuple(tenantIdGenerator(), tenantIdGenerator()).filter(([t1, t2]) => t1 !== t2),
          userIdGenerator(),
          async (toolName, parameters, [tenantA, tenantB], userId) => {
            // Create action for tenant A
            const actionA = humanGateService.createHumanGateAction(toolName, parameters, {
              userId,
              tenantId: tenantA,
              sessionId: 'session-a',
            });
            await humanGateService.requestApproval(actionA);

            // Create action for tenant B
            const actionB = humanGateService.createHumanGateAction(toolName, parameters, {
              userId,
              tenantId: tenantB,
              sessionId: 'session-b',
            });
            await humanGateService.requestApproval(actionB);

            // Get pending actions for tenant A
            const pendingA = await humanGateService.getPendingActions(tenantA);
            expect(pendingA.some(a => a.id === actionA.id)).toBe(true);
            expect(pendingA.some(a => a.id === actionB.id)).toBe(false);

            // Get pending actions for tenant B
            const pendingB = await humanGateService.getPendingActions(tenantB);
            expect(pendingB.some(a => a.id === actionB.id)).toBe(true);
            expect(pendingB.some(a => a.id === actionA.id)).toBe(false);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Episodic Memory Integration', () => {
    it('should record decisions in episodic memory', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          rationaleGenerator(),
          humanGateDecisionGenerator(),
          async (toolName, parameters, context, decidedBy, rationale, decision) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Process decision
            await humanGateService.processDecision(
              action.id,
              decision,
              rationale,
              decidedBy
            );

            // Query episodic memory for the decision
            const episodes = await memoryService.queryEpisodes({
              userId: decidedBy,
              tenantId: context.tenantId,
              types: ['decision'],
              tags: ['human_gate', 'decision'],
            });

            // Should have recorded the decision
            const decisionEpisode = episodes.find(e => 
              e.context && 
              (e.context as Record<string, unknown>).actionId === action.id
            );
            expect(decisionEpisode).toBeDefined();
            expect(decisionEpisode!.outcome).toBe(decision);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Action Cancellation', () => {
    it('should allow cancellation of pending actions', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          fc.string({ minLength: 5, maxLength: 100 }),
          async (toolName, parameters, context, cancelReason) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Verify action is pending
            let pendingActions = await humanGateService.getPendingActions(context.tenantId);
            expect(pendingActions.some(a => a.id === action.id)).toBe(true);

            // Cancel the action
            await humanGateService.cancelAction(action.id, cancelReason);

            // Verify action is no longer pending
            pendingActions = await humanGateService.getPendingActions(context.tenantId);
            expect(pendingActions.some(a => a.id === action.id)).toBe(false);

            // Verify result shows rejection
            const result = await humanGateService.getResult(action.id);
            expect(result).toBeDefined();
            expect(result!.decision).toBe('rejected');
            expect(result!.rationale).toContain('Cancelled');

            return true;
          }
        ),
        propertyConfig
      );
    });
  });

  describe('Approval Status Checking', () => {
    it('should correctly report approval status', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          rationaleGenerator(),
          async (toolName, parameters, context, decidedBy, rationale) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Before approval, should not be approved
            let isApproved = await humanGateService.isApproved(action.id);
            expect(isApproved).toBe(false);

            // Approve the action
            await humanGateService.processDecision(action.id, 'approved', rationale, decidedBy);

            // After approval, should be approved
            isApproved = await humanGateService.isApproved(action.id);
            expect(isApproved).toBe(true);

            return true;
          }
        ),
        propertyConfig
      );
    });

    it('should report rejected actions as not approved', async () => {
      await fc.assert(
        fc.asyncProperty(
          criticalToolNameGenerator(),
          toolParametersGenerator(),
          fc.record({
            userId: userIdGenerator(),
            tenantId: tenantIdGenerator(),
            sessionId: sessionIdGenerator(),
          }),
          userIdGenerator(),
          rationaleGenerator(),
          async (toolName, parameters, context, decidedBy, rationale) => {
            // Create and request approval for action
            const action = humanGateService.createHumanGateAction(toolName, parameters, context);
            await humanGateService.requestApproval(action);

            // Reject the action
            await humanGateService.processDecision(action.id, 'rejected', rationale, decidedBy);

            // Should not be approved
            const isApproved = await humanGateService.isApproved(action.id);
            expect(isApproved).toBe(false);

            return true;
          }
        ),
        propertyConfig
      );
    });
  });
});
