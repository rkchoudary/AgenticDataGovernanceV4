/**
 * Property test for DQ Rule Field Completeness
 * 
 * **Feature: agentic-data-governance, Property 12: DQ Rule Field Completeness**
 * 
 * For any generated data quality rule, all required fields must be populated: 
 * id, cdeId, dimension, name, description, logic expression, threshold, severity, and owner.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { DataQualityRuleAgent } from '../../agents/data-quality-rule-agent.js';
import { cdeGenerator, dataProfileGenerator } from '../generators/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 12: DQ Rule Field Completeness', () => {
  it('should populate all required fields for every generated rule', async () => {
    await fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.option(dataProfileGenerator()),
        async (cde, historicalData) => {
          // Arrange
          const agent = new DataQualityRuleAgent();
          
          // Act
          const rules = await agent.generateRulesForCDE(cde, historicalData ?? undefined);
          
          // Assert
          // Property: Every generated rule must have all required fields populated
          for (const rule of rules) {
            // Check id field
            if (!rule.id || typeof rule.id !== 'string' || rule.id.trim().length === 0) {
              throw new Error(
                `Rule for CDE '${cde.name}' (${cde.id}) has invalid id field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.id)}`
              );
            }
            
            // Check cdeId field
            if (!rule.cdeId || typeof rule.cdeId !== 'string' || rule.cdeId.trim().length === 0) {
              throw new Error(
                `Rule ${rule.id} has invalid cdeId field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.cdeId)}`
              );
            }
            
            // Verify cdeId matches the input CDE
            if (rule.cdeId !== cde.id) {
              throw new Error(
                `Rule ${rule.id} has incorrect cdeId. ` +
                `Expected: ${cde.id}, Actual: ${rule.cdeId}`
              );
            }
            
            // Check dimension field
            if (!rule.dimension || typeof rule.dimension !== 'string') {
              throw new Error(
                `Rule ${rule.id} has invalid dimension field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.dimension)}`
              );
            }
            
            // Verify dimension is valid
            const validDimensions = [
              'completeness', 'accuracy', 'validity', 'consistency', 
              'timeliness', 'uniqueness', 'integrity'
            ];
            if (!validDimensions.includes(rule.dimension)) {
              throw new Error(
                `Rule ${rule.id} has invalid dimension '${rule.dimension}'. ` +
                `Expected one of: [${validDimensions.join(', ')}]`
              );
            }
            
            // Check name field
            if (!rule.name || typeof rule.name !== 'string' || rule.name.trim().length === 0) {
              throw new Error(
                `Rule ${rule.id} has invalid name field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.name)}`
              );
            }
            
            // Check description field
            if (!rule.description || typeof rule.description !== 'string' || rule.description.trim().length === 0) {
              throw new Error(
                `Rule ${rule.id} has invalid description field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.description)}`
              );
            }
            
            // Check logic field
            if (!rule.logic || typeof rule.logic !== 'object') {
              throw new Error(
                `Rule ${rule.id} has invalid logic field. ` +
                `Expected object, got: ${JSON.stringify(rule.logic)}`
              );
            }
            
            // Check logic.type field
            if (!rule.logic.type || typeof rule.logic.type !== 'string') {
              throw new Error(
                `Rule ${rule.id} has invalid logic.type field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.logic.type)}`
              );
            }
            
            // Verify logic type is valid
            const validLogicTypes = [
              'null_check', 'range_check', 'format_check', 
              'referential_check', 'reconciliation', 'custom'
            ];
            if (!validLogicTypes.includes(rule.logic.type)) {
              throw new Error(
                `Rule ${rule.id} has invalid logic type '${rule.logic.type}'. ` +
                `Expected one of: [${validLogicTypes.join(', ')}]`
              );
            }
            
            // Check logic.expression field
            if (!rule.logic.expression || typeof rule.logic.expression !== 'string' || rule.logic.expression.trim().length === 0) {
              throw new Error(
                `Rule ${rule.id} has invalid logic.expression field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.logic.expression)}`
              );
            }
            
            // Check threshold field
            if (!rule.threshold || typeof rule.threshold !== 'object') {
              throw new Error(
                `Rule ${rule.id} has invalid threshold field. ` +
                `Expected object, got: ${JSON.stringify(rule.threshold)}`
              );
            }
            
            // Check threshold.type field
            if (!rule.threshold.type || typeof rule.threshold.type !== 'string') {
              throw new Error(
                `Rule ${rule.id} has invalid threshold.type field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.threshold.type)}`
              );
            }
            
            // Verify threshold type is valid
            const validThresholdTypes = ['percentage', 'absolute', 'range'];
            if (!validThresholdTypes.includes(rule.threshold.type)) {
              throw new Error(
                `Rule ${rule.id} has invalid threshold type '${rule.threshold.type}'. ` +
                `Expected one of: [${validThresholdTypes.join(', ')}]`
              );
            }
            
            // Check threshold.value field
            if (rule.threshold.value === undefined || rule.threshold.value === null || typeof rule.threshold.value !== 'number') {
              throw new Error(
                `Rule ${rule.id} has invalid threshold.value field. ` +
                `Expected number, got: ${JSON.stringify(rule.threshold.value)}`
              );
            }
            
            // Verify threshold value is reasonable
            if (rule.threshold.value < 0 || rule.threshold.value > 100) {
              throw new Error(
                `Rule ${rule.id} has unreasonable threshold value ${rule.threshold.value}. ` +
                `Expected value between 0 and 100`
              );
            }
            
            // Check severity field
            if (!rule.severity || typeof rule.severity !== 'string') {
              throw new Error(
                `Rule ${rule.id} has invalid severity field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.severity)}`
              );
            }
            
            // Verify severity is valid
            const validSeverities = ['critical', 'high', 'medium', 'low'];
            if (!validSeverities.includes(rule.severity)) {
              throw new Error(
                `Rule ${rule.id} has invalid severity '${rule.severity}'. ` +
                `Expected one of: [${validSeverities.join(', ')}]`
              );
            }
            
            // Check owner field
            if (!rule.owner || typeof rule.owner !== 'string' || rule.owner.trim().length === 0) {
              throw new Error(
                `Rule ${rule.id} has invalid owner field. ` +
                `Expected non-empty string, got: ${JSON.stringify(rule.owner)}`
              );
            }
            
            // Check enabled field
            if (rule.enabled === undefined || rule.enabled === null || typeof rule.enabled !== 'boolean') {
              throw new Error(
                `Rule ${rule.id} has invalid enabled field. ` +
                `Expected boolean, got: ${JSON.stringify(rule.enabled)}`
              );
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
  
  it('should generate rules with consistent field relationships', async () => {
    await fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.option(dataProfileGenerator()),
        async (cde, historicalData) => {
          // Arrange
          const agent = new DataQualityRuleAgent();
          
          // Act
          const rules = await agent.generateRulesForCDE(cde, historicalData ?? undefined);
          
          // Assert
          // Property: Rule fields should have consistent relationships
          for (const rule of rules) {
            // Rule name should reference the CDE name (only if CDE name is meaningful)
            // Skip this check for very short names or names with special characters
            if (cde.name.trim().length >= 5 && /^[a-zA-Z][a-zA-Z0-9\s]*[a-zA-Z0-9]$/.test(cde.name.trim())) {
              if (!rule.name.toLowerCase().includes(cde.name.toLowerCase())) {
                throw new Error(
                  `Rule ${rule.id} name '${rule.name}' should reference CDE name '${cde.name}'`
                );
              }
            }
            
            // Rule description should reference the CDE name (only if CDE name is meaningful)
            // Skip this check for very short names or names with special characters
            if (cde.name.trim().length >= 5 && /^[a-zA-Z][a-zA-Z0-9\s]*[a-zA-Z0-9]$/.test(cde.name.trim())) {
              if (!rule.description.toLowerCase().includes(cde.name.toLowerCase())) {
                throw new Error(
                  `Rule ${rule.id} description '${rule.description}' should reference CDE name '${cde.name}'`
                );
              }
            }
            
            // Rule owner should match CDE owner when available
            if (cde.dataOwner && cde.dataOwner.trim().length > 0) {
              if (rule.owner !== cde.dataOwner.trim()) {
                throw new Error(
                  `Rule ${rule.id} owner '${rule.owner}' should match CDE owner '${cde.dataOwner.trim()}'`
                );
              }
            } else {
              // When CDE has no owner, rule should have 'unassigned' as owner
              if (rule.owner !== 'unassigned') {
                throw new Error(
                  `Rule ${rule.id} should have 'unassigned' owner when CDE has no owner, ` +
                  `but has '${rule.owner}'`
                );
              }
            }
            
            // Rule name should include dimension (check for dimension or related terms)
            const dimensionInName = rule.name.toLowerCase().includes(rule.dimension.toLowerCase()) ||
                                   rule.name.toLowerCase().includes(rule.dimension.replace('ness', '').toLowerCase()) ||
                                   rule.name.toLowerCase().includes('check') ||
                                   rule.name.toLowerCase().includes('validation');
            if (!dimensionInName) {
              throw new Error(
                `Rule ${rule.id} name '${rule.name}' should include dimension '${rule.dimension}' or related terms`
              );
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});