"""
**Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**

For any source change, impact analysis must identify all affected CDEs and reports
downstream of the changed source.

**Validates: Requirements 7.5**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from hypothesis.strategies import composite
from typing import Optional

from models.lineage import (
    LineageGraph,
    LineageNode,
    LineageEdge,
    ImpactAnalysis,
)
from models.cde import CDE, CDEInventory
from repository.in_memory import InMemoryGovernanceRepository
from tools.lineage_tools import create_lineage_tools


# Non-empty string strategy for names
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=30,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)


# Strategy for generating valid node types
node_type_strategy = st.sampled_from(['source_table', 'transformation', 'staging_table', 'report_field'])


def find_all_downstream_nodes(graph: LineageGraph, source_node_id: str) -> set[str]:
    """
    Find all nodes downstream of a given source node using BFS.
    
    This is the reference implementation for verifying impact analysis completeness.
    """
    # Build adjacency list
    adjacency: dict[str, list[str]] = {}
    for edge in graph.edges:
        if edge.source_node_id not in adjacency:
            adjacency[edge.source_node_id] = []
        adjacency[edge.source_node_id].append(edge.target_node_id)
    
    # BFS to find all downstream nodes
    downstream_ids: set[str] = set()
    queue = [source_node_id]
    visited = set()
    
    while queue:
        current_id = queue.pop(0)
        if current_id in visited:
            continue
        visited.add(current_id)
        downstream_ids.add(current_id)
        
        for downstream_id in adjacency.get(current_id, []):
            if downstream_id not in visited:
                queue.append(downstream_id)
    
    return downstream_ids


@composite
def lineage_graph_with_cdes_strategy(draw, report_id: str):
    """
    Generate a lineage graph with CDEs linked via business_term.
    
    Creates a connected graph where some nodes have business_term set,
    and corresponding CDEs exist in the inventory.
    """
    # Generate unique node IDs
    source_id = draw(st.uuids().map(str))
    transform_id = draw(st.uuids().map(str))
    staging_id = draw(st.uuids().map(str))
    report_field_id = draw(st.uuids().map(str))
    
    # Generate business terms for linking
    business_term_1 = draw(non_empty_string_strategy)
    business_term_2 = draw(non_empty_string_strategy)
    
    # Create nodes with business terms
    source_node = LineageNode(
        id=source_id,
        type="source_table",
        name=f"source_{business_term_1}",
        system="SourceDB",
        technical_details={"table_name": "source_data"},
        business_term=business_term_1,
    )
    
    transform_node = LineageNode(
        id=transform_id,
        type="transformation",
        name=f"transform_{business_term_1}",
        system="ETL",
        technical_details={"transformation_type": "extract_transform"},
        business_term=None,  # Transformations typically don't have business terms
    )
    
    staging_node = LineageNode(
        id=staging_id,
        type="staging_table",
        name=f"stg_{business_term_2}",
        system="DataWarehouse",
        technical_details={"staging_schema": "staging"},
        business_term=business_term_2,
    )
    
    report_field_node = LineageNode(
        id=report_field_id,
        type="report_field",
        name=f"report_output",
        system="Reporting",
        technical_details={"report_id": report_id},
        business_term=None,
    )
    
    nodes = [source_node, transform_node, staging_node, report_field_node]
    
    # Create edges forming a connected path
    edges = [
        LineageEdge(
            source_node_id=source_id,
            target_node_id=transform_id,
            transformation_type="extract",
        ),
        LineageEdge(
            source_node_id=transform_id,
            target_node_id=staging_id,
            transformation_type="load",
        ),
        LineageEdge(
            source_node_id=staging_id,
            target_node_id=report_field_id,
            transformation_type="aggregate",
        ),
    ]
    
    graph = LineageGraph(
        report_id=report_id,
        nodes=nodes,
        edges=edges,
        version=1,
        captured_at=datetime.now(),
    )
    
    # Create CDEs that match the business terms
    cdes = [
        CDE(
            element_id=draw(st.uuids().map(str)),
            name=business_term_1,
            business_definition=f"Definition for {business_term_1}",
            criticality_rationale="High regulatory impact",
        ),
        CDE(
            element_id=draw(st.uuids().map(str)),
            name=business_term_2,
            business_definition=f"Definition for {business_term_2}",
            criticality_rationale="Cross-report usage",
        ),
    ]
    
    cde_inventory = CDEInventory(
        report_id=report_id,
        cdes=cdes,
        version=1,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    
    return graph, cde_inventory, source_node


class TestChangeImpactCompleteness:
    """
    Property 17: Change Impact Completeness
    
    Tests that for any source change, impact analysis identifies all affected
    CDEs and reports downstream of the changed source.
    """
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_impact_analysis_finds_all_downstream_nodes(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When analyze_change_impact is called, it must identify all
        nodes that are downstream of the changed source.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        # Get the analyze_change_impact tool
        analyze_change_impact = tools[3]
        
        # Create a lineage graph with multiple paths
        source_id = data.draw(st.uuids().map(str))
        transform_id = data.draw(st.uuids().map(str))
        staging_id = data.draw(st.uuids().map(str))
        report_field_id = data.draw(st.uuids().map(str))
        
        source_node = LineageNode(
            id=source_id,
            type="source_table",
            name="source_table_1",
            system="SourceDB",
            technical_details={},
        )
        
        transform_node = LineageNode(
            id=transform_id,
            type="transformation",
            name="transform_1",
            system="ETL",
            technical_details={},
        )
        
        staging_node = LineageNode(
            id=staging_id,
            type="staging_table",
            name="staging_1",
            system="DataWarehouse",
            technical_details={},
        )
        
        report_field_node = LineageNode(
            id=report_field_id,
            type="report_field",
            name="report_field_1",
            system="Reporting",
            technical_details={"report_id": report_id},
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[source_node, transform_node, staging_node, report_field_node],
            edges=[
                LineageEdge(source_node_id=source_id, target_node_id=transform_id, transformation_type="extract"),
                LineageEdge(source_node_id=transform_id, target_node_id=staging_id, transformation_type="load"),
                LineageEdge(source_node_id=staging_id, target_node_id=report_field_id, transformation_type="aggregate"),
            ],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Calculate expected downstream nodes using reference implementation
        expected_downstream = find_all_downstream_nodes(graph, source_id)
        
        # Call analyze_change_impact
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=source_id,
            change_type="modification",
        )
        
        # Property: All downstream nodes must be in impacted_nodes
        impacted_node_names = set(result.get("impacted_nodes", []))
        
        # Get names of expected downstream nodes
        node_lookup = {n.id: n for n in graph.nodes}
        expected_node_names = {node_lookup[nid].name for nid in expected_downstream if nid in node_lookup}
        
        assert expected_node_names == impacted_node_names, \
            f"Expected downstream nodes {expected_node_names}, got {impacted_node_names}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_impact_analysis_finds_report_fields(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When a source change affects report_field nodes, those
        reports must be included in impacted_reports.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a graph with report field downstream of source
        source_id = data.draw(st.uuids().map(str))
        report_field_id = data.draw(st.uuids().map(str))
        
        source_node = LineageNode(
            id=source_id,
            type="source_table",
            name="source_table",
            system="SourceDB",
            technical_details={},
        )
        
        report_field_node = LineageNode(
            id=report_field_id,
            type="report_field",
            name="report_output",
            system="Reporting",
            technical_details={"report_id": report_id},
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[source_node, report_field_node],
            edges=[
                LineageEdge(
                    source_node_id=source_id,
                    target_node_id=report_field_id,
                    transformation_type="direct",
                ),
            ],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call analyze_change_impact
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=source_id,
            change_type="modification",
        )
        
        # Property: The report must be in impacted_reports
        impacted_reports = result.get("impacted_reports", [])
        assert report_id in impacted_reports, \
            f"Report {report_id} should be in impacted_reports when report_field is downstream"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_impact_analysis_finds_cdes_via_business_term(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When a source change affects nodes with business_term linked
        to CDEs, those CDEs must be included in impacted_cdes.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a CDE
        cde_name = data.draw(non_empty_string_strategy)
        cde = CDE(
            element_id=data.draw(st.uuids().map(str)),
            name=cde_name,
            business_definition=f"Definition for {cde_name}",
            criticality_rationale="High impact",
        )
        
        cde_inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        
        repository.set_cde_inventory(report_id, cde_inventory)
        
        # Create a graph with a node linked to the CDE via business_term
        source_id = data.draw(st.uuids().map(str))
        linked_node_id = data.draw(st.uuids().map(str))
        
        source_node = LineageNode(
            id=source_id,
            type="source_table",
            name="source_table",
            system="SourceDB",
            technical_details={},
        )
        
        linked_node = LineageNode(
            id=linked_node_id,
            type="staging_table",
            name=f"staging_{cde_name}",
            system="DataWarehouse",
            technical_details={},
            business_term=cde_name,  # Links to CDE
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[source_node, linked_node],
            edges=[
                LineageEdge(
                    source_node_id=source_id,
                    target_node_id=linked_node_id,
                    transformation_type="load",
                ),
            ],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call analyze_change_impact
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=source_id,
            change_type="modification",
        )
        
        # Property: The CDE must be in impacted_cdes
        impacted_cdes = result.get("impacted_cdes", [])
        assert cde.id in impacted_cdes, \
            f"CDE {cde.id} should be in impacted_cdes when linked node is downstream"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_impact_analysis_handles_branching_paths(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When a source has multiple downstream branches, impact
        analysis must identify all affected nodes across all branches.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a graph with branching paths
        source_id = data.draw(st.uuids().map(str))
        branch1_id = data.draw(st.uuids().map(str))
        branch2_id = data.draw(st.uuids().map(str))
        report1_id = data.draw(st.uuids().map(str))
        report2_id = data.draw(st.uuids().map(str))
        
        source_node = LineageNode(
            id=source_id,
            type="source_table",
            name="source_table",
            system="SourceDB",
            technical_details={},
        )
        
        branch1_node = LineageNode(
            id=branch1_id,
            type="transformation",
            name="branch1_transform",
            system="ETL",
            technical_details={},
        )
        
        branch2_node = LineageNode(
            id=branch2_id,
            type="transformation",
            name="branch2_transform",
            system="ETL",
            technical_details={},
        )
        
        report1_node = LineageNode(
            id=report1_id,
            type="report_field",
            name="report1_output",
            system="Reporting",
            technical_details={"report_id": f"{report_id}_1"},
        )
        
        report2_node = LineageNode(
            id=report2_id,
            type="report_field",
            name="report2_output",
            system="Reporting",
            technical_details={"report_id": f"{report_id}_2"},
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[source_node, branch1_node, branch2_node, report1_node, report2_node],
            edges=[
                # Source branches to two transformations
                LineageEdge(source_node_id=source_id, target_node_id=branch1_id, transformation_type="extract"),
                LineageEdge(source_node_id=source_id, target_node_id=branch2_id, transformation_type="extract"),
                # Each branch leads to a different report
                LineageEdge(source_node_id=branch1_id, target_node_id=report1_id, transformation_type="load"),
                LineageEdge(source_node_id=branch2_id, target_node_id=report2_id, transformation_type="load"),
            ],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call analyze_change_impact
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=source_id,
            change_type="modification",
        )
        
        # Property: All nodes in both branches must be impacted
        impacted_node_names = set(result.get("impacted_nodes", []))
        expected_names = {"source_table", "branch1_transform", "branch2_transform", "report1_output", "report2_output"}
        
        assert expected_names == impacted_node_names, \
            f"Expected all branch nodes {expected_names}, got {impacted_node_names}"
        
        # Property: Both reports must be impacted
        impacted_reports = result.get("impacted_reports", [])
        assert f"{report_id}_1" in impacted_reports, "Report 1 should be impacted"
        assert f"{report_id}_2" in impacted_reports, "Report 2 should be impacted"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_impact_analysis_by_node_name(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: Impact analysis should work when changed_source is specified
        by node name instead of node ID.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a simple graph
        source_name = data.draw(non_empty_string_strategy)
        source_id = data.draw(st.uuids().map(str))
        downstream_id = data.draw(st.uuids().map(str))
        
        source_node = LineageNode(
            id=source_id,
            type="source_table",
            name=source_name,
            system="SourceDB",
            technical_details={},
        )
        
        downstream_node = LineageNode(
            id=downstream_id,
            type="staging_table",
            name="downstream_staging",
            system="DataWarehouse",
            technical_details={},
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[source_node, downstream_node],
            edges=[
                LineageEdge(
                    source_node_id=source_id,
                    target_node_id=downstream_id,
                    transformation_type="load",
                ),
            ],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call analyze_change_impact using node name
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=source_name,  # Using name instead of ID
            change_type="modification",
        )
        
        # Property: Should find downstream nodes when using name
        impacted_node_names = set(result.get("impacted_nodes", []))
        assert source_name in impacted_node_names, \
            f"Source node {source_name} should be in impacted nodes"
        assert "downstream_staging" in impacted_node_names, \
            "Downstream node should be found when using source name"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_isolated_source_has_no_downstream_impact(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When a source node has no outgoing edges, impact analysis
        should only include the source itself.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a graph with isolated source
        source_id = data.draw(st.uuids().map(str))
        other_node_id = data.draw(st.uuids().map(str))
        
        source_node = LineageNode(
            id=source_id,
            type="source_table",
            name="isolated_source",
            system="SourceDB",
            technical_details={},
        )
        
        other_node = LineageNode(
            id=other_node_id,
            type="staging_table",
            name="unconnected_staging",
            system="DataWarehouse",
            technical_details={},
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[source_node, other_node],
            edges=[],  # No edges - nodes are isolated
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call analyze_change_impact
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=source_id,
            change_type="modification",
        )
        
        # Property: Only the source itself should be impacted
        impacted_node_names = set(result.get("impacted_nodes", []))
        assert impacted_node_names == {"isolated_source"}, \
            f"Isolated source should only impact itself, got {impacted_node_names}"
        
        # Property: No reports or CDEs should be impacted
        assert len(result.get("impacted_reports", [])) == 0, \
            "Isolated source should not impact any reports"
        assert len(result.get("impacted_cdes", [])) == 0, \
            "Isolated source should not impact any CDEs"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_impact_analysis_handles_cycles(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: Impact analysis should handle graphs with cycles without
        infinite loops, identifying all reachable nodes exactly once.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a graph with a cycle
        node1_id = data.draw(st.uuids().map(str))
        node2_id = data.draw(st.uuids().map(str))
        node3_id = data.draw(st.uuids().map(str))
        
        node1 = LineageNode(
            id=node1_id,
            type="source_table",
            name="node1",
            system="System",
            technical_details={},
        )
        
        node2 = LineageNode(
            id=node2_id,
            type="transformation",
            name="node2",
            system="System",
            technical_details={},
        )
        
        node3 = LineageNode(
            id=node3_id,
            type="staging_table",
            name="node3",
            system="System",
            technical_details={},
        )
        
        graph = LineageGraph(
            report_id=report_id,
            nodes=[node1, node2, node3],
            edges=[
                LineageEdge(source_node_id=node1_id, target_node_id=node2_id, transformation_type="t1"),
                LineageEdge(source_node_id=node2_id, target_node_id=node3_id, transformation_type="t2"),
                LineageEdge(source_node_id=node3_id, target_node_id=node1_id, transformation_type="t3"),  # Cycle back
            ],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call analyze_change_impact - should not hang
        result = analyze_change_impact(
            report_id=report_id,
            changed_source=node1_id,
            change_type="modification",
        )
        
        # Property: All nodes in the cycle should be impacted exactly once
        impacted_node_names = result.get("impacted_nodes", [])
        assert len(impacted_node_names) == 3, \
            f"All 3 nodes should be impacted, got {len(impacted_node_names)}"
        assert set(impacted_node_names) == {"node1", "node2", "node3"}, \
            f"Expected all cycle nodes, got {impacted_node_names}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
    )
    def test_nonexistent_source_raises_error(self, report_id: str):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When the changed_source does not exist in the graph,
        analyze_change_impact should raise an appropriate error.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Create a simple graph
        graph = LineageGraph(
            report_id=report_id,
            nodes=[
                LineageNode(
                    id="existing_node",
                    type="source_table",
                    name="existing_source",
                    system="SourceDB",
                    technical_details={},
                ),
            ],
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Property: Should raise error for non-existent source
        with pytest.raises(ValueError) as exc_info:
            analyze_change_impact(
                report_id=report_id,
                changed_source="nonexistent_source",
                change_type="modification",
            )
        
        assert "not found" in str(exc_info.value).lower(), \
            "Error message should indicate source was not found"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
    )
    def test_missing_graph_raises_error(self, report_id: str):
        """
        **Feature: agentcore-python-refactor, Property 17: Change Impact Completeness**
        **Validates: Requirements 7.5**
        
        Property: When no lineage graph exists for the report,
        analyze_change_impact should raise an appropriate error.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        analyze_change_impact = tools[3]
        
        # Don't create any graph
        
        # Property: Should raise error for missing graph
        with pytest.raises(ValueError) as exc_info:
            analyze_change_impact(
                report_id=report_id,
                changed_source="any_source",
                change_type="modification",
            )
        
        assert "no lineage graph" in str(exc_info.value).lower(), \
            "Error message should indicate no lineage graph found"

