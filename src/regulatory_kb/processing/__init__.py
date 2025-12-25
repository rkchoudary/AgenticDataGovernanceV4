"""Document processing module for parsing, metadata extraction, and validation."""

from regulatory_kb.processing.parser import (
    DocumentParser,
    DocumentFormat,
    ParsedDocument,
    ParsedSection,
    ParsedTable,
)
from regulatory_kb.processing.metadata import (
    MetadataExtractor,
    ExtractedMetadata,
    RegulatorType,
)
from regulatory_kb.processing.validation import (
    ContentValidator,
    ValidationResult,
    ValidationIssue,
    ValidationSeverity,
    ValidationCategory,
    ReferentialIntegrityChecker,
)
from regulatory_kb.processing.quality import (
    DocumentQuarantine,
    QuarantinedDocument,
    QuarantineReason,
    DocumentStatus,
    QualityScorer,
    QualityScore,
    GraphIntegrityChecker,
    IntegrityIssue,
    DataConsistencyValidator,
    ManualReviewQueue,
)
from regulatory_kb.processing.chunker import (
    DocumentChunker,
    DocumentChunk,
    ChunkType,
    ChunkerConfig,
    ChunkContext,
)

__all__ = [
    # Parser
    "DocumentParser",
    "DocumentFormat",
    "ParsedDocument",
    "ParsedSection",
    "ParsedTable",
    # Metadata
    "MetadataExtractor",
    "ExtractedMetadata",
    "RegulatorType",
    # Validation
    "ContentValidator",
    "ValidationResult",
    "ValidationIssue",
    "ValidationSeverity",
    "ValidationCategory",
    "ReferentialIntegrityChecker",
    # Quality
    "DocumentQuarantine",
    "QuarantinedDocument",
    "QuarantineReason",
    "DocumentStatus",
    "QualityScorer",
    "QualityScore",
    "GraphIntegrityChecker",
    "IntegrityIssue",
    "DataConsistencyValidator",
    "ManualReviewQueue",
    # Chunker
    "DocumentChunker",
    "DocumentChunk",
    "ChunkType",
    "ChunkerConfig",
    "ChunkContext",
]
