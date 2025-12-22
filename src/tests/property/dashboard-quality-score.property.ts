/**
 * **Feature: agentic-data-governance, Property 23: Dashboard Quality Score Consistency**
 * 
 * For any CDE displayed on the dashboard, the quality scores (completeness, accuracy, timeliness) 
 * must match the most recent rule execution results for that CDE, and thresholdBreached must be 
 * true if and only if any score is below the configured threshold.
 * 
 * **Validates: Requirements 11.1**
 */

import fc from 'fast-check';
import { describe, it, beforeEach } from 'vitest';
import { DashboardService } from '../../services/dashboard-service.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { 
  CDE, 
  CDEInventory, 
  DQRule, 
  DQRuleRepository,
  RuleExecutionResult,
  DQDimension,
  DataQualityStandards
} from '../../types/index.js';
import { cdeGenerator } from '../generators/cde.generator.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 23: Dashboard Quality Score Consistency', () => {
  let repository: InMemoryGovernanceRepository;
  let dashboardService: DashboardService;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    dashboardService = new DashboardService(repository);
  });


  it('should calculate quality scores from most recent rule execution results', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), // [completeness, accuracy, timeliness] pass/fail
        async (cde: CDE, passResults: boolean[]) => {
          // Reset for each test
          repository = new InMemoryGovernanceRepository();
          dashboardService = new DashboardService(repository);

          const reportId = 'test-report-1';
          
          // Create CDE inventory
          const inventory: CDEInventory = {
            id: 'inv-1',
            reportId,
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          repository.setCDEInventory(reportId, inventory);

          // Create rules for each dimension
          const dimensions: DQDimension[] = ['completeness', 'accuracy', 'timeliness'];
          const rules: DQRule[] = dimensions.map((dim, idx) => ({
            id: `rule-${dim}-${idx}`,
            cdeId: cde.id,
            dimension: dim,
            name: `${dim} rule`,
            description: `Rule for ${dim}`,
            logic: { type: 'null_check' as const, expression: 'value IS NOT NULL' },
            threshold: { type: 'percentage' as const, value: 95 },
            severity: 'high' as const,
            owner: 'test@example.com',
            enabled: true
          }));

          const ruleRepo: DQRuleRepository = {
            reportId,
            rules,
            version: 1,
            lastUpdated: new Date()
          };
          repository.setDQRuleRepository(reportId, ruleRepo);

          // Store rule execution results
          dimensions.forEach((dim, idx) => {
            const result: RuleExecutionResult = {
              ruleId: `rule-${dim}-${idx}`,
              passed: passResults[idx],
              actualValue: passResults[idx] ? 100 : 50,
              expectedValue: 95,
              totalRecords: 100,
              executedAt: new Date()
            };
            dashboardService.storeRuleExecutionResult(cde.id, result);
          });

          // Get quality scores
          const scores = await dashboardService.getCDEQualityScores(reportId);
          
          // Verify we got a score for our CDE
          const cdeScore = scores.find(s => s.cdeId === cde.id);
          if (!cdeScore) return false;

          // Calculate expected scores
          const expectedCompleteness = passResults[0] ? 100 : 0;
          const expectedAccuracy = passResults[1] ? 100 : 0;
          const expectedTimeliness = passResults[2] ? 100 : 0;

          // Verify scores match rule execution results
          return (
            cdeScore.completeness === expectedCompleteness &&
            cdeScore.accuracy === expectedAccuracy &&
            cdeScore.timeliness === expectedTimeliness
          );
        }
      ),
      propertyConfig
    );
  });

  it('should set thresholdBreached true when any score is below threshold', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 100, noNaN: true }),
        fc.float({ min: 50, max: 99, noNaN: true }), // threshold
        async (cde: CDE, completenessScore: number, accuracyScore: number, timelinessScore: number, threshold: number) => {
          // Reset for each test
          repository = new InMemoryGovernanceRepository();
          dashboardService = new DashboardService(repository);

          const reportId = 'test-report-2';
          
          // Create CDE inventory
          const inventory: CDEInventory = {
            id: 'inv-2',
            reportId,
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          repository.setCDEInventory(reportId, inventory);

          // Set up data quality standards with threshold
          const standards: DataQualityStandards = {
            dimensions: [],
            thresholds: [
              { dimension: 'completeness', cdeCategory: 'all', minimumScore: threshold, targetScore: 100 },
              { dimension: 'accuracy', cdeCategory: 'all', minimumScore: threshold, targetScore: 100 },
              { dimension: 'timeliness', cdeCategory: 'all', minimumScore: threshold, targetScore: 100 }
            ],
            version: 1,
            approvedBy: 'admin',
            approvedAt: new Date()
          };
          repository.setDataQualityStandards(standards);

          // Create rules for each dimension
          const dimensions: DQDimension[] = ['completeness', 'accuracy', 'timeliness'];
          const scores = [completenessScore, accuracyScore, timelinessScore];
          
          const rules: DQRule[] = dimensions.map((dim, idx) => ({
            id: `rule-${dim}-${idx}`,
            cdeId: cde.id,
            dimension: dim,
            name: `${dim} rule`,
            description: `Rule for ${dim}`,
            logic: { type: 'null_check' as const, expression: 'value IS NOT NULL' },
            threshold: { type: 'percentage' as const, value: threshold },
            severity: 'high' as const,
            owner: 'test@example.com',
            enabled: true
          }));

          const ruleRepo: DQRuleRepository = {
            reportId,
            rules,
            version: 1,
            lastUpdated: new Date()
          };
          repository.setDQRuleRepository(reportId, ruleRepo);

          // Store rule execution results - pass if score >= threshold
          dimensions.forEach((dim, idx) => {
            const passed = scores[idx] >= threshold;
            const result: RuleExecutionResult = {
              ruleId: `rule-${dim}-${idx}`,
              passed,
              actualValue: scores[idx],
              expectedValue: threshold,
              totalRecords: 100,
              executedAt: new Date()
            };
            dashboardService.storeRuleExecutionResult(cde.id, result);
          });

          // Get quality scores
          const dashboardScores = await dashboardService.getCDEQualityScores(reportId);
          const cdeScore = dashboardScores.find(s => s.cdeId === cde.id);
          
          if (!cdeScore) return false;

          // Calculate expected threshold breach
          const anyBelowThreshold = 
            cdeScore.completeness < threshold ||
            cdeScore.accuracy < threshold ||
            cdeScore.timeliness < threshold;

          // Verify thresholdBreached matches expectation
          return cdeScore.thresholdBreached === anyBelowThreshold;
        }
      ),
      propertyConfig
    );
  });


  it('should use most recent execution result when multiple results exist', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.boolean(), // older result
        fc.boolean(), // newer result
        async (cde: CDE, olderPassed: boolean, newerPassed: boolean) => {
          // Reset for each test
          repository = new InMemoryGovernanceRepository();
          dashboardService = new DashboardService(repository);

          const reportId = 'test-report-3';
          
          // Create CDE inventory
          const inventory: CDEInventory = {
            id: 'inv-3',
            reportId,
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          repository.setCDEInventory(reportId, inventory);

          // Create a completeness rule
          const rule: DQRule = {
            id: 'rule-completeness',
            cdeId: cde.id,
            dimension: 'completeness',
            name: 'Completeness rule',
            description: 'Rule for completeness',
            logic: { type: 'null_check' as const, expression: 'value IS NOT NULL' },
            threshold: { type: 'percentage' as const, value: 95 },
            severity: 'high' as const,
            owner: 'test@example.com',
            enabled: true
          };

          const ruleRepo: DQRuleRepository = {
            reportId,
            rules: [rule],
            version: 1,
            lastUpdated: new Date()
          };
          repository.setDQRuleRepository(reportId, ruleRepo);

          // Store older result first
          const olderDate = new Date('2024-01-01');
          const olderResult: RuleExecutionResult = {
            ruleId: 'rule-completeness',
            passed: olderPassed,
            actualValue: olderPassed ? 100 : 50,
            expectedValue: 95,
            totalRecords: 100,
            executedAt: olderDate
          };
          dashboardService.storeRuleExecutionResult(cde.id, olderResult);

          // Store newer result
          const newerDate = new Date('2024-06-01');
          const newerResult: RuleExecutionResult = {
            ruleId: 'rule-completeness',
            passed: newerPassed,
            actualValue: newerPassed ? 100 : 50,
            expectedValue: 95,
            totalRecords: 100,
            executedAt: newerDate
          };
          dashboardService.storeRuleExecutionResult(cde.id, newerResult);

          // Get quality scores
          const scores = await dashboardService.getCDEQualityScores(reportId);
          const cdeScore = scores.find(s => s.cdeId === cde.id);
          
          if (!cdeScore) return false;

          // Score should reflect the newer result, not the older one
          const expectedCompleteness = newerPassed ? 100 : 0;
          return cdeScore.completeness === expectedCompleteness;
        }
      ),
      propertyConfig
    );
  });

  it('should return 100% score when no rule execution results exist', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        async (cde: CDE) => {
          // Reset for each test
          repository = new InMemoryGovernanceRepository();
          dashboardService = new DashboardService(repository);

          const reportId = 'test-report-4';
          
          // Create CDE inventory
          const inventory: CDEInventory = {
            id: 'inv-4',
            reportId,
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          repository.setCDEInventory(reportId, inventory);

          // No rules or execution results

          // Get quality scores
          const scores = await dashboardService.getCDEQualityScores(reportId);
          const cdeScore = scores.find(s => s.cdeId === cde.id);
          
          if (!cdeScore) return false;

          // Default scores should be 100% when no results exist
          return (
            cdeScore.completeness === 100 &&
            cdeScore.accuracy === 100 &&
            cdeScore.timeliness === 100 &&
            cdeScore.overallScore === 100
          );
        }
      ),
      propertyConfig
    );
  });

  it('should calculate overall score as average of dimension scores', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
        async (cde: CDE, passResults: boolean[]) => {
          // Reset for each test
          repository = new InMemoryGovernanceRepository();
          dashboardService = new DashboardService(repository);

          const reportId = 'test-report-5';
          
          // Create CDE inventory
          const inventory: CDEInventory = {
            id: 'inv-5',
            reportId,
            cdes: [cde],
            version: 1,
            status: 'approved',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          repository.setCDEInventory(reportId, inventory);

          // Create rules for each dimension
          const dimensions: DQDimension[] = ['completeness', 'accuracy', 'timeliness'];
          const rules: DQRule[] = dimensions.map((dim, idx) => ({
            id: `rule-${dim}-${idx}`,
            cdeId: cde.id,
            dimension: dim,
            name: `${dim} rule`,
            description: `Rule for ${dim}`,
            logic: { type: 'null_check' as const, expression: 'value IS NOT NULL' },
            threshold: { type: 'percentage' as const, value: 95 },
            severity: 'high' as const,
            owner: 'test@example.com',
            enabled: true
          }));

          const ruleRepo: DQRuleRepository = {
            reportId,
            rules,
            version: 1,
            lastUpdated: new Date()
          };
          repository.setDQRuleRepository(reportId, ruleRepo);

          // Store rule execution results
          dimensions.forEach((dim, idx) => {
            const result: RuleExecutionResult = {
              ruleId: `rule-${dim}-${idx}`,
              passed: passResults[idx],
              actualValue: passResults[idx] ? 100 : 50,
              expectedValue: 95,
              totalRecords: 100,
              executedAt: new Date()
            };
            dashboardService.storeRuleExecutionResult(cde.id, result);
          });

          // Get quality scores
          const scores = await dashboardService.getCDEQualityScores(reportId);
          const cdeScore = scores.find(s => s.cdeId === cde.id);
          
          if (!cdeScore) return false;

          // Calculate expected overall score
          const expectedOverall = (cdeScore.completeness + cdeScore.accuracy + cdeScore.timeliness) / 3;

          // Verify overall score is the average
          return Math.abs(cdeScore.overallScore - expectedOverall) < 0.001;
        }
      ),
      propertyConfig
    );
  });
});
