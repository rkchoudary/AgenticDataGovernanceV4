"""
Documentation Agent tools for the Agentic Data Governance System.

This module defines Strands tools for generating compliance artifacts
and audit evidence.

Requirements: 10.1, 10.2, 10.3, 10.4
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.documentation import (
    Document,
    DocumentType,
    DocumentFormat,
    BCBS239Principle,
    BCBS239ComplianceMapping,
    CompliancePackage,
    DocumentationConfig,
)
from models.audit import AuditEntry
from repository.base import GovernanceRepository


# BCBS 239 Principles definitions (all 14 principles)
BCBS_239_PRINCIPLES = [
    {
        "principle_number": 1,
        "principle_name": "Governance",
        "description": "A bank's risk data aggregation capabilities and risk reporting practices should be subject to strong governance arrangements.",
        "requirements": [
            "Clear roles and responsibilities for risk data management",
            "Board and senior management oversight",
            "Risk data governance framework"
        ]
    },
    {
        "principle_number": 2,
        "principle_name": "Data Architecture and IT Infrastructure",
        "description": "A bank should design, build and maintain data architecture and IT infrastructure which fully supports its risk data aggregation capabilities.",
        "requirements": [
            "Robust data architecture",
            "Automated data flows where possible",
            "Data integration capabilities"
        ]
    },
    {
        "principle_number": 3,
        "principle_name": "Accuracy and Integrity",
        "description": "A bank should be able to generate accurate and reliable risk data to meet normal and stress/crisis reporting accuracy requirements.",
        "requirements": [
            "Data validation controls",
            "Reconciliation processes",
            "Error detection and correction"
        ]
    },
    {
        "principle_number": 4,
        "principle_name": "Completeness",
        "description": "A bank should be able to capture and aggregate all material risk data across the banking group.",
        "requirements": [
            "Complete data capture",
            "Comprehensive coverage",
            "Gap identification and remediation"
        ]
    },
    {
        "principle_number": 5,
        "principle_name": "Timeliness",
        "description": "A bank should be able to generate aggregate and up-to-date risk data in a timely manner.",
        "requirements": [
            "Timely data processing",
            "Automated reporting where possible",
            "Deadline management"
        ]
    },
    {
        "principle_number": 6,
        "principle_name": "Adaptability",
        "description": "A bank should be able to generate aggregate risk data to meet a broad range of on-demand, ad hoc risk management reporting requests.",
        "requirements": [
            "Flexible reporting capabilities",
            "Ad hoc query support",
            "Stress testing support"
        ]
    },
    {
        "principle_number": 7,
        "principle_name": "Accuracy (Reporting)",
        "description": "Risk management reports should accurately and precisely convey aggregated risk data and reflect risk in an exact manner.",
        "requirements": [
            "Accurate report generation",
            "Precise risk representation",
            "Clear data definitions"
        ]
    },
    {
        "principle_number": 8,
        "principle_name": "Comprehensiveness",
        "description": "Risk management reports should cover all material risk areas within the organisation.",
        "requirements": [
            "Complete risk coverage",
            "Material risk identification",
            "Cross-functional reporting"
        ]
    },
    {
        "principle_number": 9,
        "principle_name": "Clarity and Usefulness",
        "description": "Risk management reports should communicate information in a clear and concise manner.",
        "requirements": [
            "Clear presentation",
            "Actionable insights",
            "Appropriate level of detail"
        ]
    },
    {
        "principle_number": 10,
        "principle_name": "Frequency",
        "description": "The board and senior management should set the frequency of risk management report production and distribution.",
        "requirements": [
            "Defined reporting frequency",
            "Timely distribution",
            "Escalation procedures"
        ]
    },
    {
        "principle_number": 11,
        "principle_name": "Distribution",
        "description": "Risk management reports should be distributed to the relevant parties while ensuring confidentiality is maintained.",
        "requirements": [
            "Appropriate distribution lists",
            "Confidentiality controls",
            "Access management"
        ]
    },
    {
        "principle_number": 12,
        "principle_name": "Review",
        "description": "Supervisors should periodically review and evaluate a bank's compliance with the Principles.",
        "requirements": [
            "Regular compliance reviews",
            "Gap assessment",
            "Remediation tracking"
        ]
    },
    {
        "principle_number": 13,
        "principle_name": "Remedial Actions and Supervisory Measures",
        "description": "Supervisors should have and use the appropriate tools and resources to require effective and timely remedial action.",
        "requirements": [
            "Issue tracking",
            "Remediation plans",
            "Progress monitoring"
        ]
    },
    {
        "principle_number": 14,
        "principle_name": "Home/Host Cooperation",
        "description": "Supervisors should cooperate with relevant supervisors in other jurisdictions regarding the supervision and review of the Principles.",
        "requirements": [
            "Cross-border coordination",
            "Information sharing",
            "Consistent standards"
        ]
    }
]


def create_documentation_tools(
    repository: GovernanceRepository,
    config: Optional[DocumentationConfig] = None
):
    """
    Factory function to create documentation tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        config: Optional configuration for document generation.
        
    Returns:
        List of tool functions for the Documentation Agent.
    """
    if config is None:
        config = DocumentationConfig()
    
    @tool
    def generate_data_dictionary(report_id: str) -> dict:
        """
        Generate a data dictionary for a specific report.
        
        Creates a comprehensive document containing definitions and specifications
        for all critical data elements (CDEs) used in the report.
        
        Args:
            report_id: The ID of the report to generate dictionary for.
            
        Returns:
            Generated data dictionary document.
        """
        cde_inventory = repository.get_cde_inventory(report_id)
        requirements_doc = repository.get_requirements_document(report_id)
        report_catalog = repository.get_report_catalog()
        
        if not cde_inventory or not requirements_doc:
            raise ValueError(
                f"Missing required data for report {report_id}: "
                "CDE inventory or requirements document not found"
            )
        
        report = None
        if report_catalog:
            report = next((r for r in report_catalog.reports if r.id == report_id), None)
        report_name = report.name if report else report_id
        
        # Build data dictionary content
        content = f"# Data Dictionary: {report_name}\n\n"
        
        if config.include_timestamps:
            content += f"Generated: {datetime.now().isoformat()}\n"
            content += f"Organization: {config.organization_name}\n\n"
        
        content += "## Overview\n\n"
        content += f"This data dictionary provides comprehensive definitions and specifications "
        content += f"for all critical data elements (CDEs) used in the {report_name} regulatory report.\n\n"

        content += "## Critical Data Elements\n\n"
        
        # Sort CDEs by name for consistent ordering
        sorted_cdes = sorted(cde_inventory.cdes, key=lambda c: c.name)
        
        for cde in sorted_cdes:
            content += f"### {cde.name}\n\n"
            content += f"**Element ID:** {cde.element_id}\n\n"
            content += f"**Business Definition:** {cde.business_definition}\n\n"
            content += f"**Criticality Rationale:** {cde.criticality_rationale}\n\n"
            
            if cde.data_owner:
                content += f"**Data Owner:** {cde.data_owner}\n\n"
            
            content += f"**Status:** {cde.status}\n\n"
            
            if cde.approved_by and cde.approved_at:
                content += f"**Approved By:** {cde.approved_by} on {cde.approved_at.isoformat()}\n\n"
            
            # Find corresponding data element from requirements
            data_element = next(
                (de for de in requirements_doc.elements if de.id == cde.element_id),
                None
            )
            if data_element:
                content += f"**Regulatory Definition:** {data_element.regulatory_definition}\n\n"
                content += f"**Data Type:** {data_element.data_type}\n\n"
                content += f"**Format:** {data_element.format}\n\n"
                content += f"**Mandatory:** {'Yes' if data_element.mandatory else 'No'}\n\n"
                
                if data_element.calculation_logic:
                    content += f"**Calculation Logic:** {data_element.calculation_logic}\n\n"
                
                if data_element.unit:
                    content += f"**Unit:** {data_element.unit}\n\n"
            
            content += "---\n\n"
        
        # Add data mappings section
        content += "## Data Mappings\n\n"
        if requirements_doc.mappings and len(requirements_doc.mappings) > 0:
            content += "| Element Name | Source System | Source Table | Source Field | Transformation |\n"
            content += "|--------------|---------------|--------------|--------------|----------------|\n"
            
            for mapping in requirements_doc.mappings:
                element = next(
                    (de for de in requirements_doc.elements if de.id == mapping.element_id),
                    None
                )
                element_name = element.name if element else mapping.element_id
                transformation = mapping.transformation_logic or "Direct mapping"
                
                content += f"| {element_name} | {mapping.source_system} | {mapping.source_table} | {mapping.source_field} | {transformation} |\n"
        else:
            content += "No data mappings available for this report.\n"

        document = Document(
            type='data_dictionary',
            title=f"Data Dictionary - {report_name}",
            content=content,
            format=config.default_format
        )
        
        # Log the generation action
        repository.create_audit_entry(AuditEntry(
            actor="DocumentationAgent",
            actor_type="agent",
            action="generate_data_dictionary",
            entity_type="Document",
            entity_id=document.id,
            new_state=document.model_dump()
        ))
        
        return document.model_dump()
    
    @tool
    def generate_lineage_documentation(report_id: str) -> dict:
        """
        Generate lineage documentation for a specific report.
        
        Creates a comprehensive document showing the flow of data from
        source systems through transformations to final report fields.
        
        Args:
            report_id: The ID of the report to generate lineage documentation for.
            
        Returns:
            Generated lineage documentation document.
        """
        lineage_graph = repository.get_lineage_graph(report_id)
        cde_inventory = repository.get_cde_inventory(report_id)
        report_catalog = repository.get_report_catalog()
        
        if not lineage_graph:
            raise ValueError(f"No lineage graph found for report {report_id}")
        
        report = None
        if report_catalog:
            report = next((r for r in report_catalog.reports if r.id == report_id), None)
        report_name = report.name if report else report_id
        
        content = f"# Data Lineage Documentation: {report_name}\n\n"
        
        if config.include_timestamps:
            content += f"Generated: {datetime.now().isoformat()}\n"
            content += f"Organization: {config.organization_name}\n\n"
        
        content += "## Overview\n\n"
        content += f"This document provides comprehensive data lineage information for the "
        content += f"{report_name} regulatory report, showing the flow of data from source "
        content += "systems through transformations to final report fields.\n\n"
        
        content += "## Lineage Summary\n\n"
        content += f"- **Total Nodes:** {len(lineage_graph.nodes)}\n"
        content += f"- **Total Edges:** {len(lineage_graph.edges)}\n"
        content += f"- **Captured At:** {lineage_graph.captured_at.isoformat()}\n"
        content += f"- **Version:** {lineage_graph.version}\n\n"

        # Group nodes by type
        nodes_by_type: dict[str, list] = {}
        for node in lineage_graph.nodes:
            if node.type not in nodes_by_type:
                nodes_by_type[node.type] = []
            nodes_by_type[node.type].append(node)
        
        content += "## Source Systems\n\n"
        source_tables = nodes_by_type.get('source_table', [])
        if source_tables:
            content += "| Source Table | System | Business Term | Policies | Controls |\n"
            content += "|--------------|--------|---------------|----------|----------|\n"
            
            for node in source_tables:
                business_term = node.business_term or "N/A"
                policies = ", ".join(node.policies) if node.policies else "N/A"
                controls = ", ".join(node.controls) if node.controls else "N/A"
                
                content += f"| {node.name} | {node.system} | {business_term} | {policies} | {controls} |\n"
        else:
            content += "No source tables documented.\n"
        
        content += "\n## Transformations\n\n"
        transformations = nodes_by_type.get('transformation', [])
        if transformations:
            for transformation in transformations:
                content += f"### {transformation.name}\n\n"
                content += f"**System:** {transformation.system}\n\n"
                
                if transformation.business_term:
                    content += f"**Business Term:** {transformation.business_term}\n\n"
                
                # Find edges that involve this transformation
                incoming_edges = [e for e in lineage_graph.edges if e.target_node_id == transformation.id]
                outgoing_edges = [e for e in lineage_graph.edges if e.source_node_id == transformation.id]
                
                if incoming_edges:
                    content += "**Input Sources:**\n"
                    for edge in incoming_edges:
                        source_node = next((n for n in lineage_graph.nodes if n.id == edge.source_node_id), None)
                        source_name = source_node.name if source_node else edge.source_node_id
                        content += f"- {source_name} ({edge.transformation_type})\n"
                        if edge.transformation_logic:
                            content += f"  - Logic: {edge.transformation_logic}\n"
                    content += "\n"
                
                if outgoing_edges:
                    content += "**Output Targets:**\n"
                    for edge in outgoing_edges:
                        target_node = next((n for n in lineage_graph.nodes if n.id == edge.target_node_id), None)
                        target_name = target_node.name if target_node else edge.target_node_id
                        content += f"- {target_name} ({edge.transformation_type})\n"
                        if edge.transformation_logic:
                            content += f"  - Logic: {edge.transformation_logic}\n"
                    content += "\n"
        else:
            content += "No transformations documented.\n\n"

        content += "## Report Fields\n\n"
        report_fields = nodes_by_type.get('report_field', [])
        if report_fields and cde_inventory:
            content += "| Report Field | System | Business Term | CDE Status | Data Owner |\n"
            content += "|--------------|--------|---------------|------------|------------|\n"
            
            for field in report_fields:
                business_term = field.business_term or "N/A"
                
                # Find corresponding CDE
                cde = next(
                    (c for c in cde_inventory.cdes if c.name == field.name or c.element_id == field.id),
                    None
                )
                cde_status = cde.status if cde else "Not CDE"
                data_owner = cde.data_owner if cde else "N/A"
                
                content += f"| {field.name} | {field.system} | {business_term} | {cde_status} | {data_owner} |\n"
        else:
            content += "No report fields documented.\n"
        
        document = Document(
            type='lineage_documentation',
            title=f"Data Lineage Documentation - {report_name}",
            content=content,
            format=config.default_format
        )
        
        # Log the generation action
        repository.create_audit_entry(AuditEntry(
            actor="DocumentationAgent",
            actor_type="agent",
            action="generate_lineage_documentation",
            entity_type="Document",
            entity_id=document.id,
            new_state=document.model_dump()
        ))
        
        return document.model_dump()
    
    @tool
    def generate_quality_assurance_report(cycle_id: str) -> dict:
        """
        Generate a quality assurance report for a specific cycle.
        
        Creates a comprehensive assessment of data quality including
        DQ rules status, issues analysis, and recommendations.
        
        Args:
            cycle_id: The ID of the cycle to generate QA report for.
            
        Returns:
            Generated quality assurance report document.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle {cycle_id} not found")
        
        report_catalog = repository.get_report_catalog()
        report = None
        if report_catalog:
            report = next((r for r in report_catalog.reports if r.id == cycle.report_id), None)
        report_name = report.name if report else cycle.report_id
        
        dq_rules = repository.get_dq_rules()
        cde_inventory = repository.get_cde_inventory(cycle.report_id)
        all_issues = repository.get_issues()
        issues = [i for i in all_issues if cycle.report_id in i.impacted_reports]

        content = f"# Quality Assurance Report: {report_name}\n\n"
        
        if config.include_timestamps:
            content += f"Generated: {datetime.now().isoformat()}\n"
            content += f"Organization: {config.organization_name}\n"
            content += f"Cycle ID: {cycle_id}\n"
            content += f"Period End: {cycle.period_end.isoformat()}\n\n"
        
        content += "## Executive Summary\n\n"
        content += f"This quality assurance report provides a comprehensive assessment of data quality "
        content += f"for the {report_name} regulatory report for the period ending {cycle.period_end.isoformat()}.\n\n"
        
        # Quality metrics summary
        content += "## Quality Metrics Summary\n\n"
        total_rules = len(dq_rules)
        enabled_rules = len([r for r in dq_rules if r.enabled])
        total_cdes = len(cde_inventory.cdes) if cde_inventory else 0
        open_issues = len([i for i in issues if i.status == 'open'])
        critical_issues = len([i for i in issues if i.severity == 'critical'])
        
        content += f"- **Total Data Quality Rules:** {total_rules}\n"
        content += f"- **Active Rules:** {enabled_rules}\n"
        content += f"- **Critical Data Elements:** {total_cdes}\n"
        content += f"- **Open Issues:** {open_issues}\n"
        content += f"- **Critical Issues:** {critical_issues}\n\n"
        
        # Data quality rules status by dimension
        content += "## Data Quality Rules Assessment\n\n"
        rules_by_dimension: dict[str, list] = {}
        for rule in dq_rules:
            if rule.dimension not in rules_by_dimension:
                rules_by_dimension[rule.dimension] = []
            rules_by_dimension[rule.dimension].append(rule)
        
        content += "| Dimension | Total Rules | Active Rules | Critical Rules |\n"
        content += "|-----------|-------------|--------------|----------------|\n"
        
        for dimension, rules in rules_by_dimension.items():
            active = len([r for r in rules if r.enabled])
            critical = len([r for r in rules if r.severity == 'critical'])
            content += f"| {dimension} | {len(rules)} | {active} | {critical} |\n"
        content += "\n"
        
        # Issues analysis
        content += "## Issues Analysis\n\n"
        if issues:
            issues_by_severity: dict[str, list] = {}
            for issue in issues:
                if issue.severity not in issues_by_severity:
                    issues_by_severity[issue.severity] = []
                issues_by_severity[issue.severity].append(issue)
            
            content += "### Issues by Severity\n\n"
            content += "| Severity | Count | Open | In Progress | Resolved |\n"
            content += "|----------|-------|------|-------------|----------|\n"
            
            for severity, severity_issues in issues_by_severity.items():
                open_count = len([i for i in severity_issues if i.status == 'open'])
                in_progress = len([i for i in severity_issues if i.status == 'in_progress'])
                resolved = len([i for i in severity_issues if i.status in ['resolved', 'closed']])
                content += f"| {severity} | {len(severity_issues)} | {open_count} | {in_progress} | {resolved} |\n"
            content += "\n"

            # Critical issues detail
            critical_issue_list = [i for i in issues if i.severity == 'critical']
            if critical_issue_list:
                content += "### Critical Issues Detail\n\n"
                for issue in critical_issue_list:
                    content += f"#### {issue.title}\n\n"
                    content += f"**Status:** {issue.status}\n\n"
                    content += f"**Description:** {issue.description}\n\n"
                    content += f"**Created:** {issue.created_at.isoformat()}\n\n"
                    if issue.assignee:
                        content += f"**Assignee:** {issue.assignee}\n\n"
                    if issue.due_date:
                        content += f"**Due Date:** {issue.due_date.isoformat()}\n\n"
                    content += "---\n\n"
        else:
            content += "No issues identified for this cycle.\n\n"
        
        # Recommendations
        content += "## Recommendations\n\n"
        open_critical = len([i for i in issues if i.severity == 'critical' and i.status == 'open'])
        open_high = len([i for i in issues if i.severity == 'high' and i.status == 'open'])
        
        if open_critical > 0:
            content += f"- **URGENT:** {open_critical} critical issues require immediate attention before report submission.\n"
        if open_high > 0:
            content += f"- {open_high} high-severity issues should be resolved to improve data quality.\n"
        if open_critical == 0 and open_high == 0:
            content += "- Data quality appears satisfactory for report submission.\n"
        
        content += "- Continue monitoring data quality rules and address any new issues promptly.\n"
        content += "- Review and update data quality thresholds based on historical performance.\n\n"
        
        document = Document(
            type='quality_assurance_report',
            title=f"Quality Assurance Report - {report_name}",
            content=content,
            format=config.default_format
        )
        
        # Log the generation action
        repository.create_audit_entry(AuditEntry(
            actor="DocumentationAgent",
            actor_type="agent",
            action="generate_quality_assurance_report",
            entity_type="Document",
            entity_id=document.id,
            new_state=document.model_dump()
        ))
        
        return document.model_dump()

    @tool
    def generate_control_effectiveness_report(cycle_id: str) -> dict:
        """
        Generate a control effectiveness report for a specific cycle.
        
        Creates an assessment of all controls related to the report including
        control summary, effectiveness metrics, and recommendations.
        
        Args:
            cycle_id: The ID of the cycle to generate control effectiveness report for.
            
        Returns:
            Generated control effectiveness report document.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle {cycle_id} not found")
        
        report_catalog = repository.get_report_catalog()
        report = None
        if report_catalog:
            report = next((r for r in report_catalog.reports if r.id == cycle.report_id), None)
        report_name = report.name if report else cycle.report_id
        
        control_matrix = repository.get_control_matrix(cycle.report_id)
        if not control_matrix:
            raise ValueError(f"No control matrix found for report {cycle.report_id}")
        
        content = f"# Control Effectiveness Report: {report_name}\n\n"
        
        if config.include_timestamps:
            content += f"Generated: {datetime.now().isoformat()}\n"
            content += f"Organization: {config.organization_name}\n"
            content += f"Cycle ID: {cycle_id}\n"
            content += f"Period End: {cycle.period_end.isoformat()}\n\n"
        
        content += "## Executive Summary\n\n"
        content += f"This control effectiveness report provides an assessment of all controls "
        content += f"related to the {report_name} regulatory report for the period ending "
        content += f"{cycle.period_end.isoformat()}.\n\n"
        
        # Control summary statistics
        total_controls = len(control_matrix.controls)
        active_controls = len([c for c in control_matrix.controls if c.status == 'active'])
        compensating_controls = len([c for c in control_matrix.controls if c.status == 'compensating'])
        automated_controls = len([c for c in control_matrix.controls if c.automation_status == 'fully_automated'])
        
        content += "## Control Summary\n\n"
        content += f"- **Total Controls:** {total_controls}\n"
        content += f"- **Active Controls:** {active_controls}\n"
        content += f"- **Compensating Controls:** {compensating_controls}\n"
        content += f"- **Fully Automated Controls:** {automated_controls}\n"
        content += f"- **Last Reviewed:** {control_matrix.last_reviewed.isoformat()}\n"
        content += f"- **Reviewed By:** {control_matrix.reviewed_by}\n\n"

        # Controls by type
        content += "## Controls by Type\n\n"
        controls_by_type: dict[str, list] = {}
        for control in control_matrix.controls:
            if control.type not in controls_by_type:
                controls_by_type[control.type] = []
            controls_by_type[control.type].append(control)
        
        content += "| Control Type | Count | Active | Compensating | Automated |\n"
        content += "|--------------|-------|--------|--------------|----------|\n"
        
        for ctrl_type, controls in controls_by_type.items():
            active = len([c for c in controls if c.status == 'active'])
            compensating = len([c for c in controls if c.status == 'compensating'])
            automated = len([c for c in controls if c.automation_status == 'fully_automated'])
            content += f"| {ctrl_type} | {len(controls)} | {active} | {compensating} | {automated} |\n"
        content += "\n"
        
        # Control effectiveness assessment
        content += "## Control Effectiveness Assessment\n\n"
        
        for control in control_matrix.controls:
            content += f"### {control.name}\n\n"
            content += f"**Type:** {control.type} | **Category:** {control.category} | **Status:** {control.status}\n\n"
            content += f"**Description:** {control.description}\n\n"
            content += f"**Owner:** {control.owner}\n\n"
            content += f"**Frequency:** {control.frequency}\n\n"
            content += f"**Automation Status:** {control.automation_status}\n\n"
            
            if control.linked_cdes:
                content += f"**Linked CDEs:** {', '.join(control.linked_cdes)}\n\n"
            
            if control.linked_processes:
                content += f"**Linked Processes:** {', '.join(control.linked_processes)}\n\n"
            
            # Evidence assessment
            if control.evidence:
                content += "**Recent Evidence:**\n\n"
                
                # Sort evidence by execution date (most recent first)
                sorted_evidence = sorted(control.evidence, key=lambda e: e.execution_date, reverse=True)
                recent_evidence = sorted_evidence[:3]
                
                content += "| Execution Date | Outcome | Executed By | Details |\n"
                content += "|----------------|---------|-------------|----------|\n"
                
                for evidence in recent_evidence:
                    exec_date = evidence.execution_date.isoformat().split('T')[0]
                    content += f"| {exec_date} | {evidence.outcome} | {evidence.executed_by} | {evidence.details} |\n"
                content += "\n"
                
                # Calculate effectiveness metrics
                total_executions = len(control.evidence)
                passed = len([e for e in control.evidence if e.outcome == 'pass'])
                failed = len([e for e in control.evidence if e.outcome == 'fail'])
                exceptions = len([e for e in control.evidence if e.outcome == 'exception'])
                
                pass_rate = (passed / total_executions * 100) if total_executions > 0 else 0
                
                content += "**Effectiveness Metrics:**\n"
                content += f"- Pass Rate: {pass_rate:.1f}% ({passed}/{total_executions})\n"
                content += f"- Failed Executions: {failed}\n"
                content += f"- Exceptions: {exceptions}\n\n"
            else:
                content += "**No execution evidence available.**\n\n"

            # Compensating control details
            if control.status == 'compensating' and control.expiration_date:
                content += "**Compensating Control Details:**\n"
                content += f"- Expiration Date: {control.expiration_date.isoformat()}\n"
                days_until = (control.expiration_date - datetime.now()).days
                content += f"- Days Until Expiration: {days_until}\n\n"
            
            content += "---\n\n"
        
        # Recommendations
        content += "## Recommendations\n\n"
        
        failed_controls = [c for c in control_matrix.controls if any(e.outcome == 'fail' for e in c.evidence)]
        expiring_compensating = [
            c for c in control_matrix.controls
            if c.status == 'compensating' and c.expiration_date
            and (c.expiration_date - datetime.now()).days < 30
        ]
        
        if failed_controls:
            content += f"- **Review Failed Controls:** {len(failed_controls)} controls have recent failures and require attention.\n"
        
        if expiring_compensating:
            content += f"- **Expiring Compensating Controls:** {len(expiring_compensating)} compensating controls expire within 30 days.\n"
        
        if compensating_controls > 0:
            content += f"- **Reduce Compensating Controls:** Work to resolve underlying issues and transition {compensating_controls} compensating controls to permanent controls.\n"
        
        manual_controls = len([c for c in control_matrix.controls if c.automation_status == 'manual'])
        if manual_controls > 0:
            content += f"- **Automation Opportunities:** Consider automating {manual_controls} manual controls to improve efficiency and reduce human error.\n"
        
        document = Document(
            type='control_effectiveness_report',
            title=f"Control Effectiveness Report - {report_name}",
            content=content,
            format=config.default_format
        )
        
        # Log the generation action
        repository.create_audit_entry(AuditEntry(
            actor="DocumentationAgent",
            actor_type="agent",
            action="generate_control_effectiveness_report",
            entity_type="Document",
            entity_id=document.id,
            new_state=document.model_dump()
        ))
        
        return document.model_dump()

    @tool
    def generate_bcbs239_compliance_mapping(report_id: str) -> dict:
        """
        Generate a BCBS 239 compliance mapping for a specific report.
        
        Creates a comprehensive mapping against all 14 BCBS 239 principles
        with evidence links for each principle.
        
        Requirements: 10.4 - BCBS 239 mapping SHALL reference all 14 principles
        with evidence links.
        
        Args:
            report_id: The ID of the report to generate BCBS 239 mapping for.
            
        Returns:
            Generated BCBS 239 compliance mapping document.
        """
        report_catalog = repository.get_report_catalog()
        report = None
        if report_catalog:
            report = next((r for r in report_catalog.reports if r.id == report_id), None)
        report_name = report.name if report else report_id
        
        cde_inventory = repository.get_cde_inventory(report_id)
        dq_rules = repository.get_dq_rules()
        lineage_graph = repository.get_lineage_graph(report_id)
        control_matrix = repository.get_control_matrix(report_id)
        
        content = f"# BCBS 239 Compliance Mapping: {report_name}\n\n"
        
        if config.include_timestamps:
            content += f"Generated: {datetime.now().isoformat()}\n"
            content += f"Organization: {config.organization_name}\n\n"
        
        content += "## Overview\n\n"
        content += f"This document provides a comprehensive mapping of the {report_name} regulatory "
        content += "report against the Basel Committee on Banking Supervision's Principles for "
        content += "Effective Risk Data Aggregation and Risk Reporting (BCBS 239).\n\n"
        
        # Build principles with evidence
        principles: list[BCBS239Principle] = []
        
        for principle_def in BCBS_239_PRINCIPLES:
            evidence_links: list[str] = []
            compliance_status = 'not_assessed'
            notes = ""
            
            # Assess compliance based on available data
            principle_num = principle_def["principle_number"]
            
            if principle_num == 1:  # Governance
                if control_matrix and len(control_matrix.controls) > 0:
                    evidence_links.append(f"Control Matrix: {len(control_matrix.controls)} controls defined")
                    compliance_status = 'compliant'
                else:
                    compliance_status = 'partially_compliant'
                    notes = "Control matrix not fully defined"

            elif principle_num == 2:  # Data Architecture
                if lineage_graph and len(lineage_graph.nodes) > 0:
                    evidence_links.append(f"Lineage Graph: {len(lineage_graph.nodes)} nodes documented")
                    compliance_status = 'compliant'
                else:
                    compliance_status = 'partially_compliant'
                    notes = "Data lineage not fully documented"
            
            elif principle_num == 3:  # Accuracy and Integrity
                if dq_rules and len(dq_rules) > 0:
                    accuracy_rules = [r for r in dq_rules if r.dimension == 'accuracy']
                    evidence_links.append(f"DQ Rules: {len(accuracy_rules)} accuracy rules defined")
                    compliance_status = 'compliant' if accuracy_rules else 'partially_compliant'
                else:
                    compliance_status = 'non_compliant'
                    notes = "No data quality rules defined"
            
            elif principle_num == 4:  # Completeness
                if dq_rules:
                    completeness_rules = [r for r in dq_rules if r.dimension == 'completeness']
                    evidence_links.append(f"DQ Rules: {len(completeness_rules)} completeness rules defined")
                    compliance_status = 'compliant' if completeness_rules else 'partially_compliant'
                else:
                    compliance_status = 'partially_compliant'
            
            elif principle_num == 5:  # Timeliness
                if dq_rules:
                    timeliness_rules = [r for r in dq_rules if r.dimension == 'timeliness']
                    evidence_links.append(f"DQ Rules: {len(timeliness_rules)} timeliness rules defined")
                    compliance_status = 'compliant' if timeliness_rules else 'partially_compliant'
                else:
                    compliance_status = 'partially_compliant'
            
            elif principle_num in [6, 7, 8, 9, 10, 11]:  # Reporting principles
                if cde_inventory and len(cde_inventory.cdes) > 0:
                    evidence_links.append(f"CDE Inventory: {len(cde_inventory.cdes)} CDEs identified")
                    compliance_status = 'compliant'
                else:
                    compliance_status = 'partially_compliant'
            
            elif principle_num in [12, 13, 14]:  # Supervisory principles
                # These require external evidence
                compliance_status = 'not_assessed'
                notes = "Requires supervisory review"
            
            principle = BCBS239Principle(
                principle_number=principle_def["principle_number"],
                principle_name=principle_def["principle_name"],
                description=principle_def["description"],
                requirements=principle_def["requirements"],
                evidence_links=evidence_links,
                compliance_status=compliance_status,
                notes=notes if notes else None
            )
            principles.append(principle)

        # Generate content for all 14 principles
        content += "## BCBS 239 Principles Assessment\n\n"
        
        for principle in principles:
            content += f"### Principle {principle.principle_number}: {principle.principle_name}\n\n"
            content += f"**Description:** {principle.description}\n\n"
            content += f"**Compliance Status:** {principle.compliance_status.replace('_', ' ').title()}\n\n"
            
            content += "**Requirements:**\n"
            for req in principle.requirements:
                content += f"- {req}\n"
            content += "\n"
            
            if principle.evidence_links:
                content += "**Evidence:**\n"
                for evidence in principle.evidence_links:
                    content += f"- {evidence}\n"
                content += "\n"
            
            if principle.notes:
                content += f"**Notes:** {principle.notes}\n\n"
            
            content += "---\n\n"
        
        # Calculate overall compliance score
        status_scores = {
            'compliant': 1.0,
            'partially_compliant': 0.5,
            'non_compliant': 0.0,
            'not_assessed': 0.0
        }
        total_score = sum(status_scores.get(p.compliance_status, 0) for p in principles)
        overall_score = (total_score / len(principles)) * 100 if principles else 0
        
        content += "## Compliance Summary\n\n"
        content += f"**Overall Compliance Score:** {overall_score:.1f}%\n\n"
        
        compliant_count = len([p for p in principles if p.compliance_status == 'compliant'])
        partial_count = len([p for p in principles if p.compliance_status == 'partially_compliant'])
        non_compliant_count = len([p for p in principles if p.compliance_status == 'non_compliant'])
        not_assessed_count = len([p for p in principles if p.compliance_status == 'not_assessed'])
        
        content += "| Status | Count |\n"
        content += "|--------|-------|\n"
        content += f"| Compliant | {compliant_count} |\n"
        content += f"| Partially Compliant | {partial_count} |\n"
        content += f"| Non-Compliant | {non_compliant_count} |\n"
        content += f"| Not Assessed | {not_assessed_count} |\n\n"
        
        # Create the mapping object
        bcbs_mapping = BCBS239ComplianceMapping(
            report_id=report_id,
            principles=principles,
            overall_compliance_score=overall_score
        )
        
        document = Document(
            type='bcbs239_compliance_mapping',
            title=f"BCBS 239 Compliance Mapping - {report_name}",
            content=content,
            format=config.default_format
        )
        
        # Log the generation action
        repository.create_audit_entry(AuditEntry(
            actor="DocumentationAgent",
            actor_type="agent",
            action="generate_bcbs239_compliance_mapping",
            entity_type="Document",
            entity_id=document.id,
            new_state={"document": document.model_dump(), "mapping": bcbs_mapping.model_dump()}
        ))
        
        return document.model_dump()

    @tool
    def compile_compliance_package(cycle_id: str) -> dict:
        """
        Compile a compliance package aggregating all artifacts for a cycle.
        
        Generates all required documents and aggregates them into a single
        compliance package with status tracking.
        
        Requirements: 10.3 - compile_compliance_package SHALL aggregate all
        artifacts with status tracking.
        
        Args:
            cycle_id: The ID of the cycle to compile compliance package for.
            
        Returns:
            Compiled compliance package with all documents.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle {cycle_id} not found")
        
        report_id = cycle.report_id
        documents: list[Document] = []
        
        # Generate all required documents
        try:
            # Data Dictionary
            data_dict_result = generate_data_dictionary(report_id)
            documents.append(Document(**data_dict_result))
        except ValueError as e:
            # Log but continue if data dictionary cannot be generated
            repository.create_audit_entry(AuditEntry(
                actor="DocumentationAgent",
                actor_type="agent",
                action="compile_compliance_package_warning",
                entity_type="CompliancePackage",
                entity_id=cycle_id,
                new_state={"warning": f"Could not generate data dictionary: {str(e)}"}
            ))
        
        try:
            # Lineage Documentation
            lineage_doc_result = generate_lineage_documentation(report_id)
            documents.append(Document(**lineage_doc_result))
        except ValueError as e:
            repository.create_audit_entry(AuditEntry(
                actor="DocumentationAgent",
                actor_type="agent",
                action="compile_compliance_package_warning",
                entity_type="CompliancePackage",
                entity_id=cycle_id,
                new_state={"warning": f"Could not generate lineage documentation: {str(e)}"}
            ))
        
        try:
            # Quality Assurance Report
            qa_report_result = generate_quality_assurance_report(cycle_id)
            documents.append(Document(**qa_report_result))
        except ValueError as e:
            repository.create_audit_entry(AuditEntry(
                actor="DocumentationAgent",
                actor_type="agent",
                action="compile_compliance_package_warning",
                entity_type="CompliancePackage",
                entity_id=cycle_id,
                new_state={"warning": f"Could not generate QA report: {str(e)}"}
            ))

        try:
            # Control Effectiveness Report
            control_report_result = generate_control_effectiveness_report(cycle_id)
            documents.append(Document(**control_report_result))
        except ValueError as e:
            repository.create_audit_entry(AuditEntry(
                actor="DocumentationAgent",
                actor_type="agent",
                action="compile_compliance_package_warning",
                entity_type="CompliancePackage",
                entity_id=cycle_id,
                new_state={"warning": f"Could not generate control effectiveness report: {str(e)}"}
            ))
        
        try:
            # BCBS 239 Compliance Mapping
            bcbs_mapping_result = generate_bcbs239_compliance_mapping(report_id)
            documents.append(Document(**bcbs_mapping_result))
        except ValueError as e:
            repository.create_audit_entry(AuditEntry(
                actor="DocumentationAgent",
                actor_type="agent",
                action="compile_compliance_package_warning",
                entity_type="CompliancePackage",
                entity_id=cycle_id,
                new_state={"warning": f"Could not generate BCBS 239 mapping: {str(e)}"}
            ))
        
        # Create compliance package
        package = CompliancePackage(
            cycle_id=cycle_id,
            report_id=report_id,
            documents=documents,
            status='draft'
        )
        
        # Log the compilation action
        repository.create_audit_entry(AuditEntry(
            actor="DocumentationAgent",
            actor_type="agent",
            action="compile_compliance_package",
            entity_type="CompliancePackage",
            entity_id=package.id,
            new_state={
                "package_id": package.id,
                "cycle_id": cycle_id,
                "report_id": report_id,
                "document_count": len(documents),
                "document_types": [d.type for d in documents],
                "status": package.status
            }
        ))
        
        return package.model_dump()
    
    return [
        generate_data_dictionary,
        generate_lineage_documentation,
        generate_quality_assurance_report,
        generate_control_effectiveness_report,
        generate_bcbs239_compliance_mapping,
        compile_compliance_package
    ]
