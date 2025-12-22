/**
 * Unit tests for Dashboard Service
 * 
 * Tests quality score calculation, trend generation, and annotation functionality.
 * Requirements: 11.1, 11.2, 11.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardService } from '../../../services/dashboard-service.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import { 
  CDEInventory, 
  DQRuleRepository,
  DataQualityStandards,
  ControlMatrix,
  ReportCatalog
} from '../../../types/index.js';

describe('DashboardService', () => {
  let service: DashboardService;
  let repository: InMemoryGovernanceRepository;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    service = new DashboardService(repository);
  });

  describe('Quality Score Calculation', () => {
    it('should calculate quality scores from rule execution results', async () => {
      const reportId = 'report-1';
      const cdeId = 'cde-1';

      // Set up CDE inventory
      const inventory: CDEInventory = {
        id: 'inv-1',
        reportId,
        cdes: [{
          id: cdeId,
          elementId: 'elem-1',
          name: 'Test CDE',
          businessDefinition: 'Test definition',
          criticalityRationale: 'Test rationale',
          status: 'approved'
        }],
        version: 1,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setCDEInventory(reportId, inventory);

      // Set up DQ rules
      const ruleRepo: DQRuleRepository = {
        reportId,
        rules: [
          { id: 'rule-completeness', cdeId, dimension: 'completeness', name: 'Completeness', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 95 }, severity: 'high', owner: 'test@test.com', enabled: true },
          { id: 'rule-accuracy', cdeId, dimension: 'accuracy', name: 'Accuracy', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 95 }, severity: 'high', owner: 'test@test.com', enabled: true },
          { id: 'rule-timeliness', cdeId, dimension: 'timeliness', name: 'Timeliness', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 95 }, severity: 'high', owner: 'test@test.com', enabled: true }
        ],
        version: 1,
        lastUpdated: new Date()
      };
      repository.setDQRuleRepository(reportId, ruleRepo);

      // Store rule execution results
      service.storeRuleExecutionResult(cdeId, { ruleId: 'rule-completeness', passed: true, actualValue: 100, expectedValue: 95, totalRecords: 100, executedAt: new Date() });
      service.storeRuleExecutionResult(cdeId, { ruleId: 'rule-accuracy', passed: true, actualValue: 98, expectedValue: 95, totalRecords: 100, executedAt: new Date() });
      service.storeRuleExecutionResult(cdeId, { ruleId: 'rule-timeliness', passed: false, actualValue: 80, expectedValue: 95, totalRecords: 100, executedAt: new Date() });

      const scores = await service.getCDEQualityScores(reportId);

      expect(scores).toHaveLength(1);
      expect(scores[0].cdeId).toBe(cdeId);
      expect(scores[0].completeness).toBe(100); // 1 passed out of 1
      expect(scores[0].accuracy).toBe(100); // 1 passed out of 1
      expect(scores[0].timeliness).toBe(0); // 0 passed out of 1
    });

    it('should return 100% when no rule execution results exist', async () => {
      const reportId = 'report-2';
      const cdeId = 'cde-2';

      const inventory: CDEInventory = {
        id: 'inv-2',
        reportId,
        cdes: [{
          id: cdeId,
          elementId: 'elem-2',
          name: 'Test CDE',
          businessDefinition: 'Test definition',
          criticalityRationale: 'Test rationale',
          status: 'approved'
        }],
        version: 1,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setCDEInventory(reportId, inventory);

      const scores = await service.getCDEQualityScores(reportId);

      expect(scores).toHaveLength(1);
      expect(scores[0].completeness).toBe(100);
      expect(scores[0].accuracy).toBe(100);
      expect(scores[0].timeliness).toBe(100);
      expect(scores[0].overallScore).toBe(100);
    });


    it('should detect threshold breach when score is below minimum', async () => {
      const reportId = 'report-3';
      const cdeId = 'cde-3';

      const inventory: CDEInventory = {
        id: 'inv-3',
        reportId,
        cdes: [{
          id: cdeId,
          elementId: 'elem-3',
          name: 'Test CDE',
          businessDefinition: 'Test definition',
          criticalityRationale: 'Test rationale',
          status: 'approved'
        }],
        version: 1,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setCDEInventory(reportId, inventory);

      // Set up standards with threshold
      const standards: DataQualityStandards = {
        dimensions: [],
        thresholds: [
          { dimension: 'completeness', cdeCategory: 'all', minimumScore: 90, targetScore: 100 }
        ],
        version: 1,
        approvedBy: 'admin',
        approvedAt: new Date()
      };
      repository.setDataQualityStandards(standards);

      // Set up rule
      const ruleRepo: DQRuleRepository = {
        reportId,
        rules: [
          { id: 'rule-completeness', cdeId, dimension: 'completeness', name: 'Completeness', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 90 }, severity: 'high', owner: 'test@test.com', enabled: true }
        ],
        version: 1,
        lastUpdated: new Date()
      };
      repository.setDQRuleRepository(reportId, ruleRepo);

      // Store failing result
      service.storeRuleExecutionResult(cdeId, { ruleId: 'rule-completeness', passed: false, actualValue: 80, expectedValue: 90, totalRecords: 100, executedAt: new Date() });

      const scores = await service.getCDEQualityScores(reportId);

      expect(scores[0].thresholdBreached).toBe(true);
    });

    it('should return empty array when no CDE inventory exists', async () => {
      const scores = await service.getCDEQualityScores('non-existent-report');
      expect(scores).toHaveLength(0);
    });
  });

  describe('Quality Trends', () => {
    it('should generate quality trends over time period', async () => {
      const reportId = 'report-4';
      const cdeId = 'cde-4';

      const inventory: CDEInventory = {
        id: 'inv-4',
        reportId,
        cdes: [{
          id: cdeId,
          elementId: 'elem-4',
          name: 'Test CDE',
          businessDefinition: 'Test definition',
          criticalityRationale: 'Test rationale',
          status: 'approved'
        }],
        version: 1,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setCDEInventory(reportId, inventory);

      const ruleRepo: DQRuleRepository = {
        reportId,
        rules: [
          { id: 'rule-completeness', cdeId, dimension: 'completeness', name: 'Completeness', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 95 }, severity: 'high', owner: 'test@test.com', enabled: true }
        ],
        version: 1,
        lastUpdated: new Date()
      };
      repository.setDQRuleRepository(reportId, ruleRepo);

      // Store results on different dates
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-20');
      
      service.storeRuleExecutionResult(cdeId, { ruleId: 'rule-completeness', passed: true, actualValue: 100, expectedValue: 95, totalRecords: 100, executedAt: date1 });
      service.storeRuleExecutionResult(cdeId, { ruleId: 'rule-completeness', passed: false, actualValue: 80, expectedValue: 95, totalRecords: 100, executedAt: date2 });

      const trends = await service.getQualityTrends(reportId, {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      });

      expect(trends.length).toBeGreaterThan(0);
      expect(trends.some(t => t.dimension === 'completeness')).toBe(true);
    });

    it('should return empty array when no inventory exists', async () => {
      const trends = await service.getQualityTrends('non-existent', {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31')
      });
      expect(trends).toHaveLength(0);
    });
  });


  describe('Issues Summary', () => {
    it('should calculate issues summary correctly', async () => {
      // Create issues with different statuses and severities
      repository.createIssue({
        id: 'issue-1',
        title: 'Critical Open Issue',
        description: 'Test',
        source: 'test',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'critical',
        status: 'open',
        assignee: 'test@test.com',
        createdAt: new Date(),
        escalationLevel: 0
      });

      repository.createIssue({
        id: 'issue-2',
        title: 'High In Progress Issue',
        description: 'Test',
        source: 'test',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'high',
        status: 'in_progress',
        assignee: 'test@test.com',
        createdAt: new Date(),
        escalationLevel: 0
      });

      repository.createIssue({
        id: 'issue-3',
        title: 'Closed Issue',
        description: 'Test',
        source: 'test',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'medium',
        status: 'closed',
        assignee: 'test@test.com',
        createdAt: new Date(Date.now() - 86400000), // 1 day ago
        resolution: {
          type: 'data_correction',
          description: 'Fixed',
          implementedBy: 'test@test.com',
          implementedAt: new Date()
        },
        escalationLevel: 0
      });

      const summary = await service.getIssuesSummary({});

      expect(summary.totalOpen).toBe(2);
      expect(summary.bySeverity.critical).toBe(1);
      expect(summary.bySeverity.high).toBe(1);
      expect(summary.bySeverity.medium).toBe(0);
      expect(summary.topPriorityItems).toContain('issue-1');
      expect(summary.topPriorityItems).toContain('issue-2');
    });

    it('should filter issues by status', async () => {
      repository.createIssue({
        id: 'issue-1',
        title: 'Open Issue',
        description: 'Test',
        source: 'test',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'high',
        status: 'open',
        assignee: 'test@test.com',
        createdAt: new Date(),
        escalationLevel: 0
      });

      repository.createIssue({
        id: 'issue-2',
        title: 'Closed Issue',
        description: 'Test',
        source: 'test',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'high',
        status: 'closed',
        assignee: 'test@test.com',
        createdAt: new Date(),
        escalationLevel: 0
      });

      const summary = await service.getIssuesSummary({ status: ['open'] });

      expect(summary.totalOpen).toBe(1);
    });

    it('should filter issues by report', async () => {
      repository.createIssue({
        id: 'issue-1',
        title: 'Report 1 Issue',
        description: 'Test',
        source: 'test',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'high',
        status: 'open',
        assignee: 'test@test.com',
        createdAt: new Date(),
        escalationLevel: 0
      });

      repository.createIssue({
        id: 'issue-2',
        title: 'Report 2 Issue',
        description: 'Test',
        source: 'test',
        impactedReports: ['report-2'],
        impactedCDEs: [],
        severity: 'high',
        status: 'open',
        assignee: 'test@test.com',
        createdAt: new Date(),
        escalationLevel: 0
      });

      const summary = await service.getIssuesSummary({ reportId: 'report-1' });

      expect(summary.totalOpen).toBe(1);
    });
  });

  describe('Control Status', () => {
    it('should return control status with latest evidence', async () => {
      const reportId = 'report-5';

      const matrix: ControlMatrix = {
        id: 'matrix-1',
        reportId,
        controls: [{
          id: 'control-1',
          name: 'Test Control',
          description: 'Test',
          type: 'process',
          category: 'preventive',
          owner: 'test@test.com',
          frequency: 'daily',
          linkedCDEs: [],
          linkedProcesses: [],
          automationStatus: 'fully_automated',
          status: 'active',
          evidence: [
            { id: 'ev-1', controlId: 'control-1', executionDate: new Date('2024-01-01'), outcome: 'fail', details: 'Failed', executedBy: 'system' },
            { id: 'ev-2', controlId: 'control-1', executionDate: new Date('2024-01-15'), outcome: 'pass', details: 'Passed', executedBy: 'system' }
          ]
        }],
        version: 1,
        lastReviewed: new Date(),
        reviewedBy: 'admin'
      };
      repository.setControlMatrix(reportId, matrix);

      const status = await service.getControlStatus(reportId);

      expect(status).toHaveLength(1);
      expect(status[0].controlId).toBe('control-1');
      expect(status[0].status).toBe('pass'); // Latest evidence is pass
      expect(status[0].evidence).toBe('Passed');
    });

    it('should return pending status when no evidence exists', async () => {
      const reportId = 'report-6';

      const matrix: ControlMatrix = {
        id: 'matrix-2',
        reportId,
        controls: [{
          id: 'control-2',
          name: 'New Control',
          description: 'Test',
          type: 'process',
          category: 'preventive',
          owner: 'test@test.com',
          frequency: 'daily',
          linkedCDEs: [],
          linkedProcesses: [],
          automationStatus: 'manual',
          status: 'active',
          evidence: []
        }],
        version: 1,
        lastReviewed: new Date(),
        reviewedBy: 'admin'
      };
      repository.setControlMatrix(reportId, matrix);

      const status = await service.getControlStatus(reportId);

      expect(status[0].status).toBe('pending');
    });

    it('should return empty array when no control matrix exists', async () => {
      const status = await service.getControlStatus('non-existent');
      expect(status).toHaveLength(0);
    });
  });


  describe('Annotations', () => {
    it('should add annotation with audit trail', async () => {
      const metricId = 'metric-1';

      await service.addAnnotation(metricId, {
        metricId,
        comment: 'This is a test annotation',
        createdBy: 'test-user@test.com'
      });

      const annotations = service.getAnnotations(metricId);

      expect(annotations).toHaveLength(1);
      expect(annotations[0].comment).toBe('This is a test annotation');
      expect(annotations[0].createdBy).toBe('test-user@test.com');
      expect(annotations[0].metricId).toBe(metricId);
      expect(annotations[0].id).toBeDefined();
      expect(annotations[0].createdAt).toBeDefined();

      // Verify audit trail was created
      const auditEntries = repository.getAuditEntries('Annotation');
      expect(auditEntries.length).toBeGreaterThan(0);
      expect(auditEntries.some(e => e.action === 'create' && e.entityType === 'Annotation')).toBe(true);
    });

    it('should return empty array for metric with no annotations', () => {
      const annotations = service.getAnnotations('non-existent-metric');
      expect(annotations).toHaveLength(0);
    });

    it('should support multiple annotations on same metric', async () => {
      const metricId = 'metric-2';

      await service.addAnnotation(metricId, {
        metricId,
        comment: 'First annotation',
        createdBy: 'user1@test.com'
      });

      await service.addAnnotation(metricId, {
        metricId,
        comment: 'Second annotation',
        createdBy: 'user2@test.com'
      });

      const annotations = service.getAnnotations(metricId);

      expect(annotations).toHaveLength(2);
      expect(annotations.some(a => a.comment === 'First annotation')).toBe(true);
      expect(annotations.some(a => a.comment === 'Second annotation')).toBe(true);
    });
  });

  describe('CDE Detail Drill-down', () => {
    it('should return CDE detail with lineage and rules', async () => {
      const reportId = 'report-7';
      const cdeId = 'cde-7';

      // Set up CDE inventory
      const inventory: CDEInventory = {
        id: 'inv-7',
        reportId,
        cdes: [{
          id: cdeId,
          elementId: 'elem-7',
          name: 'Test CDE',
          businessDefinition: 'Test definition',
          criticalityRationale: 'Test rationale',
          dataOwner: 'owner@test.com',
          status: 'approved'
        }],
        version: 1,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setCDEInventory(reportId, inventory);

      // Set up DQ rules
      const ruleRepo: DQRuleRepository = {
        reportId,
        rules: [
          { id: 'rule-1', cdeId, dimension: 'completeness', name: 'Completeness', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 95 }, severity: 'high', owner: 'test@test.com', enabled: true },
          { id: 'rule-2', cdeId, dimension: 'accuracy', name: 'Accuracy', description: 'Test', logic: { type: 'null_check', expression: 'test' }, threshold: { type: 'percentage', value: 95 }, severity: 'high', owner: 'test@test.com', enabled: true }
        ],
        version: 1,
        lastUpdated: new Date()
      };
      repository.setDQRuleRepository(reportId, ruleRepo);

      // Set up lineage
      repository.setLineageGraph(reportId, {
        id: 'lineage-1',
        reportId,
        nodes: [
          { id: 'node-1', type: 'source_table', name: 'source_table', system: 'db', technicalDetails: {} },
          { id: 'node-2', type: 'report_field', name: 'report_field', system: 'report', technicalDetails: {} }
        ],
        edges: [
          { id: 'edge-1', sourceNodeId: 'node-1', targetNodeId: 'node-2', transformationType: 'direct' }
        ],
        version: 1,
        capturedAt: new Date()
      });

      const detail = await service.getCDEDetail(reportId, cdeId);

      expect(detail).toBeDefined();
      expect(detail?.cde.id).toBe(cdeId);
      expect(detail?.cde.name).toBe('Test CDE');
      expect(detail?.cde.dataOwner).toBe('owner@test.com');
      expect(detail?.rules).toHaveLength(2);
      expect(detail?.lineage).toBeDefined();
      expect(detail?.lineage?.nodes).toHaveLength(2);
    });

    it('should return undefined for non-existent CDE', async () => {
      const reportId = 'report-8';

      const inventory: CDEInventory = {
        id: 'inv-8',
        reportId,
        cdes: [{
          id: 'cde-8',
          elementId: 'elem-8',
          name: 'Test CDE',
          businessDefinition: 'Test definition',
          criticalityRationale: 'Test rationale',
          status: 'approved'
        }],
        version: 1,
        status: 'approved',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setCDEInventory(reportId, inventory);

      const detail = await service.getCDEDetail(reportId, 'non-existent-cde');

      expect(detail).toBeUndefined();
    });

    it('should return undefined when no inventory exists', async () => {
      const detail = await service.getCDEDetail('non-existent-report', 'cde-1');
      expect(detail).toBeUndefined();
    });
  });

  describe('Regulatory Calendar', () => {
    it('should return calendar entries for cycles within period', async () => {
      // Set up report catalog
      const catalog: ReportCatalog = {
        reports: [{
          id: 'report-1',
          name: 'Test Report',
          jurisdiction: 'US',
          regulator: 'FED',
          frequency: 'monthly',
          dueDate: { daysAfterPeriodEnd: 15, businessDaysOnly: false, timezone: 'America/New_York' },
          submissionFormat: 'XML',
          submissionPlatform: 'Portal',
          description: 'Test',
          lastUpdated: new Date(),
          responsibleUnit: 'Finance'
        }],
        version: 1,
        lastScanned: new Date(),
        status: 'approved'
      };
      repository.setReportCatalog(catalog);

      // Create cycle instance
      repository.createCycleInstance({
        reportId: 'report-1',
        periodEnd: new Date('2024-06-15'),
        status: 'active',
        currentPhase: 'validation',
        checkpoints: [],
        auditTrail: [],
        startedAt: new Date('2024-06-01')
      });

      const entries = await service.getRegulatoryCalendar({
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31')
      });

      expect(entries).toHaveLength(1);
      expect(entries[0].reportId).toBe('report-1');
      expect(entries[0].reportName).toBe('Test Report');
      expect(entries[0].status).toBe('in_progress');
    });

    it('should return empty array when no catalog exists', async () => {
      const entries = await service.getRegulatoryCalendar({
        start: new Date('2024-01-01'),
        end: new Date('2024-12-31')
      });
      expect(entries).toHaveLength(0);
    });
  });
});
