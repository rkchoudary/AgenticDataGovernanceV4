/**
 * Service interfaces for the Agentic Data Governance System
 */

import {
  CDEQualityScore,
  QualityTrend,
  IssueSummary,
  ControlStatusDisplay,
  CalendarEntry,
  Annotation,
  DateRange,
  IssueFilters
} from '../types/index.js';

/**
 * Dashboard Service interface
 * Provides real-time monitoring and visualization
 */
export interface IDashboardService {
  getCDEQualityScores(reportId: string): Promise<CDEQualityScore[]>;
  getQualityTrends(reportId: string, period: DateRange): Promise<QualityTrend[]>;
  getIssuesSummary(filters: IssueFilters): Promise<IssueSummary>;
  getControlStatus(reportId: string): Promise<ControlStatusDisplay[]>;
  getRegulatoryCalendar(period: DateRange): Promise<CalendarEntry[]>;
  addAnnotation(metricId: string, annotation: Omit<Annotation, 'id' | 'createdAt'>): Promise<void>;
}

/**
 * Workflow Engine interface
 * Manages task scheduling and deadline alerting
 */
export interface IWorkflowEngine {
  scheduleTask(cycleId: string, taskType: string, dueDate: Date): Promise<string>;
  getDeadlineAlerts(cycleId: string): Promise<{ taskId: string; dueDate: Date; daysRemaining: number }[]>;
  generateSubmissionChecklist(reportId: string, cycleId: string): Promise<ChecklistItem[]>;
  updateChecklistStatus(checklistId: string, itemId: string, completed: boolean): Promise<void>;
}

/**
 * Checklist item for submission
 */
export interface ChecklistItem {
  id: string;
  description: string;
  owner: string;
  dueDate: Date;
  completed: boolean;
  completedAt?: Date;
  completedBy?: string;
}
