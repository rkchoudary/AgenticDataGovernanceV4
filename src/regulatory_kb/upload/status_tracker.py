"""Status tracking for document uploads using DynamoDB.

Implements Requirements 4.1-4.5:
- Track upload status through processing pipeline
- Store error details for failures
- Link to KB document on completion
- Support batch status queries
"""

import os
from datetime import datetime, timezone, timedelta
from typing import Optional, Any

import boto3
from botocore.exceptions import ClientError

from regulatory_kb.core import get_logger
from regulatory_kb.upload.models import (
    UploadStatus,
    UploadRecord,
    StatusResponse,
    BatchStatusResponse,
    FileType,
)

logger = get_logger(__name__)


class StatusTracker:
    """Tracks upload status in DynamoDB.
    
    Implements Requirements 4.1-4.5:
    - Create and update upload records
    - Query status by upload_id
    - Query batch status by batch_id
    - Query uploads by uploader_id
    """

    def __init__(
        self,
        table_name: Optional[str] = None,
        dynamodb_client: Optional[Any] = None,
    ):
        """Initialize status tracker.
        
        Args:
            table_name: DynamoDB table name
            dynamodb_client: Optional DynamoDB client (for testing)
        """
        self.table_name = table_name or os.environ.get(
            "UPLOAD_STATUS_TABLE", "regulatory-kb-upload-status"
        )
        self._client = dynamodb_client
        self._table = None

    @property
    def client(self):
        """Get DynamoDB client."""
        if self._client is None:
            self._client = boto3.client("dynamodb")
        return self._client

    @property
    def table(self):
        """Get DynamoDB table resource."""
        if self._table is None:
            dynamodb = boto3.resource("dynamodb")
            self._table = dynamodb.Table(self.table_name)
        return self._table

    def create_record(self, record: UploadRecord) -> None:
        """Create a new upload record.
        
        Args:
            record: Upload record to create
        """
        # Set TTL for 30 days after creation
        ttl_time = datetime.now(timezone.utc) + timedelta(days=30)
        record.ttl = int(ttl_time.timestamp())
        
        try:
            self.table.put_item(Item=record.to_dynamo_item())
            logger.info(
                "upload_record_created",
                upload_id=record.upload_id,
                status=record.status.value,
            )
        except ClientError as e:
            logger.error(
                "upload_record_create_failed",
                upload_id=record.upload_id,
                error=str(e),
            )
            raise

    def update_status(
        self,
        upload_id: str,
        status: UploadStatus,
        processing_stage: Optional[str] = None,
        kb_document_id: Optional[str] = None,
        error_details: Optional[str] = None,
    ) -> None:
        """Update upload status.
        
        Args:
            upload_id: Upload identifier
            status: New status
            processing_stage: Current processing stage
            kb_document_id: KB document ID if completed
            error_details: Error details if failed
        """
        update_expr = "SET #status = :status, updated_at = :updated_at"
        expr_names = {"#status": "status"}
        expr_values = {
            ":status": status.value,
            ":updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Set completed_at when status is COMPLETED
        if status == UploadStatus.COMPLETED:
            update_expr += ", completed_at = :completed_at"
            expr_values[":completed_at"] = datetime.now(timezone.utc).isoformat()
        
        if processing_stage:
            update_expr += ", processing_stage = :stage"
            expr_values[":stage"] = processing_stage
        
        if kb_document_id:
            update_expr += ", kb_document_id = :kb_id"
            expr_values[":kb_id"] = kb_document_id
        
        if error_details:
            update_expr += ", error_details = :error"
            expr_values[":error"] = error_details
        
        try:
            self.table.update_item(
                Key={"upload_id": upload_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
            logger.info(
                "upload_status_updated",
                upload_id=upload_id,
                status=status.value,
            )
        except ClientError as e:
            logger.error(
                "upload_status_update_failed",
                upload_id=upload_id,
                error=str(e),
            )
            raise

    def get_status(self, upload_id: str) -> Optional[StatusResponse]:
        """Get upload status by ID.
        
        Implements Requirements 4.2-4.5:
        - Returns status (pending, processing, completed, failed)
        - Error details for failed status
        - KB document ID for completed status
        
        Args:
            upload_id: Upload identifier
            
        Returns:
            StatusResponse or None if not found
        """
        try:
            response = self.table.get_item(Key={"upload_id": upload_id})
            item = response.get("Item")
            
            if not item:
                return None
            
            record = UploadRecord.from_dynamo_item(item)
            
            return StatusResponse(
                upload_id=record.upload_id,
                status=record.status,
                created_at=record.created_at,
                updated_at=record.updated_at,
                completed_at=record.completed_at,
                kb_document_id=record.kb_document_id,
                metadata=record.user_metadata,
                error_details=record.error_details,
                processing_stage=record.processing_stage,
            )
        except ClientError as e:
            logger.error(
                "upload_status_get_failed",
                upload_id=upload_id,
                error=str(e),
            )
            raise

    def get_batch_status(self, batch_id: str) -> Optional[BatchStatusResponse]:
        """Get batch upload status.
        
        Implements Requirement 5.5:
        - Aggregate batch status
        - Individual document statuses
        
        Args:
            batch_id: Batch identifier
            
        Returns:
            BatchStatusResponse or None if not found
        """
        try:
            # Query using batch_id GSI
            response = self.table.query(
                IndexName="batch_id-index",
                KeyConditionExpression="batch_id = :batch_id",
                ExpressionAttributeValues={":batch_id": batch_id},
            )
            
            items = response.get("Items", [])
            if not items:
                return None
            
            # Build individual status responses
            documents = []
            status_counts = {
                UploadStatus.PENDING: 0,
                UploadStatus.PROCESSING: 0,
                UploadStatus.COMPLETED: 0,
                UploadStatus.FAILED: 0,
            }
            
            for item in items:
                record = UploadRecord.from_dynamo_item(item)
                status_counts[record.status] += 1
                documents.append(
                    StatusResponse(
                        upload_id=record.upload_id,
                        status=record.status,
                        created_at=record.created_at,
                        updated_at=record.updated_at,
                        completed_at=record.completed_at,
                        kb_document_id=record.kb_document_id,
                        metadata=record.user_metadata,
                        error_details=record.error_details,
                        processing_stage=record.processing_stage,
                    )
                )
            
            return BatchStatusResponse(
                batch_id=batch_id,
                total_documents=len(documents),
                pending=status_counts[UploadStatus.PENDING],
                processing=status_counts[UploadStatus.PROCESSING],
                completed=status_counts[UploadStatus.COMPLETED],
                failed=status_counts[UploadStatus.FAILED],
                documents=documents,
            )
        except ClientError as e:
            logger.error(
                "batch_status_get_failed",
                batch_id=batch_id,
                error=str(e),
            )
            raise

    def get_uploads_by_uploader(
        self,
        uploader_id: str,
        limit: int = 50,
    ) -> list[StatusResponse]:
        """Get uploads by uploader ID.
        
        Args:
            uploader_id: Uploader identifier
            limit: Maximum number of results
            
        Returns:
            List of StatusResponse objects
        """
        try:
            response = self.table.query(
                IndexName="uploader_id-index",
                KeyConditionExpression="uploader_id = :uploader_id",
                ExpressionAttributeValues={":uploader_id": uploader_id},
                Limit=limit,
                ScanIndexForward=False,  # Most recent first
            )
            
            results = []
            for item in response.get("Items", []):
                record = UploadRecord.from_dynamo_item(item)
                results.append(
                    StatusResponse(
                        upload_id=record.upload_id,
                        status=record.status,
                        created_at=record.created_at,
                        updated_at=record.updated_at,
                        completed_at=record.completed_at,
                        kb_document_id=record.kb_document_id,
                        metadata=record.user_metadata,
                        error_details=record.error_details,
                        processing_stage=record.processing_stage,
                    )
                )
            
            return results
        except ClientError as e:
            logger.error(
                "uploads_by_uploader_failed",
                uploader_id=uploader_id,
                error=str(e),
            )
            raise
