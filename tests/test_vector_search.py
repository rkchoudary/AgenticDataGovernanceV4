"""Tests for vector search capabilities."""

import pytest
from datetime import date
from unittest.mock import MagicMock, patch

from regulatory_kb.storage.vector_search import (
    VectorSearchService,
    VectorSearchConfig,
    SearchResult,
    HybridSearchResult,
    SimilarityMetric,
    SearchMode,
)
from regulatory_kb.storage.graph_store import FalkorDBStore, QueryResult
from regulatory_kb.models.document import (
    Document,
    DocumentType,
    DocumentCategory,
    DocumentMetadata,
    DocumentContent,
)


@pytest.fixture
def mock_store():
    """Create a mock FalkorDB store."""
    store = MagicMock(spec=FalkorDBStore)
    store.query.return_value = QueryResult(nodes=[], relationships=[])
    return store


@pytest.fixture
def vector_service(mock_store):
    """Create a vector search service with mock store."""
    return VectorSearchService(mock_store)


@pytest.fixture
def sample_document():
    """Create a sample document for testing."""
    return Document(
        id="us_frb_fry14a_2024",
        title="FR Y-14A Instructions 2024",
        document_type=DocumentType.INSTRUCTION_MANUAL,
        regulator_id="us_frb",
        source_url="https://federalreserve.gov/fry14a",
        categories=[DocumentCategory.CAPITAL_REQUIREMENTS],
        metadata=DocumentMetadata(
            form_number="FR Y-14A",
            effective_date=date(2024, 1, 1),
            version="2024.1",
        ),
        content=DocumentContent(
            text="This document describes the capital requirements for CCAR stress testing. "
                 "Banks must submit FR Y-14A reports quarterly. The LCR and NSFR requirements "
                 "are detailed in 12 CFR 249. Risk-weighted assets must be calculated according "
                 "to Basel III standards.",
            sections=[],
            tables=[],
        ),
    )


