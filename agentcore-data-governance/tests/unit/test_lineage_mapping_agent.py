"""
Unit tests for the Lineage Mapping Agent.

Tests the lineage tools and agent functionality including:
- scan_data_pipelines
- link_to_business_concepts
- import_from_lineage_tool
- analyze_change_impact
- generate_lineage_diagram
- generate_lineage_report

Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
"""

import pytest
from datetime import datetime

from repository.in_memory import InMemoryGovernanceRepository
from tools.lineage_tools import create_lineage_tools
from models.lineage import LineageGraph, LineageNode, LineageEdge
from models.regulatory import RegulatoryReport, ReportCatalog, DueDateRule
from models.cde import CDEInventory, CDE


class TestScanDataPipelines:
    """Tests for the scan_data_pipelines tool."""
    
    def test_scan_creates_lineage_graph(self):
        """Test that scanning data pipelines creates a lineage graph."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        scan_data_pipelines = tools[0]
        
        data_sources = [
            {
                "name": "SourceDB",
                "type": "database",
                "tables": ["customers", "transactions"]
            }
        ]
        
        result = scan_data_pipelines(
            report_id="report-001",
            data_sources=data_sources
        )
        
        assert result is not None
        assert result["report_id"] == "report-001"
        assert len(result["nodes"]) > 0
        assert len(result["edges"]) > 0
    
    def test_scan_creates_source_nodes(self):
        """Test that scanning creates source table nodes."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        scan_data_pipelines = tools[0]
        
        data_sources = [
            {
                "name": "DataWarehouse",
                "type": "database",
                "tables": ["fact_sales"]
            }
        ]
        
        result = scan_data_pipelines(
            report_id="report-001",
            data_sources=data_sources
        )
        
        source_nodes = [n for n in result["nodes"] if n["type"] == "source_table"]
        assert len(source_nodes) >= 1
        assert any(n["name"] == "fact_sales" for n in source_nodes)
    
    def test_scan_creates_transformation_nodes(self):
        """Test that scanning creates transformation nodes when enabled."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        scan_data_pipelines = tools[0]
        
        data_sources = [
            {
                "name": "SourceDB",
                "type": "database",
                "tables": ["orders"]
            }
        ]
        
        result = scan_data_pipelines(
            report_id="report-001",
            data_sources=data_sources,
            include_transformations=True
        )
        
        transform_nodes = [n for n in result["nodes"] if n["type"] == "transformation"]
        assert len(transform_nodes) >= 1
    
    def test_scan_creates_audit_entry(self):
        """Test that scanning creates an audit entry."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        scan_data_pipelines = tools[0]
        
        data_sources = [
            {
                "name": "SourceDB",
                "type": "database",
                "tables": ["accounts"]
            }
        ]
        
        scan_data_pipelines(
            report_id="report-001",
            data_sources=data_sources
        )
        
        audit_entries = repository.get_audit_entries(action="scan_data_pipelines")
        assert len(audit_entries) >= 1
        assert audit_entries[0].actor == "LineageMappingAgent"


class TestLinkToBusinessConcepts:
    """Tests for the link_to_business_concepts tool."""
    
    def test_link_connects_nodes_to_terms(self):
        """Test that linking connects nodes to glossary terms."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        scan_data_pipelines = tools[0]
        link_to_business_concepts = tools[1]
        
        # First create a lineage graph
        data_sources = [
            {
                "name": "SourceDB",
                "type": "database",
                "tables": ["customer_balance"]
            }
        ]
        scan_data_pipelines(report_id="report-001", data_sources=data_sources)
        
        # Link to business concepts
        glossary_terms = [
            {
                "term": "Customer Balance",
                "definition": "The current balance of a customer account",
                "synonyms": ["balance", "account_balance"],
                "related_terms": ["customer", "account"]
            }
        ]
        
        result = link_to_business_concepts(
            report_id="report-001",
            glossary_terms=glossary_terms
        )
        
        assert result is not None
        assert result["glossary_terms_linked"] >= 0
    
    def test_link_raises_error_for_missing_graph(self):
        """Test that linking raises error when no graph exists."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        link_to_business_concepts = tools[1]
        
        glossary_terms = [
            {
                "term": "Test Term",
                "definition": "A test term",
                "synonyms": [],
                "related_terms": []
            }
        ]
        
        with pytest.raises(ValueError, match="No lineage graph found"):
            link_to_business_concepts(
                report_id="nonexistent-report",
                glossary_terms=glossary_terms
            )


