import { describe, it, expect } from 'vitest';
import { DataQualityRuleAgent } from '../agents/data-quality-rule-agent.js';

describe('Debug DQ Rules', () => {
  it('should generate rules for minimal CDE with null historical data', async () => {
    const agent = new DataQualityRuleAgent();
    
    const testCDE = {
      id: "00000000-0000-1000-8000-000000000000",
      elementId: "00000000-0000-1000-8000-000000000000",
      name: "Customer ID",
      businessDefinition: "",
      criticalityRationale: "          ",
      dataOwner: null,
      dataOwnerEmail: null,
      status: "pending_approval" as const,
      approvedBy: null,
      approvedAt: null
    };

    console.log('Testing CDE:', testCDE);
    console.log('Testing with null historical data...');

    const rules = await agent.generateRulesForCDE(testCDE, null);
    console.log('Generated rules count:', rules.length);
    console.log('Dimensions covered:', rules.map(r => r.dimension));
    
    // Test each rule's logic type
    for (const rule of rules) {
      console.log(`Rule for ${rule.dimension}: logic type = ${rule.logic.type}`);
    }
    
    const expectedDimensions = [
      'completeness',
      'accuracy',
      'validity',
      'consistency',
      'timeliness',
      'uniqueness',
      'integrity'
    ];
    
    console.log('Expected dimensions:', expectedDimensions);
    
    const missingDimensions = expectedDimensions.filter(dim => 
      !rules.some(rule => rule.dimension === dim)
    );
    
    if (missingDimensions.length > 0) {
      console.log('MISSING DIMENSIONS:', missingDimensions);
    } else {
      console.log('ALL DIMENSIONS COVERED ✓');
    }
    
    // Test logic type validation
    for (const rule of rules) {
      switch (rule.dimension) {
        case 'completeness':
          console.log(`Completeness logic type: ${rule.logic.type} (expected: null_check)`);
          expect(rule.logic.type).toBe('null_check');
          break;
        case 'accuracy':
          console.log(`Accuracy logic type: ${rule.logic.type} (expected: range_check or custom)`);
          expect(['range_check', 'custom']).toContain(rule.logic.type);
          break;
        case 'validity':
          console.log(`Validity logic type: ${rule.logic.type} (expected: format_check)`);
          expect(rule.logic.type).toBe('format_check');
          break;
        case 'consistency':
          console.log(`Consistency logic type: ${rule.logic.type} (expected: referential_check)`);
          expect(rule.logic.type).toBe('referential_check');
          break;
        case 'timeliness':
          console.log(`Timeliness logic type: ${rule.logic.type} (expected: custom)`);
          expect(rule.logic.type).toBe('custom');
          break;
        case 'uniqueness':
          console.log(`Uniqueness logic type: ${rule.logic.type} (expected: custom)`);
          expect(rule.logic.type).toBe('custom');
          break;
        case 'integrity':
          console.log(`Integrity logic type: ${rule.logic.type} (expected: referential_check)`);
          expect(rule.logic.type).toBe('referential_check');
          break;
      }
    }
    
    expect(rules.length).toBe(7);
    expect(missingDimensions.length).toBe(0);
  });
});