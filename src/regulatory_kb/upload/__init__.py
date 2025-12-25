"""Upload module for document upload functionality.

Implements Requirements 1.1-1.7, 2.1-2.6, 4.1-4.5, 5.1-5.5:
- Document upload API with file validation
- Metadata submission and validation
- Upload status tracking
- Batch upload support
"""

from regulatory_kb.upload.models import (
    UploadStatus,
    FileType,
    UploadRequest,
    UploadResponse,
    BatchUploadResponse,
    StatusResponse,
    BatchStatusResponse,
    UploadMetadata,
    ValidationResult,
    UploadRecord,
)
from regulatory_kb.upload.validator import (
    FileValidator,
    MetadataValidator,
    FieldValidationError,
    MetadataValidationResult,
)
from regulatory_kb.upload.service import UploadService
from regulatory_kb.upload.status_tracker import StatusTracker
from regulatory_kb.upload.metadata_handler import (
    MetadataHandler,
    MergedMetadata,
    REQUIRED_METADATA_FIELDS,
)
from regulatory_kb.upload.version_manager import (
    VersionManager,
    VersionRecord,
    ReplacementResult,
    MatchingDocument,
    PreservedRelationship,
)

__all__ = [
    # Models
    "UploadStatus",
    "FileType",
    "UploadRequest",
    "UploadResponse",
    "BatchUploadResponse",
    "StatusResponse",
    "BatchStatusResponse",
    "UploadMetadata",
    "ValidationResult",
    "UploadRecord",
    # Validation
    "FileValidator",
    "MetadataValidator",
    "FieldValidationError",
    "MetadataValidationResult",
    # Metadata handling
    "MetadataHandler",
    "MergedMetadata",
    "REQUIRED_METADATA_FIELDS",
    # Services
    "UploadService",
    "StatusTracker",
    # Version management
    "VersionManager",
    "VersionRecord",
    "ReplacementResult",
    "MatchingDocument",
    "PreservedRelationship",
]
