"""
Hypothesis strategies for Lineage models.

Contains test data generators for lineage-related Pydantic models.

**Feature: agentcore-python-refactor, Property 15-17: Lineage Graph and Impact**
**Validates: Requirements 7.1, 7.2, 7.5**
"""

from datetime import datetime
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.lineage import (
    LineageNode,
    LineageEdge,
    LineageGraph,
    EnrichedLineage,
    ImpactAnalysis,
    LineageDiagram,
    LineageReport,
    GlossaryTerm,
    BusinessGlossary,
    ConnectionConfig,
    DataSource,
    LineageNodeType,
    DataSourceType,
    DiagramFormat,
    ReportFormat,
)


# Basic strategies - node types as specified in requirements
lineage_node_type_strategy = st.sampled_from(['source_table', 'transformation', 'staging_table', 'report_field'])
data_source_type_strategy = st.sampled_from(['database', 'file', 'api', 'stream'])
diagram_format_strategy = st.sampled_from(['mermaid', 'svg', 'png'])
report_format_strategy = st.sampled_from(['markdown', 'html', 'pdf'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# System names
system_strategy = st.sampled_from([
    'Oracle', 'PostgreSQL', 'MySQL', 'SQL Server',
    'Snowflake', 'Databricks', 'Spark', 'Kafka',
    'S3', 'HDFS', 'API Gateway'
])


@composite
def lineage_node_strategy(draw, node_type: LineageNodeType = None, node_id: str = None):
    """
    Generate a LineageNode.
    
    Args:
        node_type: Optional specific node type.
        node_id: Optional specific node ID.
    """
    return LineageNode(
        id=node_id or draw(st.uuids().map(str)),
        type=node_type or draw(lineage_node_type_strategy),
        name=draw(non_empty_string_strategy),
        system=draw(system_strategy),
        technical_details=draw(st.fixed_dictionaries({
            'schema': st.just('public'),
            'table': non_empty_string_strategy
        }) | st.just({})),
        business_term=draw(st.none() | non_empty_string_strategy),
        policies=draw(st.lists(non_empty_string_strategy, min_size=0, max_size=3)),
        controls=draw(st.lists(non_empty_string_strategy, min_size=0, max_size=3))
    )


@composite
def lineage_edge_strategy(draw, source_id: str = None, target_id: str = None):
    """
    Generate a LineageEdge.
    
    Args:
        source_id: Optional specific source node ID.
        target_id: Optional specific target node ID.
    """
    transformation_types = ['direct_copy', 'aggregation', 'filter', 'join', 'calculation', 'lookup']
    
    return LineageEdge(
        id=draw(st.uuids().map(str)),
        source_node_id=source_id or draw(st.uuids().map(str)),
        target_node_id=target_id or draw(st.uuids().map(str)),
        transformation_type=draw(st.sampled_from(transformation_types)),
        transformation_logic=draw(st.none() | st.text(
            min_size=5,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
    )


@composite
def lineage_graph_strategy(draw, min_nodes: int = 1, max_nodes: int = 10, connected: bool = True):
    """
    Generate a LineageGraph.
    
    Args:
        min_nodes: Minimum number of nodes.
        max_nodes: Maximum number of nodes.
        connected: If True, ensures all nodes are connected via edges.
    """
    num_nodes = draw(st.integers(min_value=min_nodes, max_value=max_nodes))
    nodes = [draw(lineage_node_strategy()) for _ in range(num_nodes)]
    
    edges = []
    if connected and len(nodes) > 1:
        # Create a connected graph by linking nodes sequentially
        for i in range(len(nodes) - 1):
            edge = draw(lineage_edge_strategy(
                source_id=nodes[i].id,
                target_id=nodes[i + 1].id
            ))
            edges.append(edge)
        
        # Add some random additional edges
        extra_edges = draw(st.integers(min_value=0, max_value=min(5, len(nodes))))
        for _ in range(extra_edges):
            src_idx = draw(st.integers(min_value=0, max_value=len(nodes) - 1))
            tgt_idx = draw(st.integers(min_value=0, max_value=len(nodes) - 1))
            if src_idx != tgt_idx:
                edge = draw(lineage_edge_strategy(
                    source_id=nodes[src_idx].id,
                    target_id=nodes[tgt_idx].id
                ))
                edges.append(edge)
    
    return LineageGraph(
        id=draw(st.uuids().map(str)),
        report_id=draw(st.uuids().map(str)),
        nodes=nodes,
        edges=edges,
        version=draw(st.integers(min_value=0, max_value=100)),
        captured_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def enriched_lineage_strategy(draw):
    """Generate an EnrichedLineage."""
    graph = draw(lineage_graph_strategy())
    # Count nodes with business terms
    terms_linked = sum(1 for node in graph.nodes if node.business_term is not None)
    
    return EnrichedLineage(
        graph=graph,
        enriched_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        glossary_terms_linked=terms_linked
    )


@composite
def impact_analysis_strategy(draw):
    """Generate an ImpactAnalysis."""
    return ImpactAnalysis(
        changed_source=draw(st.uuids().map(str)),
        impacted_cdes=draw(st.lists(st.uuids().map(str), min_size=0, max_size=10)),
        impacted_reports=draw(st.lists(st.uuids().map(str), min_size=0, max_size=5)),
        impacted_nodes=draw(st.lists(st.uuids().map(str), min_size=0, max_size=20)),
        analyzed_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def lineage_diagram_strategy(draw):
    """Generate a LineageDiagram."""
    fmt = draw(diagram_format_strategy)
    
    # Generate appropriate content based on format
    if fmt == 'mermaid':
        content = 'graph LR\n  A[Source] --> B[Transform] --> C[Target]'
    else:
        content = draw(st.text(min_size=10, max_size=1000))
    
    return LineageDiagram(
        cde_id=draw(st.uuids().map(str)),
        format=fmt,
        content=content,
        generated_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def lineage_report_strategy(draw):
    """Generate a LineageReport."""
    return LineageReport(
        report_id=draw(st.uuids().map(str)),
        content=draw(st.text(
            min_size=50,
            max_size=2000,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        format=draw(report_format_strategy),
        generated_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def glossary_term_strategy(draw):
    """Generate a GlossaryTerm."""
    return GlossaryTerm(
        id=draw(st.uuids().map(str)),
        term=draw(non_empty_string_strategy),
        definition=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        synonyms=draw(st.lists(non_empty_string_strategy, min_size=0, max_size=5)),
        related_terms=draw(st.lists(non_empty_string_strategy, min_size=0, max_size=5))
    )


@composite
def business_glossary_strategy(draw, min_terms: int = 0, max_terms: int = 20):
    """Generate a BusinessGlossary."""
    return BusinessGlossary(
        id=draw(st.uuids().map(str)),
        terms=draw(st.lists(glossary_term_strategy(), min_size=min_terms, max_size=max_terms)),
        version=draw(st.integers(min_value=0, max_value=100)),
        last_updated=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def connection_config_strategy(draw):
    """Generate a ConnectionConfig."""
    return ConnectionConfig(
        host=draw(st.none() | st.just('localhost')),
        port=draw(st.none() | st.integers(min_value=1024, max_value=65535)),
        database=draw(st.none() | non_empty_string_strategy),
        credentials=draw(st.none() | st.just('secret_ref')),
        additional_params=draw(st.fixed_dictionaries({}) | st.fixed_dictionaries({
            'ssl': st.just('true'),
            'timeout': st.just('30')
        }))
    )


@composite
def data_source_strategy(draw):
    """Generate a DataSource."""
    return DataSource(
        id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        type=draw(data_source_type_strategy),
        connection_config=draw(connection_config_strategy())
    )