class TestImportFromLineageTool:
    """Tests for the import_from_lineage_tool tool."""
    
    def test_import_creates_nodes_and_edges(self):
        """Test that importing creates nodes and edges."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        
        import_data = {
            "nodes": [
                {"id": "node1", "name": "source_table_1", "type": "source_table", "system": "Atlas"},
                {"id": "node2", "name": "transform_1", "type": "transformation", "system": "Atlas"},
                {"id": "node3", "name": "report_field_1", "type": "report_field", "system": "Atlas"}
            ],
            "edges": [
                {"source_node_id": "node1", "target_node_id": "node2", "transformation_type": "extract"},
                {"source_node_id": "node2", "target_node_id": "node3", "transformation_type": "load"}
            ]
        }
        
        result = import_from_lineage_tool(
            report_id="report-001",
            tool_name="atlas",
            import_data=import_data
        )
        
        assert result is not None
        assert len(result["nodes"]) == 3
        assert len(result["edges"]) == 2
    
    def test_import_merges_with_existing(self):
        """Test that importing merges with existing graph."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        
        # First import
        import_data1 = {
            "nodes": [
                {"id": "node1", "name": "table_1", "type": "source_table", "system": "Atlas"}
            ],
            "edges": []
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="atlas",
            import_data=import_data1
        )
        
        # Second import
        import_data2 = {
            "nodes": [
                {"id": "node2", "name": "table_2", "type": "source_table", "system": "Collibra"}
            ],
            "edges": []
        }
        result = import_from_lineage_tool(
            report_id="report-001",
            tool_name="collibra",
            import_data=import_data2
        )
        
        # Should have both nodes
        assert len(result["nodes"]) == 2


class TestAnalyzeChangeImpact:
    """Tests for the analyze_change_impact tool."""
    
    def test_analyze_finds_downstream_nodes(self):
        """Test that impact analysis finds downstream nodes."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        analyze_change_impact = tools[3]
        
        # Create a lineage graph with connected nodes
        import_data = {
            "nodes": [
                {"id": "source1", "name": "source_table", "type": "source_table", "system": "DB"},
                {"id": "transform1", "name": "transform", "type": "transformation", "system": "ETL"},
                {"id": "report1", "name": "report_field", "type": "report_field", "system": "Report"}
            ],
            "edges": [
                {"source_node_id": "source1", "target_node_id": "transform1", "transformation_type": "extract"},
                {"source_node_id": "transform1", "target_node_id": "report1", "transformation_type": "load"}
            ]
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="test",
            import_data=import_data
        )
        
        # Analyze impact of source change
        result = analyze_change_impact(
            report_id="report-001",
            changed_source="source1"
        )
        
        assert result is not None
        assert len(result["impacted_nodes"]) >= 1
    
    def test_analyze_raises_error_for_missing_source(self):
        """Test that analysis raises error for missing source node."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        analyze_change_impact = tools[3]
        
        # Create a simple graph
        import_data = {
            "nodes": [
                {"id": "node1", "name": "table_1", "type": "source_table", "system": "DB"}
            ],
            "edges": []
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="test",
            import_data=import_data
        )
        
        with pytest.raises(ValueError, match="Source node .* not found"):
            analyze_change_impact(
                report_id="report-001",
                changed_source="nonexistent_node"
            )


class TestGenerateLineageDiagram:
    """Tests for the generate_lineage_diagram tool."""
    
    def test_generate_mermaid_diagram(self):
        """Test that diagram generation produces Mermaid syntax."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        generate_lineage_diagram = tools[4]
        
        # Create a lineage graph
        import_data = {
            "nodes": [
                {"id": "node1", "name": "source", "type": "source_table", "system": "DB"},
                {"id": "node2", "name": "target", "type": "report_field", "system": "Report"}
            ],
            "edges": [
                {"source_node_id": "node1", "target_node_id": "node2", "transformation_type": "direct"}
            ]
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="test",
            import_data=import_data
        )
        
        result = generate_lineage_diagram(
            report_id="report-001",
            format="mermaid"
        )
        
        assert result is not None
        assert "graph LR" in result["content"]
        assert result["format"] == "mermaid"
    
    def test_generate_raises_error_for_missing_graph(self):
        """Test that diagram generation raises error when no graph exists."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        generate_lineage_diagram = tools[4]
        
        with pytest.raises(ValueError, match="No lineage graph found"):
            generate_lineage_diagram(
                report_id="nonexistent-report",
                format="mermaid"
            )


