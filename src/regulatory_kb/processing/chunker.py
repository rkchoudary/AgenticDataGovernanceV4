"""Document chunker for splitting large documents into manageable chunks.

Implements Requirements 3.1, 3.4:
- Structural chunking by section headers
- Size-based chunking with token limits (1000-4000)
- Overlap between chunks (200 tokens)
- Preserve regulatory structure boundaries
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import structlog

from regulatory_kb.processing.parser import ParsedDocument, ParsedSection

logger = structlog.get_logger(__name__)


class ChunkType(str, Enum):
    """Type of chunk based on how it was created."""
    SECTION = "section"
    SIZE_BASED = "size_based"
    TABLE = "table"
    MERGED = "merged"


@dataclass
class DocumentChunk:
    """Represents a chunk of a document.
    
    Implements chunk metadata tracking per design document:
    - chunk_id: Unique identifier for the chunk
    - document_id: Parent document identifier
    - chunk_index: Position in the sequence of chunks
    - section_path: Hierarchical path of section headers
    - page_range: Estimated page range (if available)
    - token_count: Number of tokens in the chunk
    - chunk_type: How the chunk was created
    - previous_chunk: ID of the previous chunk
    - next_chunk: ID of the next chunk
    """
    chunk_id: str
    document_id: str
    content: str
    chunk_index: int
    total_chunks: int = 0
    section_path: list[str] = field(default_factory=list)
    page_range: tuple[int, int] = field(default_factory=lambda: (0, 0))
    token_count: int = 0
    chunk_type: ChunkType = ChunkType.SECTION
    previous_chunk: Optional[str] = None
    next_chunk: Optional[str] = None
    section_title: Optional[str] = None
    metadata: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        return {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "content": self.content,
            "chunk_index": self.chunk_index,
            "total_chunks": self.total_chunks,
            "section_path": self.section_path,
            "page_range": list(self.page_range),
            "token_count": self.token_count,
            "chunk_type": self.chunk_type.value,
            "previous_chunk": self.previous_chunk,
            "next_chunk": self.next_chunk,
            "section_title": self.section_title,
            "metadata": self.metadata,
        }


@dataclass
class ChunkContext:
    """Context information for a chunk."""
    headers: list[str]
    previous_content: Optional[str] = None
    next_content: Optional[str] = None


@dataclass
class ChunkerConfig:
    """Configuration for document chunking."""
    min_chunk_tokens: int = 1000
    target_chunk_tokens: int = 2000
    max_chunk_tokens: int = 4000
    overlap_tokens: int = 200
    max_table_tokens: int = 8000
    preserve_paragraphs: bool = True
    preserve_lists: bool = True


class DocumentChunker:
    """Chunker for splitting large documents into manageable pieces.
    
    Implements hierarchical chunking strategy:
    1. Structural chunking by section headers (primary)
    2. Size-based chunking with token limits (secondary)
    3. Semantic chunking at paragraph/list boundaries (tertiary)
    
    Preserves regulatory structure boundaries and maintains
    navigation links between chunks.
    """

    # Approximate tokens per character (conservative estimate)
    CHARS_PER_TOKEN = 4

    # Regulatory section patterns
    SECTION_PATTERNS = [
        re.compile(r"^(?:PART|SUBPART|CHAPTER|SECTION|ARTICLE)\s+\d+", re.IGNORECASE | re.MULTILINE),
        re.compile(r"^§\s*\d+(?:\.\d+)*", re.MULTILINE),
        re.compile(r"^(?:Schedule|Appendix)\s+[A-Z0-9]+", re.IGNORECASE | re.MULTILINE),
    ]

    # Header patterns for structural chunking
    HEADER_PATTERNS = [
        re.compile(r"^#{1,6}\s+.+$", re.MULTILINE),  # Markdown headers
        re.compile(r"^[A-Z][A-Z\s]{5,}$", re.MULTILINE),  # ALL CAPS headers
        re.compile(r"^\d+(?:\.\d+)*\s+[A-Z].+$", re.MULTILINE),  # Numbered sections
    ]

    def __init__(self, config: Optional[ChunkerConfig] = None):
        """Initialize the document chunker.
        
        Args:
            config: Chunking configuration. Uses defaults if not provided.
        """
        self.config = config or ChunkerConfig()

    def estimate_tokens(self, text: str) -> int:
        """Estimate the number of tokens in text.
        
        Uses a simple character-based estimation. For more accurate
        token counting, integrate with a tokenizer.
        
        Args:
            text: Text to estimate tokens for.
            
        Returns:
            Estimated token count.
        """
        if not text:
            return 0
        return max(1, len(text) // self.CHARS_PER_TOKEN)

    def chunk_document(
        self,
        parsed_doc: ParsedDocument,
        document_id: str,
    ) -> list[DocumentChunk]:
        """Split document into chunks using hierarchical strategy.
        
        Args:
            parsed_doc: Parsed document to chunk.
            document_id: Unique identifier for the document.
            
        Returns:
            List of DocumentChunk objects with navigation links.
        """
        logger.info(
            "chunking_document",
            document_id=document_id,
            text_length=len(parsed_doc.text),
            section_count=len(parsed_doc.sections),
        )

        chunks: list[DocumentChunk] = []

        # If document has sections, use structural chunking
        if parsed_doc.sections:
            chunks = self._chunk_by_sections(parsed_doc, document_id)
        else:
            # Fall back to text-based chunking
            chunks = self._chunk_by_size(parsed_doc.text, document_id)

        # Handle tables as separate chunks if they're large
        table_chunks = self._chunk_tables(parsed_doc, document_id, len(chunks))
        chunks.extend(table_chunks)

        # Merge small chunks
        chunks = self.merge_small_chunks(chunks)

        # Update navigation links and total counts
        chunks = self._update_navigation(chunks)

        logger.info(
            "chunking_complete",
            document_id=document_id,
            chunk_count=len(chunks),
        )

        return chunks

    def _chunk_by_sections(
        self,
        parsed_doc: ParsedDocument,
        document_id: str,
    ) -> list[DocumentChunk]:
        """Chunk document based on section structure.
        
        Args:
            parsed_doc: Parsed document with sections.
            document_id: Document identifier.
            
        Returns:
            List of chunks based on sections.
        """
        chunks: list[DocumentChunk] = []
        chunk_index = 0

        for section in parsed_doc.sections:
            section_chunks = self._process_section(
                section=section,
                document_id=document_id,
                chunk_index=chunk_index,
                section_path=[],
            )
            chunks.extend(section_chunks)
            chunk_index += len(section_chunks)

        return chunks

    def _process_section(
        self,
        section: ParsedSection,
        document_id: str,
        chunk_index: int,
        section_path: list[str],
    ) -> list[DocumentChunk]:
        """Process a section and its subsections into chunks.
        
        Args:
            section: Section to process.
            document_id: Document identifier.
            chunk_index: Current chunk index.
            section_path: Path of parent section titles.
            
        Returns:
            List of chunks from this section.
        """
        chunks: list[DocumentChunk] = []
        current_path = section_path + [f"{section.number} {section.title}".strip()]

        # Build section content with header
        section_header = f"{section.number} {section.title}".strip()
        section_content = f"{section_header}\n\n{section.content}" if section.content else section_header

        # Check if section content fits in one chunk
        token_count = self.estimate_tokens(section_content)

        if token_count <= self.config.max_chunk_tokens:
            # Section fits in one chunk
            chunk = DocumentChunk(
                chunk_id=f"{document_id}_chunk_{chunk_index}",
                document_id=document_id,
                content=section_content,
                chunk_index=chunk_index,
                section_path=current_path,
                token_count=token_count,
                chunk_type=ChunkType.SECTION,
                section_title=section_header,
            )
            chunks.append(chunk)
            chunk_index += 1
        else:
            # Section too large, split by size
            sub_chunks = self._split_large_section(
                content=section_content,
                document_id=document_id,
                chunk_index=chunk_index,
                section_path=current_path,
                section_title=section_header,
            )
            chunks.extend(sub_chunks)
            chunk_index += len(sub_chunks)

        # Process subsections
        for subsection in section.subsections:
            sub_chunks = self._process_section(
                section=subsection,
                document_id=document_id,
                chunk_index=chunk_index,
                section_path=current_path,
            )
            chunks.extend(sub_chunks)
            chunk_index += len(sub_chunks)

        return chunks

    def _split_large_section(
        self,
        content: str,
        document_id: str,
        chunk_index: int,
        section_path: list[str],
        section_title: str,
    ) -> list[DocumentChunk]:
        """Split a large section into multiple chunks with overlap.
        
        Args:
            content: Section content to split.
            document_id: Document identifier.
            chunk_index: Starting chunk index.
            section_path: Section path for metadata.
            section_title: Section title to include in each chunk.
            
        Returns:
            List of chunks from the split section.
        """
        chunks: list[DocumentChunk] = []
        
        # Split into paragraphs first
        paragraphs = self._split_into_paragraphs(content)
        
        current_chunk_content: list[str] = []
        current_tokens = 0
        
        for para in paragraphs:
            para_tokens = self.estimate_tokens(para)
            
            # If single paragraph exceeds max, split it further
            if para_tokens > self.config.max_chunk_tokens:
                # Flush current chunk first
                if current_chunk_content:
                    chunk_content = "\n\n".join(current_chunk_content)
                    chunks.append(self._create_chunk(
                        content=chunk_content,
                        document_id=document_id,
                        chunk_index=chunk_index + len(chunks),
                        section_path=section_path,
                        section_title=section_title,
                        chunk_type=ChunkType.SIZE_BASED,
                    ))
                    current_chunk_content = []
                    current_tokens = 0
                
                # Split large paragraph
                para_chunks = self._split_paragraph(
                    para, document_id, chunk_index + len(chunks),
                    section_path, section_title
                )
                chunks.extend(para_chunks)
                continue
            
            # Check if adding this paragraph exceeds target
            if current_tokens + para_tokens > self.config.target_chunk_tokens:
                # Create chunk from current content
                if current_chunk_content:
                    chunk_content = "\n\n".join(current_chunk_content)
                    chunks.append(self._create_chunk(
                        content=chunk_content,
                        document_id=document_id,
                        chunk_index=chunk_index + len(chunks),
                        section_path=section_path,
                        section_title=section_title,
                        chunk_type=ChunkType.SIZE_BASED,
                    ))
                    
                    # Add overlap from end of previous chunk
                    overlap_content = self._get_overlap_content(current_chunk_content)
                    current_chunk_content = [overlap_content] if overlap_content else []
                    current_tokens = self.estimate_tokens(overlap_content) if overlap_content else 0
            
            current_chunk_content.append(para)
            current_tokens += para_tokens
        
        # Don't forget the last chunk
        if current_chunk_content:
            chunk_content = "\n\n".join(current_chunk_content)
            chunks.append(self._create_chunk(
                content=chunk_content,
                document_id=document_id,
                chunk_index=chunk_index + len(chunks),
                section_path=section_path,
                section_title=section_title,
                chunk_type=ChunkType.SIZE_BASED,
            ))
        
        return chunks

    def _split_paragraph(
        self,
        paragraph: str,
        document_id: str,
        chunk_index: int,
        section_path: list[str],
        section_title: str,
    ) -> list[DocumentChunk]:
        """Split a very large paragraph into chunks.
        
        Args:
            paragraph: Large paragraph to split.
            document_id: Document identifier.
            chunk_index: Starting chunk index.
            section_path: Section path for metadata.
            section_title: Section title.
            
        Returns:
            List of chunks from the paragraph.
        """
        chunks: list[DocumentChunk] = []
        
        # Split by sentences
        sentences = re.split(r'(?<=[.!?])\s+', paragraph)
        
        current_content: list[str] = []
        current_tokens = 0
        
        for sentence in sentences:
            sentence_tokens = self.estimate_tokens(sentence)
            
            if current_tokens + sentence_tokens > self.config.target_chunk_tokens:
                if current_content:
                    chunk_content = " ".join(current_content)
                    chunks.append(self._create_chunk(
                        content=chunk_content,
                        document_id=document_id,
                        chunk_index=chunk_index + len(chunks),
                        section_path=section_path,
                        section_title=section_title,
                        chunk_type=ChunkType.SIZE_BASED,
                    ))
                    current_content = []
                    current_tokens = 0
            
            current_content.append(sentence)
            current_tokens += sentence_tokens
        
        if current_content:
            chunk_content = " ".join(current_content)
            chunks.append(self._create_chunk(
                content=chunk_content,
                document_id=document_id,
                chunk_index=chunk_index + len(chunks),
                section_path=section_path,
                section_title=section_title,
                chunk_type=ChunkType.SIZE_BASED,
            ))
        
        return chunks

    def _split_into_paragraphs(self, text: str) -> list[str]:
        """Split text into paragraphs.
        
        Args:
            text: Text to split.
            
        Returns:
            List of paragraphs.
        """
        # Split on double newlines or more
        paragraphs = re.split(r'\n\s*\n', text)
        return [p.strip() for p in paragraphs if p.strip()]

    def _get_overlap_content(self, content_parts: list[str]) -> str:
        """Get overlap content from the end of a chunk.
        
        Args:
            content_parts: List of content parts in the chunk.
            
        Returns:
            Content to use as overlap for next chunk.
        """
        if not content_parts:
            return ""
        
        # Take content from the end up to overlap_tokens
        overlap_parts: list[str] = []
        overlap_tokens = 0
        
        for part in reversed(content_parts):
            part_tokens = self.estimate_tokens(part)
            if overlap_tokens + part_tokens > self.config.overlap_tokens:
                break
            overlap_parts.insert(0, part)
            overlap_tokens += part_tokens
        
        return "\n\n".join(overlap_parts)

    def _create_chunk(
        self,
        content: str,
        document_id: str,
        chunk_index: int,
        section_path: list[str],
        section_title: str,
        chunk_type: ChunkType,
    ) -> DocumentChunk:
        """Create a DocumentChunk with metadata.
        
        Args:
            content: Chunk content.
            document_id: Document identifier.
            chunk_index: Chunk index.
            section_path: Section path.
            section_title: Section title.
            chunk_type: Type of chunk.
            
        Returns:
            DocumentChunk instance.
        """
        return DocumentChunk(
            chunk_id=f"{document_id}_chunk_{chunk_index}",
            document_id=document_id,
            content=content,
            chunk_index=chunk_index,
            section_path=section_path,
            token_count=self.estimate_tokens(content),
            chunk_type=chunk_type,
            section_title=section_title,
        )

    def _chunk_by_size(
        self,
        text: str,
        document_id: str,
    ) -> list[DocumentChunk]:
        """Chunk text by size when no section structure is available.
        
        Args:
            text: Text to chunk.
            document_id: Document identifier.
            
        Returns:
            List of size-based chunks.
        """
        chunks: list[DocumentChunk] = []
        
        # Try to find natural boundaries (headers, regulatory sections)
        boundaries = self._find_natural_boundaries(text)
        
        if boundaries:
            # Split at natural boundaries
            chunks = self._split_at_boundaries(text, boundaries, document_id)
        else:
            # Fall back to paragraph-based splitting
            paragraphs = self._split_into_paragraphs(text)
            current_content: list[str] = []
            current_tokens = 0
            
            for para in paragraphs:
                para_tokens = self.estimate_tokens(para)
                
                if current_tokens + para_tokens > self.config.target_chunk_tokens:
                    if current_content:
                        chunk_content = "\n\n".join(current_content)
                        chunks.append(DocumentChunk(
                            chunk_id=f"{document_id}_chunk_{len(chunks)}",
                            document_id=document_id,
                            content=chunk_content,
                            chunk_index=len(chunks),
                            token_count=self.estimate_tokens(chunk_content),
                            chunk_type=ChunkType.SIZE_BASED,
                        ))
                        current_content = []
                        current_tokens = 0
                
                current_content.append(para)
                current_tokens += para_tokens
            
            if current_content:
                chunk_content = "\n\n".join(current_content)
                chunks.append(DocumentChunk(
                    chunk_id=f"{document_id}_chunk_{len(chunks)}",
                    document_id=document_id,
                    content=chunk_content,
                    chunk_index=len(chunks),
                    token_count=self.estimate_tokens(chunk_content),
                    chunk_type=ChunkType.SIZE_BASED,
                ))
        
        return chunks

    def _find_natural_boundaries(self, text: str) -> list[int]:
        """Find natural boundary positions in text.
        
        Args:
            text: Text to analyze.
            
        Returns:
            List of boundary positions (character indices).
        """
        boundaries: set[int] = {0}
        
        # Find regulatory section boundaries
        for pattern in self.SECTION_PATTERNS:
            for match in pattern.finditer(text):
                boundaries.add(match.start())
        
        # Find header boundaries
        for pattern in self.HEADER_PATTERNS:
            for match in pattern.finditer(text):
                boundaries.add(match.start())
        
        return sorted(boundaries)

    def _split_at_boundaries(
        self,
        text: str,
        boundaries: list[int],
        document_id: str,
    ) -> list[DocumentChunk]:
        """Split text at natural boundaries.
        
        Args:
            text: Text to split.
            boundaries: List of boundary positions.
            document_id: Document identifier.
            
        Returns:
            List of chunks.
        """
        chunks: list[DocumentChunk] = []
        
        for i, start in enumerate(boundaries):
            end = boundaries[i + 1] if i + 1 < len(boundaries) else len(text)
            content = text[start:end].strip()
            
            if not content:
                continue
            
            token_count = self.estimate_tokens(content)
            
            if token_count > self.config.max_chunk_tokens:
                # Split large section further
                sub_chunks = self._split_large_section(
                    content=content,
                    document_id=document_id,
                    chunk_index=len(chunks),
                    section_path=[],
                    section_title="",
                )
                chunks.extend(sub_chunks)
            else:
                chunks.append(DocumentChunk(
                    chunk_id=f"{document_id}_chunk_{len(chunks)}",
                    document_id=document_id,
                    content=content,
                    chunk_index=len(chunks),
                    token_count=token_count,
                    chunk_type=ChunkType.SECTION,
                ))
        
        return chunks

    def _chunk_tables(
        self,
        parsed_doc: ParsedDocument,
        document_id: str,
        start_index: int,
    ) -> list[DocumentChunk]:
        """Create chunks for large tables.
        
        Tables are kept as single chunks up to max_table_tokens.
        
        Args:
            parsed_doc: Parsed document with tables.
            document_id: Document identifier.
            start_index: Starting chunk index.
            
        Returns:
            List of table chunks.
        """
        chunks: list[DocumentChunk] = []
        
        for i, table in enumerate(parsed_doc.tables):
            # Convert table to text representation
            table_text = self._table_to_text(table)
            token_count = self.estimate_tokens(table_text)
            
            # Only create separate chunk for large tables
            if token_count > self.config.min_chunk_tokens:
                chunks.append(DocumentChunk(
                    chunk_id=f"{document_id}_table_{i}",
                    document_id=document_id,
                    content=table_text,
                    chunk_index=start_index + len(chunks),
                    token_count=token_count,
                    chunk_type=ChunkType.TABLE,
                    section_title=table.caption,
                    metadata={"table_index": i},
                ))
        
        return chunks

    def _table_to_text(self, table) -> str:
        """Convert a ParsedTable to text representation.
        
        Args:
            table: ParsedTable to convert.
            
        Returns:
            Text representation of the table.
        """
        lines = []
        
        if table.caption:
            lines.append(f"Table: {table.caption}")
            lines.append("")
        
        if table.headers:
            lines.append(" | ".join(table.headers))
            lines.append("-" * 40)
        
        for row in table.rows:
            lines.append(" | ".join(row))
        
        return "\n".join(lines)

    def merge_small_chunks(
        self,
        chunks: list[DocumentChunk],
    ) -> list[DocumentChunk]:
        """Merge chunks that are too small while respecting boundaries.
        
        Args:
            chunks: List of chunks to potentially merge.
            
        Returns:
            List of chunks with small ones merged.
        """
        if not chunks:
            return chunks
        
        merged: list[DocumentChunk] = []
        current_chunk: Optional[DocumentChunk] = None
        
        for chunk in chunks:
            # Don't merge table chunks
            if chunk.chunk_type == ChunkType.TABLE:
                if current_chunk:
                    merged.append(current_chunk)
                    current_chunk = None
                merged.append(chunk)
                continue
            
            if current_chunk is None:
                current_chunk = chunk
                continue
            
            # Check if we should merge
            combined_tokens = current_chunk.token_count + chunk.token_count
            
            if (current_chunk.token_count < self.config.min_chunk_tokens and
                combined_tokens <= self.config.target_chunk_tokens):
                # Merge chunks
                current_chunk = self._merge_two_chunks(current_chunk, chunk)
            else:
                merged.append(current_chunk)
                current_chunk = chunk
        
        if current_chunk:
            merged.append(current_chunk)
        
        return merged

    def _merge_two_chunks(
        self,
        chunk1: DocumentChunk,
        chunk2: DocumentChunk,
    ) -> DocumentChunk:
        """Merge two chunks into one.
        
        Args:
            chunk1: First chunk.
            chunk2: Second chunk.
            
        Returns:
            Merged chunk.
        """
        merged_content = f"{chunk1.content}\n\n{chunk2.content}"
        
        # Combine section paths (use the more specific one)
        section_path = chunk2.section_path if chunk2.section_path else chunk1.section_path
        
        return DocumentChunk(
            chunk_id=chunk1.chunk_id,  # Keep first chunk's ID
            document_id=chunk1.document_id,
            content=merged_content,
            chunk_index=chunk1.chunk_index,
            section_path=section_path,
            token_count=self.estimate_tokens(merged_content),
            chunk_type=ChunkType.MERGED,
            section_title=chunk1.section_title or chunk2.section_title,
        )

    def _update_navigation(
        self,
        chunks: list[DocumentChunk],
    ) -> list[DocumentChunk]:
        """Update navigation links and total counts for all chunks.
        
        Args:
            chunks: List of chunks to update.
            
        Returns:
            Updated chunks with navigation links.
        """
        total = len(chunks)
        
        for i, chunk in enumerate(chunks):
            chunk.total_chunks = total
            chunk.chunk_index = i
            chunk.chunk_id = f"{chunk.document_id}_chunk_{i}"
            
            if i > 0:
                chunk.previous_chunk = chunks[i - 1].chunk_id
            
            if i < total - 1:
                chunk.next_chunk = chunks[i + 1].chunk_id
        
        return chunks

    def get_chunk_context(self, chunk: DocumentChunk) -> ChunkContext:
        """Get surrounding context for a chunk.
        
        Args:
            chunk: Chunk to get context for.
            
        Returns:
            ChunkContext with headers and surrounding content.
        """
        return ChunkContext(
            headers=chunk.section_path,
            previous_content=None,  # Would need access to other chunks
            next_content=None,
        )
