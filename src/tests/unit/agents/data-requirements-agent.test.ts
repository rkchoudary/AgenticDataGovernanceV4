/**
 * Unit tests for Data Requirements Agent
 * 
 * Tests template parsing, source mapping, and gap identification
 * Requirements: 3.1, 3.2, 3.3
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DataRequirementsAgent } from '../../../agents/data-requirements-agent.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import {
  DataElement,
  DataCatalog,
  DataMapping,
  RequirementsDocument,
  ArtifactStatus
} from '../../../types/index.js';

describe('DataRequirementsAgent', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: DataRequirementsAgent;

  // Sample data catalog for testing
  const sampleCatalog: DataCatalog = {
    id: 'catalog-001',
    systems: [
      {
        id: 'sys-001',
        name: 'CoreBanking',
        tables: [
          {
            id: 'tbl-001',
            name: 'Accounts',
            fields: [
              {
                id: 'fld-001',
                name: 'AccountBalance',
                dataType: 'decimal',
                description: 'Current account balance',
                businessTerm: 'Account Balance'
              },
              {
                id: 'fld-002',
                name: 'AccountNumber',
                dataType: 'string',
                description: 'Unique account identifier',
                businessTerm: 'Account Number'
              },
              {
                id: 'fld-003',
                name: 'OpenDate',
                dataType: 'date',
                description: 'Date account was opened',
                businessTerm: 'Account Open Date'
              }
            ]
          }
        ]
      },
      {
        id: 'sys-002',
        name: 'RiskSystem',
        tables: [
          {
            id: 'tbl-002',
            name: 'Exposures',
            fields: [
              {
                id: 'fld-004',
                name: 'ExposureAmount',
                dataType: 'decimal',
                description: 'Total exposure amount',
                businessTerm: 'Exposure Amount'
              }
            ]
          }
        ]
      }
    ],
    lastUpdated: new Date()
  };

  // Sample data elements for testing
  const sampleElements: DataElement[] = [
    {
      id: 'elem-001',
      name: 'AccountBalance',
      regulatoryDefinition: 'The current balance of the account',
      dataType: 'decimal',
      format: '#,##0.00',
      mandatory: true
    },
    {
      id: 'elem-002',
      name: 'UnmatchedField',
      regulatoryDefinition: 'A field with no source',
      dataType: 'string',
      format: 'text',
      mandatory: true
    },
    {
      id: 'elem-003',
      name: 'CalculatedField',
      regulatoryDefinition: 'A calculated field',
      dataType: 'decimal',
      format: '#,##0.00',
      calculationLogic: 'SUM(AccountBalance)',
      mandatory: false
    }
  ];

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new DataRequirementsAgent(repository, {
      minMappingConfidence: 0.7,
      semanticSimilarityThreshold: 0.6
    });
  });

  describe('parseRegulatoryTemplate', () => {
    it('should parse template and return data elements', async () => {
      // Execute
      const elements = await agent.parseRegulatoryTemplate('test-template-url');

      // Verify - returns array (may be empty for simulated template)
      expect(Array.isArray(elements)).toBe(true);
    });

    it('should create audit entry for parsing operation', async () => {
      // Execute
      await agent.parseRegulatoryTemplate('test-template-url');

      // Verify audit entry
      const auditEntries = repository.getAuditEntries('RegulatoryTemplate');
      const parseEntry = auditEntries.find(e => e.action === 'parse_regulatory_template');
      expect(parseEntry).toBeDefined();
      expect(parseEntry?.actor).toBe('DataRequirementsAgent');
      expect(parseEntry?.actorType).toBe('agent');
    });
  });

  describe('mapToInternalSources', () => {
    it('should map elements to catalog fields with high confidence for exact matches', async () => {
      // Execute
      const mappings = await agent.mapToInternalSources(sampleElements, sampleCatalog);

      // Verify - AccountBalance should have high confidence match
      const accountBalanceMapping = mappings.find(m => m.elementId === 'elem-001');
      expect(accountBalanceMapping).toBeDefined();
      expect(accountBalanceMapping?.confidence).toBeGreaterThan(0.5);
      expect(accountBalanceMapping?.sourceField).toBe('AccountBalance');
    });

    it('should return mappings with source system, table, and field', async () => {
      // Execute
      const mappings = await agent.mapToInternalSources(sampleElements, sampleCatalog);

      // Verify structure
      for (const mapping of mappings) {
        expect(mapping.elementId).toBeDefined();
        expect(mapping.sourceSystem).toBeDefined();
        expect(mapping.sourceTable).toBeDefined();
        expect(mapping.sourceField).toBeDefined();
        expect(typeof mapping.confidence).toBe('number');
        expect(mapping.confidence).toBeGreaterThanOrEqual(0);
        expect(mapping.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should create audit entry for mapping operation', async () => {
      // Execute
      await agent.mapToInternalSources(sampleElements, sampleCatalog);

      // Verify audit entry
      const auditEntries = repository.getAuditEntries('DataMapping');
      const mapEntry = auditEntries.find(e => e.action === 'map_to_internal_sources');
      expect(mapEntry).toBeDefined();
      expect(mapEntry?.actor).toBe('DataRequirementsAgent');
    });

    it('should handle empty element list', async () => {
      // Execute
      const mappings = await agent.mapToInternalSources([], sampleCatalog);

      // Verify
      expect(mappings).toHaveLength(0);
    });

    it('should handle empty catalog', async () => {
      const emptyCatalog: DataCatalog = {
        id: 'empty-catalog',
        systems: [],
        lastUpdated: new Date()
      };

      // Execute
      const mappings = await agent.mapToInternalSources(sampleElements, emptyCatalog);

      // Verify - no mappings possible
      expect(mappings).toHaveLength(0);
    });
  });

  describe('identifyDataGaps', () => {
    it('should identify low confidence mappings as gaps', async () => {
      // Create mappings with varying confidence
      const mappings: DataMapping[] = [
        {
          elementId: 'elem-001',
          sourceSystem: 'CoreBanking',
          sourceTable: 'Accounts',
          sourceField: 'AccountBalance',
          confidence: 0.9 // High confidence
        },
        {
          elementId: 'elem-002',
          sourceSystem: 'CoreBanking',
          sourceTable: 'Accounts',
          sourceField: 'SomeField',
          confidence: 0.3 // Low confidence
        }
      ];

      // Execute
      const gaps = await agent.identifyDataGaps(mappings);

      // Verify - low confidence mapping should be flagged
      const lowConfidenceGap = gaps.find(g => g.elementId === 'elem-002');
      expect(lowConfidenceGap).toBeDefined();
      expect(lowConfidenceGap?.reason).toBe('partial_source');
    });

    it('should create audit entry for gap identification', async () => {
      const mappings: DataMapping[] = [
        {
          elementId: 'elem-001',
          sourceSystem: 'CoreBanking',
          sourceTable: 'Accounts',
          sourceField: 'AccountBalance',
          confidence: 0.5
        }
      ];

      // Execute
      await agent.identifyDataGaps(mappings);

      // Verify audit entry
      const auditEntries = repository.getAuditEntries('DataGap');
      const gapEntry = auditEntries.find(e => e.action === 'identify_data_gaps');
      expect(gapEntry).toBeDefined();
    });
  });

  describe('identifyDataGapsForElements', () => {
    it('should flag elements with no mapping as no_source gaps', async () => {
      const elements: DataElement[] = [
        {
          id: 'elem-unmapped',
          name: 'UnmappedField',
          regulatoryDefinition: 'No source available',
          dataType: 'string',
          format: 'text',
          mandatory: true
        }
      ];

      // Execute with empty mappings
      const gaps = await agent.identifyDataGapsForElements(elements, []);

      // Verify
      expect(gaps).toHaveLength(1);
      expect(gaps[0].reason).toBe('no_source');
      expect(gaps[0].elementName).toBe('UnmappedField');
    });

    it('should flag elements with calculation logic as calculation_needed', async () => {
      const elements: DataElement[] = [
        {
          id: 'elem-calc',
          name: 'CalculatedField',
          regulatoryDefinition: 'Calculated value',
          dataType: 'decimal',
          format: '#,##0.00',
          calculationLogic: 'SUM(field1, field2)',
          mandatory: true
        }
      ];

      // Execute with empty mappings
      const gaps = await agent.identifyDataGapsForElements(elements, []);

      // Verify
      expect(gaps).toHaveLength(1);
      expect(gaps[0].reason).toBe('calculation_needed');
    });

    it('should provide suggested resolution for all gaps', async () => {
      const elements: DataElement[] = [
        {
          id: 'elem-001',
          name: 'Field1',
          regulatoryDefinition: 'Test field',
          dataType: 'string',
          format: 'text',
          mandatory: true
        }
      ];

      // Execute
      const gaps = await agent.identifyDataGapsForElements(elements, []);

      // Verify
      for (const gap of gaps) {
        expect(gap.suggestedResolution).toBeDefined();
        expect(gap.suggestedResolution!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('generateRequirementsDocument', () => {
    it('should create new document when none exists', async () => {
      // Execute
      const doc = await agent.generateRequirementsDocument('report-001');

      // Verify
      expect(doc.id).toBeDefined();
      expect(doc.reportId).toBe('report-001');
      expect(doc.version).toBe(1);
      expect(doc.status).toBe('draft');
    });

    it('should increment version when document exists', async () => {
      // Create initial document
      const existingDoc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [],
        mappings: [],
        gaps: [],
        version: 5,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setRequirementsDocument('report-001', existingDoc);

      // Execute
      const doc = await agent.generateRequirementsDocument('report-001');

      // Verify
      expect(doc.version).toBe(6);
      expect(doc.id).toBe('doc-001'); // Same ID
    });

    it('should store document in repository', async () => {
      // Execute
      await agent.generateRequirementsDocument('report-001');

      // Verify
      const storedDoc = repository.getRequirementsDocument('report-001');
      expect(storedDoc).toBeDefined();
      expect(storedDoc?.reportId).toBe('report-001');
    });
  });

  describe('ingestExistingDocument', () => {
    it('should reconcile with existing document', async () => {
      // Create existing document
      const existingDoc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [sampleElements[0]],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setRequirementsDocument('report-001', existingDoc);

      // Create incoming document with additional element
      const incomingDoc: RequirementsDocument = {
        id: 'doc-002',
        reportId: 'report-001',
        elements: [sampleElements[0], sampleElements[1]],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Execute
      const result = await agent.ingestExistingDocument(incomingDoc);

      // Verify
      expect(result.matchedCount).toBeGreaterThanOrEqual(1);
      expect(result.addedCount).toBeGreaterThanOrEqual(1);
    });

    it('should mark all items as added when no existing document', async () => {
      const incomingDoc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-new',
        elements: sampleElements,
        mappings: [],
        gaps: [],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Execute
      const result = await agent.ingestExistingDocument(incomingDoc);

      // Verify
      expect(result.addedCount).toBe(sampleElements.length);
      expect(result.matchedCount).toBe(0);
      expect(result.removedCount).toBe(0);
    });

    it('should create audit entry for ingestion', async () => {
      const incomingDoc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Execute
      await agent.ingestExistingDocument(incomingDoc);

      // Verify
      const auditEntries = repository.getAuditEntries('RequirementsDocument');
      const ingestEntry = auditEntries.find(e => e.action === 'ingest_existing_document');
      expect(ingestEntry).toBeDefined();
    });
  });

  describe('submitForReview', () => {
    it('should transition document from draft to pending_review', async () => {
      // Create draft document
      const doc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setRequirementsDocument('report-001', doc);

      // Execute
      const result = await agent.submitForReview('report-001', 'submitter@example.com');

      // Verify
      expect(result.status).toBe('pending_review');
    });

    it('should throw error when document does not exist', async () => {
      // Execute & Verify
      await expect(
        agent.submitForReview('nonexistent-report', 'submitter')
      ).rejects.toThrow('No requirements document exists');
    });

    it('should throw error when document is not in draft status', async () => {
      // Create approved document
      const doc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'approved' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setRequirementsDocument('report-001', doc);

      // Execute & Verify
      await expect(
        agent.submitForReview('report-001', 'submitter')
      ).rejects.toThrow("Cannot submit document with status 'approved' for review");
    });
  });

  describe('approveDocument', () => {
    it('should transition document from pending_review to approved', async () => {
      // Create pending_review document
      const doc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'pending_review' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setRequirementsDocument('report-001', doc);

      // Execute
      const result = await agent.approveDocument('report-001', 'approver@example.com');

      // Verify
      expect(result.status).toBe('approved');
      expect(result.validatedBy).toBe('approver@example.com');
      expect(result.validatedAt).toBeDefined();
    });

    it('should throw error when document is not in pending_review status', async () => {
      // Create draft document
      const doc: RequirementsDocument = {
        id: 'doc-001',
        reportId: 'report-001',
        elements: [],
        mappings: [],
        gaps: [],
        version: 1,
        status: 'draft' as ArtifactStatus,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      repository.setRequirementsDocument('report-001', doc);

      // Execute & Verify
      await expect(
        agent.approveDocument('report-001', 'approver')
      ).rejects.toThrow("Cannot approve document with status 'draft'");
    });
  });
});
