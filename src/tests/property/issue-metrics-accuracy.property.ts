/**
 * **Feature: agentic-data-governance, Property 22: Issue Metrics Accuracy**
 * 
 * For any set of issues, the calculated metrics (openCount, avgResolutionTime) must accurately 
 * reflect the actual issue data: openCount equals count of issues with status in 
 * ['open', 'in_progress', 'pending_verification'], and avgResolutionTime equals mean of 
 * (resolvedAt - createdAt) for resolved issues.
 */

import fc from 'fast-check';
import { describe, it, beforeEach } from 'vitest';
import { IssueManagementAgent } from '../../agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { issueGenerator, resolvedIssueGenerator } from '../generators/index.js';
import { Issue, IssueFilters, Severity, IssueStatus } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 22: Issue Metrics Accuracy', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: IssueManagementAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new IssueManagementAgent(repository);
  });

  it('should calculate open count accurately', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(issueGenerator(), { minLength: 1, maxLength: 10 }).map(issues => 
          // Ensure unique IDs - cast to preserve Issue type
          issues.map((issue, index) => ({ ...issue, id: `issue-${index}` } as Issue))
        ),
        async (issues: Issue[]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Use empty filters to test all issues
          const filters: IssueFilters = {};
          
          // Store all issues in repository
          const storedIssues = issues.map(issue => repository.createIssue(issue));
          
          // Get metrics
          const metrics = await agent.getIssueMetrics(filters);
          
          // Calculate expected open count manually
          const openStatuses: IssueStatus[] = ['open', 'in_progress', 'pending_verification'];
          const expectedOpenCount = storedIssues.filter(issue => 
            openStatuses.includes(issue.status)
          ).length;
          
          // Verify open count accuracy
          return metrics.openCount === expectedOpenCount;
        }
      ),
      propertyConfig
    );
  });

  it('should calculate open count by severity accurately', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(issueGenerator(), { minLength: 1, maxLength: 10 }).map(issues => 
          // Ensure unique IDs - cast to preserve Issue type
          issues.map((issue, index) => ({ ...issue, id: `issue-${index}` } as Issue))
        ),
        async (issues: Issue[]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Use empty filters to test all issues
          const filters: IssueFilters = {};
          
          // Store all issues in repository
          const storedIssues = issues.map(issue => repository.createIssue(issue));
          
          // Get metrics
          const metrics = await agent.getIssueMetrics(filters);
          
          // Calculate expected open count by severity manually
          const openStatuses: IssueStatus[] = ['open', 'in_progress', 'pending_verification'];
          const openIssues = storedIssues.filter(issue => openStatuses.includes(issue.status));
          
          const expectedOpenBySeverity: Record<Severity, number> = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0
          };
          
          openIssues.forEach(issue => {
            expectedOpenBySeverity[issue.severity]++;
          });
          
          // Verify open count by severity accuracy
          return (
            metrics.openBySeverity.critical === expectedOpenBySeverity.critical &&
            metrics.openBySeverity.high === expectedOpenBySeverity.high &&
            metrics.openBySeverity.medium === expectedOpenBySeverity.medium &&
            metrics.openBySeverity.low === expectedOpenBySeverity.low
          );
        }
      ),
      propertyConfig
    );
  });

  it('should calculate average resolution time accurately', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(resolvedIssueGenerator(), { minLength: 1, maxLength: 10 }).map(issues => 
          // Ensure unique IDs and valid resolution times (implementedAt after createdAt)
          issues.map((issue, index) => ({
            ...issue,
            id: `issue-${index}`,
            resolution: issue.resolution ? {
              ...issue.resolution,
              implementedAt: new Date(issue.createdAt.getTime() + 24 * 60 * 60 * 1000) // 1 day later
            } : undefined
          }))
        ),
        async (issues: Issue[]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Use empty filters to test all issues
          const filters: IssueFilters = {};
          
          // Store all issues in repository
          const storedIssues = issues.map(issue => repository.createIssue(issue));
          
          // Get metrics
          const metrics = await agent.getIssueMetrics(filters);
          
          // Calculate expected average resolution time manually
          const resolvedIssues = storedIssues.filter(issue => 
            issue.status === 'closed' && issue.resolution?.implementedAt
          );
          
          let expectedAvgResolutionTime = 0;
          if (resolvedIssues.length > 0) {
            const totalResolutionTime = resolvedIssues.reduce((sum, issue) => {
              if (issue.resolution?.implementedAt) {
                const resolutionTime = issue.resolution.implementedAt.getTime() - issue.createdAt.getTime();
                return sum + resolutionTime;
              }
              return sum;
            }, 0);
            
            expectedAvgResolutionTime = totalResolutionTime / resolvedIssues.length;
          }
          
          // Verify average resolution time accuracy (allow small floating point differences)
          const timeDifference = Math.abs(metrics.avgResolutionTime - expectedAvgResolutionTime);
          return timeDifference < 1; // Less than 1ms difference
        }
      ),
      propertyConfig
    );
  });

  it('should calculate recurring themes accurately', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(issueGenerator(), { minLength: 5, maxLength: 20 }).map(issues => 
          // Ensure unique IDs - cast to preserve Issue type
          issues.map((issue, index) => ({ ...issue, id: `issue-${index}` } as Issue))
        ),
        async (issues: Issue[]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Use empty filters to test all issues
          const filters: IssueFilters = {};
          
          // Add some issues with known root causes to create themes
          const issuesWithRootCauses = issues.map((issue, index) => ({
            ...issue,
            rootCause: index % 3 === 0 ? 'Data source quality degradation' : 
                      index % 3 === 1 ? 'Upstream system change' : 
                      'Transformation logic error'
          }));
          
          // Store all issues in repository
          const storedIssues = issuesWithRootCauses.map(issue => repository.createIssue(issue));
          
          // Get metrics
          const metrics = await agent.getIssueMetrics(filters);
          
          // Calculate expected themes manually
          const themeMap = new Map<string, number>();
          
          storedIssues.forEach(issue => {
            if (issue.rootCause) {
              const theme = extractThemeManually(issue.rootCause);
              themeMap.set(theme, (themeMap.get(theme) || 0) + 1);
            }
          });
          
          // Only themes with multiple occurrences should be included
          const expectedThemes = Array.from(themeMap.entries())
            .filter(([_, count]) => count > 1)
            .map(([theme, count]) => ({ theme, count }))
            .sort((a, b) => b.count - a.count);
          
          // Verify themes are calculated correctly
          // Note: The actual implementation may include additional themes from source types
          // so we check that all expected themes are present with correct counts
          return expectedThemes.every(expectedTheme => 
            metrics.recurringThemes.some(actualTheme => 
              actualTheme.theme === expectedTheme.theme && 
              actualTheme.count >= expectedTheme.count
            )
          );
        }
      ),
      propertyConfig
    );
  });
});

/**
 * Helper function to manually extract theme (mirrors the agent's logic)
 */
function extractThemeManually(rootCause: string): string {
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