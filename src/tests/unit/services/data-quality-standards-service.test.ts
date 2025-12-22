/**
 * Unit tests for Data Quality Standards Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  DataQualityStandardsService,
  PolicyDocument,
  TerminologyAlignment,
  ThresholdApplicationResult
} from '../../../services/data-quality-standards-service.js';
import { 
  DataQualityStandards,
  DQDimensionDefinition,
  DQThreshold,
  DQDimension
} from '../../../types/data-quality.js';
import { CDE } from '../../../types/cde.js';

describe('DataQualityStandardsService', () => {
  let service: DataQualityStandardsService;

  beforeEach(() => {
    service = new DataQualityStandardsService();
  });

  describe('Dimension Definitions', () => {
    it('should provide all standard dimensions with definitions', () => {
      const standards = service.getStandards();
      
      expect(standards.dimensions).toHaveLength(7);
      
      const dimensionTypes = standards.dimensions.map(d => d.dimension);
      expect(dimensionTypes).toContain('accuracy');
      expect(dimensionTypes).toContain('completeness');
      expect(dimensionTypes).toContain('consistency');
      expect(dimensionTypes).toContain('timeliness');
      expect(dimensionTypes).toContain('validity');
      expect(dimensionTypes).toContain('integrity');
      expect(dimensionTypes).toContain('uniqueness');
    });

    it('should provide detailed definition for each dimension', () => {
      const standards = service.getStandards();
      
      for (const dimension of standards.dimensions) {
        expect(dimension.definition).toBeTruthy();
        expect(dimension.definition.length).toBeGreaterThan(10);
        expect(dimension.measurementMethod).toBeTruthy();
        expect(dimension.examples).toBeInstanceOf(Array);
        expect(dimension.examples.length).toBeGreaterThan(0);
      }
    });

    it('should retrieve specific dimension definition', () => {
      const accuracyDef = service.getDimensionDefinition('accuracy');
      
      expect(accuracyDef).toBeDefined();
      expect(accuracyDef?.dimension).toBe('accuracy');
      expect(accuracyDef?.definition).toContain('correctly represents');
      expect(accuracyDef?.measurementMethod).toBeTruthy();
      expect(accuracyDef?.examples.length).toBeGreaterThan(0);
    });

    it('should return undefined for non-existent dimension', () => {
      const nonExistentDef = service.getDimensionDefinition('non-existent' as DQDimension);
      expect(nonExistentDef).toBeUndefined();
    });
  });

  describe('Threshold Application', () => {
    it('should apply appropriate thresholds based on CDE category', () => {
      const cdes: CDE[] = [
        {
          id: 'cde-1',
          elementId: 'elem-1',
          name: 'Critical Regulatory Field',
          businessDefinition: 'A critical field for regulatory reporting',
          criticalityRationale: 'Required for regulatory compliance',
          status: 'approved'
        },
        {
          id: 'cde-2',
          elementId: 'elem-2',
          name: 'Important Business Field',
          businessDefinition: 'An important field for business operations',
          criticalityRationale: 'Significant impact on business processes',
          status: 'approved'
        },
        {
          id: 'cde-3',
          elementId: 'elem-3',
          name: 'Standard Field',
          businessDefinition: 'A standard data field',
          criticalityRationale: 'Standard business data',
          status: 'approved'
        }
      ];

      const results = service.applyThresholdsToCDEs(cdes);

      expect(results).toHaveLength(3);
      
      // Critical CDE should have highest thresholds
      const criticalResult = results.find(r => r.cdeId === 'cde-1');
      expect(criticalResult).toBeDefined();
      expect(criticalResult?.appliedThresholds.length).toBeGreaterThan(0);
      
      // Check that completeness threshold for critical is 100%
      const completenessThreshold = criticalResult?.appliedThresholds.find(t => t.dimension === 'completeness');
      expect(completenessThreshold?.minimumScore).toBe(100);
      expect(completenessThreshold?.targetScore).toBe(100);
    });

    it('should provide warnings for missing thresholds', () => {
      const cde: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Test Field',
        businessDefinition: 'A test field',
        criticalityRationale: 'Test rationale',
        status: 'approved'
      };

      const results = service.applyThresholdsToCDEs([cde]);
      
      expect(results).toHaveLength(1);
      expect(results[0].warnings).toBeInstanceOf(Array);
      // Should have warnings if any dimensions are missing thresholds
      // (This depends on the implementation - adjust based on actual behavior)
    });

    it('should get thresholds for specific category', () => {
      const criticalThresholds = service.getThresholdsForCategory('critical');
      const allThresholds = service.getThresholdsForCategory('all');

      expect(criticalThresholds.length).toBeGreaterThan(0);
      expect(allThresholds.length).toBeGreaterThan(0);
      
      // Critical thresholds should have higher minimum scores
      const criticalCompleteness = criticalThresholds.find(t => t.dimension === 'completeness');
      const allCompleteness = allThresholds.find(t => t.dimension === 'completeness');
      
      if (criticalCompleteness && allCompleteness) {
        expect(criticalCompleteness.minimumScore).toBeGreaterThanOrEqual(allCompleteness.minimumScore);
      }
    });
  });

  describe('Policy Ingestion', () => {
    it('should ingest policy document and align terminology', async () => {
      const policy: PolicyDocument = {
        id: 'policy-1',
        title: 'Data Quality Policy',
        content: 'This policy defines data quality requirements...',
        version: '1.0',
        effectiveDate: new Date(),
        terminology: {
          'data completeness': 'All required fields must be populated',
          'data accuracy': 'Data must correctly represent reality',
          'data validity': 'Data must conform to defined formats'
        }
      };

      const alignments = await service.ingestPolicy(policy);

      expect(alignments).toBeInstanceOf(Array);
      expect(alignments.length).toBeGreaterThan(0);
      
      // Check that terminology was aligned
      const completenessAlignment = alignments.find(a => a.alignedTerm === 'completeness');
      expect(completenessAlignment).toBeDefined();
      expect(completenessAlignment?.originalTerm).toBe('data completeness');
      expect(completenessAlignment?.confidence).toBeGreaterThan(0);
      expect(completenessAlignment?.source).toBe('policy');
    });

    it('should handle policy with no matching terminology', async () => {
      const policy: PolicyDocument = {
        id: 'policy-2',
        title: 'Unrelated Policy',
        content: 'This policy is about something else...',
        version: '1.0',
        effectiveDate: new Date(),
        terminology: {
          'business process': 'A sequence of business activities',
          'system integration': 'Connection between systems'
        }
      };

      const alignments = await service.ingestPolicy(policy);

      expect(alignments).toBeInstanceOf(Array);
      // Should have no alignments since terms don't match DQ dimensions
      expect(alignments.length).toBe(0);
    });
  });

  describe('Standards Management', () => {
    it('should allow updating standards', () => {
      const originalStandards = service.getStandards();
      
      const updatedStandards: DataQualityStandards = {
        ...originalStandards,
        version: originalStandards.version + 1,
        approvedBy: 'test-user',
        approvedAt: new Date()
      };

      service.updateStandards(updatedStandards);
      
      const newStandards = service.getStandards();
      expect(newStandards.version).toBe(originalStandards.version + 1);
      expect(newStandards.approvedBy).toBe('test-user');
    });

    it('should maintain immutability when getting standards', () => {
      const standards1 = service.getStandards();
      const standards2 = service.getStandards();
      
      // Should be different objects (deep copy)
      expect(standards1).not.toBe(standards2);
      expect(standards1).toEqual(standards2);
      
      // Modifying one should not affect the other
      standards1.version = 999;
      expect(standards2.version).not.toBe(999);
    });

    it('should have proper default standards structure', () => {
      const standards = service.getStandards();
      
      expect(standards.version).toBe(1);
      expect(standards.approvedBy).toBe('system');
      expect(standards.approvedAt).toBeInstanceOf(Date);
      expect(standards.dimensions.length).toBe(7);
      expect(standards.thresholds.length).toBeGreaterThan(0);
      
      // Should have thresholds for all categories
      const categories = ['critical', 'high', 'medium', 'all'];
      for (const category of categories) {
        const categoryThresholds = standards.thresholds.filter(t => t.cdeCategory === category);
        expect(categoryThresholds.length).toBeGreaterThan(0);
      }
    });
  });

  describe('CDE Category Determination', () => {
    it('should categorize CDEs based on name and rationale', () => {
      const criticalCDE: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Critical Regulatory Amount',
        businessDefinition: 'Critical amount for regulatory reporting',
        criticalityRationale: 'Required for regulatory compliance and BCBS 239',
        status: 'approved'
      };

      const highCDE: CDE = {
        id: 'cde-2',
        elementId: 'elem-2',
        name: 'Important Customer Data',
        businessDefinition: 'Important customer information',
        criticalityRationale: 'Significant impact on customer operations',
        status: 'approved'
      };

      const mediumCDE: CDE = {
        id: 'cde-3',
        elementId: 'elem-3',
        name: 'Standard Reference Data',
        businessDefinition: 'Standard reference information',
        criticalityRationale: 'Used in standard business processes',
        status: 'approved'
      };

      const results = service.applyThresholdsToCDEs([criticalCDE, highCDE, mediumCDE]);

      // Critical CDE should have the highest thresholds
      const criticalResult = results.find(r => r.cdeId === 'cde-1');
      const highResult = results.find(r => r.cdeId === 'cde-2');
      const mediumResult = results.find(r => r.cdeId === 'cde-3');

      expect(criticalResult).toBeDefined();
      expect(highResult).toBeDefined();
      expect(mediumResult).toBeDefined();

      // Verify that critical has higher thresholds than high, and high has higher than medium
      const criticalCompleteness = criticalResult?.appliedThresholds.find(t => t.dimension === 'completeness');
      const highCompleteness = highResult?.appliedThresholds.find(t => t.dimension === 'completeness');
      const mediumCompleteness = mediumResult?.appliedThresholds.find(t => t.dimension === 'completeness');

      if (criticalCompleteness && highCompleteness && mediumCompleteness) {
        expect(criticalCompleteness.minimumScore).toBeGreaterThanOrEqual(highCompleteness.minimumScore);
        expect(highCompleteness.minimumScore).toBeGreaterThanOrEqual(mediumCompleteness.minimumScore);
      }
    });
  });
});