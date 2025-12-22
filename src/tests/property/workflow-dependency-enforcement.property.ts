/**
 * **Feature: agentic-data-governance, Property 3: Workflow Dependency Enforcement**
 * 
 * For any workflow with task dependencies, a dependent task cannot transition 
 * to 'in_progress' or 'completed' status while any of its prerequisite tasks 
 * remain in 'pending' or 'in_progress' status.
 * 
 * **Validates: Requirements 2.2, 12.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { GovernanceOrchestrator } from '../../orchestrator/governance-orchestrator.js';
import { AgentType, Phase } from '../../types/index.js';
import { dateGenerator, nonEmptyStringGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Agent dependency configuration (mirrors the orchestrator)
 */
const AGENT_DEPENDENCIES: Record<AgentType, AgentType[]> = {
  'regulatory_intelligence': [],
  'data_requirements': ['regulatory_intelligence'],
  'cde_identification': ['data_requirements'],
  'data_quality_rule': ['cde_identification'],
  'lineage_mapping': ['data_requirements'],
  'issue_management': ['data_quality_rule'],
  'documentation': ['data_quality_rule', 'lineage_mapping', 'issue_management']
};

describe('Property 3: Workflow Dependency Enforcement', () => {
  let repository: InMemoryGovernanceRepository;
  let orchestrator: GovernanceOrchestrator;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    orchestrator = new GovernanceOrchestrator(repository);
  });

  /**
   * Generator for agent types with dependencies
   */
  const agentWithDependenciesGenerator = (): fc.Arbitrary<AgentType> =>
    fc.constantFrom(
      'data_requirements',
      'cde_identification',
      'data_quality_rule',
      'lineage_mapping',
      'issue_management',
      'documentation'
    );

  /**
   * Generator for report IDs
   */
  const reportIdGenerator = (): fc.Arbitrary<string> => fc.uuid();

  /**
   * Generator for period end dates
   */
  const periodEndGenerator = (): fc.Arbitrary<Date> => dateGenerator();

  it('should prevent triggering an agent when its dependencies are not completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        agentWithDependenciesGenerator(),
        async (reportId, periodEnd, agentType) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Get the dependencies for this agent
          const dependencies = AGENT_DEPENDENCIES[agentType];
          
          // Verify that dependencies exist
          expect(dependencies.length).toBeGreaterThan(0);
          
          // Try to trigger the agent without completing dependencies
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          // Should throw an error because dependencies are not completed
          await expect(
            orchestrator.triggerAgent(agentType, context)
          ).rejects.toThrow(/dependency.*not completed/i);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow triggering an agent when all dependencies are completed', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          // Trigger regulatory_intelligence first (no dependencies)
          const result = await orchestrator.triggerAgent('regulatory_intelligence', context);
          
          // Should succeed
          expect(result.success).toBe(true);
          expect(result.agentType).toBe('regulatory_intelligence');
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should enforce dependency chain for sequential agent execution', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          // Execute agents in correct dependency order
          // 1. regulatory_intelligence (no deps)
          const result1 = await orchestrator.triggerAgent('regulatory_intelligence', context);
          expect(result1.success).toBe(true);
          
          // 2. data_requirements (depends on regulatory_intelligence)
          const result2 = await orchestrator.triggerAgent('data_requirements', context);
          expect(result2.success).toBe(true);
          
          // 3. cde_identification (depends on data_requirements)
          const result3 = await orchestrator.triggerAgent('cde_identification', {
            ...context,
            phase: 'validation'
          });
          expect(result3.success).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should verify workflow steps track dependency status correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          // Get workflow steps
          const steps = orchestrator.getWorkflowSteps(cycle.id);
          
          // Verify steps exist
          expect(steps.length).toBeGreaterThan(0);
          
          // Find a step with dependencies
          const stepWithDeps = steps.find(s => s.dependencies.length > 0);
          
          if (stepWithDeps) {
            // Initially, dependencies should not be satisfied
            const satisfied = orchestrator.areDependenciesSatisfied(cycle.id, stepWithDeps.id);
            expect(satisfied).toBe(false);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should mark dependencies as satisfied after completion', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          // Execute regulatory_intelligence
          await orchestrator.triggerAgent('regulatory_intelligence', context);
          
          // Get workflow steps
          const steps = orchestrator.getWorkflowSteps(cycle.id);
          
          // Find the data_requirements step
          const dataReqStep = steps.find(s => s.agentType === 'data_requirements');
          
          if (dataReqStep) {
            // Dependencies should now be satisfied
            const satisfied = orchestrator.areDependenciesSatisfied(cycle.id, dataReqStep.id);
            expect(satisfied).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should prevent parallel execution of dependent agents', async () => {
    await fc.assert(
      fc.asyncProperty(
        reportIdGenerator(),
        periodEndGenerator(),
        async (reportId, periodEnd) => {
          // Start a new cycle
          const cycle = await orchestrator.startReportCycle(reportId, periodEnd);
          
          const context = {
            cycleId: cycle.id,
            reportId,
            phase: 'data_gathering' as Phase
          };
          
          // Try to trigger data_requirements and cde_identification in parallel
          // without completing regulatory_intelligence first
          const promises = [
            orchestrator.triggerAgent('data_requirements', context).catch(e => e),
            orchestrator.triggerAgent('cde_identification', { ...context, phase: 'validation' }).catch(e => e)
          ];
          
          const results = await Promise.all(promises);
          
          // Both should fail due to unmet dependencies
          expect(results[0]).toBeInstanceOf(Error);
          expect(results[1]).toBeInstanceOf(Error);
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
