"""Graph schema definitions for FalkorDB."""

from enum import Enum
from typing import Any


class NodeType(str, Enum):
    """Types of nodes in the regulatory knowledge graph."""

    DOCUMENT = "Document"
    REGULATOR = "Regulator"
    REQUIREMENT = "Requirement"
    FORM = "Form"
    SECTION = "Section"
    CHUNK = "Chunk"


class GraphSchema:
    """Schema definitions for the regulatory knowledge graph.
    
    Defines node properties and relationship types following the design:
    - Document: id, title, type, regulator, date, version
    - Regulator: name, country, type
    - Requirement: id, description, deadline, frequency
    - Form: number, name, type
    - Section: cfr_section, title, content
    
    Relationship Types:
    - ISSUED_BY: Document -> Regulator
    - IMPLEMENTS: Document -> Requirement
    - REFERENCES: Document -> Document
    - DESCRIBED_IN: Form -> Document
    - PART_OF: Section -> Document
    - SUPERSEDES: Requirement -> Requirement
    """

    # Node property definitions
    NODE_PROPERTIES: dict[NodeType, list[str]] = {
        NodeType.DOCUMENT: [
            "id",
            "title",
            "document_type",
            "regulator_id",
            "source_url",
            "categories",
            "effective_date",
            "version",
            "created_at",
            "updated_at",
        ],
        NodeType.REGULATOR: [
            "id",
            "name",
            "abbreviation",
            "country",
            "regulator_type",
            "website",
        ],
        NodeType.REQUIREMENT: [
            "id",
            "description",
            "regulator_id",
            "deadline_frequency",
            "deadline_due_date",
            "effective_date",
        ],
        NodeType.FORM: [
            "number",
            "name",
            "form_type",
            "regulator_id",
        ],
        NodeType.SECTION: [
            "cfr_section",
            "title",
            "content_hash",
            "document_id",
        ],
        NodeType.CHUNK: [
            "chunk_id",
            "document_id",
            "chunk_index",
            "total_chunks",
            "section_path",
            "token_count",
            "chunk_type",
            "section_title",
            "content_hash",
            "created_at",
        ],
    }

    # Index definitions for efficient queries
    INDEX_DEFINITIONS: dict[NodeType, list[str]] = {
        NodeType.DOCUMENT: ["id", "regulator_id", "document_type"],
        NodeType.REGULATOR: ["id", "abbreviation", "country"],
        NodeType.REQUIREMENT: ["id", "regulator_id"],
        NodeType.FORM: ["number", "regulator_id"],
        NodeType.SECTION: ["cfr_section", "document_id"],
        NodeType.CHUNK: ["chunk_id", "document_id", "chunk_index"],
    }

    @classmethod
    def get_create_index_queries(cls, graph_name: str) -> list[str]:
        """Generate Cypher queries to create indexes for all node types.
        
        Args:
            graph_name: Name of the graph to create indexes for.
            
        Returns:
            List of Cypher CREATE INDEX queries.
        """
        queries = []
        for node_type, properties in cls.INDEX_DEFINITIONS.items():
            for prop in properties:
                query = f"CREATE INDEX FOR (n:{node_type.value}) ON (n.{prop})"
                queries.append(query)
        return queries

    @classmethod
    def validate_node_properties(
        cls, node_type: NodeType, properties: dict[str, Any]
    ) -> tuple[bool, list[str]]:
        """Validate that node properties match the schema.
        
        Args:
            node_type: Type of node to validate.
            properties: Properties to validate.
            
        Returns:
            Tuple of (is_valid, list of missing required properties).
        """
        required_props = {"id"} if node_type != NodeType.SECTION else {"cfr_section"}
        missing = []
        
        for prop in required_props:
            if prop not in properties or properties[prop] is None:
                missing.append(prop)
        
        return len(missing) == 0, missing
