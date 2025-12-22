/**
 * Lineage Mapping Agent
 * Captures and documents data lineage from source to report
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ILineageMappingAgent,
  LineageGraph,
  EnrichedLineage,
  ImpactAnalysis,
  LineageDiagram,
  LineageReport,
  BusinessGlossary,
  DataSource,
  ConnectionConfig,
  LineageNode,
  LineageEdge,
  LineageNodeType
} from '../types/index.js';

export class LineageMappingAgent implements ILineageMappingAgent {
  
  /**
   * Scans data pipelines to build lineage graph
   * Requirements: 7.1
   */
  async scanDataPipelines(sources: DataSource[]): Promise<LineageGraph> {
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];
    
    // Process each data source
    for (const source of sources) {
      const sourceNodes = await this.scanDataSource(source);
      nodes.push(...sourceNodes.nodes);
      edges.push(...sourceNodes.edges);
    }
    
    // Build the complete lineage graph
    const lineageGraph: LineageGraph = {
      id: uuidv4(),
      reportId: this.extractReportIdFromSources(sources),
      nodes,
      edges,
      version: 1,
      capturedAt: new Date()
    };
    
    return lineageGraph;
  }
  
  /**
   * Links technical lineage to business concepts
   * Requirements: 7.2
   */
  async linkToBusinessConcepts(graph: LineageGraph, glossary: BusinessGlossary): Promise<EnrichedLineage> {
    let enrichedCount = 0;
    
    // Enrich each node with business terms
    for (const node of graph.nodes) {
      const matchingTerm = this.findMatchingGlossaryTerm(node, glossary);
      if (matchingTerm) {
        node.businessTerm = matchingTerm.term;
        
        // Add related business policies and controls
        node.policies = this.inferPoliciesFromTerm(matchingTerm);
        node.controls = this.inferControlsFromTerm(matchingTerm);
        
        enrichedCount++;
      }
    }
    
    // Enrich edges with business context
    await this.enrichEdgesWithBusinessContext(graph.edges, glossary);
    
    return {
      graph,
      enrichedAt: new Date(),
      glossaryTermsLinked: enrichedCount
    };
  }
  
  /**
   * Imports lineage from external lineage tools
   * Requirements: 7.3
   */
  async importFromLineageTool(toolType: string, connectionConfig: ConnectionConfig): Promise<LineageGraph> {
    // Validate connection configuration
    this.validateConnectionConfig(toolType, connectionConfig);
    
    // Import data from the specified tool
    const importedData = await this.connectToLineageTool(toolType, connectionConfig);
    
    // Transform imported data to our standard format
    const standardizedNodes = await this.standardizeNodes(importedData.nodes || []);
    const standardizedEdges = await this.standardizeEdges(importedData.edges || []);
    
    return {
      id: uuidv4(),
      reportId: importedData.reportId || 'imported',
      nodes: standardizedNodes,
      edges: standardizedEdges,
      version: 1,
      capturedAt: new Date()
    };
  }
  
  /**
   * Analyzes change impact across lineage
   * Requirements: 7.5
   */
  async analyzeChangeImpact(changedSource: string): Promise<ImpactAnalysis> {
    // Find all downstream nodes affected by the change
    const impactedNodes = await this.findDownstreamNodes(changedSource);
    
    // Extract CDEs and reports from the impacted nodes
    const impactedCDEs = await this.extractCDEsFromNodes(impactedNodes);
    const impactedReports = await this.extractReportsFromNodes(impactedNodes);
    
    // Perform additional impact analysis
    await this.assessChangeRisk(changedSource, impactedNodes);
    await this.identifyRequiredValidations(impactedCDEs);
    
    return {
      changedSource,
      impactedCDEs,
      impactedReports,
      impactedNodes,
      analyzedAt: new Date()
    };
  }
  
  /**
   * Generates visual lineage diagram for a CDE
   * Requirements: 7.4
   */
  async generateLineageDiagram(cdeId: string): Promise<LineageDiagram> {
    // Generate Mermaid diagram for the CDE lineage
    const mermaidContent = await this.buildMermaidDiagram(cdeId);
    
    return {
      cdeId,
      format: 'mermaid',
      content: mermaidContent,
      generatedAt: new Date()
    };
  }
  
  /**
   * Generates comprehensive lineage report
   * Requirements: 7.4
   */
  async generateLineageReport(reportId: string): Promise<LineageReport> {
    const reportContent = await this.buildLineageReportContent(reportId);
    
    return {
      reportId,
      content: reportContent,
      format: 'markdown',
      generatedAt: new Date()
    };
  }
  
  // Private helper methods
  
  private async scanDataSource(source: DataSource): Promise<{ nodes: LineageNode[], edges: LineageEdge[] }> {
    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];
    
    // Create source node
    const sourceNode: LineageNode = {
      id: uuidv4(),
      type: 'source_table',
      name: source.name,
      system: source.type,
      technicalDetails: {
        sourceType: source.type,
        ...source.connectionConfig.additionalParams
      }
    };
    nodes.push(sourceNode);
    
    // Simulate discovering transformations and downstream nodes
    const transformations = await this.discoverTransformations(source);
    for (const transformation of transformations) {
      nodes.push(transformation.node);
      edges.push({
        id: uuidv4(),
        sourceNodeId: sourceNode.id,
        targetNodeId: transformation.node.id,
        transformationType: transformation.type,
        transformationLogic: transformation.logic
      });
    }
    
    return { nodes, edges };
  }
  
  private async discoverTransformations(source: DataSource): Promise<Array<{ node: LineageNode, type: string, logic?: string }>> {
    // Simulate transformation discovery based on source type
    const transformations = [];
    
    if (source.type === 'database') {
      // Simulate SQL transformations
      transformations.push({
        node: {
          id: uuidv4(),
          type: 'transformation' as LineageNodeType,
          name: `${source.name}_transform`,
          system: 'ETL',
          technicalDetails: {
            transformationType: 'sql',
            operation: 'aggregate'
          }
        },
        type: 'sql_transformation',
        logic: 'SELECT SUM(amount) FROM source GROUP BY category'
      });
    }
    
    return transformations;
  }
  
  private extractReportIdFromSources(sources: DataSource[]): string {
    // Extract report ID from source metadata or use default
    return sources[0]?.connectionConfig?.additionalParams?.reportId || 'default_report';
  }
  
  private findMatchingGlossaryTerm(node: LineageNode, glossary: BusinessGlossary) {
    // Find matching term by name or synonyms
    return glossary.terms.find(term => 
      term.term.toLowerCase() === node.name.toLowerCase() ||
      term.synonyms.some(synonym => synonym.toLowerCase() === node.name.toLowerCase()) ||
      this.calculateSemanticSimilarity(node.name, term.term) > 0.8
    );
  }
  
  private calculateSemanticSimilarity(name1: string, name2: string): number {
    // Simple similarity calculation based on common words
    const words1 = name1.toLowerCase().split(/[\s_-]+/);
    const words2 = name2.toLowerCase().split(/[\s_-]+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;
    
    return commonWords.length / totalWords;
  }
  
  private inferPoliciesFromTerm(term: any): string[] {
    // Infer applicable policies based on business term
    const policies: string[] = [];
    
    const termLower = term.term.toLowerCase();
    
    if (termLower.includes('customer')) {
      policies.push('Customer Data Protection Policy');
    }
    if (termLower.includes('financial') || termLower.includes('amount') || termLower.includes('data')) {
      policies.push('Financial Data Accuracy Policy');
    }
    if (termLower.includes('risk')) {
      policies.push('Risk Data Governance Policy');
    }
    
    // Add a default policy for any business term
    if (policies.length === 0) {
      policies.push('General Data Governance Policy');
    }
    
    return policies;
  }
  
  private inferControlsFromTerm(term: any): string[] {
    // Infer applicable controls based on business term
    const controls: string[] = [];
    
    const termLower = term.term.toLowerCase();
    
    if (termLower.includes('critical') || termLower.includes('key')) {
      controls.push('Critical Data Element Control');
    }
    if (termLower.includes('calculation') || termLower.includes('formula')) {
      controls.push('Calculation Logic Validation Control');
    }
    if (termLower.includes('regulatory') || termLower.includes('compliance')) {
      controls.push('Regulatory Compliance Control');
    }
    if (termLower.includes('financial') || termLower.includes('data')) {
      controls.push('Data Quality Control');
    }
    
    // Add a default control for any business term
    if (controls.length === 0) {
      controls.push('General Data Control');
    }
    
    return controls;
  }
  
  private async enrichEdgesWithBusinessContext(edges: LineageEdge[], glossary: BusinessGlossary): Promise<void> {
    // Enrich transformation edges with business context
    for (const edge of edges) {
      if (edge.transformationType === 'sql_transformation' && edge.transformationLogic) {
        // Extract business meaning from SQL logic
        edge.transformationLogic = this.addBusinessContextToSQL(edge.transformationLogic, glossary);
      }
    }
  }
  
  private addBusinessContextToSQL(sql: string, glossary: BusinessGlossary): string {
    // Add business context comments to SQL transformations
    let enrichedSQL = sql;
    
    // Add business context for common patterns
    if (sql.includes('SUM(')) {
      enrichedSQL += ' -- Business Rule: Aggregate total amounts for regulatory reporting';
    }
    if (sql.includes('GROUP BY')) {
      enrichedSQL += ' -- Business Rule: Group by regulatory category for compliance';
    }
    
    return enrichedSQL;
  }
  
  private async connectToLineageTool(toolType: string, connectionConfig: ConnectionConfig): Promise<any> {
    // Simulate connection to external lineage tools
    switch (toolType.toLowerCase()) {
      case 'apache_atlas':
        return this.connectToAtlas(connectionConfig);
      case 'datahub':
        return this.connectToDataHub(connectionConfig);
      case 'collibra':
        return this.connectToCollibra(connectionConfig);
      default:
        throw new Error(`Unsupported lineage tool type: ${toolType}`);
    }
  }
  
  private async connectToAtlas(config: ConnectionConfig): Promise<any> {
    // Simulate Atlas API connection
    return {
      reportId: 'atlas_import',
      nodes: [],
      edges: []
    };
  }
  
  private async connectToDataHub(config: ConnectionConfig): Promise<any> {
    // Simulate DataHub API connection
    return {
      reportId: 'datahub_import',
      nodes: [],
      edges: []
    };
  }
  
  private async connectToCollibra(config: ConnectionConfig): Promise<any> {
    // Simulate Collibra API connection
    return {
      reportId: 'collibra_import',
      nodes: [],
      edges: []
    };
  }
  
  private async findDownstreamNodes(changedSource: string): Promise<string[]> {
    // Simulate finding downstream nodes affected by source change
    // This would typically traverse the lineage graph
    return [`${changedSource}_transform_1`, `${changedSource}_staging`, `${changedSource}_report_field`];
  }
  
  private async extractCDEsFromNodes(nodeIds: string[]): Promise<string[]> {
    // Extract CDE IDs from affected nodes
    return nodeIds
      .filter(nodeId => nodeId.includes('cde') || nodeId.includes('critical'))
      .map(nodeId => `cde_${nodeId.split('_')[0]}`);
  }
  
  private async extractReportsFromNodes(nodeIds: string[]): Promise<string[]> {
    // Extract report IDs from affected nodes
    return nodeIds
      .filter(nodeId => nodeId.includes('report'))
      .map(nodeId => `report_${nodeId.split('_')[0]}`);
  }
  
  private async buildMermaidDiagram(cdeId: string): Promise<string> {
    // Build comprehensive Mermaid diagram for CDE lineage
    const lineageData = await this.getCDELineageData(cdeId);
    
    let mermaidContent = 'graph TD\n';
    
    // Add nodes
    for (const node of lineageData.nodes) {
      const nodeStyle = this.getMermaidNodeStyle(node.type);
      mermaidContent += `    ${node.id}[${node.name}]${nodeStyle}\n`;
    }
    
    // Add edges
    for (const edge of lineageData.edges) {
      const edgeLabel = edge.transformationLogic ? `|${edge.transformationType}|` : '';
      mermaidContent += `    ${edge.sourceNodeId} -->${edgeLabel} ${edge.targetNodeId}\n`;
    }
    
    // Highlight the CDE
    mermaidContent += `    style ${cdeId} fill:#f9f,stroke:#333,stroke-width:4px\n`;
    
    return mermaidContent;
  }
  
  private getMermaidNodeStyle(nodeType: LineageNodeType): string {
    switch (nodeType) {
      case 'source_table':
        return '';
      case 'transformation':
        return '{Transformation}';
      case 'staging_table':
        return '[(Staging)]';
      case 'report_field':
        return '((Report Field))';
      default:
        return '';
    }
  }
  
  private async getCDELineageData(cdeId: string): Promise<{ nodes: LineageNode[], edges: LineageEdge[] }> {
    // Simulate retrieving lineage data for a specific CDE
    return {
      nodes: [
        {
          id: 'src_001',
          type: 'source_table',
          name: 'Transaction Data',
          system: 'Core Banking',
          technicalDetails: {}
        },
        {
          id: 'trans_001',
          type: 'transformation',
          name: 'Risk Calculation',
          system: 'ETL',
          technicalDetails: {}
        },
        {
          id: cdeId,
          type: 'report_field',
          name: 'Risk Weighted Assets',
          system: 'Regulatory Reporting',
          technicalDetails: {}
        }
      ],
      edges: [
        {
          id: 'edge_001',
          sourceNodeId: 'src_001',
          targetNodeId: 'trans_001',
          transformationType: 'aggregation',
          transformationLogic: 'SUM(risk_amount * risk_weight)'
        },
        {
          id: 'edge_002',
          sourceNodeId: 'trans_001',
          targetNodeId: cdeId,
          transformationType: 'mapping',
          transformationLogic: 'Direct mapping to report field'
        }
      ]
    };
  }
  
  private async buildLineageReportContent(reportId: string): Promise<string> {
    // Retrieve comprehensive lineage data for the report
    const reportLineage = await this.getReportLineageData(reportId);
    const cdeList = await this.extractCDEsFromReport(reportId);
    const qualityControls = await this.getQualityControlsForReport(reportId);
    
    return `
# Data Lineage Report: ${reportId}

## Executive Summary
This report documents the complete data lineage for regulatory report ${reportId}, including ${reportLineage.nodes.length} data elements across ${reportLineage.sourceSystems.length} source systems.

## Source Systems
${reportLineage.sourceSystems.map(system => `- **${system.name}**: ${system.description}`).join('\n')}

## Data Flow Overview
${this.generateDataFlowDescription(reportLineage)}

## Critical Data Elements
${cdeList.map(cde => `- **${cde.id}**: ${cde.name} - ${cde.description}`).join('\n')}

## Transformation Logic
${reportLineage.transformations.map((t, i) => `${i + 1}. **${t.name}**: ${t.description}`).join('\n')}

## Data Quality Controls
${qualityControls.map(control => `- **${control.name}**: ${control.description} (${control.frequency})`).join('\n')}

## Business Rules Applied
${reportLineage.businessRules.map(rule => `- ${rule.description}`).join('\n')}

## Lineage Diagram
\`\`\`mermaid
${await this.generateReportLineageDiagram(reportId)}
\`\`\`

## Data Governance Artifacts
- Data Dictionary: Available in governance repository
- Quality Rules: ${qualityControls.length} active rules
- Control Evidence: Maintained in control matrix
- Audit Trail: Complete lineage capture history

## Compliance Mapping
This lineage supports compliance with:
- BCBS 239 Principle 11 (Data Architecture and IT Infrastructure)
- BCBS 239 Principle 14 (Risk Data Aggregation Capabilities)

Generated on: ${new Date().toISOString()}
Report Version: 1.0
    `;
  }
  
  private async getReportLineageData(reportId: string): Promise<any> {
    // Simulate retrieving comprehensive report lineage data
    return {
      nodes: [],
      sourceSystems: [
        { name: 'Core Banking System', description: 'Primary transaction and account data' },
        { name: 'Risk Management System', description: 'Risk calculations and assessments' },
        { name: 'Market Data System', description: 'External market rates and prices' }
      ],
      transformations: [
        { name: 'Data Extraction', description: 'Extract raw data from source systems' },
        { name: 'Data Cleansing', description: 'Apply data quality rules and corrections' },
        { name: 'Business Logic', description: 'Apply regulatory calculation rules' },
        { name: 'Aggregation', description: 'Summarize data for reporting requirements' }
      ],
      businessRules: [
        { description: 'Risk weights applied according to Basel III framework' },
        { description: 'Currency conversion using month-end rates' },
        { description: 'Netting applied for derivative exposures' }
      ]
    };
  }
  
  private async extractCDEsFromReport(reportId: string): Promise<any[]> {
    // Simulate extracting CDEs for the report
    return [
      { id: 'CDE_001', name: 'Total Assets', description: 'Sum of all on-balance sheet assets' },
      { id: 'CDE_002', name: 'Risk Weighted Assets', description: 'Assets weighted by regulatory risk factors' },
      { id: 'CDE_003', name: 'Tier 1 Capital', description: 'Highest quality regulatory capital' }
    ];
  }
  
  private async getQualityControlsForReport(reportId: string): Promise<any[]> {
    // Simulate retrieving quality controls
    return [
      { name: 'Completeness Check', description: 'Verify all required fields are populated', frequency: 'Daily' },
      { name: 'Balance Reconciliation', description: 'Reconcile totals with source systems', frequency: 'Monthly' },
      { name: 'Threshold Validation', description: 'Check values against expected ranges', frequency: 'Daily' }
    ];
  }
  
  private generateDataFlowDescription(lineageData: any): string {
    return `
Data flows through ${lineageData.transformations.length} main stages:
${lineageData.transformations.map((t, i) => `${i + 1}. ${t.description}`).join('\n')}

The lineage ensures full traceability from source systems to final report fields, supporting regulatory requirements for data transparency and auditability.
    `;
  }
  
  private async generateReportLineageDiagram(reportId: string): Promise<string> {
    // Generate a comprehensive Mermaid diagram for the entire report
    return `
graph TD
    A[Core Banking System] --> D[Data Extraction]
    B[Risk Management System] --> D
    C[Market Data System] --> D
    D --> E[Data Cleansing]
    E --> F[Business Logic Application]
    F --> G[Aggregation & Calculation]
    G --> H[${reportId}]
    
    style H fill:#f9f,stroke:#333,stroke-width:4px
    style A fill:#e1f5fe
    style B fill:#e1f5fe
    style C fill:#e1f5fe
    `;
  }
  
  private validateConnectionConfig(toolType: string, config: ConnectionConfig): void {
    // Validate required configuration parameters for each tool type
    switch (toolType.toLowerCase()) {
      case 'apache_atlas':
        if (!config.host || !config.port) {
          throw new Error('Apache Atlas requires host and port configuration');
        }
        break;
      case 'datahub':
        if (!config.host) {
          throw new Error('DataHub requires host configuration');
        }
        break;
      case 'collibra':
        if (!config.host || !config.credentials) {
          throw new Error('Collibra requires host and credentials configuration');
        }
        break;
      default:
        throw new Error(`Unsupported lineage tool type: ${toolType}`);
    }
  }
  
  private async standardizeNodes(importedNodes: any[]): Promise<LineageNode[]> {
    // Convert imported nodes to our standard format
    return importedNodes.map(node => ({
      id: node.id || uuidv4(),
      type: this.mapToStandardNodeType(node.type),
      name: node.name || node.displayName || 'Unknown',
      system: node.system || node.platform || 'Unknown',
      technicalDetails: node.properties || node.attributes || {},
      businessTerm: node.businessTerm,
      policies: node.policies || [],
      controls: node.controls || []
    }));
  }
  
  private async standardizeEdges(importedEdges: any[]): Promise<LineageEdge[]> {
    // Convert imported edges to our standard format
    return importedEdges.map(edge => ({
      id: edge.id || uuidv4(),
      sourceNodeId: edge.source || edge.from,
      targetNodeId: edge.target || edge.to,
      transformationType: edge.type || 'unknown',
      transformationLogic: edge.logic || edge.description
    }));
  }
  
  private mapToStandardNodeType(importedType: string): LineageNodeType {
    // Map various tool-specific node types to our standard types
    const typeMapping: Record<string, LineageNodeType> = {
      'table': 'source_table',
      'dataset': 'source_table',
      'view': 'transformation',
      'job': 'transformation',
      'process': 'transformation',
      'staging': 'staging_table',
      'field': 'report_field',
      'column': 'report_field'
    };
    
    return typeMapping[importedType.toLowerCase()] || 'source_table';
  }
  
  private async assessChangeRisk(changedSource: string, impactedNodes: string[]): Promise<void> {
    // Assess the risk level of the change based on impact scope
    const riskFactors = {
      nodeCount: impactedNodes.length,
      hasCriticalData: impactedNodes.some(node => node.includes('critical') || node.includes('cde')),
      hasRegulatoryReports: impactedNodes.some(node => node.includes('report')),
      hasTransformations: impactedNodes.some(node => node.includes('transform'))
    };
    
    // Log risk assessment (in a real implementation, this would be stored)
    console.log(`Change risk assessment for ${changedSource}:`, riskFactors);
  }
  
  private async identifyRequiredValidations(impactedCDEs: string[]): Promise<void> {
    // Identify what validations need to be performed after the change
    const validations = [];
    
    for (const cde of impactedCDEs) {
      validations.push(`Validate data quality rules for ${cde}`);
      validations.push(`Verify calculation logic for ${cde}`);
      validations.push(`Check reconciliation controls for ${cde}`);
    }
    
    // Log required validations (in a real implementation, this would create tasks)
    console.log('Required validations:', validations);
  }
}