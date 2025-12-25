"""Data models for document upload functionality.

Implements Requirements 1.1-1.7, 2.1-2.6, 4.1-4.5, 5.1-5.5:
- Upload request/response models
- Status tracking models
- Metadata validation models
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field


class UploadStatus(str, Enum):
    """Status of an uploaded document."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class FileType(str, Enum):
    """Supported file types for upload."""
    PDF = "pdf"
    HTML = "html"


class Regulator(str, Enum):
    """Known regulators for metadata validation."""
    FED = "Fed"
    OCC = "OCC"
    FDIC = "FDIC"
    FINCEN = "FinCEN"
    OSFI = "OSFI"
    FINTRAC = "FINTRAC"
    OTHER = "Other"


class Category(str, Enum):
    """Known categories for metadata validation."""
    CAPITAL_REQUIREMENTS = "capital-requirements"
    LIQUIDITY_REPORTING = "liquidity-reporting"
    AML_COMPLIANCE = "aml-compliance"
    STRESS_TESTING = "stress-testing"
    RESOLUTION_PLANNING = "resolution-planning"
    MODEL_RISK_MANAGEMENT = "model-risk-management"
    OTHER = "other"


class UploadMetadata(BaseModel):
    """Optional metadata provided with upload.
    
    Implements Requirements 2.1-2.3:
    - Optional title, regulator, category, effective_date
    - Regulator validation against known values
    - Category validation against known values
    """
    title: Optional[str] = Field(None, description="Document title")
    regulator: Optional[str] = Field(None, description="Regulator (Fed, OCC, FDIC, FinCEN, OSFI, FINTRAC, Other)")
    category: Optional[str] = Field(None, description="Document category")
    effective_date: Optional[str] = Field(None, description="Effective date (YYYY-MM-DD)")
    description: Optional[str] = Field(None, description="Optional description")
    tags: list[str] = Field(default_factory=list, description="Optional tags")


class ValidationResult(BaseModel):
    """Result of file or metadata validation."""
    valid: bool = Field(..., description="Whether validation passed")
    error_code: Optional[int] = Field(None, description="HTTP error code if invalid")
    error_message: Optional[str] = Field(None, description="Error message if invalid")
    file_type: Optional[FileType] = Field(None, description="Detected file type")
    file_size: Optional[int] = Field(None, description="File size in bytes")


class UploadRequest(BaseModel):
    """Request model for document upload."""
    file_name: str = Field(..., description="Original file name")
    file_content: bytes = Field(..., description="File content")
    metadata: Optional[UploadMetadata] = Field(None, description="Optional metadata")
    uploader_id: str = Field(..., description="ID of the uploader")


class UploadResponse(BaseModel):
    """Response model for single document upload.
    
    Implements Requirements 1.6, 4.1:
    - Returns unique document ID
    - Returns initial status
    """
    upload_id: str = Field(..., description="Unique upload identifier")
    status: UploadStatus = Field(..., description="Current status")
    message: str = Field(..., description="Status message")
    estimated_processing_time: str = Field(default="2-5 minutes", description="Estimated processing time")


class DocumentUploadResult(BaseModel):
    """Result for a single document in batch upload."""
    upload_id: Optional[str] = Field(None, description="Upload ID if accepted")
    status: str = Field(..., description="Status (pending or rejected)")
    file_name: str = Field(..., description="Original file name")
    error: Optional[str] = Field(None, description="Error message if rejected")


class BatchUploadResponse(BaseModel):
    """Response model for batch document upload.
    
    Implements Requirements 5.1-5.4:
    - Returns batch ID and individual document IDs
    - Shows accepted/rejected counts
    - Individual document statuses
    """
    batch_id: str = Field(..., description="Unique batch identifier")
    total_documents: int = Field(..., description="Total documents submitted")
    accepted: int = Field(..., description="Number of accepted documents")
    rejected: int = Field(..., description="Number of rejected documents")
    documents: list[DocumentUploadResult] = Field(..., description="Individual document results")


