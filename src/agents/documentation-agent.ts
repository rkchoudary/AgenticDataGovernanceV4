/**
 * Documentation Agent
 * Generates compliance artifacts and audit evidence
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Document,
  CompliancePackage,
  DocumentType,
  DocumentFormat,
  ArtifactStatus,
  CDE,
  DQRule,
  Control,
  LineageNode,
  LineageEdge,
  Issue,
  RuleExecutionResult,
  CycleInstance
} from '../types/index.js';
import { IDocumentationAgent } from '../interfaces/agents.js';
import { IGovernanceRepository } from '../repository/governance-repository.js';

/**
 * Configuration for the Documentation Agent
 */
export interface DocumentationAgentConfig {
  defaultFormat: DocumentFormat;
  includeTimestamps: boolean;
  organizationName: string;
}

/**
 * Implementation of the Documentation Agent
 */
export class DocumentationAgent implements IDocumentationAgent {
  private repository: IGovernanceRepository;
  private config: DocumentationAgentConfig;

  constructor(
    repository: IGovernanceRepository,
    config: DocumentationAgentConfig
  ) {
    this.repository = repository;
    this.config = config;
  }

  /**
   * Generates a data dictionary for a specific report
   * Requirement 10.1: Generate data dictionary
   * 
   * @param reportId - The ID of the report to generate dictionary for
   * @returns Generated data dictionary document
   */
  async generateDataDictionary(reportId: string): Promise<Document> {
    const cdeInventory = this.repository.getCDEInventory(reportId);
    const requirementsDoc = this.repository.getRequirementsDocument(reportId);
    const reportCatalog = this.repository.getReportCatalog();
    
    if (!cdeInventory || !requirementsDoc) {
      throw new Error(`Missing required data for report ${reportId}: CDE inventory or requirements document not found`);
    }

    const report = reportCatalog?.reports.find(r => r.id === reportId);
    const reportName = report?.name || reportId;

    // Build data dictionary content
    let content = `# Data Dictionary: ${reportName}\n\n`;
    
    if (this.config.includeTimestamps) {
      content += `Generated: ${new Date().toISOString()}\n`;
      content += `Organization: ${this.config.organizationName}\n\n`;
    }

    content += `## Overview\n\n`;
    content += `This data dictionary provides comprehensive definitions and specifications for all critical data elements (CDEs) used in the ${reportName} regulatory report.\n\n`;

    content += `## Critical Data Elements\n\n`;
    
    // Sort CDEs by name for consistent ordering
    const sortedCDEs = [...cdeInventory.cdes].sort((a, b) => a.name.localeCompare(b.name));
    
    for (const cde of sortedCDEs) {
      content += `### ${cde.name}\n\n`;
      content += `**Element ID:** ${cde.elementId}\n\n`;
      content += `**Business Definition:** ${cde.businessDefinition}\n\n`;
      content += `**Criticality Rationale:** ${cde.criticalityRationale}\n\n`;
      
      if (cde.dataOwner) {
        content += `**Data Owner:** ${cde.dataOwner}\n\n`;
      }
      
      content += `**Status:** ${cde.status}\n\n`;
      
      if (cde.approvedBy && cde.approvedAt) {
        content += `**Approved By:** ${cde.approvedBy} on ${cde.approvedAt.toISOString()}\n\n`;
      }

      // Find corresponding data element from requirements
      const dataElement = requirementsDoc.dataElements.find(de => de.id === cde.elementId);
      if (dataElement) {
        content += `**Regulatory Definition:** ${dataElement.regulatoryDefinition}\n\n`;
        content += `**Data Type:** ${dataElement.dataType}\n\n`;
        content += `**Format:** ${dataElement.format}\n\n`;
        content += `**Mandatory:** ${dataElement.mandatory ? 'Yes' : 'No'}\n\n`;
        
        if (dataElement.calculationLogic) {
          content += `**Calculation Logic:** ${dataElement.calculationLogic}\n\n`;
        }
        
        if (dataElement.unit) {
          content += `**Unit:** ${dataElement.unit}\n\n`;
        }
      }

      content += `---\n\n`;
    }

    // Add data mappings section
    content += `## Data Mappings\n\n`;
    if (requirementsDoc.dataMappings && requirementsDoc.dataMappings.length > 0) {
      content += `| Element Name | Source System | Source Table | Source Field | Transformation |\n`;
      content += `|--------------|---------------|--------------|--------------|----------------|\n`;
      
      for (const mapping of requirementsDoc.dataMappings) {
        const element = requirementsDoc.dataElements.find(de => de.id === mapping.elementId);
        const elementName = element?.name || mapping.elementId;
        const transformation = mapping.transformationLogic || 'Direct mapping';
        
        content += `| ${elementName} | ${mapping.sourceSystem} | ${mapping.sourceTable} | ${mapping.sourceField} | ${transformation} |\n`;
      }
    } else {
      content += `No data mappings available for this report.\n`;
    }

    const document: Document = {
      id: uuidv4(),
      type: 'data_dictionary' as DocumentType,
      title: `Data Dictionary - ${reportName}`,
      content,
      format: this.config.defaultFormat,
      generatedAt: new Date(),
      version: 1
    };

    // Log the generation action
    this.repository.createAuditEntry({
      actor: 'DocumentationAgent',
      actorType: 'agent',
      action: 'generate_data_dictionary',
      entityType: 'Document',
      entityId: document.id,
      newState: document
    });

    return document;
  }

