/**
 * Report Catalog Service
 * Manages the regulatory report catalog with versioning and stakeholder notifications
 * 
 * Requirements: 1.2, 1.3, 1.4
 */

import {
  ReportCatalog,
  RegulatoryReport,
  RegulatoryChange,
  ArtifactStatus,
  Jurisdiction
} from '../types/index.js';
import { IGovernanceRepository } from '../repository/governance-repository.js';

/**
 * Notification recipient configuration
 */
export interface StakeholderConfig {
  email: string;
  name: string;
  role: string;
  jurisdictions: Jurisdiction[];
}

/**
 * Catalog version history entry
 */
export interface CatalogVersionEntry {
  version: number;
  timestamp: Date;
  changedBy: string;
  changeType: 'create' | 'update' | 'approve' | 'reject';
  changes: string[];
}

/**
 * Service for managing the regulatory report catalog
 */
export class ReportCatalogService {
  private repository: IGovernanceRepository;
  private stakeholders: StakeholderConfig[];
  private versionHistory: CatalogVersionEntry[] = [];

  constructor(
    repository: IGovernanceRepository,
    stakeholders: StakeholderConfig[] = []
  ) {
    this.repository = repository;
    this.stakeholders = stakeholders;
  }

  /**
   * Creates a new report catalog
   * Requirement 1.2: Add requirements to catalog
   * 
   * @param reports - Initial reports for the catalog
   * @param createdBy - Person creating the catalog
   * @returns The created catalog
   */
  createCatalog(reports: RegulatoryReport[], createdBy: string): ReportCatalog {
    const catalog: ReportCatalog = {
      reports,
      version: 1,
      lastScanned: new Date(),
      status: 'draft' as ArtifactStatus
    };

    this.repository.setReportCatalog(catalog);
    this.addVersionEntry(1, createdBy, 'create', ['Initial catalog creation']);

    this.repository.createAuditEntry({
      actor: createdBy,
      actorType: 'human',
      action: 'create_catalog',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      newState: catalog
    });

    return catalog;
  }


  /**
   * Adds a report to the catalog
   * Requirement 1.2: Add requirements to catalog
   * 
   * @param report - Report to add
   * @param addedBy - Person adding the report
   * @returns Updated catalog
   */
  addReport(report: RegulatoryReport, addedBy: string): ReportCatalog {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists. Create one first.');
    }

    const previousState = { ...catalog };
    const existingIndex = catalog.reports.findIndex(r => r.id === report.id);
    
    if (existingIndex !== -1) {
      throw new Error(`Report with ID ${report.id} already exists in catalog`);
    }

    const updatedCatalog: ReportCatalog = {
      ...catalog,
      reports: [...catalog.reports, report],
      version: catalog.version + 1,
      status: 'pending_review' as ArtifactStatus
    };

    this.repository.setReportCatalog(updatedCatalog);
    this.addVersionEntry(updatedCatalog.version, addedBy, 'update', [`Added report: ${report.name}`]);

    this.repository.createAuditEntry({
      actor: addedBy,
      actorType: 'human',
      action: 'add_report',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale: `Added report: ${report.name}`
    });

