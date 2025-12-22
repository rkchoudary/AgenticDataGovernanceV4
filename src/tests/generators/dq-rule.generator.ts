/**
 * Generators for Data Quality Rule testing
 */

import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  DQRule,
  DQDimension,
  RuleLogic,
  Threshold,
  Severity,
  RuleLogicType,
  DataProfile,
  DataSnapshot
} from '../../types/index.js';

/**
 * Generate a DQ dimension
 */
export const dqDimensionGenerator = (): fc.Arbitrary<DQDimension> => {
  return fc.constantFrom(
    'completeness',
    'accuracy',
    'validity',
    'consistency',
    'timeliness',
    'uniqueness',
    'integrity'
  );
};

/**
 * Generate a rule logic type
 */
export const ruleLogicTypeGenerator = (): fc.Arbitrary<RuleLogicType> => {
  return fc.constantFrom(
    'null_check',
    'range_check',
    'format_check',
    'referential_check',
    'reconciliation',
    'custom'
  );
};

/**
 * Generate a severity level
 */
export const severityGenerator = (): fc.Arbitrary<Severity> => {
  return fc.constantFrom('critical', 'high', 'medium', 'low');
};

/**
 * Generate a threshold
 */
export const thresholdGenerator = (): fc.Arbitrary<Threshold> => {
  return fc.oneof(
    // Percentage threshold
    fc.record({
      type: fc.constant('percentage' as const),
      value: fc.float({ min: 0, max: 100 })
    }),
    // Absolute threshold
    fc.record({
      type: fc.constant('absolute' as const),
      value: fc.float({ min: 0, max: 1000 })
    }),
    // Range threshold
    fc.record({
      type: fc.constant('range' as const),
      value: fc.float({ min: 0, max: 100 }),
      minValue: fc.float({ min: 0, max: 50 }),
      maxValue: fc.float({ min: 50, max: 100 })
    })
  );
};

/**
 * Generate rule logic
 */
export const ruleLogicGenerator = (): fc.Arbitrary<RuleLogic> => {
  return fc.record({
    type: ruleLogicTypeGenerator(),
    expression: fc.string({ minLength: 5, maxLength: 100 }),
    parameters: fc.option(fc.dictionary(fc.string(), fc.anything()))
  });
};

/**
 * Generate a DQ rule
 */
export const dqRuleGenerator = (): fc.Arbitrary<DQRule> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    cdeId: fc.constant(uuidv4()),
    dimension: dqDimensionGenerator(),
    name: fc.string({ minLength: 5, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    logic: ruleLogicGenerator(),
    threshold: thresholdGenerator(),
    severity: severityGenerator(),
    owner: fc.emailAddress(),
    enabled: fc.boolean()
  });
};

/**
 * Generate a DQ rule for a specific CDE and dimension
 */
export const dqRuleForCDEAndDimensionGenerator = (
  cdeId: string,
  dimension: DQDimension
): fc.Arbitrary<DQRule> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    cdeId: fc.constant(cdeId),
    dimension: fc.constant(dimension),
    name: fc.string({ minLength: 5, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 200 }),
    logic: ruleLogicGenerator(),
    threshold: thresholdGenerator(),
    severity: severityGenerator(),
    owner: fc.emailAddress(),
    enabled: fc.constant(true)
  });
};

/**
 * Generate data profile for historical data
 */
export const dataProfileGenerator = (): fc.Arbitrary<DataProfile> => {
  return fc.record({
    cdeId: fc.constant(uuidv4()),
    sampleSize: fc.integer({ min: 100, max: 10000 }),
    nullPercentage: fc.float({ min: 0, max: 20 }),
    uniquePercentage: fc.float({ min: 50, max: 100 }),
    minValue: fc.option(fc.float({ min: 0, max: 1000 })),
    maxValue: fc.option(fc.float({ min: 1000, max: 10000 })),
    avgValue: fc.option(fc.float({ min: 500, max: 5000 })),
    stdDev: fc.option(fc.float({ min: 10, max: 1000 })),
    patterns: fc.option(fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 1, maxLength: 5 })),
    capturedAt: fc.date()
  });
};

/**
 * Generate data snapshot
 */
export const dataSnapshotGenerator = (): fc.Arbitrary<DataSnapshot> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    cdeId: fc.constant(uuidv4()),
    data: fc.array(
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.float(),
        fc.date(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined)
      ),
      { minLength: 10, maxLength: 1000 }
    ),
    capturedAt: fc.date()
  });
};

/**
 * Generate data snapshot with specific data types
 */
export const dataSnapshotWithTypeGenerator = (dataType: 'string' | 'number' | 'date' | 'mixed'): fc.Arbitrary<DataSnapshot> => {
  let dataGenerator: fc.Arbitrary<unknown>;
  
  switch (dataType) {
    case 'string':
      dataGenerator = fc.oneof(
        fc.string(),
        fc.constant(null),
        fc.constant(''),
        fc.string().map(s => `  ${s}  `) // strings with whitespace
      );
      break;
    case 'number':
      dataGenerator = fc.oneof(
        fc.integer(),
        fc.float(),
        fc.constant(null),
        fc.constant(NaN),
        fc.constant(Infinity)
      );
      break;
    case 'date':
      dataGenerator = fc.oneof(
        fc.date(),
        fc.date().map(d => d.toISOString()),
        fc.constant(null),
        fc.string() // invalid date strings
      );
      break;
    case 'mixed':
    default:
      dataGenerator = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.float(),
        fc.date(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined)
      );
      break;
  }
  
  return fc.record({
    id: fc.constant(uuidv4()),
    cdeId: fc.constant(uuidv4()),
    data: fc.array(dataGenerator, { minLength: 10, maxLength: 1000 }),
    capturedAt: fc.date()
  });
};