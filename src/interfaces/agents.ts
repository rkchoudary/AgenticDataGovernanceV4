/**
 * Agent interfaces for the Agentic Data Governance System
 */

import {
  Jurisdiction,
  RegulatoryChange,
  ScanResult,
  CatalogUpdate,
  ReportCatalog,
  DataElement,
  DataMapping,
  DataGap,
  RequirementsDocument,
  ReconciliationResult,
  DataCatalog,
  CDE,
  CDEScore,
  CDEInventory,
  OwnerSuggestion,
  ScoringContext,
  DQRule,
  RuleExecutionResult,
  DataSnapshot,
  DataProfile,
  LineageGraph,
  EnrichedLineage,
  ImpactAnalysis,
  LineageDiagram,
  LineageReport,
  BusinessGlossary,
  DataSource,
  ConnectionConfig,
  Issue,
  IssueContext,
  RootCauseSuggestion,
  IssueMetrics,
  IssueFilters,
  Resolution,
  Document,
  CompliancePackage
} from '../types/index.js';

/**
 * Regulatory Intelligence Agent interface
 * Monitors regulatory sources and maintains the report catalog
 */
export interface IRegulatoryIntelligenceAgent {
  scanRegulatorySources(jurisdictions: Jurisdiction[]): Promise<ScanResult[]>;
  detectChanges(since: Date): Promise<RegulatoryChange[]>;
  updateReportCatalog(changes: RegulatoryChange[]): Promise<CatalogUpdate>;
  getReportCatalog(): Promise<ReportCatalog>;
  notifyStakeholders(change: RegulatoryChange): Promise<void>;
}

/**
 * Data Requirements Agent interface
 * Parses regulatory templates and maps data elements to internal sources
 */
export interface IDataRequirementsAgent {
  parseRegulatoryTemplate(templateUrl: string): Promise<DataElement[]>;
  mapToInternalSources(elements: DataElement[], catalog: DataCatalog): Promise<DataMapping[]>;
  identifyDataGaps(mappings: DataMapping[]): Promise<DataGap[]>;
  generateRequirementsDocument(reportId: string): Promise<RequirementsDocument>;
  ingestExistingDocument(document: RequirementsDocument): Promise<ReconciliationResult>;
}

/**
 * CDE Identification Agent interface
 * Identifies and scores critical data elements
 */
export interface ICDEIdentificationAgent {
  scoreDataElements(elements: DataElement[], context: ScoringContext): Promise<CDEScore[]>;
  generateCDEInventory(scores: CDEScore[], threshold: number): Promise<CDEInventory>;
  reconcileWithExisting(newInventory: CDEInventory, existing: CDEInventory): Promise<ReconciliationResult>;
  suggestDataOwners(cdes: CDE[]): Promise<OwnerSuggestion[]>;
}

/**
 * Data Quality Rule Agent interface
 * Generates and manages data quality validation rules
 */
export interface IDataQualityRuleAgent {
  generateRulesForCDE(cde: CDE, historicalData?: DataProfile): Promise<DQRule[]>;
  ingestExistingRules(rules: DQRule[]): Promise<ReconciliationResult>;
  updateRuleThreshold(ruleId: string, newThreshold: number, justification: string): Promise<void>;
  executeRules(rules: DQRule[], dataSnapshot: DataSnapshot): Promise<RuleExecutionResult[]>;
}

/**
 * Lineage Mapping Agent interface
 * Captures and documents data lineage from source to report
 */
export interface ILineageMappingAgent {
  scanDataPipelines(sources: DataSource[]): Promise<LineageGraph>;
  linkToBusinessConcepts(graph: LineageGraph, glossary: BusinessGlossary): Promise<EnrichedLineage>;
  importFromLineageTool(toolType: string, connectionConfig: ConnectionConfig): Promise<LineageGraph>;
  analyzeChangeImpact(changedSource: string): Promise<ImpactAnalysis>;
  generateLineageDiagram(cdeId: string): Promise<LineageDiagram>;
  generateLineageReport(reportId: string): Promise<LineageReport>;
}

/**
 * Issue Management Agent interface
 * Handles data issue lifecycle from detection to resolution
 */
export interface IIssueManagementAgent {
  createIssue(ruleResult: RuleExecutionResult, context: IssueContext): Promise<Issue>;
  suggestRootCause(issue: Issue): Promise<RootCauseSuggestion[]>;
  findSimilarIssues(issue: Issue): Promise<Issue[]>;
  assignIssue(issueId: string, assignee: string): Promise<void>;
  escalateIssue(issueId: string, level: number): Promise<void>;
  resolveIssue(issueId: string, resolution: Resolution, confirmedBy: string): Promise<void>;
  getIssueMetrics(filters: IssueFilters): Promise<IssueMetrics>;
}

/**
 * Documentation Agent interface
 * Generates compliance artifacts and audit evidence
 */
export interface IDocumentationAgent {
  generateDataDictionary(reportId: string): Promise<Document>;
  generateLineageDocumentation(reportId: string): Promise<Document>;
  generateQualityAssuranceReport(cycleId: string): Promise<Document>;
  generateControlEffectivenessReport(cycleId: string): Promise<Document>;
  generateBCBS239ComplianceMapping(reportId: string): Promise<Document>;
  compileCompliancePackage(cycleId: string): Promise<CompliancePackage>;
}
