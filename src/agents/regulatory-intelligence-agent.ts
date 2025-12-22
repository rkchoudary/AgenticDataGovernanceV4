/**
 * Regulatory Intelligence Agent
 * Monitors regulatory sources and maintains the report catalog
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Jurisdiction,
  RegulatoryChange,
  ScanResult,
  CatalogUpdate,
  ReportCatalog,
  RegulatoryReport,
  ArtifactStatus
} from '../types/index.js';
import { IRegulatoryIntelligenceAgent } from '../interfaces/agents.js';
import { IGovernanceRepository } from '../repository/governance-repository.js';

/**
 * Notification handler interface for stakeholder notifications
 */
export interface INotificationHandler {
  notify(recipients: string[], subject: string, message: string): Promise<void>;
}

/**
 * Default notification handler that logs notifications
 */
export class ConsoleNotificationHandler implements INotificationHandler {
  async notify(recipients: string[], subject: string, message: string): Promise<void> {
    console.log(`[Notification] To: ${recipients.join(', ')}, Subject: ${subject}, Message: ${message}`);
  }
}

/**
 * Configuration for the Regulatory Intelligence Agent
 */
export interface RegulatoryIntelligenceAgentConfig {
  defaultStakeholders: string[];
  notificationHandler?: INotificationHandler;
}

/**
 * Implementation of the Regulatory Intelligence Agent
 */
export class RegulatoryIntelligenceAgent implements IRegulatoryIntelligenceAgent {
  private repository: IGovernanceRepository;
  private config: RegulatoryIntelligenceAgentConfig;
  private notificationHandler: INotificationHandler;

  constructor(
    repository: IGovernanceRepository,
    config: RegulatoryIntelligenceAgentConfig
  ) {
    this.repository = repository;
    this.config = config;
    this.notificationHandler = config.notificationHandler || new ConsoleNotificationHandler();
  }


  /**
   * Scans regulatory body sources for required reports
   * Requirement 1.1: Compile list of all required reports with metadata
   * 
   * @param jurisdictions - List of jurisdictions to scan (US, CA)
   * @returns Array of scan results with detected reports and changes
   */
  async scanRegulatorySources(jurisdictions: Jurisdiction[]): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const existingCatalog = this.repository.getReportCatalog();
    const existingReportIds = new Set(existingCatalog?.reports.map(r => r.id) || []);

    for (const jurisdiction of jurisdictions) {
      const scannedReports = await this.fetchReportsForJurisdiction(jurisdiction);
      const changes: RegulatoryChange[] = [];

      for (const report of scannedReports) {
        if (!existingReportIds.has(report.id)) {
          // New report detected
          changes.push({
            id: uuidv4(),
            reportId: report.id,
            changeType: 'new',
            description: `New regulatory report detected: ${report.name}`,
            effectiveDate: report.lastUpdated,
            detectedAt: new Date(),
            source: report.regulator
          });
        } else {
          // Check for updates to existing report
          const existingReport = existingCatalog?.reports.find(r => r.id === report.id);
          if (existingReport && this.hasReportChanged(existingReport, report)) {
            changes.push({
              id: uuidv4(),
              reportId: report.id,
              changeType: 'updated',
              description: `Regulatory report updated: ${report.name}`,
              effectiveDate: report.lastUpdated,
              detectedAt: new Date(),
              source: report.regulator
            });
          }
        }
      }

      results.push({
        jurisdiction,
        scannedAt: new Date(),
        reportsFound: scannedReports.length,
        changesDetected: changes
      });
    }

    // Log the scan action
    this.repository.createAuditEntry({
      actor: 'RegulatoryIntelligenceAgent',
      actorType: 'agent',
      action: 'scan_regulatory_sources',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      newState: { jurisdictions, resultsCount: results.length }
    });

