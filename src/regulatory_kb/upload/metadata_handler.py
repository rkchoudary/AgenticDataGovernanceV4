"""Metadata handling for document uploads.

Implements Requirements 2.4-2.6:
- Auto-extract metadata from document content when not provided
- Merge user-provided and auto-extracted metadata
- User values take precedence over extracted values
- Flag documents with missing required fields
"""

from dataclasses import dataclass, field
from typing import Optional, Any

import structlog

from regulatory_kb.upload.models import UploadMetadata
from regulatory_kb.processing.metadata import (
    MetadataExtractor,
    ExtractedMetadata,
    RegulatorType,
)

logger = structlog.get_logger(__name__)


# Required fields for complete metadata
REQUIRED_METADATA_FIELDS = ["title", "regulator", "category"]


@dataclass
class MergedMetadata:
    """Result of merging user-provided and auto-extracted metadata.
    
    Implements Requirements 2.4-2.6:
    - Contains merged metadata values
    - Tracks which fields came from user vs extraction
    - Flags missing required fields
    """
    title: Optional[str] = None
    regulator: Optional[str] = None
    category: Optional[str] = None
    effective_date: Optional[str] = None
    description: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    
    # Tracking fields
    user_provided_fields: list[str] = field(default_factory=list)
    auto_extracted_fields: list[str] = field(default_factory=list)
    missing_required_fields: list[str] = field(default_factory=list)
    requires_manual_review: bool = False
    extraction_confidence: float = 0.0
    extraction_warnings: list[str] = field(default_factory=list)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "title": self.title,
            "regulator": self.regulator,
            "category": self.category,
            "effective_date": self.effective_date,
            "description": self.description,
            "tags": self.tags,
            "user_provided_fields": self.user_provided_fields,
            "auto_extracted_fields": self.auto_extracted_fields,
            "missing_required_fields": self.missing_required_fields,
            "requires_manual_review": self.requires_manual_review,
            "extraction_confidence": self.extraction_confidence,
        }
    
    def to_upload_metadata(self) -> UploadMetadata:
        """Convert to UploadMetadata model."""
        return UploadMetadata(
            title=self.title,
            regulator=self.regulator,
            category=self.category,
            effective_date=self.effective_date,
            description=self.description,
            tags=self.tags,
        )


