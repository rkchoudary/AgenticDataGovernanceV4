"""
Lineage models for the Agentic Data Governance System.

This module defines Pydantic models for lineage graphs, nodes, edges, and impact analysis.

Requirements: 2.4
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases - node types as specified in requirements
LineageNodeType = Literal['source_table', 'transformation', 'staging_table', 'report_field']
DataSourceType = Literal['database', 'file', 'api', 'stream']
DiagramFormat = Literal['mermaid', 'svg', 'png']
ReportFormat = Literal['markdown', 'html', 'pdf']


class LineageNode(BaseModel):
    """Node in the lineage graph."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: LineageNodeType
    name: str
    system: str
    technical_details: dict[str, str] = {}
    business_term: Optional[str] = None
    policies: list[str] = []
    controls: list[str] = []


class LineageEdge(BaseModel):
    """Edge connecting lineage nodes."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    source_node_id: str
    target_node_id: str
    transformation_type: str
    transformation_logic: Optional[str] = None


class LineageGraph(BaseModel):
    """Lineage graph."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    report_id: str
    nodes: list[LineageNode] = []
    edges: list[LineageEdge] = []
    version: int = 0
    captured_at: datetime


class EnrichedLineage(BaseModel):
    """Enriched lineage with business context."""
    graph: LineageGraph
    enriched_at: datetime
    glossary_terms_linked: int = 0


class ImpactAnalysis(BaseModel):
    """Impact analysis result."""
    changed_source: str
    impacted_cdes: list[str] = []
    impacted_reports: list[str] = []
    impacted_nodes: list[str] = []
    analyzed_at: datetime


class LineageDiagram(BaseModel):
    """Lineage diagram output."""
    cde_id: str
    format: DiagramFormat
    content: str
    generated_at: datetime


class LineageReport(BaseModel):
    """Lineage report output."""
    report_id: str
    content: str
    format: ReportFormat
    generated_at: datetime


class GlossaryTerm(BaseModel):
    """Term in the business glossary."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    term: str
    definition: str
    synonyms: list[str] = []
    related_terms: list[str] = []


class BusinessGlossary(BaseModel):
    """Business glossary for enrichment."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    terms: list[GlossaryTerm] = []
    version: int = 0
    last_updated: datetime


class ConnectionConfig(BaseModel):
    """Connection configuration for external systems."""
    host: Optional[str] = None
    port: Optional[int] = None
    database: Optional[str] = None
    credentials: Optional[str] = None
    additional_params: dict[str, str] = {}


class DataSource(BaseModel):
    """Data source for lineage scanning."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    type: DataSourceType
    connection_config: ConnectionConfig
