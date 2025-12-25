"""Upload service for handling document uploads.

Implements Requirements 1.1-1.7, 5.1-5.5:
- Single document upload with validation
- Batch upload support (up to 20 documents)
- S3 storage and SQS queuing
"""

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional, Any

import boto3
from botocore.exceptions import ClientError

from regulatory_kb.core import get_logger
from regulatory_kb.upload.models import (
    UploadStatus,
    FileType,
    UploadMetadata,
    UploadResponse,
    BatchUploadResponse,
    DocumentUploadResult,
    UploadRecord,
    ValidationResult,
)
from regulatory_kb.upload.validator import FileValidator, MetadataValidator
from regulatory_kb.upload.status_tracker import StatusTracker

logger = get_logger(__name__)

# Maximum documents per batch
MAX_BATCH_SIZE = 20


class UploadService:
    """Service for handling document uploads.
    
    Implements Requirements 1.1-1.7, 5.1-5.5:
    - Validates files and metadata
    - Stores files in S3
    - Queues documents for processing
    - Tracks upload status
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        queue_url: Optional[str] = None,
        status_tracker: Optional[StatusTracker] = None,
        s3_client: Optional[Any] = None,
        sqs_client: Optional[Any] = None,
    ):
        """Initialize upload service.
        
        Args:
            bucket_name: S3 bucket name for document storage
            queue_url: SQS queue URL for processing
            status_tracker: Status tracker instance
            s3_client: Optional S3 client (for testing)
            sqs_client: Optional SQS client (for testing)
        """
        self.bucket_name = bucket_name or os.environ.get(
            "UPLOAD_BUCKET", "regulatory-kb-uploads"
        )
        self.queue_url = queue_url or os.environ.get(
            "UPLOAD_QUEUE_URL", ""
        )
        self.status_tracker = status_tracker or StatusTracker()
        self.file_validator = FileValidator()
        self.metadata_validator = MetadataValidator()
        self._s3_client = s3_client
        self._sqs_client = sqs_client

    @property
    def s3_client(self):
        """Get S3 client."""
        if self._s3_client is None:
            self._s3_client = boto3.client("s3")
        return self._s3_client

    @property
    def sqs_client(self):
        """Get SQS client."""
        if self._sqs_client is None:
            self._sqs_client = boto3.client("sqs")
        return self._sqs_client

    def upload_document(
        self,
        file_content: bytes,
        file_name: str,
        uploader_id: str,
        metadata: Optional[UploadMetadata] = None,
    ) -> tuple[UploadResponse, Optional[int]]:
        """Upload a single document.
        
        Implements Requirements 1.1-1.7:
        - Validates file type and size
        - Stores file in S3
        - Creates status record
        - Queues for processing
        
        Args:
            file_content: Raw file content
            file_name: Original file name
            uploader_id: ID of the uploader
            metadata: Optional metadata
            
        Returns:
            Tuple of (UploadResponse, error_code or None)
        """
        # Validate file
        validation = self.file_validator.validate(file_content, file_name)
        if not validation.valid:
            return (
                UploadResponse(
                    upload_id="",
                    status=UploadStatus.FAILED,
                    message=validation.error_message or "Validation failed",
                ),
                validation.error_code,
            )
        
        # Validate metadata if provided
        if metadata:
            meta_validation = self.metadata_validator.validate(metadata)
            if not meta_validation.valid:
                return (
                    UploadResponse(
                        upload_id="",
                        status=UploadStatus.FAILED,
                        message=meta_validation.error_message or "Metadata validation failed",
                    ),
                    meta_validation.error_code,
                )
        
        # Generate upload ID
        upload_id = str(uuid.uuid4())
        
        # Store file in S3
        s3_key = f"uploads/pending/{upload_id}/original.{validation.file_type.value}"
        try:
            self._store_file(s3_key, file_content, file_name, metadata)
        except ClientError as e:
            logger.error("s3_upload_failed", upload_id=upload_id, error=str(e))
            return (
                UploadResponse(
                    upload_id=upload_id,
                    status=UploadStatus.FAILED,
                    message="Failed to store file",
                ),
                500,
            )
        
        # Create status record
        record = UploadRecord(
            upload_id=upload_id,
            status=UploadStatus.PENDING,
            uploader_id=uploader_id,
            file_name=file_name,
            file_size=validation.file_size,
            file_type=validation.file_type,
            s3_key=s3_key,
            metadata_provided=metadata is not None,
            user_metadata=metadata.model_dump() if metadata else None,
        )
        
        try:
            self.status_tracker.create_record(record)
        except ClientError as e:
            logger.error("status_record_failed", upload_id=upload_id, error=str(e))
            # Continue - file is stored, we can recover
        
        # Queue for processing
        try:
            self._queue_for_processing(upload_id, s3_key, validation.file_type, metadata, uploader_id)
        except ClientError as e:
            logger.error("queue_failed", upload_id=upload_id, error=str(e))
            # Update status to indicate queuing failed
            self.status_tracker.update_status(
                upload_id,
                UploadStatus.FAILED,
                error_details="Failed to queue for processing",
            )
            return (
                UploadResponse(
                    upload_id=upload_id,
                    status=UploadStatus.FAILED,
                    message="Failed to queue for processing",
                ),
                500,
            )
        
        logger.info(
            "document_uploaded",
            upload_id=upload_id,
            file_name=file_name,
            file_size=validation.file_size,
        )
        
        return (
            UploadResponse(
                upload_id=upload_id,
                status=UploadStatus.PENDING,
                message="Document uploaded successfully, processing queued",
            ),
            None,
        )

    def upload_batch(
        self,
        documents: list[dict],
        uploader_id: str,
    ) -> tuple[BatchUploadResponse, Optional[int]]:
        """Upload multiple documents in a batch.
        
        Implements Requirements 5.1-5.5:
        - Accepts up to 20 documents per batch
        - Validates each document independently
        - Accepts valid documents even when others fail
        - Returns batch ID and individual statuses
        
        Args:
            documents: List of document dicts with file_content, file_name, metadata
            uploader_id: ID of the uploader
            
        Returns:
            Tuple of (BatchUploadResponse, error_code or None)
        """
        # Check batch size
        if len(documents) > MAX_BATCH_SIZE:
            return (
                BatchUploadResponse(
                    batch_id="",
                    total_documents=len(documents),
                    accepted=0,
                    rejected=len(documents),
                    documents=[
                        DocumentUploadResult(
                            status="rejected",
                            file_name=doc.get("file_name", "unknown"),
                            error=f"Batch exceeds maximum of {MAX_BATCH_SIZE} documents.",
                        )
                        for doc in documents
                    ],
                ),
                400,
            )
        
        batch_id = str(uuid.uuid4())
        results = []
        accepted = 0
        rejected = 0
        
        for doc in documents:
            file_content = doc.get("file_content", b"")
            file_name = doc.get("file_name", "unknown")
            metadata = doc.get("metadata")
            
            if metadata and isinstance(metadata, dict):
                metadata = UploadMetadata(**metadata)
            
            # Upload individual document
            response, error_code = self.upload_document(
                file_content=file_content,
                file_name=file_name,
                uploader_id=uploader_id,
                metadata=metadata,
            )
            
            if error_code:
                rejected += 1
                results.append(
                    DocumentUploadResult(
                        status="rejected",
                        file_name=file_name,
                        error=response.message,
                    )
                )
            else:
                accepted += 1
                # Update record with batch_id
                self._update_batch_id(response.upload_id, batch_id)
                results.append(
                    DocumentUploadResult(
                        upload_id=response.upload_id,
                        status="pending",
                        file_name=file_name,
                    )
                )
        
        logger.info(
            "batch_uploaded",
            batch_id=batch_id,
            total=len(documents),
            accepted=accepted,
            rejected=rejected,
        )
        
        return (
            BatchUploadResponse(
                batch_id=batch_id,
                total_documents=len(documents),
                accepted=accepted,
                rejected=rejected,
                documents=results,
            ),
            None,
        )

    def _store_file(
        self,
        s3_key: str,
        content: bytes,
        file_name: str,
        metadata: Optional[UploadMetadata],
    ) -> None:
        """Store file in S3.
        
        Args:
            s3_key: S3 object key
            content: File content
            file_name: Original file name
            metadata: Optional metadata
        """
        # Store the file
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=s3_key,
            Body=content,
            Metadata={
                "original_filename": file_name,
            },
        )
        
        # Store metadata alongside if provided
        if metadata:
            metadata_key = s3_key.rsplit("/", 1)[0] + "/metadata.json"
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=metadata_key,
                Body=json.dumps(metadata.model_dump()),
                ContentType="application/json",
            )

    def _queue_for_processing(
        self,
        upload_id: str,
        s3_key: str,
        file_type: FileType,
        metadata: Optional[UploadMetadata],
        uploader_id: str,
    ) -> None:
        """Queue document for processing.
        
        Args:
            upload_id: Upload identifier
            s3_key: S3 object key
            file_type: File type
            metadata: Optional metadata
            uploader_id: Uploader ID
        """
        if not self.queue_url:
            logger.warning("queue_url_not_configured", upload_id=upload_id)
            return
        
        message = {
            "upload_id": upload_id,
            "file_path": f"s3://{self.bucket_name}/{s3_key}",
            "file_type": file_type.value,
            "user_metadata": metadata.model_dump() if metadata else None,
            "uploader_id": uploader_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        self.sqs_client.send_message(
            QueueUrl=self.queue_url,
            MessageBody=json.dumps(message),
            MessageAttributes={
                "upload_id": {
                    "DataType": "String",
                    "StringValue": upload_id,
                },
            },
        )

    def _update_batch_id(self, upload_id: str, batch_id: str) -> None:
        """Update upload record with batch ID.
        
        Args:
            upload_id: Upload identifier
            batch_id: Batch identifier
        """
        try:
            self.status_tracker.table.update_item(
                Key={"upload_id": upload_id},
                UpdateExpression="SET batch_id = :batch_id",
                ExpressionAttributeValues={":batch_id": batch_id},
            )
        except ClientError as e:
            logger.warning(
                "batch_id_update_failed",
                upload_id=upload_id,
                batch_id=batch_id,
                error=str(e),
            )
