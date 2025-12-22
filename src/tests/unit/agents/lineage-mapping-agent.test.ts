/**
 * Unit tests for Lineage Mapping Agent
 * Requirements: 7.1, 7.2, 7.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LineageMappingAgent } from '../../../agents/lineage-mapping-agent.js';
import {
  DataSource,
  BusinessGlossary,
  LineageGraph,
  LineageNode,
  LineageEdge,
  ConnectionConfig
} from '../../../types/index.js';

describe('LineageMappingAgent', () => {
  let agent: LineageMappingAgent;

  beforeEach(() => {
    agent = new LineageMappingAgent();
  });

  describe('scanDataPipelines', () => {
    it('should scan data pipelines and create lineage graph', async () => {
      // Requirements: 7.1
      const dataSources: DataSource[] = [
        {
          id: 'source1',
          name: 'CustomerDB',
          type: 'database',
          connectionConfig: {
            host: 'localhost',
            port: 5432,
            database: 'customers',
            additionalParams: { reportId: 'test_report' }
          }
        }
      ];

      const result = await agent.scanDataPipelines(dataSources);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.reportId).toBe('test_report');
      expect(result.nodes).toBeInstanceOf(Array);
      expect(result.edges).toBeInstanceOf(Array);
      expect(result.version).toBe(1);
      expect(result.capturedAt).toBeInstanceOf(Date);
    });

    it('should create source nodes for each data source', async () => {
      const dataSources: DataSource[] = [
        {
          id: 'source1',
          name: 'TransactionDB',
          type: 'database',
          connectionConfig: { additionalParams: {} }
        },
        {
          id: 'source2',
          name: 'ReferenceData',
          type: 'file',
          connectionConfig: { additionalParams: {} }
        }
      ];

      const result = await agent.scanDataPipelines(dataSources);

      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      
      const sourceNodes = result.nodes.filter(node => node.type === 'source_table');
      expect(sourceNodes.length).toBeGreaterThanOrEqual(2);
      
      const transactionNode = sourceNodes.find(node => node.name === 'TransactionDB');
      expect(transactionNode).toBeDefined();
      expect(transactionNode?.system).toBe('database');
      
      const referenceNode = sourceNodes.find(node => node.name === 'ReferenceData');
      expect(referenceNode).toBeDefined();
      expect(referenceNode?.system).toBe('file');
    });

    it('should handle empty data sources array', async () => {
      const result = await agent.scanDataPipelines([]);

      expect(result).toBeDefined();
      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
    });
  });

  describe('linkToBusinessConcepts', () => {
    it('should enrich lineage with business terms', async () => {
      // Requirements: 7.2
      const graph: LineageGraph = {
        id: 'test-graph',
        reportId: 'test-report',
        nodes: [
          {
            id: 'node1',
            type: 'source_table',
            name: 'Customer Data',
            system: 'CRM',
            technicalDetails: {}
          },
          {
            id: 'node2',
            type: 'report_field',
            name: 'Total Assets',
            system: 'Reporting',
            technicalDetails: {}
          }
        ],
        edges: [],
        version: 1,
        capturedAt: new Date()
      };

      const glossary: BusinessGlossary = {
        id: 'test-glossary',
        terms: [
          {
            id: 'term1',
            term: 'Customer Data',
            definition: 'Information about bank customers',
            synonyms: ['Client Data', 'Customer Information'],
            relatedTerms: []
          },
          {
            id: 'term2',
            term: 'Total Assets',
            definition: 'Sum of all bank assets',
            synonyms: ['Asset Total'],
            relatedTerms: []
          }
        ],
        version: 1,
        lastUpdated: new Date()
      };

      const result = await agent.linkToBusinessConcepts(graph, glossary);

      expect(result.graph.nodes[0].businessTerm).toBe('Customer Data');
      expect(result.graph.nodes[1].businessTerm).toBe('Total Assets');
      expect(result.glossaryTermsLinked).toBe(2);
      expect(result.enrichedAt).toBeInstanceOf(Date);
    });

    it('should handle nodes without matching glossary terms', async () => {
      const graph: LineageGraph = {
        id: 'test-graph',
        reportId: 'test-report',
        nodes: [
          {
            id: 'node1',
            type: 'source_table',
            name: 'Unknown Data Source',
            system: 'Unknown',
            technicalDetails: {}
          }
        ],
        edges: [],
        version: 1,
        capturedAt: new Date()
      };

      const glossary: BusinessGlossary = {
        id: 'test-glossary',
        terms: [
          {
            id: 'term1',
            term: 'Customer Data',
            definition: 'Information about bank customers',
            synonyms: [],
            relatedTerms: []
          }
        ],
        version: 1,
        lastUpdated: new Date()
      };

      const result = await agent.linkToBusinessConcepts(graph, glossary);

      expect(result.graph.nodes[0].businessTerm).toBeUndefined();
      expect(result.glossaryTermsLinked).toBe(0);
    });

    it('should add policies and controls to enriched nodes', async () => {
      const graph: LineageGraph = {
        id: 'test-graph',
        reportId: 'test-report',
        nodes: [
          {
            id: 'node1',
            type: 'source_table',
            name: 'Customer Financial Data',
            system: 'Core Banking',
            technicalDetails: {}
          }
        ],
        edges: [],
        version: 1,
        capturedAt: new Date()
      };

      const glossary: BusinessGlossary = {
        id: 'test-glossary',
        terms: [
          {
            id: 'term1',
            term: 'Customer Financial Data',
            definition: 'Financial information about customers',
            synonyms: [],
            relatedTerms: []
          }
        ],
        version: 1,
        lastUpdated: new Date()
      };

      const result = await agent.linkToBusinessConcepts(graph, glossary);

      const enrichedNode = result.graph.nodes[0];
      expect(enrichedNode.businessTerm).toBe('Customer Financial Data');
      expect(enrichedNode.policies).toBeDefined();
      expect(enrichedNode.controls).toBeDefined();
      expect(enrichedNode.policies?.length).toBeGreaterThan(0);
      expect(enrichedNode.controls?.length).toBeGreaterThan(0);
    });
  });

  describe('importFromLineageTool', () => {
    it('should import lineage from Apache Atlas', async () => {
      // Requirements: 7.3
      const connectionConfig: ConnectionConfig = {
        host: 'atlas.example.com',
        port: 21000,
        credentials: 'test-credentials'
      };

      const result = await agent.importFromLineageTool('apache_atlas', connectionConfig);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.reportId).toBe('atlas_import');
      expect(result.nodes).toBeInstanceOf(Array);
      expect(result.edges).toBeInstanceOf(Array);
      expect(result.version).toBe(1);
    });

    it('should import lineage from DataHub', async () => {
      const connectionConfig: ConnectionConfig = {
        host: 'datahub.example.com',
        credentials: 'test-token'
      };

      const result = await agent.importFromLineageTool('datahub', connectionConfig);

      expect(result.reportId).toBe('datahub_import');
    });

    it('should import lineage from Collibra', async () => {
      const connectionConfig: ConnectionConfig = {
        host: 'collibra.example.com',
        credentials: 'test-credentials'
      };

      const result = await agent.importFromLineageTool('collibra', connectionConfig);

      expect(result.reportId).toBe('collibra_import');
    });

    it('should throw error for unsupported tool type', async () => {
      const connectionConfig: ConnectionConfig = {
        host: 'unknown.example.com'
      };

      await expect(
        agent.importFromLineageTool('unsupported_tool', connectionConfig)
      ).rejects.toThrow('Unsupported lineage tool type: unsupported_tool');
    });

    it('should validate connection configuration', async () => {
      // Test Apache Atlas validation
      await expect(
        agent.importFromLineageTool('apache_atlas', {})
      ).rejects.toThrow('Apache Atlas requires host and port configuration');

      // Test DataHub validation
      await expect(
        agent.importFromLineageTool('datahub', {})
      ).rejects.toThrow('DataHub requires host configuration');

      // Test Collibra validation
      await expect(
        agent.importFromLineageTool('collibra', { host: 'test.com' })
      ).rejects.toThrow('Collibra requires host and credentials configuration');
    });
  });

  describe('analyzeChangeImpact', () => {
    it('should analyze impact of source system change', async () => {
      // Requirements: 7.5
      const changedSource = 'CustomerDB';

      const result = await agent.analyzeChangeImpact(changedSource);

      expect(result.changedSource).toBe(changedSource);
      expect(result.impactedCDEs).toBeInstanceOf(Array);
      expect(result.impactedReports).toBeInstanceOf(Array);
      expect(result.impactedNodes).toBeInstanceOf(Array);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('should identify downstream nodes affected by change', async () => {
      const changedSource = 'TransactionSystem';

      const result = await agent.analyzeChangeImpact(changedSource);

      expect(result.impactedNodes.length).toBeGreaterThan(0);
      
      // Check that impacted nodes follow expected naming pattern
      result.impactedNodes.forEach(nodeId => {
        expect(nodeId).toContain(changedSource);
      });
    });

    it('should extract CDEs from impacted nodes', async () => {
      const changedSource = 'CriticalDataSource';

      const result = await agent.analyzeChangeImpact(changedSource);

      // Should have some impacted nodes
      expect(result.impactedNodes.length).toBeGreaterThan(0);
      
      // CDEs should be extracted if any critical nodes are impacted
      expect(result.impactedCDEs).toBeInstanceOf(Array);
    });

    it('should extract reports from impacted nodes', async () => {
      const changedSource = 'ReportingSource';

      const result = await agent.analyzeChangeImpact(changedSource);

      expect(result.impactedReports).toBeInstanceOf(Array);
    });
  });

  describe('generateLineageDiagram', () => {
    it('should generate Mermaid diagram for CDE', async () => {
      // Requirements: 7.4
      const cdeId = 'CDE_001';

      const result = await agent.generateLineageDiagram(cdeId);

      expect(result.cdeId).toBe(cdeId);
      expect(result.format).toBe('mermaid');
      expect(result.content).toContain('graph TD');
      expect(result.content).toContain(cdeId);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should include styling for CDE node', async () => {
      const cdeId = 'CDE_RISK_ASSETS';

      const result = await agent.generateLineageDiagram(cdeId);

      expect(result.content).toContain(`style ${cdeId}`);
      expect(result.content).toContain('fill:#f9f');
    });
  });

  describe('generateLineageReport', () => {
    it('should generate comprehensive lineage report', async () => {
      // Requirements: 7.4
      const reportId = 'REGULATORY_REPORT_001';

      const result = await agent.generateLineageReport(reportId);

      expect(result.reportId).toBe(reportId);
      expect(result.format).toBe('markdown');
      expect(result.content).toContain('# Data Lineage Report');
      expect(result.content).toContain(reportId);
      expect(result.content).toContain('## Executive Summary');
      expect(result.content).toContain('## Source Systems');
      expect(result.content).toContain('## Critical Data Elements');
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should include BCBS 239 compliance mapping', async () => {
      const reportId = 'BASEL_REPORT';

      const result = await agent.generateLineageReport(reportId);

      expect(result.content).toContain('BCBS 239');
      expect(result.content).toContain('Principle 11');
      expect(result.content).toContain('Principle 14');
    });

    it('should include Mermaid diagram in report', async () => {
      const reportId = 'TEST_REPORT';

      const result = await agent.generateLineageReport(reportId);

      expect(result.content).toContain('```mermaid');
      expect(result.content).toContain('graph TD');
    });
  });
});