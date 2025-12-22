/**
 * Dashboard Service
 * 
 * Provides real-time monitoring and visualization for the Agentic Data Governance System.
 * Implements Requirements 11.1-11.6 for data governance dashboard and monitoring.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  CDEQualityScore,
  QualityTrend,
  IssueSummary,
  ControlStatusDisplay,
  CalendarEntry,
  Annotation,
  DateRange,
  IssueFilters,
  Issue,
  DQRule,
  RuleExecutionResult,
  CDE,
  LineageGraph,
  DQThreshold
} from '../types/index.js';
import { IGovernanceRepository } from '../repository/governance-repository.js';
import { IDashboardService } from '../interfaces/services.js';

/**
 * CDE detail information for drill-down
 */
export interface CDEDetail {
  cde: CDE;
  lineage?: LineageGraph;
  rules: DQRule[];
  qualityScore?: CDEQualityScore;
}

/**
 * Dashboard Service implementation
 */
export class DashboardService implements IDashboardService {
  private ruleExecutionResults: Map<string, RuleExecutionResult[]> = new Map();

  constructor(private repository: IGovernanceRepository) {}

  /**
   * Store rule execution results for quality score calculation
   */
  storeRuleExecutionResult(cdeId: string, result: RuleExecutionResult): void {
    const existing = this.ruleExecutionResults.get(cdeId) || [];
    existing.push(result);
    this.ruleExecutionResults.set(cdeId, existing);
  }

  /**
   * Get rule execution results for a CDE
   */
  getRuleExecutionResults(cdeId: string): RuleExecutionResult[] {
    return this.ruleExecutionResults.get(cdeId) || [];
  }


  /**
   * Get CDE quality scores for a report
   * Requirements: 11.1 - Show real-time completeness, accuracy, and timeliness scores
   */
  async getCDEQualityScores(reportId: string): Promise<CDEQualityScore[]> {
    const inventory = this.repository.getCDEInventory(reportId);
    if (!inventory) {
      return [];
    }

    const dqStandards = this.repository.getDataQualityStandards();
    const scores: CDEQualityScore[] = [];

    for (const cde of inventory.cdes) {
      const results = this.ruleExecutionResults.get(cde.id) || [];
      
      // Calculate scores from most recent rule execution results
      const completenessResults = results.filter(r => this.getRuleDimension(r.ruleId, reportId) === 'completeness');
      const accuracyResults = results.filter(r => this.getRuleDimension(r.ruleId, reportId) === 'accuracy');
      const timelinessResults = results.filter(r => this.getRuleDimension(r.ruleId, reportId) === 'timeliness');

      const completeness = this.calculateDimensionScore(completenessResults);
      const accuracy = this.calculateDimensionScore(accuracyResults);
      const timeliness = this.calculateDimensionScore(timelinessResults);
      const overallScore = (completeness + accuracy + timeliness) / 3;

      // Check threshold breach
      const thresholdBreached = this.checkThresholdBreach(
        { completeness, accuracy, timeliness },
        dqStandards?.thresholds || []
      );

      const lastUpdated = this.getLatestExecutionDate(results);

      scores.push({
        cdeId: cde.id,
        cdeName: cde.name,
        completeness,
        accuracy,
        timeliness,
        overallScore,
        thresholdBreached,
        lastUpdated
      });
    }

    return scores;
  }

  /**
   * Get quality trends over a time period
   * Requirements: 11.2 - Show historical data quality graphs
   */
  async getQualityTrends(reportId: string, period: DateRange): Promise<QualityTrend[]> {
    const inventory = this.repository.getCDEInventory(reportId);
    if (!inventory) {
      return [];
    }

    const trends: QualityTrend[] = [];
    const dimensions = ['completeness', 'accuracy', 'timeliness', 'validity', 'consistency', 'uniqueness'];

    for (const cde of inventory.cdes) {
      const results = this.ruleExecutionResults.get(cde.id) || [];
      
      // Filter results within the period
      const periodResults = results.filter(r => 
        r.executedAt >= period.start && r.executedAt <= period.end
      );

      // Group by date and dimension
      for (const dimension of dimensions) {
        const dimensionResults = periodResults.filter(r => 
          this.getRuleDimension(r.ruleId, reportId) === dimension
        );

        // Group by date (day granularity)
        const byDate = new Map<string, RuleExecutionResult[]>();
        for (const result of dimensionResults) {
          const dateKey = result.executedAt.toISOString().split('T')[0];
          const existing = byDate.get(dateKey) || [];
          existing.push(result);
          byDate.set(dateKey, existing);
        }

        // Create trend entries
        for (const [dateKey, dateResults] of byDate) {
          const score = this.calculateDimensionScore(dateResults);
          trends.push({
            date: new Date(dateKey),
            dimension,
            score
          });
        }
      }
    }

    return trends.sort((a, b) => a.date.getTime() - b.date.getTime());
  }


