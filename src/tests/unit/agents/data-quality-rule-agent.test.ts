/**
 * Unit tests for Data Quality Rule Agent
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DataQualityRuleAgent } from '../../../agents/data-quality-rule-agent.js';
import { CDE, DataProfile, DQRule, DataSnapshot } from '../../../types/index.js';

describe('DataQualityRuleAgent', () => {
  let agent: DataQualityRuleAgent;
  let sampleCDE: CDE;
  let sampleDataProfile: DataProfile;

  beforeEach(() => {
    agent = new DataQualityRuleAgent();
    
    sampleCDE = {
      id: 'cde-123',
      elementId: 'element-456',
      name: 'Customer Balance',
      businessDefinition: 'The current balance of a customer account',
      criticalityRationale: 'Critical for regulatory reporting',
      dataOwner: 'john.doe@example.com',
      dataOwnerEmail: 'john.doe@example.com',
      status: 'approved',
      approvedBy: 'manager@example.com',
      approvedAt: new Date('2024-01-01')
    };

    sampleDataProfile = {
      cdeId: 'cde-123',
      sampleSize: 1000,
      nullPercentage: 2.5,
      uniquePercentage: 95.0,
      minValue: 0,
      maxValue: 100000,
      avgValue: 25000,
      stdDev: 15000,
      patterns: ['\\d+\\.\\d{2}'],
      capturedAt: new Date('2024-01-01')
    };
  });

  describe('generateRulesForCDE', () => {
    it('should generate rules for all applicable dimensions', async () => {
      // Act
      const rules = await agent.generateRulesForCDE(sampleCDE);

      // Assert
      expect(rules).toBeDefined();
      expect(rules.length).toBeGreaterThan(0);
      
      // Should have rules for expected dimensions
      const dimensions = rules.map(rule => rule.dimension);
      expect(dimensions).toContain('completeness');
      expect(dimensions).toContain('accuracy');
      expect(dimensions).toContain('validity');
      expect(dimensions).toContain('consistency');
      expect(dimensions).toContain('timeliness');
      expect(dimensions).toContain('uniqueness');
    });

    it('should generate rules with proper CDE linkage', async () => {
      // Act
      const rules = await agent.generateRulesForCDE(sampleCDE);

      // Assert
      for (const rule of rules) {
        expect(rule.cdeId).toBe(sampleCDE.id);
        expect(rule.name).toContain(sampleCDE.name);
        expect(rule.description).toContain(sampleCDE.name);
        expect(rule.owner).toBe(sampleCDE.dataOwner);
      }
    });

    it('should use historical data for threshold calculation when provided', async () => {
      // Act
      const rulesWithHistory = await agent.generateRulesForCDE(sampleCDE, sampleDataProfile);
      const rulesWithoutHistory = await agent.generateRulesForCDE(sampleCDE);

      // Assert
      expect(rulesWithHistory.length).toBe(rulesWithoutHistory.length);
      
      // Find completeness rules to compare thresholds
      const completenessWithHistory = rulesWithHistory.find(r => r.dimension === 'completeness');
      const completenessWithoutHistory = rulesWithoutHistory.find(r => r.dimension === 'completeness');
      
      expect(completenessWithHistory).toBeDefined();
      expect(completenessWithoutHistory).toBeDefined();
      
      // Threshold should be different when historical data is used
      expect(completenessWithHistory!.threshold.value).not.toBe(completenessWithoutHistory!.threshold.value);
    });

    it('should assign unassigned owner when CDE has no owner', async () => {
      // Arrange
      const cdeWithoutOwner = { ...sampleCDE, dataOwner: undefined };

      // Act
      const rules = await agent.generateRulesForCDE(cdeWithoutOwner);

      // Assert
      for (const rule of rules) {
        expect(rule.owner).toBe('unassigned');
      }
    });

    it('should generate rules with appropriate logic types for each dimension', async () => {
      // Act
      const rules = await agent.generateRulesForCDE(sampleCDE);

      // Assert
      const completenessRule = rules.find(r => r.dimension === 'completeness');
      expect(completenessRule?.logic.type).toBe('null_check');

      const accuracyRule = rules.find(r => r.dimension === 'accuracy');
      expect(['range_check', 'custom']).toContain(accuracyRule?.logic.type);

      const validityRule = rules.find(r => r.dimension === 'validity');
      expect(validityRule?.logic.type).toBe('format_check');

      const consistencyRule = rules.find(r => r.dimension === 'consistency');
      expect(consistencyRule?.logic.type).toBe('referential_check');

      const timelinessRule = rules.find(r => r.dimension === 'timeliness');
      expect(timelinessRule?.logic.type).toBe('custom');

      const uniquenessRule = rules.find(r => r.dimension === 'uniqueness');
      expect(uniquenessRule?.logic.type).toBe('custom');
    });
  });

  describe('ingestExistingRules', () => {
    it('should add new rules to repository', async () => {
      // Arrange
      const newRules: DQRule[] = [
        {
          id: 'rule-1',
          cdeId: 'cde-123',
          dimension: 'completeness',
          name: 'Test Rule',
          description: 'Test Description',
          logic: { type: 'null_check', expression: 'value IS NOT NULL' },
          threshold: { type: 'percentage', value: 100 },
          severity: 'critical',
          owner: 'test@example.com',
          enabled: true
        }
      ];

      // Act
      const result = await agent.ingestExistingRules(newRules);

      // Assert
      expect(result.addedCount).toBe(1);
      expect(result.matchedCount).toBe(0);
      expect(result.modifiedCount).toBe(0);
      expect(result.removedCount).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('added');
    });

    it('should detect modifications in existing rules', async () => {
      // Arrange
      const originalRule: DQRule = {
        id: 'rule-1',
        cdeId: 'cde-123',
        dimension: 'completeness',
        name: 'Original Rule',
        description: 'Original Description',
        logic: { type: 'null_check', expression: 'value IS NOT NULL' },
        threshold: { type: 'percentage', value: 100 },
        severity: 'critical',
        owner: 'test@example.com',
        enabled: true
      };

      const modifiedRule: DQRule = {
        ...originalRule,
        name: 'Modified Rule',
        threshold: { type: 'percentage', value: 95 }
      };

      // Act
      await agent.ingestExistingRules([originalRule]);
      const result = await agent.ingestExistingRules([modifiedRule]);

      // Assert
      expect(result.modifiedCount).toBe(1);
      expect(result.items[0].status).toBe('modified');
      expect(result.items[0].differences).toContain('name: "Original Rule" -> "Modified Rule"');
      expect(result.items[0].differences?.some(diff => diff.includes('threshold'))).toBe(true);
    });
  });

  describe('updateRuleThreshold', () => {
    it('should update rule threshold with valid inputs', async () => {
      // Arrange
      const rule: DQRule = {
        id: 'rule-1',
        cdeId: 'cde-123',
        dimension: 'completeness',
        name: 'Test Rule',
        description: 'Test Description',
        logic: { type: 'null_check', expression: 'value IS NOT NULL' },
        threshold: { type: 'percentage', value: 100 },
        severity: 'critical',
        owner: 'test@example.com',
        enabled: true
      };

      await agent.ingestExistingRules([rule]);

      // Act & Assert
      await expect(agent.updateRuleThreshold('rule-1', 95, 'Adjusted based on business requirements'))
        .resolves.not.toThrow();
    });

    it('should reject invalid threshold values', async () => {
      // Arrange
      const rule: DQRule = {
        id: 'rule-1',
        cdeId: 'cde-123',
        dimension: 'completeness',
        name: 'Test Rule',
        description: 'Test Description',
        logic: { type: 'null_check', expression: 'value IS NOT NULL' },
        threshold: { type: 'percentage', value: 100 },
        severity: 'critical',
        owner: 'test@example.com',
        enabled: true
      };

      await agent.ingestExistingRules([rule]);

      // Act & Assert
      await expect(agent.updateRuleThreshold('rule-1', 150, 'Invalid threshold'))
        .rejects.toThrow('Threshold must be between 0 and 100');

      await expect(agent.updateRuleThreshold('rule-1', -10, 'Invalid threshold'))
        .rejects.toThrow('Threshold must be between 0 and 100');
    });

    it('should require justification for threshold updates', async () => {
      // Arrange
      const rule: DQRule = {
        id: 'rule-1',
        cdeId: 'cde-123',
        dimension: 'completeness',
        name: 'Test Rule',
        description: 'Test Description',
        logic: { type: 'null_check', expression: 'value IS NOT NULL' },
        threshold: { type: 'percentage', value: 100 },
        severity: 'critical',
        owner: 'test@example.com',
        enabled: true
      };

      await agent.ingestExistingRules([rule]);

      // Act & Assert
      await expect(agent.updateRuleThreshold('rule-1', 95, ''))
        .rejects.toThrow('Justification is required for threshold updates');
    });

    it('should throw error for non-existent rule', async () => {
      // Act & Assert
      await expect(agent.updateRuleThreshold('non-existent', 95, 'Valid justification'))
        .rejects.toThrow('Rule with ID non-existent not found');
    });
  });

  describe('executeRules', () => {
    let sampleRules: DQRule[];
    let sampleDataSnapshot: DataSnapshot;

    beforeEach(() => {
      sampleRules = [
        {
          id: 'rule-1',
          cdeId: 'cde-123',
          dimension: 'completeness',
          name: 'Completeness Check',
          description: 'Check for null values',
          logic: { type: 'null_check', expression: 'value IS NOT NULL' },
          threshold: { type: 'percentage', value: 95 },
          severity: 'critical',
          owner: 'test@example.com',
          enabled: true
        },
        {
          id: 'rule-2',
          cdeId: 'cde-123',
          dimension: 'accuracy',
          name: 'Range Check',
          description: 'Check value range',
          logic: { type: 'range_check', expression: 'value BETWEEN min AND max', parameters: { min_value: 0, max_value: 100000 } },
          threshold: { type: 'percentage', value: 98 },
          severity: 'high',
          owner: 'test@example.com',
          enabled: true
        }
      ];

      sampleDataSnapshot = {
        id: 'snapshot-1',
        cdeId: 'cde-123',
        data: [100, 200, 300, null, 500, 600, 700, 800, 900, 1000],
        capturedAt: new Date('2024-01-01')
      };
    });

    it('should execute enabled rules and return results', async () => {
      // Act
      const results = await agent.executeRules(sampleRules, sampleDataSnapshot);

      // Assert
      expect(results).toHaveLength(2);
      
      const completenessResult = results.find(r => r.ruleId === 'rule-1');
      expect(completenessResult).toBeDefined();
      expect(completenessResult!.totalRecords).toBe(10);
      expect(completenessResult!.failedRecords).toBe(1); // One null value
      expect(completenessResult!.actualValue).toBe(90); // 9/10 * 100
      expect(completenessResult!.passed).toBe(false); // 90% < 95% threshold

      const accuracyResult = results.find(r => r.ruleId === 'rule-2');
      expect(accuracyResult).toBeDefined();
      expect(accuracyResult!.totalRecords).toBe(10);
      expect(accuracyResult!.passed).toBeDefined();
    });

    it('should skip disabled rules', async () => {
      // Arrange
      sampleRules[0].enabled = false;

      // Act
      const results = await agent.executeRules(sampleRules, sampleDataSnapshot);

      // Assert
      expect(results).toHaveLength(1);
      expect(results[0].ruleId).toBe('rule-2');
    });

    it('should handle empty data snapshot', async () => {
      // Arrange
      const emptySnapshot: DataSnapshot = {
        id: 'empty-snapshot',
        cdeId: 'cde-123',
        data: [],
        capturedAt: new Date('2024-01-01')
      };

      // Act
      const results = await agent.executeRules(sampleRules, emptySnapshot);

      // Assert
      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.totalRecords).toBe(0);
        expect(result.passed).toBe(true); // Empty dataset passes by default
        expect(result.actualValue).toBe(100);
      }
    });

    it('should handle different rule logic types correctly', async () => {
      // Arrange
      const formatRule: DQRule = {
        id: 'rule-3',
        cdeId: 'cde-123',
        dimension: 'validity',
        name: 'Format Check',
        description: 'Check format',
        logic: { type: 'format_check', expression: 'value MATCHES pattern', parameters: { format: '\\d+' } },
        threshold: { type: 'percentage', value: 90 },
        severity: 'medium',
        owner: 'test@example.com',
        enabled: true
      };

      const stringDataSnapshot: DataSnapshot = {
        id: 'string-snapshot',
        cdeId: 'cde-123',
        data: ['123', '456', 'abc', '789', '000'],
        capturedAt: new Date('2024-01-01')
      };

      // Act
      const results = await agent.executeRules([formatRule], stringDataSnapshot);

      // Assert
      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result.totalRecords).toBe(5);
      expect(result.failedRecords).toBe(1); // 'abc' doesn't match \\d+ pattern
      expect(result.actualValue).toBe(80); // 4/5 * 100
    });
  });

  describe('rule management methods', () => {
    let sampleRule: DQRule;

    beforeEach(async () => {
      sampleRule = {
        id: 'rule-1',
        cdeId: 'cde-123',
        dimension: 'completeness',
        name: 'Test Rule',
        description: 'Test Description',
        logic: { type: 'null_check', expression: 'value IS NOT NULL' },
        threshold: { type: 'percentage', value: 100 },
        severity: 'critical',
        owner: 'test@example.com',
        enabled: true
      };

      await agent.ingestExistingRules([sampleRule]);
    });

    it('should retrieve rule by ID', async () => {
      // Act
      const rule = await agent.getRule('rule-1');

      // Assert
      expect(rule).toBeDefined();
      expect(rule!.id).toBe('rule-1');
      expect(rule!.name).toBe('Test Rule');
    });

    it('should return null for non-existent rule', async () => {
      // Act
      const rule = await agent.getRule('non-existent');

      // Assert
      expect(rule).toBeNull();
    });

    it('should retrieve rules for CDE', async () => {
      // Act
      const rules = await agent.getRulesForCDE('cde-123');

      // Assert
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe('rule-1');
    });

    it('should enable/disable rules with justification', async () => {
      // Act
      await agent.setRuleEnabled('rule-1', false, 'Temporarily disabled for testing');

      // Assert
      const rule = await agent.getRule('rule-1');
      expect(rule!.enabled).toBe(false);
    });

    it('should require justification for enabling/disabling rules', async () => {
      // Act & Assert
      await expect(agent.setRuleEnabled('rule-1', false, ''))
        .rejects.toThrow('Justification is required for enabling/disabling rules');
    });
  });
});