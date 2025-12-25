"""Vector search capabilities for regulatory knowledge base.

Implements FalkorDB vector similarity search, text embedding generation,
hybrid search (vector + keyword), and real-time index updates.
"""

import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

from regulatory_kb.models.document import Document
from regulatory_kb.storage.graph_store import FalkorDBStore


class SimilarityMetric(str, Enum):
    """Supported similarity metrics for vector search."""

    COSINE = "cosine"
    EUCLIDEAN = "euclidean"
    DOT_PRODUCT = "dot_product"


class SearchMode(str, Enum):
    """Search modes for hybrid search."""

    VECTOR_ONLY = "vector_only"
    KEYWORD_ONLY = "keyword_only"
    HYBRID = "hybrid"


@dataclass
class VectorSearchConfig:
    """Configuration for vector search."""

    embedding_dimension: int = 1536  # Default for many embedding models
    similarity_metric: SimilarityMetric = SimilarityMetric.COSINE
    index_name: str = "document_embeddings"
    chunk_size: int = 512  # Characters per chunk
    chunk_overlap: int = 50  # Overlap between chunks


@dataclass
class SearchResult:
    """Result from a vector or hybrid search."""

    document_id: str
    title: str
    score: float
    chunk_text: Optional[str] = None
    chunk_index: Optional[int] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class HybridSearchResult:
    """Result from hybrid search combining vector and keyword scores."""

    document_id: str
    title: str
    vector_score: float
    keyword_score: float
    combined_score: float
    matched_keywords: list[str] = field(default_factory=list)
    chunk_text: Optional[str] = None
    metadata: dict[str, Any] = field(default_factory=dict)


# Type alias for embedding function
EmbeddingFunction = Callable[[str], list[float]]


