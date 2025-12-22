/**
 * Unit tests for Issue Management Agent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IssueManagementAgent } from '../../../agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import {
  RuleExecutionResult,
  IssueContext,
  Resolution,
  CDEInventory,
  CDE,
  Issue,
  IssueFilters
} from '../../../types/index.js';

describe('IssueManagementAgent', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: IssueManagementAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new IssueManagementAgent(repository);
  });

  describe('createIssue', () => {
    it('should create issue from rule failure with basic information', async () => {
      const ruleResult: RuleExecutionResult = {
        ruleId: 'test-rule-123',
        passed: false,
        actualValue: 'invalid',
        expectedValue: 'valid',
        failedRecords: 5,
        totalRecords: 100,
        executedAt: new Date()
      };

      const context: IssueContext = {
        reportId: 'test-report',
        ruleId: 'test-rule-123'
      };

      const issue = await agent.createIssue(ruleResult, context);

      expect(issue.id).toBeDefined();
      expect(issue.title).toContain('Data Quality Rule Failure');
      expect(issue.title).toContain('test-rule-123');
      expect(issue.description).toContain('test-rule-123');
      expect(issue.description).toContain('invalid');
      expect(issue.description).toContain('valid');
      expect(issue.source).toBe('Rule: test-rule-123');
      expect(issue.impactedReports).toEqual(['test-report']);
      expect(issue.status).toBe('open');
      expect(issue.escalationLevel).toBe(0);
    });

    it('should assign issue to CDE owner when available', async () => {
      const cde: CDE = {
        id: 'test-cde',
        elementId: 'test-element',
        name: 'Test CDE',
        businessDefinition: 'Test definition',
        criticalityRationale: 'Test rationale',
        dataOwnerEmail: 'owner@company.com',
        status: 'approved'
      };

      const inventory: CDEInventory = {
        id: 'test-inventory',
        reportId: 'test-report',
        cdes: [cde],
        version: 1,
        status: 'approved'
      };

      repository.setCDEInventory('test-report', inventory);

      const ruleResult: RuleExecutionResult = {
        ruleId: 'test-rule',
        passed: false,
        actualValue: null,
        expectedValue: 'not null',
        totalRecords: 100,
        executedAt: new Date()
      };

      const context: IssueContext = {
        reportId: 'test-report',
        cdeId: 'test-cde'
      };

      const issue = await agent.createIssue(ruleResult, context);

      expect(issue.assignee).toBe('owner@company.com');
      expect(issue.severity).toBe('critical'); // CDEs are critical
      expect(issue.escalationLevel).toBeGreaterThan(0); // Critical issues are escalated
    });

    it('should assign issue to domain steward when no CDE owner', async () => {
      const ruleResult: RuleExecutionResult = {
        ruleId: 'test-rule',
        passed: false,
        actualValue: 'invalid',
        expectedValue: 'valid',
        totalRecords: 100,
        executedAt: new Date()
      };

      const context: IssueContext = {
        reportId: 'test-report',
        dataDomain: 'finance'
      };

      const issue = await agent.createIssue(ruleResult, context);

      expect(issue.assignee).toBe('finance-steward@company.com');
    });
  });

  describe('escalateIssue', () => {
    it('should escalate issue and update escalation level', async () => {
      const issue = repository.createIssue({
        title: 'Test Issue',
        description: 'Test Description',
        source: 'Test Source',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'high',
        status: 'open',
        createdAt: new Date(),
        escalationLevel: 0
      });

      await agent.escalateIssue(issue.id, 1);

      const updatedIssue = repository.getIssue(issue.id);
      expect(updatedIssue?.escalationLevel).toBe(1);
      expect(updatedIssue?.escalatedAt).toBeInstanceOf(Date);
    });

    it('should throw error for non-existent issue', async () => {
      await expect(agent.escalateIssue('non-existent', 1))
        .rejects.toThrow('Issue non-existent not found');
    });
  });

  describe('resolveIssue', () => {
    it('should resolve issue with proper verification', async () => {
      const issue = repository.createIssue({
        title: 'Test Issue',
        description: 'Test Description',
        source: 'Test Source',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'medium',
        status: 'in_progress',
        createdAt: new Date(),
        escalationLevel: 0
      });

      const resolution: Resolution = {
        type: 'data_correction',
        description: 'Fixed the data issue',
        implementedBy: 'implementer@company.com',
        implementedAt: new Date(),
        verifiedBy: 'verifier@company.com',
        verifiedAt: new Date()
      };

      await agent.resolveIssue(issue.id, resolution, 'verifier@company.com');

      const updatedIssue = repository.getIssue(issue.id);
      expect(updatedIssue?.status).toBe('closed');
      expect(updatedIssue?.resolution).toEqual(resolution);
    });

    it('should enforce four-eyes principle', async () => {
      const issue = repository.createIssue({
        title: 'Test Issue',
        description: 'Test Description',
        source: 'Test Source',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'medium',
        status: 'in_progress',
        createdAt: new Date(),
        escalationLevel: 0
      });

      const resolution: Resolution = {
        type: 'data_correction',
        description: 'Fixed the data issue',
        implementedBy: 'same-user@company.com',
        implementedAt: new Date(),
        verifiedBy: 'same-user@company.com',
        verifiedAt: new Date()
      };

      await expect(agent.resolveIssue(issue.id, resolution, 'same-user@company.com'))
        .rejects.toThrow('Verifier must be different from implementer');
    });

    it('should set pending_verification status when no verifier provided', async () => {
      const issue = repository.createIssue({
        title: 'Test Issue',
        description: 'Test Description',
        source: 'Test Source',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'medium',
        status: 'in_progress',
        createdAt: new Date(),
        escalationLevel: 0
      });

      const resolution: Resolution = {
        type: 'data_correction',
        description: 'Fixed the data issue',
        implementedBy: 'implementer@company.com',
        implementedAt: new Date()
      };

      await agent.resolveIssue(issue.id, resolution, 'confirmer@company.com');

      const updatedIssue = repository.getIssue(issue.id);
      expect(updatedIssue?.status).toBe('pending_verification');
      expect(updatedIssue?.resolution?.verifiedBy).toBe('confirmer@company.com');
    });
  });

  describe('suggestRootCause', () => {
    it('should suggest root causes based on issue characteristics', async () => {
      const issue: Issue = {
        id: 'test-issue',
        title: 'Data Quality Rule Failure',
        description: 'Rule validation failed',
        source: 'Rule: test-rule-123',
        impactedReports: ['report-1'],
        impactedCDEs: ['cde-1'],
        severity: 'high',
        status: 'open',
        createdAt: new Date(),
        escalationLevel: 0
      };

      repository.createIssue(issue);

      const suggestions = await agent.suggestRootCause(issue);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].suggestedCause).toBe('Data source quality degradation');
      expect(suggestions[0].confidence).toBe(0.7);
      expect(suggestions[1].suggestedCause).toBe('Upstream system change affecting critical data elements');
      expect(suggestions[1].confidence).toBe(0.6);
    });
  });

  describe('findSimilarIssues', () => {
    it('should return similar issues based on algorithm', async () => {
      // Create base issue
      const baseIssue: Issue = {
        id: 'base-issue',
        title: 'Data Quality Rule Failure',
        description: 'Rule validation failed',
        source: 'Rule: test-rule-123',
        impactedReports: ['report-1'],
        impactedCDEs: ['cde-1'],
        severity: 'high',
        status: 'open',
        createdAt: new Date(),
        escalationLevel: 0
      };

      // Create another issue
      const otherIssue: Issue = {
        id: 'other-issue',
        title: 'Different Issue',
        description: 'Different description',
        source: 'Manual: user-report',
        impactedReports: ['report-2'],
        impactedCDEs: ['cde-2'],
        severity: 'medium',
        status: 'resolved',
        createdAt: new Date(),
        escalationLevel: 0
      };

      repository.createIssue(baseIssue);
      repository.createIssue(otherIssue);

      const similarIssues = await agent.findSimilarIssues(baseIssue);

      // The method should execute without error and return an array
      expect(Array.isArray(similarIssues)).toBe(true);
      // Should not include the base issue itself
      expect(similarIssues.every(issue => issue.id !== baseIssue.id)).toBe(true);
    });
  });

  describe('getIssueMetrics', () => {
    it('should calculate metrics correctly', async () => {
      // Create test issues
      const openIssue = repository.createIssue({
        title: 'Open Issue',
        description: 'Description',
        source: 'Test',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'high',
        status: 'open',
        createdAt: new Date('2023-01-01'),
        escalationLevel: 0
      });

      const resolvedIssue = repository.createIssue({
        title: 'Resolved Issue',
        description: 'Description',
        source: 'Test',
        impactedReports: [],
        impactedCDEs: [],
        severity: 'medium',
        status: 'closed',
        createdAt: new Date('2023-01-01'),
        escalationLevel: 0,
        resolution: {
          type: 'data_correction',
          description: 'Fixed',
          implementedBy: 'user@company.com',
          implementedAt: new Date('2023-01-02'), // 1 day resolution time
          verifiedBy: 'verifier@company.com',
          verifiedAt: new Date('2023-01-02')
        }
      });

      const filters: IssueFilters = {};
      const metrics = await agent.getIssueMetrics(filters);

      expect(metrics.openCount).toBe(1);
      expect(metrics.openBySeverity.high).toBe(1);
      expect(metrics.openBySeverity.medium).toBe(0);
      expect(metrics.avgResolutionTime).toBe(24 * 60 * 60 * 1000); // 1 day in milliseconds
    });
  });
});