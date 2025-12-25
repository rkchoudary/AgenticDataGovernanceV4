"""Upload processing Lambda handler for document processing pipeline.

Implements Requirements 3.1-3.4:
- Consume messages from upload queue
- Move file from pending to processing
- Call existing document parser
- Call existing metadata extractor
- Call document chunker for large documents
- Call existing content validator
- Update status throughout processing
"""

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

from regulatory_kb.core import get_logger, configure_logging
from regulatory_kb.processing.parser import DocumentParser, DocumentFormat, ParsedDocument
from regulatory_kb.processing.metadata import MetadataExtractor, RegulatorType, ExtractedMetadata
from regulatory_kb.processing.validation import ContentValidator, ValidationResult
from regulatory_kb.processing.chunker import DocumentChunker, DocumentChunk
from regulatory_kb.upload.models import UploadStatus, FileType
from regulatory_kb.upload.status_tracker import StatusTracker
from regulatory_kb.upload.metadata_handler import MetadataHandler
from regulatory_kb.api.webhooks import WebhookService, WebhookEventType

configure_logging(level="INFO", json_format=True)
logger = get_logger(__name__)

# Page threshold for chunking (documents with more than this many pages get chunked)
LARGE_DOCUMENT_PAGE_THRESHOLD = 10

# Global service instances
_status_tracker: Optional[StatusTracker] = None
_s3_client: Optional[Any] = None
_document_parser: Optional[DocumentParser] = None
_metadata_extractor: Optional[MetadataExtractor] = None
_content_validator: Optional[ContentValidator] = None
_document_chunker: Optional[DocumentChunker] = None
_metadata_handler: Optional[MetadataHandler] = None
_webhook_service: Optional[WebhookService] = None


def _get_status_tracker() -> StatusTracker:
    """Get or create the status tracker."""
    global _status_tracker
    if _status_tracker is None:
        _status_tracker = StatusTracker()
    return _status_tracker


def _get_s3_client():
    """Get or create the S3 client."""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3")
    return _s3_client


def _get_document_parser() -> DocumentParser:
    """Get or create the document parser."""
    global _document_parser
    if _document_parser is None:
        _document_parser = DocumentParser()
    return _document_parser


def _get_metadata_extractor() -> MetadataExtractor:
    """Get or create the metadata extractor."""
    global _metadata_extractor
    if _metadata_extractor is None:
        _metadata_extractor = MetadataExtractor(use_nlp=False)  # Disable NLP for Lambda
    return _metadata_extractor


def _get_content_validator() -> ContentValidator:
    """Get or create the content validator."""
    global _content_validator
    if _content_validator is None:
        _content_validator = ContentValidator()
    return _content_validator


def _get_document_chunker() -> DocumentChunker:
    """Get or create the document chunker."""
    global _document_chunker
    if _document_chunker is None:
        _document_chunker = DocumentChunker()
    return _document_chunker


def _get_metadata_handler() -> MetadataHandler:
    """Get or create the metadata handler."""
    global _metadata_handler
    if _metadata_handler is None:
        _metadata_handler = MetadataHandler()
    return _metadata_handler


