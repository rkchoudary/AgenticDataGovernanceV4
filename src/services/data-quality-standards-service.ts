/**
 * Data Quality Standards Service
 * 
 * Manages data quality standards including dimension definitions,
 * thresholds, policy ingestion, and terminology alignment.
 */

import {
  DataQualityStandards,
  DQDimensionDefinition,
  DQThreshold,
  DQDimension,
  CDE
} from '../types/index.js';

/**
 * Policy document for ingestion
 */
export interface PolicyDocument {
  id: string;
  title: string;
  content: string;
  version: string;
  effectiveDate: Date;
  terminology: Record<string, string>;
}

/**
 * Terminology alignment result
 */
export interface TerminologyAlignment {
  originalTerm: string;
  alignedTerm: string;
  confidence: number;
  source: 'policy' | 'standard' | 'manual';
}

/**
 * Threshold application result
 */
export interface ThresholdApplicationResult {
  cdeId: string;
  appliedThresholds: {
    dimension: DQDimension;
    minimumScore: number;
    targetScore: number;
    category: string;
  }[];
  warnings: string[];
}

/**
 * Data Quality Standards Service
 */
export class DataQualityStandardsService {
  private standards: DataQualityStandards;

  constructor() {
    this.standards = this.createDefaultStandards();
  }

  /**
   * Get current data quality standards
   */
  getStandards(): DataQualityStandards {
    return { ...this.standards };
  }

  /**
   * Update data quality standards
   */
  updateStandards(standards: DataQualityStandards): void {
    this.standards = { ...standards };
  }

  /**
   * Get dimension definition by dimension type
   */
  getDimensionDefinition(dimension: DQDimension): DQDimensionDefinition | undefined {
    return this.standards.dimensions.find(d => d.dimension === dimension);
  }

  /**
   * Get thresholds for a specific CDE category
   */
  getThresholdsForCategory(category: 'all' | 'critical' | 'high' | 'medium'): DQThreshold[] {
    return this.standards.thresholds.filter(t => t.cdeCategory === category || t.cdeCategory === 'all');
  }

  /**
   * Ingest policy document and align terminology
   */
  async ingestPolicy(policy: PolicyDocument): Promise<TerminologyAlignment[]> {
    const alignments: TerminologyAlignment[] = [];

    // Extract terminology from policy
    for (const [originalTerm, definition] of Object.entries(policy.terminology)) {
      // Find matching dimension or create alignment
      const alignment = this.alignTerminology(originalTerm, definition);
      if (alignment) {
        alignments.push(alignment);
      }
    }

    return alignments;
  }