class VectorSearchService:
    """Vector search service for regulatory documents.
    
    Provides:
    - FalkorDB vector similarity search
    - Text embedding generation pipeline
    - Hybrid search (vector + keyword)
    - Real-time index updates for new documents
    """

    def __init__(
        self,
        store: FalkorDBStore,
        config: Optional[VectorSearchConfig] = None,
        embedding_fn: Optional[EmbeddingFunction] = None,
    ):
        """Initialize the vector search service.
        
        Args:
            store: FalkorDB store instance.
            config: Vector search configuration.
            embedding_fn: Function to generate embeddings from text.
                         If not provided, a simple hash-based mock is used.
        """
        self.store = store
        self.config = config or VectorSearchConfig()
        self._embedding_fn = embedding_fn or self._default_embedding_fn

    def _default_embedding_fn(self, text: str) -> list[float]:
        """Default embedding function using hash-based vectors.
        
        This is a placeholder for testing. In production, use a real
        embedding model like Amazon Bedrock Titan Embeddings.
        
        Args:
            text: Text to embed.
            
        Returns:
            List of floats representing the embedding.
        """
        # Create a deterministic pseudo-embedding based on text hash
        text_hash = hashlib.sha256(text.encode()).hexdigest()
        
        # Convert hash to floats
        embedding = []
        for i in range(0, min(len(text_hash), self.config.embedding_dimension * 2), 2):
            byte_val = int(text_hash[i:i+2], 16)
            # Normalize to [-1, 1]
            embedding.append((byte_val - 128) / 128.0)
        
        # Pad or truncate to desired dimension
        while len(embedding) < self.config.embedding_dimension:
            embedding.append(0.0)
        
        return embedding[:self.config.embedding_dimension]

    def set_embedding_function(self, embedding_fn: EmbeddingFunction) -> None:
        """Set a custom embedding function.
        
        Args:
            embedding_fn: Function that takes text and returns embedding vector.
        """
        self._embedding_fn = embedding_fn

    # ==================== Index Management ====================

    def create_vector_index(self) -> bool:
        """Create vector index in FalkorDB.
        
        Creates an index for efficient vector similarity search.
        
        Returns:
            True if index was created successfully.
        """
        # FalkorDB uses a specific syntax for vector indexes
        query = f"""
        CREATE VECTOR INDEX {self.config.index_name}
        FOR (d:Document)
        ON d.embedding
        OPTIONS {{
            dimension: {self.config.embedding_dimension},
            similarityFunction: '{self.config.similarity_metric.value}'
        }}
        """
        
        try:
            self.store.query(query)
            return True
        except Exception:
            # Index may already exist
            return False

    def drop_vector_index(self) -> bool:
        """Drop the vector index.
        
        Returns:
            True if index was dropped successfully.
        """
        query = f"DROP INDEX {self.config.index_name}"
        
        try:
            self.store.query(query)
            return True
        except Exception:
            return False

    # ==================== Embedding Generation ====================

    def generate_embedding(self, text: str) -> list[float]:
        """Generate embedding for text.
        
        Args:
            text: Text to embed.
            
        Returns:
            Embedding vector.
        """
        return self._embedding_fn(text)

    def chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks for embedding.
        
        Args:
            text: Text to chunk.
            
        Returns:
            List of text chunks.
        """
        if not text:
            return []
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + self.config.chunk_size
            chunk = text[start:end]
            
            # Try to break at sentence boundary
            if end < len(text):
                last_period = chunk.rfind(". ")
                if last_period > self.config.chunk_size // 2:
                    chunk = chunk[:last_period + 1]
                    end = start + last_period + 1
            
            chunks.append(chunk.strip())
            start = end - self.config.chunk_overlap
        
        return [c for c in chunks if c]

    def generate_document_embeddings(
        self, document: Document
    ) -> list[tuple[int, list[float]]]:
        """Generate embeddings for all chunks of a document.
        
        Args:
            document: Document to process.
            
        Returns:
            List of (chunk_index, embedding) tuples.
        """
        if not document.content or not document.content.text:
            return []
        
        chunks = self.chunk_text(document.content.text)
        embeddings = []
        
        for i, chunk in enumerate(chunks):
            embedding = self.generate_embedding(chunk)
            embeddings.append((i, embedding))
        
        return embeddings

    # ==================== Index Updates ====================

    def index_document(self, document: Document) -> int:
        """Index a document for vector search.
        
        Generates embeddings for document chunks and stores them.
        
        Args:
            document: Document to index.
            
        Returns:
            Number of chunks indexed.
        """
        if not document.content or not document.content.text:
            return 0
        
        chunks = self.chunk_text(document.content.text)
        
        for i, chunk in enumerate(chunks):
            embedding = self.generate_embedding(chunk)
            
            # Store chunk with embedding
            query = """
            MERGE (c:DocumentChunk {document_id: $doc_id, chunk_index: $chunk_idx})
            SET c.text = $text,
                c.embedding = $embedding,
                c.title = $title
            """
            
            self.store.query(query, {
                "doc_id": document.id,
                "chunk_idx": i,
                "text": chunk,
                "embedding": embedding,
                "title": document.title,
            })
        
        return len(chunks)

    def update_document_index(self, document: Document) -> int:
        """Update index for a modified document.
        
        Removes old chunks and re-indexes.
        
        Args:
            document: Document to update.
            
        Returns:
            Number of chunks indexed.
        """
        # Remove existing chunks
        self.remove_document_from_index(document.id)
        
        # Re-index
        return self.index_document(document)

    def remove_document_from_index(self, document_id: str) -> bool:
        """Remove a document from the vector index.
        
        Args:
            document_id: ID of document to remove.
            
        Returns:
            True if removal was successful.
        """
        query = """
        MATCH (c:DocumentChunk {document_id: $doc_id})
        DELETE c
        """
        
        try:
            self.store.query(query, {"doc_id": document_id})
            return True
        except Exception:
            return False

    # ==================== Vector Search ====================

    def vector_search(
        self,
        query_text: str,
        top_k: int = 10,
        min_score: float = 0.0,
    ) -> list[SearchResult]:
        """Perform vector similarity search.
        
        Args:
            query_text: Text to search for.
            top_k: Maximum number of results.
            min_score: Minimum similarity score threshold.
            
        Returns:
            List of search results ordered by similarity.
        """
        query_embedding = self.generate_embedding(query_text)
        
        # FalkorDB vector search query
        query = """
        CALL db.idx.vector.queryNodes(
            'DocumentChunk',
            'embedding',
            $top_k,
            vecf32($query_embedding)
        ) YIELD node, score
        WHERE score >= $min_score
        RETURN node.document_id as doc_id,
               node.title as title,
               node.text as chunk_text,
               node.chunk_index as chunk_idx,
               score
        ORDER BY score DESC
        """
        
        result = self.store.query(query, {
            "query_embedding": query_embedding,
            "top_k": top_k,
            "min_score": min_score,
        })
        
        results = []
        if result.raw_result and result.raw_result.result_set:
            for row in result.raw_result.result_set:
                results.append(SearchResult(
                    document_id=row[0],
                    title=row[1] or "",
                    chunk_text=row[2],
                    chunk_index=row[3],
                    score=row[4],
                ))
        
        return results

    def find_similar_documents(
        self,
        document_id: str,
        top_k: int = 5,
    ) -> list[SearchResult]:
        """Find documents similar to a given document.
        
        Args:
            document_id: ID of source document.
            top_k: Maximum number of similar documents.
            
        Returns:
            List of similar documents.
        """
        # Get the document's embedding (average of chunk embeddings)
        query = """
        MATCH (c:DocumentChunk {document_id: $doc_id})
        RETURN c.embedding as embedding
        LIMIT 1
        """
        
        result = self.store.query(query, {"doc_id": document_id})
        
        if not result.raw_result or not result.raw_result.result_set:
            return []
        
        doc_embedding = result.raw_result.result_set[0][0]
        
        # Search for similar documents (excluding the source)
        search_query = """
        CALL db.idx.vector.queryNodes(
            'DocumentChunk',
            'embedding',
            $top_k,
            vecf32($embedding)
        ) YIELD node, score
        WHERE node.document_id <> $exclude_id
        RETURN DISTINCT node.document_id as doc_id,
               node.title as title,
               max(score) as max_score
        ORDER BY max_score DESC
        LIMIT $top_k
        """
        
        search_result = self.store.query(search_query, {
            "embedding": doc_embedding,
            "exclude_id": document_id,
            "top_k": top_k * 3,  # Get more to account for duplicates
        })
        
        results = []
        if search_result.raw_result and search_result.raw_result.result_set:
            for row in search_result.raw_result.result_set[:top_k]:
                results.append(SearchResult(
                    document_id=row[0],
                    title=row[1] or "",
                    score=row[2],
                ))
        
        return results

    # ==================== Keyword Search ====================

    def keyword_search(
        self,
        keywords: list[str],
        regulator_id: Optional[str] = None,
        top_k: int = 10,
    ) -> list[SearchResult]:
        """Perform keyword-based search.
        
        Args:
            keywords: Keywords to search for.
            regulator_id: Optional regulator filter.
            top_k: Maximum number of results.
            
        Returns:
            List of search results.
        """
        # Build keyword conditions
        keyword_conditions = " OR ".join([
            f"c.text CONTAINS '{kw}'" for kw in keywords
        ])
        
        regulator_filter = ""
        if regulator_id:
            regulator_filter = f"AND d.regulator_id = '{regulator_id}'"
        
        query = f"""
        MATCH (c:DocumentChunk)
        OPTIONAL MATCH (d:Document {{id: c.document_id}})
        WHERE ({keyword_conditions}) {regulator_filter}
        RETURN c.document_id as doc_id,
               c.title as title,
               c.text as chunk_text,
               c.chunk_index as chunk_idx
        LIMIT $top_k
        """
        
        result = self.store.query(query, {"top_k": top_k})
        
        results = []
        if result.raw_result and result.raw_result.result_set:
            for row in result.raw_result.result_set:
                # Calculate simple keyword match score
                chunk_text = row[2] or ""
                matches = sum(1 for kw in keywords if kw.lower() in chunk_text.lower())
                score = matches / len(keywords) if keywords else 0
                
                results.append(SearchResult(
                    document_id=row[0],
                    title=row[1] or "",
                    chunk_text=chunk_text,
                    chunk_index=row[3],
                    score=score,
                ))
        
        return sorted(results, key=lambda r: r.score, reverse=True)

    # ==================== Hybrid Search ====================

    def hybrid_search(
        self,
        query_text: str,
        keywords: Optional[list[str]] = None,
        mode: SearchMode = SearchMode.HYBRID,
        vector_weight: float = 0.7,
        keyword_weight: float = 0.3,
        top_k: int = 10,
        regulator_id: Optional[str] = None,
    ) -> list[HybridSearchResult]:
        """Perform hybrid search combining vector and keyword search.
        
        Args:
            query_text: Natural language query.
            keywords: Optional explicit keywords (extracted from query if not provided).
            mode: Search mode (vector only, keyword only, or hybrid).
            vector_weight: Weight for vector similarity score.
            keyword_weight: Weight for keyword match score.
            top_k: Maximum number of results.
            regulator_id: Optional regulator filter.
            
        Returns:
            List of hybrid search results.
        """
        if mode == SearchMode.VECTOR_ONLY:
            vector_results = self.vector_search(query_text, top_k)
            return [
                HybridSearchResult(
                    document_id=r.document_id,
                    title=r.title,
                    vector_score=r.score,
                    keyword_score=0.0,
                    combined_score=r.score,
                    chunk_text=r.chunk_text,
                )
                for r in vector_results
            ]
        
        # Extract keywords if not provided
        if keywords is None:
            keywords = self._extract_keywords(query_text)
        
        if mode == SearchMode.KEYWORD_ONLY:
            keyword_results = self.keyword_search(keywords, regulator_id, top_k)
            return [
                HybridSearchResult(
                    document_id=r.document_id,
                    title=r.title,
                    vector_score=0.0,
                    keyword_score=r.score,
                    combined_score=r.score,
                    matched_keywords=[kw for kw in keywords if kw.lower() in (r.chunk_text or "").lower()],
                    chunk_text=r.chunk_text,
                )
                for r in keyword_results
            ]
        
        # Hybrid mode: combine vector and keyword results
        vector_results = self.vector_search(query_text, top_k * 2)
        keyword_results = self.keyword_search(keywords, regulator_id, top_k * 2)
        
        # Merge results
        results_map: dict[str, HybridSearchResult] = {}
        
        for vr in vector_results:
            key = f"{vr.document_id}_{vr.chunk_index}"
            results_map[key] = HybridSearchResult(
                document_id=vr.document_id,
                title=vr.title,
                vector_score=vr.score,
                keyword_score=0.0,
                combined_score=vr.score * vector_weight,
                chunk_text=vr.chunk_text,
            )
        
        for kr in keyword_results:
            key = f"{kr.document_id}_{kr.chunk_index}"
            if key in results_map:
                results_map[key].keyword_score = kr.score
                results_map[key].combined_score = (
                    results_map[key].vector_score * vector_weight
                    + kr.score * keyword_weight
                )
                results_map[key].matched_keywords = [
                    kw for kw in keywords
                    if kw.lower() in (kr.chunk_text or "").lower()
                ]
            else:
                results_map[key] = HybridSearchResult(
                    document_id=kr.document_id,
                    title=kr.title,
                    vector_score=0.0,
                    keyword_score=kr.score,
                    combined_score=kr.score * keyword_weight,
                    matched_keywords=[
                        kw for kw in keywords
                        if kw.lower() in (kr.chunk_text or "").lower()
                    ],
                    chunk_text=kr.chunk_text,
                )
        
        # Sort by combined score and return top_k
        sorted_results = sorted(
            results_map.values(),
            key=lambda r: r.combined_score,
            reverse=True,
        )
        
        return sorted_results[:top_k]

    def _extract_keywords(self, text: str) -> list[str]:
        """Extract keywords from text for keyword search.
        
        Simple extraction based on word frequency and regulatory terms.
        
        Args:
            text: Text to extract keywords from.
            
        Returns:
            List of keywords.
        """
        # Regulatory domain keywords to prioritize
        regulatory_terms = {
            "ccar", "dfast", "lcr", "nsfr", "basel", "capital", "liquidity",
            "stress", "test", "requirement", "regulation", "cfr", "frb",
            "occ", "fdic", "fincen", "osfi", "fintrac", "aml", "bsa",
            "reporting", "compliance", "risk", "model", "resolution",
        }
        
        # Tokenize and filter
        words = text.lower().split()
        words = [w.strip(".,;:!?()[]{}\"'") for w in words]
        words = [w for w in words if len(w) > 2]
        
        # Prioritize regulatory terms
        keywords = []
        for word in words:
            if word in regulatory_terms:
                keywords.append(word)
        
        # Add other significant words (simple heuristic)
        for word in words:
            if word not in keywords and len(word) > 4:
                keywords.append(word)
                if len(keywords) >= 10:
                    break
        
        return keywords[:10]

    # ==================== Batch Operations ====================

    def batch_index_documents(
        self,
        documents: list[Document],
        batch_size: int = 10,
    ) -> dict[str, int]:
        """Index multiple documents in batches.
        
        Args:
            documents: Documents to index.
            batch_size: Number of documents per batch.
            
        Returns:
            Dictionary mapping document IDs to chunk counts.
        """
        results = {}
        
        for i in range(0, len(documents), batch_size):
            batch = documents[i:i + batch_size]
            for doc in batch:
                chunk_count = self.index_document(doc)
                results[doc.id] = chunk_count
        
        return results

    def get_index_stats(self) -> dict[str, Any]:
        """Get statistics about the vector index.
        
        Returns:
            Dictionary with index statistics.
        """
        query = """
        MATCH (c:DocumentChunk)
        RETURN count(c) as chunk_count,
               count(DISTINCT c.document_id) as document_count
        """
        
        result = self.store.query(query)
        
        stats = {
            "chunk_count": 0,
            "document_count": 0,
            "embedding_dimension": self.config.embedding_dimension,
            "similarity_metric": self.config.similarity_metric.value,
        }
        
        if result.raw_result and result.raw_result.result_set:
            row = result.raw_result.result_set[0]
            stats["chunk_count"] = row[0]
            stats["document_count"] = row[1]
        
        return stats
