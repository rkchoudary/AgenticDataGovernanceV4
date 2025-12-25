"""Graph relationship management for regulatory knowledge base.

Implements automatic relationship detection, validation, version history
tracking, and graph traversal utilities.
"""

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from regulatory_kb.models.document import Document, DocumentCategory
from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
from regulatory_kb.storage.graph_store import FalkorDBStore


class RelationshipPattern(str, Enum):
    """Patterns for automatic relationship detection."""

    CFR_REFERENCE = "cfr_reference"
    FORM_REFERENCE = "form_reference"
    REGULATOR_MATCH = "regulator_match"
    CATEGORY_OVERLAP = "category_overlap"
    SUPERSESSION = "supersession"
    AMENDMENT = "amendment"


@dataclass
class DetectedRelationship:
    """A relationship detected through automatic analysis."""

    source_id: str
    target_id: str
    relationship_type: RelationshipType
    pattern: RelationshipPattern
    confidence: float
    evidence: str
    validated: bool = False


@dataclass
class VersionHistoryEntry:
    """Entry in document version history."""

    document_id: str
    version: str
    timestamp: datetime
    content_hash: str
    changes: list[str] = field(default_factory=list)
    previous_version_id: Optional[str] = None


@dataclass
class IntegrityCheckResult:
    """Result of a relationship integrity check."""

    is_valid: bool
    orphaned_relationships: list[str] = field(default_factory=list)
    missing_targets: list[str] = field(default_factory=list)
    duplicate_relationships: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class RelationshipManager:
    """Manages graph relationships with automatic detection and validation.
    
    Provides:
    - Automatic relationship detection between documents
    - Relationship validation and integrity checks
    - Version history tracking for document updates
    - Graph traversal utilities for complex queries
    """

    # Regex patterns for detecting references
    CFR_PATTERN = re.compile(r"(\d+)\s*CFR\s*(Part\s*)?(\d+)(?:\.(\d+))?", re.IGNORECASE)
    FORM_PATTERN = re.compile(r"(FR\s*Y-\d+[A-Z]?|FFIEC\s*\d+|BCAR|LRR|LCTR|EFTR)", re.IGNORECASE)
    
    def __init__(self, store: FalkorDBStore):
        """Initialize the relationship manager.
        
        Args:
            store: FalkorDB store instance.
        """
        self.store = store

    # ==================== Automatic Relationship Detection ====================

    def detect_relationships(
        self, document: Document, existing_documents: list[dict[str, Any]]
    ) -> list[DetectedRelationship]:
        """Detect potential relationships for a document.
        
        Analyzes document content and metadata to find relationships
        with existing documents in the graph.
        
        Args:
            document: Document to analyze.
            existing_documents: List of existing document properties from graph.
            
        Returns:
            List of detected relationships with confidence scores.
        """
        detected = []
        
        # Detect CFR references
        detected.extend(self._detect_cfr_references(document, existing_documents))
        
        # Detect form references
        detected.extend(self._detect_form_references(document, existing_documents))
        
        # Detect regulator-based relationships
        detected.extend(self._detect_regulator_relationships(document, existing_documents))
        
        # Detect category-based relationships
        detected.extend(self._detect_category_relationships(document, existing_documents))
        
        # Detect supersession relationships
        detected.extend(self._detect_supersession(document, existing_documents))
        
        return detected

    def _detect_cfr_references(
        self, document: Document, existing_documents: list[dict[str, Any]]
    ) -> list[DetectedRelationship]:
        """Detect CFR section references in document content."""
        detected = []
        
        if not document.content or not document.content.text:
            return detected
        
        # Find all CFR references in the document
        matches = self.CFR_PATTERN.findall(document.content.text)
        
        for match in matches:
            title, _, part, section = match
            cfr_ref = f"{title} CFR {part}"
            if section:
                cfr_ref += f".{section}"
            
            # Look for matching documents
            for existing in existing_documents:
                existing_cfr = existing.get("cfr_section") or ""
                if cfr_ref.lower() in existing_cfr.lower():
                    detected.append(DetectedRelationship(
                        source_id=document.id,
                        target_id=existing["id"],
                        relationship_type=RelationshipType.REFERENCES,
                        pattern=RelationshipPattern.CFR_REFERENCE,
                        confidence=0.9,
                        evidence=f"CFR reference: {cfr_ref}",
                    ))
        
        return detected

    def _detect_form_references(
        self, document: Document, existing_documents: list[dict[str, Any]]
    ) -> list[DetectedRelationship]:
        """Detect form number references in document content."""
        detected = []
        
        if not document.content or not document.content.text:
            return detected
        
        matches = self.FORM_PATTERN.findall(document.content.text)
        
        for form_ref in matches:
            normalized_ref = form_ref.replace(" ", "").upper()
            
            for existing in existing_documents:
                existing_form = (existing.get("form_number") or "").replace(" ", "").upper()
                if normalized_ref == existing_form and existing["id"] != document.id:
                    detected.append(DetectedRelationship(
                        source_id=document.id,
                        target_id=existing["id"],
                        relationship_type=RelationshipType.REFERENCES,
                        pattern=RelationshipPattern.FORM_REFERENCE,
                        confidence=0.85,
                        evidence=f"Form reference: {form_ref}",
                    ))
        
        return detected

    def _detect_regulator_relationships(
        self, document: Document, existing_documents: list[dict[str, Any]]
    ) -> list[DetectedRelationship]:
        """Detect relationships based on same regulator."""
        detected = []
        
        for existing in existing_documents:
            if (
                existing.get("regulator_id") == document.regulator_id
                and existing["id"] != document.id
            ):
                # Same regulator documents are potentially related
                detected.append(DetectedRelationship(
                    source_id=document.id,
                    target_id=existing["id"],
                    relationship_type=RelationshipType.RELATED_TO,
                    pattern=RelationshipPattern.REGULATOR_MATCH,
                    confidence=0.5,
                    evidence=f"Same regulator: {document.regulator_id}",
                ))
        
        return detected

    def _detect_category_relationships(
        self, document: Document, existing_documents: list[dict[str, Any]]
    ) -> list[DetectedRelationship]:
        """Detect relationships based on category overlap."""
        detected = []
        
        doc_categories = set(c.value for c in document.categories)
        
        for existing in existing_documents:
            if existing["id"] == document.id:
                continue
            
            existing_categories = set(
                (existing.get("categories") or "").split(",")
            )
            
            overlap = doc_categories & existing_categories
            if overlap:
                confidence = len(overlap) / max(len(doc_categories), 1)
                detected.append(DetectedRelationship(
                    source_id=document.id,
                    target_id=existing["id"],
                    relationship_type=RelationshipType.RELATED_TO,
                    pattern=RelationshipPattern.CATEGORY_OVERLAP,
                    confidence=min(0.7, confidence),
                    evidence=f"Category overlap: {', '.join(overlap)}",
                ))
        
        return detected

    def _detect_supersession(
        self, document: Document, existing_documents: list[dict[str, Any]]
    ) -> list[DetectedRelationship]:
        """Detect supersession relationships based on version patterns."""
        detected = []
        
        # Extract base document identifier (without year/version)
        base_id = self._extract_base_document_id(document.id)
        
        for existing in existing_documents:
            if existing["id"] == document.id:
                continue
            
            existing_base = self._extract_base_document_id(existing["id"])
            
            if base_id == existing_base:
                # Same base document, check versions
                doc_version = document.metadata.version or ""
                existing_version = existing.get("version") or ""
                
                if self._is_newer_version(doc_version, existing_version):
                    detected.append(DetectedRelationship(
                        source_id=document.id,
                        target_id=existing["id"],
                        relationship_type=RelationshipType.SUPERSEDES,
                        pattern=RelationshipPattern.SUPERSESSION,
                        confidence=0.95,
                        evidence=f"Version supersession: {doc_version} > {existing_version}",
                    ))
        
        return detected

    def _extract_base_document_id(self, doc_id: str) -> str:
        """Extract base document ID without year/version suffix."""
        # Remove common year patterns
        base = re.sub(r"_\d{4}$", "", doc_id)
        base = re.sub(r"_v\d+(\.\d+)?$", "", base, flags=re.IGNORECASE)
        return base

    def _is_newer_version(self, version1: str, version2: str) -> bool:
        """Check if version1 is newer than version2."""
        if not version1 or not version2:
            return False
        
        try:
            # Try to parse as year.minor format
            v1_parts = [int(p) for p in version1.split(".")]
            v2_parts = [int(p) for p in version2.split(".")]
            return v1_parts > v2_parts
        except ValueError:
            # Fall back to string comparison
            return version1 > version2

    # ==================== Relationship Validation ====================

    def validate_relationship(self, relationship: GraphRelationship) -> tuple[bool, list[str]]:
        """Validate a relationship before creation.
        
        Args:
            relationship: Relationship to validate.
            
        Returns:
            Tuple of (is_valid, list of validation errors).
        """
        errors = []
        
        # Check source node exists
        source_exists = self._node_exists(relationship.source_node)
        if not source_exists:
            errors.append(f"Source node not found: {relationship.source_node}")
        
        # Check target node exists
        target_exists = self._node_exists(relationship.target_node)
        if not target_exists:
            errors.append(f"Target node not found: {relationship.target_node}")
        
        # Check for self-referential relationships (except for certain types)
        if relationship.source_node == relationship.target_node:
            if relationship.relationship_type not in [RelationshipType.PART_OF]:
                errors.append("Self-referential relationship not allowed")
        
        # Check relationship type validity
        if not self._is_valid_relationship_type(
            relationship.source_node,
            relationship.target_node,
            relationship.relationship_type,
        ):
            errors.append(
                f"Invalid relationship type {relationship.relationship_type.value} "
                f"between these node types"
            )
        
        return len(errors) == 0, errors

    def _node_exists(self, node_id: str) -> bool:
        """Check if a node exists in the graph."""
        query = """
        MATCH (n)
        WHERE n.id = $id OR n.number = $id OR n.cfr_section = $id
        RETURN count(n) as count
        """
        result = self.store.query(query, {"id": node_id})
        if result.raw_result and result.raw_result.result_set:
            return result.raw_result.result_set[0][0] > 0
        return False

    def _is_valid_relationship_type(
        self,
        source_id: str,
        target_id: str,
        rel_type: RelationshipType,
    ) -> bool:
        """Check if relationship type is valid for the node types."""
        # Get node types
        source_type = self._get_node_type(source_id)
        target_type = self._get_node_type(target_id)
        
        if not source_type or not target_type:
            return True  # Can't validate without node types
        
        # Define valid combinations
        valid_combinations = {
            RelationshipType.ISSUED_BY: [("Document", "Regulator")],
            RelationshipType.IMPLEMENTS: [("Document", "Requirement")],
            RelationshipType.REFERENCES: [("Document", "Document"), ("Document", "Section")],
            RelationshipType.DESCRIBED_IN: [("Form", "Document")],
            RelationshipType.PART_OF: [("Section", "Document")],
            RelationshipType.SUPERSEDES: [("Requirement", "Requirement"), ("Document", "Document")],
            RelationshipType.AMENDS: [("Document", "Document")],
            RelationshipType.RELATED_TO: [("Document", "Document")],
        }
        
        allowed = valid_combinations.get(rel_type, [])
        return (source_type, target_type) in allowed

    def _get_node_type(self, node_id: str) -> Optional[str]:
        """Get the type/label of a node."""
        query = """
        MATCH (n)
        WHERE n.id = $id OR n.number = $id OR n.cfr_section = $id
        RETURN labels(n) as labels
        """
        result = self.store.query(query, {"id": node_id})
        if result.raw_result and result.raw_result.result_set:
            labels = result.raw_result.result_set[0][0]
            return labels[0] if labels else None
        return None

    def check_integrity(self) -> IntegrityCheckResult:
        """Check referential integrity of all relationships.
        
        Returns:
            IntegrityCheckResult with any issues found.
        """
        result = IntegrityCheckResult(is_valid=True)
        
        # Find orphaned relationships (relationships to non-existent nodes)
        orphan_query = """
        MATCH (a)-[r]->(b)
        WHERE NOT exists(b.id) AND NOT exists(b.number) AND NOT exists(b.cfr_section)
        RETURN type(r) as rel_type, a.id as source
        """
        orphan_result = self.store.query(orphan_query)
        for node in orphan_result.nodes:
            result.orphaned_relationships.append(
                f"{node.get('source')} -> {node.get('rel_type')}"
            )
        
        # Find duplicate relationships
        duplicate_query = """
        MATCH (a)-[r1]->(b), (a)-[r2]->(b)
        WHERE id(r1) < id(r2) AND type(r1) = type(r2)
        RETURN a.id as source, b.id as target, type(r1) as rel_type
        """
        dup_result = self.store.query(duplicate_query)
        for node in dup_result.nodes:
            result.duplicate_relationships.append(
                f"{node.get('source')} -[{node.get('rel_type')}]-> {node.get('target')}"
            )
        
        result.is_valid = (
            len(result.orphaned_relationships) == 0
            and len(result.missing_targets) == 0
            and len(result.duplicate_relationships) == 0
        )
        
        return result

    # ==================== Version History Tracking ====================

    def track_version(
        self,
        document: Document,
        previous_version_id: Optional[str] = None,
        changes: Optional[list[str]] = None,
    ) -> VersionHistoryEntry:
        """Track a new version of a document.
        
        Args:
            document: Document with new version.
            previous_version_id: ID of the previous version.
            changes: List of changes in this version.
            
        Returns:
            VersionHistoryEntry for the new version.
        """
        content_hash = self._compute_content_hash(document)
        
        entry = VersionHistoryEntry(
            document_id=document.id,
            version=document.metadata.version or "1.0",
            timestamp=datetime.now(timezone.utc),
            content_hash=content_hash,
            changes=changes or [],
            previous_version_id=previous_version_id,
        )
        
        # Store version history in graph
        self._store_version_history(entry)
        
        # Create SUPERSEDES relationship if there's a previous version
        if previous_version_id:
            self.store.create_relationship(GraphRelationship(
                source_node=document.id,
                target_node=previous_version_id,
                relationship_type=RelationshipType.SUPERSEDES,
                properties={
                    "version_from": entry.version,
                    "changes": ",".join(entry.changes[:5]),  # Store first 5 changes
                },
                validated=True,
            ))
        
        return entry

    def _compute_content_hash(self, document: Document) -> str:
        """Compute hash of document content for change detection."""
        content = ""
        if document.content:
            content = document.content.text or ""
        
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def _store_version_history(self, entry: VersionHistoryEntry) -> None:
        """Store version history entry in the graph."""
        query = """
        MATCH (d:Document {id: $doc_id})
        SET d.version_history = coalesce(d.version_history, '') + $entry
        """
        
        entry_str = f"|{entry.version}:{entry.timestamp.isoformat()}:{entry.content_hash}"
        self.store.query(query, {"doc_id": entry.document_id, "entry": entry_str})

    def get_version_history(self, document_id: str) -> list[VersionHistoryEntry]:
        """Get version history for a document.
        
        Args:
            document_id: Document ID to get history for.
            
        Returns:
            List of version history entries, newest first.
        """
        query = """
        MATCH (d:Document {id: $id})
        RETURN d.version_history as history
        """
        result = self.store.query(query, {"id": document_id})
        
        entries = []
        if result.nodes and result.nodes[0].get("history"):
            history_str = result.nodes[0]["history"]
            for entry_str in history_str.split("|"):
                if not entry_str:
                    continue
                parts = entry_str.split(":")
                if len(parts) >= 3:
                    entries.append(VersionHistoryEntry(
                        document_id=document_id,
                        version=parts[0],
                        timestamp=datetime.fromisoformat(parts[1]),
                        content_hash=parts[2],
                    ))
        
        return sorted(entries, key=lambda e: e.timestamp, reverse=True)

    # ==================== Graph Traversal Utilities ====================

    def find_path(
        self,
        source_id: str,
        target_id: str,
        max_depth: int = 5,
    ) -> list[dict[str, Any]]:
        """Find shortest path between two nodes.
        
        Args:
            source_id: Source node ID.
            target_id: Target node ID.
            max_depth: Maximum path length to search.
            
        Returns:
            List of nodes in the path, or empty list if no path found.
        """
        query = f"""
        MATCH path = shortestPath(
            (source {{id: $source_id}})-[*1..{max_depth}]-(target {{id: $target_id}})
        )
        RETURN nodes(path) as path_nodes
        """
        
        result = self.store.query(query, {
            "source_id": source_id,
            "target_id": target_id,
        })
        
        if result.raw_result and result.raw_result.result_set:
            path_nodes = result.raw_result.result_set[0][0]
            return [dict(node.properties) for node in path_nodes]
        
        return []

    def get_document_graph(
        self,
        document_id: str,
        depth: int = 2,
    ) -> dict[str, Any]:
        """Get the subgraph around a document.
        
        Args:
            document_id: Center document ID.
            depth: How many hops to include.
            
        Returns:
            Dictionary with nodes and relationships.
        """
        query = f"""
        MATCH (d:Document {{id: $id}})
        OPTIONAL MATCH path = (d)-[*1..{depth}]-(related)
        RETURN d, collect(distinct related) as related_nodes,
               collect(distinct relationships(path)) as rels
        """
        
        result = self.store.query(query, {"id": document_id})
        
        nodes = []
        relationships = []
        
        if result.raw_result and result.raw_result.result_set:
            row = result.raw_result.result_set[0]
            if row[0]:
                nodes.append(dict(row[0].properties))
            if row[1]:
                for node in row[1]:
                    if node and hasattr(node, "properties"):
                        nodes.append(dict(node.properties))
        
        return {
            "center": document_id,
            "nodes": nodes,
            "relationships": relationships,
        }

    def find_regulatory_chain(
        self,
        document_id: str,
    ) -> list[dict[str, Any]]:
        """Find the regulatory chain for a document.
        
        Traces from document through IMPLEMENTS relationships to requirements,
        and through ISSUED_BY to regulators.
        
        Args:
            document_id: Document to trace.
            
        Returns:
            List of nodes in the regulatory chain.
        """
        query = """
        MATCH (d:Document {id: $id})
        OPTIONAL MATCH (d)-[:ISSUED_BY]->(reg:Regulator)
        OPTIONAL MATCH (d)-[:IMPLEMENTS]->(req:Requirement)
        OPTIONAL MATCH (d)-[:REFERENCES]->(ref:Document)
        RETURN d, reg, collect(distinct req) as requirements,
               collect(distinct ref) as references
        """
        
        result = self.store.query(query, {"id": document_id})
        
        chain = []
        if result.raw_result and result.raw_result.result_set:
            row = result.raw_result.result_set[0]
            
            # Add document
            if row[0]:
                chain.append({
                    "type": "Document",
                    "data": dict(row[0].properties),
                })
            
            # Add regulator
            if row[1]:
                chain.append({
                    "type": "Regulator",
                    "data": dict(row[1].properties),
                })
            
            # Add requirements
            for req in row[2] or []:
                if req and hasattr(req, "properties"):
                    chain.append({
                        "type": "Requirement",
                        "data": dict(req.properties),
                    })
            
            # Add references
            for ref in row[3] or []:
                if ref and hasattr(ref, "properties"):
                    chain.append({
                        "type": "Reference",
                        "data": dict(ref.properties),
                    })
        
        return chain

    def get_documents_implementing_requirement(
        self,
        requirement_id: str,
    ) -> list[dict[str, Any]]:
        """Get all documents that implement a requirement.
        
        Args:
            requirement_id: Requirement ID to search for.
            
        Returns:
            List of document properties.
        """
        query = """
        MATCH (d:Document)-[:IMPLEMENTS]->(req:Requirement {id: $req_id})
        RETURN d
        """
        
        result = self.store.query(query, {"req_id": requirement_id})
        return result.nodes

    def get_related_by_category(
        self,
        document_id: str,
        min_overlap: int = 1,
    ) -> list[dict[str, Any]]:
        """Get documents related by category overlap.
        
        Args:
            document_id: Source document ID.
            min_overlap: Minimum number of overlapping categories.
            
        Returns:
            List of related document properties with overlap count.
        """
        query = """
        MATCH (d1:Document {id: $id}), (d2:Document)
        WHERE d1 <> d2
        WITH d1, d2,
             [cat IN split(d1.categories, ',') WHERE cat IN split(d2.categories, ',')] as overlap
        WHERE size(overlap) >= $min_overlap
        RETURN d2, size(overlap) as overlap_count
        ORDER BY overlap_count DESC
        """
        
        result = self.store.query(query, {"id": document_id, "min_overlap": min_overlap})
        return result.nodes