  /**
   * Apply thresholds to CDEs based on their category
   */
  applyThresholdsToCDEs(cdes: CDE[]): ThresholdApplicationResult[] {
    const results: ThresholdApplicationResult[] = [];

    for (const cde of cdes) {
      const category = this.determineCDECategory(cde);
      const applicableThresholds = this.getThresholdsForCategory(category);
      
      const result: ThresholdApplicationResult = {
        cdeId: cde.id,
        appliedThresholds: applicableThresholds.map(threshold => ({
          dimension: threshold.dimension,
          minimumScore: threshold.minimumScore,
          targetScore: threshold.targetScore,
          category: threshold.cdeCategory
        })),
        warnings: []
      };

      // Add warnings for missing thresholds
      const coveredDimensions = new Set(applicableThresholds.map(t => t.dimension));
      const allDimensions: DQDimension[] = ['completeness', 'accuracy', 'validity', 'consistency', 'timeliness', 'uniqueness', 'integrity'];
      
      for (const dimension of allDimensions) {
        if (!coveredDimensions.has(dimension)) {
          result.warnings.push(`No threshold defined for dimension: ${dimension}`);
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Create default data quality standards
   */
  private createDefaultStandards(): DataQualityStandards {
    const dimensions: DQDimensionDefinition[] = [
      {
        dimension: 'accuracy',
        definition: 'The degree to which data correctly represents the real-world entity or event being described',
        measurementMethod: 'Comparison against authoritative sources or validation rules',
        examples: ['Customer address matches postal service records', 'Financial amounts reconcile to source systems']
      },
      {
        dimension: 'completeness',
        definition: 'The extent to which all required data is present and no essential information is missing',
        measurementMethod: 'Percentage of non-null values for mandatory fields',
        examples: ['All required regulatory fields are populated', 'Customer records have complete contact information']
      },
      {
        dimension: 'consistency',
        definition: 'The degree to which data is uniform and follows the same format, standards, and definitions across systems',
        measurementMethod: 'Comparison of data formats and values across different sources',
        examples: ['Date formats are consistent across systems', 'Currency codes follow ISO standards']
      },
      {
        dimension: 'timeliness',
        definition: 'The extent to which data is available when needed and reflects the current state of the entity',
        measurementMethod: 'Time difference between data capture and availability for use',
        examples: ['Market data is updated within required timeframes', 'Customer changes are reflected in reports promptly']
      },
      {
        dimension: 'validity',
        definition: 'The degree to which data conforms to defined formats, ranges, and business rules',
        measurementMethod: 'Percentage of values that pass validation rules and format checks',
        examples: ['Email addresses follow valid format', 'Numeric values fall within expected ranges']
      },
      {
        dimension: 'integrity',
        definition: 'The extent to which data maintains its structure and relationships without corruption or unauthorized changes',
        measurementMethod: 'Verification of referential integrity and data lineage',
        examples: ['Foreign key relationships are maintained', 'Data transformations preserve logical relationships']
      },
      {
        dimension: 'uniqueness',
        definition: 'The degree to which data records are distinct and free from unintended duplication',
        measurementMethod: 'Detection and measurement of duplicate records based on business keys',
        examples: ['Customer records are not duplicated', 'Transaction IDs are unique across the system']
      }
    ];

    const thresholds: DQThreshold[] = [
      // Critical CDEs - highest standards
      { dimension: 'completeness', cdeCategory: 'critical', minimumScore: 100, targetScore: 100 },
      { dimension: 'accuracy', cdeCategory: 'critical', minimumScore: 99, targetScore: 100 },
      { dimension: 'validity', cdeCategory: 'critical', minimumScore: 100, targetScore: 100 },
      { dimension: 'consistency', cdeCategory: 'critical', minimumScore: 99, targetScore: 100 },
      { dimension: 'timeliness', cdeCategory: 'critical', minimumScore: 95, targetScore: 98 },
      { dimension: 'uniqueness', cdeCategory: 'critical', minimumScore: 100, targetScore: 100 },
      { dimension: 'integrity', cdeCategory: 'critical', minimumScore: 100, targetScore: 100 },

      // High importance CDEs
      { dimension: 'completeness', cdeCategory: 'high', minimumScore: 98, targetScore: 100 },
      { dimension: 'accuracy', cdeCategory: 'high', minimumScore: 95, targetScore: 98 },
      { dimension: 'validity', cdeCategory: 'high', minimumScore: 98, targetScore: 100 },
      { dimension: 'consistency', cdeCategory: 'high', minimumScore: 95, targetScore: 98 },
      { dimension: 'timeliness', cdeCategory: 'high', minimumScore: 90, targetScore: 95 },
      { dimension: 'uniqueness', cdeCategory: 'high', minimumScore: 98, targetScore: 100 },
      { dimension: 'integrity', cdeCategory: 'high', minimumScore: 98, targetScore: 100 },

      // Medium importance CDEs
      { dimension: 'completeness', cdeCategory: 'medium', minimumScore: 95, targetScore: 98 },
      { dimension: 'accuracy', cdeCategory: 'medium', minimumScore: 90, targetScore: 95 },
      { dimension: 'validity', cdeCategory: 'medium', minimumScore: 95, targetScore: 98 },
      { dimension: 'consistency', cdeCategory: 'medium', minimumScore: 90, targetScore: 95 },
      { dimension: 'timeliness', cdeCategory: 'medium', minimumScore: 85, targetScore: 90 },
      { dimension: 'uniqueness', cdeCategory: 'medium', minimumScore: 95, targetScore: 98 },
      { dimension: 'integrity', cdeCategory: 'medium', minimumScore: 95, targetScore: 98 },

      // All CDEs - baseline standards
      { dimension: 'completeness', cdeCategory: 'all', minimumScore: 90, targetScore: 95 },
      { dimension: 'accuracy', cdeCategory: 'all', minimumScore: 85, targetScore: 90 },
      { dimension: 'validity', cdeCategory: 'all', minimumScore: 90, targetScore: 95 },
      { dimension: 'consistency', cdeCategory: 'all', minimumScore: 85, targetScore: 90 },
      { dimension: 'timeliness', cdeCategory: 'all', minimumScore: 80, targetScore: 85 },
      { dimension: 'uniqueness', cdeCategory: 'all', minimumScore: 90, targetScore: 95 },
      { dimension: 'integrity', cdeCategory: 'all', minimumScore: 90, targetScore: 95 }
    ];

    return {
      dimensions,
      thresholds,
      version: 1,
      approvedBy: 'system',
      approvedAt: new Date()
    };
  }

  /**
   * Align terminology from policy with standard dimensions
   */
  private alignTerminology(originalTerm: string, definition: string): TerminologyAlignment | null {
    const term = originalTerm.toLowerCase();
    const def = definition.toLowerCase();

    // Simple keyword matching for alignment
    const alignmentMap: Record<string, DQDimension> = {
      'complete': 'completeness',
      'accurate': 'accuracy',
      'valid': 'validity',
      'consistent': 'consistency',
      'timely': 'timeliness',
      'unique': 'uniqueness',
      'integrity': 'integrity'
    };

    for (const [keyword, dimension] of Object.entries(alignmentMap)) {
      if (term.includes(keyword) || def.includes(keyword)) {
        return {
          originalTerm,
          alignedTerm: dimension,
          confidence: 0.8,
          source: 'policy'
        };
      }
    }

    return null;
  }

  /**
   * Determine CDE category based on CDE properties
   */
  private determineCDECategory(cde: CDE): 'critical' | 'high' | 'medium' {
    // This is a simplified categorization - in practice this would be more sophisticated
    // and might consider factors like regulatory importance, financial impact, etc.
    
    if (cde.name.toLowerCase().includes('critical') || 
        cde.criticalityRationale.toLowerCase().includes('regulatory')) {
      return 'critical';
    }
    
    if (cde.name.toLowerCase().includes('important') || 
        cde.criticalityRationale.toLowerCase().includes('significant')) {
      return 'high';
    }
    
    return 'medium';
  }
}