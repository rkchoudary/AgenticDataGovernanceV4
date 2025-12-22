/**
 * Issue management types for the Agentic Data Governance System
 */

import { IssueStatus, Severity, ResolutionType } from './common.js';

/**
 * Resolution details for an issue
 */
export interface Resolution {
  type: ResolutionType;
  description: string;
  implementedBy: string;
  implementedAt: Date;
  verifiedBy?: string;
  verifiedAt?: Date;
}

/**
 * Issue record
 */
export interface Issue {
  id: string;
  title: string;
  description: string;
  source: string;
  impactedReports: string[];
  impactedCDEs: string[];
  severity: Severity;
  status: IssueStatus;
  assignee: string;
  createdAt: Date;
  dueDate?: Date;
  rootCause?: string;
  resolution?: Resolution;
  compensatingControl?: string;
  escalationLevel: number;
  escalatedAt?: Date;
}

/**
 * Context for creating an issue
 */
export interface IssueContext {
  reportId: string;
  cdeId?: string;
  ruleId?: string;
  dataDomain?: string;
}

/**
 * Root cause suggestion
 */
export interface RootCauseSuggestion {
  issueId: string;
  suggestedCause: string;
  confidence: number;
  similarIssueIds: string[];
}

/**
 * Issue metrics
 */
export interface IssueMetrics {
  openCount: number;
  openBySeverity: Record<Severity, number>;
  avgResolutionTime: number;
  recurringThemes: { theme: string; count: number }[];
}

/**
 * Filters for querying issues
 */
export interface IssueFilters {
  status?: IssueStatus[];
  severity?: Severity[];
  assignee?: string;
  reportId?: string;
  cdeId?: string;
  fromDate?: Date;
  toDate?: Date;
}