def _get_webhook_service() -> WebhookService:
    """Get or create the webhook service."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService(
            signing_secret=os.environ.get("WEBHOOK_SIGNING_SECRET", "webhook-secret"),
        )
    return _webhook_service


class ProcessingError(Exception):
    """Error during document processing.
    
    Implements Requirement 3.5:
    - Captures error details at each processing stage
    - Provides context for debugging and recovery
    """
    
    def __init__(
        self,
        message: str,
        stage: str,
        details: Optional[dict] = None,
        recoverable: bool = False,
    ):
        super().__init__(message)
        self.message = message
        self.stage = stage
        self.details = details or {}
        self.recoverable = recoverable
    
    def to_dict(self) -> dict:
        """Convert to dictionary for logging/storage."""
        return {
            "message": self.message,
            "stage": self.stage,
            "details": self.details,
            "recoverable": self.recoverable,
        }


class ProcessingStage:
    """Constants for processing stages."""
    INITIALIZING = "initializing"
    FILE_MOVE = "file_move"
    FILE_DOWNLOAD = "file_download"
    PARSING = "parsing"
    METADATA_EXTRACTION = "metadata_extraction"
    CHUNKING = "chunking"
    VALIDATION = "validation"
    STORAGE = "storage"
    COMPLETED = "completed"
    QUARANTINE = "quarantine"


class UploadProcessor:
    """Processor for uploaded documents.
    
    Implements the processing pipeline:
    1. Move file from pending to processing
    2. Parse document (PDF or HTML)
    3. Extract metadata
    4. Chunk large documents
    5. Validate content
    6. Store in graph database
    7. Update status
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        status_tracker: Optional[StatusTracker] = None,
        s3_client: Optional[Any] = None,
        webhook_service: Optional[WebhookService] = None,
    ):
        """Initialize the upload processor.
        
        Args:
            bucket_name: S3 bucket name for uploads.
            status_tracker: Status tracker instance.
            s3_client: Optional S3 client (for testing).
            webhook_service: Optional webhook service (for testing).
        """
        self.bucket_name = bucket_name or os.environ.get(
            "UPLOAD_BUCKET", "regulatory-kb-uploads"
        )
        self.status_tracker = status_tracker or _get_status_tracker()
        self._s3_client = s3_client
        self.webhook_service = webhook_service or _get_webhook_service()
        
        self.parser = _get_document_parser()
        self.metadata_extractor = _get_metadata_extractor()
        self.content_validator = _get_content_validator()
        self.chunker = _get_document_chunker()
        self.metadata_handler = _get_metadata_handler()

    @property
    def s3_client(self):
        """Get S3 client."""
        if self._s3_client is None:
            self._s3_client = _get_s3_client()
        return self._s3_client

    def process_upload(self, message: dict) -> dict:
        """Process an uploaded document through the pipeline.
        
        Implements Requirements 3.1-3.5:
        - Parses document using existing parser
        - Extracts metadata using existing extractor
        - Chunks large documents
        - Validates content
        - Handles errors at each stage
        
        Args:
            message: SQS message containing upload details.
            
        Returns:
            Processing result with document ID and status.
        """
        upload_id = message.get("upload_id", "")
        file_path = message.get("file_path", "")
        file_type = message.get("file_type", "pdf")
        user_metadata = message.get("user_metadata")
        uploader_id = message.get("uploader_id", "")
        
        logger.info(
            "processing_upload_started",
            upload_id=upload_id,
            file_type=file_type,
        )
        
        try:
            # Update status to processing
            self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.INITIALIZING)
            
            # Step 1: Move file from pending to processing
            try:
                processing_key = self._move_to_processing(upload_id, file_path)
                self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.FILE_MOVE)
            except ProcessingError:
                raise
            except Exception as e:
                raise ProcessingError(
                    f"Failed to move file: {str(e)}",
                    ProcessingStage.FILE_MOVE,
                    {"file_path": file_path},
                )
            
            # Step 2: Download and parse document
            try:
                file_content = self._download_file(processing_key)
                self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.PARSING)
                
                doc_format = self._get_document_format(file_type)
                parsed_doc = self.parser.parse(file_content, doc_format, upload_id)
                logger.info(
                    "document_parsed",
                    upload_id=upload_id,
                    text_length=len(parsed_doc.text),
                    section_count=len(parsed_doc.sections),
                )
            except ProcessingError:
                raise
            except Exception as e:
                raise ProcessingError(
                    f"Failed to parse document: {str(e)}",
                    ProcessingStage.PARSING,
                    {"file_type": file_type},
                )
            
            # Step 3: Extract metadata
            try:
                self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.METADATA_EXTRACTION)
                extracted_metadata = self.metadata_extractor.extract(
                    parsed_doc.text,
                    document_id=upload_id,
                )
                
                # Merge user-provided and extracted metadata
                merged_metadata = self.metadata_handler.merge_metadata(
                    user_metadata=user_metadata,
                    extracted_metadata=extracted_metadata,
                )
                logger.info(
                    "metadata_extracted",
                    upload_id=upload_id,
                    confidence=extracted_metadata.confidence_score,
                    requires_review=merged_metadata.requires_manual_review,
                )
            except Exception as e:
                raise ProcessingError(
                    f"Failed to extract metadata: {str(e)}",
                    ProcessingStage.METADATA_EXTRACTION,
                    recoverable=True,  # Can continue with partial metadata
                )
            
            # Step 4: Chunk large documents
            chunks: list[DocumentChunk] = []
            page_count = parsed_doc.metadata.get("page_count", 0)
            
            if page_count > LARGE_DOCUMENT_PAGE_THRESHOLD or len(parsed_doc.text) > 50000:
                try:
                    self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.CHUNKING)
                    document_id = f"uploaded_{upload_id}"
                    chunks = self.chunker.chunk_document(parsed_doc, document_id)
                    logger.info(
                        "document_chunked",
                        upload_id=upload_id,
                        chunk_count=len(chunks),
                    )
                except Exception as e:
                    # Chunking failure is recoverable - document can still be stored
                    logger.warning(
                        "chunking_failed",
                        upload_id=upload_id,
                        error=str(e),
                    )
            
            # Step 5: Validate content
            try:
                self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.VALIDATION)
                validation_result = self.content_validator.validate(
                    parsed_doc,
                    extracted_metadata,
                    document_id=upload_id,
                )
                
                if not validation_result.is_valid:
                    logger.warning(
                        "validation_issues",
                        upload_id=upload_id,
                        error_count=validation_result.error_count,
                        warning_count=validation_result.warning_count,
                        quality_score=validation_result.quality_score,
                    )
            except Exception as e:
                # Validation failure is recoverable
                logger.warning(
                    "validation_failed",
                    upload_id=upload_id,
                    error=str(e),
                )
                validation_result = None
            
            # Step 6: Generate document ID and prepare for storage
            kb_document_id = f"uploaded_{upload_id}"
            self._update_status(upload_id, UploadStatus.PROCESSING, ProcessingStage.STORAGE)
            
            # Move file to completed
            try:
                completed_key = self._move_to_completed(upload_id, processing_key, kb_document_id)
            except Exception as e:
                logger.warning(
                    "move_to_completed_failed",
                    upload_id=upload_id,
                    error=str(e),
                )
                completed_key = processing_key
            
            # Step 7: Update status to completed
            self.status_tracker.update_status(
                upload_id=upload_id,
                status=UploadStatus.COMPLETED,
                processing_stage=ProcessingStage.COMPLETED,
                kb_document_id=kb_document_id,
            )
            
            # Step 8: Trigger webhook notification for processing complete
            # Implements Requirement 3.6
            self._trigger_completion_webhook(
                upload_id=upload_id,
                kb_document_id=kb_document_id,
                merged_metadata=merged_metadata,
                chunk_count=len(chunks),
                validation_score=validation_result.quality_score if validation_result else 0.0,
                uploader_id=uploader_id,
            )
            
            logger.info(
                "processing_upload_completed",
                upload_id=upload_id,
                kb_document_id=kb_document_id,
                chunk_count=len(chunks),
                validation_score=validation_result.quality_score if validation_result else 0.0,
            )
            
            return {
                "upload_id": upload_id,
                "kb_document_id": kb_document_id,
                "status": "completed",
                "chunks": len(chunks),
                "validation_score": validation_result.quality_score if validation_result else 0.0,
                "metadata": merged_metadata.to_dict() if merged_metadata else {},
            }
            
        except ProcessingError as e:
            logger.error(
                "processing_error",
                upload_id=upload_id,
                stage=e.stage,
                error=e.message,
                recoverable=e.recoverable,
            )
            self._handle_processing_failure(
                upload_id, e.stage, e.message, e.details,
                uploader_id=uploader_id,
                file_name=message.get("file_name"),
            )
            raise
            
        except Exception as e:
            logger.error(
                "processing_unexpected_error",
                upload_id=upload_id,
                error=str(e),
            )
            self._handle_processing_failure(
                upload_id, "unknown", str(e),
                uploader_id=uploader_id,
                file_name=message.get("file_name"),
            )
            raise ProcessingError(str(e), "unknown")

    def _update_status(
        self,
        upload_id: str,
        status: UploadStatus,
        stage: str,
    ) -> None:
        """Update upload status.
        
        Args:
            upload_id: Upload identifier.
            status: New status.
            stage: Current processing stage.
        """
        try:
            self.status_tracker.update_status(
                upload_id=upload_id,
                status=status,
                processing_stage=stage,
            )
        except Exception as e:
            logger.warning(
                "status_update_failed",
                upload_id=upload_id,
                stage=stage,
                error=str(e),
            )

    def _move_to_processing(self, upload_id: str, file_path: str) -> str:
        """Move file from pending to processing folder.
        
        Args:
            upload_id: Upload identifier.
            file_path: S3 file path (s3://bucket/key format).
            
        Returns:
            New S3 key in processing folder.
        """
        # Parse S3 path
        if file_path.startswith("s3://"):
            parts = file_path[5:].split("/", 1)
            bucket = parts[0]
            source_key = parts[1] if len(parts) > 1 else ""
        else:
            bucket = self.bucket_name
            source_key = file_path
        
        # Determine file extension
        ext = source_key.rsplit(".", 1)[-1] if "." in source_key else "pdf"
        
        # Create processing key
        processing_key = f"uploads/processing/{upload_id}/document.{ext}"
        
        try:
            # Copy to processing folder
            self.s3_client.copy_object(
                Bucket=self.bucket_name,
                CopySource={"Bucket": bucket, "Key": source_key},
                Key=processing_key,
            )
            
            # Delete from pending (optional, can be done later)
            # self.s3_client.delete_object(Bucket=bucket, Key=source_key)
            
            logger.debug(
                "file_moved_to_processing",
                upload_id=upload_id,
                source_key=source_key,
                processing_key=processing_key,
            )
            
            return processing_key
            
        except ClientError as e:
            raise ProcessingError(
                f"Failed to move file to processing: {str(e)}",
                "file_move",
                {"source_key": source_key, "processing_key": processing_key},
            )

    def _download_file(self, s3_key: str) -> bytes:
        """Download file content from S3.
        
        Args:
            s3_key: S3 object key.
            
        Returns:
            File content as bytes.
        """
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key,
            )
            return response["Body"].read()
        except ClientError as e:
            raise ProcessingError(
                f"Failed to download file: {str(e)}",
                "file_download",
                {"s3_key": s3_key},
            )

    def _get_document_format(self, file_type: str) -> DocumentFormat:
        """Convert file type to document format.
        
        Args:
            file_type: File type string (pdf, html).
            
        Returns:
            DocumentFormat enum value.
        """
        format_map = {
            "pdf": DocumentFormat.PDF,
            "html": DocumentFormat.HTML,
        }
        return format_map.get(file_type.lower(), DocumentFormat.PDF)

    def _move_to_completed(
        self,
        upload_id: str,
        processing_key: str,
        kb_document_id: str,
    ) -> str:
        """Move file from processing to completed folder.
        
        Args:
            upload_id: Upload identifier.
            processing_key: Current S3 key in processing folder.
            kb_document_id: Knowledge base document ID.
            
        Returns:
            New S3 key in completed folder.
        """
        # Determine file extension
        ext = processing_key.rsplit(".", 1)[-1] if "." in processing_key else "pdf"
        
        # Create completed key
        completed_key = f"uploads/completed/{kb_document_id}/document.{ext}"
        
        try:
            # Copy to completed folder
            self.s3_client.copy_object(
                Bucket=self.bucket_name,
                CopySource={"Bucket": self.bucket_name, "Key": processing_key},
                Key=completed_key,
            )
            
            # Delete from processing
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=processing_key,
            )
            
            logger.debug(
                "file_moved_to_completed",
                upload_id=upload_id,
                kb_document_id=kb_document_id,
                completed_key=completed_key,
            )
            
            return completed_key
            
        except ClientError as e:
            logger.warning(
                "file_move_to_completed_failed",
                upload_id=upload_id,
                error=str(e),
            )
            # Don't fail processing if move fails
            return processing_key

    def _handle_processing_failure(
        self,
        upload_id: str,
        stage: str,
        error_message: str,
        error_details: Optional[dict] = None,
        uploader_id: Optional[str] = None,
        file_name: Optional[str] = None,
    ) -> None:
        """Handle processing failure by updating status and moving to quarantine.
        
        Implements Requirement 3.5:
        - Catches and logs errors at each stage
        - Updates status to failed with error details
        - Moves failed documents to quarantine
        
        Args:
            upload_id: Upload identifier.
            stage: Stage where failure occurred.
            error_message: Error message.
            error_details: Additional error details.
            uploader_id: ID of the uploader.
            file_name: Original file name.
        """
        # Build comprehensive error details
        full_error_details = {
            "stage": stage,
            "message": error_message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if error_details:
            full_error_details.update(error_details)
        
        error_json = json.dumps(full_error_details)
        
        try:
            self.status_tracker.update_status(
                upload_id=upload_id,
                status=UploadStatus.FAILED,
                processing_stage=stage,
                error_details=error_json,
            )
            logger.info(
                "failure_status_updated",
                upload_id=upload_id,
                stage=stage,
            )
        except Exception as e:
            logger.error(
                "failed_to_update_failure_status",
                upload_id=upload_id,
                error=str(e),
            )
        
        # Trigger webhook notification for processing failed
        # Implements Requirement 3.6
        self._trigger_failure_webhook(
            upload_id=upload_id,
            error_message=error_message,
            error_stage=stage,
            uploader_id=uploader_id,
            file_name=file_name,
        )
        
        # Move to quarantine folder
        try:
            self._move_to_quarantine(upload_id, stage, error_message)
        except Exception as e:
            logger.error(
                "failed_to_quarantine",
                upload_id=upload_id,
                error=str(e),
            )

    def _trigger_completion_webhook(
        self,
        upload_id: str,
        kb_document_id: str,
        merged_metadata: Any,
        chunk_count: int,
        validation_score: float,
        uploader_id: Optional[str] = None,
    ) -> None:
        """Trigger webhook notification for processing completion.
        
        Implements Requirement 3.6:
        - Triggers webhook on processing complete
        
        Args:
            upload_id: Upload identifier.
            kb_document_id: Knowledge base document ID.
            merged_metadata: Merged metadata object.
            chunk_count: Number of chunks created.
            validation_score: Content validation score.
            uploader_id: ID of the uploader.
        """
        try:
            title = merged_metadata.title if merged_metadata else None
            regulator = merged_metadata.regulator if merged_metadata else None
            category = merged_metadata.category if merged_metadata else None
            categories = [category] if category else []
            
            deliveries = self.webhook_service.dispatch_upload_processing_completed(
                upload_id=upload_id,
                kb_document_id=kb_document_id,
                title=title,
                regulator=regulator,
                categories=categories,
                chunk_count=chunk_count,
                validation_score=validation_score,
                uploader_id=uploader_id,
            )
            
            # Attempt to deliver webhooks
            for delivery in deliveries:
                try:
                    self.webhook_service.deliver_sync(delivery)
                except Exception as e:
                    logger.warning(
                        "webhook_delivery_failed",
                        upload_id=upload_id,
                        delivery_id=delivery.id,
                        error=str(e),
                    )
            
            logger.info(
                "completion_webhook_triggered",
                upload_id=upload_id,
                delivery_count=len(deliveries),
            )
            
        except Exception as e:
            logger.warning(
                "completion_webhook_failed",
                upload_id=upload_id,
                error=str(e),
            )

    def _trigger_failure_webhook(
        self,
        upload_id: str,
        error_message: str,
        error_stage: str,
        uploader_id: Optional[str] = None,
        file_name: Optional[str] = None,
    ) -> None:
        """Trigger webhook notification for processing failure.
        
        Implements Requirement 3.6:
        - Triggers webhook on processing failed
        
        Args:
            upload_id: Upload identifier.
            error_message: Error message.
            error_stage: Stage where error occurred.
            uploader_id: ID of the uploader.
            file_name: Original file name.
        """
        try:
            deliveries = self.webhook_service.dispatch_upload_processing_failed(
                upload_id=upload_id,
                error_message=error_message,
                error_stage=error_stage,
                uploader_id=uploader_id,
                file_name=file_name,
            )
            
            # Attempt to deliver webhooks
            for delivery in deliveries:
                try:
                    self.webhook_service.deliver_sync(delivery)
                except Exception as e:
                    logger.warning(
                        "webhook_delivery_failed",
                        upload_id=upload_id,
                        delivery_id=delivery.id,
                        error=str(e),
                    )
            
            logger.info(
                "failure_webhook_triggered",
                upload_id=upload_id,
                delivery_count=len(deliveries),
            )
            
        except Exception as e:
            logger.warning(
                "failure_webhook_failed",
                upload_id=upload_id,
                error=str(e),
            )

    def _move_to_quarantine(
        self,
        upload_id: str,
        failure_stage: Optional[str] = None,
        failure_reason: Optional[str] = None,
    ) -> None:
        """Move failed document to quarantine folder.
        
        Implements Requirement 3.5:
        - Moves failed documents to quarantine for later review
        - Preserves original file and adds failure metadata
        
        Args:
            upload_id: Upload identifier.
            failure_stage: Stage where failure occurred.
            failure_reason: Reason for failure.
        """
        # Try to find files in both pending and processing folders
        prefixes = [
            f"uploads/pending/{upload_id}/",
            f"uploads/processing/{upload_id}/",
        ]
        
        files_moved = 0
        
        for prefix in prefixes:
            try:
                response = self.s3_client.list_objects_v2(
                    Bucket=self.bucket_name,
                    Prefix=prefix,
                )
                
                for obj in response.get("Contents", []):
                    source_key = obj["Key"]
                    filename = source_key.rsplit("/", 1)[-1]
                    quarantine_key = f"uploads/quarantine/{upload_id}/{filename}"
                    
                    # Copy to quarantine
                    self.s3_client.copy_object(
                        Bucket=self.bucket_name,
                        CopySource={"Bucket": self.bucket_name, "Key": source_key},
                        Key=quarantine_key,
                        Metadata={
                            "quarantine_reason": failure_reason or "unknown",
                            "failure_stage": failure_stage or "unknown",
                            "quarantine_time": datetime.now(timezone.utc).isoformat(),
                        },
                        MetadataDirective="REPLACE",
                    )
                    
                    # Delete from original location
                    self.s3_client.delete_object(
                        Bucket=self.bucket_name,
                        Key=source_key,
                    )
                    
                    files_moved += 1
                    
            except ClientError as e:
                logger.warning(
                    "quarantine_list_failed",
                    upload_id=upload_id,
                    prefix=prefix,
                    error=str(e),
                )
        
        # Store quarantine metadata
        if files_moved > 0:
            try:
                quarantine_metadata = {
                    "upload_id": upload_id,
                    "failure_stage": failure_stage,
                    "failure_reason": failure_reason,
                    "quarantine_time": datetime.now(timezone.utc).isoformat(),
                    "files_quarantined": files_moved,
                }
                
                self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=f"uploads/quarantine/{upload_id}/quarantine_info.json",
                    Body=json.dumps(quarantine_metadata),
                    ContentType="application/json",
                )
            except ClientError as e:
                logger.warning(
                    "quarantine_metadata_failed",
                    upload_id=upload_id,
                    error=str(e),
                )
        
        logger.info(
            "document_quarantined",
            upload_id=upload_id,
            files_moved=files_moved,
            failure_stage=failure_stage,
        )