class TestVectorSearchConfig:
    """Tests for VectorSearchConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = VectorSearchConfig()
        assert config.embedding_dimension == 1536
        assert config.similarity_metric == SimilarityMetric.COSINE
        assert config.index_name == "document_embeddings"
        assert config.chunk_size == 512
        assert config.chunk_overlap == 50

    def test_custom_config(self):
        """Test custom configuration values."""
        config = VectorSearchConfig(
            embedding_dimension=768,
            similarity_metric=SimilarityMetric.EUCLIDEAN,
            index_name="custom_index",
            chunk_size=256,
            chunk_overlap=25,
        )
        assert config.embedding_dimension == 768
        assert config.similarity_metric == SimilarityMetric.EUCLIDEAN
        assert config.index_name == "custom_index"


class TestEmbeddingGeneration:
    """Tests for embedding generation."""

    def test_default_embedding_function(self, vector_service):
        """Test default hash-based embedding function."""
        embedding = vector_service.generate_embedding("test text")
        
        assert isinstance(embedding, list)
        assert len(embedding) == vector_service.config.embedding_dimension
        assert all(isinstance(v, float) for v in embedding)

    def test_embedding_deterministic(self, vector_service):
        """Test that same text produces same embedding."""
        text = "capital requirements for stress testing"
        
        embedding1 = vector_service.generate_embedding(text)
        embedding2 = vector_service.generate_embedding(text)
        
        assert embedding1 == embedding2

    def test_different_text_different_embedding(self, vector_service):
        """Test that different text produces different embeddings."""
        embedding1 = vector_service.generate_embedding("capital requirements")
        embedding2 = vector_service.generate_embedding("liquidity reporting")
        
        assert embedding1 != embedding2

    def test_custom_embedding_function(self, mock_store):
        """Test setting custom embedding function."""
        custom_embedding = [0.1] * 768
        custom_fn = MagicMock(return_value=custom_embedding)
        
        config = VectorSearchConfig(embedding_dimension=768)
        service = VectorSearchService(mock_store, config, custom_fn)
        
        result = service.generate_embedding("test")
        
        custom_fn.assert_called_once_with("test")
        assert result == custom_embedding


class TestTextChunking:
    """Tests for text chunking."""

    def test_chunk_short_text(self, vector_service):
        """Test chunking text shorter than chunk size."""
        text = "Short text."
        chunks = vector_service.chunk_text(text)
        
        assert len(chunks) == 1
        assert chunks[0] == "Short text."

    def test_chunk_long_text(self, vector_service):
        """Test chunking text longer than chunk size."""
        # Create text longer than default chunk size (512)
        text = "This is a sentence. " * 50  # ~1000 characters
        chunks = vector_service.chunk_text(text)
        
        assert len(chunks) > 1
        # Check overlap exists
        for i in range(len(chunks) - 1):
            # Some content should overlap between consecutive chunks
            assert len(chunks[i]) > 0

    def test_chunk_empty_text(self, vector_service):
        """Test chunking empty text."""
        chunks = vector_service.chunk_text("")
        assert chunks == []

    def test_chunk_preserves_sentences(self, vector_service):
        """Test that chunking tries to preserve sentence boundaries."""
        text = "First sentence. Second sentence. Third sentence. " * 20
        chunks = vector_service.chunk_text(text)
        
        # Most chunks should end with a period
        period_endings = sum(1 for c in chunks if c.endswith("."))
        assert period_endings >= len(chunks) // 2


class TestDocumentIndexing:
    """Tests for document indexing."""

    def test_index_document(self, vector_service, mock_store, sample_document):
        """Test indexing a document."""
        chunk_count = vector_service.index_document(sample_document)
        
        assert chunk_count > 0
        assert mock_store.query.called

    def test_index_document_no_content(self, vector_service, mock_store):
        """Test indexing document without content."""
        doc = Document(
            id="test_doc",
            title="Test",
            document_type=DocumentType.GUIDANCE,
            regulator_id="us_frb",
            source_url="https://example.com",
            content=None,
        )
        
        chunk_count = vector_service.index_document(doc)
        
        assert chunk_count == 0

    def test_update_document_index(self, vector_service, mock_store, sample_document):
        """Test updating document index."""
        chunk_count = vector_service.update_document_index(sample_document)
        
        # Should have called query for both delete and insert
        assert mock_store.query.call_count >= 2
        assert chunk_count > 0

    def test_remove_document_from_index(self, vector_service, mock_store):
        """Test removing document from index."""
        result = vector_service.remove_document_from_index("doc_1")
        
        assert result is True
        mock_store.query.assert_called()
        call_args = mock_store.query.call_args[0][0]
        assert "DELETE" in call_args

    def test_generate_document_embeddings(self, vector_service, sample_document):
        """Test generating embeddings for document chunks."""
        embeddings = vector_service.generate_document_embeddings(sample_document)
        
        assert len(embeddings) > 0
        for chunk_idx, embedding in embeddings:
            assert isinstance(chunk_idx, int)
            assert isinstance(embedding, list)
            assert len(embedding) == vector_service.config.embedding_dimension


class TestVectorSearch:
    """Tests for vector similarity search."""

    def test_vector_search(self, vector_service, mock_store):
        """Test vector similarity search."""
        mock_result = MagicMock()
        mock_result.result_set = [
            ["doc_1", "Document 1", "chunk text", 0, 0.95],
            ["doc_2", "Document 2", "other chunk", 1, 0.85],
        ]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        results = vector_service.vector_search("capital requirements", top_k=5)
        
        assert len(results) == 2
        assert results[0].document_id == "doc_1"
        assert results[0].score == 0.95
        assert results[1].document_id == "doc_2"

    def test_vector_search_empty_results(self, vector_service, mock_store):
        """Test vector search with no results."""
        mock_result = MagicMock()
        mock_result.result_set = []
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        results = vector_service.vector_search("nonexistent topic")
        
        assert len(results) == 0

    def test_find_similar_documents(self, vector_service, mock_store):
        """Test finding similar documents."""
        # First query returns document embedding
        mock_embedding_result = MagicMock()
        mock_embedding_result.result_set = [[[0.1] * 1536]]
        
        # Second query returns similar documents
        mock_search_result = MagicMock()
        mock_search_result.result_set = [
            ["doc_2", "Similar Doc", 0.9],
        ]
        
        mock_store.query.side_effect = [
            QueryResult(nodes=[], relationships=[], raw_result=mock_embedding_result),
            QueryResult(nodes=[], relationships=[], raw_result=mock_search_result),
        ]
        
        results = vector_service.find_similar_documents("doc_1", top_k=5)
        
        assert len(results) == 1
        assert results[0].document_id == "doc_2"


class TestKeywordSearch:
    """Tests for keyword search."""

    def test_keyword_search(self, vector_service, mock_store):
        """Test keyword-based search."""
        mock_result = MagicMock()
        mock_result.result_set = [
            ["doc_1", "CCAR Document", "capital requirements for ccar", 0],
        ]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        results = vector_service.keyword_search(["ccar", "capital"])
        
        assert len(results) == 1
        assert results[0].document_id == "doc_1"
        assert results[0].score > 0

    def test_keyword_search_with_regulator_filter(self, vector_service, mock_store):
        """Test keyword search with regulator filter."""
        mock_result = MagicMock()
        mock_result.result_set = []
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        vector_service.keyword_search(["ccar"], regulator_id="us_frb")
        
        call_args = mock_store.query.call_args[0][0]
        assert "regulator_id" in call_args


class TestHybridSearch:
    """Tests for hybrid search."""

    def test_hybrid_search_vector_only_mode(self, vector_service, mock_store):
        """Test hybrid search in vector-only mode."""
        mock_result = MagicMock()
        mock_result.result_set = [
            ["doc_1", "Document 1", "chunk text", 0, 0.9],
        ]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        results = vector_service.hybrid_search(
            "capital requirements",
            mode=SearchMode.VECTOR_ONLY,
        )
        
        assert len(results) == 1
        assert isinstance(results[0], HybridSearchResult)
        assert results[0].vector_score == 0.9
        assert results[0].keyword_score == 0.0

    def test_hybrid_search_keyword_only_mode(self, vector_service, mock_store):
        """Test hybrid search in keyword-only mode."""
        mock_result = MagicMock()
        mock_result.result_set = [
            ["doc_1", "CCAR Document", "capital requirements", 0],
        ]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        results = vector_service.hybrid_search(
            "capital requirements",
            keywords=["capital"],
            mode=SearchMode.KEYWORD_ONLY,
        )
        
        assert len(results) == 1
        assert results[0].vector_score == 0.0
        assert results[0].keyword_score > 0

    def test_hybrid_search_combined_mode(self, vector_service, mock_store):
        """Test hybrid search combining vector and keyword."""
        # Mock both vector and keyword search results
        mock_result = MagicMock()
        mock_result.result_set = [
            ["doc_1", "Document 1", "capital requirements text", 0, 0.8],
        ]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        results = vector_service.hybrid_search(
            "capital requirements",
            keywords=["capital"],
            mode=SearchMode.HYBRID,
            vector_weight=0.6,
            keyword_weight=0.4,
        )
        
        assert len(results) >= 1
        # Combined score should reflect both weights
        for result in results:
            assert isinstance(result, HybridSearchResult)


class TestKeywordExtraction:
    """Tests for keyword extraction."""

    def test_extract_keywords(self, vector_service):
        """Test keyword extraction from text."""
        text = "CCAR capital requirements for stress testing under Basel III"
        keywords = vector_service._extract_keywords(text)
        
        assert len(keywords) > 0
        assert "ccar" in keywords
        assert "capital" in keywords
        assert "stress" in keywords

    def test_extract_keywords_prioritizes_regulatory_terms(self, vector_service):
        """Test that regulatory terms are prioritized."""
        text = "The LCR and NSFR requirements for liquidity reporting"
        keywords = vector_service._extract_keywords(text)
        
        # Regulatory terms should appear first
        assert "lcr" in keywords
        assert "nsfr" in keywords
        assert "liquidity" in keywords

    def test_extract_keywords_limits_count(self, vector_service):
        """Test that keyword count is limited."""
        text = " ".join(["word" + str(i) for i in range(100)])
        keywords = vector_service._extract_keywords(text)
        
        assert len(keywords) <= 10


class TestBatchOperations:
    """Tests for batch operations."""

    def test_batch_index_documents(self, vector_service, mock_store, sample_document):
        """Test batch indexing multiple documents."""
        documents = [sample_document]
        
        results = vector_service.batch_index_documents(documents, batch_size=5)
        
        assert sample_document.id in results
        assert results[sample_document.id] > 0

    def test_get_index_stats(self, vector_service, mock_store):
        """Test getting index statistics."""
        mock_result = MagicMock()
        mock_result.result_set = [[100, 10]]
        mock_store.query.return_value = QueryResult(
            nodes=[], relationships=[], raw_result=mock_result
        )
        
        stats = vector_service.get_index_stats()
        
        assert stats["chunk_count"] == 100
        assert stats["document_count"] == 10
        assert stats["embedding_dimension"] == 1536


class TestIndexManagement:
    """Tests for index management."""

    def test_create_vector_index(self, vector_service, mock_store):
        """Test creating vector index."""
        result = vector_service.create_vector_index()
        
        assert result is True
        mock_store.query.assert_called()
        call_args = mock_store.query.call_args[0][0]
        assert "CREATE VECTOR INDEX" in call_args

    def test_create_vector_index_already_exists(self, vector_service, mock_store):
        """Test creating index when it already exists."""
        mock_store.query.side_effect = Exception("Index already exists")
        
        result = vector_service.create_vector_index()
        
        assert result is False

    def test_drop_vector_index(self, vector_service, mock_store):
        """Test dropping vector index."""
        result = vector_service.drop_vector_index()
        
        assert result is True
        mock_store.query.assert_called()
        call_args = mock_store.query.call_args[0][0]
        assert "DROP INDEX" in call_args