    return results;
  }

  /**
   * Detects changes in regulatory requirements since a given date
   * Requirement 1.2: Detect new or updated reporting requirements
   * 
   * @param since - Date to check changes from
   * @returns Array of detected regulatory changes
   */
  async detectChanges(since: Date): Promise<RegulatoryChange[]> {
    const allJurisdictions: Jurisdiction[] = ['US', 'CA'];
    const scanResults = await this.scanRegulatorySources(allJurisdictions);
    
    const changes: RegulatoryChange[] = [];
    for (const result of scanResults) {
      for (const change of result.changesDetected) {
        if (change.detectedAt >= since) {
          changes.push(change);
        }
      }
    }

    return changes;
  }

  /**
   * Updates the report catalog with detected changes
   * Requirement 1.2: Add requirements to catalog and notify compliance officers
   * 
   * @param changes - Array of regulatory changes to apply
   * @returns Catalog update result
   */
  async updateReportCatalog(changes: RegulatoryChange[]): Promise<CatalogUpdate> {
    const existingCatalog = this.repository.getReportCatalog();
    const currentReports = existingCatalog?.reports || [];
    const currentVersion = existingCatalog?.version || 0;

    const addedReports: string[] = [];
    const updatedReports: string[] = [];
    const removedReports: string[] = [];

    const updatedReportsList = [...currentReports];

    for (const change of changes) {
      if (!change.reportId) continue;

      switch (change.changeType) {
        case 'new': {
          // Fetch the new report details and add to catalog
          const newReport = await this.fetchReportById(change.reportId);
          if (newReport) {
            updatedReportsList.push(newReport);
            addedReports.push(change.reportId);
            // Notify stakeholders about new report
            await this.notifyStakeholders(change);
          }
          break;
        }
        case 'updated': {
          const index = updatedReportsList.findIndex(r => r.id === change.reportId);
          if (index !== -1) {
            const updatedReport = await this.fetchReportById(change.reportId);
            if (updatedReport) {
              updatedReportsList[index] = updatedReport;
              updatedReports.push(change.reportId);
              // Notify stakeholders about updated report
              await this.notifyStakeholders(change);
            }
          }
          break;
        }
        case 'removed': {
          const removeIndex = updatedReportsList.findIndex(r => r.id === change.reportId);
          if (removeIndex !== -1) {
            updatedReportsList.splice(removeIndex, 1);
            removedReports.push(change.reportId);
            // Notify stakeholders about removed report
            await this.notifyStakeholders(change);
          }
          break;
        }
      }
    }

    // Create new catalog with pending_review status (Requirement 1.3)
    const newCatalog: ReportCatalog = {
      reports: updatedReportsList,
      version: currentVersion + 1,
      lastScanned: new Date(),
      status: 'pending_review' as ArtifactStatus
    };

    this.repository.setReportCatalog(newCatalog);

    const catalogUpdate: CatalogUpdate = {
      version: newCatalog.version,
      addedReports,
      updatedReports,
      removedReports,
      updatedAt: new Date()
    };

    // Log the update action (Requirement 1.4)
    this.repository.createAuditEntry({
      actor: 'RegulatoryIntelligenceAgent',
      actorType: 'agent',
      action: 'update_report_catalog',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState: existingCatalog,
      newState: newCatalog,
      rationale: `Applied ${changes.length} changes to catalog`
    });

    return catalogUpdate;
  }


  /**
   * Gets the current report catalog
   * 
   * @returns Current report catalog
   */
  async getReportCatalog(): Promise<ReportCatalog> {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      // Return empty catalog if none exists
      return {
        reports: [],
        version: 0,
        lastScanned: new Date(),
        status: 'draft' as ArtifactStatus
      };
    }
    return catalog;
  }

  /**
   * Notifies stakeholders about regulatory changes
   * Requirement 1.2: Notify designated compliance officers
   * 
   * @param change - The regulatory change to notify about
   */
  async notifyStakeholders(change: RegulatoryChange): Promise<void> {
    const subject = `Regulatory Change Detected: ${change.changeType.toUpperCase()}`;
    const message = `
Change Type: ${change.changeType}
Description: ${change.description}
Effective Date: ${change.effectiveDate.toISOString()}
Source: ${change.source}
Detected At: ${change.detectedAt.toISOString()}
${change.reportId ? `Report ID: ${change.reportId}` : ''}
    `.trim();

    await this.notificationHandler.notify(
      this.config.defaultStakeholders,
      subject,
      message
    );

    // Log the notification (Requirement 1.4)
    this.repository.createAuditEntry({
      actor: 'RegulatoryIntelligenceAgent',
      actorType: 'agent',
      action: 'notify_stakeholders',
      entityType: 'RegulatoryChange',
      entityId: change.id,
      newState: {
        recipients: this.config.defaultStakeholders,
        changeType: change.changeType,
        reportId: change.reportId
      }
    });
  }

  /**
   * Fetches reports for a specific jurisdiction
   * This is a placeholder that would connect to actual regulatory APIs
   * 
   * @param jurisdiction - The jurisdiction to fetch reports for
   * @returns Array of regulatory reports
   */
  private async fetchReportsForJurisdiction(jurisdiction: Jurisdiction): Promise<RegulatoryReport[]> {
    // In a real implementation, this would connect to regulatory APIs
    // For now, return existing reports from the catalog for the jurisdiction
    const catalog = this.repository.getReportCatalog();
    if (!catalog) return [];
    
    return catalog.reports.filter(r => r.jurisdiction === jurisdiction);
  }

  /**
   * Fetches a specific report by ID
   * This is a placeholder that would connect to actual regulatory APIs
   * 
   * @param reportId - The ID of the report to fetch
   * @returns The regulatory report or undefined
   */
  private async fetchReportById(reportId: string): Promise<RegulatoryReport | undefined> {
    // In a real implementation, this would fetch from regulatory APIs
    const catalog = this.repository.getReportCatalog();
    return catalog?.reports.find(r => r.id === reportId);
  }

  /**
   * Checks if a report has changed compared to an existing version
   * 
   * @param existing - The existing report
   * @param updated - The potentially updated report
   * @returns True if the report has changed
   */
  private hasReportChanged(existing: RegulatoryReport, updated: RegulatoryReport): boolean {
    return (
      existing.name !== updated.name ||
      existing.frequency !== updated.frequency ||
      existing.submissionFormat !== updated.submissionFormat ||
      existing.submissionPlatform !== updated.submissionPlatform ||
      existing.description !== updated.description ||
      existing.dueDate.daysAfterPeriodEnd !== updated.dueDate.daysAfterPeriodEnd ||
      existing.dueDate.businessDaysOnly !== updated.dueDate.businessDaysOnly ||
      existing.lastUpdated.getTime() !== updated.lastUpdated.getTime()
    );
  }

  /**
   * Approves the report catalog after human review
   * Requirement 1.3: Present catalog for human review before finalizing
   * Requirement 1.4: Allow modifications with audit trail logging
   * 
   * @param approver - The person approving the catalog
   * @param modifications - Optional modifications to apply before approval
   */
  async approveCatalog(
    approver: string,
    modifications?: Partial<ReportCatalog>
  ): Promise<ReportCatalog> {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists to approve');
    }

    const previousState = { ...catalog };

    // Apply any modifications
    const updatedCatalog: ReportCatalog = {
      ...catalog,
      ...modifications,
      status: 'approved' as ArtifactStatus,
      approvedBy: approver,
      approvedAt: new Date()
    };

    this.repository.setReportCatalog(updatedCatalog);

    // Log the approval action
    this.repository.createAuditEntry({
      actor: approver,
      actorType: 'human',
      action: 'approve_catalog',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale: modifications ? 'Approved with modifications' : 'Approved without modifications'
    });

    return updatedCatalog;
  }

  /**
   * Submits the catalog for review
   * Requirement 1.3: Present catalog for human review
   * 
   * @param submitter - The person submitting for review
   */
  async submitForReview(submitter: string): Promise<ReportCatalog> {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists to submit for review');
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

    // Log the submission action
    this.repository.createAuditEntry({
      actor: submitter,
      actorType: 'human',
      action: 'submit_for_review',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale: 'Submitted catalog for human review'
    });

    return updatedCatalog;
  }

  /**
   * Modifies the report catalog
   * Requirement 1.4: Allow modifications with audit trail logging
   * 
   * @param modifier - The person making modifications
   * @param modifications - The modifications to apply
   * @param rationale - Reason for the modifications
   */
  async modifyCatalog(
    modifier: string,
    modifications: {
      addReports?: RegulatoryReport[];
      updateReports?: RegulatoryReport[];
      removeReportIds?: string[];
    },
    rationale: string
  ): Promise<ReportCatalog> {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('No catalog exists to modify');
    }

    const previousState = { ...catalog };
    let updatedReports = [...catalog.reports];

    // Add new reports
    if (modifications.addReports) {
      updatedReports.push(...modifications.addReports);
    }

    // Update existing reports
    if (modifications.updateReports) {
      for (const updated of modifications.updateReports) {
        const index = updatedReports.findIndex(r => r.id === updated.id);
        if (index !== -1) {
          updatedReports[index] = updated;
        }
      }
    }

    // Remove reports
    if (modifications.removeReportIds) {
      updatedReports = updatedReports.filter(
        r => !modifications.removeReportIds!.includes(r.id)
      );
    }

    const updatedCatalog: ReportCatalog = {
      ...catalog,
      reports: updatedReports,
      version: catalog.version + 1,
      status: 'pending_review' as ArtifactStatus // Reset to pending review after modifications
    };

    this.repository.setReportCatalog(updatedCatalog);

    // Log the modification action
    this.repository.createAuditEntry({
      actor: modifier,
      actorType: 'human',
      action: 'modify_catalog',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: updatedCatalog,
      rationale
    });

    return updatedCatalog;
  }
}
