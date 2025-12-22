/**
 * Unit tests for CDE Identification Agent
 * 
 * Tests scoring logic, inventory generation, and reconciliation
 * Requirements: 4.1, 4.2, 4.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CDEIdentificationAgent } from '../../../agents/cde-identification-agent.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import { 
  DataElement, 
  CDE, 
  CDEInventory, 
  ScoringContext,
  ArtifactStatus,
  CDEStatus
} from '../../../types/index.js';

describe('CDEIdentificationAgent', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: CDEIdentificationAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new CDEIdentificationAgent(repository);
  });

  describe('scoreDataElements', () => {
    it('should score mandatory elements higher than non-mandatory', async () => {
      const mandatoryElement: DataElement = {
        id: 'elem-1',
        name: 'Total Assets',
        regulatoryDefinition: 'Sum of all assets',
        dataType: 'decimal',
        format: '#,##0.00',
        mandatory: true
      };

      const optionalElement: DataElement = {
        id: 'elem-2',
        name: 'Notes',
        regulatoryDefinition: 'Additional notes',
        dataType: 'string',
        format: 'text',
        mandatory: false
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.5
      };

      const scores = await agent.scoreDataElements(
        [mandatoryElement, optionalElement],
        context
      );

      expect(scores.length).toBe(2);
      const mandatoryScore = scores.find(s => s.elementId === 'elem-1');
      const optionalScore = scores.find(s => s.elementId === 'elem-2');

      expect(mandatoryScore!.overallScore).toBeGreaterThan(optionalScore!.overallScore);
    });

    it('should score elements with calculation logic higher', async () => {
      const withCalc: DataElement = {
        id: 'elem-1',
        name: 'Net Income',
        regulatoryDefinition: 'Revenue minus expenses',
        dataType: 'decimal',
        format: '#,##0.00',
        calculationLogic: 'SUM(revenue) - SUM(expenses)',
        mandatory: true
      };

      const withoutCalc: DataElement = {
        id: 'elem-2',
        name: 'Revenue',
        regulatoryDefinition: 'Total revenue',
        dataType: 'decimal',
        format: '#,##0.00',
        mandatory: true
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.5
      };

      const scores = await agent.scoreDataElements([withCalc, withoutCalc], context);

      const calcScore = scores.find(s => s.elementId === 'elem-1');
      const noCalcScore = scores.find(s => s.elementId === 'elem-2');

      expect(calcScore!.factors.regulatoryCalculationUsage)
        .toBeGreaterThan(noCalcScore!.factors.regulatoryCalculationUsage);
    });


    it('should score financial elements higher for financial impact', async () => {
      const financialElement: DataElement = {
        id: 'elem-1',
        name: 'Total Balance',
        regulatoryDefinition: 'Total account balance',
        dataType: 'decimal',
        format: '#,##0.00',
        unit: 'USD',
        mandatory: true
      };

      const nonFinancialElement: DataElement = {
        id: 'elem-2',
        name: 'Account Status',
        regulatoryDefinition: 'Status of the account',
        dataType: 'string',
        format: 'text',
        mandatory: true
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.5
      };

      const scores = await agent.scoreDataElements(
        [financialElement, nonFinancialElement],
        context
      );

      const financialScore = scores.find(s => s.elementId === 'elem-1');
      const nonFinancialScore = scores.find(s => s.elementId === 'elem-2');

      expect(financialScore!.factors.financialImpact)
        .toBeGreaterThan(nonFinancialScore!.factors.financialImpact);
    });

    it('should include rationale for all scores', async () => {
      const element: DataElement = {
        id: 'elem-1',
        name: 'Capital Ratio',
        regulatoryDefinition: 'Regulatory capital ratio',
        dataType: 'decimal',
        format: '#,##0.00',
        mandatory: true
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.5
      };

      const scores = await agent.scoreDataElements([element], context);

      expect(scores[0].rationale).toBeDefined();
      expect(scores[0].rationale.length).toBeGreaterThan(0);
      expect(scores[0].rationale).toContain('Capital Ratio');
    });
  });

  describe('generateCDEInventory', () => {
    it('should include only elements above threshold', async () => {
      const elements: DataElement[] = [
        {
          id: 'elem-1',
          name: 'High Priority Element',
          regulatoryDefinition: 'Critical regulatory capital calculation',
          dataType: 'decimal',
          format: '#,##0.00',
          calculationLogic: 'Complex calculation',
          unit: 'USD',
          mandatory: true
        },
        {
          id: 'elem-2',
          name: 'Low Priority Element',
          regulatoryDefinition: 'Simple text field',
          dataType: 'string',
          format: 'text',
          mandatory: false
        }
      ];

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.6
      };

      const scores = await agent.scoreDataElements(elements, context);
      const inventory = await agent.generateCDEInventory(scores, 0.6);

      // Only high-scoring elements should be included
      for (const cde of inventory.cdes) {
        const score = scores.find(s => s.elementId === cde.elementId);
        expect(score!.overallScore).toBeGreaterThanOrEqual(0.6);
      }
    });

    it('should set initial status to pending_approval', async () => {
      const element: DataElement = {
        id: 'elem-1',
        name: 'Critical Element',
        regulatoryDefinition: 'Very important',
        dataType: 'decimal',
        format: '#,##0.00',
        calculationLogic: 'SUM(values)',
        unit: 'USD',
        mandatory: true
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.3
      };

      const scores = await agent.scoreDataElements([element], context);
      const inventory = await agent.generateCDEInventory(scores, 0.3);

      expect(inventory.cdes.length).toBeGreaterThan(0);
      for (const cde of inventory.cdes) {
        expect(cde.status).toBe('pending_approval');
      }
    });

    it('should preserve rationale from score', async () => {
      const element: DataElement = {
        id: 'elem-1',
        name: 'Test Element',
        regulatoryDefinition: 'Test definition',
        dataType: 'decimal',
        format: '#,##0.00',
        mandatory: true
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.3
      };

      const scores = await agent.scoreDataElements([element], context);
      const inventory = await agent.generateCDEInventory(scores, 0.3);

      if (inventory.cdes.length > 0) {
        const cde = inventory.cdes[0];
        const score = scores.find(s => s.elementId === cde.elementId);
        expect(cde.criticalityRationale).toBe(score!.rationale);
      }
    });
  });


  describe('reconcileWithExisting', () => {
    it('should identify added CDEs', async () => {
      const existingInventory: CDEInventory = {
        id: 'existing-inv',
        reportId: 'test-report',
        cdes: [],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newCDE: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'New CDE',
        businessDefinition: 'New definition',
        criticalityRationale: 'High criticality',
        status: 'pending_approval' as CDEStatus
      };

      const newInventory: CDEInventory = {
        id: 'new-inv',
        reportId: 'test-report',
        cdes: [newCDE],
        version: 2,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await agent.reconcileWithExisting(newInventory, existingInventory);

      expect(result.addedCount).toBe(1);
      expect(result.items[0].status).toBe('added');
      expect(result.items[0].itemId).toBe('cde-1');
    });

    it('should identify removed CDEs', async () => {
      const existingCDE: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Existing CDE',
        businessDefinition: 'Existing definition',
        criticalityRationale: 'Was critical',
        status: 'approved' as CDEStatus
      };

      const existingInventory: CDEInventory = {
        id: 'existing-inv',
        reportId: 'test-report',
        cdes: [existingCDE],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newInventory: CDEInventory = {
        id: 'new-inv',
        reportId: 'test-report',
        cdes: [],
        version: 2,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await agent.reconcileWithExisting(newInventory, existingInventory);

      expect(result.removedCount).toBe(1);
      expect(result.items[0].status).toBe('removed');
    });

    it('should identify matched CDEs', async () => {
      const cde: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Same CDE',
        businessDefinition: 'Same definition',
        criticalityRationale: 'Same rationale',
        status: 'approved' as CDEStatus
      };

      const existingInventory: CDEInventory = {
        id: 'existing-inv',
        reportId: 'test-report',
        cdes: [cde],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newInventory: CDEInventory = {
        id: 'new-inv',
        reportId: 'test-report',
        cdes: [{ ...cde }],
        version: 2,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await agent.reconcileWithExisting(newInventory, existingInventory);

      expect(result.matchedCount).toBe(1);
      expect(result.items[0].status).toBe('matched');
    });

    it('should identify modified CDEs', async () => {
      const existingCDE: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Original Name',
        businessDefinition: 'Original definition',
        criticalityRationale: 'Original rationale',
        status: 'approved' as CDEStatus
      };

      const modifiedCDE: CDE = {
        id: 'cde-2',
        elementId: 'elem-1', // Same element ID
        name: 'Modified Name',
        businessDefinition: 'Modified definition',
        criticalityRationale: 'Modified rationale',
        status: 'pending_approval' as CDEStatus
      };

      const existingInventory: CDEInventory = {
        id: 'existing-inv',
        reportId: 'test-report',
        cdes: [existingCDE],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newInventory: CDEInventory = {
        id: 'new-inv',
        reportId: 'test-report',
        cdes: [modifiedCDE],
        version: 2,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await agent.reconcileWithExisting(newInventory, existingInventory);

      expect(result.modifiedCount).toBe(1);
      expect(result.items[0].status).toBe('modified');
      expect(result.items[0].differences).toBeDefined();
      expect(result.items[0].differences!.length).toBeGreaterThan(0);
    });
  });


  describe('suggestDataOwners', () => {
    it('should suggest owners for all CDEs', async () => {
      const cdes: CDE[] = [
        {
          id: 'cde-1',
          elementId: 'elem-1',
          name: 'Capital Ratio',
          businessDefinition: 'Regulatory capital ratio',
          criticalityRationale: 'High criticality',
          status: 'pending_approval' as CDEStatus
        },
        {
          id: 'cde-2',
          elementId: 'elem-2',
          name: 'Credit Exposure',
          businessDefinition: 'Total credit exposure',
          criticalityRationale: 'High criticality',
          status: 'pending_approval' as CDEStatus
        }
      ];

      const suggestions = await agent.suggestDataOwners(cdes);

      expect(suggestions.length).toBe(2);
      for (const suggestion of suggestions) {
        expect(suggestion.suggestedOwner).toBeDefined();
        expect(suggestion.suggestedOwnerEmail).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThan(0);
        expect(suggestion.rationale).toBeDefined();
      }
    });

    it('should infer domain from CDE characteristics', async () => {
      const capitalCDE: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Tier 1 Capital',
        businessDefinition: 'Regulatory tier 1 capital',
        criticalityRationale: 'High criticality',
        status: 'pending_approval' as CDEStatus
      };

      const creditCDE: CDE = {
        id: 'cde-2',
        elementId: 'elem-2',
        name: 'Credit Loss',
        businessDefinition: 'Expected credit loss',
        criticalityRationale: 'High criticality',
        status: 'pending_approval' as CDEStatus
      };

      const suggestions = await agent.suggestDataOwners([capitalCDE, creditCDE]);

      const capitalSuggestion = suggestions.find(s => s.cdeId === 'cde-1');
      const creditSuggestion = suggestions.find(s => s.cdeId === 'cde-2');

      expect(capitalSuggestion!.rationale).toContain('Capital');
      expect(creditSuggestion!.rationale).toContain('Credit');
    });
  });

  describe('validateOwnership', () => {
    it('should flag approved CDEs without owners', () => {
      const cdeWithoutOwner: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Test CDE',
        businessDefinition: 'Test',
        criticalityRationale: 'Test',
        status: 'approved' as CDEStatus
      };

      const inventory: CDEInventory = {
        id: 'inv-1',
        reportId: 'test-report',
        cdes: [cdeWithoutOwner],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const needingOwners = agent.validateOwnership(inventory);

      expect(needingOwners.length).toBe(1);
      expect(needingOwners[0].id).toBe('cde-1');
    });

    it('should not flag CDEs with owners', () => {
      const cdeWithOwner: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Test CDE',
        businessDefinition: 'Test',
        criticalityRationale: 'Test',
        dataOwner: 'John Doe',
        dataOwnerEmail: 'john.doe@example.com',
        status: 'approved' as CDEStatus
      };

      const inventory: CDEInventory = {
        id: 'inv-1',
        reportId: 'test-report',
        cdes: [cdeWithOwner],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const needingOwners = agent.validateOwnership(inventory);

      expect(needingOwners.length).toBe(0);
    });

    it('should not flag rejected CDEs', () => {
      const rejectedCDE: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Test CDE',
        businessDefinition: 'Test',
        criticalityRationale: 'Test',
        status: 'rejected' as CDEStatus
      };

      const inventory: CDEInventory = {
        id: 'inv-1',
        reportId: 'test-report',
        cdes: [rejectedCDE],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const needingOwners = agent.validateOwnership(inventory);

      expect(needingOwners.length).toBe(0);
    });
  });

  describe('workflow methods', () => {
    it('should submit inventory for review', async () => {
      const inventory: CDEInventory = {
        id: 'inv-1',
        reportId: 'test-report',
        cdes: [],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      repository.setCDEInventory('test-report', inventory);

      const submitted = await agent.submitForReview('test-report', 'submitter');

      expect(submitted.status).toBe('pending_review');
    });

    it('should approve inventory and update CDE statuses', async () => {
      const cde: CDE = {
        id: 'cde-1',
        elementId: 'elem-1',
        name: 'Test CDE',
        businessDefinition: 'Test',
        criticalityRationale: 'Test',
        dataOwner: 'Owner',
        status: 'pending_approval' as CDEStatus
      };

      const inventory: CDEInventory = {
        id: 'inv-1',
        reportId: 'test-report',
        cdes: [cde],
        version: 1,
        status: 'pending_review' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      repository.setCDEInventory('test-report', inventory);

      const approved = await agent.approveInventory('test-report', 'approver');

      expect(approved.status).toBe('approved');
      expect(approved.cdes[0].status).toBe('approved');
      expect(approved.cdes[0].approvedBy).toBe('approver');
      expect(approved.cdes[0].approvedAt).toBeDefined();
    });

    it('should create audit entries for actions', async () => {
      const element: DataElement = {
        id: 'elem-1',
        name: 'Test Element',
        regulatoryDefinition: 'Test',
        dataType: 'string',
        format: 'text',
        mandatory: true
      };

      const context: ScoringContext = {
        reportId: 'test-report',
        threshold: 0.5
      };

      await agent.scoreDataElements([element], context);

      const auditEntries = repository.getAuditEntries('CDEScore');
      expect(auditEntries.length).toBeGreaterThan(0);
      expect(auditEntries[0].actor).toBe('CDEIdentificationAgent');
    });
  });
});
