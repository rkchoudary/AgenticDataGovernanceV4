/**
 * Lineage test data generators
 */

import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  LineageGraph,
  LineageNode,
  LineageEdge,
  LineageNodeType,
  BusinessGlossary,
  GlossaryTerm,
  DataSource,
  ConnectionConfig,
  EnrichedLineage,
  ImpactAnalysis,
  LineageDiagram,
  LineageReport
} from '../../types/index.js';

/**
 * Generate a lineage node
 */
export const lineageNodeGenerator = (): fc.Arbitrary<LineageNode> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    type: fc.constantFrom<LineageNodeType>('source_table', 'transformation', 'staging_table', 'report_field'),
    name: fc.string({ minLength: 3, maxLength: 50 }),
    system: fc.constantFrom('Core Banking', 'Risk System', 'ETL', 'Regulatory Reporting'),
    technicalDetails: fc.dictionary(fc.string({ minLength: 1, maxLength: 20 }), fc.string({ minLength: 1, maxLength: 100 })),
    businessTerm: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    policies: fc.option(fc.array(fc.string({ minLength: 10, maxLength: 100 }), { maxLength: 3 })),
    controls: fc.option(fc.array(fc.string({ minLength: 10, maxLength: 100 }), { maxLength: 3 }))
  });
};

/**
 * Generate a lineage edge
 */
export const lineageEdgeGenerator = (nodeIds?: string[]): fc.Arbitrary<LineageEdge> => {
  const idGenerator = nodeIds && nodeIds.length > 1 
    ? fc.constantFrom(...nodeIds)
    : fc.string({ minLength: 10, maxLength: 36 });
    
  return fc.record({
    id: fc.constant(uuidv4()),
    sourceNodeId: idGenerator,
    targetNodeId: idGenerator,
    transformationType: fc.constantFrom('sql_transformation', 'mapping', 'aggregation', 'calculation', 'filter'),
    transformationLogic: fc.option(fc.string({ minLength: 10, maxLength: 200 }))
  });
};

/**
 * Generate a connected lineage graph with guaranteed connectivity
 */
export const connectedLineageGraphGenerator = (): fc.Arbitrary<LineageGraph> => {
  return fc.integer({ min: 3, max: 10 }).chain(nodeCount => {
    return fc.tuple(
      fc.array(lineageNodeGenerator(), { minLength: nodeCount, maxLength: nodeCount }),
      fc.string({ minLength: 5, maxLength: 20 })
    ).map(([nodes, reportId]) => {
      const nodeIds = nodes.map(n => n.id);
      
      // Ensure at least one source node
      nodes[0].type = 'source_table';
      
      // Ensure connectivity by creating a path from source to report field
      const edges: LineageEdge[] = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: uuidv4(),
          sourceNodeId: nodeIds[i],
          targetNodeId: nodeIds[i + 1],
          transformationType: 'transformation',
          transformationLogic: `Transform from ${nodes[i].name} to ${nodes[i + 1].name}`
        });
      }
      
      // Set the last node as report field
      nodes[nodes.length - 1].type = 'report_field';
      
      return {
        id: uuidv4(),
        reportId,
        nodes,
        edges,
        version: 1,
        capturedAt: new Date()
      };
    });
  });
};

/**
 * Generate a lineage graph (may or may not be connected)
 */
export const lineageGraphGenerator = (): fc.Arbitrary<LineageGraph> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    reportId: fc.string({ minLength: 5, maxLength: 20 }),
    nodes: fc.array(lineageNodeGenerator(), { minLength: 1, maxLength: 10 }),
    edges: fc.array(lineageEdgeGenerator(), { minLength: 0, maxLength: 15 }),
    version: fc.integer({ min: 1, max: 10 }),
    capturedAt: fc.constant(new Date())
  });
};

/**
 * Generate a business glossary term
 */
