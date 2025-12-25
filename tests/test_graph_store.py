"""Tests for FalkorDB graph store implementation."""

import pytest
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

from regulatory_kb.storage.graph_store import (
    FalkorDBStore,
    GraphStoreConfig,
    QueryResult,
)
from regulatory_kb.storage.schema import NodeType, GraphSchema
from regulatory_kb.models.document import (
    Document,
    DocumentType,
    DocumentCategory,
    DocumentMetadata,
)
from regulatory_kb.models.regulator import Regulator, Country, RegulatorType
from regulatory_kb.models.requirement import (
    RegulatoryRequirement,
    Deadline,
    FilingFrequency,
)
from regulatory_kb.models.relationship import GraphRelationship, RelationshipType


class TestGraphStoreConfig:
    """Tests for GraphStoreConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = GraphStoreConfig()
        assert config.host == "localhost"
        assert config.port == 6379
        assert config.password is None
        assert config.graph_name == "regulatory_kb"
        assert config.ssl is False
        assert config.socket_timeout == 30.0

    def test_custom_config(self):
        """Test custom configuration values."""
        config = GraphStoreConfig(
            host="redis.example.com",
            port=6380,
            password="secret",
            graph_name="test_graph",
            ssl=True,
            socket_timeout=60.0,
        )
        assert config.host == "redis.example.com"
        assert config.port == 6380
        assert config.password == "secret"
        assert config.graph_name == "test_graph"
        assert config.ssl is True
        assert config.socket_timeout == 60.0


class TestGraphSchema:
    """Tests for GraphSchema definitions."""

    def test_node_types_defined(self):
        """Test that all node types have property definitions."""
        for node_type in NodeType:
            assert node_type in GraphSchema.NODE_PROPERTIES
            assert len(GraphSchema.NODE_PROPERTIES[node_type]) > 0

    def test_index_definitions_exist(self):
        """Test that index definitions exist for key node types."""
        assert NodeType.DOCUMENT in GraphSchema.INDEX_DEFINITIONS
        assert NodeType.REGULATOR in GraphSchema.INDEX_DEFINITIONS
        assert "id" in GraphSchema.INDEX_DEFINITIONS[NodeType.DOCUMENT]

    def test_create_index_queries(self):
        """Test index query generation."""
        queries = GraphSchema.get_create_index_queries("test_graph")
        assert len(queries) > 0
        assert all("CREATE INDEX" in q for q in queries)
        assert any("Document" in q for q in queries)
        assert any("Regulator" in q for q in queries)

    def test_validate_node_properties_valid(self):
        """Test validation with valid properties."""
        is_valid, missing = GraphSchema.validate_node_properties(
            NodeType.DOCUMENT, {"id": "doc_1", "title": "Test"}
        )
        assert is_valid is True
        assert len(missing) == 0

    def test_validate_node_properties_missing_id(self):
        """Test validation with missing required property."""
        is_valid, missing = GraphSchema.validate_node_properties(
            NodeType.DOCUMENT, {"title": "Test"}
        )
        assert is_valid is False
        assert "id" in missing

    def test_validate_section_properties(self):
        """Test validation for Section node type."""
        is_valid, missing = GraphSchema.validate_node_properties(
            NodeType.SECTION, {"cfr_section": "12 CFR 249"}
        )
        assert is_valid is True


class TestFalkorDBStoreConnection:
    """Tests for FalkorDB connection management."""

    def test_store_initialization(self):
        """Test store initializes with config."""
        config = GraphStoreConfig(host="test-host", port=6380)
        store = FalkorDBStore(config)
        assert store.config.host == "test-host"
        assert store.config.port == 6380
        assert store.is_connected is False

    def test_store_default_config(self):
        """Test store uses default config when none provided."""
        store = FalkorDBStore()
        assert store.config.host == "localhost"
        assert store.config.port == 6379

    @patch("regulatory_kb.storage.graph_store.FalkorDB")
    def test_connect(self, mock_falkordb):
        """Test connection establishment."""
        mock_client = MagicMock()
        mock_graph = MagicMock()
        mock_falkordb.return_value = mock_client
        mock_client.select_graph.return_value = mock_graph

        store = FalkorDBStore()
        store.connect()

        mock_falkordb.assert_called_once_with(
            host="localhost",
            port=6379,
            password=None,
        )
        mock_client.select_graph.assert_called_once_with("regulatory_kb")
        assert store.is_connected is True

    @patch("regulatory_kb.storage.graph_store.FalkorDB")
    def test_disconnect(self, mock_falkordb):
        """Test disconnection."""
        mock_client = MagicMock()
        mock_graph = MagicMock()
        mock_falkordb.return_value = mock_client
        mock_client.select_graph.return_value = mock_graph

        store = FalkorDBStore()
        store.connect()
        assert store.is_connected is True

        store.disconnect()
        assert store.is_connected is False

    def test_ensure_connected_raises_when_not_connected(self):
        """Test that operations fail when not connected."""
        store = FalkorDBStore()
        with pytest.raises(ConnectionError, match="Not connected"):
            store._ensure_connected()


class TestFalkorDBStoreNodeCreation:
    """Tests for node creation operations."""

    @pytest.fixture
    def connected_store(self):
        """Create a connected store with mocked FalkorDB."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_create_document_node(self, connected_store):
        """Test document node creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["doc_1"]])

        document = Document(
            id="us_frb_fry14a_2024",
            title="FR Y-14A Instructions",
            document_type=DocumentType.INSTRUCTION_MANUAL,
            regulator_id="us_frb",
            source_url="https://federalreserve.gov/fry14a",
            categories=[DocumentCategory.CAPITAL_REQUIREMENTS],
            metadata=DocumentMetadata(
                form_number="FR Y-14A",
                effective_date=date(2024, 1, 1),
                version="2024.1",
            ),
        )

        result = store.create_document_node(document)

        assert result == "us_frb_fry14a_2024"
        mock_graph.query.assert_called_once()
        call_args = mock_graph.query.call_args
        assert "MERGE (d:Document" in call_args[0][0]

    def test_create_regulator_node(self, connected_store):
        """Test regulator node creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["us_frb"]])

        regulator = Regulator(
            id="us_frb",
            name="Federal Reserve Board",
            abbreviation="FRB",
            country=Country.US,
            regulator_type=RegulatorType.PRUDENTIAL,
            website="https://www.federalreserve.gov",
        )

        result = store.create_regulator_node(regulator)

        assert result == "us_frb"
        mock_graph.query.assert_called_once()

    def test_create_requirement_node(self, connected_store):
        """Test requirement node creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["ccar_2024"]])

        requirement = RegulatoryRequirement(
            id="ccar_2024",
            description="Annual CCAR capital plan submission",
            regulator_id="us_frb",
            deadline=Deadline(
                frequency=FilingFrequency.ANNUAL,
                due_date="April 5",
            ),
            effective_date=date(2024, 1, 1),
        )

        result = store.create_requirement_node(requirement)

        assert result == "ccar_2024"
        mock_graph.query.assert_called_once()

    def test_create_form_node(self, connected_store):
        """Test form node creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["FR Y-14A"]])

        result = store.create_form_node(
            number="FR Y-14A",
            name="Capital Assessments and Stress Testing",
            form_type="reporting_form",
            regulator_id="us_frb",
        )

        assert result == "FR Y-14A"
        mock_graph.query.assert_called_once()

    def test_create_section_node(self, connected_store):
        """Test section node creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["12 CFR 249"]])

        result = store.create_section_node(
            cfr_section="12 CFR 249",
            title="Liquidity Coverage Ratio",
            document_id="us_frb_lcr_2024",
            content_hash="abc123",
        )

        assert result == "12 CFR 249"
        mock_graph.query.assert_called_once()


class TestFalkorDBStoreRelationships:
    """Tests for relationship creation operations."""

    @pytest.fixture
    def connected_store(self):
        """Create a connected store with mocked FalkorDB."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_create_issued_by_relationship(self, connected_store):
        """Test ISSUED_BY relationship creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["ISSUED_BY"]])

        result = store.create_issued_by_relationship(
            document_id="us_frb_fry14a_2024",
            regulator_id="us_frb",
        )

        assert result is True
        call_args = mock_graph.query.call_args
        assert "ISSUED_BY" in call_args[0][0]

    def test_create_implements_relationship(self, connected_store):
        """Test IMPLEMENTS relationship creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["IMPLEMENTS"]])

        result = store.create_implements_relationship(
            document_id="us_frb_fry14a_2024",
            requirement_id="ccar_2024",
            section="252.44",
            strength=0.95,
        )

        assert result is True

    def test_create_references_relationship(self, connected_store):
        """Test REFERENCES relationship creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["REFERENCES"]])

        result = store.create_references_relationship(
            source_document_id="us_frb_fry14a_2024",
            target_document_id="12_cfr_252",
            context="Capital planning requirements",
        )

        assert result is True

    def test_create_generic_relationship(self, connected_store):
        """Test generic relationship creation."""
        store, mock_graph = connected_store
        mock_graph.query.return_value = MagicMock(result_set=[["SUPERSEDES"]])

        relationship = GraphRelationship(
            source_node="ccar_2024",
            target_node="ccar_2023",
            relationship_type=RelationshipType.SUPERSEDES,
            strength=1.0,
            validated=True,
        )

        result = store.create_relationship(relationship)
        assert result is True

    def test_get_node_labels_for_relationship(self, connected_store):
        """Test node label mapping for relationships."""
        store, _ = connected_store

        assert store._get_node_labels_for_relationship(
            RelationshipType.ISSUED_BY
        ) == ("Document", "Regulator")
        
        assert store._get_node_labels_for_relationship(
            RelationshipType.IMPLEMENTS
        ) == ("Document", "Requirement")
        
        assert store._get_node_labels_for_relationship(
            RelationshipType.REFERENCES
        ) == ("Document", "Document")


class TestFalkorDBStoreQueries:
    """Tests for query operations."""

    @pytest.fixture
    def connected_store(self):
        """Create a connected store with mocked FalkorDB."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_query_returns_result(self, connected_store):
        """Test raw query execution."""
        store, mock_graph = connected_store
        mock_result = MagicMock()
        mock_result.result_set = []
        mock_graph.query.return_value = mock_result

        result = store.query("MATCH (n) RETURN n LIMIT 10")

        assert isinstance(result, QueryResult)
        mock_graph.query.assert_called_once()

    def test_get_document_by_id(self, connected_store):
        """Test document retrieval by ID."""
        store, mock_graph = connected_store
        
        mock_node = MagicMock()
        mock_node.properties = {"id": "doc_1", "title": "Test Doc"}
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_graph.query.return_value = mock_result

        result = store.get_document_by_id("doc_1")

        assert result is not None
        assert result["id"] == "doc_1"

    def test_get_document_by_id_not_found(self, connected_store):
        """Test document retrieval when not found."""
        store, mock_graph = connected_store
        mock_result = MagicMock()
        mock_result.result_set = []
        mock_graph.query.return_value = mock_result

        result = store.get_document_by_id("nonexistent")

        assert result is None

    def test_get_documents_by_regulator(self, connected_store):
        """Test document retrieval by regulator."""
        store, mock_graph = connected_store
        
        mock_node = MagicMock()
        mock_node.properties = {"id": "doc_1", "regulator_id": "us_frb"}
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_graph.query.return_value = mock_result

        results = store.get_documents_by_regulator("us_frb")

        assert len(results) == 1
        assert results[0]["regulator_id"] == "us_frb"

    def test_search_documents(self, connected_store):
        """Test document search with filters."""
        store, mock_graph = connected_store
        
        mock_node = MagicMock()
        mock_node.properties = {"id": "doc_1", "title": "CCAR Instructions"}
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_graph.query.return_value = mock_result

        results = store.search_documents(
            search_term="CCAR",
            regulator_id="us_frb",
            category=DocumentCategory.CAPITAL_REQUIREMENTS,
        )

        assert len(results) == 1
        call_args = mock_graph.query.call_args
        query = call_args[0][0]
        assert "CONTAINS" in query
        assert "regulator_id" in query
        assert "categories" in query

    def test_delete_document(self, connected_store):
        """Test document deletion."""
        store, mock_graph = connected_store
        mock_result = MagicMock()
        mock_result.result_set = [[1]]
        mock_graph.query.return_value = mock_result

        result = store.delete_document("doc_1")

        assert result is True
        call_args = mock_graph.query.call_args
        assert "DETACH DELETE" in call_args[0][0]

    def test_clear_graph(self, connected_store):
        """Test clearing all graph data."""
        store, mock_graph = connected_store

        store.clear_graph()

        mock_graph.query.assert_called_once()
        call_args = mock_graph.query.call_args
        assert "DETACH DELETE" in call_args[0][0]
