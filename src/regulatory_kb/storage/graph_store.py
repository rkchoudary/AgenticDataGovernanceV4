"""FalkorDB graph store implementation for regulatory knowledge base."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from falkordb import FalkorDB

from regulatory_kb.models.document import Document, DocumentCategory
from regulatory_kb.models.regulator import Regulator
from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
from regulatory_kb.models.requirement import RegulatoryRequirement
from regulatory_kb.storage.schema import NodeType, GraphSchema


@dataclass
class GraphStoreConfig:
    """Configuration for FalkorDB connection."""

    host: str = "localhost"
    port: int = 6379
    password: Optional[str] = None
    graph_name: str = "regulatory_kb"
    ssl: bool = False
    socket_timeout: float = 30.0


@dataclass
class QueryResult:
    """Result from a graph query."""

    nodes: list[dict[str, Any]] = field(default_factory=list)
    relationships: list[dict[str, Any]] = field(default_factory=list)
    raw_result: Any = None


class FalkorDBStore:
    """FalkorDB graph store for regulatory documents and relationships.
    
    Implements the graph schema defined in the design document:
    - Document nodes with regulatory metadata
    - Regulator nodes for issuing bodies
    - Requirement nodes for regulatory obligations
    - Form and Section nodes for document structure
    - Relationships: ISSUED_BY, IMPLEMENTS, REFERENCES, etc.
    """

    def __init__(self, config: Optional[GraphStoreConfig] = None):
        """Initialize the FalkorDB store.
        
        Args:
            config: Connection configuration. Uses defaults if not provided.
        """
        self.config = config or GraphStoreConfig()
        self._client: Optional[FalkorDB] = None
        self._graph = None

    def connect(self) -> None:
        """Establish connection to FalkorDB."""
        self._client = FalkorDB(
            host=self.config.host,
            port=self.config.port,
            password=self.config.password,
        )
        self._graph = self._client.select_graph(self.config.graph_name)

    def disconnect(self) -> None:
        """Close the FalkorDB connection."""
        if self._client:
            self._client = None
            self._graph = None

    @property
    def is_connected(self) -> bool:
        """Check if connected to FalkorDB."""
        return self._client is not None and self._graph is not None

    def _ensure_connected(self) -> None:
        """Ensure connection is established."""
        if not self.is_connected:
            raise ConnectionError("Not connected to FalkorDB. Call connect() first.")

    def initialize_schema(self) -> None:
        """Initialize graph schema with indexes.
        
        Creates indexes for efficient querying on key properties.
        """
        self._ensure_connected()
        
        for query in GraphSchema.get_create_index_queries(self.config.graph_name):
            try:
                self._graph.query(query)
            except Exception:
                # Index may already exist, continue
                pass

    # ==================== Node Creation ====================

    def create_document_node(self, document: Document) -> str:
        """Create a Document node in the graph.
        
        Args:
            document: Document model to store.
            
        Returns:
            The document ID.
        """
        self._ensure_connected()
        
        categories_str = ",".join([c.value for c in document.categories])
        effective_date = (
            document.metadata.effective_date.isoformat()
            if document.metadata.effective_date
            else None
        )
        
        query = """
        MERGE (d:Document {id: $id})
        SET d.title = $title,
            d.document_type = $document_type,
            d.regulator_id = $regulator_id,
            d.source_url = $source_url,
            d.categories = $categories,
            d.effective_date = $effective_date,
            d.version = $version,
            d.created_at = $created_at,
            d.updated_at = $updated_at
        RETURN d.id
        """
        
        params = {
            "id": document.id,
            "title": document.title,
            "document_type": document.document_type.value,
            "regulator_id": document.regulator_id,
            "source_url": document.source_url,
            "categories": categories_str,
            "effective_date": effective_date,
            "version": document.metadata.version,
            "created_at": document.created_at.isoformat(),
            "updated_at": document.updated_at.isoformat(),
        }
        
        self._graph.query(query, params)
        return document.id

    def create_regulator_node(self, regulator: Regulator) -> str:
        """Create a Regulator node in the graph.
        
        Args:
            regulator: Regulator model to store.
            
        Returns:
            The regulator ID.
        """
        self._ensure_connected()
        
        query = """
        MERGE (r:Regulator {id: $id})
        SET r.name = $name,
            r.abbreviation = $abbreviation,
            r.country = $country,
            r.regulator_type = $regulator_type,
            r.website = $website
        RETURN r.id
        """
        
        params = {
            "id": regulator.id,
            "name": regulator.name,
            "abbreviation": regulator.abbreviation,
            "country": regulator.country.value,
            "regulator_type": regulator.regulator_type.value,
            "website": regulator.website,
        }
        
        self._graph.query(query, params)
        return regulator.id

    def create_requirement_node(self, requirement: RegulatoryRequirement) -> str:
        """Create a Requirement node in the graph.
        
        Args:
            requirement: RegulatoryRequirement model to store.
            
        Returns:
            The requirement ID.
        """
        self._ensure_connected()
        
        deadline_frequency = (
            requirement.deadline.frequency.value if requirement.deadline else None
        )
        deadline_due_date = (
            requirement.deadline.due_date if requirement.deadline else None
        )
        effective_date = (
            requirement.effective_date.isoformat()
            if requirement.effective_date
            else None
        )
        
        query = """
        MERGE (req:Requirement {id: $id})
        SET req.description = $description,
            req.regulator_id = $regulator_id,
            req.deadline_frequency = $deadline_frequency,
            req.deadline_due_date = $deadline_due_date,
            req.effective_date = $effective_date
        RETURN req.id
        """
        
        params = {
            "id": requirement.id,
            "description": requirement.description,
            "regulator_id": requirement.regulator_id,
            "deadline_frequency": deadline_frequency,
            "deadline_due_date": deadline_due_date,
            "effective_date": effective_date,
        }
        
        self._graph.query(query, params)
        return requirement.id

    def create_form_node(
        self,
        number: str,
        name: str,
        form_type: str,
        regulator_id: str,
    ) -> str:
        """Create a Form node in the graph.
        
        Args:
            number: Form number (e.g., FR Y-14A).
            name: Form name.
            form_type: Type of form.
            regulator_id: ID of the issuing regulator.
            
        Returns:
            The form number as identifier.
        """
        self._ensure_connected()
        
        query = """
        MERGE (f:Form {number: $number})
        SET f.name = $name,
            f.form_type = $form_type,
            f.regulator_id = $regulator_id
        RETURN f.number
        """
        
        params = {
            "number": number,
            "name": name,
            "form_type": form_type,
            "regulator_id": regulator_id,
        }
        
        self._graph.query(query, params)
        return number

    def create_section_node(
        self,
        cfr_section: str,
        title: str,
        document_id: str,
        content_hash: Optional[str] = None,
    ) -> str:
        """Create a Section node in the graph.
        
        Args:
            cfr_section: CFR section reference (e.g., 12 CFR 249).
            title: Section title.
            document_id: ID of the parent document.
            content_hash: Hash of section content for change detection.
            
        Returns:
            The CFR section as identifier.
        """
        self._ensure_connected()
        
        query = """
        MERGE (s:Section {cfr_section: $cfr_section})
        SET s.title = $title,
            s.document_id = $document_id,
            s.content_hash = $content_hash
        RETURN s.cfr_section
        """
        
        params = {
            "cfr_section": cfr_section,
            "title": title,
            "document_id": document_id,
            "content_hash": content_hash,
        }
        
        self._graph.query(query, params)
        return cfr_section

    # ==================== Relationship Creation ====================

    def create_relationship(self, relationship: GraphRelationship) -> bool:
        """Create a relationship between two nodes.
        
        Args:
            relationship: GraphRelationship model defining the relationship.
            
        Returns:
            True if relationship was created successfully.
        """
        self._ensure_connected()
        
        # Build properties string for the relationship
        props = {
            "created_at": relationship.created_at.isoformat(),
            "validated": relationship.validated,
        }
        if relationship.strength is not None:
            props["strength"] = relationship.strength
        props.update(relationship.properties)
        
        # Determine source and target node types based on relationship type
        source_label, target_label = self._get_node_labels_for_relationship(
            relationship.relationship_type
        )
        
        query = f"""
        MATCH (source:{source_label} {{id: $source_id}})
        MATCH (target:{target_label} {{id: $target_id}})
        MERGE (source)-[r:{relationship.relationship_type.value}]->(target)
        SET r = $props
        RETURN type(r)
        """
        
        params = {
            "source_id": relationship.source_node,
            "target_id": relationship.target_node,
            "props": props,
        }
        
        result = self._graph.query(query, params)
        return result.result_set is not None and len(result.result_set) > 0

    def _get_node_labels_for_relationship(
        self, rel_type: RelationshipType
    ) -> tuple[str, str]:
        """Get source and target node labels for a relationship type.
        
        Args:
            rel_type: Type of relationship.
            
        Returns:
            Tuple of (source_label, target_label).
        """
        mapping = {
            RelationshipType.ISSUED_BY: ("Document", "Regulator"),
            RelationshipType.IMPLEMENTS: ("Document", "Requirement"),
            RelationshipType.REFERENCES: ("Document", "Document"),
            RelationshipType.DESCRIBED_IN: ("Form", "Document"),
            RelationshipType.PART_OF: ("Section", "Document"),
            RelationshipType.SUPERSEDES: ("Requirement", "Requirement"),
            RelationshipType.AMENDS: ("Document", "Document"),
            RelationshipType.RELATED_TO: ("Document", "Document"),
            RelationshipType.CHUNK_OF: ("Chunk", "Document"),
            RelationshipType.NEXT_CHUNK: ("Chunk", "Chunk"),
            RelationshipType.PREVIOUS_CHUNK: ("Chunk", "Chunk"),
        }
        return mapping.get(rel_type, ("Document", "Document"))

    def create_issued_by_relationship(
        self, document_id: str, regulator_id: str
    ) -> bool:
        """Create ISSUED_BY relationship between document and regulator.
        
        Args:
            document_id: ID of the document.
            regulator_id: ID of the regulator.
            
        Returns:
            True if relationship was created.
        """
        relationship = GraphRelationship(
            source_node=document_id,
            target_node=regulator_id,
            relationship_type=RelationshipType.ISSUED_BY,
            validated=True,
        )
        return self.create_relationship(relationship)

    def create_implements_relationship(
        self,
        document_id: str,
        requirement_id: str,
        section: Optional[str] = None,
        strength: float = 1.0,
    ) -> bool:
        """Create IMPLEMENTS relationship between document and requirement.
        
        Args:
            document_id: ID of the document.
            requirement_id: ID of the requirement.
            section: Optional section reference.
            strength: Relationship strength (0.0 to 1.0).
            
        Returns:
            True if relationship was created.
        """
        props = {}
        if section:
            props["section"] = section
        
        relationship = GraphRelationship(
            source_node=document_id,
            target_node=requirement_id,
            relationship_type=RelationshipType.IMPLEMENTS,
            properties=props,
            strength=strength,
            validated=True,
        )
        return self.create_relationship(relationship)

    def create_references_relationship(
        self,
        source_document_id: str,
        target_document_id: str,
        context: Optional[str] = None,
    ) -> bool:
        """Create REFERENCES relationship between two documents.
        
        Args:
            source_document_id: ID of the source document.
            target_document_id: ID of the referenced document.
            context: Optional context for the reference.
            
        Returns:
            True if relationship was created.
        """
        props = {}
        if context:
            props["context"] = context
        
        relationship = GraphRelationship(
            source_node=source_document_id,
            target_node=target_document_id,
            relationship_type=RelationshipType.REFERENCES,
            properties=props,
        )
        return self.create_relationship(relationship)

    # ==================== Query Operations ====================

    def query(self, cypher_query: str, params: Optional[dict] = None) -> QueryResult:
        """Execute a raw Cypher query.
        
        Args:
            cypher_query: OpenCypher query string.
            params: Optional query parameters.
            
        Returns:
            QueryResult with nodes and relationships.
        """
        self._ensure_connected()
        
        result = self._graph.query(cypher_query, params or {})
        
        return QueryResult(
            nodes=self._extract_nodes(result),
            relationships=self._extract_relationships(result),
            raw_result=result,
        )

    def _extract_nodes(self, result: Any) -> list[dict[str, Any]]:
        """Extract node data from query result."""
        nodes = []
        if result.result_set:
            for row in result.result_set:
                for item in row:
                    if hasattr(item, "properties"):
                        nodes.append(dict(item.properties))
        return nodes

    def _extract_relationships(self, result: Any) -> list[dict[str, Any]]:
        """Extract relationship data from query result."""
        relationships = []
        if result.result_set:
            for row in result.result_set:
                for item in row:
                    if hasattr(item, "relation"):
                        relationships.append({
                            "type": item.relation,
                            "properties": dict(item.properties) if hasattr(item, "properties") else {},
                        })
        return relationships

    def get_document_by_id(self, document_id: str) -> Optional[dict[str, Any]]:
        """Get a document node by ID.
        
        Args:
            document_id: Document ID to retrieve.
            
        Returns:
            Document properties or None if not found.
        """
        query = """
        MATCH (d:Document {id: $id})
        RETURN d
        """
        result = self.query(query, {"id": document_id})
        return result.nodes[0] if result.nodes else None

    def get_documents_by_regulator(
        self, regulator_id: str, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Get all documents issued by a regulator.
        
        Args:
            regulator_id: Regulator ID to filter by.
            limit: Maximum number of documents to return.
            
        Returns:
            List of document properties.
        """
        query = """
        MATCH (d:Document {regulator_id: $regulator_id})
        RETURN d
        LIMIT $limit
        """
        result = self.query(query, {"regulator_id": regulator_id, "limit": limit})
        return result.nodes

    def get_documents_by_category(
        self, category: DocumentCategory, limit: int = 100
    ) -> list[dict[str, Any]]:
        """Get documents by regulatory category.
        
        Args:
            category: Document category to filter by.
            limit: Maximum number of documents to return.
            
        Returns:
            List of document properties.
        """
        query = """
        MATCH (d:Document)
        WHERE d.categories CONTAINS $category
        RETURN d
        LIMIT $limit
        """
        result = self.query(query, {"category": category.value, "limit": limit})
        return result.nodes

    def get_related_documents(
        self, document_id: str, relationship_type: Optional[RelationshipType] = None
    ) -> list[dict[str, Any]]:
        """Get documents related to a given document.
        
        Args:
            document_id: Source document ID.
            relationship_type: Optional filter by relationship type.
            
        Returns:
            List of related document properties.
        """
        if relationship_type:
            query = f"""
            MATCH (d:Document {{id: $id}})-[:{relationship_type.value}]->(related:Document)
            RETURN related
            """
        else:
            query = """
            MATCH (d:Document {id: $id})-[]->(related:Document)
            RETURN related
            """
        
        result = self.query(query, {"id": document_id})
        return result.nodes

    def search_documents(
        self,
        search_term: str,
        regulator_id: Optional[str] = None,
        category: Optional[DocumentCategory] = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Search documents by title with optional filters.
        
        Args:
            search_term: Term to search in document titles.
            regulator_id: Optional regulator filter.
            category: Optional category filter.
            limit: Maximum results to return.
            
        Returns:
            List of matching document properties.
        """
        conditions = ["d.title CONTAINS $search_term"]
        params: dict[str, Any] = {"search_term": search_term, "limit": limit}
        
        if regulator_id:
            conditions.append("d.regulator_id = $regulator_id")
            params["regulator_id"] = regulator_id
        
        if category:
            conditions.append("d.categories CONTAINS $category")
            params["category"] = category.value
        
        where_clause = " AND ".join(conditions)
        query = f"""
        MATCH (d:Document)
        WHERE {where_clause}
        RETURN d
        LIMIT $limit
        """
        
        result = self.query(query, params)
        return result.nodes

    def delete_document(self, document_id: str) -> bool:
        """Delete a document and its relationships.
        
        Args:
            document_id: ID of document to delete.
            
        Returns:
            True if document was deleted.
        """
        self._ensure_connected()
        
        query = """
        MATCH (d:Document {id: $id})
        DETACH DELETE d
        RETURN count(d) as deleted
        """
        
        result = self._graph.query(query, {"id": document_id})
        return result.result_set is not None and len(result.result_set) > 0

    def clear_graph(self) -> None:
        """Delete all nodes and relationships in the graph.
        
        WARNING: This is destructive and should only be used for testing.
        """
        self._ensure_connected()
        self._graph.query("MATCH (n) DETACH DELETE n")