  /**
   * Generates lineage documentation for a specific report
   * Requirement 10.1: Generate lineage documentation
   * 
   * @param reportId - The ID of the report to generate lineage documentation for
   * @returns Generated lineage documentation document
   */
  async generateLineageDocumentation(reportId: string): Promise<Document> {
    const lineageGraph = this.repository.getLineageGraph(reportId);
    const cdeInventory = this.repository.getCDEInventory(reportId);
    const reportCatalog = this.repository.getReportCatalog();
    
    if (!lineageGraph) {
      throw new Error(`No lineage graph found for report ${reportId}`);
    }

    const report = reportCatalog?.reports.find(r => r.id === reportId);
    const reportName = report?.name || reportId;

    let content = `# Data Lineage Documentation: ${reportName}\n\n`;
    
    if (this.config.includeTimestamps) {
      content += `Generated: ${new Date().toISOString()}\n`;
      content += `Organization: ${this.config.organizationName}\n\n`;
    }

    content += `## Overview\n\n`;
    content += `This document provides comprehensive data lineage information for the ${reportName} regulatory report, showing the flow of data from source systems through transformations to final report fields.\n\n`;

    content += `## Lineage Summary\n\n`;
    content += `- **Total Nodes:** ${lineageGraph.nodes.length}\n`;
    content += `- **Total Edges:** ${lineageGraph.edges.length}\n`;
    content += `- **Captured At:** ${lineageGraph.capturedAt.toISOString()}\n`;
    content += `- **Version:** ${lineageGraph.version}\n\n`;

    // Group nodes by type
    const nodesByType = lineageGraph.nodes.reduce((acc, node) => {
      if (!acc[node.type]) acc[node.type] = [];
      acc[node.type].push(node);
      return acc;
    }, {} as Record<string, LineageNode[]>);

    content += `## Source Systems\n\n`;
    const sourceTables = nodesByType['source_table'] || [];
    if (sourceTables.length > 0) {
      content += `| Source Table | System | Business Term | Policies | Controls |\n`;
      content += `|--------------|--------|---------------|----------|----------|\n`;
      
      for (const node of sourceTables) {
        const businessTerm = node.businessTerm || 'N/A';
        const policies = node.policies?.join(', ') || 'N/A';
        const controls = node.controls?.join(', ') || 'N/A';
        
        content += `| ${node.name} | ${node.system} | ${businessTerm} | ${policies} | ${controls} |\n`;
      }
    } else {
      content += `No source tables documented.\n`;
    }

    content += `\n## Transformations\n\n`;
    const transformations = nodesByType['transformation'] || [];
    if (transformations.length > 0) {
      for (const transformation of transformations) {
        content += `### ${transformation.name}\n\n`;
        content += `**System:** ${transformation.system}\n\n`;
        
        if (transformation.businessTerm) {
          content += `**Business Term:** ${transformation.businessTerm}\n\n`;
        }
        
        // Find edges that involve this transformation
        const incomingEdges = lineageGraph.edges.filter(e => e.targetNodeId === transformation.id);
        const outgoingEdges = lineageGraph.edges.filter(e => e.sourceNodeId === transformation.id);
        
        if (incomingEdges.length > 0) {
          content += `**Input Sources:**\n`;
          for (const edge of incomingEdges) {
            const sourceNode = lineageGraph.nodes.find(n => n.id === edge.sourceNodeId);
            content += `- ${sourceNode?.name || edge.sourceNodeId} (${edge.transformationType})\n`;
            if (edge.transformationLogic) {
              content += `  - Logic: ${edge.transformationLogic}\n`;
            }
          }
          content += `\n`;
        }
        
        if (outgoingEdges.length > 0) {
          content += `**Output Targets:**\n`;
          for (const edge of outgoingEdges) {
            const targetNode = lineageGraph.nodes.find(n => n.id === edge.targetNodeId);
            content += `- ${targetNode?.name || edge.targetNodeId} (${edge.transformationType})\n`;
            if (edge.transformationLogic) {
              content += `  - Logic: ${edge.transformationLogic}\n`;
            }
          }
          content += `\n`;
        }
      }
    } else {
      content += `No transformations documented.\n\n`;
    }

    content += `## Report Fields\n\n`;
    const reportFields = nodesByType['report_field'] || [];
    if (reportFields.length > 0 && cdeInventory) {
      content += `| Report Field | System | Business Term | CDE Status | Data Owner |\n`;
      content += `|--------------|--------|---------------|------------|------------|\n`;
      
      for (const field of reportFields) {
        const businessTerm = field.businessTerm || 'N/A';
        
        // Find corresponding CDE
        const cde = cdeInventory.cdes.find(c => 
          c.name === field.name || c.elementId === field.id
        );
        const cdeStatus = cde?.status || 'Not CDE';
        const dataOwner = cde?.dataOwner || 'N/A';
        
        content += `| ${field.name} | ${field.system} | ${businessTerm} | ${cdeStatus} | ${dataOwner} |\n`;
      }
    } else {
      content += `No report fields documented.\n`;
    }

    content += `\n## Critical Data Element Lineage\n\n`;
    if (cdeInventory) {
      for (const cde of cdeInventory.cdes) {
        const reportField = reportFields.find(f => 
          f.name === cde.name || f.id === cde.elementId
        );
        
        if (reportField) {
          content += `### ${cde.name}\n\n`;
          content += this.generateCDELineagePath(lineageGraph, reportField.id);
          content += `\n`;
        }
      }
    }

    const document: Document = {
      id: uuidv4(),
      type: 'lineage_documentation' as DocumentType,
      title: `Data Lineage Documentation - ${reportName}`,
      content,
      format: this.config.defaultFormat,
      generatedAt: new Date(),
      version: 1
    };

    // Log the generation action
    this.repository.createAuditEntry({
      actor: 'DocumentationAgent',
      actorType: 'agent',
      action: 'generate_lineage_documentation',
      entityType: 'Document',
      entityId: document.id,
      newState: document
    });

    return document;
  }

  /**
   * Generates a quality assurance report for a specific cycle
   * Requirement 10.1: Generate quality assurance reports
   * 
   * @param cycleId - The ID of the cycle to generate QA report for
   * @returns Generated quality assurance report document
   */
  async generateQualityAssuranceReport(cycleId: string): Promise<Document> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const reportCatalog = this.repository.getReportCatalog();
    const report = reportCatalog?.reports.find(r => r.id === cycle.reportId);
    const reportName = report?.name || cycle.reportId;

