"""Chunk storage for document chunks in FalkorDB.

Implements Requirements 3.4:
- Track section path, page range, token count
- Create navigation links between chunks
- Store chunk relationships in graph
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional

import structlog

from regulatory_kb.processing.chunker import DocumentChunk, ChunkType
from regulatory_kb.storage.graph_store import FalkorDBStore, QueryResult
from regulatory_kb.models.relationship import RelationshipType

logger = structlog.get_logger(__name__)


class ChunkStore:
    """Storage for document chunks in FalkorDB.
    
    Handles:
    - Creating Chunk nodes with metadata
    - Creating CHUNK_OF relationships to parent documents
    - Creating NEXT_CHUNK/PREVIOUS_CHUNK navigation relationships
    - Querying chunks by document or section
    """

    def __init__(self, graph_store: FalkorDBStore):
        """Initialize the chunk store.
        
        Args:
            graph_store: FalkorDB store instance.
        """
        self.graph_store = graph_store

    def _compute_content_hash(self, content: str) -> str:
        """Compute a hash of chunk content for deduplication.
        
        Args:
            content: Chunk content.
            
        Returns:
            SHA-256 hash of content.
        """
        return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]

    def store_chunk(self, chunk: DocumentChunk) -> str:
        """Store a single chunk in the graph.
        
        Args:
            chunk: DocumentChunk to store.
            
        Returns:
            The chunk ID.
        """
        self.graph_store._ensure_connected()
        
        content_hash = self._compute_content_hash(chunk.content)
        section_path_str = " > ".join(chunk.section_path) if chunk.section_path else ""
        
        query = """
        MERGE (c:Chunk {chunk_id: $chunk_id})
        SET c.document_id = $document_id,
            c.chunk_index = $chunk_index,
            c.total_chunks = $total_chunks,
            c.section_path = $section_path,
            c.page_start = $page_start,
            c.page_end = $page_end,
            c.token_count = $token_count,
            c.chunk_type = $chunk_type,
            c.section_title = $section_title,
            c.content_hash = $content_hash,
            c.created_at = $created_at
        RETURN c.chunk_id
        """
        
        params = {
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "chunk_index": chunk.chunk_index,
            "total_chunks": chunk.total_chunks,
            "section_path": section_path_str,
            "page_start": chunk.page_range[0],
            "page_end": chunk.page_range[1],
            "token_count": chunk.token_count,
            "chunk_type": chunk.chunk_type.value,
            "section_title": chunk.section_title or "",
            "content_hash": content_hash,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        self.graph_store._graph.query(query, params)
        
        logger.debug(
            "stored_chunk",
            chunk_id=chunk.chunk_id,
            document_id=chunk.document_id,
            chunk_index=chunk.chunk_index,
        )
        
        return chunk.chunk_id

    def store_chunks(self, chunks: list[DocumentChunk]) -> list[str]:
        """Store multiple chunks and create relationships.
        
        Args:
            chunks: List of DocumentChunks to store.
            
        Returns:
            List of stored chunk IDs.
        """
        if not chunks:
            return []
        
        logger.info(
            "storing_chunks",
            document_id=chunks[0].document_id if chunks else None,
            chunk_count=len(chunks),
        )
        
        chunk_ids = []
        
        # Store all chunks
        for chunk in chunks:
            chunk_id = self.store_chunk(chunk)
            chunk_ids.append(chunk_id)
        
        # Create CHUNK_OF relationships to parent document
        document_id = chunks[0].document_id
        for chunk in chunks:
            self._create_chunk_of_relationship(chunk.chunk_id, document_id)
        
        # Create navigation relationships between chunks
        self._create_navigation_relationships(chunks)
        
        logger.info(
            "chunks_stored",
            document_id=document_id,
            chunk_count=len(chunk_ids),
        )
        
        return chunk_ids

    def _create_chunk_of_relationship(
        self,
        chunk_id: str,
        document_id: str,
    ) -> bool:
        """Create CHUNK_OF relationship between chunk and document.
        
        Args:
            chunk_id: ID of the chunk.
            document_id: ID of the parent document.
            
        Returns:
            True if relationship was created.
        """
        query = """
        MATCH (c:Chunk {chunk_id: $chunk_id})
        MATCH (d:Document {id: $document_id})
        MERGE (c)-[r:CHUNK_OF]->(d)
        SET r.created_at = $created_at
        RETURN type(r)
        """
        
        params = {
            "chunk_id": chunk_id,
            "document_id": document_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        
        try:
            result = self.graph_store._graph.query(query, params)
            return result.result_set is not None and len(result.result_set) > 0
        except Exception as e:
            logger.warning(
                "chunk_of_relationship_failed",
                chunk_id=chunk_id,
                document_id=document_id,
                error=str(e),
            )
            return False

    def _create_navigation_relationships(
        self,
        chunks: list[DocumentChunk],
    ) -> None:
        """Create NEXT_CHUNK and PREVIOUS_CHUNK relationships.
        
        Args:
            chunks: List of chunks in order.
        """
        for i, chunk in enumerate(chunks):
            # Create NEXT_CHUNK relationship
            if chunk.next_chunk:
                self._create_next_chunk_relationship(
                    chunk.chunk_id,
                    chunk.next_chunk,
                )
            
            # Create PREVIOUS_CHUNK relationship
            if chunk.previous_chunk:
                self._create_previous_chunk_relationship(
                    chunk.chunk_id,
                    chunk.previous_chunk,
                )

    def _create_next_chunk_relationship(
        self,
        source_chunk_id: str,
        target_chunk_id: str,
    ) -> bool:
        """Create NEXT_CHUNK relationship between chunks.
        
        Args:
            source_chunk_id: ID of the source chunk.
            target_chunk_id: ID of the next chunk.
            
        Returns:
            True if relationship was created.
        """
        query = """
        MATCH (c1:Chunk {chunk_id: $source_id})
        MATCH (c2:Chunk {chunk_id: $target_id})
        MERGE (c1)-[r:NEXT_CHUNK]->(c2)
        RETURN type(r)
        """
        
        params = {
            "source_id": source_chunk_id,
            "target_id": target_chunk_id,
        }
        
        try:
            result = self.graph_store._graph.query(query, params)
            return result.result_set is not None and len(result.result_set) > 0
        except Exception as e:
            logger.warning(
                "next_chunk_relationship_failed",
                source_id=source_chunk_id,
                target_id=target_chunk_id,
                error=str(e),
            )
            return False

    def _create_previous_chunk_relationship(
        self,
        source_chunk_id: str,
        target_chunk_id: str,
    ) -> bool:
        """Create PREVIOUS_CHUNK relationship between chunks.
        
        Args:
            source_chunk_id: ID of the source chunk.
            target_chunk_id: ID of the previous chunk.
            
        Returns:
            True if relationship was created.
        """
        query = """
        MATCH (c1:Chunk {chunk_id: $source_id})
        MATCH (c2:Chunk {chunk_id: $target_id})
        MERGE (c1)-[r:PREVIOUS_CHUNK]->(c2)
        RETURN type(r)
        """
        
        params = {
            "source_id": source_chunk_id,
            "target_id": target_chunk_id,
        }
        
        try:
            result = self.graph_store._graph.query(query, params)
            return result.result_set is not None and len(result.result_set) > 0
        except Exception as e:
            logger.warning(
                "previous_chunk_relationship_failed",
                source_id=source_chunk_id,
                target_id=target_chunk_id,
                error=str(e),
            )
            return False

    def get_chunk_by_id(self, chunk_id: str) -> Optional[dict]:
        """Get a chunk by its ID.
        
        Args:
            chunk_id: Chunk ID to retrieve.
            
        Returns:
            Chunk properties or None if not found.
        """
        query = """
        MATCH (c:Chunk {chunk_id: $chunk_id})
        RETURN c
        """
        
        result = self.graph_store.query(query, {"chunk_id": chunk_id})
        return result.nodes[0] if result.nodes else None

    def get_chunks_by_document(
        self,
        document_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """Get all chunks for a document.
        
        Args:
            document_id: Document ID to get chunks for.
            limit: Maximum number of chunks to return.
            
        Returns:
            List of chunk properties ordered by chunk_index.
        """
        query = """
        MATCH (c:Chunk {document_id: $document_id})
        RETURN c
        ORDER BY c.chunk_index
        LIMIT $limit
        """
        
        result = self.graph_store.query(
            query,
            {"document_id": document_id, "limit": limit},
        )
        return result.nodes

    def get_chunk_with_navigation(
        self,
        chunk_id: str,
    ) -> dict:
        """Get a chunk with its navigation context.
        
        Args:
            chunk_id: Chunk ID to retrieve.
            
        Returns:
            Dictionary with chunk, previous, and next chunk info.
        """
        query = """
        MATCH (c:Chunk {chunk_id: $chunk_id})
        OPTIONAL MATCH (c)-[:PREVIOUS_CHUNK]->(prev:Chunk)
        OPTIONAL MATCH (c)-[:NEXT_CHUNK]->(next:Chunk)
        RETURN c, prev, next
        """
        
        result = self.graph_store._graph.query(query, {"chunk_id": chunk_id})
        
        if not result.result_set:
            return {}
        
        row = result.result_set[0]
        return {
            "chunk": dict(row[0].properties) if row[0] else None,
            "previous": dict(row[1].properties) if row[1] else None,
            "next": dict(row[2].properties) if row[2] else None,
        }

    def get_chunks_by_section(
        self,
        document_id: str,
        section_title: str,
    ) -> list[dict]:
        """Get chunks belonging to a specific section.
        
        Args:
            document_id: Document ID.
            section_title: Section title to filter by.
            
        Returns:
            List of chunk properties.
        """
        query = """
        MATCH (c:Chunk {document_id: $document_id})
        WHERE c.section_title CONTAINS $section_title
        RETURN c
        ORDER BY c.chunk_index
        """
        
        result = self.graph_store.query(
            query,
            {"document_id": document_id, "section_title": section_title},
        )
        return result.nodes

    def delete_chunks_by_document(self, document_id: str) -> int:
        """Delete all chunks for a document.
        
        Args:
            document_id: Document ID to delete chunks for.
            
        Returns:
            Number of chunks deleted.
        """
        query = """
        MATCH (c:Chunk {document_id: $document_id})
        DETACH DELETE c
        RETURN count(c) as deleted
        """
        
        result = self.graph_store._graph.query(query, {"document_id": document_id})
        
        if result.result_set and len(result.result_set) > 0:
            deleted = result.result_set[0][0]
            logger.info(
                "deleted_chunks",
                document_id=document_id,
                count=deleted,
            )
            return deleted
        
        return 0

    def get_chunk_count(self, document_id: str) -> int:
        """Get the number of chunks for a document.
        
        Args:
            document_id: Document ID.
            
        Returns:
            Number of chunks.
        """
        query = """
        MATCH (c:Chunk {document_id: $document_id})
        RETURN count(c) as count
        """
        
        result = self.graph_store._graph.query(query, {"document_id": document_id})
        
        if result.result_set and len(result.result_set) > 0:
            return result.result_set[0][0]
        
        return 0
