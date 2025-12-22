/**
 * Issue Management Agent for the Agentic Data Governance System
 * Handles data issue lifecycle from detection to resolution
 */

import {
  Issue,
  IssueContext,
  RootCauseSuggestion,
  IssueMetrics,
  IssueFilters,
  Resolution,
  RuleExecutionResult,
  CDEInventory,
  CDE,
  Severity,
  IssueStatus
} from '../types/index.js';
import { IIssueManagementAgent } from '../interfaces/index.js';
import { IGovernanceRepository } from '../repository/index.js';

/**
 * Implementation of the Issue Management Agent
 */
export class IssueManagementAgent implements IIssueManagementAgent {
  constructor(private repository: IGovernanceRepository) {}

  /**
   * Creates an issue from a rule execution result with auto-population
   * Implements Requirements 9.1: Auto-create issues from rule failures
   */
  async createIssue(ruleResult: RuleExecutionResult, context: IssueContext): Promise<Issue> {
    // Auto-populate issue details from rule result
    const title = `Data Quality Rule Failure: ${ruleResult.ruleId}`;
    const description = this.generateIssueDescription(ruleResult, context);
    
    // Determine severity based on rule result and impact
    const severity = this.determineSeverity(ruleResult, context);
    
    // Get impacted reports and CDEs
    const impactedReports = context.reportId ? [context.reportId] : [];
    const impactedCDEs = context.cdeId ? [context.cdeId] : [];
    
    // Auto-assign based on data domain (Requirements 9.2)
    const assignee = await this.determineAssignee(context);
    
    const issueData: Omit<Issue, 'id'> = {
      title,
      description,
      source: `Rule: ${ruleResult.ruleId}`,
      impactedReports,
      impactedCDEs,
      severity,
      status: 'open',
      assignee: assignee || 'unassigned@company.com',
      createdAt: new Date(),
      escalationLevel: 0,
      dueDate: this.calculateDueDate(severity)
    };

    const issue = this.repository.createIssue(issueData);
    
    // Auto-escalate critical issues (Requirements 9.4)
    if (severity === 'critical') {
      await this.escalateIssue(issue.id, 1);
      // Return the updated issue with escalation info
      const updatedIssue = this.repository.getIssue(issue.id);
      if (updatedIssue) {
        return updatedIssue;
      }
    }
    
    return issue;
  }

  /**
   * Assigns an issue to a specific user
   */
  async assignIssue(issueId: string, assignee: string): Promise<void> {
    const updated = this.repository.updateIssue(issueId, { assignee });
    if (!updated) {
      throw new Error(`Issue ${issueId} not found`);
    }
  }

  /**
   * Escalates an issue to a higher level
   * Implements Requirements 9.4: Critical issue escalation
   */
  async escalateIssue(issueId: string, level: number): Promise<void> {
    const issue = this.repository.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    const updated = this.repository.updateIssue(issueId, {
      escalationLevel: level,
      escalatedAt: new Date()
    });

    if (!updated) {
      throw new Error(`Failed to escalate issue ${issueId}`);
    }
  }

  /**
   * Resolves an issue with human confirmation gate
   * Implements Requirements 9.5: Resolution confirmation gate
   */
  async resolveIssue(issueId: string, resolution: Resolution, confirmedBy: string): Promise<void> {
    const issue = this.repository.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    // Enforce four-eyes principle: verifier must be different from implementer
    if (resolution.verifiedBy && resolution.verifiedBy === resolution.implementedBy) {
      throw new Error('Verifier must be different from implementer (four-eyes principle)');
    }

    // Determine new status based on verification
    let newStatus: IssueStatus;
    if (resolution.verifiedBy) {
      newStatus = 'closed';
    } else {
      newStatus = 'pending_verification';
    }

    // Update issue with resolution
    const updated = this.repository.updateIssue(issueId, {
      status: newStatus,
      resolution: {
        ...resolution,
        verifiedBy: resolution.verifiedBy || confirmedBy,
        verifiedAt: resolution.verifiedAt || new Date()
      }
    });

    if (!updated) {
      throw new Error(`Failed to resolve issue ${issueId}`);
    }
  }

