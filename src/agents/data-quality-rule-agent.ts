/**
 * Data Quality Rule Agent
 * Generates and manages data quality validation rules for CDEs
 */

import { v4 as uuidv4 } from 'uuid';
import { IDataQualityRuleAgent } from '../interfaces/agents.js';
import {
  CDE,
  DQRule,
  RuleExecutionResult,
  DataSnapshot,
  DataProfile,
  ReconciliationResult,
  DQDimension,
  RuleLogic,
  Threshold,
  Severity,
  RuleLogicType,
  ReconciliationItemStatus
} from '../types/index.js';

/**
 * Implementation of the Data Quality Rule Agent
 */
export class DataQualityRuleAgent implements IDataQualityRuleAgent {
  private ruleRepository: Map<string, DQRule> = new Map();
  private ruleHistory: Map<string, Array<{ threshold: Threshold; justification: string; updatedAt: Date; updatedBy: string }>> = new Map();
  
  /**
   * Generate data quality rules for a CDE across all applicable dimensions
   */
  async generateRulesForCDE(cde: CDE, historicalData?: DataProfile): Promise<DQRule[]> {
    const rules: DQRule[] = [];
    
    // Generate rules for each applicable dimension
    const dimensions: DQDimension[] = [
      'completeness',
      'accuracy', 
      'validity',
      'consistency',
      'timeliness',
      'uniqueness',
      'integrity'
    ];
    
    for (const dimension of dimensions) {
      const rule = await this.generateRuleForDimension(cde, dimension, historicalData);
      if (rule) {
        rules.push(rule);
      }
    }
    
    return rules;
  }
  
