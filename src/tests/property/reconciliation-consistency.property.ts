/**
 * **Feature: agentic-data-governance, Property 7: Reconciliation Consistency**
 * 
 * For any existing artifact (Requirements Document, CDE list, DQ rules, Control framework) 
 * ingested into the system, the reconciliation output must correctly categorize each item 
 * as 'matched', 'added', 'removed', or 'modified' based on comparison with newly generated artifacts.
 * 
 * **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { DataRequirementsAgent } from '../../agents/data-requirements-agent.js';
import { 
  RequirementsDocument, 
  DataElement,
  ArtifactStatus,
  DataType,
  ReconciliationResult
} from '../../types/index.js';
import {
  dataElementGenerator,
  nonEmptyStringGenerator,
  dateGenerator
} from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 7: Reconciliation Consistency', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: DataRequirementsAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new DataRequirementsAgent(repository);
  });

  /**
   * Generator for RequirementsDocument
   */
  const requirementsDocumentGenerator = (): fc.Arbitrary<RequirementsDocument> =>
    fc.record({
      id: fc.uuid(),
      reportId: fc.uuid(),
      elements: fc.array(dataElementGenerator(), { minLength: 0, maxLength: 10 }),
      mappings: fc.constant([]),
      gaps: fc.constant([]),
      version: fc.integer({ min: 1, max: 100 }),
      status: fc.constantFrom('draft', 'pending_review', 'approved', 'rejected') as fc.Arbitrary<ArtifactStatus>,
      createdAt: dateGenerator(),
      updatedAt: dateGenerator(),
      validatedBy: fc.option(nonEmptyStringGenerator()),
      validatedAt: fc.option(dateGenerator())
    });

  /**
   * Helper to verify reconciliation counts are consistent
   */
  const verifyReconciliationCounts = (result: ReconciliationResult): boolean => {
    const itemsByStatus = {
      matched: result.items.filter(i => i.status === 'matched').length,
      added: result.items.filter(i => i.status === 'added').length,
      removed: result.items.filter(i => i.status === 'removed').length,
      modified: result.items.filter(i => i.status === 'modified').length
    };

    return (
      itemsByStatus.matched === result.matchedCount &&
      itemsByStatus.added === result.addedCount &&
      itemsByStatus.removed === result.removedCount &&
      itemsByStatus.modified === result.modifiedCount
    );
  };

  it('should correctly count matched, added, removed, and modified items', async () => {
    await fc.assert(
      fc.asyncProperty(
        requirementsDocumentGenerator(),
        requirementsDocumentGenerator(),
        async (existingDoc, incomingDoc) => {
          // Use same reportId for both documents
          const reportId = existingDoc.reportId;
          incomingDoc.reportId = reportId;
          
          // Store existing document
          repository.setRequirementsDocument(reportId, existingDoc);
          
          // Ingest incoming document
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Counts must match actual items
          expect(verifyReconciliationCounts(result)).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should categorize all items in exactly one category', async () => {
    await fc.assert(
      fc.asyncProperty(
        requirementsDocumentGenerator(),
        requirementsDocumentGenerator(),
        async (existingDoc, incomingDoc) => {
          const reportId = existingDoc.reportId;
          incomingDoc.reportId = reportId;
          
          repository.setRequirementsDocument(reportId, existingDoc);
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Each item has exactly one valid status
          const validStatuses = ['matched', 'added', 'removed', 'modified'];
          for (const item of result.items) {
            expect(validStatuses).toContain(item.status);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should mark identical elements as matched', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 1, maxLength: 5 }),
        fc.uuid(),
        async (elements, reportId) => {
          // Create two identical documents
          const doc1: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [...elements],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const doc2: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [...elements], // Same elements
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setRequirementsDocument(reportId, doc1);
          const result = await agent.ingestExistingDocument(doc2);
          
          // Property: All elements should be matched (same IDs)
          expect(result.matchedCount).toBe(elements.length);
          expect(result.addedCount).toBe(0);
          expect(result.removedCount).toBe(0);
          expect(result.modifiedCount).toBe(0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should mark new elements as added when no existing document', async () => {
    await fc.assert(
      fc.asyncProperty(
        requirementsDocumentGenerator(),
        async (incomingDoc) => {
          // Don't store any existing document
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: All elements should be added
          expect(result.addedCount).toBe(incomingDoc.elements.length);
          expect(result.matchedCount).toBe(0);
          expect(result.removedCount).toBe(0);
          expect(result.modifiedCount).toBe(0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should mark elements not in incoming as removed', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(dataElementGenerator(), { minLength: 2, maxLength: 5 }),
        fc.uuid(),
        async (elements, reportId) => {
          // Create existing document with all elements
          const existingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [...elements],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          // Create incoming document with only first element
          const incomingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [elements[0]],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setRequirementsDocument(reportId, existingDoc);
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Elements not in incoming should be removed
          expect(result.removedCount).toBe(elements.length - 1);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should mark elements with changed properties as modified', async () => {
    await fc.assert(
      fc.asyncProperty(
        dataElementGenerator(),
        fc.uuid(),
        nonEmptyStringGenerator(),
        async (element, reportId, newDefinition) => {
          // Create existing document
          const existingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [element],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          // Create incoming document with modified element (same ID, different definition)
          const modifiedElement: DataElement = {
            ...element,
            regulatoryDefinition: newDefinition !== element.regulatoryDefinition 
              ? newDefinition 
              : newDefinition + '_modified'
          };
          
          const incomingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [modifiedElement],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setRequirementsDocument(reportId, existingDoc);
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Modified element should be detected
          expect(result.modifiedCount).toBe(1);
          
          // Verify differences are recorded
          const modifiedItem = result.items.find(i => i.status === 'modified');
          expect(modifiedItem).toBeDefined();
          expect(modifiedItem!.differences).toBeDefined();
          expect(modifiedItem!.differences!.length).toBeGreaterThan(0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should include both existing and new values for modified items', async () => {
    await fc.assert(
      fc.asyncProperty(
        dataElementGenerator(),
        fc.uuid(),
        fc.constantFrom('string', 'number', 'date', 'boolean', 'decimal', 'integer') as fc.Arbitrary<DataType>,
        async (element, reportId, newDataType) => {
          // Ensure the data type is actually different
          const actualNewType = newDataType !== element.dataType ? newDataType : 'string';
          
          const existingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [element],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const modifiedElement: DataElement = {
            ...element,
            dataType: actualNewType
          };
          
          const incomingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [modifiedElement],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setRequirementsDocument(reportId, existingDoc);
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Modified items should have both existing and new values
          const modifiedItems = result.items.filter(i => i.status === 'modified');
          for (const item of modifiedItems) {
            expect(item.existingValue).toBeDefined();
            expect(item.newValue).toBeDefined();
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should match elements by name when IDs differ', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyStringGenerator(),
        fc.uuid(),
        async (elementName, reportId) => {
          // Create element with specific name
          const element1: DataElement = {
            id: crypto.randomUUID(),
            name: elementName,
            regulatoryDefinition: 'Definition 1',
            dataType: 'string',
            format: 'text',
            mandatory: true
          };
          
          // Create element with same name but different ID
          const element2: DataElement = {
            id: crypto.randomUUID(), // Different ID
            name: elementName, // Same name
            regulatoryDefinition: 'Definition 1', // Same definition
            dataType: 'string',
            format: 'text',
            mandatory: true
          };
          
          const existingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [element1],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          const incomingDoc: RequirementsDocument = {
            id: crypto.randomUUID(),
            reportId,
            elements: [element2],
            mappings: [],
            gaps: [],
            version: 1,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          repository.setRequirementsDocument(reportId, existingDoc);
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Elements with same name should be matched, not added+removed
          expect(result.matchedCount).toBe(1);
          expect(result.addedCount).toBe(0);
          expect(result.removedCount).toBe(0);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve total item count across categories', async () => {
    await fc.assert(
      fc.asyncProperty(
        requirementsDocumentGenerator(),
        requirementsDocumentGenerator(),
        async (existingDoc, incomingDoc) => {
          const reportId = existingDoc.reportId;
          incomingDoc.reportId = reportId;
          
          repository.setRequirementsDocument(reportId, existingDoc);
          const result = await agent.ingestExistingDocument(incomingDoc);
          
          // Property: Total items should equal sum of all categories
          const totalFromCounts = 
            result.matchedCount + 
            result.addedCount + 
            result.removedCount + 
            result.modifiedCount;
          
          expect(result.items.length).toBe(totalFromCounts);
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