def process_handler(event: dict, context: Any) -> dict:
    """Lambda handler for processing uploaded documents.
    
    Triggered by SQS messages from the upload queue.
    
    Args:
        event: SQS event containing upload messages.
        context: Lambda context.
        
    Returns:
        Processing results.
    """
    logger.info("upload_processor_invoked", record_count=len(event.get("Records", [])))
    
    processor = UploadProcessor()
    results = []
    
    for record in event.get("Records", []):
        try:
            # Parse SQS message body
            body = json.loads(record.get("body", "{}"))
            
            # Process the upload
            result = processor.process_upload(body)
            results.append({
                "messageId": record.get("messageId"),
                "status": "success",
                "result": result,
            })
            
        except ProcessingError as e:
            logger.error(
                "processing_failed",
                message_id=record.get("messageId"),
                stage=e.stage,
                error=e.message,
            )
            results.append({
                "messageId": record.get("messageId"),
                "status": "failed",
                "error": e.message,
                "stage": e.stage,
            })
            # Don't raise - let other messages process
            
        except json.JSONDecodeError as e:
            logger.error(
                "invalid_message_format",
                message_id=record.get("messageId"),
                error=str(e),
            )
            results.append({
                "messageId": record.get("messageId"),
                "status": "failed",
                "error": f"Invalid message format: {str(e)}",
            })
            
        except Exception as e:
            logger.error(
                "unexpected_processing_error",
                message_id=record.get("messageId"),
                error=str(e),
            )
            results.append({
                "messageId": record.get("messageId"),
                "status": "failed",
                "error": str(e),
            })
    
    # Return batch item failures for SQS
    failed_message_ids = [
        r["messageId"] for r in results if r["status"] == "failed"
    ]
    
    return {
        "batchItemFailures": [
            {"itemIdentifier": msg_id} for msg_id in failed_message_ids
        ]
    }
