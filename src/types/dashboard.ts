/**
 * Dashboard types for the Agentic Data Governance System
 */

/**
 * CDE quality score for dashboard display
 */
export interface CDEQualityScore {
  cdeId: string;
  cdeName: string;
  completeness: number;
  accuracy: number;
  timeliness: number;
  overallScore: number;
  thresholdBreached: boolean;
  lastUpdated: Date;
}

/**
 * Quality trend data point
 */
export interface QualityTrend {
  date: Date;
  dimension: string;
  score: number;
}

/**
 * Issue summary for dashboard
 */
export interface IssueSummary {
  totalOpen: number;
  bySeverity: Record<string, number>;
  avgResolutionTime: number;
  topPriorityItems: string[];
}

/**
 * Control status for dashboard
 */
export interface ControlStatusDisplay {
  controlId: string;
  controlName: string;
  type: 'reconciliation' | 'validation' | 'approval';
  status: 'pass' | 'fail' | 'pending';
  lastExecuted: Date;
  evidence?: string;
}

/**
 * Calendar entry for regulatory deadlines
 */
export interface CalendarEntry {
  id: string;
  reportId: string;
  reportName: string;
  dueDate: Date;
  status: 'upcoming' | 'in_progress' | 'completed' | 'overdue';
}

/**
 * Annotation on a metric
 */
export interface Annotation {
  id: string;
  metricId: string;
  comment: string;
  createdBy: string;
  createdAt: Date;
}

/**
 * Date range for queries
 */
export interface DateRange {
  start: Date;
  end: Date;
}