    const dqRuleRepo = this.repository.getDQRuleRepository(cycle.reportId);
    const cdeInventory = this.repository.getCDEInventory(cycle.reportId);
    const issues = this.repository.getAllIssues().filter(i => 
      i.impactedReports.includes(cycle.reportId)
    );

    let content = `# Quality Assurance Report: ${reportName}\n\n`;
    
    if (this.config.includeTimestamps) {
      content += `Generated: ${new Date().toISOString()}\n`;
      content += `Organization: ${this.config.organizationName}\n`;
      content += `Cycle ID: ${cycleId}\n`;
      content += `Period End: ${cycle.periodEnd.toISOString()}\n\n`;
    }

    content += `## Executive Summary\n\n`;
    content += `This quality assurance report provides a comprehensive assessment of data quality for the ${reportName} regulatory report for the period ending ${cycle.periodEnd.toISOString()}.\n\n`;

    // Quality metrics summary
    content += `## Quality Metrics Summary\n\n`;
    if (dqRuleRepo && cdeInventory) {
      const totalRules = dqRuleRepo.rules.length;
      const enabledRules = dqRuleRepo.rules.filter(r => r.enabled).length;
      const totalCDEs = cdeInventory.cdes.length;
      
      content += `- **Total Data Quality Rules:** ${totalRules}\n`;
      content += `- **Active Rules:** ${enabledRules}\n`;
      content += `- **Critical Data Elements:** ${totalCDEs}\n`;
      content += `- **Open Issues:** ${issues.filter(i => i.status === 'open').length}\n`;
      content += `- **Critical Issues:** ${issues.filter(i => i.severity === 'critical').length}\n\n`;
    }

    // Data quality rules status
    content += `## Data Quality Rules Assessment\n\n`;
    if (dqRuleRepo) {
      const rulesByDimension = dqRuleRepo.rules.reduce((acc, rule) => {
        if (!acc[rule.dimension]) acc[rule.dimension] = [];
        acc[rule.dimension].push(rule);
        return acc;
      }, {} as Record<string, DQRule[]>);

      content += `| Dimension | Total Rules | Active Rules | Critical Rules |\n`;
      content += `|-----------|-------------|--------------|----------------|\n`;
      
      for (const [dimension, rules] of Object.entries(rulesByDimension)) {
        const activeRules = rules.filter(r => r.enabled).length;
        const criticalRules = rules.filter(r => r.severity === 'critical').length;
        
        content += `| ${dimension} | ${rules.length} | ${activeRules} | ${criticalRules} |\n`;
      }
      content += `\n`;
    }

    // Issues analysis
    content += `## Issues Analysis\n\n`;
    if (issues.length > 0) {
      const issuesBySeverity = issues.reduce((acc, issue) => {
        if (!acc[issue.severity]) acc[issue.severity] = [];
        acc[issue.severity].push(issue);
        return acc;
      }, {} as Record<string, Issue[]>);

      content += `### Issues by Severity\n\n`;
      content += `| Severity | Count | Open | In Progress | Resolved |\n`;
      content += `|----------|-------|------|-------------|----------|\n`;
      
      for (const [severity, severityIssues] of Object.entries(issuesBySeverity)) {
        const open = severityIssues.filter(i => i.status === 'open').length;
        const inProgress = severityIssues.filter(i => i.status === 'in_progress').length;
        const resolved = severityIssues.filter(i => ['resolved', 'closed'].includes(i.status)).length;
        
        content += `| ${severity} | ${severityIssues.length} | ${open} | ${inProgress} | ${resolved} |\n`;
      }
      content += `\n`;

      // Critical issues detail
      const criticalIssues = issues.filter(i => i.severity === 'critical');
      if (criticalIssues.length > 0) {
        content += `### Critical Issues Detail\n\n`;
        for (const issue of criticalIssues) {
          content += `#### ${issue.title}\n\n`;
          content += `**Status:** ${issue.status}\n\n`;
          content += `**Description:** ${issue.description}\n\n`;
          content += `**Created:** ${issue.createdAt.toISOString()}\n\n`;
          if (issue.assignee) {
            content += `**Assignee:** ${issue.assignee}\n\n`;
          }
          if (issue.dueDate) {
            content += `**Due Date:** ${issue.dueDate.toISOString()}\n\n`;
          }
          content += `---\n\n`;
        }
      }
    } else {
      content += `No issues identified for this cycle.\n\n`;
    }

    // Recommendations
    content += `## Recommendations\n\n`;
    const openCriticalIssues = issues.filter(i => i.severity === 'critical' && i.status === 'open').length;
    const openHighIssues = issues.filter(i => i.severity === 'high' && i.status === 'open').length;
    
    if (openCriticalIssues > 0) {
      content += `- **URGENT:** ${openCriticalIssues} critical issues require immediate attention before report submission.\n`;
    }
    if (openHighIssues > 0) {
      content += `- ${openHighIssues} high-severity issues should be resolved to improve data quality.\n`;
    }
    if (openCriticalIssues === 0 && openHighIssues === 0) {
      content += `- Data quality appears satisfactory for report submission.\n`;
    }
    
    content += `- Continue monitoring data quality rules and address any new issues promptly.\n`;
    content += `- Review and update data quality thresholds based on historical performance.\n\n`;

    const document: Document = {
      id: uuidv4(),
      type: 'quality_assurance_report' as DocumentType,
      title: `Quality Assurance Report - ${reportName}`,
      content,
      format: this.config.defaultFormat,
      generatedAt: new Date(),
      version: 1
    };

    // Log the generation action
    this.repository.createAuditEntry({
      actor: 'DocumentationAgent',
      actorType: 'agent',
      action: 'generate_quality_assurance_report',
      entityType: 'Document',
      entityId: document.id,
      newState: document
    });