  /**
   * Get issues summary
   * Requirements: 11.3 - Show open issues by severity, average resolution time
   */
  async getIssuesSummary(filters: IssueFilters): Promise<IssueSummary> {
    let issues = this.repository.getAllIssues();

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      issues = issues.filter(i => filters.status!.includes(i.status));
    }
    if (filters.severity && filters.severity.length > 0) {
      issues = issues.filter(i => filters.severity!.includes(i.severity));
    }
    if (filters.assignee) {
      issues = issues.filter(i => i.assignee === filters.assignee);
    }
    if (filters.reportId) {
      issues = issues.filter(i => i.impactedReports.includes(filters.reportId!));
    }
    if (filters.cdeId) {
      issues = issues.filter(i => i.impactedCDEs.includes(filters.cdeId!));
    }
    if (filters.fromDate) {
      issues = issues.filter(i => i.createdAt >= filters.fromDate!);
    }
    if (filters.toDate) {
      issues = issues.filter(i => i.createdAt <= filters.toDate!);
    }

    // Calculate open issues
    const openStatuses = ['open', 'in_progress', 'pending_verification'];
    const openIssues = issues.filter(i => openStatuses.includes(i.status));

    // Count by severity
    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };
    for (const issue of openIssues) {
      bySeverity[issue.severity] = (bySeverity[issue.severity] || 0) + 1;
    }

    // Calculate average resolution time
    const resolvedIssues = issues.filter(i => 
      i.status === 'resolved' || i.status === 'closed'
    );
    let avgResolutionTime = 0;
    if (resolvedIssues.length > 0) {
      const totalTime = resolvedIssues.reduce((sum, issue) => {
        const resolvedAt = issue.resolution?.implementedAt || new Date();
        return sum + (resolvedAt.getTime() - issue.createdAt.getTime());
      }, 0);
      avgResolutionTime = totalTime / resolvedIssues.length;
    }

    // Get top priority items (critical and high severity open issues)
    const topPriorityItems = openIssues
      .filter(i => i.severity === 'critical' || i.severity === 'high')
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      })
      .slice(0, 10)
      .map(i => i.id);

    return {
      totalOpen: openIssues.length,
      bySeverity,
      avgResolutionTime,
      topPriorityItems
    };
  }

  /**
   * Get control status for a report
   * Requirements: 11.4 - Show pass/fail indicators for key controls
   */
  async getControlStatus(reportId: string): Promise<ControlStatusDisplay[]> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      return [];
    }

    return matrix.controls.map(control => {
      // Get the most recent evidence
      const latestEvidence = control.evidence
        .sort((a, b) => b.executionDate.getTime() - a.executionDate.getTime())[0];

      // Map control type to display type
      let displayType: 'reconciliation' | 'validation' | 'approval' = 'validation';
      if (control.type === 'process') {
        displayType = 'approval';
      } else if (control.automationStatus === 'fully_automated') {
        displayType = 'reconciliation';
      }

      // Determine status
      let status: 'pass' | 'fail' | 'pending' = 'pending';
      if (latestEvidence) {
        status = latestEvidence.outcome === 'pass' ? 'pass' : 
                 latestEvidence.outcome === 'fail' ? 'fail' : 'pending';
      }

      return {
        controlId: control.id,
        controlName: control.name,
        type: displayType,
        status,
        lastExecuted: latestEvidence?.executionDate || new Date(),
        evidence: latestEvidence?.details
      };
    });
  }


  /**
   * Get regulatory calendar entries
   */
  async getRegulatoryCalendar(period: DateRange): Promise<CalendarEntry[]> {
    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      return [];
    }

    const entries: CalendarEntry[] = [];
    const cycles = this.repository.getAllCycleInstances();

    for (const report of catalog.reports) {
      // Find cycles for this report within the period
      const reportCycles = cycles.filter(c => 
        c.reportId === report.id &&
        c.periodEnd >= period.start &&
        c.periodEnd <= period.end
      );

      for (const cycle of reportCycles) {
        let status: 'upcoming' | 'in_progress' | 'completed' | 'overdue' = 'upcoming';
        
        if (cycle.status === 'completed') {
          status = 'completed';
        } else if (cycle.status === 'active' || cycle.status === 'paused') {
          status = 'in_progress';
        } else if (cycle.periodEnd < new Date()) {
          status = 'overdue';
        }

        entries.push({
          id: cycle.id,
          reportId: report.id,
          reportName: report.name,
          dueDate: cycle.periodEnd,
          status
        });
      }
    }

    return entries.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }

  /**
   * Add annotation to a metric
   * Requirements: 11.6 - Allow comments and explanations with audit trail
   */
  async addAnnotation(metricId: string, annotation: Omit<Annotation, 'id' | 'createdAt'>): Promise<void> {
    this.repository.createAnnotation({
      metricId,
      comment: annotation.comment,
      createdBy: annotation.createdBy
    });
  }

  /**
   * Get CDE detail for drill-down
   * Requirements: 11.5 - Display definition, owner, lineage diagram, and associated quality rules
   */
  async getCDEDetail(reportId: string, cdeId: string): Promise<CDEDetail | undefined> {
    const inventory = this.repository.getCDEInventory(reportId);
    if (!inventory) {
      return undefined;
    }

    const cde = inventory.cdes.find(c => c.id === cdeId);
    if (!cde) {
      return undefined;
    }

    // Get lineage
    const lineage = this.repository.getLineageGraph(reportId);

    // Get rules for this CDE
    const ruleRepo = this.repository.getDQRuleRepository(reportId);
    const rules = ruleRepo?.rules.filter(r => r.cdeId === cdeId) || [];

    // Get quality score
    const scores = await this.getCDEQualityScores(reportId);
    const qualityScore = scores.find(s => s.cdeId === cdeId);

    return {
      cde,
      lineage,
      rules,
      qualityScore
    };
  }

  /**
   * Get annotations for a metric
   */
  getAnnotations(metricId: string): Annotation[] {
    return this.repository.getAnnotations(metricId);
  }

  // Private helper methods

  private getRuleDimension(ruleId: string, reportId: string): string | undefined {
    const ruleRepo = this.repository.getDQRuleRepository(reportId);
    if (!ruleRepo) return undefined;
    
    const rule = ruleRepo.rules.find(r => r.id === ruleId);
    return rule?.dimension;
  }

  private calculateDimensionScore(results: RuleExecutionResult[]): number {
    if (results.length === 0) return 100; // Default to 100% if no results

    // Get the most recent result for each rule
    const latestByRule = new Map<string, RuleExecutionResult>();
    for (const result of results) {
      const existing = latestByRule.get(result.ruleId);
      if (!existing || result.executedAt > existing.executedAt) {
        latestByRule.set(result.ruleId, result);
      }
    }

    // Calculate pass rate
    const latestResults = Array.from(latestByRule.values());
    const passedCount = latestResults.filter(r => r.passed).length;
    return (passedCount / latestResults.length) * 100;
  }

  private checkThresholdBreach(
    scores: { completeness: number; accuracy: number; timeliness: number },
    thresholds: DQThreshold[]
  ): boolean {
    for (const threshold of thresholds) {
      const score = scores[threshold.dimension as keyof typeof scores];
      if (score !== undefined && score < threshold.minimumScore) {
        return true;
      }
    }
    return false;
  }

  private getLatestExecutionDate(results: RuleExecutionResult[]): Date {
    if (results.length === 0) return new Date();
    
    return results.reduce((latest, r) => 
      r.executedAt > latest ? r.executedAt : latest, 
      results[0].executedAt
    );
  }
}
