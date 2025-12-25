"""Tests for graph relationship management."""

import pytest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

from regulatory_kb.storage.relationship_manager import (
    RelationshipManager,
    RelationshipPattern,
    DetectedRelationship,
    VersionHistoryEntry,
    IntegrityCheckResult,
)
from regulatory_kb.storage.graph_store import FalkorDBStore, QueryResult
from regulatory_kb.models.document import (
    Document,
    DocumentType,
    DocumentCategory,
    DocumentMetadata,
    DocumentContent,
)
from regulatory_kb.models.relationship import GraphRelationship, RelationshipType


@pytest.fixture
def mock_store():
    """Create a mock FalkorDB store."""
    store = MagicMock(spec=FalkorDBStore)
    store.query.return_value = QueryResult(nodes=[], relationships=[])
    return store


@pytest.fixture
def relationship_manager(mock_store):
    """Create a relationship manager with mock store."""
    return RelationshipManager(mock_store)


@pytest.fixture
def sample_document():
    """Create a sample document for testing."""
    return Document(
        id="us_frb_fry14a_2024",
        title="FR Y-14A Instructions 2024",
        document_type=DocumentType.INSTRUCTION_MANUAL,
        regulator_id="us_frb",
        source_url="https://federalreserve.gov/fry14a",
        categories=[DocumentCategory.CAPITAL_REQUIREMENTS, DocumentCategory.STRESS_TESTING],
        metadata=DocumentMetadata(
            form_number="FR Y-14A",
            effective_date=date(2024, 1, 1),
            version="2024.1",
        ),
        content=DocumentContent(
            text="This document references 12 CFR 252 and FR Y-9C requirements.",
            sections=[],
            tables=[],
        ),
    )


@pytest.fixture
def existing_documents():
    """Create sample existing documents."""
    return [
        {
            "id": "12_cfr_252",
            "title": "12 CFR Part 252",
            "regulator_id": "us_frb",
            "categories": "capital-requirements",
            "cfr_section": "12 CFR 252",
            "version": "2023.1",
        },
        {
            "id": "us_frb_fry9c_2024",
            "title": "FR Y-9C Instructions",
            "regulator_id": "us_frb",
            "categories": "capital-requirements,call-reports",
            "form_number": "FR Y-9C",
            "version": "2024.1",
        },
        {
            "id": "us_frb_fry14a_2023",
            "title": "FR Y-14A Instructions 2023",
            "regulator_id": "us_frb",
            "categories": "capital-requirements,stress-testing",
            "form_number": "FR Y-14A",
            "version": "2023.1",
        },
    ]


class TestRelationshipDetection:
    """Tests for automatic relationship detection."""

    def test_detect_cfr_references(self, relationship_manager, sample_document, existing_documents):
        """Test detection of CFR references in document content."""
        detected = relationship_manager.detect_relationships(
            sample_document, existing_documents
        )
        
        cfr_refs = [d for d in detected if d.pattern == RelationshipPattern.CFR_REFERENCE]
        assert len(cfr_refs) >= 1
        assert any(d.target_id == "12_cfr_252" for d in cfr_refs)

    def test_detect_form_references(self, relationship_manager, sample_document, existing_documents):
        """Test detection of form number references."""
        detected = relationship_manager.detect_relationships(
            sample_document, existing_documents
        )
        
        form_refs = [d for d in detected if d.pattern == RelationshipPattern.FORM_REFERENCE]
        assert len(form_refs) >= 1
        assert any(d.target_id == "us_frb_fry9c_2024" for d in form_refs)

    def test_detect_regulator_relationships(self, relationship_manager, sample_document, existing_documents):
        """Test detection of same-regulator relationships."""
        detected = relationship_manager.detect_relationships(
            sample_document, existing_documents
        )
        
        reg_rels = [d for d in detected if d.pattern == RelationshipPattern.REGULATOR_MATCH]
        # All existing docs are from same regulator
        assert len(reg_rels) == len(existing_documents)

    def test_detect_category_relationships(self, relationship_manager, sample_document, existing_documents):
        """Test detection of category-based relationships."""
        detected = relationship_manager.detect_relationships(
            sample_document, existing_documents
        )
        
        cat_rels = [d for d in detected if d.pattern == RelationshipPattern.CATEGORY_OVERLAP]
        assert len(cat_rels) >= 1
        # Should find overlap with capital-requirements documents
        assert any(d.confidence > 0 for d in cat_rels)

    def test_detect_supersession(self, relationship_manager, sample_document, existing_documents):
        """Test detection of version supersession."""
        detected = relationship_manager.detect_relationships(
            sample_document, existing_documents
        )
        
        supersedes = [d for d in detected if d.pattern == RelationshipPattern.SUPERSESSION]
        assert len(supersedes) >= 1
        assert any(d.target_id == "us_frb_fry14a_2023" for d in supersedes)

    def test_no_detection_without_content(self, relationship_manager, existing_documents):
        """Test that CFR/form detection requires content."""
        doc = Document(
            id="test_doc",
            title="Test Document",
            document_type=DocumentType.GUIDANCE,
            regulator_id="us_frb",
            source_url="https://example.com",
            content=None,
        )
        
        detected = relationship_manager.detect_relationships(doc, existing_documents)
        
        cfr_refs = [d for d in detected if d.pattern == RelationshipPattern.CFR_REFERENCE]
        form_refs = [d for d in detected if d.pattern == RelationshipPattern.FORM_REFERENCE]
        assert len(cfr_refs) == 0
        assert len(form_refs) == 0


