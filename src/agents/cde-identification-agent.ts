/**
 * CDE Identification Agent
 * Identifies and scores critical data elements
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DataElement,
  CDE,
  CDEScore,
  CDEInventory,
  CDEScoringFactors,
  OwnerSuggestion,
  ScoringContext,
  ReconciliationResult,
  ReconciliationItemStatus,
  ArtifactStatus,
  CDEStatus
} from '../types/index.js';
import { ICDEIdentificationAgent } from '../interfaces/agents.js';
import { IGovernanceRepository } from '../repository/governance-repository.js';

/**
 * Configuration for the CDE Identification Agent
 */
export interface CDEIdentificationAgentConfig {
  /** Default threshold for CDE classification (0-1) */
  defaultThreshold: number;
  /** Weight for regulatory calculation usage factor */
  regulatoryCalculationWeight: number;
  /** Weight for cross-report usage factor */
  crossReportWeight: number;
  /** Weight for financial impact factor */
  financialImpactWeight: number;
  /** Weight for regulatory scrutiny factor */
  regulatoryScrutinyWeight: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CDEIdentificationAgentConfig = {
  defaultThreshold: 0.7,
  regulatoryCalculationWeight: 0.3,
  crossReportWeight: 0.25,
  financialImpactWeight: 0.25,
  regulatoryScrutinyWeight: 0.2
};


/**
 * Implementation of the CDE Identification Agent
 */
export class CDEIdentificationAgent implements ICDEIdentificationAgent {
  private repository: IGovernanceRepository;
  private config: CDEIdentificationAgentConfig;

