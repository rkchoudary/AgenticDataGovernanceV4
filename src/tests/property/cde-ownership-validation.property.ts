/**
 * **Feature: agentic-data-governance, Property 10: CDE Ownership Validation**
 * 
 * For any CDE in the inventory with status 'approved', the dataOwner field must be 
 * non-null and non-empty. CDEs without owners must have status 'pending_approval' 
 * or be flagged for ownership assignment.
 * 
 * **Validates: Requirements 4.5**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { CDEIdentificationAgent } from '../../agents/cde-identification-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { CDE, CDEInventory, CDEStatus, ArtifactStatus } from '../../types/index.js';
import { 
  cdeGenerator, 
  cdeInventoryGenerator,
  approvedCDEGenerator,
  cdeWithStatusGenerator
} from '../generators/index.js';
import { nonEmptyStringGenerator, emailGenerator } from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 10: CDE Ownership Validation', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: CDEIdentificationAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new CDEIdentificationAgent(repository);
  });

  it('should flag CDEs without owners as needing ownership assignment', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cdeGenerator(), { minLength: 1, maxLength: 10 }),
        fc.uuid(),
        async (cdes, reportId) => {
          // Create inventory with the CDEs
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId,
            cdes,
            version: 1,
            status: 'draft' as ArtifactStatus,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Validate ownership
          const cdesNeedingOwners = agent.validateOwnership(inventory);

          // Property: CDEs without owners should be flagged
          const cdesWithoutOwners = cdes.filter(c => !c.dataOwner && c.status !== 'rejected');
          
          // All CDEs without owners (except rejected) should be in the flagged list
          for (const cde of cdesWithoutOwners) {
            const isFlagged = cdesNeedingOwners.some(c => c.id === cde.id);
            expect(isFlagged).toBe(true);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should not flag CDEs with owners', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            elementId: fc.uuid(),
            name: nonEmptyStringGenerator(),
            businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
            criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
            dataOwner: nonEmptyStringGenerator(), // Always has owner
            dataOwnerEmail: emailGenerator(),
            status: fc.constantFrom('pending_approval', 'approved') as fc.Arbitrary<CDEStatus>,
            approvedBy: fc.option(nonEmptyStringGenerator()),
            approvedAt: fc.option(fc.date())
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.uuid(),
        async (cdes, reportId) => {
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId,
            cdes,
            version: 1,
            status: 'draft' as ArtifactStatus,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const cdesNeedingOwners = agent.validateOwnership(inventory);

          // Property: CDEs with owners should not be flagged
          expect(cdesNeedingOwners.length).toBe(0);

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should flag approved CDEs without owners', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            elementId: fc.uuid(),
            name: nonEmptyStringGenerator(),
            businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
            criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
            dataOwner: fc.constant(undefined), // No owner
            dataOwnerEmail: fc.constant(undefined),
            status: fc.constant('approved' as CDEStatus),
            approvedBy: nonEmptyStringGenerator(),
            approvedAt: fc.date()
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.uuid(),
        async (cdes, reportId) => {
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId,
            cdes,
            version: 1,
            status: 'approved' as ArtifactStatus,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const cdesNeedingOwners = agent.validateOwnership(inventory);

          // Property: All approved CDEs without owners should be flagged
          expect(cdesNeedingOwners.length).toBe(cdes.length);
          for (const cde of cdes) {
            const isFlagged = cdesNeedingOwners.some(c => c.id === cde.id);
            expect(isFlagged).toBe(true);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not flag rejected CDEs regardless of ownership', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            elementId: fc.uuid(),
            name: nonEmptyStringGenerator(),
            businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
            criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
            dataOwner: fc.constant(undefined), // No owner
            dataOwnerEmail: fc.constant(undefined),
            status: fc.constant('rejected' as CDEStatus),
            approvedBy: fc.option(nonEmptyStringGenerator()),
            approvedAt: fc.option(fc.date())
          }),
          { minLength: 1, maxLength: 10 }
        ),
        fc.uuid(),
        async (cdes, reportId) => {
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId,
            cdes,
            version: 1,
            status: 'draft' as ArtifactStatus,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const cdesNeedingOwners = agent.validateOwnership(inventory);

          // Property: Rejected CDEs should not be flagged even without owners
          expect(cdesNeedingOwners.length).toBe(0);

          return true;
        }
      ),
      propertyConfig
    );
  });


  it('should correctly assign owner to CDE', async () => {
    await fc.assert(
      fc.asyncProperty(
        cdeWithStatusGenerator('pending_approval'),
        fc.uuid(),
        nonEmptyStringGenerator(),
        emailGenerator(),
        nonEmptyStringGenerator(),
        async (cde, reportId, ownerName, ownerEmail, assignedBy) => {
          // Create inventory with the CDE
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId,
            cdes: [cde],
            version: 1,
            status: 'draft' as ArtifactStatus,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Store in repository
          repository.setCDEInventory(reportId, inventory);

          // Assign owner
          const updatedCDE = await agent.assignOwner(
            reportId,
            cde.id,
            ownerName,
            ownerEmail,
            assignedBy
          );

          // Property: Owner should be assigned correctly
          expect(updatedCDE).toBeDefined();
          expect(updatedCDE!.dataOwner).toBe(ownerName);
          expect(updatedCDE!.dataOwnerEmail).toBe(ownerEmail);

          // Verify in repository
          const storedInventory = repository.getCDEInventory(reportId);
          const storedCDE = storedInventory?.cdes.find(c => c.id === cde.id);
          expect(storedCDE?.dataOwner).toBe(ownerName);
          expect(storedCDE?.dataOwnerEmail).toBe(ownerEmail);

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should generate owner suggestions for all CDEs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cdeGenerator(), { minLength: 1, maxLength: 10 }),
        async (cdes) => {
          const suggestions = await agent.suggestDataOwners(cdes);

          // Property: Should generate one suggestion per CDE
          expect(suggestions.length).toBe(cdes.length);

          // Property: Each suggestion should have required fields
          for (const suggestion of suggestions) {
            expect(suggestion.cdeId).toBeDefined();
            expect(suggestion.suggestedOwner).toBeDefined();
            expect(suggestion.suggestedOwner.length).toBeGreaterThan(0);
            expect(suggestion.suggestedOwnerEmail).toBeDefined();
            expect(suggestion.suggestedOwnerEmail.length).toBeGreaterThan(0);
            expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
            expect(suggestion.confidence).toBeLessThanOrEqual(1);
            expect(suggestion.rationale).toBeDefined();
            expect(suggestion.rationale.length).toBeGreaterThan(0);
          }

          // Property: Each CDE should have a corresponding suggestion
          const suggestionCdeIds = new Set(suggestions.map(s => s.cdeId));
          for (const cde of cdes) {
            expect(suggestionCdeIds.has(cde.id)).toBe(true);
          }

          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should maintain ownership invariant after approval', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            elementId: fc.uuid(),
            name: nonEmptyStringGenerator(),
            businessDefinition: fc.string({ minLength: 0, maxLength: 200 }),
            criticalityRationale: fc.string({ minLength: 10, maxLength: 200 }),
            dataOwner: nonEmptyStringGenerator(), // Has owner
            dataOwnerEmail: emailGenerator(),
            status: fc.constant('pending_approval' as CDEStatus),
            approvedBy: fc.constant(undefined),
            approvedAt: fc.constant(undefined)
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.uuid(),
        nonEmptyStringGenerator(),
        async (cdes, reportId, approver) => {
          // Create inventory with CDEs that have owners
          const inventory: CDEInventory = {
            id: 'test-inventory',
            reportId,
            cdes,
            version: 1,
            status: 'draft' as ArtifactStatus,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          repository.setCDEInventory(reportId, inventory);

          // Submit for review
          await agent.submitForReview(reportId, 'submitter');

          // Approve
          const approvedInventory = await agent.approveInventory(reportId, approver);

          // Property: All approved CDEs should still have owners
          for (const cde of approvedInventory.cdes) {
            if (cde.status === 'approved') {
              expect(cde.dataOwner).toBeDefined();
              expect(cde.dataOwner!.length).toBeGreaterThan(0);
            }
          }

          // Validate ownership should return empty for properly owned CDEs
          const cdesNeedingOwners = agent.validateOwnership(approvedInventory);
          expect(cdesNeedingOwners.length).toBe(0);

          return true;
        }
      ),
      propertyConfig
    );
  });
});