  /**
   * Generate a rule for a specific dimension
   */
  private async generateRuleForDimension(
    cde: CDE, 
    dimension: DQDimension, 
    historicalData?: DataProfile
  ): Promise<DQRule | null> {
    const ruleId = uuidv4();
    
    switch (dimension) {
      case 'completeness':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Completeness Check`,
          description: `Validates that ${cde.name} has no null or empty values`,
          logic: {
            type: 'null_check',
            expression: 'value IS NOT NULL AND value != \'\'',
            parameters: {}
          },
          threshold: this.calculateThreshold('completeness', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      case 'accuracy':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Accuracy Check`,
          description: `Validates that ${cde.name} values are within expected ranges`,
          logic: this.generateAccuracyLogic(historicalData),
          threshold: this.calculateThreshold('accuracy', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      case 'validity':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Validity Check`,
          description: `Validates that ${cde.name} values conform to expected format`,
          logic: {
            type: 'format_check',
            expression: 'value MATCHES expected_format',
            parameters: { format: this.inferFormat(historicalData) }
          },
          threshold: this.calculateThreshold('validity', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      case 'consistency':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Consistency Check`,
          description: `Validates that ${cde.name} values are consistent across related records`,
          logic: {
            type: 'referential_check',
            expression: 'value = related_value',
            parameters: {}
          },
          threshold: this.calculateThreshold('consistency', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      case 'timeliness':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Timeliness Check`,
          description: `Validates that ${cde.name} is updated within acceptable timeframes`,
          logic: {
            type: 'custom',
            expression: 'DATEDIFF(NOW(), last_updated) <= max_age_days',
            parameters: { max_age_days: 1 }
          },
          threshold: this.calculateThreshold('timeliness', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      case 'uniqueness':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Uniqueness Check`,
          description: `Validates that ${cde.name} values are unique where required`,
          logic: {
            type: 'custom',
            expression: 'COUNT(DISTINCT value) = COUNT(value)',
            parameters: {}
          },
          threshold: this.calculateThreshold('uniqueness', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      case 'integrity':
        return {
          id: ruleId,
          cdeId: cde.id,
          dimension,
          name: `${cde.name} - Integrity Check`,
          description: `Validates that ${cde.name} maintains referential integrity and business rules`,
          logic: {
            type: 'referential_check',
            expression: 'value IN (SELECT valid_value FROM reference_table)',
            parameters: {}
          },
          threshold: this.calculateThreshold('integrity', historicalData),
          severity: this.determineSeverity(cde, dimension),
          owner: (cde.dataOwner && cde.dataOwner.trim()) || 'unassigned',
          enabled: true
        };
        
      default:
        return null;
    }
  }
  
  /**
   * Generate accuracy logic based on historical data
   */
  private generateAccuracyLogic(historicalData?: DataProfile): RuleLogic {
    if (historicalData && historicalData.minValue !== undefined && historicalData.maxValue !== undefined) {
      // Use historical range with some tolerance
      const tolerance = (historicalData.maxValue - historicalData.minValue) * 0.1;
      return {
        type: 'range_check',
        expression: 'value BETWEEN min_value AND max_value',
        parameters: {
          min_value: historicalData.minValue - tolerance,
          max_value: historicalData.maxValue + tolerance
        }
      };
    }
    
    // Default accuracy check
    return {
      type: 'custom',
      expression: 'value IS NOT NULL AND value >= 0',
      parameters: {}
    };
  }
  
  /**
   * Calculate threshold based on dimension and historical data
   */
  private calculateThreshold(dimension: DQDimension, historicalData?: DataProfile): Threshold {
    if (historicalData) {
      switch (dimension) {
        case 'completeness':
          // Use historical null percentage to set threshold
          const targetCompleteness = Math.max(95, 100 - (historicalData.nullPercentage * 1.2));
          return {
            type: 'percentage',
            value: targetCompleteness
          };
          
        case 'uniqueness':
          // Use historical uniqueness percentage
          const targetUniqueness = Math.max(90, historicalData.uniquePercentage * 0.95);
          return {
            type: 'percentage',
            value: targetUniqueness
          };
          
        case 'accuracy':
        case 'validity':
        case 'consistency':
        case 'timeliness':
          return {
            type: 'percentage',
            value: 98
          };
          
        default:
          return {
            type: 'percentage',
            value: 95
          };
      }
    }
    
    // Default thresholds when no historical data
    const defaultThresholds: Record<DQDimension, number> = {
      completeness: 100,
      accuracy: 98,
      validity: 95,
      consistency: 98,
      timeliness: 95,
      uniqueness: 100,
      integrity: 100
    };
    
    return {
      type: 'percentage',
      value: defaultThresholds[dimension]
    };
  }
  
  /**
   * Determine severity based on CDE and dimension
   */
  private determineSeverity(cde: CDE, dimension: DQDimension): Severity {
    // Critical dimensions for all CDEs
    if (dimension === 'completeness' || dimension === 'accuracy') {
      return 'critical';
    }
    
    // High priority dimensions
    if (dimension === 'validity' || dimension === 'consistency') {
      return 'high';
    }
    
    // Medium priority for others
    return 'medium';
  }
  
  /**
   * Infer format from historical data patterns
   */
  private inferFormat(historicalData?: DataProfile): string {
    if (historicalData?.patterns && historicalData.patterns.length > 0) {
      return historicalData.patterns[0];
    }
    return '.*'; // Default regex pattern
  }
  
  /**
   * Ingest existing rules and reconcile with system
   */
  async ingestExistingRules(rules: DQRule[]): Promise<ReconciliationResult> {
    const items: ReconciliationItem[] = [];
    let matchedCount = 0;
    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;
    
    // Process each incoming rule
    for (const incomingRule of rules) {
      const existingRule = this.ruleRepository.get(incomingRule.id);
      
      if (!existingRule) {
        // New rule - add it
        this.ruleRepository.set(incomingRule.id, incomingRule);
        items.push({
          itemId: incomingRule.id,
          itemType: 'DQRule',
          status: 'added',
          newValue: incomingRule
        });
        addedCount++;
      } else {
        // Existing rule - check for modifications
        const differences = this.compareRules(existingRule, incomingRule);
        if (differences.length > 0) {
          this.ruleRepository.set(incomingRule.id, incomingRule);
          items.push({
            itemId: incomingRule.id,
            itemType: 'DQRule',
            status: 'modified',
            existingValue: existingRule,
            newValue: incomingRule,
            differences
          });
          modifiedCount++;
        } else {
          items.push({
            itemId: incomingRule.id,
            itemType: 'DQRule',
            status: 'matched',
            existingValue: existingRule,
            newValue: incomingRule
          });
          matchedCount++;
        }
      }
    }
    
    // Check for removed rules (rules in repository but not in incoming set)
    const incomingRuleIds = new Set(rules.map(r => r.id));
    for (const [ruleId, existingRule] of this.ruleRepository.entries()) {
      if (!incomingRuleIds.has(ruleId)) {
        this.ruleRepository.delete(ruleId);
        items.push({
          itemId: ruleId,
          itemType: 'DQRule',
          status: 'removed',
          existingValue: existingRule
        });
        removedCount++;
      }
    }
    
    return {
      items,
      matchedCount,
      addedCount,
      removedCount,
      modifiedCount
    };
  }
  
  /**
   * Compare two rules to identify differences
   */
  private compareRules(existing: DQRule, incoming: DQRule): string[] {
    const differences: string[] = [];
    
    if (existing.name !== incoming.name) {
      differences.push(`name: "${existing.name}" -> "${incoming.name}"`);
    }
    
    if (existing.description !== incoming.description) {
      differences.push(`description: "${existing.description}" -> "${incoming.description}"`);
    }
    
    if (existing.dimension !== incoming.dimension) {
      differences.push(`dimension: "${existing.dimension}" -> "${incoming.dimension}"`);
    }
    
    if (JSON.stringify(existing.logic) !== JSON.stringify(incoming.logic)) {
      differences.push(`logic: ${JSON.stringify(existing.logic)} -> ${JSON.stringify(incoming.logic)}`);
    }
    
    if (JSON.stringify(existing.threshold) !== JSON.stringify(incoming.threshold)) {
      differences.push(`threshold: ${JSON.stringify(existing.threshold)} -> ${JSON.stringify(incoming.threshold)}`);
    }
    
    if (existing.severity !== incoming.severity) {
      differences.push(`severity: "${existing.severity}" -> "${incoming.severity}"`);
    }
    
    if (existing.owner !== incoming.owner) {
      differences.push(`owner: "${existing.owner}" -> "${incoming.owner}"`);
    }
    
    if (existing.enabled !== incoming.enabled) {
      differences.push(`enabled: ${existing.enabled} -> ${incoming.enabled}`);
    }
    
    return differences;
  }
  
  /**
   * Update rule threshold with justification
   */
  async updateRuleThreshold(ruleId: string, newThreshold: number, justification: string): Promise<void> {
    // Validate inputs
    if (newThreshold < 0 || newThreshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    
    if (!justification || justification.trim().length === 0) {
      throw new Error('Justification is required for threshold updates');
    }
    
    // Get existing rule
    const existingRule = this.ruleRepository.get(ruleId);
    if (!existingRule) {
      throw new Error(`Rule with ID ${ruleId} not found`);
    }
    
    // Store history of threshold changes
    if (!this.ruleHistory.has(ruleId)) {
      this.ruleHistory.set(ruleId, []);
    }
    
    const history = this.ruleHistory.get(ruleId)!;
    history.push({
      threshold: { ...existingRule.threshold },
      justification,
      updatedAt: new Date(),
      updatedBy: 'system' // In real implementation, this would be the current user
    });
    
    // Update the rule threshold
    const updatedRule: DQRule = {
      ...existingRule,
      threshold: {
        ...existingRule.threshold,
        value: newThreshold
      }
    };
    
    this.ruleRepository.set(ruleId, updatedRule);
  }
  
  /**
   * Get rule by ID
   */
  async getRule(ruleId: string): Promise<DQRule | null> {
    return this.ruleRepository.get(ruleId) || null;
  }
  
  /**
   * Get all rules for a CDE
   */
  async getRulesForCDE(cdeId: string): Promise<DQRule[]> {
    return Array.from(this.ruleRepository.values()).filter(rule => rule.cdeId === cdeId);
  }
  
  /**
   * Get rule modification history
   */
  async getRuleHistory(ruleId: string): Promise<Array<{ threshold: Threshold; justification: string; updatedAt: Date; updatedBy: string }>> {
    return this.ruleHistory.get(ruleId) || [];
  }
  
  /**
   * Enable or disable a rule
   */
  async setRuleEnabled(ruleId: string, enabled: boolean, justification: string): Promise<void> {
    const existingRule = this.ruleRepository.get(ruleId);
    if (!existingRule) {
      throw new Error(`Rule with ID ${ruleId} not found`);
    }
    
    if (!justification || justification.trim().length === 0) {
      throw new Error('Justification is required for enabling/disabling rules');
    }
    
    const updatedRule: DQRule = {
      ...existingRule,
      enabled
    };
    
    this.ruleRepository.set(ruleId, updatedRule);
  }
  
  /**
   * Execute rules against data snapshot
   */
  async executeRules(rules: DQRule[], dataSnapshot: DataSnapshot): Promise<RuleExecutionResult[]> {
    const results: RuleExecutionResult[] = [];
    
    // Filter to only enabled rules
    const enabledRules = rules.filter(r => r.enabled);
    
    // Execute rules in parallel for better performance
    const rulePromises = enabledRules.map(rule => this.executeRule(rule, dataSnapshot));
    const ruleResults = await Promise.all(rulePromises);
    
    results.push(...ruleResults);
    
    return results;
  }
  
  /**
   * Execute rules for multiple data snapshots and aggregate results
   */
  async executeRulesForMultipleSnapshots(rules: DQRule[], dataSnapshots: DataSnapshot[]): Promise<RuleExecutionResult[]> {
    const allResults: RuleExecutionResult[] = [];
    
    for (const snapshot of dataSnapshots) {
      const snapshotResults = await this.executeRules(rules, snapshot);
      allResults.push(...snapshotResults);
    }
    
    // Aggregate results by rule ID
    return this.aggregateResults(allResults);
  }
  
  /**
   * Aggregate multiple execution results for the same rule
   */
  private aggregateResults(results: RuleExecutionResult[]): RuleExecutionResult[] {
    const aggregatedMap = new Map<string, RuleExecutionResult[]>();
    
    // Group results by rule ID
    for (const result of results) {
      if (!aggregatedMap.has(result.ruleId)) {
        aggregatedMap.set(result.ruleId, []);
      }
      aggregatedMap.get(result.ruleId)!.push(result);
    }
    
    // Aggregate each group
    const aggregatedResults: RuleExecutionResult[] = [];
    for (const [ruleId, ruleResults] of aggregatedMap.entries()) {
      const aggregated = this.aggregateRuleResults(ruleResults);
      aggregatedResults.push(aggregated);
    }
    
    return aggregatedResults;
  }
  
  /**
   * Aggregate results for a single rule across multiple executions
   */
  private aggregateRuleResults(results: RuleExecutionResult[]): RuleExecutionResult {
    if (results.length === 0) {
      throw new Error('Cannot aggregate empty results array');
    }
    
    if (results.length === 1) {
      return results[0];
    }
    
    const totalRecords = results.reduce((sum, r) => sum + r.totalRecords, 0);
    const totalFailedRecords = results.reduce((sum, r) => sum + (r.failedRecords || 0), 0);
    const totalPassedRecords = totalRecords - totalFailedRecords;
    
    const aggregatedActualValue = totalRecords > 0 ? (totalPassedRecords / totalRecords) * 100 : 0;
    const overallPassed = results.every(r => r.passed);
    
    return {
      ruleId: results[0].ruleId,
      passed: overallPassed,
      actualValue: aggregatedActualValue,
      expectedValue: results[0].expectedValue,
      failedRecords: totalFailedRecords,
      totalRecords,
      executedAt: new Date()
    };
  }
  
  /**
   * Execute a single rule against data
   */
  private async executeRule(rule: DQRule, dataSnapshot: DataSnapshot): Promise<RuleExecutionResult> {
    const totalRecords = dataSnapshot.data.length;
    
    if (totalRecords === 0) {
      return {
        ruleId: rule.id,
        passed: true, // Empty dataset passes by default
        actualValue: 100,
        expectedValue: rule.threshold.value,
        failedRecords: 0,
        totalRecords: 0,
        executedAt: new Date()
      };
    }
    
    let passedRecords = 0;
    
    // Execute rule based on rule type
    switch (rule.logic.type) {
      case 'null_check':
        passedRecords = this.executeNullCheck(dataSnapshot.data);
        break;
        
      case 'range_check':
        passedRecords = this.executeRangeCheck(dataSnapshot.data, rule.logic.parameters);
        break;
        
      case 'format_check':
        passedRecords = this.executeFormatCheck(dataSnapshot.data, rule.logic.parameters);
        break;
        
      case 'referential_check':
        passedRecords = this.executeReferentialCheck(dataSnapshot.data, rule.logic.parameters);
        break;
        
      case 'reconciliation':
        passedRecords = this.executeReconciliationCheck(dataSnapshot.data, rule.logic.parameters);
        break;
        
      case 'custom':
        passedRecords = this.executeCustomCheck(dataSnapshot.data, rule.logic);
        break;
        
      default:
        throw new Error(`Unsupported rule logic type: ${rule.logic.type}`);
    }
    
    const actualPercentage = (passedRecords / totalRecords) * 100;
    const passed = this.evaluateThreshold(actualPercentage, rule.threshold);
    
    return {
      ruleId: rule.id,
      passed,
      actualValue: actualPercentage,
      expectedValue: rule.threshold.value,
      failedRecords: totalRecords - passedRecords,
      totalRecords,
      executedAt: new Date()
    };
  }
  
  /**
   * Execute null check logic
   */
  private executeNullCheck(data: unknown[]): number {
    return data.filter(record => 
      record !== null && 
      record !== undefined && 
      record !== '' && 
      (typeof record !== 'string' || record.trim() !== '')
    ).length;
  }
  
  /**
   * Execute range check logic
   */
  private executeRangeCheck(data: unknown[], parameters?: Record<string, unknown>): number {
    const minValue = (parameters?.min_value as number) ?? Number.NEGATIVE_INFINITY;
    const maxValue = (parameters?.max_value as number) ?? Number.POSITIVE_INFINITY;
    
    return data.filter(record => {
      const numValue = Number(record);
      return !isNaN(numValue) && numValue >= minValue && numValue <= maxValue;
    }).length;
  }
  
  /**
   * Execute format check logic
   */
  private executeFormatCheck(data: unknown[], parameters?: Record<string, unknown>): number {
    const format = (parameters?.format as string) || '.*';
    
    try {
      const regex = new RegExp(format);
      return data.filter(record => 
        typeof record === 'string' && regex.test(record)
      ).length;
    } catch (error) {
      // Invalid regex, fail all records
      return 0;
    }
  }
  
  /**
   * Execute referential check logic
   */
  private executeReferentialCheck(data: unknown[], parameters?: Record<string, unknown>): number {
    // Simplified referential check - in real implementation, this would check against reference data
    const referenceValues = (parameters?.reference_values as unknown[]) || [];
    
    if (referenceValues.length === 0) {
      return data.length; // If no reference values specified, all pass
    }
    
    return data.filter(record => referenceValues.includes(record)).length;
  }
  
  /**
   * Execute reconciliation check logic
   */
  private executeReconciliationCheck(data: unknown[], parameters?: Record<string, unknown>): number {
    // Simplified reconciliation check - in real implementation, this would reconcile against another dataset
    const tolerance = (parameters?.tolerance as number) || 0;
    const expectedSum = (parameters?.expected_sum as number) || 0;
    
    const actualSum = data.reduce((sum, record) => {
      const numValue = Number(record);
      return sum + (isNaN(numValue) ? 0 : numValue);
    }, 0);
    
    const difference = Math.abs(actualSum - expectedSum);
    return difference <= tolerance ? data.length : 0;
  }
  
  /**
   * Execute custom check logic
   */
  private executeCustomCheck(data: unknown[], logic: RuleLogic): number {
    // Simplified custom check - in real implementation, this would evaluate the custom expression
    const expression = logic.expression.toLowerCase();
    
    if (expression.includes('count(distinct')) {
      // Uniqueness check
      const uniqueValues = new Set(data);
      return uniqueValues.size === data.length ? data.length : 0;
    }
    
    if (expression.includes('datediff') || expression.includes('timeliness')) {
      // Timeliness check - simulate based on current time
      const maxAgeDays = (logic.parameters?.max_age_days as number) || 1;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      
      return data.filter(record => {
        if (record instanceof Date) {
          return record >= cutoffDate;
        }
        // Try to parse as date string
        const dateValue = new Date(String(record));
        return !isNaN(dateValue.getTime()) && dateValue >= cutoffDate;
      }).length;
    }
    
    // Default: pass all records for unknown custom expressions
    return data.length;
  }
  
  /**
   * Evaluate if actual value meets threshold criteria
   */
  private evaluateThreshold(actualValue: number, threshold: Threshold): boolean {
    switch (threshold.type) {
      case 'percentage':
        return actualValue >= threshold.value;
        
      case 'absolute':
        return actualValue >= threshold.value;
        
      case 'range':
        const minValue = threshold.minValue ?? threshold.value;
        const maxValue = threshold.maxValue ?? threshold.value;
        return actualValue >= minValue && actualValue <= maxValue;
        
      default:
        return actualValue >= threshold.value;
    }
  }
}