/**
 * Governance Repository for the Agentic Data Governance System
 * Provides centralized storage and CRUD operations for all governance artifacts
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ReportCatalog,
  RequirementsDocument,
  CDEInventory,
  DQRuleRepository,
  LineageGraph,
  ControlMatrix,
  Issue,
  AuditEntry,
  HumanTask,
  DataCatalog,
  BusinessGlossary,
  CreateAuditEntryParams,
  CycleInstance,
  DataQualityStandards,
  CompliancePackage,
  Annotation
} from '../types/index.js';

/**
 * Interface for the Governance Repository
 */
export interface IGovernanceRepository {
  // Report Catalog
  getReportCatalog(): ReportCatalog | undefined;
  setReportCatalog(catalog: ReportCatalog): void;
  
  // Data Catalog
  getDataCatalog(): DataCatalog | undefined;
  setDataCatalog(catalog: DataCatalog): void;
  
  // Business Glossary
  getBusinessGlossary(): BusinessGlossary | undefined;
  setBusinessGlossary(glossary: BusinessGlossary): void;
  
  // Requirements Documents
  getRequirementsDocument(reportId: string): RequirementsDocument | undefined;
  setRequirementsDocument(reportId: string, doc: RequirementsDocument): void;
  deleteRequirementsDocument(reportId: string): boolean;
  
  // CDE Inventories
  getCDEInventory(reportId: string): CDEInventory | undefined;
  setCDEInventory(reportId: string, inventory: CDEInventory): void;
  deleteCDEInventory(reportId: string): boolean;
  
  // DQ Rule Repositories
  getDQRuleRepository(reportId: string): DQRuleRepository | undefined;
  setDQRuleRepository(reportId: string, repo: DQRuleRepository): void;
  deleteDQRuleRepository(reportId: string): boolean;
  
  // Lineage Graphs
  getLineageGraph(reportId: string): LineageGraph | undefined;
  setLineageGraph(reportId: string, graph: LineageGraph): void;
  deleteLineageGraph(reportId: string): boolean;
  
  // Control Matrices
  getControlMatrix(reportId: string): ControlMatrix | undefined;
  setControlMatrix(reportId: string, matrix: ControlMatrix): void;
  deleteControlMatrix(reportId: string): boolean;

  // Issues
  getIssue(issueId: string): Issue | undefined;
  getAllIssues(): Issue[];
  createIssue(issue: Omit<Issue, 'id'> | Issue): Issue;
  updateIssue(issueId: string, updates: Partial<Issue>): Issue | undefined;
  deleteIssue(issueId: string): boolean;
  
  // Audit Log
  getAuditEntries(entityType?: string, entityId?: string): AuditEntry[];
  createAuditEntry(params: CreateAuditEntryParams): AuditEntry;
  
  // Human Tasks
  getHumanTask(taskId: string): HumanTask | undefined;
  getAllHumanTasks(cycleId?: string): HumanTask[];
  createHumanTask(task: Omit<HumanTask, 'id' | 'createdAt' | 'escalationLevel'>): HumanTask;
  updateHumanTask(taskId: string, updates: Partial<HumanTask>): HumanTask | undefined;
  deleteHumanTask(taskId: string): boolean;
  
  // Cycle Instances
  getCycleInstance(cycleId: string): CycleInstance | undefined;
  getAllCycleInstances(): CycleInstance[];
  createCycleInstance(cycle: Omit<CycleInstance, 'id'>): CycleInstance;
  updateCycleInstance(cycleId: string, updates: Partial<CycleInstance>): CycleInstance | undefined;
  deleteCycleInstance(cycleId: string): boolean;
  
  // Data Quality Standards
  getDataQualityStandards(): DataQualityStandards | undefined;
  setDataQualityStandards(standards: DataQualityStandards): void;
  
  // Compliance Packages
  getCompliancePackage(cycleId: string): CompliancePackage | undefined;
  setCompliancePackage(cycleId: string, pkg: CompliancePackage): void;
  deleteCompliancePackage(cycleId: string): boolean;
  
  // Annotations
  getAnnotations(metricId: string): Annotation[];
  createAnnotation(annotation: Omit<Annotation, 'id' | 'createdAt'>): Annotation;
}