class TestRelationshipValidation:
    """Tests for relationship validation."""

    def test_validate_valid_relationship(self, relationship_manager, mock_store):
        """Test validation of a valid relationship."""
        # Mock node existence checks - need to handle multiple query calls
        def mock_query(query, params=None):
            mock_result = MagicMock()
            if "count(n)" in query:
                # Node existence check
                mock_result.result_set = [[1]]
            elif "labels(n)" in query:
                # Node type check
                mock_result.result_set = [[["Document"]]]
            else:
                mock_result.result_set = []
            return QueryResult(nodes=[], relationships=[], raw_result=mock_result)
        
        mock_store.query.side_effect = mock_query
        
        relationship = GraphRelationship(
            source_node="doc_1",
            target_node="doc_2",
            relationship_type=RelationshipType.REFERENCES,
        )
        
        is_valid, errors = relationship_manager.validate_relationship(relationship)
        
        assert is_valid is True
        assert len(errors) == 0

    def test_validate_missing_source_node(self, relationship_manager, mock_store):
        """Test validation fails for missing source node."""
        mock_result = MagicMock()
        mock_result.result_set = [[0]]  # Node doesn't exist
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        relationship = GraphRelationship(
            source_node="nonexistent",
            target_node="doc_2",
            relationship_type=RelationshipType.REFERENCES,
        )
        
        is_valid, errors = relationship_manager.validate_relationship(relationship)
        
        assert is_valid is False
        assert any("Source node not found" in e for e in errors)

    def test_validate_self_referential_rejected(self, relationship_manager, mock_store):
        """Test that self-referential relationships are rejected."""
        def mock_query(query, params=None):
            mock_result = MagicMock()
            if "count(n)" in query:
                mock_result.result_set = [[1]]
            elif "labels(n)" in query:
                mock_result.result_set = [[["Document"]]]
            else:
                mock_result.result_set = []
            return QueryResult(nodes=[], relationships=[], raw_result=mock_result)
        
        mock_store.query.side_effect = mock_query
        
        relationship = GraphRelationship(
            source_node="doc_1",
            target_node="doc_1",
            relationship_type=RelationshipType.REFERENCES,
        )
        
        is_valid, errors = relationship_manager.validate_relationship(relationship)
        
        assert is_valid is False
        assert any("Self-referential" in e for e in errors)


class TestIntegrityCheck:
    """Tests for integrity checking."""

    def test_integrity_check_valid(self, relationship_manager, mock_store):
        """Test integrity check with valid graph."""
        mock_result = MagicMock()
        mock_result.result_set = []
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        result = relationship_manager.check_integrity()
        
        assert isinstance(result, IntegrityCheckResult)
        assert result.is_valid is True
        assert len(result.orphaned_relationships) == 0
        assert len(result.duplicate_relationships) == 0