    return updatedCatalog;
  }

  /**
   * Updates a report in the catalog
   * Requirement 1.4: Allow modifications with audit trail
   * 
   * @param reportId - ID of report to update
   * @param updates - Updates to apply
   * @param updatedBy - Person making the update
   * @param rationale - Reason for the update
   * @returns Updated catalog
   */
  updateReport(
    reportId: string,
    updates: Partial<RegulatoryReport>,
    updatedBy: string,
    rationale: string
  ): ReportCatalog {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists');
    }

    const previousState = { ...catalog };
    const reportIndex = catalog.reports.findIndex(r => r.id === reportId);
    
    if (reportIndex === -1) {
      throw new Error(`Report with ID ${reportId} not found in catalog`);
    }

    const updatedReports = [...catalog.reports];
    updatedReports[reportIndex] = {
      ...updatedReports[reportIndex],
      ...updates,
      id: reportId, // Ensure ID cannot be changed
      lastUpdated: new Date()
    };

    const updatedCatalog: ReportCatalog = {
      ...catalog,
      reports: updatedReports,
      version: catalog.version + 1,
      status: 'pending_review' as ArtifactStatus
    };

    this.repository.setReportCatalog(updatedCatalog);
    this.addVersionEntry(updatedCatalog.version, updatedBy, 'update', [`Updated report: ${reportId}`]);

    this.repository.createAuditEntry({
      actor: updatedBy,
      actorType: 'human',
      action: 'update_report',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale
    });

    return updatedCatalog;
  }

  /**
   * Removes a report from the catalog
   * Requirement 1.4: Allow removals with audit trail
   * 
   * @param reportId - ID of report to remove
   * @param removedBy - Person removing the report
   * @param rationale - Reason for removal
   * @returns Updated catalog
   */
  removeReport(reportId: string, removedBy: string, rationale: string): ReportCatalog {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists');
    }

    const previousState = { ...catalog };
    const reportIndex = catalog.reports.findIndex(r => r.id === reportId);
    
    if (reportIndex === -1) {
      throw new Error(`Report with ID ${reportId} not found in catalog`);
    }

    const removedReport = catalog.reports[reportIndex];
    const updatedReports = catalog.reports.filter(r => r.id !== reportId);

    const updatedCatalog: ReportCatalog = {
      ...catalog,
      reports: updatedReports,
      version: catalog.version + 1,
      status: 'pending_review' as ArtifactStatus
    };

    this.repository.setReportCatalog(updatedCatalog);
    this.addVersionEntry(updatedCatalog.version, removedBy, 'update', [`Removed report: ${removedReport.name}`]);

    this.repository.createAuditEntry({
      actor: removedBy,
      actorType: 'human',
      action: 'remove_report',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale
    });

    return updatedCatalog;
  }

  /**
   * Submits the catalog for review
   * Requirement 1.3: Present catalog for human review
   * 
   * @param submittedBy - Person submitting for review
   * @returns Updated catalog
   */
  submitForReview(submittedBy: string): ReportCatalog {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists');
    }

    if (catalog.status !== 'draft') {
      throw new Error(`Cannot submit catalog with status '${catalog.status}' for review`);
    }

    const previousState = { ...catalog };
    const updatedCatalog: ReportCatalog = {
      ...catalog,
      status: 'pending_review' as ArtifactStatus
    };

    this.repository.setReportCatalog(updatedCatalog);

    this.repository.createAuditEntry({
      actor: submittedBy,
      actorType: 'human',
      action: 'submit_for_review',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog
    });

    // Notify stakeholders about pending review
    this.notifyStakeholdersForReview(catalog);

    return updatedCatalog;
  }

  /**
   * Approves the catalog
   * Requirement 1.3: Finalize after human review
   * 
   * @param approvedBy - Person approving the catalog
   * @returns Approved catalog
   */
  approveCatalog(approvedBy: string): ReportCatalog {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists');
    }

    if (catalog.status !== 'pending_review') {
      throw new Error(`Cannot approve catalog with status '${catalog.status}'`);
    }

    const previousState = { ...catalog };
    const updatedCatalog: ReportCatalog = {
      ...catalog,
      status: 'approved' as ArtifactStatus,
      approvedBy,
      approvedAt: new Date()
    };

    this.repository.setReportCatalog(updatedCatalog);
    this.addVersionEntry(catalog.version, approvedBy, 'approve', ['Catalog approved']);

    this.repository.createAuditEntry({
      actor: approvedBy,
      actorType: 'human',
      action: 'approve_catalog',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog
    });

    return updatedCatalog;
  }

  /**
   * Rejects the catalog
   * Requirement 1.3: Allow rejection during review
   * 
   * @param rejectedBy - Person rejecting the catalog
   * @param reason - Reason for rejection
   * @returns Rejected catalog
   */
  rejectCatalog(rejectedBy: string, reason: string): ReportCatalog {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists');
    }

    if (catalog.status !== 'pending_review') {
      throw new Error(`Cannot reject catalog with status '${catalog.status}'`);
    }

    const previousState = { ...catalog };
    const updatedCatalog: ReportCatalog = {
      ...catalog,
      status: 'rejected' as ArtifactStatus
    };

    this.repository.setReportCatalog(updatedCatalog);
    this.addVersionEntry(catalog.version, rejectedBy, 'reject', [`Rejected: ${reason}`]);

    this.repository.createAuditEntry({
      actor: rejectedBy,
      actorType: 'human',
      action: 'reject_catalog',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale: reason
    });

    return updatedCatalog;
  }

  /**
   * Gets the version history of the catalog
   * 
   * @returns Array of version history entries
   */
  getVersionHistory(): CatalogVersionEntry[] {
    return [...this.versionHistory];
  }

  /**
   * Gets stakeholders for a specific jurisdiction
   * 
   * @param jurisdiction - Jurisdiction to filter by
   * @returns Array of stakeholders
   */
  getStakeholdersForJurisdiction(jurisdiction: Jurisdiction): StakeholderConfig[] {
    return this.stakeholders.filter(s => s.jurisdictions.includes(jurisdiction));
  }

  /**
   * Adds a stakeholder
   * 
   * @param stakeholder - Stakeholder to add
   */
  addStakeholder(stakeholder: StakeholderConfig): void {
    this.stakeholders.push(stakeholder);
  }

  /**
   * Removes a stakeholder
   * 
   * @param email - Email of stakeholder to remove
   */
  removeStakeholder(email: string): void {
    this.stakeholders = this.stakeholders.filter(s => s.email !== email);
  }

  /**
   * Notifies stakeholders about a regulatory change
   * Requirement 1.2: Notify designated compliance officers
   * 
   * @param change - The regulatory change
   */
  notifyStakeholdersOfChange(change: RegulatoryChange): void {
    // In a real implementation, this would send emails/notifications
    // For now, we log the notification
    const catalog = this.repository.getReportCatalog();
    const report = catalog?.reports.find(r => r.id === change.reportId);
    
    const relevantStakeholders = report 
      ? this.getStakeholdersForJurisdiction(report.jurisdiction)
      : this.stakeholders;

    this.repository.createAuditEntry({
      actor: 'ReportCatalogService',
      actorType: 'system',
      action: 'notify_stakeholders',
      entityType: 'RegulatoryChange',
      entityId: change.id,
      newState: {
        change,
        notifiedStakeholders: relevantStakeholders.map(s => s.email)
      }
    });
  }

  /**
   * Notifies stakeholders about pending review
   * 
   * @param catalog - The catalog pending review
   */
  private notifyStakeholdersForReview(catalog: ReportCatalog): void {
    this.repository.createAuditEntry({
      actor: 'ReportCatalogService',
      actorType: 'system',
      action: 'notify_review_pending',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      newState: {
        version: catalog.version,
        notifiedStakeholders: this.stakeholders.map(s => s.email)
      }
    });
  }

  /**
   * Adds an entry to the version history
   * 
   * @param version - Version number
   * @param changedBy - Person who made the change
   * @param changeType - Type of change
   * @param changes - Description of changes
   */
  private addVersionEntry(
    version: number,
    changedBy: string,
    changeType: 'create' | 'update' | 'approve' | 'reject',
    changes: string[]
  ): void {
    this.versionHistory.push({
      version,
      timestamp: new Date(),
      changedBy,
      changeType,
      changes
    });
  }
}