/**
 * In-memory implementation of the Governance Repository
 */
export class InMemoryGovernanceRepository implements IGovernanceRepository {
  private reportCatalog?: ReportCatalog;
  private dataCatalog?: DataCatalog;
  private businessGlossary?: BusinessGlossary;
  private requirementsDocuments: Map<string, RequirementsDocument> = new Map();
  private cdeInventories: Map<string, CDEInventory> = new Map();
  private dqRuleRepositories: Map<string, DQRuleRepository> = new Map();
  private lineageGraphs: Map<string, LineageGraph> = new Map();
  private controlMatrices: Map<string, ControlMatrix> = new Map();
  private issues: Map<string, Issue> = new Map();
  private auditLog: AuditEntry[] = [];
  private humanTasks: Map<string, HumanTask> = new Map();
  private cycleInstances: Map<string, CycleInstance> = new Map();
  private dataQualityStandards?: DataQualityStandards;
  private compliancePackages: Map<string, CompliancePackage> = new Map();
  private annotations: Map<string, Annotation[]> = new Map();

  // Report Catalog
  getReportCatalog(): ReportCatalog | undefined {
    return this.reportCatalog;
  }

  setReportCatalog(catalog: ReportCatalog): void {
    const previousState = this.reportCatalog;
    this.reportCatalog = catalog;
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'ReportCatalog',
      entityId: 'singleton',
      previousState,
      newState: catalog
    });
  }

  // Data Catalog
  getDataCatalog(): DataCatalog | undefined {
    return this.dataCatalog;
  }

  setDataCatalog(catalog: DataCatalog): void {
    const previousState = this.dataCatalog;
    this.dataCatalog = catalog;
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'DataCatalog',
      entityId: catalog.id,
      previousState,
      newState: catalog
    });
  }

  // Business Glossary
  getBusinessGlossary(): BusinessGlossary | undefined {
    return this.businessGlossary;
  }

  setBusinessGlossary(glossary: BusinessGlossary): void {
    const previousState = this.businessGlossary;
    this.businessGlossary = glossary;
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'BusinessGlossary',
      entityId: glossary.id,
      previousState,
      newState: glossary
    });
  }


  // Requirements Documents
  getRequirementsDocument(reportId: string): RequirementsDocument | undefined {
    return this.requirementsDocuments.get(reportId);
  }

  setRequirementsDocument(reportId: string, doc: RequirementsDocument): void {
    const previousState = this.requirementsDocuments.get(reportId);
    this.requirementsDocuments.set(reportId, doc);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'RequirementsDocument',
      entityId: doc.id,
      previousState,
      newState: doc
    });
  }

  deleteRequirementsDocument(reportId: string): boolean {
    const existing = this.requirementsDocuments.get(reportId);
    if (existing) {
      this.requirementsDocuments.delete(reportId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'RequirementsDocument',
        entityId: existing.id,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // CDE Inventories
  getCDEInventory(reportId: string): CDEInventory | undefined {
    return this.cdeInventories.get(reportId);
  }

  setCDEInventory(reportId: string, inventory: CDEInventory): void {
    const previousState = this.cdeInventories.get(reportId);
    this.cdeInventories.set(reportId, inventory);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'CDEInventory',
      entityId: inventory.id,
      previousState,
      newState: inventory
    });
  }

  deleteCDEInventory(reportId: string): boolean {
    const existing = this.cdeInventories.get(reportId);
    if (existing) {
      this.cdeInventories.delete(reportId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'CDEInventory',
        entityId: existing.id,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // DQ Rule Repositories
  getDQRuleRepository(reportId: string): DQRuleRepository | undefined {
    return this.dqRuleRepositories.get(reportId);
  }

  setDQRuleRepository(reportId: string, repo: DQRuleRepository): void {
    const previousState = this.dqRuleRepositories.get(reportId);
    this.dqRuleRepositories.set(reportId, repo);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'DQRuleRepository',
      entityId: reportId,
      previousState,
      newState: repo
    });
  }

  deleteDQRuleRepository(reportId: string): boolean {
    const existing = this.dqRuleRepositories.get(reportId);
    if (existing) {
      this.dqRuleRepositories.delete(reportId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'DQRuleRepository',
        entityId: reportId,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // Lineage Graphs
  getLineageGraph(reportId: string): LineageGraph | undefined {
    return this.lineageGraphs.get(reportId);
  }

  setLineageGraph(reportId: string, graph: LineageGraph): void {
    const previousState = this.lineageGraphs.get(reportId);
    this.lineageGraphs.set(reportId, graph);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'LineageGraph',
      entityId: graph.id,
      previousState,
      newState: graph
    });
  }

  deleteLineageGraph(reportId: string): boolean {
    const existing = this.lineageGraphs.get(reportId);
    if (existing) {
      this.lineageGraphs.delete(reportId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'LineageGraph',
        entityId: existing.id,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // Control Matrices
  getControlMatrix(reportId: string): ControlMatrix | undefined {
    return this.controlMatrices.get(reportId);
  }

  setControlMatrix(reportId: string, matrix: ControlMatrix): void {
    const previousState = this.controlMatrices.get(reportId);
    this.controlMatrices.set(reportId, matrix);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'ControlMatrix',
      entityId: matrix.id,
      previousState,
      newState: matrix
    });
  }

  deleteControlMatrix(reportId: string): boolean {
    const existing = this.controlMatrices.get(reportId);
    if (existing) {
      this.controlMatrices.delete(reportId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'ControlMatrix',
        entityId: existing.id,
        previousState: existing
      });
      return true;
    }
    return false;
  }


  // Issues
  getIssue(issueId: string): Issue | undefined {
    return this.issues.get(issueId);
  }

  getAllIssues(): Issue[] {
    return Array.from(this.issues.values());
  }

  createIssue(issue: Omit<Issue, 'id'> | Issue): Issue {
    // Support both cases: with or without pre-set ID
    const issueWithId = issue as Issue;
    const newIssue: Issue = {
      ...issue,
      id: issueWithId.id || uuidv4()
    };
    this.issues.set(newIssue.id, newIssue);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: 'create',
      entityType: 'Issue',
      entityId: newIssue.id,
      newState: newIssue
    });
    return newIssue;
  }

  updateIssue(issueId: string, updates: Partial<Issue>): Issue | undefined {
    const existing = this.issues.get(issueId);
    if (existing) {
      const updated: Issue = { ...existing, ...updates, id: issueId };
      this.issues.set(issueId, updated);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'update',
        entityType: 'Issue',
        entityId: issueId,
        previousState: existing,
        newState: updated
      });
      return updated;
    }
    return undefined;
  }

  deleteIssue(issueId: string): boolean {
    const existing = this.issues.get(issueId);
    if (existing) {
      this.issues.delete(issueId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'Issue',
        entityId: issueId,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // Audit Log
  getAuditEntries(entityType?: string, entityId?: string): AuditEntry[] {
    let entries = this.auditLog;
    if (entityType) {
      entries = entries.filter(e => e.entityType === entityType);
    }
    if (entityId) {
      entries = entries.filter(e => e.entityId === entityId);
    }
    return entries;
  }

  createAuditEntry(params: CreateAuditEntryParams): AuditEntry {
    const entry: AuditEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      ...params
    };
    this.auditLog.push(entry);
    return entry;
  }

  // Human Tasks
  getHumanTask(taskId: string): HumanTask | undefined {
    return this.humanTasks.get(taskId);
  }

  getAllHumanTasks(cycleId?: string): HumanTask[] {
    const tasks = Array.from(this.humanTasks.values());
    if (cycleId) {
      return tasks.filter(t => t.cycleId === cycleId);
    }
    return tasks;
  }

  createHumanTask(task: Omit<HumanTask, 'id' | 'createdAt' | 'escalationLevel'>): HumanTask {
    const newTask: HumanTask = {
      ...task,
      id: uuidv4(),
      createdAt: new Date(),
      escalationLevel: 0
    };
    this.humanTasks.set(newTask.id, newTask);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: 'create',
      entityType: 'HumanTask',
      entityId: newTask.id,
      newState: newTask
    });
    return newTask;
  }

  updateHumanTask(taskId: string, updates: Partial<HumanTask>): HumanTask | undefined {
    const existing = this.humanTasks.get(taskId);
    if (existing) {
      const updated: HumanTask = { ...existing, ...updates, id: taskId };
      this.humanTasks.set(taskId, updated);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'update',
        entityType: 'HumanTask',
        entityId: taskId,
        previousState: existing,
        newState: updated
      });
      return updated;
    }
    return undefined;
  }

  deleteHumanTask(taskId: string): boolean {
    const existing = this.humanTasks.get(taskId);
    if (existing) {
      this.humanTasks.delete(taskId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'HumanTask',
        entityId: taskId,
        previousState: existing
      });
      return true;
    }
    return false;
  }


  // Cycle Instances
  getCycleInstance(cycleId: string): CycleInstance | undefined {
    return this.cycleInstances.get(cycleId);
  }

  getAllCycleInstances(): CycleInstance[] {
    return Array.from(this.cycleInstances.values());
  }

  createCycleInstance(cycle: Omit<CycleInstance, 'id'>): CycleInstance {
    const newCycle: CycleInstance = {
      ...cycle,
      id: uuidv4()
    };
    this.cycleInstances.set(newCycle.id, newCycle);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: 'create',
      entityType: 'CycleInstance',
      entityId: newCycle.id,
      newState: newCycle
    });
    return newCycle;
  }

  updateCycleInstance(cycleId: string, updates: Partial<CycleInstance>): CycleInstance | undefined {
    const existing = this.cycleInstances.get(cycleId);
    if (existing) {
      const updated: CycleInstance = { ...existing, ...updates, id: cycleId };
      this.cycleInstances.set(cycleId, updated);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'update',
        entityType: 'CycleInstance',
        entityId: cycleId,
        previousState: existing,
        newState: updated
      });
      return updated;
    }
    return undefined;
  }

  deleteCycleInstance(cycleId: string): boolean {
    const existing = this.cycleInstances.get(cycleId);
    if (existing) {
      this.cycleInstances.delete(cycleId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'CycleInstance',
        entityId: cycleId,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // Data Quality Standards
  getDataQualityStandards(): DataQualityStandards | undefined {
    return this.dataQualityStandards;
  }

  setDataQualityStandards(standards: DataQualityStandards): void {
    const previousState = this.dataQualityStandards;
    this.dataQualityStandards = standards;
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'DataQualityStandards',
      entityId: 'singleton',
      previousState,
      newState: standards
    });
  }

  // Compliance Packages
  getCompliancePackage(cycleId: string): CompliancePackage | undefined {
    return this.compliancePackages.get(cycleId);
  }

  setCompliancePackage(cycleId: string, pkg: CompliancePackage): void {
    const previousState = this.compliancePackages.get(cycleId);
    this.compliancePackages.set(cycleId, pkg);
    this.createAuditEntry({
      actor: 'system',
      actorType: 'system',
      action: previousState ? 'update' : 'create',
      entityType: 'CompliancePackage',
      entityId: pkg.id,
      previousState,
      newState: pkg
    });
  }

  deleteCompliancePackage(cycleId: string): boolean {
    const existing = this.compliancePackages.get(cycleId);
    if (existing) {
      this.compliancePackages.delete(cycleId);
      this.createAuditEntry({
        actor: 'system',
        actorType: 'system',
        action: 'delete',
        entityType: 'CompliancePackage',
        entityId: existing.id,
        previousState: existing
      });
      return true;
    }
    return false;
  }

  // Annotations
  getAnnotations(metricId: string): Annotation[] {
    return this.annotations.get(metricId) || [];
  }

  createAnnotation(annotation: Omit<Annotation, 'id' | 'createdAt'>): Annotation {
    const newAnnotation: Annotation = {
      ...annotation,
      id: uuidv4(),
      createdAt: new Date()
    };
    const existing = this.annotations.get(annotation.metricId) || [];
    existing.push(newAnnotation);
    this.annotations.set(annotation.metricId, existing);
    this.createAuditEntry({
      actor: annotation.createdBy,
      actorType: 'human',
      action: 'create',
      entityType: 'Annotation',
      entityId: newAnnotation.id,
      newState: newAnnotation
    });
    return newAnnotation;
  }
}