  /**
   * Transitions issue through lifecycle states
   */
  async updateIssueStatus(issueId: string, newStatus: IssueStatus, _updatedBy: string): Promise<void> {
    const issue = this.repository.getIssue(issueId);
    if (!issue) {
      throw new Error(`Issue ${issueId} not found`);
    }

    // Validate status transition
    this.validateStatusTransition(issue.status, newStatus);

    const updated = this.repository.updateIssue(issueId, {
      status: newStatus
    });

    if (!updated) {
      throw new Error(`Failed to update issue ${issueId} status`);
    }
  }

  /**
   * Checks if critical issues need escalation based on time thresholds
   * Implements Requirements 9.4: Critical issue escalation
   */
  async checkEscalationNeeded(): Promise<Issue[]> {
    const allIssues = this.repository.getAllIssues();
    const issuesNeedingEscalation: Issue[] = [];
    
    const now = new Date();
    
    for (const issue of allIssues) {
      if (issue.status === 'closed' || issue.status === 'resolved') {
        continue;
      }
      
      // Check if escalation is needed based on severity and time
      const escalationNeeded = this.shouldEscalate(issue, now);
      
      if (escalationNeeded) {
        issuesNeedingEscalation.push(issue);
        
        // Auto-escalate critical issues
        if (issue.severity === 'critical') {
          await this.escalateIssue(issue.id, issue.escalationLevel + 1);
        }
      }
    }
    
    return issuesNeedingEscalation;
  }

  /**
   * Generates issue description from rule result and context
   */
  private generateIssueDescription(ruleResult: RuleExecutionResult, context: IssueContext): string {
    let description = `Data quality rule ${ruleResult.ruleId} failed validation.\n\n`;
    description += `Expected: ${ruleResult.expectedValue}\n`;
    description += `Actual: ${ruleResult.actualValue}\n`;
    
    if (ruleResult.failedRecords !== undefined) {
      description += `Failed Records: ${ruleResult.failedRecords} out of ${ruleResult.totalRecords}\n`;
    }
    
    description += `Executed At: ${ruleResult.executedAt.toISOString()}\n`;
    
    if (context.reportId) {
      description += `Report: ${context.reportId}\n`;
    }
    
    if (context.cdeId) {
      description += `Critical Data Element: ${context.cdeId}\n`;
    }
    
    if (context.dataDomain) {
      description += `Data Domain: ${context.dataDomain}\n`;
    }

    return description;
  }

  /**
   * Determines issue severity based on rule result and context
   */
  private determineSeverity(ruleResult: RuleExecutionResult, context: IssueContext): Severity {
    // Critical if it affects a CDE
    if (context.cdeId) {
      return 'critical';
    }

    // High if failure rate is significant
    if (ruleResult.failedRecords !== undefined && ruleResult.totalRecords > 0) {
      const failureRate = ruleResult.failedRecords / ruleResult.totalRecords;
      if (failureRate > 0.1) { // More than 10% failure
        return 'high';
      } else if (failureRate > 0.01) { // More than 1% failure
        return 'medium';
      }
    }

    return 'low';
  }

  /**
   * Determines assignee based on data domain and CDE ownership
   * Implements Requirements 9.2: Domain-based assignment
   */
  private async determineAssignee(context: IssueContext): Promise<string | undefined> {
    // Try to find CDE owner first
    if (context.cdeId && context.reportId) {
      const cdeInventory = this.repository.getCDEInventory(context.reportId);
      if (cdeInventory) {
        const cde = cdeInventory.cdes.find((c: CDE) => c.id === context.cdeId);
        if (cde?.dataOwnerEmail) {
          return cde.dataOwnerEmail;
        }
      }
    }

    // Fall back to domain steward based on data domain
    if (context.dataDomain) {
      // In a real implementation, this would look up domain stewards
      // For now, return a placeholder
      return `${context.dataDomain}-steward@company.com`;
    }

    // No assignment information available - return undefined
    return undefined;
  }