class MetadataHandler:
    """Handles metadata extraction, merging, and validation for uploads.
    
    Implements Requirements 2.4-2.6:
    - Auto-extracts metadata when not provided
    - Merges user-provided and auto-extracted metadata
    - User values take precedence over extracted values
    - Flags documents with missing required fields
    """
    
    def __init__(self, extractor: Optional[MetadataExtractor] = None):
        """Initialize metadata handler.
        
        Args:
            extractor: Optional metadata extractor instance
        """
        self.extractor = extractor or MetadataExtractor(use_nlp=False)
    
    def process_metadata(
        self,
        document_text: str,
        user_metadata: Optional[UploadMetadata] = None,
        document_id: Optional[str] = None,
    ) -> MergedMetadata:
        """Process and merge metadata for an uploaded document.
        
        Implements Requirements 2.4-2.6:
        - If no metadata provided, attempts auto-extraction
        - If auto-extraction fails, flags for manual review
        - User-provided values take precedence over extracted
        
        Args:
            document_text: Document text content for extraction
            user_metadata: Optional user-provided metadata
            document_id: Optional document ID for logging
            
        Returns:
            MergedMetadata with combined values and tracking info
        """
        logger.info(
            "processing_metadata",
            document_id=document_id,
            has_user_metadata=user_metadata is not None,
        )
        
        # Extract metadata from document
        extracted = self._extract_metadata(document_text, document_id)
        
        # Merge user-provided and extracted metadata
        merged = self._merge_metadata(user_metadata, extracted)
        
        # Check for missing required fields
        self._check_required_fields(merged)
        
        logger.info(
            "metadata_processed",
            document_id=document_id,
            user_fields=merged.user_provided_fields,
            extracted_fields=merged.auto_extracted_fields,
            missing_fields=merged.missing_required_fields,
            requires_review=merged.requires_manual_review,
        )
        
        return merged
    
    def _extract_metadata(
        self,
        document_text: str,
        document_id: Optional[str] = None,
    ) -> ExtractedMetadata:
        """Extract metadata from document text.
        
        Implements Requirement 2.4:
        - Attempts to auto-extract metadata from document content
        
        Args:
            document_text: Document text content
            document_id: Optional document ID for logging
            
        Returns:
            ExtractedMetadata with extracted values
        """
        try:
            return self.extractor.extract(
                text=document_text,
                document_id=document_id,
            )
        except Exception as e:
            logger.warning(
                "metadata_extraction_failed",
                document_id=document_id,
                error=str(e),
            )
            return ExtractedMetadata(
                warnings=[f"Extraction failed: {str(e)}"],
            )
    
    def _merge_metadata(
        self,
        user_metadata: Optional[UploadMetadata],
        extracted: ExtractedMetadata,
    ) -> MergedMetadata:
        """Merge user-provided and auto-extracted metadata.
        
        Implements Requirement 2.6:
        - User-provided values take precedence over extracted values
        
        Args:
            user_metadata: User-provided metadata (may be None)
            extracted: Auto-extracted metadata
            
        Returns:
            MergedMetadata with combined values
        """
        merged = MergedMetadata(
            extraction_confidence=extracted.confidence_score,
            extraction_warnings=extracted.warnings.copy(),
        )
        
        # Process title
        if user_metadata and user_metadata.title:
            merged.title = user_metadata.title
            merged.user_provided_fields.append("title")
        # Note: ExtractedMetadata doesn't have title, so no fallback
        
        # Process regulator
        if user_metadata and user_metadata.regulator:
            merged.regulator = user_metadata.regulator
            merged.user_provided_fields.append("regulator")
        # Note: ExtractedMetadata doesn't have regulator directly
        
        # Process category
        if user_metadata and user_metadata.category:
            merged.category = user_metadata.category
            merged.user_provided_fields.append("category")
        elif extracted.categories:
            # Use first extracted category
            merged.category = extracted.categories[0].value
            merged.auto_extracted_fields.append("category")
        
        # Process effective_date
        if user_metadata and user_metadata.effective_date:
            merged.effective_date = user_metadata.effective_date
            merged.user_provided_fields.append("effective_date")
        elif extracted.effective_date:
            merged.effective_date = extracted.effective_date.isoformat()
            merged.auto_extracted_fields.append("effective_date")
        
        # Process description
        if user_metadata and user_metadata.description:
            merged.description = user_metadata.description
            merged.user_provided_fields.append("description")
        
        # Process tags
        if user_metadata and user_metadata.tags:
            merged.tags = user_metadata.tags.copy()
            merged.user_provided_fields.append("tags")
        
        return merged
    
    def _check_required_fields(self, merged: MergedMetadata) -> None:
        """Check for missing required fields and flag for review.
        
        Implements Requirement 2.5:
        - Flags documents with missing required fields for manual review
        
        Args:
            merged: MergedMetadata to check (modified in place)
        """
        for field_name in REQUIRED_METADATA_FIELDS:
            value = getattr(merged, field_name, None)
            if not value:
                merged.missing_required_fields.append(field_name)
        
        # Flag for manual review if any required fields are missing
        if merged.missing_required_fields:
            merged.requires_manual_review = True
    
    def merge_with_precedence(
        self,
        user_metadata: Optional[UploadMetadata],
        extracted_metadata: ExtractedMetadata,
    ) -> MergedMetadata:
        """Merge metadata with user values taking precedence.
        
        This is a convenience method that directly merges without
        re-extracting from document text.
        
        Implements Requirement 2.6:
        - User-provided values take precedence over extracted values
        
        Args:
            user_metadata: User-provided metadata
            extracted_metadata: Previously extracted metadata
            
        Returns:
            MergedMetadata with user values taking precedence
        """
        merged = self._merge_metadata(user_metadata, extracted_metadata)
        self._check_required_fields(merged)
        return merged
    
    def flag_for_review(
        self,
        merged: MergedMetadata,
        reason: str,
    ) -> MergedMetadata:
        """Flag metadata for manual review.
        
        Implements Requirement 2.5:
        - Flags documents for manual metadata review
        
        Args:
            merged: MergedMetadata to flag
            reason: Reason for flagging
            
        Returns:
            Updated MergedMetadata with review flag set
        """
        merged.requires_manual_review = True
        merged.extraction_warnings.append(f"Flagged for review: {reason}")
        return merged

    def merge_metadata(
        self,
        user_metadata: Optional[dict | UploadMetadata],
        extracted_metadata: ExtractedMetadata,
    ) -> MergedMetadata:
        """Merge user-provided and extracted metadata.
        
        Convenience method that accepts either dict or UploadMetadata.
        User values take precedence over extracted values.
        
        Args:
            user_metadata: User-provided metadata (dict or UploadMetadata)
            extracted_metadata: Previously extracted metadata
            
        Returns:
            MergedMetadata with user values taking precedence
        """
        # Convert dict to UploadMetadata if needed
        if user_metadata is not None and isinstance(user_metadata, dict):
            user_metadata = UploadMetadata(**user_metadata)
        
        merged = self._merge_metadata(user_metadata, extracted_metadata)
        self._check_required_fields(merged)
        return merged