class StatusResponse(BaseModel):
    """Response model for upload status query.
    
    Implements Requirements 4.2-4.4:
    - Returns status (pending, processing, completed, failed)
    - Error details for failed status
    - KB document ID and metadata for completed status
    """
    upload_id: str = Field(..., description="Upload identifier")
    status: UploadStatus = Field(..., description="Current status")
    created_at: datetime = Field(..., description="Upload timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    kb_document_id: Optional[str] = Field(None, description="Knowledge base document ID if completed")
    metadata: Optional[dict[str, Any]] = Field(None, description="Document metadata")
    error_details: Optional[str] = Field(None, description="Error details if failed")
    processing_stage: Optional[str] = Field(None, description="Current processing stage")


class BatchStatusResponse(BaseModel):
    """Response model for batch status query.
    
    Implements Requirement 5.5:
    - Aggregate batch status
    - Individual document statuses
    """
    batch_id: str = Field(..., description="Batch identifier")
    total_documents: int = Field(..., description="Total documents in batch")
    pending: int = Field(..., description="Documents pending")
    processing: int = Field(..., description="Documents processing")
    completed: int = Field(..., description="Documents completed")
    failed: int = Field(..., description="Documents failed")
    documents: list[StatusResponse] = Field(..., description="Individual document statuses")


class UploadRecord(BaseModel):
    """Database record for upload tracking.
    
    Implements Requirements 4.1-4.5:
    - Tracks upload through processing pipeline
    - Stores error details for failures
    - Links to KB document on completion
    """
    upload_id: str = Field(..., description="Unique upload identifier")
    status: UploadStatus = Field(default=UploadStatus.PENDING, description="Current status")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    uploader_id: str = Field(..., description="ID of the uploader")
    file_name: str = Field(..., description="Original file name")
    file_size: int = Field(..., description="File size in bytes")
    file_type: FileType = Field(..., description="File type")
    s3_key: str = Field(..., description="S3 object key")
    metadata_provided: bool = Field(default=False, description="Whether metadata was provided")
    user_metadata: Optional[dict[str, Any]] = Field(None, description="User-provided metadata")
    processing_stage: Optional[str] = Field(None, description="Current processing stage")
    kb_document_id: Optional[str] = Field(None, description="KB document ID if completed")
    error_details: Optional[str] = Field(None, description="Error details if failed")
    batch_id: Optional[str] = Field(None, description="Batch ID if part of batch upload")
    ttl: Optional[int] = Field(None, description="TTL timestamp for DynamoDB")

    def to_dynamo_item(self) -> dict[str, Any]:
        """Convert to DynamoDB item format."""
        item = {
            "upload_id": self.upload_id,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "uploader_id": self.uploader_id,
            "file_name": self.file_name,
            "file_size": self.file_size,
            "file_type": self.file_type.value,
            "s3_key": self.s3_key,
            "metadata_provided": self.metadata_provided,
        }
        if self.completed_at:
            item["completed_at"] = self.completed_at.isoformat()
        if self.user_metadata:
            item["user_metadata"] = self.user_metadata
        if self.processing_stage:
            item["processing_stage"] = self.processing_stage
        if self.kb_document_id:
            item["kb_document_id"] = self.kb_document_id
        if self.error_details:
            item["error_details"] = self.error_details
        if self.batch_id:
            item["batch_id"] = self.batch_id
        if self.ttl:
            item["ttl"] = self.ttl
        return item

    @classmethod
    def from_dynamo_item(cls, item: dict[str, Any]) -> "UploadRecord":
        """Create from DynamoDB item."""
        completed_at = None
        if item.get("completed_at"):
            completed_at = datetime.fromisoformat(item["completed_at"])
        
        return cls(
            upload_id=item["upload_id"],
            status=UploadStatus(item["status"]),
            created_at=datetime.fromisoformat(item["created_at"]),
            updated_at=datetime.fromisoformat(item["updated_at"]),
            completed_at=completed_at,
            uploader_id=item["uploader_id"],
            file_name=item["file_name"],
            file_size=item["file_size"],
            file_type=FileType(item["file_type"]),
            s3_key=item["s3_key"],
            metadata_provided=item.get("metadata_provided", False),
            user_metadata=item.get("user_metadata"),
            processing_stage=item.get("processing_stage"),
            kb_document_id=item.get("kb_document_id"),
            error_details=item.get("error_details"),
            batch_id=item.get("batch_id"),
            ttl=item.get("ttl"),
        )
