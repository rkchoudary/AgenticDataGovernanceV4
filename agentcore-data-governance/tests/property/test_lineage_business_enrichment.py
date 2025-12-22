"""
**Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**

For any lineage node with matching glossary entry, the business_term field must be populated.

**Validates: Requirements 7.2**
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
    GlossaryTerm,
    BusinessGlossary,
)
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


@composite
def glossary_term_strategy(draw, term_name: Optional[str] = None):
    """Generate a GlossaryTerm with optional specified term name."""
    term = term_name or draw(non_empty_string_strategy)
    num_synonyms = draw(st.integers(min_value=0, max_value=3))
    synonyms = [draw(non_empty_string_strategy) for _ in range(num_synonyms)]
    
    return GlossaryTerm(
        term=term,
        definition=draw(st.text(min_size=5, max_size=100)),
        synonyms=synonyms,
        related_terms=[],
    )


@composite
def business_glossary_strategy(draw, min_terms: int = 1, max_terms: int = 10):
    """Generate a BusinessGlossary with multiple terms."""
    num_terms = draw(st.integers(min_value=min_terms, max_value=max_terms))
    terms = [draw(glossary_term_strategy()) for _ in range(num_terms)]
    
    return BusinessGlossary(
        terms=terms,
        version=1,
        last_updated=datetime.now(),
    )


@composite
def lineage_node_strategy(draw, node_name: Optional[str] = None):
    """Generate a LineageNode with optional specified name."""
    return LineageNode(
        id=draw(st.uuids().map(str)),
        type=draw(node_type_strategy),
        name=node_name or draw(non_empty_string_strategy),
        system=draw(st.sampled_from(['SourceDB', 'ETL', 'DataWarehouse', 'Reporting'])),
        technical_details={},
        business_term=None,  # Start without business term
    )


@composite
def lineage_graph_strategy(draw, report_id: str, num_nodes: int = 5):
    """Generate a LineageGraph with specified number of nodes."""
    nodes = [draw(lineage_node_strategy()) for _ in range(num_nodes)]
    
    # Create some edges between nodes
    edges = []
    for i in range(len(nodes) - 1):
        if draw(st.booleans()):
            edges.append(LineageEdge(
                source_node_id=nodes[i].id,
                target_node_id=nodes[i + 1].id,
                transformation_type="transform",
            ))
    
    return LineageGraph(
        report_id=report_id,
        nodes=nodes,
        edges=edges,
        version=1,
        captured_at=datetime.now(),
    )


def find_matching_term(node_name: str, glossary_terms: list[dict]) -> Optional[GlossaryTerm]:
    """
    Find a matching glossary term for a node name.
    
    Matches by:
    - Exact term match (case-insensitive)
    - Synonym match (case-insensitive)
    - Partial match (term in node name or node name in term)
    """
    node_name_lower = node_name.lower()
    
    for term_dict in glossary_terms:
        term = term_dict.get("term", "").lower()
        synonyms = [s.lower() for s in term_dict.get("synonyms", [])]
        
        # Check exact match
        if term == node_name_lower:
            return GlossaryTerm(**term_dict)
        
        # Check synonym match
        if node_name_lower in synonyms:
            return GlossaryTerm(**term_dict)
        
        # Check partial match (as implemented in link_to_business_concepts)
        if term in node_name_lower or node_name_lower in term:
            return GlossaryTerm(**term_dict)
    
    return None


class TestLineageBusinessEnrichment:
    """
    Property 16: Lineage Business Enrichment
    
    Tests that for any lineage node with matching glossary entry,
    the business_term field must be populated.
    """
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_matching_nodes_get_business_term_populated(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**
        **Validates: Requirements 7.2**
        
        Property: When link_to_business_concepts is called, nodes with matching
        glossary entries must have their business_term field populated.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        # Get the link_to_business_concepts tool
        link_to_business_concepts = tools[1]
        
        # Generate a glossary term
        term_name = data.draw(non_empty_string_strategy)
        glossary_term = data.draw(glossary_term_strategy(term_name=term_name))
        
        # Create a node that matches the glossary term
        matching_node = LineageNode(
            id=data.draw(st.uuids().map(str)),
            type=data.draw(node_type_strategy),
            name=term_name,  # Name matches the glossary term
            system="TestSystem",
            technical_details={},
            business_term=None,
        )
        
        # Create additional non-matching nodes
        num_other_nodes = data.draw(st.integers(min_value=0, max_value=3))
        other_nodes = []
        for i in range(num_other_nodes):
            # Use unique names that won't match the glossary term
            unique_name = f"unique_node_{i}_{data.draw(st.uuids().map(str))[:8]}"
            other_nodes.append(LineageNode(
                id=data.draw(st.uuids().map(str)),
                type=data.draw(node_type_strategy),
                name=unique_name,
                system="TestSystem",
                technical_details={},
                business_term=None,
            ))
        
        # Create lineage graph
        all_nodes = [matching_node] + other_nodes
        graph = LineageGraph(
            report_id=report_id,
            nodes=all_nodes,
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        # Store the graph
        repository.set_lineage_graph(report_id, graph)
        
        # Call link_to_business_concepts
        glossary_terms = [glossary_term.model_dump()]
        result = link_to_business_concepts(
            report_id=report_id,
            glossary_terms=glossary_terms,
        )
        
        # Retrieve the updated graph
        updated_graph = repository.get_lineage_graph(report_id)
        assert updated_graph is not None, "Graph should exist after enrichment"
        
        # Find the matching node in the updated graph
        updated_matching_node = next(
            (n for n in updated_graph.nodes if n.id == matching_node.id),
            None
        )
        
        # Property: The matching node must have business_term populated
        assert updated_matching_node is not None, "Matching node should exist"
        assert updated_matching_node.business_term is not None, \
            f"Node '{matching_node.name}' with matching glossary term should have business_term populated"
        assert updated_matching_node.business_term == term_name, \
            f"Node business_term should be '{term_name}', got '{updated_matching_node.business_term}'"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_non_matching_nodes_not_enriched(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**
        **Validates: Requirements 7.2**
        
        Property: Nodes without matching glossary entries should not have
        their business_term field populated by the enrichment process.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        link_to_business_concepts = tools[1]
        
        # Generate glossary terms with specific names
        glossary_term = GlossaryTerm(
            term="SpecificBusinessTerm",
            definition="A specific business term",
            synonyms=["SpecificSynonym"],
            related_terms=[],
        )
        
        # Create nodes with names that definitely won't match
        num_nodes = data.draw(st.integers(min_value=1, max_value=5))
        nodes = []
        for i in range(num_nodes):
            # Use completely unique names that won't match
            unique_name = f"completely_unique_node_{i}_{data.draw(st.uuids().map(str))}"
            nodes.append(LineageNode(
                id=data.draw(st.uuids().map(str)),
                type=data.draw(node_type_strategy),
                name=unique_name,
                system="TestSystem",
                technical_details={},
                business_term=None,
            ))
        
        # Create lineage graph
        graph = LineageGraph(
            report_id=report_id,
            nodes=nodes,
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call link_to_business_concepts
        result = link_to_business_concepts(
            report_id=report_id,
            glossary_terms=[glossary_term.model_dump()],
        )
        
        # Retrieve the updated graph
        updated_graph = repository.get_lineage_graph(report_id)
        assert updated_graph is not None
        
        # Property: Non-matching nodes should not have business_term populated
        for node in updated_graph.nodes:
            # Check if this node matches the glossary term
            matches = (
                glossary_term.term.lower() in node.name.lower() or
                node.name.lower() in glossary_term.term.lower() or
                any(s.lower() in node.name.lower() or node.name.lower() in s.lower() 
                    for s in glossary_term.synonyms)
            )
            
            if not matches:
                assert node.business_term is None, \
                    f"Non-matching node '{node.name}' should not have business_term, got '{node.business_term}'"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_synonym_matching_populates_business_term(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**
        **Validates: Requirements 7.2**
        
        Property: Nodes matching glossary synonyms should also have their
        business_term field populated with the main term.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        link_to_business_concepts = tools[1]
        
        # Generate a glossary term with synonyms
        main_term = data.draw(non_empty_string_strategy)
        synonym = data.draw(non_empty_string_strategy)
        
        # Ensure synonym is different from main term
        assume(synonym.lower() != main_term.lower())
        
        glossary_term = GlossaryTerm(
            term=main_term,
            definition="A business term with synonyms",
            synonyms=[synonym],
            related_terms=[],
        )
        
        # Create a node that matches the synonym
        matching_node = LineageNode(
            id=data.draw(st.uuids().map(str)),
            type=data.draw(node_type_strategy),
            name=synonym,  # Name matches the synonym
            system="TestSystem",
            technical_details={},
            business_term=None,
        )
        
        # Create lineage graph
        graph = LineageGraph(
            report_id=report_id,
            nodes=[matching_node],
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call link_to_business_concepts
        result = link_to_business_concepts(
            report_id=report_id,
            glossary_terms=[glossary_term.model_dump()],
        )
        
        # Retrieve the updated graph
        updated_graph = repository.get_lineage_graph(report_id)
        assert updated_graph is not None
        
        # Find the matching node
        updated_node = next(
            (n for n in updated_graph.nodes if n.id == matching_node.id),
            None
        )
        
        # Property: Node matching synonym should have business_term = main term
        assert updated_node is not None
        assert updated_node.business_term is not None, \
            f"Node '{synonym}' matching synonym should have business_term populated"
        assert updated_node.business_term == main_term, \
            f"Node business_term should be main term '{main_term}', got '{updated_node.business_term}'"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_enrichment_count_matches_actual_enrichments(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**
        **Validates: Requirements 7.2**
        
        Property: The glossary_terms_linked count in the result should match
        the actual number of nodes that were enriched.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        link_to_business_concepts = tools[1]
        
        # Generate glossary terms
        num_terms = data.draw(st.integers(min_value=1, max_value=3))
        glossary_terms = []
        term_names = []
        for i in range(num_terms):
            term_name = f"term_{i}_{data.draw(st.uuids().map(str))[:8]}"
            term_names.append(term_name)
            glossary_terms.append(GlossaryTerm(
                term=term_name,
                definition=f"Definition for {term_name}",
                synonyms=[],
                related_terms=[],
            ))
        
        # Create nodes - some matching, some not
        nodes = []
        expected_matches = 0
        
        # Add matching nodes
        num_matching = data.draw(st.integers(min_value=1, max_value=3))
        for i in range(num_matching):
            term_to_match = term_names[i % len(term_names)]
            nodes.append(LineageNode(
                id=data.draw(st.uuids().map(str)),
                type=data.draw(node_type_strategy),
                name=term_to_match,
                system="TestSystem",
                technical_details={},
                business_term=None,
            ))
            expected_matches += 1
        
        # Add non-matching nodes
        num_non_matching = data.draw(st.integers(min_value=0, max_value=3))
        for i in range(num_non_matching):
            unique_name = f"nonmatch_{i}_{data.draw(st.uuids().map(str))}"
            nodes.append(LineageNode(
                id=data.draw(st.uuids().map(str)),
                type=data.draw(node_type_strategy),
                name=unique_name,
                system="TestSystem",
                technical_details={},
                business_term=None,
            ))
        
        # Create lineage graph
        graph = LineageGraph(
            report_id=report_id,
            nodes=nodes,
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call link_to_business_concepts
        result = link_to_business_concepts(
            report_id=report_id,
            glossary_terms=[t.model_dump() for t in glossary_terms],
        )
        
        # Property: The reported count should match expected matches
        reported_count = result.get("glossary_terms_linked", 0)
        assert reported_count == expected_matches, \
            f"Reported enrichment count {reported_count} should match expected {expected_matches}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_partial_match_enriches_node(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**
        **Validates: Requirements 7.2**
        
        Property: Nodes with partial name matches (term in node name or 
        node name in term) should have business_term populated.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        link_to_business_concepts = tools[1]
        
        # Generate a base term
        base_term = data.draw(non_empty_string_strategy)
        
        # Create a glossary term
        glossary_term = GlossaryTerm(
            term=base_term,
            definition=f"Definition for {base_term}",
            synonyms=[],
            related_terms=[],
        )
        
        # Create a node with a name that contains the term
        node_name = f"prefix_{base_term}_suffix"
        matching_node = LineageNode(
            id=data.draw(st.uuids().map(str)),
            type=data.draw(node_type_strategy),
            name=node_name,
            system="TestSystem",
            technical_details={},
            business_term=None,
        )
        
        # Create lineage graph
        graph = LineageGraph(
            report_id=report_id,
            nodes=[matching_node],
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call link_to_business_concepts
        result = link_to_business_concepts(
            report_id=report_id,
            glossary_terms=[glossary_term.model_dump()],
        )
        
        # Retrieve the updated graph
        updated_graph = repository.get_lineage_graph(report_id)
        assert updated_graph is not None
        
        # Find the node
        updated_node = next(
            (n for n in updated_graph.nodes if n.id == matching_node.id),
            None
        )
        
        # Property: Node with partial match should have business_term populated
        assert updated_node is not None
        assert updated_node.business_term is not None, \
            f"Node '{node_name}' with partial match to '{base_term}' should have business_term"
        assert updated_node.business_term == base_term, \
            f"Node business_term should be '{base_term}', got '{updated_node.business_term}'"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        data=st.data(),
    )
    def test_empty_glossary_does_not_enrich(
        self, report_id: str, data
    ):
        """
        **Feature: agentcore-python-refactor, Property 16: Lineage Business Enrichment**
        **Validates: Requirements 7.2**
        
        Property: When an empty glossary is provided, no nodes should be enriched.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_lineage_tools(repository)
        
        link_to_business_concepts = tools[1]
        
        # Create nodes
        num_nodes = data.draw(st.integers(min_value=1, max_value=5))
        nodes = []
        for i in range(num_nodes):
            nodes.append(LineageNode(
                id=data.draw(st.uuids().map(str)),
                type=data.draw(node_type_strategy),
                name=data.draw(non_empty_string_strategy),
                system="TestSystem",
                technical_details={},
                business_term=None,
            ))
        
        # Create lineage graph
        graph = LineageGraph(
            report_id=report_id,
            nodes=nodes,
            edges=[],
            version=1,
            captured_at=datetime.now(),
        )
        
        repository.set_lineage_graph(report_id, graph)
        
        # Call link_to_business_concepts with empty glossary
        result = link_to_business_concepts(
            report_id=report_id,
            glossary_terms=[],
        )
        
        # Retrieve the updated graph
        updated_graph = repository.get_lineage_graph(report_id)
        assert updated_graph is not None
        
        # Property: No nodes should have business_term populated
        for node in updated_graph.nodes:
            assert node.business_term is None, \
                f"Node '{node.name}' should not have business_term with empty glossary"
        
        # Property: Enrichment count should be 0
        assert result.get("glossary_terms_linked", 0) == 0, \
            "Enrichment count should be 0 with empty glossary"
