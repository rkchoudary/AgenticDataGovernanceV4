/**
 * Regulatory Knowledge Base types for the AI Assistant
 * Extends the base regulatory types with comprehensive report information
 * 
 * Requirements: 5.1, 5.2, 12.1-12.7
 */

import { Jurisdiction, ReportFrequency } from './common.js';

/**
 * Extended due date rule with more flexibility
 */
export interface DueDateRule {
  /** Days after period end for submission */
  daysAfterPeriodEnd: number;
  /** Whether to count only business days */
  businessDaysOnly: boolean;
  /** Timezone for deadline calculation */
  timezone: string;
  /** Optional specific day of month (e.g., 15th) */
  specificDayOfMonth?: number;
  /** Optional description of the deadline rule */
  description?: string;
}

/**
 * Regulator information
 */
export interface Regulator {
  id: string;
  name: string;
  abbreviation: string;
  jurisdiction: Jurisdiction;
  website?: string;
}

/**
 * Extended regulatory report with comprehensive knowledge base fields
 * Requirements: 5.1, 5.2
 */
export interface RegulatoryReportKB {
  /** Unique identifier */
  id: string;
  /** Full report name */
  name: string;
  /** Short name or acronym */
  shortName: string;
  /** Primary regulator */
  regulator: string;
  /** Additional regulators if jointly required */
  additionalRegulators?: string[];
  /** Jurisdiction (US or CA) */
  jurisdiction: Jurisdiction;
  /** Detailed description of the report */
  description: string;
  /** Purpose and objectives of the report */
  purpose: string;
  /** Regulatory basis (laws, rules, guidance) */
  regulatoryBasis: string;
  /** Filing frequency */
  frequency: ReportFrequency | 'biennial' | 'event-driven' | 'ad-hoc';
  /** Due date calculation rules */
  dueDate: DueDateRule;
  /** Submission format (XML, XBRL, PDF, etc.) */
  submissionFormat: string;
  /** Platform for submission */
  submissionPlatform: string;
  /** Key data elements required */
  dataElements: string[];
  /** Report category for grouping */
  category: ReportCategory;
  /** Applicability criteria */
  applicability?: string;
  /** Related reports */
  relatedReports?: string[];
  /** Last updated date */
  lastUpdated: Date;
  /** External reference URL */
  referenceUrl?: string;
}

/**
 * Report categories for organization
 */
export type ReportCategory = 
  | 'capital_stress_testing'
  | 'liquidity'
  | 'resolution_planning'
  | 'risk_management'
  | 'financial_statements'
  | 'aml_compliance'
  | 'prudential';

/**
 * Query types for regulatory knowledge base
 */
export interface RegulatoryQuery {
  /** Query type */
  type: 'definition' | 'schedule' | 'data_sources' | 'changes' | 'comparison';
  /** Report ID or name to query */
  reportId?: string;
  /** Jurisdiction filter */
  jurisdiction?: Jurisdiction;
  /** Regulator filter */
  regulator?: string;
  /** Category filter */
  category?: ReportCategory;
  /** Date range for change queries */
  dateRange?: {
    start: Date;
    end: Date;
  };
}

/**
 * Response for regulatory queries
 */
export interface RegulatoryQueryResult {
  /** Query that was executed */
  query: RegulatoryQuery;
  /** Matching reports */
  reports: RegulatoryReportKB[];
  /** Summary text for the response */
  summary: string;
  /** Related information */
  relatedInfo?: string[];
  /** Timestamp of the query */
  timestamp: Date;
}

/**
 * Schedule information for a report
 */
export interface ReportSchedule {
  reportId: string;
  reportName: string;
  frequency: string;
  nextDueDate: Date;
  submissionWindow: {
    start: Date;
    end: Date;
  };
  daysUntilDue: number;
  isOverdue: boolean;
}

/**
 * Regulatory change notification
 */
export interface RegulatoryChangeNotification {
  id: string;
  reportId: string;
  changeType: 'new_requirement' | 'deadline_change' | 'format_change' | 'guidance_update' | 'retired';
  title: string;
  description: string;
  effectiveDate: Date;
  announcedDate: Date;
  source: string;
  impactLevel: 'high' | 'medium' | 'low';
  actionRequired?: string;
}
