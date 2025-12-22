/**
 * Lineage types for the Agentic Data Governance System
 */

import { LineageNodeType } from './common.js';

/**
 * Node in the lineage graph
 */
export interface LineageNode {
  id: string;
  type: LineageNodeType;
  name: string;
  system: string;
  technicalDetails: Record<string, string>;
  businessTerm?: string;
  policies?: string[];
  controls?: string[];
}

/**
 * Edge connecting lineage nodes
 */
export interface LineageEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  transformationType: string;
  transformationLogic?: string;
}

/**
 * Lineage graph
 */
export interface LineageGraph {
  id: string;
  reportId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  version: number;
  capturedAt: Date;
}

/**
 * Enriched lineage with business context
 */
export interface EnrichedLineage {
  graph: LineageGraph;
  enrichedAt: Date;
  glossaryTermsLinked: number;
}

/**
 * Impact analysis result
 */
export interface ImpactAnalysis {
  changedSource: string;
  impactedCDEs: string[];
  impactedReports: string[];
  impactedNodes: string[];
  analyzedAt: Date;
}

/**
 * Lineage diagram output
 */
export interface LineageDiagram {
  cdeId: string;
  format: 'mermaid' | 'svg' | 'png';
  content: string;
  generatedAt: Date;
}

/**
 * Lineage report output
 */
export interface LineageReport {
  reportId: string;
  content: string;
  format: 'markdown' | 'html' | 'pdf';
  generatedAt: Date;
}

/**
 * Business glossary for enrichment
 */
export interface BusinessGlossary {
  id: string;
  terms: GlossaryTerm[];
  version: number;
  lastUpdated: Date;
}

/**
 * Term in the business glossary
 */
export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  synonyms: string[];
  relatedTerms: string[];
}

/**
 * Data source for lineage scanning
 */
export interface DataSource {
  id: string;
  name: string;
  type: 'database' | 'file' | 'api' | 'stream';
  connectionConfig: ConnectionConfig;
}

/**
 * Connection configuration for external systems
 */
export interface ConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  credentials?: string;
  additionalParams?: Record<string, string>;
}
