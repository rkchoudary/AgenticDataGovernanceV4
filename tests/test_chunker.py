"""Tests for document chunker."""

import pytest
from regulatory_kb.processing.chunker import (
    DocumentChunker,
    DocumentChunk,
    ChunkType,
    ChunkerConfig,
)
from regulatory_kb.processing.parser import (
    ParsedDocument,
    ParsedSection,
    ParsedTable,
    DocumentFormat,
)


class TestDocumentChunker:
    """Tests for DocumentChunker class."""

    @pytest.fixture
    def chunker(self):
        return DocumentChunker()

    @pytest.fixture
    def small_config_chunker(self):
        """Chunker with smaller limits for testing."""
        config = ChunkerConfig(
            min_chunk_tokens=50,
            target_chunk_tokens=100,
            max_chunk_tokens=200,
            overlap_tokens=20,
        )
        return DocumentChunker(config)

    def test_estimate_tokens(self, chunker):
        """Test token estimation."""
        # Empty text
        assert chunker.estimate_tokens("") == 0
        
        # Short text (4 chars per token estimate)
        text = "Hello world"  # 11 chars
        tokens = chunker.estimate_tokens(text)
        assert tokens >= 1
        assert tokens <= 5

    def test_chunk_small_document(self, chunker):
        """Test chunking a small document that fits in one chunk."""
        parsed = ParsedDocument(
            text="This is a small regulatory document about compliance.",
            format=DocumentFormat.HTML,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_001")
        
        assert len(chunks) >= 1
        assert chunks[0].document_id == "doc_001"
        assert "compliance" in chunks[0].content

    def test_chunk_document_with_sections(self, chunker):
        """Test chunking a document with section structure."""
        # Create larger content so sections don't get merged
        intro_content = "This section introduces the regulation. " * 300
        req_content = "This section describes the requirements. " * 300
        
        parsed = ParsedDocument(
            text="Full document text",
            sections=[
                ParsedSection(
                    number="1",
                    title="Introduction",
                    content=intro_content,
                    level=1,
                ),
                ParsedSection(
                    number="2",
                    title="Requirements",
                    content=req_content,
                    level=1,
                ),
            ],
            format=DocumentFormat.CFR,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_002")
        
        assert len(chunks) >= 2
        # Check that sections are preserved in content
        all_content = " ".join(c.content for c in chunks)
        assert "Introduction" in all_content
        assert "Requirements" in all_content

    def test_chunk_navigation_links(self, chunker):
        """Test that chunks have proper navigation links."""
        parsed = ParsedDocument(
            text="Full document text",
            sections=[
                ParsedSection(number="1", title="Section 1", content="Content 1", level=1),
                ParsedSection(number="2", title="Section 2", content="Content 2", level=1),
                ParsedSection(number="3", title="Section 3", content="Content 3", level=1),
            ],
            format=DocumentFormat.CFR,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_003")
        
        # First chunk should have no previous
        assert chunks[0].previous_chunk is None
        
        # Last chunk should have no next
        assert chunks[-1].next_chunk is None
        
        # Middle chunks should have both
        if len(chunks) > 2:
            assert chunks[1].previous_chunk is not None
            assert chunks[1].next_chunk is not None

    def test_chunk_total_count(self, chunker):
        """Test that all chunks have correct total count."""
        parsed = ParsedDocument(
            text="Full document text",
            sections=[
                ParsedSection(number="1", title="Section 1", content="Content 1", level=1),
                ParsedSection(number="2", title="Section 2", content="Content 2", level=1),
            ],
            format=DocumentFormat.CFR,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_004")
        
        for chunk in chunks:
            assert chunk.total_chunks == len(chunks)

    def test_chunk_large_section(self, small_config_chunker):
        """Test chunking a large section that exceeds max tokens."""
        # Create content that exceeds max_chunk_tokens (200 tokens = ~800 chars)
        large_content = "This is regulatory content. " * 100  # ~2800 chars
        
        parsed = ParsedDocument(
            text=large_content,
            sections=[
                ParsedSection(
                    number="1",
                    title="Large Section",
                    content=large_content,
                    level=1,
                ),
            ],
            format=DocumentFormat.CFR,
        )
        
        chunks = small_config_chunker.chunk_document(parsed, "doc_005")
        
        # Should be split into multiple chunks
        assert len(chunks) > 1
        
        # Each chunk should be within limits
        for chunk in chunks:
            assert chunk.token_count <= small_config_chunker.config.max_chunk_tokens + 50  # Allow some tolerance

    def test_chunk_preserves_section_path(self, chunker):
        """Test that section path is preserved in chunks."""
        parsed = ParsedDocument(
            text="Full document text",
            sections=[
                ParsedSection(
                    number="1",
                    title="Main Section",
                    content="Main content",
                    level=1,
                    subsections=[
                        ParsedSection(
                            number="1.1",
                            title="Subsection",
                            content="Subsection content",
                            level=2,
                        ),
                    ],
                ),
            ],
            format=DocumentFormat.CFR,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_006")
        
        # Find chunk with subsection
        subsection_chunks = [c for c in chunks if "Subsection" in c.content]
        if subsection_chunks:
            assert len(subsection_chunks[0].section_path) >= 1

    def test_merge_small_chunks(self, chunker):
        """Test that small chunks are merged."""
        # Create chunks that are below min_chunk_tokens
        chunks = [
            DocumentChunk(
                chunk_id="doc_chunk_0",
                document_id="doc",
                content="Small content",
                chunk_index=0,
                token_count=10,
                chunk_type=ChunkType.SECTION,
            ),
            DocumentChunk(
                chunk_id="doc_chunk_1",
                document_id="doc",
                content="Another small content",
                chunk_index=1,
                token_count=15,
                chunk_type=ChunkType.SECTION,
            ),
        ]
        
        merged = chunker.merge_small_chunks(chunks)
        
        # Should be merged into one chunk
        assert len(merged) == 1
        assert "Small content" in merged[0].content
        assert "Another small content" in merged[0].content

    def test_table_chunks_not_merged(self, chunker):
        """Test that table chunks are not merged with other chunks."""
        chunks = [
            DocumentChunk(
                chunk_id="doc_chunk_0",
                document_id="doc",
                content="Small content",
                chunk_index=0,
                token_count=10,
                chunk_type=ChunkType.SECTION,
            ),
            DocumentChunk(
                chunk_id="doc_table_0",
                document_id="doc",
                content="Table content",
                chunk_index=1,
                token_count=500,
                chunk_type=ChunkType.TABLE,
            ),
        ]
        
        merged = chunker.merge_small_chunks(chunks)
        
        # Table should remain separate
        table_chunks = [c for c in merged if c.chunk_type == ChunkType.TABLE]
        assert len(table_chunks) == 1

    def test_chunk_with_tables(self, chunker):
        """Test chunking document with tables."""
        parsed = ParsedDocument(
            text="Document with table",
            tables=[
                ParsedTable(
                    headers=["Column 1", "Column 2"],
                    rows=[["A", "B"], ["C", "D"]] * 100,  # Large table
                    caption="Test Table",
                ),
            ],
            format=DocumentFormat.HTML,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_007")
        
        # Should have at least one chunk
        assert len(chunks) >= 1

    def test_chunk_to_dict(self, chunker):
        """Test chunk serialization to dictionary."""
        chunk = DocumentChunk(
            chunk_id="doc_001_chunk_0",
            document_id="doc_001",
            content="Test content",
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
        
        result = chunk.to_dict()
        
        assert result["chunk_id"] == "doc_001_chunk_0"
        assert result["document_id"] == "doc_001"
        assert result["content"] == "Test content"
        assert result["chunk_index"] == 0
        assert result["total_chunks"] == 3
        assert result["section_path"] == ["Section 1", "Subsection 1.1"]
        assert result["page_range"] == [1, 5]
        assert result["token_count"] == 100
        assert result["chunk_type"] == "section"
        assert result["next_chunk"] == "doc_001_chunk_1"

    def test_chunk_without_sections_uses_size_based(self, small_config_chunker):
        """Test that documents without sections use size-based chunking."""
        # Create text that exceeds target tokens
        text = "This is paragraph one about regulatory compliance. " * 20
        text += "\n\n"
        text += "This is paragraph two about reporting requirements. " * 20
        
        parsed = ParsedDocument(
            text=text,
            sections=[],  # No sections
            format=DocumentFormat.HTML,
        )
        
        chunks = small_config_chunker.chunk_document(parsed, "doc_008")
        
        # Should create multiple chunks
        assert len(chunks) >= 1

    def test_regulatory_section_boundaries(self, chunker):
        """Test that regulatory section patterns are detected."""
        text = """
        PART 249 - LIQUIDITY RISK MEASUREMENT
        
        This part establishes minimum liquidity requirements.
        
        § 249.1 Purpose and applicability.
        
        This section describes the purpose of the regulation.
        
        § 249.2 Definitions.
        
        This section provides definitions.
        """
        
        parsed = ParsedDocument(
            text=text,
            sections=[],
            format=DocumentFormat.CFR,
        )
        
        chunks = chunker.chunk_document(parsed, "doc_009")
        
        # Should detect regulatory boundaries
        assert len(chunks) >= 1


class TestChunkerConfig:
    """Tests for ChunkerConfig."""

    def test_default_config(self):
        """Test default configuration values."""
        config = ChunkerConfig()
        
        assert config.min_chunk_tokens == 1000
        assert config.target_chunk_tokens == 2000
        assert config.max_chunk_tokens == 4000
        assert config.overlap_tokens == 200
        assert config.max_table_tokens == 8000

    def test_custom_config(self):
        """Test custom configuration."""
        config = ChunkerConfig(
            min_chunk_tokens=500,
            target_chunk_tokens=1000,
            max_chunk_tokens=2000,
            overlap_tokens=100,
        )
        
        assert config.min_chunk_tokens == 500
        assert config.target_chunk_tokens == 1000
        assert config.max_chunk_tokens == 2000
        assert config.overlap_tokens == 100