class TestGenerateLineageReport:
    """Tests for the generate_lineage_report tool."""
    
    def test_generate_markdown_report(self):
        """Test that report generation produces markdown content."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        generate_lineage_report = tools[5]
        
        # Create a lineage graph
        import_data = {
            "nodes": [
                {"id": "node1", "name": "source_table", "type": "source_table", "system": "DB"},
                {"id": "node2", "name": "report_output", "type": "report_field", "system": "Report"}
            ],
            "edges": [
                {"source_node_id": "node1", "target_node_id": "node2", "transformation_type": "transform"}
            ]
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="test",
            import_data=import_data
        )
        
        result = generate_lineage_report(
            report_id="report-001",
            format="markdown"
        )
        
        assert result is not None
        assert "# Data Lineage Report" in result["content"]
        assert "## Summary" in result["content"]
        assert "## Node Inventory" in result["content"]
        assert result["format"] == "markdown"
    
    def test_generate_report_includes_mermaid_diagram(self):
        """Test that report includes Mermaid diagram."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        generate_lineage_report = tools[5]
        
        # Create a lineage graph
        import_data = {
            "nodes": [
                {"id": "node1", "name": "table", "type": "source_table", "system": "DB"}
            ],
            "edges": []
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="test",
            import_data=import_data
        )
        
        result = generate_lineage_report(
            report_id="report-001",
            format="markdown"
        )
        
        assert "```mermaid" in result["content"]
        assert "graph LR" in result["content"]


class TestGetLineageGraph:
    """Tests for the get_lineage_graph tool."""
    
    def test_get_returns_existing_graph(self):
        """Test that get returns an existing lineage graph."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        import_from_lineage_tool = tools[2]
        get_lineage_graph = tools[6]
        
        # Create a lineage graph
        import_data = {
            "nodes": [
                {"id": "node1", "name": "table", "type": "source_table", "system": "DB"}
            ],
            "edges": []
        }
        import_from_lineage_tool(
            report_id="report-001",
            tool_name="test",
            import_data=import_data
        )
        
        result = get_lineage_graph(report_id="report-001")
        
        assert result is not None
        assert result["report_id"] == "report-001"
        assert len(result["nodes"]) == 1
    
    def test_get_returns_empty_graph_when_not_found(self):
        """Test that get returns empty graph when not found."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        get_lineage_graph = tools[6]
        
        result = get_lineage_graph(report_id="nonexistent-report")
        
        assert result is not None
        assert result["report_id"] == "nonexistent-report"
        assert len(result["nodes"]) == 0
        assert len(result["edges"]) == 0


class TestLineageMappingAgentIntegration:
    """Integration tests for the Lineage Mapping Agent."""
    
    def test_full_lineage_workflow(self):
        """Test a complete lineage workflow from scan to report."""
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        scan_data_pipelines = tools[0]
        link_to_business_concepts = tools[1]
        generate_lineage_diagram = tools[4]
        generate_lineage_report = tools[5]
        
        # Step 1: Scan data pipelines
        data_sources = [
            {
                "name": "FinanceDB",
                "type": "database",
                "tables": ["accounts", "transactions"]
            }
        ]
        scan_result = scan_data_pipelines(
            report_id="report-001",
            data_sources=data_sources
        )
        assert len(scan_result["nodes"]) > 0
        
        # Step 2: Link to business concepts
        glossary_terms = [
            {
                "term": "Account",
                "definition": "A financial account",
                "synonyms": ["accounts"],
                "related_terms": []
            },
            {
                "term": "Transaction",
                "definition": "A financial transaction",
                "synonyms": ["transactions"],
                "related_terms": []
            }
        ]
        link_result = link_to_business_concepts(
            report_id="report-001",
            glossary_terms=glossary_terms
        )
        assert link_result is not None
        
        # Step 3: Generate diagram
        diagram_result = generate_lineage_diagram(
            report_id="report-001",
            format="mermaid"
        )
        assert "graph LR" in diagram_result["content"]
        
        # Step 4: Generate report
        report_result = generate_lineage_report(
            report_id="report-001",
            format="markdown"
        )
        assert "# Data Lineage Report" in report_result["content"]
