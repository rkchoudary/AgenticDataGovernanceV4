/**
 * Unit tests for Regulatory Intelligence Agent
 * 
 * Tests regulatory source scanning, change detection, and catalog updates
 * Requirements: 1.1, 1.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  RegulatoryIntelligenceAgent, 
  INotificationHandler,
  RegulatoryIntelligenceAgentConfig 
} from '../../../agents/regulatory-intelligence-agent.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import {
  ReportCatalog,
  RegulatoryReport,
  RegulatoryChange,
  Jurisdiction,
  ArtifactStatus
} from '../../../types/index.js';

describe('RegulatoryIntelligenceAgent', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: RegulatoryIntelligenceAgent;
  let mockNotificationHandler: INotificationHandler;
  let config: RegulatoryIntelligenceAgentConfig;

  // Sample regulatory reports for testing
  const sampleUSReport: RegulatoryReport = {
    id: 'report-us-001',
    name: 'FR Y-9C',
    jurisdiction: 'US',
    regulator: 'Federal Reserve',
    frequency: 'quarterly',
    dueDate: {
      daysAfterPeriodEnd: 40,
      businessDaysOnly: true,
      timezone: 'America/New_York'
    },
    submissionFormat: 'XML',
    submissionPlatform: 'FRB Reporting Central',
    description: 'Consolidated Financial Statements for Holding Companies',
    lastUpdated: new Date('2024-01-01'),
    responsibleUnit: 'Finance'
  };

  const sampleCAReport: RegulatoryReport = {
    id: 'report-ca-001',
    name: 'OSFI Return',
    jurisdiction: 'CA',
    regulator: 'OSFI',
    frequency: 'monthly',
    dueDate: {
      daysAfterPeriodEnd: 20,
      businessDaysOnly: true,
      timezone: 'America/Toronto'
    },
    submissionFormat: 'XBRL',
    submissionPlatform: 'RRS',
    description: 'Monthly Regulatory Return',
    lastUpdated: new Date('2024-01-15'),
    responsibleUnit: 'Regulatory Reporting'
  };


  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    mockNotificationHandler = {
      notify: vi.fn().mockResolvedValue(undefined)
    };
    config = {
      defaultStakeholders: ['compliance@example.com', 'regulatory@example.com'],
      notificationHandler: mockNotificationHandler
    };
    agent = new RegulatoryIntelligenceAgent(repository, config);
  });

  describe('scanRegulatorySources', () => {
    it('should return scan results for each jurisdiction', async () => {
      // Setup: Create initial catalog with reports
      const initialCatalog: ReportCatalog = {
        reports: [sampleUSReport, sampleCAReport],
        version: 1,
        lastScanned: new Date('2024-01-01'),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(initialCatalog);

      // Execute
      const results = await agent.scanRegulatorySources(['US', 'CA']);

      // Verify
      expect(results).toHaveLength(2);
      expect(results.find(r => r.jurisdiction === 'US')).toBeDefined();
      expect(results.find(r => r.jurisdiction === 'CA')).toBeDefined();
    });

    it('should detect no changes when catalog is unchanged', async () => {
      // Setup: Create catalog
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      const results = await agent.scanRegulatorySources(['US']);

      // Verify - no changes detected since reports match
      expect(results).toHaveLength(1);
      expect(results[0].changesDetected).toHaveLength(0);
    });

    it('should create audit entry for scan operation', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      await agent.scanRegulatorySources(['US', 'CA']);

      // Verify audit entry was created
      const auditEntries = repository.getAuditEntries();
      const scanEntry = auditEntries.find(e => e.action === 'scan_regulatory_sources');
      expect(scanEntry).toBeDefined();
      expect(scanEntry?.actor).toBe('RegulatoryIntelligenceAgent');
      expect(scanEntry?.actorType).toBe('agent');
    });
  });

  describe('detectChanges', () => {
    it('should detect changes since a given date', async () => {
      // Setup: Create catalog
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute - detect changes since yesterday
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const changes = await agent.detectChanges(yesterday);

      // Verify - returns array (may be empty if no changes)
      expect(Array.isArray(changes)).toBe(true);
    });

    it('should filter changes by date', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute - detect changes since future date (should return empty)
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const changes = await agent.detectChanges(futureDate);

      // Verify
      expect(changes).toHaveLength(0);
    });
  });

  describe('updateReportCatalog', () => {
    it('should update catalog with new reports', async () => {
      // Setup: Create initial catalog
      const initialCatalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(initialCatalog);

      // Create a change for adding a new report
      const newReportChange: RegulatoryChange = {
        id: 'change-001',
        reportId: sampleCAReport.id,
        changeType: 'new',
        description: 'New Canadian report added',
        effectiveDate: new Date(),
        detectedAt: new Date(),
        source: 'OSFI'
      };

      // Add the new report to the catalog first (simulating fetch)
      repository.setReportCatalog({
        ...initialCatalog,
        reports: [...initialCatalog.reports, sampleCAReport]
      });

      // Execute
      const update = await agent.updateReportCatalog([newReportChange]);

      // Verify
      expect(update.addedReports).toContain(sampleCAReport.id);
      expect(update.version).toBeGreaterThan(1);
    });

    it('should set catalog status to pending_review after update', async () => {
      // Setup
      const initialCatalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(initialCatalog);

      // Execute with empty changes
      await agent.updateReportCatalog([]);

      // Verify
      const catalog = await agent.getReportCatalog();
      expect(catalog.status).toBe('pending_review');
    });

    it('should notify stakeholders for new reports', async () => {
      // Setup
      const initialCatalog: ReportCatalog = {
        reports: [sampleUSReport, sampleCAReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(initialCatalog);

      const newReportChange: RegulatoryChange = {
        id: 'change-001',
        reportId: sampleCAReport.id,
        changeType: 'new',
        description: 'New report',
        effectiveDate: new Date(),
        detectedAt: new Date(),
        source: 'OSFI'
      };

      // Execute
      await agent.updateReportCatalog([newReportChange]);

      // Verify notification was sent
      expect(mockNotificationHandler.notify).toHaveBeenCalled();
    });

    it('should create audit entry for catalog update', async () => {
      // Setup
      const initialCatalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(initialCatalog);

      // Execute
      await agent.updateReportCatalog([]);

      // Verify
      const auditEntries = repository.getAuditEntries('ReportCatalog');
      const updateEntry = auditEntries.find(e => e.action === 'update_report_catalog');
      expect(updateEntry).toBeDefined();
      expect(updateEntry?.actor).toBe('RegulatoryIntelligenceAgent');
    });
  });


  describe('getReportCatalog', () => {
    it('should return existing catalog', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport, sampleCAReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      const result = await agent.getReportCatalog();

      // Verify
      expect(result.reports).toHaveLength(2);
      expect(result.version).toBe(1);
    });

    it('should return empty catalog when none exists', async () => {
      // Execute
      const result = await agent.getReportCatalog();

      // Verify
      expect(result.reports).toHaveLength(0);
      expect(result.version).toBe(0);
      expect(result.status).toBe('draft');
    });
  });

  describe('notifyStakeholders', () => {
    it('should send notification for regulatory change', async () => {
      // Setup
      const change: RegulatoryChange = {
        id: 'change-001',
        reportId: 'report-001',
        changeType: 'updated',
        description: 'Report format changed',
        effectiveDate: new Date(),
        detectedAt: new Date(),
        source: 'Federal Reserve'
      };

      // Execute
      await agent.notifyStakeholders(change);

      // Verify
      expect(mockNotificationHandler.notify).toHaveBeenCalledWith(
        config.defaultStakeholders,
        expect.stringContaining('UPDATED'),
        expect.stringContaining('Report format changed')
      );
    });

    it('should create audit entry for notification', async () => {
      // Setup
      const change: RegulatoryChange = {
        id: 'change-001',
        reportId: 'report-001',
        changeType: 'new',
        description: 'New report',
        effectiveDate: new Date(),
        detectedAt: new Date(),
        source: 'OSFI'
      };

      // Execute
      await agent.notifyStakeholders(change);

      // Verify
      const auditEntries = repository.getAuditEntries('RegulatoryChange', change.id);
      const notifyEntry = auditEntries.find(e => e.action === 'notify_stakeholders');
      expect(notifyEntry).toBeDefined();
      expect(notifyEntry?.newState).toHaveProperty('recipients');
    });
  });

  describe('approveCatalog', () => {
    it('should approve catalog and set approver', async () => {
      // Setup: Create catalog in pending_review state
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'pending_review' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      const approved = await agent.approveCatalog('john.doe@example.com');

      // Verify
      expect(approved.status).toBe('approved');
      expect(approved.approvedBy).toBe('john.doe@example.com');
      expect(approved.approvedAt).toBeDefined();
    });

    it('should throw error when no catalog exists', async () => {
      // Execute & Verify
      await expect(agent.approveCatalog('approver')).rejects.toThrow('No catalog exists');
    });

    it('should apply modifications during approval', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'pending_review' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute with modifications
      const approved = await agent.approveCatalog('approver', {
        reports: [sampleUSReport, sampleCAReport]
      });

      // Verify
      expect(approved.reports).toHaveLength(2);
      expect(approved.status).toBe('approved');
    });
  });

  describe('submitForReview', () => {
    it('should transition catalog from draft to pending_review', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'draft' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      const submitted = await agent.submitForReview('submitter');

      // Verify
      expect(submitted.status).toBe('pending_review');
    });

    it('should throw error when catalog is not in draft status', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute & Verify
      await expect(agent.submitForReview('submitter')).rejects.toThrow(
        "Cannot submit catalog with status 'approved' for review"
      );
    });
  });

  describe('modifyCatalog', () => {
    it('should add reports to catalog', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      const modified = await agent.modifyCatalog(
        'modifier',
        { addReports: [sampleCAReport] },
        'Adding Canadian report'
      );

      // Verify
      expect(modified.reports).toHaveLength(2);
      expect(modified.version).toBe(2);
      expect(modified.status).toBe('pending_review');
    });

    it('should update existing reports', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      const updatedReport: RegulatoryReport = {
        ...sampleUSReport,
        description: 'Updated description'
      };

      // Execute
      const modified = await agent.modifyCatalog(
        'modifier',
        { updateReports: [updatedReport] },
        'Updating report description'
      );

      // Verify
      expect(modified.reports[0].description).toBe('Updated description');
    });

    it('should remove reports from catalog', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport, sampleCAReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      const modified = await agent.modifyCatalog(
        'modifier',
        { removeReportIds: [sampleCAReport.id] },
        'Removing Canadian report'
      );

      // Verify
      expect(modified.reports).toHaveLength(1);
      expect(modified.reports[0].id).toBe(sampleUSReport.id);
    });

    it('should create audit entry with rationale', async () => {
      // Setup
      const catalog: ReportCatalog = {
        reports: [sampleUSReport],
        version: 1,
        lastScanned: new Date(),
        status: 'approved' as ArtifactStatus
      };
      repository.setReportCatalog(catalog);

      // Execute
      await agent.modifyCatalog(
        'modifier',
        { addReports: [sampleCAReport] },
        'Adding new regulatory requirement'
      );

      // Verify
      const auditEntries = repository.getAuditEntries('ReportCatalog');
      const modifyEntry = auditEntries.find(e => e.action === 'modify_catalog');
      expect(modifyEntry).toBeDefined();
      expect(modifyEntry?.rationale).toBe('Adding new regulatory requirement');
      expect(modifyEntry?.actor).toBe('modifier');
    });
  });
});
