"""Tests for chunk store."""

import pytest
from unittest.mock import Mock, MagicMock, patch

from regulatory_kb.storage.chunk_store import ChunkStore
from regulatory_kb.storage.graph_store import FalkorDBStore, QueryResult
from regulatory_kb.processing.chunker import DocumentChunk, ChunkType


class TestChunkStore:
    """Tests for ChunkStore class."""

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mock graph store."""
        store = Mock(spec=FalkorDBStore)
        store._graph = Mock()
        store._graph.query = Mock(return_value=Mock(result_set=[["test"]]))
        store.query = Mock(return_value=QueryResult(nodes=[], relationships=[]))
        return store

    @pytest.fixture
    def chunk_store(self, mock_graph_store):
        """Create a chunk store with mock graph store."""
        return ChunkStore(mock_graph_store)

    @pytest.fixture
    def sample_chunk(self):
        """Create a sample chunk for testing."""
        return DocumentChunk(
            chunk_id="doc_001_chunk_0",
            document_id="doc_001",
            content="This is test content for the chunk.",
            chunk_index=0,
            total_chunks=3,
            section_path=["Section 1", "Subsection 1.1"],
            page_range=(1, 5),
            token_count=100,
            chunk_type=ChunkType.SECTION,
            previous_chunk=None,
            next_chunk="doc_001_chunk_1",
            section_title="Section 1",
        )

    @pytest.fixture
    def sample_chunks(self):
        """Create sample chunks for testing."""
        return [
            DocumentChunk(
                chunk_id="doc_001_chunk_0",
                document_id="doc_001",
                content="First chunk content.",
                chunk_index=0,
                total_chunks=3,
                section_path=["Section 1"],
                token_count=50,
                chunk_type=ChunkType.SECTION,
                previous_chunk=None,
                next_chunk="doc_001_chunk_1",
                section_title="Section 1",
            ),
            DocumentChunk(
                chunk_id="doc_001_chunk_1",
                document_id="doc_001",
                content="Second chunk content.",
                chunk_index=1,
                total_chunks=3,
                section_path=["Section 2"],
                token_count=50,
                chunk_type=ChunkType.SECTION,
                previous_chunk="doc_001_chunk_0",
                next_chunk="doc_001_chunk_2",
                section_title="Section 2",
            ),
            DocumentChunk(
                chunk_id="doc_001_chunk_2",
                document_id="doc_001",
                content="Third chunk content.",
                chunk_index=2,
                total_chunks=3,
                section_path=["Section 3"],
                token_count=50,
                chunk_type=ChunkType.SECTION,
                previous_chunk="doc_001_chunk_1",
                next_chunk=None,
                section_title="Section 3",
            ),
        ]

    def test_compute_content_hash(self, chunk_store):
        """Test content hash computation."""
        content = "Test content"
        hash1 = chunk_store._compute_content_hash(content)
        hash2 = chunk_store._compute_content_hash(content)
        
        # Same content should produce same hash
        assert hash1 == hash2
        assert len(hash1) == 16  # Truncated to 16 chars
        
        # Different content should produce different hash
        hash3 = chunk_store._compute_content_hash("Different content")
        assert hash1 != hash3

    def test_store_chunk(self, chunk_store, sample_chunk, mock_graph_store):
        """Test storing a single chunk."""
        result = chunk_store.store_chunk(sample_chunk)
        
        assert result == sample_chunk.chunk_id
        mock_graph_store._graph.query.assert_called()

    def test_store_chunks(self, chunk_store, sample_chunks, mock_graph_store):
        """Test storing multiple chunks."""
        result = chunk_store.store_chunks(sample_chunks)
        
        assert len(result) == 3
        assert result[0] == "doc_001_chunk_0"
        assert result[1] == "doc_001_chunk_1"
        assert result[2] == "doc_001_chunk_2"

    def test_store_empty_chunks(self, chunk_store):
        """Test storing empty chunk list."""
        result = chunk_store.store_chunks([])
        assert result == []

    def test_get_chunk_by_id(self, chunk_store, mock_graph_store):
        """Test getting a chunk by ID."""
        mock_graph_store.query.return_value = QueryResult(
            nodes=[{"chunk_id": "doc_001_chunk_0", "content": "Test"}],
            relationships=[],
        )
        
        result = chunk_store.get_chunk_by_id("doc_001_chunk_0")
        
        assert result is not None
        assert result["chunk_id"] == "doc_001_chunk_0"

    def test_get_chunk_by_id_not_found(self, chunk_store, mock_graph_store):
        """Test getting a non-existent chunk."""
        mock_graph_store.query.return_value = QueryResult(nodes=[], relationships=[])
        
        result = chunk_store.get_chunk_by_id("nonexistent")
        
        assert result is None

    def test_get_chunks_by_document(self, chunk_store, mock_graph_store):
        """Test getting all chunks for a document."""
        mock_graph_store.query.return_value = QueryResult(
            nodes=[
                {"chunk_id": "doc_001_chunk_0", "chunk_index": 0},
                {"chunk_id": "doc_001_chunk_1", "chunk_index": 1},
            ],
            relationships=[],
        )
        
        result = chunk_store.get_chunks_by_document("doc_001")
        
        assert len(result) == 2

    def test_get_chunk_count(self, chunk_store, mock_graph_store):
        """Test getting chunk count for a document."""
        mock_graph_store._graph.query.return_value = Mock(result_set=[[5]])
        
        result = chunk_store.get_chunk_count("doc_001")
        
        assert result == 5

    def test_delete_chunks_by_document(self, chunk_store, mock_graph_store):
        """Test deleting chunks for a document."""
        mock_graph_store._graph.query.return_value = Mock(result_set=[[3]])
        
        result = chunk_store.delete_chunks_by_document("doc_001")
        
        assert result == 3

    def test_create_chunk_of_relationship(self, chunk_store, mock_graph_store):
        """Test creating CHUNK_OF relationship."""
        result = chunk_store._create_chunk_of_relationship(
            "doc_001_chunk_0",
            "doc_001",
        )
        
        assert result is True
        mock_graph_store._graph.query.assert_called()

    def test_create_next_chunk_relationship(self, chunk_store, mock_graph_store):
        """Test creating NEXT_CHUNK relationship."""
        result = chunk_store._create_next_chunk_relationship(
            "doc_001_chunk_0",
            "doc_001_chunk_1",
        )
        
        assert result is True

    def test_create_previous_chunk_relationship(self, chunk_store, mock_graph_store):
        """Test creating PREVIOUS_CHUNK relationship."""
        result = chunk_store._create_previous_chunk_relationship(
            "doc_001_chunk_1",
            "doc_001_chunk_0",
        )
        
        assert result is True


class TestChunkStoreIntegration:
    """Integration-style tests for ChunkStore (with mocked graph)."""

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mock graph store with more realistic behavior."""
        store = Mock(spec=FalkorDBStore)
        store._graph = Mock()
        
        # Track stored chunks
        stored_chunks = {}
        
        def mock_query(query, params=None):
            result = Mock()
            if "MERGE (c:Chunk" in query:
                # Store chunk
                if params:
                    stored_chunks[params.get("chunk_id")] = params
                result.result_set = [[params.get("chunk_id") if params else None]]
            elif "MATCH (c:Chunk {chunk_id:" in query:
                # Get chunk
                chunk_id = params.get("chunk_id") if params else None
                if chunk_id in stored_chunks:
                    result.result_set = [[Mock(properties=stored_chunks[chunk_id])]]
                else:
                    result.result_set = []
            elif "count(c)" in query:
                result.result_set = [[len(stored_chunks)]]
            else:
                result.result_set = [[True]]
            return result
        
        store._graph.query = mock_query
        store.query = Mock(return_value=QueryResult(nodes=[], relationships=[]))
        
        return store

    @pytest.fixture
    def chunk_store(self, mock_graph_store):
        return ChunkStore(mock_graph_store)

    def test_full_chunk_workflow(self, chunk_store):
        """Test complete workflow of storing and retrieving chunks."""
        # Create chunks
        chunks = [
            DocumentChunk(
                chunk_id="test_doc_chunk_0",
                document_id="test_doc",
                content="First chunk",
                chunk_index=0,
                total_chunks=2,
                token_count=10,
                chunk_type=ChunkType.SECTION,
                next_chunk="test_doc_chunk_1",
            ),
            DocumentChunk(
                chunk_id="test_doc_chunk_1",
                document_id="test_doc",
                content="Second chunk",
                chunk_index=1,
                total_chunks=2,
                token_count=10,
                chunk_type=ChunkType.SECTION,
                previous_chunk="test_doc_chunk_0",
            ),
        ]
        
        # Store chunks
        chunk_ids = chunk_store.store_chunks(chunks)
        
        assert len(chunk_ids) == 2
        assert chunk_ids[0] == "test_doc_chunk_0"
        assert chunk_ids[1] == "test_doc_chunk_1"