  constructor(
    repository: IGovernanceRepository,
    config: Partial<CDEIdentificationAgentConfig> = {}
  ) {
    this.repository = repository;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Scores data elements for criticality
   * Requirement 4.1: Score elements based on regulatory calculation usage, cross-report usage,
   * financial impact, and regulatory scrutiny criteria
   * 
   * @param elements - Data elements to score
   * @param context - Scoring context including report ID and threshold
   * @returns Array of CDE scores with rationale
   */
  async scoreDataElements(
    elements: DataElement[],
    context: ScoringContext
  ): Promise<CDEScore[]> {
    const scores: CDEScore[] = [];

    for (const element of elements) {
      const factors = this.calculateScoringFactors(element, context);
      const overallScore = this.calculateOverallScore(factors);
      const rationale = this.generateRationale(element, factors, overallScore);

      scores.push({
        elementId: element.id,
        overallScore,
        factors,
        rationale
      });
    }

    // Log the scoring action
    this.repository.createAuditEntry({
      actor: 'CDEIdentificationAgent',
      actorType: 'agent',
      action: 'score_data_elements',
      entityType: 'CDEScore',
      entityId: context.reportId,
      newState: {
        reportId: context.reportId,
        elementsScored: elements.length,
        scoresAboveThreshold: scores.filter(s => s.overallScore >= context.threshold).length
      }
    });

    return scores;
  }

  /**
   * Generates a CDE inventory from scores
   * Requirement 4.2: Add elements scoring above threshold to CDE Inventory with rationale
   * 
   * @param scores - CDE scores to process
   * @param threshold - Criticality threshold (0-1)
   * @returns CDE inventory with qualifying elements
   */
  async generateCDEInventory(
    scores: CDEScore[],
    threshold: number
  ): Promise<CDEInventory> {
    const cdes: CDE[] = [];

    for (const score of scores) {
      if (score.overallScore >= threshold) {
        cdes.push({
          id: uuidv4(),
          elementId: score.elementId,
          name: `CDE-${score.elementId.substring(0, 8)}`,
          businessDefinition: '',
          criticalityRationale: score.rationale,
          status: 'pending_approval' as CDEStatus
        });
      }
    }

    const inventory: CDEInventory = {
      id: uuidv4(),
      reportId: '',
      cdes,
      version: 1,
      status: 'draft' as ArtifactStatus,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Log the inventory generation
    this.repository.createAuditEntry({
      actor: 'CDEIdentificationAgent',
      actorType: 'agent',
      action: 'generate_cde_inventory',
      entityType: 'CDEInventory',
      entityId: inventory.id,
      newState: {
        inventoryId: inventory.id,
        totalScores: scores.length,
        cdesIdentified: cdes.length,
        threshold
      }
    });

    return inventory;
  }


  /**
   * Reconciles a new CDE inventory with an existing one
   * Requirement 4.3: Reconcile AI-identified CDEs with existing list and highlight discrepancies
   * 
   * @param newInventory - Newly generated CDE inventory
   * @param existing - Existing CDE inventory to reconcile with
   * @returns Reconciliation result showing matched, added, removed, and modified items
   */
  async reconcileWithExisting(
    newInventory: CDEInventory,
    existing: CDEInventory
  ): Promise<ReconciliationResult> {
    const result: ReconciliationResult = {
      items: [],
      matchedCount: 0,
      addedCount: 0,
      removedCount: 0,
      modifiedCount: 0
    };

    const existingByElementId = new Map(existing.cdes.map(c => [c.elementId, c]));
    const newByElementId = new Map(newInventory.cdes.map(c => [c.elementId, c]));

    // Check for added and modified CDEs
    for (const newCDE of newInventory.cdes) {
      const existingCDE = existingByElementId.get(newCDE.elementId);

      if (!existingCDE) {
        result.items.push({
          itemId: newCDE.id,
          itemType: 'CDE',
          status: 'added' as ReconciliationItemStatus,
          newValue: newCDE
        });
        result.addedCount++;
      } else {
        const differences = this.compareCDEs(existingCDE, newCDE);
        if (differences.length > 0) {
          result.items.push({
            itemId: newCDE.id,
            itemType: 'CDE',
            status: 'modified' as ReconciliationItemStatus,
            existingValue: existingCDE,
            newValue: newCDE,
            differences
          });
          result.modifiedCount++;
        } else {
          result.items.push({
            itemId: newCDE.id,
            itemType: 'CDE',
            status: 'matched' as ReconciliationItemStatus,
            existingValue: existingCDE,
            newValue: newCDE
          });
          result.matchedCount++;
        }
      }
    }

    // Check for removed CDEs
    for (const existingCDE of existing.cdes) {
      if (!newByElementId.has(existingCDE.elementId)) {
        result.items.push({
          itemId: existingCDE.id,
          itemType: 'CDE',
          status: 'removed' as ReconciliationItemStatus,
          existingValue: existingCDE
        });
        result.removedCount++;
      }
    }

    // Log the reconciliation
    this.repository.createAuditEntry({
      actor: 'CDEIdentificationAgent',
      actorType: 'agent',
      action: 'reconcile_cde_inventories',
      entityType: 'CDEInventory',
      entityId: newInventory.id,
      previousState: existing,
      newState: newInventory,
      rationale: `Reconciled: ${result.matchedCount} matched, ${result.addedCount} added, ${result.removedCount} removed, ${result.modifiedCount} modified`
    });

    return result;
  }

  /**
   * Suggests data owners for CDEs
   * Requirement 4.4, 4.5: Suggest data owners and validate ownership
   * 
   * @param cdes - CDEs to suggest owners for
   * @returns Array of owner suggestions with confidence and rationale
   */
  async suggestDataOwners(cdes: CDE[]): Promise<OwnerSuggestion[]> {
    const suggestions: OwnerSuggestion[] = [];

    for (const cde of cdes) {
      const suggestion = this.generateOwnerSuggestion(cde);
      suggestions.push(suggestion);
    }

    // Log the suggestion action
    this.repository.createAuditEntry({
      actor: 'CDEIdentificationAgent',
      actorType: 'agent',
      action: 'suggest_data_owners',
      entityType: 'OwnerSuggestion',
      entityId: 'batch',
      newState: {
        cdesProcessed: cdes.length,
        suggestionsGenerated: suggestions.length
      }
    });

    return suggestions;
  }


  // ============ Helper Methods ============

  /**
   * Calculates scoring factors for a data element
   * Uses deterministic scoring based on element characteristics
   */
  private calculateScoringFactors(
    element: DataElement,
    _context: ScoringContext
  ): CDEScoringFactors {
    // Regulatory calculation usage: based on presence of calculation logic
    const regulatoryCalculationUsage = element.calculationLogic 
      ? 0.8 + (element.mandatory ? 0.2 : 0)
      : element.mandatory ? 0.6 : 0.3;

    // Cross-report usage: based on element name patterns (common fields score higher)
    const crossReportUsage = this.estimateCrossReportUsage(element);

    // Financial impact: based on data type and unit
    const financialImpact = this.estimateFinancialImpact(element);

    // Regulatory scrutiny: based on mandatory flag and definition keywords
    const regulatoryScrutiny = this.estimateRegulatoryScrutiny(element);

    return {
      regulatoryCalculationUsage,
      crossReportUsage,
      financialImpact,
      regulatoryScrutiny
    };
  }

  /**
   * Calculates overall score from factors using configured weights
   * This is deterministic: same factors always produce same score
   */
  private calculateOverallScore(factors: CDEScoringFactors): number {
    const score = 
      factors.regulatoryCalculationUsage * this.config.regulatoryCalculationWeight +
      factors.crossReportUsage * this.config.crossReportWeight +
      factors.financialImpact * this.config.financialImpactWeight +
      factors.regulatoryScrutiny * this.config.regulatoryScrutinyWeight;

    // Round to 4 decimal places for consistency
    return Math.round(score * 10000) / 10000;
  }

  /**
   * Generates rationale for a CDE score
   */
  private generateRationale(
    element: DataElement,
    factors: CDEScoringFactors,
    overallScore: number
  ): string {
    const parts: string[] = [];

    if (factors.regulatoryCalculationUsage >= 0.7) {
      parts.push('high regulatory calculation usage');
    }
    if (factors.crossReportUsage >= 0.7) {
      parts.push('used across multiple reports');
    }
    if (factors.financialImpact >= 0.7) {
      parts.push('significant financial impact');
    }
    if (factors.regulatoryScrutiny >= 0.7) {
      parts.push('subject to regulatory scrutiny');
    }

    if (parts.length === 0) {
      parts.push('moderate criticality based on combined factors');
    }

    return `Element '${element.name}' scored ${(overallScore * 100).toFixed(1)}% due to: ${parts.join(', ')}.`;
  }

  /**
   * Estimates cross-report usage based on element characteristics
   */
  private estimateCrossReportUsage(element: DataElement): number {
    const commonFieldPatterns = [
      'total', 'balance', 'amount', 'rate', 'ratio', 'exposure',
      'capital', 'asset', 'liability', 'revenue', 'income', 'loss'
    ];

    const nameLower = element.name.toLowerCase();
    const matchCount = commonFieldPatterns.filter(p => nameLower.includes(p)).length;

    if (matchCount >= 2) return 0.9;
    if (matchCount === 1) return 0.7;
    if (element.mandatory) return 0.5;
    return 0.3;
  }

  /**
   * Estimates financial impact based on element characteristics
   */
  private estimateFinancialImpact(element: DataElement): number {
    // Financial data types indicate higher impact
    if (element.dataType === 'decimal' || element.dataType === 'number') {
      if (element.unit && ['USD', 'CAD', 'EUR', 'GBP'].includes(element.unit)) {
        return 0.9;
      }
      if (element.unit === '%' || element.unit === 'bps') {
        return 0.8;
      }
      return 0.6;
    }

    // Check name for financial indicators
    const financialPatterns = ['amount', 'balance', 'value', 'price', 'cost', 'revenue'];
    const nameLower = element.name.toLowerCase();
    if (financialPatterns.some(p => nameLower.includes(p))) {
      return 0.7;
    }

    return 0.3;
  }

  /**
   * Estimates regulatory scrutiny based on element characteristics
   */
  private estimateRegulatoryScrutiny(element: DataElement): number {
    let score = element.mandatory ? 0.5 : 0.2;

    // Check definition for regulatory keywords
    const regulatoryKeywords = [
      'regulatory', 'compliance', 'capital', 'risk', 'exposure',
      'bcbs', 'basel', 'osfi', 'fed', 'occ', 'fdic'
    ];

    const defLower = element.regulatoryDefinition.toLowerCase();
    const keywordMatches = regulatoryKeywords.filter(k => defLower.includes(k)).length;

    score += Math.min(keywordMatches * 0.15, 0.5);

    return Math.min(score, 1);
  }

  /**
   * Compares two CDEs and returns list of differences
   */
  private compareCDEs(existing: CDE, incoming: CDE): string[] {
    const differences: string[] = [];

    if (existing.name !== incoming.name) {
      differences.push(`name: '${existing.name}' -> '${incoming.name}'`);
    }
    if (existing.businessDefinition !== incoming.businessDefinition) {
      differences.push('businessDefinition changed');
    }
    if (existing.criticalityRationale !== incoming.criticalityRationale) {
      differences.push('criticalityRationale changed');
    }
    if (existing.dataOwner !== incoming.dataOwner) {
      differences.push(`dataOwner: '${existing.dataOwner}' -> '${incoming.dataOwner}'`);
    }
    if (existing.status !== incoming.status) {
      differences.push(`status: '${existing.status}' -> '${incoming.status}'`);
    }

    return differences;
  }

  /**
   * Generates an owner suggestion for a CDE
   */
  private generateOwnerSuggestion(cde: CDE): OwnerSuggestion {
    // In a real implementation, this would query organizational data
    // For now, generate suggestions based on CDE characteristics
    const domain = this.inferDataDomain(cde);
    
    return {
      cdeId: cde.id,
      suggestedOwner: `${domain} Data Steward`,
      suggestedOwnerEmail: `${domain.toLowerCase().replace(/\s+/g, '.')}.steward@example.com`,
      confidence: 0.7,
      rationale: `Suggested based on inferred data domain: ${domain}`
    };
  }

  /**
   * Infers the data domain for a CDE based on its characteristics
   */
  private inferDataDomain(cde: CDE): string {
    const nameLower = cde.name.toLowerCase();
    const defLower = (cde.businessDefinition || '').toLowerCase();
    const combined = `${nameLower} ${defLower}`;

    if (combined.includes('capital') || combined.includes('tier')) {
      return 'Capital Management';
    }
    if (combined.includes('risk') || combined.includes('exposure')) {
      return 'Risk Management';
    }
    if (combined.includes('credit') || combined.includes('loan')) {
      return 'Credit Risk';
    }
    if (combined.includes('market') || combined.includes('trading')) {
      return 'Market Risk';
    }
    if (combined.includes('liquidity') || combined.includes('cash')) {
      return 'Treasury';
    }
    if (combined.includes('customer') || combined.includes('client')) {
      return 'Customer Data';
    }

    return 'General Finance';
  }


  // ============ Additional Public Methods ============

  /**
   * Validates CDE ownership
   * Requirement 4.5: Flag CDEs without owners as requiring ownership assignment
   * 
   * @param inventory - CDE inventory to validate
   * @returns Array of CDEs that need ownership assignment
   */
  validateOwnership(inventory: CDEInventory): CDE[] {
    const cdesNeedingOwners: CDE[] = [];

    for (const cde of inventory.cdes) {
      if (cde.status === 'approved' && !cde.dataOwner) {
        // Approved CDEs must have owners
        cdesNeedingOwners.push(cde);
      } else if (!cde.dataOwner && cde.status !== 'rejected') {
        // Non-rejected CDEs without owners should be flagged
        cdesNeedingOwners.push(cde);
      }
    }

    return cdesNeedingOwners;
  }

  /**
   * Assigns an owner to a CDE
   * 
   * @param cdeId - ID of the CDE
   * @param owner - Owner name
   * @param ownerEmail - Owner email
   * @param assignedBy - Person making the assignment
   */
  async assignOwner(
    reportId: string,
    cdeId: string,
    owner: string,
    ownerEmail: string,
    assignedBy: string
  ): Promise<CDE | undefined> {
    const inventory = this.repository.getCDEInventory(reportId);
    if (!inventory) {
      throw new Error(`No CDE inventory exists for report ${reportId}`);
    }

    const cdeIndex = inventory.cdes.findIndex(c => c.id === cdeId);
    if (cdeIndex === -1) {
      throw new Error(`CDE ${cdeId} not found in inventory`);
    }

    const previousCDE = inventory.cdes[cdeIndex];
    const updatedCDE: CDE = {
      ...previousCDE,
      dataOwner: owner,
      dataOwnerEmail: ownerEmail
    };

    inventory.cdes[cdeIndex] = updatedCDE;
    inventory.updatedAt = new Date();

    this.repository.setCDEInventory(reportId, inventory);

    this.repository.createAuditEntry({
      actor: assignedBy,
      actorType: 'human',
      action: 'assign_cde_owner',
      entityType: 'CDE',
      entityId: cdeId,
      previousState: previousCDE,
      newState: updatedCDE,
      rationale: `Assigned owner ${owner} to CDE`
    });

    return updatedCDE;
  }

  /**
   * Submits a CDE inventory for review
   * Requirement 4.4: Require business stakeholder review and approval
   */
  async submitForReview(reportId: string, submitter: string): Promise<CDEInventory> {
    const inventory = this.repository.getCDEInventory(reportId);
    if (!inventory) {
      throw new Error(`No CDE inventory exists for report ${reportId}`);
    }

    if (inventory.status !== 'draft') {
      throw new Error(`Cannot submit inventory with status '${inventory.status}' for review`);
    }

    const updatedInventory: CDEInventory = {
      ...inventory,
      status: 'pending_review' as ArtifactStatus,
      updatedAt: new Date()
    };

    this.repository.setCDEInventory(reportId, updatedInventory);

    this.repository.createAuditEntry({
      actor: submitter,
      actorType: 'human',
      action: 'submit_for_review',
      entityType: 'CDEInventory',
      entityId: inventory.id,
      previousState: inventory,
      newState: updatedInventory,
      rationale: 'Submitted CDE inventory for business stakeholder review'
    });

    return updatedInventory;
  }

  /**
   * Approves a CDE inventory after review
   * Requirement 4.4: Require business stakeholder approval before finalizing
   */
  async approveInventory(reportId: string, approver: string): Promise<CDEInventory> {
    const inventory = this.repository.getCDEInventory(reportId);
    if (!inventory) {
      throw new Error(`No CDE inventory exists for report ${reportId}`);
    }

    if (inventory.status !== 'pending_review') {
      throw new Error(`Cannot approve inventory with status '${inventory.status}'`);
    }

    // Update all pending CDEs to approved
    const updatedCDEs = inventory.cdes.map(cde => ({
      ...cde,
      status: cde.status === 'pending_approval' ? 'approved' as CDEStatus : cde.status,
      approvedBy: cde.status === 'pending_approval' ? approver : cde.approvedBy,
      approvedAt: cde.status === 'pending_approval' ? new Date() : cde.approvedAt
    }));

    const updatedInventory: CDEInventory = {
      ...inventory,
      cdes: updatedCDEs,
      status: 'approved' as ArtifactStatus,
      updatedAt: new Date()
    };

    this.repository.setCDEInventory(reportId, updatedInventory);

    this.repository.createAuditEntry({
      actor: approver,
      actorType: 'human',
      action: 'approve_inventory',
      entityType: 'CDEInventory',
      entityId: inventory.id,
      previousState: inventory,
      newState: updatedInventory,
      rationale: 'Approved CDE inventory after business stakeholder review'
    });

    return updatedInventory;
  }

  /**
   * Creates a CDE inventory with report context
   */
  async createInventoryForReport(
    reportId: string,
    elements: DataElement[],
    threshold?: number
  ): Promise<CDEInventory> {
    const effectiveThreshold = threshold ?? this.config.defaultThreshold;
    
    const context: ScoringContext = {
      reportId,
      threshold: effectiveThreshold
    };

    const scores = await this.scoreDataElements(elements, context);
    const inventory = await this.generateCDEInventory(scores, effectiveThreshold);
    
    // Set the report ID
    inventory.reportId = reportId;

    // Store in repository
    this.repository.setCDEInventory(reportId, inventory);

    return inventory;
  }
}
