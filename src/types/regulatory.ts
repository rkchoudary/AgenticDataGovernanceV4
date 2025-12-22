/**
 * Regulatory report types for the Agentic Data Governance System
 */

import { Jurisdiction, ReportFrequency, ArtifactStatus } from './common.js';

/**
 * Due date rule for regulatory reports
 */
export interface DueDateRule {
  daysAfterPeriodEnd: number;
  businessDaysOnly: boolean;
  timezone: string;
}

/**
 * Represents a regulatory report in the catalog
 */
export interface RegulatoryReport {
  id: string;
  name: string;
  jurisdiction: Jurisdiction;
  regulator: string;
  frequency: ReportFrequency;
  dueDate: DueDateRule;
  submissionFormat: string;
  submissionPlatform: string;
  description: string;
  templateUrl?: string;
  lastUpdated: Date;
  responsibleUnit: string;
}

/**
 * Catalog of all regulatory reports
 */
export interface ReportCatalog {
  reports: RegulatoryReport[];
  version: number;
  lastScanned: Date;
  status: ArtifactStatus;
  approvedBy?: string;
  approvedAt?: Date;
}

/**
 * Represents a detected regulatory change
 */
export interface RegulatoryChange {
  id: string;
  reportId?: string;
  changeType: 'new' | 'updated' | 'removed';
  description: string;
  effectiveDate: Date;
  detectedAt: Date;
  source: string;
}

/**
 * Result of scanning regulatory sources
 */
export interface ScanResult {
  jurisdiction: Jurisdiction;
  scannedAt: Date;
  reportsFound: number;
  changesDetected: RegulatoryChange[];
}

/**
 * Result of updating the catalog
 */
export interface CatalogUpdate {
  version: number;
  addedReports: string[];
  updatedReports: string[];
  removedReports: string[];
  updatedAt: Date;
}
