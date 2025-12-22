/**
 * Property test for DQ Rule Dimension Coverage
 * 
 * **Feature: agentic-data-governance, Property 11: DQ Rule Dimension Coverage**
 * 
 * For any CDE added to the inventory, the Data Quality Rule Agent must generate 
 * at least one rule for each applicable dimension (completeness, accuracy, validity, 
 * consistency, timeliness, uniqueness).
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { DataQualityRuleAgent } from '../../agents/data-quality-rule-agent.js';
import { cdeGenerator, dataProfileGenerator } from '../generators/index.js';
import { DQDimension } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 11: DQ Rule Dimension Coverage', () => {
  it('should generate at least one rule for each applicable dimension when CDE is added', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.option(dataProfileGenerator()),
        async (cde, historicalData) => {
          // Arrange
          const agent = new DataQualityRuleAgent();
          
          // Act
          const rules = await agent.generateRulesForCDE(cde, historicalData ?? undefined);
          
          // Assert
          // Define the expected dimensions that should be covered
          const expectedDimensions: DQDimension[] = [
            'completeness',
            'accuracy',
            'validity',
            'consistency',
            'timeliness',
            'uniqueness',
            'integrity'
          ];
          
          // Check that we have at least one rule for each expected dimension
          for (const expectedDimension of expectedDimensions) {
            const rulesForDimension = rules.filter(rule => rule.dimension === expectedDimension);
            
            // Property: Each applicable dimension must have at least one rule
            if (rulesForDimension.length === 0) {
              return false;
            }
            
            // Verify that each rule is properly configured
            for (const rule of rulesForDimension) {
              // Rule must be linked to the correct CDE
              if (rule.cdeId !== cde.id) {
                return false;
              }
              
              // Rule must have the correct dimension
              if (rule.dimension !== expectedDimension) {
                return false;
              }
              
              // Rule must have required fields populated
              if (!rule.name || rule.name.trim().length === 0) {
                return false;
              }
              
              if (!rule.description || rule.description.trim().length === 0) {
                return false;
              }
              
              if (!rule.logic || !rule.logic.expression) {
                return false;
              }
              
              if (!rule.threshold || rule.threshold.value === undefined) {
                return false;
              }
              
              if (!rule.severity) {
                return false;
              }
            }
          }
          
          // Additional property: All generated rules should be for expected dimensions only
          for (const rule of rules) {
            if (!expectedDimensions.includes(rule.dimension)) {
              return false;
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
  
  it('should generate rules with dimension-appropriate logic types', () => {
    fc.assert(
      fc.asyncProperty(
        cdeGenerator(),
        fc.option(dataProfileGenerator()),
        async (cde, historicalData) => {
          // Arrange
          const agent = new DataQualityRuleAgent();
          
          // Act
          const rules = await agent.generateRulesForCDE(cde, historicalData ?? undefined);
          
          // Assert
          // Verify that each dimension uses appropriate logic types
          for (const rule of rules) {
            switch (rule.dimension) {
              case 'completeness':
                // Completeness should use null_check
                if (rule.logic.type !== 'null_check') {
                  return false;
                }
                break;
                
              case 'accuracy':
                // Accuracy should use range_check or custom
                if (!['range_check', 'custom'].includes(rule.logic.type)) {
                  return false;
                }
                break;
                
              case 'validity':
                // Validity should use format_check
                if (rule.logic.type !== 'format_check') {
                  return false;
                }
                break;
                
              case 'consistency':
                // Consistency should use referential_check
                if (rule.logic.type !== 'referential_check') {
                  return false;
                }
                break;
                
              case 'timeliness':
              case 'uniqueness':
                // Timeliness and uniqueness should use custom logic
                if (rule.logic.type !== 'custom') {
                  return false;
                }
                break;
                
              case 'integrity':
                // Integrity should use referential_check
                if (rule.logic.type !== 'referential_check') {
                  return false;
                }
                break;
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});