class TestVersionHistory:
    """Tests for version history tracking."""

    def test_track_version(self, relationship_manager, mock_store, sample_document):
        """Test version tracking creates history entry."""
        mock_store.query.return_value = QueryResult(nodes=[], relationships=[])
        
        entry = relationship_manager.track_version(
            sample_document,
            previous_version_id="us_frb_fry14a_2023",
            changes=["Updated capital requirements", "New stress scenarios"],
        )
        
        assert isinstance(entry, VersionHistoryEntry)
        assert entry.document_id == sample_document.id
        assert entry.version == "2024.1"
        assert len(entry.changes) == 2
        assert entry.previous_version_id == "us_frb_fry14a_2023"

    def test_track_version_creates_supersedes_relationship(
        self, relationship_manager, mock_store, sample_document
    ):
        """Test that tracking version creates SUPERSEDES relationship."""
        mock_store.query.return_value = QueryResult(nodes=[], relationships=[])
        mock_store.create_relationship.return_value = True
        
        relationship_manager.track_version(
            sample_document,
            previous_version_id="us_frb_fry14a_2023",
        )
        
        mock_store.create_relationship.assert_called_once()
        call_args = mock_store.create_relationship.call_args[0][0]
        assert call_args.relationship_type == RelationshipType.SUPERSEDES

    def test_compute_content_hash(self, relationship_manager, sample_document):
        """Test content hash computation."""
        hash1 = relationship_manager._compute_content_hash(sample_document)
        
        # Same content should produce same hash
        hash2 = relationship_manager._compute_content_hash(sample_document)
        assert hash1 == hash2
        
        # Different content should produce different hash
        sample_document.content.text = "Different content"
        hash3 = relationship_manager._compute_content_hash(sample_document)
        assert hash1 != hash3


class TestGraphTraversal:
    """Tests for graph traversal utilities."""

    def test_find_path(self, relationship_manager, mock_store):
        """Test path finding between nodes."""
        mock_node1 = MagicMock()
        mock_node1.properties = {"id": "doc_1"}
        mock_node2 = MagicMock()
        mock_node2.properties = {"id": "doc_2"}
        
        mock_result = MagicMock()
        mock_result.result_set = [[[mock_node1, mock_node2]]]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        path = relationship_manager.find_path("doc_1", "doc_2")
        
        assert len(path) == 2
        assert path[0]["id"] == "doc_1"
        assert path[1]["id"] == "doc_2"

    def test_find_path_no_path(self, relationship_manager, mock_store):
        """Test path finding when no path exists."""
        mock_result = MagicMock()
        mock_result.result_set = []
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        path = relationship_manager.find_path("doc_1", "doc_2")
        
        assert len(path) == 0

    def test_get_document_graph(self, relationship_manager, mock_store):
        """Test getting subgraph around a document."""
        mock_doc = MagicMock()
        mock_doc.properties = {"id": "doc_1", "title": "Test Doc"}
        mock_related = MagicMock()
        mock_related.properties = {"id": "doc_2", "title": "Related Doc"}
        
        mock_result = MagicMock()
        mock_result.result_set = [[mock_doc, [mock_related], []]]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        graph = relationship_manager.get_document_graph("doc_1")
        
        assert graph["center"] == "doc_1"
        assert len(graph["nodes"]) == 2

    def test_find_regulatory_chain(self, relationship_manager, mock_store):
        """Test finding regulatory chain for a document."""
        mock_doc = MagicMock()
        mock_doc.properties = {"id": "doc_1"}
        mock_reg = MagicMock()
        mock_reg.properties = {"id": "us_frb", "name": "Federal Reserve"}
        mock_req = MagicMock()
        mock_req.properties = {"id": "ccar_2024"}
        
        mock_result = MagicMock()
        mock_result.result_set = [[mock_doc, mock_reg, [mock_req], []]]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        chain = relationship_manager.find_regulatory_chain("doc_1")
        
        assert len(chain) == 3
        assert chain[0]["type"] == "Document"
        assert chain[1]["type"] == "Regulator"
        assert chain[2]["type"] == "Requirement"

    def test_get_documents_implementing_requirement(self, relationship_manager, mock_store):
        """Test getting documents that implement a requirement."""
        mock_store.query.return_value = QueryResult(
            nodes=[{"id": "doc_1"}, {"id": "doc_2"}],
            relationships=[],
        )
        
        docs = relationship_manager.get_documents_implementing_requirement("ccar_2024")
        
        assert len(docs) == 2


class TestHelperMethods:
    """Tests for helper methods."""

    def test_extract_base_document_id(self, relationship_manager):
        """Test base document ID extraction."""
        assert relationship_manager._extract_base_document_id(
            "us_frb_fry14a_2024"
        ) == "us_frb_fry14a"
        
        assert relationship_manager._extract_base_document_id(
            "doc_v2.1"
        ) == "doc"
        
        assert relationship_manager._extract_base_document_id(
            "simple_doc"
        ) == "simple_doc"

    def test_is_newer_version(self, relationship_manager):
        """Test version comparison."""
        assert relationship_manager._is_newer_version("2024.1", "2023.1") is True
        assert relationship_manager._is_newer_version("2023.1", "2024.1") is False
        assert relationship_manager._is_newer_version("2024.2", "2024.1") is True
        assert relationship_manager._is_newer_version("", "2024.1") is False
        assert relationship_manager._is_newer_version("2024.1", "") is False