export const glossaryTermGenerator = (): fc.Arbitrary<GlossaryTerm> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    term: fc.string({ minLength: 5, maxLength: 50 }),
    definition: fc.string({ minLength: 20, maxLength: 200 }),
    synonyms: fc.array(fc.string({ minLength: 3, maxLength: 30 }), { maxLength: 5 }),
    relatedTerms: fc.array(fc.string({ minLength: 5, maxLength: 50 }), { maxLength: 3 })
  });
};

/**
 * Generate a business glossary
 */
export const businessGlossaryGenerator = (): fc.Arbitrary<BusinessGlossary> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    terms: fc.array(glossaryTermGenerator(), { minLength: 1, maxLength: 20 }),
    version: fc.integer({ min: 1, max: 5 }),
    lastUpdated: fc.constant(new Date())
  });
};

/**
 * Generate connection configuration
 */
export const connectionConfigGenerator = (): fc.Arbitrary<ConnectionConfig> => {
  return fc.record({
    host: fc.option(fc.domain()),
    port: fc.option(fc.integer({ min: 1000, max: 65535 })),
    database: fc.option(fc.string({ minLength: 3, maxLength: 20 })),
    credentials: fc.option(fc.string({ minLength: 10, maxLength: 50 })),
    additionalParams: fc.option(fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }), 
      fc.string({ minLength: 1, maxLength: 50 })
    ))
  });
};

/**
 * Generate a data source
 */
export const dataSourceGenerator = (): fc.Arbitrary<DataSource> => {
  return fc.record({
    id: fc.constant(uuidv4()),
    name: fc.string({ minLength: 5, maxLength: 30 }),
    type: fc.constantFrom('database', 'file', 'api', 'stream'),
    connectionConfig: connectionConfigGenerator()
  });
};

/**
 * Generate enriched lineage
 */
export const enrichedLineageGenerator = (): fc.Arbitrary<EnrichedLineage> => {
  return fc.record({
    graph: lineageGraphGenerator(),
    enrichedAt: fc.constant(new Date()),
    glossaryTermsLinked: fc.integer({ min: 0, max: 50 })
  });
};

/**
 * Generate impact analysis
 */
export const impactAnalysisGenerator = (): fc.Arbitrary<ImpactAnalysis> => {
  return fc.record({
    changedSource: fc.string({ minLength: 5, maxLength: 30 }),
    impactedCDEs: fc.array(fc.string({ minLength: 5, maxLength: 20 }), { maxLength: 10 }),
    impactedReports: fc.array(fc.string({ minLength: 5, maxLength: 20 }), { maxLength: 5 }),
    impactedNodes: fc.array(fc.string({ minLength: 5, maxLength: 30 }), { maxLength: 15 }),
    analyzedAt: fc.constant(new Date())
  });
};

/**
 * Generate lineage diagram
 */
export const lineageDiagramGenerator = (): fc.Arbitrary<LineageDiagram> => {
  return fc.record({
    cdeId: fc.string({ minLength: 5, maxLength: 20 }),
    format: fc.constantFrom('mermaid', 'svg', 'png'),
    content: fc.string({ minLength: 50, maxLength: 1000 }),
    generatedAt: fc.constant(new Date())
  });
};

/**
 * Generate lineage report
 */
export const lineageReportGenerator = (): fc.Arbitrary<LineageReport> => {
  return fc.record({
    reportId: fc.string({ minLength: 5, maxLength: 20 }),
    content: fc.string({ minLength: 100, maxLength: 2000 }),
    format: fc.constantFrom('markdown', 'html', 'pdf'),
    generatedAt: fc.constant(new Date())
  });
};

/**
 * Generate a lineage graph with CDEs (for connectivity testing)
 */
export const lineageGraphWithCDEsGenerator = (): fc.Arbitrary<LineageGraph> => {
  return connectedLineageGraphGenerator().map(graph => {
    // Ensure at least one CDE exists in the graph
    const cdeNode = graph.nodes.find(n => n.type === 'report_field');
    if (cdeNode) {
      cdeNode.name = `CDE_${Math.random().toString(36).substr(2, 6)}`;
      cdeNode.technicalDetails.isCDE = 'true';
    }
    return graph;
  });
};