  /**
   * Suggests root causes for an issue based on patterns and historical data
   * Implements Requirements 9.3: Root cause analysis
   */
  async suggestRootCause(issue: Issue): Promise<RootCauseSuggestion[]> {
    const suggestions: RootCauseSuggestion[] = [];
    
    // Find similar issues to identify patterns
    const similarIssues = await this.findSimilarIssues(issue);
    const similarIssueIds = similarIssues.map(i => i.id);
    
    // Analyze patterns in similar issues
    const rootCausePatterns = this.analyzeRootCausePatterns(similarIssues);
    
    // Generate suggestions based on issue characteristics
    if (issue.source.includes('Rule:')) {
      // Data quality rule failure
      suggestions.push({
        issueId: issue.id,
        suggestedCause: 'Data source quality degradation',
        confidence: 0.7,
        similarIssueIds
      });
      
      if (issue.impactedCDEs.length > 0) {
        suggestions.push({
          issueId: issue.id,
          suggestedCause: 'Upstream system change affecting critical data elements',
          confidence: 0.6,
          similarIssueIds
        });
      }
    }
    
    // Add suggestions from pattern analysis
    rootCausePatterns.forEach(pattern => {
      suggestions.push({
        issueId: issue.id,
        suggestedCause: pattern.cause,
        confidence: pattern.confidence,
        similarIssueIds: pattern.relatedIssueIds
      });
    });
    
    // Sort by confidence and return top suggestions
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Return top 5 suggestions
  }