    return document;
  }

  /**
   * Generates a control effectiveness report for a specific cycle
   * Requirement 10.1: Generate control effectiveness reports
   * 
   * @param cycleId - The ID of the cycle to generate control effectiveness report for
   * @returns Generated control effectiveness report document
   */
  async generateControlEffectivenessReport(cycleId: string): Promise<Document> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const reportCatalog = this.repository.getReportCatalog();
    const report = reportCatalog?.reports.find(r => r.id === cycle.reportId);
    const reportName = report?.name || cycle.reportId;

    const controlMatrix = this.repository.getControlMatrix(cycle.reportId);
    if (!controlMatrix) {
      throw new Error(`No control matrix found for report ${cycle.reportId}`);
    }

    let content = `# Control Effectiveness Report: ${reportName}\n\n`;
    
    if (this.config.includeTimestamps) {
      content += `Generated: ${new Date().toISOString()}\n`;
      content += `Organization: ${this.config.organizationName}\n`;
      content += `Cycle ID: ${cycleId}\n`;
      content += `Period End: ${cycle.periodEnd.toISOString()}\n\n`;
    }

    content += `## Executive Summary\n\n`;
    content += `This control effectiveness report provides an assessment of all controls related to the ${reportName} regulatory report for the period ending ${cycle.periodEnd.toISOString()}.\n\n`;

    // Control summary statistics
    const totalControls = controlMatrix.controls.length;
    const activeControls = controlMatrix.controls.filter(c => c.status === 'active').length;
    const compensatingControls = controlMatrix.controls.filter(c => c.status === 'compensating').length;
    const automatedControls = controlMatrix.controls.filter(c => c.automationStatus === 'fully_automated').length;

    content += `## Control Summary\n\n`;
    content += `- **Total Controls:** ${totalControls}\n`;
    content += `- **Active Controls:** ${activeControls}\n`;
    content += `- **Compensating Controls:** ${compensatingControls}\n`;
    content += `- **Fully Automated Controls:** ${automatedControls}\n`;
    content += `- **Last Reviewed:** ${controlMatrix.lastReviewed.toISOString()}\n`;
    content += `- **Reviewed By:** ${controlMatrix.reviewedBy}\n\n`;

    // Controls by type
    content += `## Controls by Type\n\n`;
    const controlsByType = controlMatrix.controls.reduce((acc, control) => {
      if (!acc[control.type]) acc[control.type] = [];
      acc[control.type].push(control);
      return acc;
    }, {} as Record<string, Control[]>);

    content += `| Control Type | Count | Active | Compensating | Automated |\n`;
    content += `|--------------|-------|--------|--------------|----------|\n`;
    
    for (const [type, controls] of Object.entries(controlsByType)) {
      const active = controls.filter(c => c.status === 'active').length;
      const compensating = controls.filter(c => c.status === 'compensating').length;
      const automated = controls.filter(c => c.automationStatus === 'fully_automated').length;
      
      content += `| ${type} | ${controls.length} | ${active} | ${compensating} | ${automated} |\n`;
    }
    content += `\n`;

    // Control effectiveness assessment
    content += `## Control Effectiveness Assessment\n\n`;
    
    for (const control of controlMatrix.controls) {
      content += `### ${control.name}\n\n`;
      content += `**Type:** ${control.type} | **Category:** ${control.category} | **Status:** ${control.status}\n\n`;
      content += `**Description:** ${control.description}\n\n`;
      content += `**Owner:** ${control.owner}\n\n`;
      content += `**Frequency:** ${control.frequency}\n\n`;
      content += `**Automation Status:** ${control.automationStatus}\n\n`;
      
      if (control.linkedCDEs.length > 0) {
        content += `**Linked CDEs:** ${control.linkedCDEs.join(', ')}\n\n`;
      }
      
      if (control.linkedProcesses.length > 0) {
        content += `**Linked Processes:** ${control.linkedProcesses.join(', ')}\n\n`;
      }

      // Evidence assessment
      if (control.evidence.length > 0) {
        content += `**Recent Evidence:**\n\n`;
        
        // Sort evidence by execution date (most recent first)
        const sortedEvidence = [...control.evidence].sort((a, b) => 
          b.executionDate.getTime() - a.executionDate.getTime()
        );
        
        // Show last 3 executions
        const recentEvidence = sortedEvidence.slice(0, 3);
        
        content += `| Execution Date | Outcome | Executed By | Details |\n`;
        content += `|----------------|---------|-------------|----------|\n`;
        
        for (const evidence of recentEvidence) {
          const executionDate = evidence.executionDate.toISOString().split('T')[0];
          content += `| ${executionDate} | ${evidence.outcome} | ${evidence.executedBy} | ${evidence.details} |\n`;
        }
        content += `\n`;
        
        // Calculate effectiveness metrics
        const totalExecutions = control.evidence.length;
        const passedExecutions = control.evidence.filter(e => e.outcome === 'pass').length;
        const failedExecutions = control.evidence.filter(e => e.outcome === 'fail').length;
        const exceptionExecutions = control.evidence.filter(e => e.outcome === 'exception').length;
        
        const passRate = totalExecutions > 0 ? ((passedExecutions / totalExecutions) * 100).toFixed(1) : '0';
        
        content += `**Effectiveness Metrics:**\n`;
        content += `- Pass Rate: ${passRate}% (${passedExecutions}/${totalExecutions})\n`;
        content += `- Failed Executions: ${failedExecutions}\n`;
        content += `- Exceptions: ${exceptionExecutions}\n\n`;
      } else {
        content += `**No execution evidence available.**\n\n`;
      }

      // Compensating control details
      if (control.status === 'compensating' && control.expirationDate) {
        content += `**Compensating Control Details:**\n`;
        content += `- Expiration Date: ${control.expirationDate.toISOString()}\n`;
        const daysUntilExpiration = Math.ceil((control.expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
        content += `- Days Until Expiration: ${daysUntilExpiration}\n\n`;
      }

      content += `---\n\n`;
    }

    // Recommendations
    content += `## Recommendations\n\n`;
    
    const failedControls = controlMatrix.controls.filter(c => 
      c.evidence.some(e => e.outcome === 'fail')
    );
    const expiringCompensatingControls = controlMatrix.controls.filter(c => 
      c.status === 'compensating' && 
      c.expirationDate && 
      c.expirationDate.getTime() - new Date().getTime() < 30 * 24 * 60 * 60 * 1000 // 30 days
    );
    
    if (failedControls.length > 0) {
      content += `- **Review Failed Controls:** ${failedControls.length} controls have recent failures and require attention.\n`;
    }
    
    if (expiringCompensatingControls.length > 0) {
      content += `- **Expiring Compensating Controls:** ${expiringCompensatingControls.length} compensating controls expire within 30 days.\n`;
    }
    
    if (compensatingControls > 0) {
      content += `- **Reduce Compensating Controls:** Work to resolve underlying issues and transition ${compensatingControls} compensating controls to permanent controls.\n`;
    }
    
    const manualControls = controlMatrix.controls.filter(c => c.automationStatus === 'manual').length;
    if (manualControls > 0) {
      content += `- **Automation Opportunities:** Consider automating ${manualControls} manual controls to improve efficiency and reduce human error.\n`;
    }

    const document: Document = {
      id: uuidv4(),
      type: 'control_effectiveness_report' as DocumentType,
      title: `Control Effectiveness Report - ${reportName}`,
      content,
      format: this.config.defaultFormat,
      generatedAt: new Date(),
      version: 1
    };

    // Log the generation action
    this.repository.createAuditEntry({
      actor: 'DocumentationAgent',
      actorType: 'agent',
      action: 'generate_control_effectiveness_report',
      entityType: 'Document',
      entityId: document.id,
      newState: document
    });

    return document;
  }

  /**
   * Generates a BCBS 239 compliance mapping for a specific report
   * Requirement 10.4: Generate BCBS 239 compliance checklist with references
   * 
   * @param reportId - The ID of the report to generate BCBS 239 mapping for
   * @returns Generated BCBS 239 compliance mapping document
   */
  async generateBCBS239ComplianceMapping(reportId: string): Promise<Document> {
    const reportCatalog = this.repository.getReportCatalog();
    const report = reportCatalog?.reports.find(r => r.id === reportId);
    const reportName = report?.name || reportId;

    const cdeInventory = this.repository.getCDEInventory(reportId);
    const dqRuleRepo = this.repository.getDQRuleRepository(reportId);
    const lineageGraph = this.repository.getLineageGraph(reportId);
    const controlMatrix = this.repository.getControlMatrix(reportId);

    let content = `# BCBS 239 Compliance Mapping: ${reportName}\n\n`;
    
    if (this.config.includeTimestamps) {
      content += `Generated: ${new Date().toISOString()}\n`;
      content += `Organization: ${this.config.organizationName}\n\n`;
    }

    content += `## Overview\n\n`;
    content += `This document provides a comprehensive mapping of the ${reportName} regulatory report against the Basel Committee on Banking Supervision's Principles for Effective Risk Data Aggregation and Risk Reporting (BCBS 239).\n\n`;

    // BCBS 239 Principles mapping
    const bcbs239Principles = [
      {
        principle: 'Principle 1: Governance',
        description: 'A bank\'s risk data aggregation capabilities and risk reporting practices should be subject to strong governance arrangements.',
        requirements: [
          'Clear roles and responsibilities for risk data management',
          'Board and senior management oversight',
          'Risk data governance framework'
        ]
      },
      {
        principle: 'Principle 2: Data Architecture and IT Infrastructure',
        description: 'A bank should design, build and maintain data architecture and IT infrastructure which fully supports its risk data aggregation capabilities.',
        requirements: [
          'Robust data architecture',
          'Automated data flows where possible',
          'Data integration capabilities'
        ]
      },
      {
        principle: 'Principle 3: Accuracy and Integrity',
        description: 'A bank should be able to generate accurate and reliable risk data to meet normal and stress/crisis reporting accuracy requirements.',
        requirements: [
          'Data validation controls',
          'Reconciliation processes',
          'Error detection and correction'
        ]
      },
      {
        principle: 'Principle 4: Completeness',
        description: 'A bank should be able to capture and aggregate all material risk data across the banking group.',
        requirements: [
          'Complete data capture',
          'Comprehensive coverage',
          'Gap identification and remediation'
        ]
      },
      {
        principle: 'Principle 5: Timeliness',
        description: 'A bank should be able to generate aggregate and up-to-date risk data in a timely manner.',
        requirements: [
          'Timely data processing',
          'Automated reporting where possible',
          'Deadline management'
        ]
      },
      {
        principle: 'Principle 6: Adaptability',
        description: 'A bank should be able to generate aggregate risk data to meet a broad range of on-demand, ad hoc risk management reporting requests.',
        requirements: [
          'Flexible reporting capabilities',
          'Ad hoc query support',
          'Scalable infrastructure'
        ]
      },
      {
        principle: 'Principle 7: Accuracy',
        description: 'Risk management reports should be accurate and precise.',
        requirements: [
          'Data accuracy validation',
          'Precision requirements',
          'Quality assurance processes'
        ]
      },
      {
        principle: 'Principle 8: Comprehensiveness',
        description: 'Risk management reports should cover all material risk areas within the organization.',
        requirements: [
          'Complete risk coverage',
          'Material risk identification',
          'Comprehensive reporting scope'
        ]
      },
      {
        principle: 'Principle 9: Clarity and Usefulness',
        description: 'Risk management reports should communicate information effectively.',
        requirements: [
          'Clear presentation',
          'Useful information',
          'Effective communication'
        ]
      },
      {
        principle: 'Principle 10: Frequency',
        description: 'Risk management reports should be produced at a frequency that meets the needs of the recipients.',
        requirements: [
          'Appropriate frequency',
          'Recipient needs alignment',
          'Regular reporting schedule'
        ]
      },
      {
        principle: 'Principle 11: Distribution',
        description: 'Risk management reports should be distributed to the relevant parties.',
        requirements: [
          'Appropriate distribution',
          'Relevant recipients',
          'Secure delivery'
        ]
      }
    ];

    content += `## BCBS 239 Compliance Assessment\n\n`;

    for (const principle of bcbs239Principles) {
      content += `### ${principle.principle}\n\n`;
      content += `**Description:** ${principle.description}\n\n`;
      
      content += `**Compliance Status:**\n\n`;
      
      // Assess compliance based on available artifacts
      let complianceScore = 0;
      let maxScore = principle.requirements.length;
      let evidenceItems: string[] = [];

      // Map requirements to available evidence
      for (const requirement of principle.requirements) {
        let hasEvidence = false;
        let evidenceDescription = '';

        // Check different types of evidence based on the requirement
        if (requirement.toLowerCase().includes('data validation') || 
            requirement.toLowerCase().includes('accuracy') ||
            requirement.toLowerCase().includes('quality assurance')) {
          if (dqRuleRepo && dqRuleRepo.rules.length > 0) {
            hasEvidence = true;
            evidenceDescription = `${dqRuleRepo.rules.length} data quality rules implemented`;
            complianceScore++;
          }
        }
        
        if (requirement.toLowerCase().includes('completeness') || 
            requirement.toLowerCase().includes('complete')) {
          if (cdeInventory && cdeInventory.cdes.length > 0) {
            hasEvidence = true;
            evidenceDescription = `${cdeInventory.cdes.length} critical data elements identified and managed`;
            complianceScore++;
          }
        }
        
        if (requirement.toLowerCase().includes('data architecture') || 
            requirement.toLowerCase().includes('data flows') ||
            requirement.toLowerCase().includes('integration')) {
          if (lineageGraph && lineageGraph.nodes.length > 0) {
            hasEvidence = true;
            evidenceDescription = `Data lineage documented with ${lineageGraph.nodes.length} nodes`;
            complianceScore++;
          }
        }
        
        if (requirement.toLowerCase().includes('governance') || 
            requirement.toLowerCase().includes('controls') ||
            requirement.toLowerCase().includes('oversight')) {
          if (controlMatrix && controlMatrix.controls.length > 0) {
            hasEvidence = true;
            evidenceDescription = `${controlMatrix.controls.length} governance controls implemented`;
            complianceScore++;
          }
        }
        
        if (requirement.toLowerCase().includes('reconciliation') || 
            requirement.toLowerCase().includes('error detection')) {
          if (dqRuleRepo) {
            const reconciliationRules = dqRuleRepo.rules.filter(r => 
              r.logic.type === 'reconciliation' || r.logic.type === 'referential_check'
            );
            if (reconciliationRules.length > 0) {
              hasEvidence = true;
              evidenceDescription = `${reconciliationRules.length} reconciliation and referential integrity rules`;
              complianceScore++;
            }
          }
        }

        const status = hasEvidence ? '✅' : '❌';
        evidenceItems.push(`- ${status} ${requirement}: ${evidenceDescription || 'No evidence found'}`);
      }

      evidenceItems.forEach(item => {
        content += `${item}\n`;
      });

      const compliancePercentage = maxScore > 0 ? ((complianceScore / maxScore) * 100).toFixed(0) : '0';
      content += `\n**Compliance Score:** ${complianceScore}/${maxScore} (${compliancePercentage}%)\n\n`;
      
      content += `---\n\n`;
    }

    // Overall compliance summary
    const totalPrinciples = bcbs239Principles.length;
    let overallScore = 0;
    
    // Calculate overall compliance (simplified assessment)
    if (cdeInventory && cdeInventory.cdes.length > 0) overallScore++;
    if (dqRuleRepo && dqRuleRepo.rules.length > 0) overallScore++;
    if (lineageGraph && lineageGraph.nodes.length > 0) overallScore++;
    if (controlMatrix && controlMatrix.controls.length > 0) overallScore++;
    
    // Additional scoring based on completeness
    if (dqRuleRepo && dqRuleRepo.rules.filter(r => r.enabled).length > 0) overallScore++;
    if (controlMatrix && controlMatrix.controls.filter(c => c.status === 'active').length > 0) overallScore++;

    const maxOverallScore = 6; // Based on the scoring criteria above
    const overallPercentage = ((overallScore / maxOverallScore) * 100).toFixed(0);

    content += `## Overall Compliance Summary\n\n`;
    content += `**Overall Compliance Score:** ${overallScore}/${maxOverallScore} (${overallPercentage}%)\n\n`;

    content += `### Key Strengths\n\n`;
    if (cdeInventory && cdeInventory.cdes.length > 0) {
      content += `- Critical data elements are identified and managed\n`;
    }
    if (dqRuleRepo && dqRuleRepo.rules.length > 0) {
      content += `- Data quality rules are implemented and monitored\n`;
    }
    if (lineageGraph && lineageGraph.nodes.length > 0) {
      content += `- Data lineage is documented and traceable\n`;
    }
    if (controlMatrix && controlMatrix.controls.length > 0) {
      content += `- Governance controls are established\n`;
    }

    content += `\n### Areas for Improvement\n\n`;
    if (!cdeInventory || cdeInventory.cdes.length === 0) {
      content += `- Establish comprehensive critical data element inventory\n`;
    }
    if (!dqRuleRepo || dqRuleRepo.rules.length === 0) {
      content += `- Implement data quality validation rules\n`;
    }
    if (!lineageGraph || lineageGraph.nodes.length === 0) {
      content += `- Document complete data lineage from source to report\n`;
    }
    if (!controlMatrix || controlMatrix.controls.length === 0) {
      content += `- Establish governance and control framework\n`;
    }

    content += `\n### Recommendations\n\n`;
    content += `1. **Enhance Data Quality Framework:** Implement comprehensive data quality rules covering all BCBS 239 dimensions\n`;
    content += `2. **Strengthen Governance:** Establish clear roles, responsibilities, and oversight mechanisms\n`;
    content += `3. **Improve Documentation:** Maintain up-to-date documentation of all data processes and controls\n`;
    content += `4. **Regular Assessment:** Conduct periodic BCBS 239 compliance assessments and gap analyses\n`;
    content += `5. **Automation:** Increase automation of data validation and reporting processes\n\n`;

    const document: Document = {
      id: uuidv4(),
      type: 'bcbs239_compliance_mapping' as DocumentType,
      title: `BCBS 239 Compliance Mapping - ${reportName}`,
      content,
      format: this.config.defaultFormat,
      generatedAt: new Date(),
      version: 1
    };

    // Log the generation action
    this.repository.createAuditEntry({
      actor: 'DocumentationAgent',
      actorType: 'agent',
      action: 'generate_bcbs239_compliance_mapping',
      entityType: 'Document',
      entityId: document.id,
      newState: document
    });

    return document;
  }

  /**
   * Compiles a complete compliance package for a specific cycle
   * Requirement 10.2: Pull from single source of truth for consistency
   * Requirement 10.3: Present compliance package for human review before finalization
   * 
   * @param cycleId - The ID of the cycle to compile compliance package for
   * @returns Generated compliance package
   */
  async compileCompliancePackage(cycleId: string): Promise<CompliancePackage> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const reportCatalog = this.repository.getReportCatalog();
    const report = reportCatalog?.reports.find(r => r.id === cycle.reportId);
    const reportName = report?.name || cycle.reportId;

    // Generate all required documents from single source of truth
    const documents: Document[] = [];

    try {
      // 1. Data Dictionary
      const dataDictionary = await this.generateDataDictionary(cycle.reportId);
      documents.push(dataDictionary);

      // 2. Lineage Documentation
      const lineageDoc = await this.generateLineageDocumentation(cycle.reportId);
      documents.push(lineageDoc);

      // 3. Quality Assurance Report
      const qaReport = await this.generateQualityAssuranceReport(cycleId);
      documents.push(qaReport);

      // 4. Control Effectiveness Report
      const controlReport = await this.generateControlEffectivenessReport(cycleId);
      documents.push(controlReport);

      // 5. BCBS 239 Compliance Mapping
      const bcbsMapping = await this.generateBCBS239ComplianceMapping(cycle.reportId);
      documents.push(bcbsMapping);

      // 6. Generate package summary document
      const summaryDoc = this.generatePackageSummary(cycleId, reportName, documents);
      documents.push(summaryDoc);

    } catch (error) {
      // Log the error and create a partial package
      this.repository.createAuditEntry({
        actor: 'DocumentationAgent',
        actorType: 'agent',
        action: 'compile_compliance_package_error',
        entityType: 'CompliancePackage',
        entityId: cycleId,
        rationale: `Error generating documents: ${error instanceof Error ? error.message : 'Unknown error'}`
      });

      throw new Error(`Failed to compile compliance package: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create compliance package with pending_review status (Requirement 10.3)
    const compliancePackage: CompliancePackage = {
      id: uuidv4(),
      cycleId,
      reportId: cycle.reportId,
      documents,
      status: 'pending_review' as ArtifactStatus,
      createdAt: new Date()
    };

    // Store the package in the repository (single source of truth - Requirement 10.2)
    this.repository.setCompliancePackage(cycleId, compliancePackage);

    // Log the compilation action
    this.repository.createAuditEntry({
      actor: 'DocumentationAgent',
      actorType: 'agent',
      action: 'compile_compliance_package',
      entityType: 'CompliancePackage',
      entityId: compliancePackage.id,
      newState: compliancePackage,
      rationale: `Compiled compliance package with ${documents.length} documents`
    });

    return compliancePackage;
  }

  /**
   * Approves a compliance package after human review
   * Requirement 10.3: Present compliance package for human review before finalization
   * 
   * @param cycleId - The ID of the cycle
   * @param reviewer - The person reviewing the package
   * @param modifications - Optional modifications to apply before approval
   */
  async approveCompliancePackage(
    cycleId: string,
    reviewer: string,
    modifications?: {
      excludeDocuments?: string[];
      additionalDocuments?: Document[];
    }
  ): Promise<CompliancePackage> {
    const existingPackage = this.repository.getCompliancePackage(cycleId);
    if (!existingPackage) {
      throw new Error(`No compliance package found for cycle ${cycleId}`);
    }

    if (existingPackage.status !== 'pending_review') {
      throw new Error(`Cannot approve package with status '${existingPackage.status}'`);
    }

    const previousState = { ...existingPackage };
    let updatedDocuments = [...existingPackage.documents];

    // Apply modifications if provided
    if (modifications) {
      // Remove excluded documents
      if (modifications.excludeDocuments) {
        updatedDocuments = updatedDocuments.filter(
          doc => !modifications.excludeDocuments!.includes(doc.id)
        );
      }

      // Add additional documents
      if (modifications.additionalDocuments) {
        updatedDocuments.push(...modifications.additionalDocuments);
      }
    }

    const approvedPackage: CompliancePackage = {
      ...existingPackage,
      documents: updatedDocuments,
      status: 'approved' as ArtifactStatus,
      reviewedBy: reviewer,
      reviewedAt: new Date()
    };

    this.repository.setCompliancePackage(cycleId, approvedPackage);

    // Log the approval action
    this.repository.createAuditEntry({
      actor: reviewer,
      actorType: 'human',
      action: 'approve_compliance_package',
      entityType: 'CompliancePackage',
      entityId: approvedPackage.id,
      previousState,
      newState: approvedPackage,
      rationale: modifications ? 'Approved with modifications' : 'Approved without modifications'
    });

    return approvedPackage;
  }

  /**
   * Submits a compliance package for review
   * Requirement 10.3: Present compliance package for human review
   * 
   * @param cycleId - The ID of the cycle
   * @param submitter - The person submitting for review
   */
  async submitPackageForReview(cycleId: string, submitter: string): Promise<CompliancePackage> {
    const existingPackage = this.repository.getCompliancePackage(cycleId);
    if (!existingPackage) {
      throw new Error(`No compliance package found for cycle ${cycleId}`);
    }

    if (existingPackage.status !== 'draft') {
      throw new Error(`Cannot submit package with status '${existingPackage.status}' for review`);
    }

    const previousState = { ...existingPackage };
    const updatedPackage: CompliancePackage = {
      ...existingPackage,
      status: 'pending_review' as ArtifactStatus
    };

    this.repository.setCompliancePackage(cycleId, updatedPackage);

    // Log the submission action
    this.repository.createAuditEntry({
      actor: submitter,
      actorType: 'human',
      action: 'submit_package_for_review',
      entityType: 'CompliancePackage',
      entityId: updatedPackage.id,
      previousState,
      newState: updatedPackage,
      rationale: 'Submitted compliance package for human review'
    });

    return updatedPackage;
  }

  /**
   * Generates a package summary document
   * Helper method for compliance package compilation
   */
  private generatePackageSummary(cycleId: string, reportName: string, documents: Document[]): Document {
    let content = `# Compliance Package Summary: ${reportName}\n\n`;
    
    if (this.config.includeTimestamps) {
      content += `Generated: ${new Date().toISOString()}\n`;
      content += `Organization: ${this.config.organizationName}\n`;
      content += `Cycle ID: ${cycleId}\n\n`;
    }

    content += `## Package Overview\n\n`;
    content += `This compliance package contains all required documentation and evidence for the ${reportName} regulatory report submission.\n\n`;

    content += `## Included Documents\n\n`;
    content += `| Document Type | Title | Version | Generated |\n`;
    content += `|---------------|-------|---------|----------|\n`;
    
    for (const doc of documents) {
      const generatedDate = doc.generatedAt.toISOString().split('T')[0];
      content += `| ${doc.type} | ${doc.title} | ${doc.version} | ${generatedDate} |\n`;
    }

    content += `\n## Package Statistics\n\n`;
    content += `- **Total Documents:** ${documents.length}\n`;
    content += `- **Package Generated:** ${new Date().toISOString()}\n`;
    content += `- **Status:** Ready for Review\n\n`;

    content += `## Document Descriptions\n\n`;
    
    const documentDescriptions = {
      'data_dictionary': 'Comprehensive definitions and specifications for all critical data elements',
      'lineage_documentation': 'Complete data flow documentation from source systems to report fields',
      'quality_assurance_report': 'Assessment of data quality metrics and issue resolution status',
      'control_effectiveness_report': 'Evaluation of governance controls and their effectiveness',
      'bcbs239_compliance_mapping': 'Mapping against BCBS 239 principles with compliance assessment'
    };

    for (const doc of documents) {
      if (doc.type !== 'package_summary') {
        const description = documentDescriptions[doc.type as keyof typeof documentDescriptions] || 'Supporting documentation';
        content += `### ${doc.title}\n\n`;
        content += `${description}\n\n`;
      }
    }

    content += `## Review Instructions\n\n`;
    content += `1. Review each document for completeness and accuracy\n`;
    content += `2. Verify that all regulatory requirements are addressed\n`;
    content += `3. Confirm that data quality issues have been resolved or documented\n`;
    content += `4. Validate control effectiveness evidence\n`;
    content += `5. Approve the package for submission or request modifications\n\n`;

    content += `## Approval Checklist\n\n`;
    content += `- [ ] Data dictionary is complete and accurate\n`;
    content += `- [ ] Data lineage is documented and traceable\n`;
    content += `- [ ] Quality assurance report shows acceptable data quality\n`;
    content += `- [ ] Control effectiveness is demonstrated\n`;
    content += `- [ ] BCBS 239 compliance requirements are met\n`;
    content += `- [ ] All critical issues have been resolved\n`;
    content += `- [ ] Package is ready for regulatory submission\n\n`;

    return {
      id: uuidv4(),
      type: 'package_summary' as any, // Not in the enum but used internally
      title: `Compliance Package Summary - ${reportName}`,
      content,
      format: this.config.defaultFormat,
      generatedAt: new Date(),
      version: 1
    };
  }

  /**
   * Generates a lineage path for a specific CDE
   * Helper method for lineage documentation
   */
  private generateCDELineagePath(lineageGraph: any, reportFieldId: string): string {
    let content = '';
    
    // Trace backwards from report field to sources
    const visited = new Set<string>();
    const path: string[] = [];
    
    const tracePath = (nodeId: string, depth: number = 0): void => {
      if (visited.has(nodeId) || depth > 10) return; // Prevent infinite loops
      visited.add(nodeId);
      
      const node = lineageGraph.nodes.find((n: LineageNode) => n.id === nodeId);
      if (!node) return;
      
      const indent = '  '.repeat(depth);
      path.push(`${indent}- ${node.name} (${node.type}, ${node.system})`);
      
      // Find incoming edges
      const incomingEdges = lineageGraph.edges.filter((e: LineageEdge) => e.targetNodeId === nodeId);
      for (const edge of incomingEdges) {
        if (edge.transformationLogic) {
          path.push(`${indent}  └─ Transformation: ${edge.transformationLogic}`);
        }
        tracePath(edge.sourceNodeId, depth + 1);
      }
    };
    
    tracePath(reportFieldId);
    content += path.reverse().join('\n') + '\n';
    
    return content;
  }
}