/**
 * Unit tests for Documentation Agent
 * Tests artifact generation and package compilation
 * 
 * Requirements: 10.1, 10.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentationAgent, DocumentationAgentConfig } from '../../../agents/documentation-agent.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import {
  ReportCatalog,
  CDEInventory,
  RequirementsDocument,
  LineageGraph,
  ControlMatrix,
  CycleInstance,
  DQRuleRepository,
  ArtifactStatus,
  DocumentFormat,
  CDE,
  DataElement,
  DataMapping,
  LineageNode,
  LineageEdge,
  Control,
  DQRule,
  Issue
} from '../../../types/index.js';

describe('DocumentationAgent', () => {
  let agent: DocumentationAgent;
  let repository: InMemoryGovernanceRepository;
  let config: DocumentationAgentConfig;

  const mockReportId = 'test-report-123';
  let mockCycleId = 'test-cycle-456';

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    config = {
      defaultFormat: 'markdown' as DocumentFormat,
      includeTimestamps: true,
      organizationName: 'Test Bank'
    };
    agent = new DocumentationAgent(repository, config);

    // Set up test data
    setupTestData();
  });

  function setupTestData() {
    // Report catalog
    const reportCatalog: ReportCatalog = {
      reports: [{
        id: mockReportId,
        name: 'Test Regulatory Report',
        jurisdiction: 'US',
        regulator: 'Federal Reserve',
        frequency: 'quarterly',
        dueDate: { daysAfterPeriodEnd: 30, businessDaysOnly: true },
        submissionFormat: 'XML',
        submissionPlatform: 'FedLine',
        description: 'Test report for unit testing',
        lastUpdated: new Date('2024-01-01'),
        responsibleUnit: 'Risk Management'
      }],
      version: 1,
      lastScanned: new Date(),
      status: 'approved' as ArtifactStatus
    };
    repository.setReportCatalog(reportCatalog);

    // CDE Inventory
    const cdeInventory: CDEInventory = {
      id: 'cde-inv-123',
      reportId: mockReportId,
      cdes: [
        {
          id: 'cde-1',
          elementId: 'element-1',
          name: 'Total Assets',
          businessDefinition: 'Sum of all bank assets',
          criticalityRationale: 'Key balance sheet metric',
          dataOwner: 'john.doe@testbank.com',
          status: 'approved' as any,
          approvedBy: 'Jane Smith',
          approvedAt: new Date('2024-01-15')
        } as CDE,
        {
          id: 'cde-2',
          elementId: 'element-2',
          name: 'Tier 1 Capital',
          businessDefinition: 'Core capital measure',
          criticalityRationale: 'Regulatory capital requirement',
          dataOwner: 'mary.johnson@testbank.com',
          status: 'approved' as any,
          approvedBy: 'Jane Smith',
          approvedAt: new Date('2024-01-15')
        } as CDE
      ],
      version: 1,
      status: 'approved' as ArtifactStatus
    };
    repository.setCDEInventory(mockReportId, cdeInventory);

    // Requirements Document
    const requirementsDoc: RequirementsDocument = {
      id: 'req-doc-123',
      reportId: mockReportId,
      dataElements: [
        {
          id: 'element-1',
          name: 'Total Assets',
          regulatoryDefinition: 'Total assets as defined by regulation',
          dataType: 'decimal',
          format: 'Currency',
          mandatory: true,
          calculationLogic: 'Sum of all asset accounts',
          unit: 'USD'
        } as DataElement,
        {
          id: 'element-2',
          name: 'Tier 1 Capital',
          regulatoryDefinition: 'Tier 1 capital as per Basel III',
          dataType: 'decimal',
          format: 'Currency',
          mandatory: true,
          unit: 'USD'
        } as DataElement
      ],
      dataMappings: [
        {
          elementId: 'element-1',
          sourceSystem: 'Core Banking',
          sourceTable: 'accounts',
          sourceField: 'balance',
          transformationLogic: 'SUM(balance) WHERE account_type = "ASSET"',
          confidence: 0.95
        } as DataMapping,
        {
          elementId: 'element-2',
          sourceSystem: 'Capital System',
          sourceTable: 'capital_components',
          sourceField: 'tier1_amount',
          confidence: 0.98
        } as DataMapping
      ],
      version: 1,
      status: 'approved' as ArtifactStatus,
      createdAt: new Date('2024-01-10'),
      lastModified: new Date('2024-01-15')
    };
    repository.setRequirementsDocument(mockReportId, requirementsDoc);

    // Lineage Graph
    const lineageGraph: LineageGraph = {
      id: 'lineage-123',
      nodes: [
        {
          id: 'source-1',
          type: 'source_table',
          name: 'accounts',
          system: 'Core Banking',
          technicalDetails: { schema: 'banking', table: 'accounts' },
          businessTerm: 'Bank Accounts'
        } as LineageNode,
        {
          id: 'transform-1',
          type: 'transformation',
          name: 'Asset Aggregation',
          system: 'ETL Pipeline',
          technicalDetails: { job: 'asset_aggregation' }
        } as LineageNode,
        {
          id: 'report-1',
          type: 'report_field',
          name: 'Total Assets',
          system: 'Reporting System',
          technicalDetails: { field: 'total_assets' }
        } as LineageNode
      ],
      edges: [
        {
          sourceNodeId: 'source-1',
          targetNodeId: 'transform-1',
          transformationType: 'aggregation',
          transformationLogic: 'SUM(balance) WHERE account_type = "ASSET"'
        } as LineageEdge,
        {
          sourceNodeId: 'transform-1',
          targetNodeId: 'report-1',
          transformationType: 'direct',
          transformationLogic: 'Direct mapping'
        } as LineageEdge
      ],
      version: 1,
      capturedAt: new Date('2024-01-20')
    };
    repository.setLineageGraph(mockReportId, lineageGraph);

    // Control Matrix
    const controlMatrix: ControlMatrix = {
      id: 'control-matrix-123',
      reportId: mockReportId,
      controls: [
        {
          id: 'control-1',
          name: 'Asset Balance Reconciliation',
          description: 'Daily reconciliation of asset balances',
          type: 'process',
          category: 'detective',
          owner: 'Risk Team',
          frequency: 'daily',
          linkedCDEs: ['element-1'],
          linkedProcesses: ['asset_processing'],
          automationStatus: 'fully_automated',
          status: 'active',
          evidence: [
            {
              executionDate: new Date('2024-01-25'),
              outcome: 'pass',
              details: 'Reconciliation completed successfully',
              executedBy: 'System'
            }
          ]
        } as Control,
        {
          id: 'control-2',
          name: 'Capital Adequacy Check',
          description: 'Validation of capital calculations',
          type: 'organizational',
          category: 'preventive',
          owner: 'Capital Team',
          frequency: 'monthly',
          linkedCDEs: ['element-2'],
          linkedProcesses: ['capital_calculation'],
          automationStatus: 'semi_automated',
          status: 'active',
          evidence: [
            {
              executionDate: new Date('2024-01-20'),
              outcome: 'pass',
              details: 'Capital ratios within limits',
              executedBy: 'John Doe'
            }
          ]
        } as Control
      ],
      version: 1,
      lastReviewed: new Date('2024-01-15'),
      reviewedBy: 'Jane Smith'
    };
    repository.setControlMatrix(mockReportId, controlMatrix);

    // DQ Rule Repository
    const dqRuleRepo: DQRuleRepository = {
      reportId: mockReportId,
      rules: [
        {
          id: 'rule-1',
          cdeId: 'element-1',
          dimension: 'completeness',
          name: 'Total Assets Completeness',
          description: 'Check that total assets is not null',
          logic: {
            type: 'null_check',
            expression: 'total_assets IS NOT NULL'
          },
          threshold: { value: 100, operator: 'gte' },
          severity: 'critical',
          owner: 'Risk Team',
          enabled: true
        } as DQRule,
        {
          id: 'rule-2',
          cdeId: 'element-2',
          dimension: 'accuracy',
          name: 'Tier 1 Capital Range Check',
          description: 'Check that Tier 1 capital is within expected range',
          logic: {
            type: 'range_check',
            expression: 'tier1_capital BETWEEN 0 AND 1000000000'
          },
          threshold: { value: 95, operator: 'gte' },
          severity: 'high',
          owner: 'Capital Team',
          enabled: true
        } as DQRule
      ],
      version: 1,
      lastUpdated: new Date('2024-01-20')
    };
    repository.setDQRuleRepository(mockReportId, dqRuleRepo);

    // Cycle Instance
    const cycleData = {
      reportId: mockReportId,
      periodEnd: new Date('2024-03-31'),
      status: 'active' as any,
      currentPhase: 'validation' as any,
      checkpoints: [],
      auditTrail: [],
      createdAt: new Date('2024-01-01'),
      startedAt: new Date('2024-01-01')
    };
    const cycle = repository.createCycleInstance(cycleData);
    mockCycleId = cycle.id;

    // Test Issues
    const issue: Issue = {
      id: 'issue-1',
      title: 'Data Quality Issue',
      description: 'Asset balance discrepancy detected',
      source: 'DQ Rule Engine',
      impactedReports: [mockReportId],
      impactedCDEs: ['element-1'],
      severity: 'high',
      status: 'open',
      createdAt: new Date('2024-01-25'),
      assignee: 'john.doe@testbank.com'
    };
    repository.createIssue(issue);
  }

  describe('generateDataDictionary', () => {
    it('should generate a comprehensive data dictionary', async () => {
      const document = await agent.generateDataDictionary(mockReportId);

      expect(document).toBeDefined();
      expect(document.type).toBe('data_dictionary');
      expect(document.title).toContain('Test Regulatory Report');
      expect(document.format).toBe('markdown');
      expect(document.content).toContain('# Data Dictionary: Test Regulatory Report');
      expect(document.content).toContain('Total Assets');
      expect(document.content).toContain('Tier 1 Capital');
      expect(document.content).toContain('Sum of all bank assets');
      expect(document.content).toContain('john.doe@testbank.com');
      expect(document.content).toContain('Data Mappings');
      expect(document.content).toContain('Core Banking');
    });

    it('should include timestamps when configured', async () => {
      const document = await agent.generateDataDictionary(mockReportId);

      expect(document.content).toContain('Generated:');
      expect(document.content).toContain('Organization: Test Bank');
    });

    it('should throw error when CDE inventory is missing', async () => {
      repository.deleteCDEInventory(mockReportId);

      await expect(agent.generateDataDictionary(mockReportId))
        .rejects.toThrow('Missing required data for report');
    });
  });

  describe('generateLineageDocumentation', () => {
    it('should generate comprehensive lineage documentation', async () => {
      const document = await agent.generateLineageDocumentation(mockReportId);

      expect(document).toBeDefined();
      expect(document.type).toBe('lineage_documentation');
      expect(document.title).toContain('Data Lineage Documentation');
      expect(document.content).toContain('# Data Lineage Documentation: Test Regulatory Report');
      expect(document.content).toContain('**Total Nodes:** 3');
      expect(document.content).toContain('**Total Edges:** 2');
      expect(document.content).toContain('Source Systems');
      expect(document.content).toContain('accounts');
      expect(document.content).toContain('Core Banking');
      expect(document.content).toContain('Asset Aggregation');
    });

    it('should throw error when lineage graph is missing', async () => {
      repository.deleteLineageGraph(mockReportId);

      await expect(agent.generateLineageDocumentation(mockReportId))
        .rejects.toThrow('No lineage graph found for report');
    });
  });

  describe('generateQualityAssuranceReport', () => {
    it('should generate comprehensive QA report', async () => {
      const document = await agent.generateQualityAssuranceReport(mockCycleId);

      expect(document).toBeDefined();
      expect(document.type).toBe('quality_assurance_report');
      expect(document.title).toContain('Quality Assurance Report');
      expect(document.content).toContain('# Quality Assurance Report: Test Regulatory Report');
      expect(document.content).toContain('Executive Summary');
      expect(document.content).toContain('Quality Metrics Summary');
      expect(document.content).toContain('**Total Data Quality Rules:** 2');
      expect(document.content).toContain('**Active Rules:** 2');
      expect(document.content).toContain('**Critical Data Elements:** 2');
      expect(document.content).toContain('Issues Analysis');
    });

    it('should include issue analysis when issues exist', async () => {
      const document = await agent.generateQualityAssuranceReport(mockCycleId);

      expect(document.content).toContain('Issues by Severity');
      expect(document.content).toContain('high');
      expect(document.content).toContain('1 high-severity issues should be resolved');
    });

    it('should throw error when cycle is not found', async () => {
      await expect(agent.generateQualityAssuranceReport('nonexistent-cycle'))
        .rejects.toThrow('Cycle nonexistent-cycle not found');
    });
  });

  describe('generateControlEffectivenessReport', () => {
    it('should generate comprehensive control effectiveness report', async () => {
      const document = await agent.generateControlEffectivenessReport(mockCycleId);

      expect(document).toBeDefined();
      expect(document.type).toBe('control_effectiveness_report');
      expect(document.title).toContain('Control Effectiveness Report');
      expect(document.content).toContain('# Control Effectiveness Report: Test Regulatory Report');
      expect(document.content).toContain('Executive Summary');
      expect(document.content).toContain('**Total Controls:** 2');
      expect(document.content).toContain('**Active Controls:** 2');
      expect(document.content).toContain('Asset Balance Reconciliation');
      expect(document.content).toContain('Capital Adequacy Check');
      expect(document.content).toContain('Pass Rate: 100.0%');
    });

    it('should throw error when control matrix is missing', async () => {
      repository.deleteControlMatrix(mockReportId);

      await expect(agent.generateControlEffectivenessReport(mockCycleId))
        .rejects.toThrow('No control matrix found for report');
    });
  });

  describe('generateBCBS239ComplianceMapping', () => {
    it('should generate comprehensive BCBS 239 compliance mapping', async () => {
      const document = await agent.generateBCBS239ComplianceMapping(mockReportId);

      expect(document).toBeDefined();
      expect(document.type).toBe('bcbs239_compliance_mapping');
      expect(document.title).toContain('BCBS 239 Compliance Mapping');
      expect(document.content).toContain('# BCBS 239 Compliance Mapping: Test Regulatory Report');
      expect(document.content).toContain('Principle 1: Governance');
      expect(document.content).toContain('Principle 3: Accuracy and Integrity');
      expect(document.content).toContain('Principle 4: Completeness');
      expect(document.content).toContain('Overall Compliance Summary');
      expect(document.content).toContain('Key Strengths');
      expect(document.content).toContain('Areas for Improvement');
    });

    it('should assess compliance based on available artifacts', async () => {
      const document = await agent.generateBCBS239ComplianceMapping(mockReportId);

      expect(document.content).toContain('✅');
      expect(document.content).toContain('Critical data elements are identified and managed');
      expect(document.content).toContain('Data quality rules are implemented and monitored');
      expect(document.content).toContain('Data lineage is documented and traceable');
      expect(document.content).toContain('Governance controls are established');
    });
  });

  describe('compileCompliancePackage', () => {
    it('should compile a complete compliance package', async () => {
      const compliancePackage = await agent.compileCompliancePackage(mockCycleId);

      expect(compliancePackage).toBeDefined();
      expect(compliancePackage.cycleId).toBe(mockCycleId);
      expect(compliancePackage.reportId).toBe(mockReportId);
      expect(compliancePackage.status).toBe('pending_review');
      expect(compliancePackage.documents).toHaveLength(6); // 5 main docs + summary
      
      const documentTypes = compliancePackage.documents.map(d => d.type);
      expect(documentTypes).toContain('data_dictionary');
      expect(documentTypes).toContain('lineage_documentation');
      expect(documentTypes).toContain('quality_assurance_report');
      expect(documentTypes).toContain('control_effectiveness_report');
      expect(documentTypes).toContain('bcbs239_compliance_mapping');
    });

    it('should store package in repository', async () => {
      const compliancePackage = await agent.compileCompliancePackage(mockCycleId);
      
      const storedPackage = repository.getCompliancePackage(mockCycleId);
      expect(storedPackage).toBeDefined();
      expect(storedPackage!.id).toBe(compliancePackage.id);
      expect(storedPackage!.documents).toHaveLength(6);
    });

    it('should throw error when cycle is not found', async () => {
      await expect(agent.compileCompliancePackage('nonexistent-cycle'))
        .rejects.toThrow('Cycle nonexistent-cycle not found');
    });
  });

  describe('approveCompliancePackage', () => {
    it('should approve a compliance package', async () => {
      // First compile the package
      await agent.compileCompliancePackage(mockCycleId);
      
      const approvedPackage = await agent.approveCompliancePackage(
        mockCycleId,
        'jane.smith@testbank.com'
      );

      expect(approvedPackage.status).toBe('approved');
      expect(approvedPackage.reviewedBy).toBe('jane.smith@testbank.com');
      expect(approvedPackage.reviewedAt).toBeDefined();
    });

    it('should apply modifications during approval', async () => {
      // First compile the package
      const originalPackage = await agent.compileCompliancePackage(mockCycleId);
      const documentToExclude = originalPackage.documents[0].id;
      
      const approvedPackage = await agent.approveCompliancePackage(
        mockCycleId,
        'jane.smith@testbank.com',
        { excludeDocuments: [documentToExclude] }
      );

      expect(approvedPackage.documents).toHaveLength(5);
      expect(approvedPackage.documents.find(d => d.id === documentToExclude)).toBeUndefined();
    });

    it('should throw error when package is not found', async () => {
      await expect(agent.approveCompliancePackage('nonexistent-cycle', 'reviewer'))
        .rejects.toThrow('No compliance package found for cycle');
    });

    it('should throw error when package is not pending review', async () => {
      // Create a package and approve it first
      await agent.compileCompliancePackage(mockCycleId);
      await agent.approveCompliancePackage(mockCycleId, 'first-reviewer');
      
      // Try to approve again
      await expect(agent.approveCompliancePackage(mockCycleId, 'second-reviewer'))
        .rejects.toThrow('Cannot approve package with status \'approved\'');
    });
  });

  describe('audit trail', () => {
    it('should create audit entries for all document generation actions', async () => {
      await agent.generateDataDictionary(mockReportId);
      
      const auditEntries = repository.getAuditEntries('Document');
      expect(auditEntries.length).toBeGreaterThan(0);
      
      const generationEntry = auditEntries.find(e => e.action === 'generate_data_dictionary');
      expect(generationEntry).toBeDefined();
      expect(generationEntry!.actor).toBe('DocumentationAgent');
      expect(generationEntry!.actorType).toBe('agent');
    });

    it('should create audit entries for package compilation', async () => {
      await agent.compileCompliancePackage(mockCycleId);
      
      const auditEntries = repository.getAuditEntries('CompliancePackage');
      expect(auditEntries.length).toBeGreaterThan(0);
      
      const compilationEntry = auditEntries.find(e => e.action === 'compile_compliance_package');
      expect(compilationEntry).toBeDefined();
      expect(compilationEntry!.actor).toBe('DocumentationAgent');
    });

    it('should create audit entries for package approval', async () => {
      await agent.compileCompliancePackage(mockCycleId);
      await agent.approveCompliancePackage(mockCycleId, 'jane.smith@testbank.com');
      
      const auditEntries = repository.getAuditEntries('CompliancePackage');
      const approvalEntry = auditEntries.find(e => e.action === 'approve_compliance_package');
      
      expect(approvalEntry).toBeDefined();
      expect(approvalEntry!.actor).toBe('jane.smith@testbank.com');
      expect(approvalEntry!.actorType).toBe('human');
    });
  });
});