  /**
   * Finds similar issues based on various criteria
   * Implements Requirements 9.3: Similar issue identification
   */
  async findSimilarIssues(issue: Issue): Promise<Issue[]> {
    const allIssues = this.repository.getAllIssues();
    const similarIssues: Array<{ issue: Issue; similarity: number }> = [];
    
    for (const otherIssue of allIssues) {
      if (otherIssue.id === issue.id) continue;
      
      let similarity = 0;
      
      // Same source type (e.g., both from rules)
      if (this.extractSourceType(issue.source) === this.extractSourceType(otherIssue.source)) {
        similarity += 0.3;
      }
      
      // Overlapping impacted reports
      const reportOverlap = this.calculateOverlap(issue.impactedReports, otherIssue.impactedReports);
      similarity += reportOverlap * 0.2;
      
      // Overlapping impacted CDEs
      const cdeOverlap = this.calculateOverlap(issue.impactedCDEs, otherIssue.impactedCDEs);
      similarity += cdeOverlap * 0.3;
      
      // Same severity
      if (issue.severity === otherIssue.severity) {
        similarity += 0.1;
      }
      
      // Similar title/description keywords
      const textSimilarity = this.calculateTextSimilarity(
        issue.title + ' ' + issue.description,
        otherIssue.title + ' ' + otherIssue.description
      );
      similarity += textSimilarity * 0.1;
      
      // Only consider issues with meaningful similarity
      if (similarity > 0.3) {
        similarIssues.push({ issue: otherIssue, similarity });
      }
    }
    
    // Sort by similarity and return top matches
    return similarIssues
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10)
      .map(item => item.issue);
  }

  /**
   * Calculates due date based on severity
   */
  private calculateDueDate(severity: Severity): Date {
    const now = new Date();
    const dueDate = new Date(now);

    switch (severity) {
      case 'critical':
        dueDate.setHours(now.getHours() + 4); // 4 hours
        break;
      case 'high':
        dueDate.setDate(now.getDate() + 1); // 1 day
        break;
      case 'medium':
        dueDate.setDate(now.getDate() + 3); // 3 days
        break;
      case 'low':
        dueDate.setDate(now.getDate() + 7); // 1 week
        break;
    }

    return dueDate;
  }

  /**
   * Analyzes root cause patterns from similar issues
   */
  private analyzeRootCausePatterns(similarIssues: Issue[]): Array<{
    cause: string;
    confidence: number;
    relatedIssueIds: string[];
  }> {
    const patterns: Array<{
      cause: string;
      confidence: number;
      relatedIssueIds: string[];
    }> = [];
    
    // Group issues by resolved root cause
    const resolvedIssues = similarIssues.filter(i => i.rootCause && i.status === 'closed');
    const rootCauseGroups = new Map<string, Issue[]>();
    
    resolvedIssues.forEach(issue => {
      if (issue.rootCause) {
        const existing = rootCauseGroups.get(issue.rootCause) || [];
        existing.push(issue);
        rootCauseGroups.set(issue.rootCause, existing);
      }
    });
    
    // Generate patterns from groups with multiple occurrences
    rootCauseGroups.forEach((issues, rootCause) => {
      if (issues.length >= 2) {
        patterns.push({
          cause: rootCause,
          confidence: Math.min(0.9, 0.5 + (issues.length * 0.1)),
          relatedIssueIds: issues.map(i => i.id)
        });
      }
    });
    
    return patterns;
  }

  /**
   * Extracts source type from source string
   */
  private extractSourceType(source: string): string {
    if (source.startsWith('Rule:')) return 'rule';
    if (source.startsWith('System:')) return 'system';
    if (source.startsWith('Manual:')) return 'manual';
    return 'unknown';
  }

  /**
   * Calculates overlap ratio between two arrays
   */
  private calculateOverlap(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1;
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Calculates text similarity using simple keyword matching
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    
    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Validates status transition is allowed
   */
  private validateStatusTransition(currentStatus: IssueStatus, newStatus: IssueStatus): void {
    const validTransitions: Record<IssueStatus, IssueStatus[]> = {
      'open': ['in_progress', 'resolved', 'closed'],
      'in_progress': ['resolved', 'open', 'closed'],
      'pending_verification': ['closed', 'in_progress'],
      'resolved': ['closed', 'in_progress'],
      'closed': [] // No transitions from closed
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
    }
  }

  /**
   * Gets issue metrics based on filters
   * Implements Requirements 9.6: Issue metrics calculation
   */
  async getIssueMetrics(filters: IssueFilters): Promise<IssueMetrics> {
    const allIssues = this.repository.getAllIssues();
    const filteredIssues = this.applyFilters(allIssues, filters);
    
    // Calculate open count
    const openStatuses: IssueStatus[] = ['open', 'in_progress', 'pending_verification'];
    const openIssues = filteredIssues.filter(issue => openStatuses.includes(issue.status));
    const openCount = openIssues.length;
    
    // Calculate open count by severity
    const openBySeverity: Record<Severity, number> = {
      'critical': 0,
      'high': 0,
      'medium': 0,
      'low': 0
    };
    
    openIssues.forEach(issue => {
      openBySeverity[issue.severity]++;
    });
    
    // Calculate average resolution time
    const resolvedIssues = filteredIssues.filter(issue => 
      issue.status === 'closed' && issue.resolution?.implementedAt
    );
    
    let avgResolutionTime = 0;
    if (resolvedIssues.length > 0) {
      const totalResolutionTime = resolvedIssues.reduce((sum, issue) => {
        if (issue.resolution?.implementedAt) {
          const resolutionTime = issue.resolution.implementedAt.getTime() - issue.createdAt.getTime();
          return sum + resolutionTime;
        }
        return sum;
      }, 0);
      
      avgResolutionTime = totalResolutionTime / resolvedIssues.length;
    }
    
    // Calculate recurring themes
    const recurringThemes = this.calculateRecurringThemes(filteredIssues);
    
    return {
      openCount,
      openBySeverity,
      avgResolutionTime,
      recurringThemes
    };
  }

  /**
   * Determines if an issue should be escalated based on time and severity
   */
  private shouldEscalate(issue: Issue, currentTime: Date): boolean {
    // If no due date, use creation time + default threshold for escalation check
    const referenceTime = issue.dueDate || issue.createdAt;
    
    const timeSinceReference = currentTime.getTime() - referenceTime.getTime();
    const hoursSinceReference = timeSinceReference / (1000 * 60 * 60);
    
    // Escalation thresholds based on severity
    // For issues without due date, use time since creation
    switch (issue.severity) {
      case 'critical':
        // Critical issues: escalate after 1 hour past due, or 4 hours since creation if no due date
        return issue.dueDate ? hoursSinceReference > 1 : hoursSinceReference > 4;
      case 'high':
        // High issues: escalate after 4 hours past due, or 24 hours since creation if no due date
        return issue.dueDate ? hoursSinceReference > 4 : hoursSinceReference > 24;
      case 'medium':
        // Medium issues: escalate after 24 hours past due, or 72 hours since creation if no due date
        return issue.dueDate ? hoursSinceReference > 24 : hoursSinceReference > 72;
      case 'low':
        // Low issues: escalate after 72 hours past due, or 168 hours (1 week) since creation if no due date
        return issue.dueDate ? hoursSinceReference > 72 : hoursSinceReference > 168;
      default:
        return false;
    }
  }

  /**
   * Applies filters to issue list
   */
  private applyFilters(issues: Issue[], filters: IssueFilters): Issue[] {
    return issues.filter(issue => {
      // Status filter
      if (filters.status && !filters.status.includes(issue.status)) {
        return false;
      }
      
      // Severity filter
      if (filters.severity && !filters.severity.includes(issue.severity)) {
        return false;
      }
      
      // Assignee filter
      if (filters.assignee && issue.assignee !== filters.assignee) {
        return false;
      }
      
      // Report ID filter
      if (filters.reportId && !issue.impactedReports.includes(filters.reportId)) {
        return false;
      }
      
      // CDE ID filter
      if (filters.cdeId && !issue.impactedCDEs.includes(filters.cdeId)) {
        return false;
      }
      
      // Date range filter
      if (filters.fromDate && issue.createdAt < filters.fromDate) {
        return false;
      }
      
      if (filters.toDate && issue.createdAt > filters.toDate) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Calculates recurring themes from issues
   */
  private calculateRecurringThemes(issues: Issue[]): { theme: string; count: number }[] {
    const themeMap = new Map<string, number>();
    
    // Extract themes from root causes
    issues.forEach(issue => {
      if (issue.rootCause) {
        const theme = this.extractTheme(issue.rootCause);
        themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
      }
    });
    
    // Extract themes from source types
    issues.forEach(issue => {
      const sourceType = this.extractSourceType(issue.source);
      if (sourceType !== 'unknown') {
        const theme = `${sourceType}_failures`;
        themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
      }
    });
    
    // Convert to array and sort by count
    return Array.from(themeMap.entries())
      .map(([theme, count]) => ({ theme, count }))
      .filter(item => item.count > 1) // Only include themes with multiple occurrences
      .sort((a, b) => b.count - a.count)
      .slice(0, 10); // Return top 10 themes
  }

  /**
   * Extracts theme from root cause text
   */
  private extractTheme(rootCause: string): string {
    const lowerCause = rootCause.toLowerCase();
    
    // Common theme patterns
    if (lowerCause.includes('data source') || lowerCause.includes('upstream')) {
      return 'upstream_data_issues';
    }
    if (lowerCause.includes('transformation') || lowerCause.includes('etl')) {
      return 'transformation_issues';
    }
    if (lowerCause.includes('system') || lowerCause.includes('outage')) {
      return 'system_issues';
    }
    if (lowerCause.includes('process') || lowerCause.includes('manual')) {
      return 'process_issues';
    }
    if (lowerCause.includes('validation') || lowerCause.includes('rule')) {
      return 'validation_issues';
    }
    
    // Default to first significant word
    const words = lowerCause.split(/\s+/).filter(w => w.length > 3);
    return words.length > 0 ? words[0] : 'unknown';
  }
}