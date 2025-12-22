"""
Lineage Mapping Agent tools for the Agentic Data Governance System.

This module defines Strands tools for scanning data pipelines, linking to business
concepts, importing from external lineage tools, analyzing change impact, and
generating lineage diagrams and reports.

Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.lineage import (
    LineageGraph,
    LineageNode,
    LineageEdge,
    EnrichedLineage,
    ImpactAnalysis,
    LineageDiagram,
    LineageReport,
    BusinessGlossary,
    GlossaryTerm,
    DataSource,
    LineageNodeType,
    DiagramFormat,
    ReportFormat,
)
from models.audit import AuditEntry
from repository.base import GovernanceRepository


def create_lineage_tools(repository: GovernanceRepository):
    """
    Factory function to create lineage tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the Lineage Mapping Agent.
    """
    
    @tool
    def scan_data_pipelines(
        report_id: str,
        data_sources: list[dict],
        include_transformations: bool = True
    ) -> dict:
        """
        Scan data pipelines to build a lineage graph with nodes and edges.
        
        Builds a LineageGraph by scanning the provided data sources and
        identifying transformations, staging tables, and report fields.
        
        Args:
            report_id: The ID of the regulatory report to build lineage for.
            data_sources: List of data source configurations, each containing:
                - name: Source name
                - type: Source type (database, file, api, stream)
                - tables: List of table names to scan
                - connection_config: Optional connection configuration
            include_transformations: Whether to include transformation nodes.
            
        Returns:
            The built LineageGraph with nodes and edges.
        """
        nodes: list[LineageNode] = []
        edges: list[LineageEdge] = []
        
        # Track node IDs for edge creation
        source_node_ids: dict[str, str] = {}
        
        for source in data_sources:
            source_name = source.get("name", "unknown")
            source_type = source.get("type", "database")
            tables = source.get("tables", [])
            
            for table in tables:
                # Create source table node
                source_node = LineageNode(
                    type="source_table",
                    name=table,
                    system=source_name,
                    technical_details={
                        "source_type": source_type,
                        "table_name": table
                    }
                )
                nodes.append(source_node)
                source_node_ids[f"{source_name}.{table}"] = source_node.id
                
                if include_transformations:
                    # Create transformation node
                    transform_node = LineageNode(
                        type="transformation",
                        name=f"transform_{table}",
                        system="ETL",
                        technical_details={
                            "source_table": table,
                            "transformation_type": "extract_transform"
                        }
                    )
                    nodes.append(transform_node)
                    
                    # Create edge from source to transformation
                    edge = LineageEdge(
                        source_node_id=source_node.id,
                        target_node_id=transform_node.id,
                        transformation_type="extract",
                        transformation_logic=f"SELECT * FROM {table}"
                    )
                    edges.append(edge)
                    
                    # Create staging table node
                    staging_node = LineageNode(
                        type="staging_table",
                        name=f"stg_{table}",
                        system="DataWarehouse",
                        technical_details={
                            "source_table": table,
                            "staging_schema": "staging"
                        }
                    )
                    nodes.append(staging_node)
                    
                    # Create edge from transformation to staging
                    edge2 = LineageEdge(
                        source_node_id=transform_node.id,
                        target_node_id=staging_node.id,
                        transformation_type="load",
                        transformation_logic=f"INSERT INTO stg_{table}"
                    )
                    edges.append(edge2)
        
        # Create report field nodes for the report
        report = repository.get_report(report_id)
        if report:
            report_field_node = LineageNode(
                type="report_field",
                name=f"{report.name}_output",
                system="Reporting",
                technical_details={
                    "report_id": report_id,
                    "report_name": report.name
                }
            )
            nodes.append(report_field_node)
            
            # Connect staging tables to report field
            for node in nodes:
                if node.type == "staging_table":
                    edge = LineageEdge(
                        source_node_id=node.id,
                        target_node_id=report_field_node.id,
                        transformation_type="aggregate",
                        transformation_logic="Report aggregation"
                    )
                    edges.append(edge)
        
        # Create or update lineage graph
        existing_graph = repository.get_lineage_graph(report_id)
        
        if existing_graph:
            # Merge with existing graph
            existing_node_names = {n.name for n in existing_graph.nodes}
            for node in nodes:
                if node.name not in existing_node_names:
                    existing_graph.nodes.append(node)
            existing_graph.edges.extend(edges)
            existing_graph.version += 1
            existing_graph.captured_at = datetime.now()
            graph = existing_graph
        else:
            graph = LineageGraph(
                report_id=report_id,
                nodes=nodes,
                edges=edges,
                version=1,
                captured_at=datetime.now()
            )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="LineageMappingAgent",
            actor_type="agent",
            action="scan_data_pipelines",
            entity_type="LineageGraph",
            entity_id=graph.id,
            new_state={
                "report_id": report_id,
                "nodes_count": len(nodes),
                "edges_count": len(edges),
                "data_sources_scanned": len(data_sources)
            }
        ))
        
        return graph.model_dump()
    
    @tool
    def link_to_business_concepts(
        report_id: str,
        glossary_terms: list[dict]
    ) -> dict:
        """
        Connect technical lineage nodes to business glossary terms.
        
        Enriches the lineage graph by linking technical nodes to their
        corresponding business concepts from the glossary.
        
        Args:
            report_id: The ID of the regulatory report.
            glossary_terms: List of glossary terms, each containing:
                - term: The business term
                - definition: Term definition
                - synonyms: List of synonyms
                - related_terms: List of related terms
                
        Returns:
            EnrichedLineage with linked glossary terms count.
        """
        graph = repository.get_lineage_graph(report_id)
        if not graph:
            raise ValueError(f"No lineage graph found for report {report_id}")
        
        # Build glossary lookup
        glossary = BusinessGlossary(
            terms=[GlossaryTerm(**t) for t in glossary_terms],
            version=1,
            last_updated=datetime.now()
        )
        
        # Create term lookup including synonyms
        term_lookup: dict[str, GlossaryTerm] = {}
        for term in glossary.terms:
            term_lookup[term.term.lower()] = term
            for synonym in term.synonyms:
                term_lookup[synonym.lower()] = term
        
        # Link nodes to business terms
        linked_count = 0
        for node in graph.nodes:
            node_name_lower = node.name.lower()
            
            # Check for exact match or partial match
            matched_term = None
            for term_key, term in term_lookup.items():
                if term_key in node_name_lower or node_name_lower in term_key:
                    matched_term = term
                    break
            
            if matched_term:
                node.business_term = matched_term.term
                linked_count += 1
        
        # Update graph
        graph.version += 1
        graph.captured_at = datetime.now()
        repository.set_lineage_graph(report_id, graph)
        
        enriched = EnrichedLineage(
            graph=graph,
            enriched_at=datetime.now(),
            glossary_terms_linked=linked_count
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="LineageMappingAgent",
            actor_type="agent",
            action="link_to_business_concepts",
            entity_type="LineageGraph",
            entity_id=graph.id,
            new_state={
                "report_id": report_id,
                "glossary_terms_provided": len(glossary_terms),
                "nodes_linked": linked_count
            }
        ))
        
        return enriched.model_dump()
    
    @tool
    def import_from_lineage_tool(
        report_id: str,
        tool_name: str,
        import_data: dict
    ) -> dict:
        """
        Import lineage data from external lineage tools.
        
        Supports importing lineage graphs from tools like Apache Atlas,
        Collibra, Alation, or custom lineage exports.
        
        Args:
            report_id: The ID of the regulatory report.
            tool_name: Name of the external tool (atlas, collibra, alation, custom).
            import_data: Tool-specific import data containing:
                - nodes: List of node definitions
                - edges: List of edge definitions
                - metadata: Optional metadata
                
        Returns:
            The imported and merged LineageGraph.
        """
        imported_nodes: list[LineageNode] = []
        imported_edges: list[LineageEdge] = []
        
        # Parse nodes from import data
        raw_nodes = import_data.get("nodes", [])
        for raw_node in raw_nodes:
            node_type = raw_node.get("type", "source_table")
            # Validate node type
            if node_type not in ["source_table", "transformation", "staging_table", "report_field"]:
                node_type = "source_table"
            
            node = LineageNode(
                type=node_type,
                name=raw_node.get("name", "unknown"),
                system=raw_node.get("system", tool_name),
                technical_details=raw_node.get("technical_details", {}),
                business_term=raw_node.get("business_term"),
                policies=raw_node.get("policies", []),
                controls=raw_node.get("controls", [])
            )
            # Preserve original ID if provided for edge mapping
            if "id" in raw_node:
                node.id = raw_node["id"]
            imported_nodes.append(node)
        
        # Build node ID mapping for edge creation
        node_id_map = {n.id: n.id for n in imported_nodes}
        
        # Parse edges from import data
        raw_edges = import_data.get("edges", [])
        for raw_edge in raw_edges:
            source_id = raw_edge.get("source_node_id", "")
            target_id = raw_edge.get("target_node_id", "")
            
            # Only create edge if both nodes exist
            if source_id in node_id_map and target_id in node_id_map:
                edge = LineageEdge(
                    source_node_id=source_id,
                    target_node_id=target_id,
                    transformation_type=raw_edge.get("transformation_type", "unknown"),
                    transformation_logic=raw_edge.get("transformation_logic")
                )
                imported_edges.append(edge)
        
        # Get or create lineage graph
        existing_graph = repository.get_lineage_graph(report_id)
        
        if existing_graph:
            # Merge imported data with existing graph
            existing_node_ids = {n.id for n in existing_graph.nodes}
            for node in imported_nodes:
                if node.id not in existing_node_ids:
                    existing_graph.nodes.append(node)
            existing_graph.edges.extend(imported_edges)
            existing_graph.version += 1
            existing_graph.captured_at = datetime.now()
            graph = existing_graph
        else:
            graph = LineageGraph(
                report_id=report_id,
                nodes=imported_nodes,
                edges=imported_edges,
                version=1,
                captured_at=datetime.now()
            )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="LineageMappingAgent",
            actor_type="agent",
            action="import_from_lineage_tool",
            entity_type="LineageGraph",
            entity_id=graph.id,
            new_state={
                "report_id": report_id,
                "tool_name": tool_name,
                "nodes_imported": len(imported_nodes),
                "edges_imported": len(imported_edges)
            }
        ))
        
        return graph.model_dump()

    
    @tool
    def analyze_change_impact(
        report_id: str,
        changed_source: str,
        change_type: str = "modification"
    ) -> dict:
        """
        Analyze the impact of a source change on downstream CDEs and reports.
        
        Identifies all affected CDEs and reports downstream of a changed source
        by traversing the lineage graph.
        
        Args:
            report_id: The ID of the regulatory report.
            changed_source: The name or ID of the changed source node.
            change_type: Type of change (modification, deletion, schema_change).
            
        Returns:
            ImpactAnalysis with affected CDEs, reports, and nodes.
        """
        graph = repository.get_lineage_graph(report_id)
        if not graph:
            raise ValueError(f"No lineage graph found for report {report_id}")
        
        # Find the changed source node
        source_node = None
        for node in graph.nodes:
            if node.id == changed_source or node.name == changed_source:
                source_node = node
                break
        
        if not source_node:
            raise ValueError(f"Source node '{changed_source}' not found in lineage graph")
        
        # Build adjacency list for graph traversal
        adjacency: dict[str, list[str]] = {}
        for edge in graph.edges:
            if edge.source_node_id not in adjacency:
                adjacency[edge.source_node_id] = []
            adjacency[edge.source_node_id].append(edge.target_node_id)
        
        # BFS to find all downstream nodes
        impacted_node_ids: set[str] = set()
        queue = [source_node.id]
        visited = set()
        
        while queue:
            current_id = queue.pop(0)
            if current_id in visited:
                continue
            visited.add(current_id)
            impacted_node_ids.add(current_id)
            
            # Add downstream nodes to queue
            for downstream_id in adjacency.get(current_id, []):
                if downstream_id not in visited:
                    queue.append(downstream_id)
        
        # Categorize impacted nodes
        impacted_cdes: list[str] = []
        impacted_reports: list[str] = []
        impacted_nodes: list[str] = []
        
        node_lookup = {n.id: n for n in graph.nodes}
        
        for node_id in impacted_node_ids:
            node = node_lookup.get(node_id)
            if node:
                impacted_nodes.append(node.name)
                
                if node.type == "report_field":
                    # This is a report output
                    report_id_from_node = node.technical_details.get("report_id", report_id)
                    if report_id_from_node not in impacted_reports:
                        impacted_reports.append(report_id_from_node)
                
                # Check if node is linked to a CDE
                if node.business_term:
                    # Look up CDE by business term
                    cde_inventory = repository.get_cde_inventory(report_id)
                    if cde_inventory:
                        for cde in cde_inventory.cdes:
                            if cde.name == node.business_term or node.business_term in cde.name:
                                if cde.id not in impacted_cdes:
                                    impacted_cdes.append(cde.id)
        
        impact = ImpactAnalysis(
            changed_source=changed_source,
            impacted_cdes=impacted_cdes,
            impacted_reports=impacted_reports,
            impacted_nodes=impacted_nodes,
            analyzed_at=datetime.now()
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="LineageMappingAgent",
            actor_type="agent",
            action="analyze_change_impact",
            entity_type="ImpactAnalysis",
            entity_id=report_id,
            new_state={
                "changed_source": changed_source,
                "change_type": change_type,
                "impacted_cdes_count": len(impacted_cdes),
                "impacted_reports_count": len(impacted_reports),
                "impacted_nodes_count": len(impacted_nodes)
            }
        ))
        
        return impact.model_dump()
    
    @tool
    def generate_lineage_diagram(
        report_id: str,
        cde_id: Optional[str] = None,
        format: str = "mermaid",
        include_business_terms: bool = True
    ) -> dict:
        """
        Generate a lineage diagram in Mermaid or other formats.
        
        Produces a visual representation of the lineage graph that can be
        rendered in documentation or dashboards.
        
        Args:
            report_id: The ID of the regulatory report.
            cde_id: Optional CDE ID to focus the diagram on.
            format: Output format (mermaid, svg, png).
            include_business_terms: Whether to include business term labels.
            
        Returns:
            LineageDiagram with the generated content.
        """
        graph = repository.get_lineage_graph(report_id)
        if not graph:
            raise ValueError(f"No lineage graph found for report {report_id}")
        
        # Filter nodes if CDE ID is provided
        nodes_to_include = graph.nodes
        edges_to_include = graph.edges
        
        if cde_id:
            # Find nodes related to the CDE
            cde_inventory = repository.get_cde_inventory(report_id)
            if cde_inventory:
                cde = next((c for c in cde_inventory.cdes if c.id == cde_id), None)
                if cde:
                    # Filter to nodes matching CDE name or business term
                    related_node_ids = set()
                    for node in graph.nodes:
                        if (node.business_term and cde.name in node.business_term) or \
                           cde.name.lower() in node.name.lower():
                            related_node_ids.add(node.id)
                    
                    # Include upstream and downstream nodes
                    all_related = set(related_node_ids)
                    for edge in graph.edges:
                        if edge.source_node_id in related_node_ids:
                            all_related.add(edge.target_node_id)
                        if edge.target_node_id in related_node_ids:
                            all_related.add(edge.source_node_id)
                    
                    nodes_to_include = [n for n in graph.nodes if n.id in all_related]
                    edges_to_include = [e for e in graph.edges 
                                       if e.source_node_id in all_related and e.target_node_id in all_related]
        
        # Generate Mermaid diagram
        if format == "mermaid":
            lines = ["graph LR"]
            
            # Node type to shape mapping
            shape_map = {
                "source_table": ("[(", ")]"),  # Cylinder
                "transformation": ("{{", "}}"),  # Hexagon
                "staging_table": ("[(", ")]"),  # Cylinder
                "report_field": ("[[", "]]")   # Subroutine
            }
            
            # Add nodes
            node_id_map = {}
            for i, node in enumerate(nodes_to_include):
                safe_id = f"node{i}"
                node_id_map[node.id] = safe_id
                
                label = node.name
                if include_business_terms and node.business_term:
                    label = f"{node.name}<br/><i>{node.business_term}</i>"
                
                left, right = shape_map.get(node.type, ("[", "]"))
                lines.append(f"    {safe_id}{left}{label}{right}")
            
            # Add edges
            for edge in edges_to_include:
                source_safe = node_id_map.get(edge.source_node_id)
                target_safe = node_id_map.get(edge.target_node_id)
                if source_safe and target_safe:
                    edge_label = edge.transformation_type or ""
                    if edge_label:
                        lines.append(f"    {source_safe} -->|{edge_label}| {target_safe}")
                    else:
                        lines.append(f"    {source_safe} --> {target_safe}")
            
            content = "\n".join(lines)
        else:
            # For other formats, return placeholder
            content = f"Diagram format '{format}' not yet implemented. Use 'mermaid' format."
        
        diagram = LineageDiagram(
            cde_id=cde_id or report_id,
            format=format if format in ["mermaid", "svg", "png"] else "mermaid",
            content=content,
            generated_at=datetime.now()
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="LineageMappingAgent",
            actor_type="agent",
            action="generate_lineage_diagram",
            entity_type="LineageDiagram",
            entity_id=report_id,
            new_state={
                "report_id": report_id,
                "cde_id": cde_id,
                "format": format,
                "nodes_included": len(nodes_to_include),
                "edges_included": len(edges_to_include)
            }
        ))
        
        return diagram.model_dump()
    
    @tool
    def generate_lineage_report(
        report_id: str,
        format: str = "markdown",
        include_impact_analysis: bool = True
    ) -> dict:
        """
        Generate a comprehensive lineage report for documentation.
        
        Creates a detailed report of the lineage graph including node
        inventory, edge relationships, and optionally impact analysis.
        
        Args:
            report_id: The ID of the regulatory report.
            format: Output format (markdown, html, pdf).
            include_impact_analysis: Whether to include impact analysis section.
            
        Returns:
            LineageReport with the generated content.
        """
        graph = repository.get_lineage_graph(report_id)
        if not graph:
            raise ValueError(f"No lineage graph found for report {report_id}")
        
        report = repository.get_report(report_id)
        report_name = report.name if report else report_id
        
        # Build report content
        sections = []
        
        # Header
        sections.append(f"# Data Lineage Report: {report_name}")
        sections.append(f"\nGenerated: {datetime.now().isoformat()}")
        sections.append(f"Version: {graph.version}")
        sections.append("")
        
        # Summary
        sections.append("## Summary")
        sections.append(f"- Total Nodes: {len(graph.nodes)}")
        sections.append(f"- Total Edges: {len(graph.edges)}")
        
        # Count by node type
        type_counts: dict[str, int] = {}
        for node in graph.nodes:
            type_counts[node.type] = type_counts.get(node.type, 0) + 1
        
        sections.append("\n### Node Types")
        for node_type, count in type_counts.items():
            sections.append(f"- {node_type}: {count}")
        sections.append("")
        
        # Node Inventory
        sections.append("## Node Inventory")
        sections.append("")
        sections.append("| Name | Type | System | Business Term |")
        sections.append("|------|------|--------|---------------|")
        
        for node in graph.nodes:
            business_term = node.business_term or "-"
            sections.append(f"| {node.name} | {node.type} | {node.system} | {business_term} |")
        sections.append("")
        
        # Edge Relationships
        sections.append("## Data Flow Relationships")
        sections.append("")
        sections.append("| Source | Target | Transformation |")
        sections.append("|--------|--------|----------------|")
        
        node_lookup = {n.id: n for n in graph.nodes}
        for edge in graph.edges:
            source_name = node_lookup.get(edge.source_node_id, LineageNode(type="source_table", name="Unknown", system="Unknown")).name
            target_name = node_lookup.get(edge.target_node_id, LineageNode(type="source_table", name="Unknown", system="Unknown")).name
            sections.append(f"| {source_name} | {target_name} | {edge.transformation_type} |")
        sections.append("")
        
        # Impact Analysis Section
        if include_impact_analysis:
            sections.append("## Impact Analysis")
            sections.append("")
            sections.append("### Source Tables")
            sections.append("The following source tables feed into this report:")
            sections.append("")
            
            source_nodes = [n for n in graph.nodes if n.type == "source_table"]
            for node in source_nodes:
                sections.append(f"- **{node.name}** ({node.system})")
                if node.business_term:
                    sections.append(f"  - Business Term: {node.business_term}")
            sections.append("")
            
            sections.append("### Report Fields")
            sections.append("The following report fields are produced:")
            sections.append("")
            
            report_nodes = [n for n in graph.nodes if n.type == "report_field"]
            for node in report_nodes:
                sections.append(f"- **{node.name}**")
            sections.append("")
        
        # Mermaid Diagram
        sections.append("## Lineage Diagram")
        sections.append("")
        sections.append("```mermaid")
        
        # Generate simple mermaid diagram
        sections.append("graph LR")
        node_id_map = {}
        for i, node in enumerate(graph.nodes):
            safe_id = f"n{i}"
            node_id_map[node.id] = safe_id
            sections.append(f"    {safe_id}[{node.name}]")
        
        for edge in graph.edges:
            source_safe = node_id_map.get(edge.source_node_id)
            target_safe = node_id_map.get(edge.target_node_id)
            if source_safe and target_safe:
                sections.append(f"    {source_safe} --> {target_safe}")
        
        sections.append("```")
        sections.append("")
        
        content = "\n".join(sections)
        
        lineage_report = LineageReport(
            report_id=report_id,
            content=content,
            format=format if format in ["markdown", "html", "pdf"] else "markdown",
            generated_at=datetime.now()
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="LineageMappingAgent",
            actor_type="agent",
            action="generate_lineage_report",
            entity_type="LineageReport",
            entity_id=report_id,
            new_state={
                "report_id": report_id,
                "format": format,
                "include_impact_analysis": include_impact_analysis,
                "content_length": len(content)
            }
        ))
        
        return lineage_report.model_dump()
    
    @tool
    def get_lineage_graph(report_id: str) -> dict:
        """
        Get the current lineage graph for a report.
        
        Args:
            report_id: The ID of the regulatory report.
            
        Returns:
            The lineage graph or empty graph if not found.
        """
        graph = repository.get_lineage_graph(report_id)
        if not graph:
            return LineageGraph(
                report_id=report_id,
                nodes=[],
                edges=[],
                version=0,
                captured_at=datetime.now()
            ).model_dump()
        return graph.model_dump()
    
    return [
        scan_data_pipelines,
        link_to_business_concepts,
        import_from_lineage_tool,
        analyze_change_impact,
        generate_lineage_diagram,
        generate_lineage_report,
        get_lineage_graph
    ]
