/**
 * Data Quality types for the Agentic Data Governance System
 */

import { DQDimension, Severity, RuleLogicType } from './common.js';

/**
 * Threshold configuration for a rule
 */
export interface Threshold {
  type: 'percentage' | 'absolute' | 'range';
  value: number;
  minValue?: number;
  maxValue?: number;
}

/**
 * Rule logic definition
 */
export interface RuleLogic {
  type: RuleLogicType;
  expression: string;
  parameters?: Record<string, unknown>;
}

/**
 * Data Quality Rule
 */
export interface DQRule {
  id: string;
  cdeId: string;
  dimension: DQDimension;
  name: string;
  description: string;
  logic: RuleLogic;
  threshold: Threshold;
  severity: Severity;
  owner: string;
  enabled: boolean;
}

/**
 * Result of executing a DQ rule
 */
export interface RuleExecutionResult {
  ruleId: string;
  passed: boolean;
  actualValue: unknown;
  expectedValue: unknown;
  failedRecords?: number;
  totalRecords: number;
  executedAt: Date;
}

/**
 * Data snapshot for rule execution
 */
export interface DataSnapshot {
  id: string;
  cdeId: string;
  data: unknown[];
  capturedAt: Date;
}

/**
 * Historical data profile for threshold calculation
 */
export interface DataProfile {
  cdeId: string;
  sampleSize: number;
  nullPercentage: number;
  uniquePercentage: number;
  minValue?: number;
  maxValue?: number;
  avgValue?: number;
  stdDev?: number;
  patterns?: string[];
  capturedAt: Date;
}

/**
 * DQ Rule Repository for a report
 */
export interface DQRuleRepository {
  reportId: string;
  rules: DQRule[];
  version: number;
  lastUpdated: Date;
}

/**
 * Data Quality Dimension Definition
 */
export interface DQDimensionDefinition {
  dimension: DQDimension;
  definition: string;
  measurementMethod: string;
  examples: string[];
}

/**
 * Data Quality Threshold by category
 */
export interface DQThreshold {
  dimension: DQDimension;
  cdeCategory: 'all' | 'critical' | 'high' | 'medium';
  minimumScore: number;
  targetScore: number;
}

/**
 * Data Quality Standards
 */
export interface DataQualityStandards {
  dimensions: DQDimensionDefinition[];
  thresholds: DQThreshold[];
  version: number;
  approvedBy: string;
  approvedAt: Date;
}
