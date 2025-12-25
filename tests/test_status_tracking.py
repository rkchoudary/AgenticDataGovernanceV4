"""Tests for upload status tracking endpoints.

Tests Requirements 4.1-4.5:
- GET /documents/upload/{id}/status for single document
- GET /documents/upload/batch/{id}/status for batch
- Return appropriate status, metadata, and error details
"""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from regulatory_kb.upload.models import (
    UploadStatus,
    UploadRecord,
    StatusResponse,
    BatchStatusResponse,
    FileType,
)
from regulatory_kb.upload.status_tracker import StatusTracker


class TestStatusTracker:
    """Tests for StatusTracker class."""

    @pytest.fixture
    def mock_table(self):
        """Create a mock DynamoDB table."""
        return MagicMock()

    @pytest.fixture
    def tracker(self, mock_table):
        """Create a StatusTracker with mocked table."""
        tracker = StatusTracker(table_name="test-table")
        tracker._table = mock_table
        return tracker

    @pytest.fixture
    def sample_upload_record(self):
        """Create a sample upload record."""
        return UploadRecord(
            upload_id="test-upload-123",
            status=UploadStatus.PENDING,
            created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            updated_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            uploader_id="user-123",
            file_name="test-document.pdf",
            file_size=1024000,
            file_type=FileType.PDF,
            s3_key="uploads/pending/test-upload-123/original.pdf",
            metadata_provided=True,
            user_metadata={"title": "Test Document", "regulator": "Fed"},
        )

    # Test get_status for single document
    def test_get_status_returns_pending_document(self, tracker, mock_table, sample_upload_record):
        """Test getting status of a pending document."""
        mock_table.get_item.return_value = {
            "Item": sample_upload_record.to_dynamo_item()
        }
        
        result = tracker.get_status("test-upload-123")
        
        assert result is not None
        assert result.upload_id == "test-upload-123"
        assert result.status == UploadStatus.PENDING
        assert result.metadata == {"title": "Test Document", "regulator": "Fed"}

    def test_get_status_returns_completed_document(self, tracker, mock_table):
        """Test getting status of a completed document with KB ID."""
        record = UploadRecord(
            upload_id="test-upload-456",
            status=UploadStatus.COMPLETED,
            created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            updated_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
            completed_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
            uploader_id="user-123",
            file_name="completed-doc.pdf",
            file_size=2048000,
            file_type=FileType.PDF,
            s3_key="uploads/completed/test-upload-456/original.pdf",
            kb_document_id="kb-doc-789",
            user_metadata={"title": "Completed Document"},
        )
        mock_table.get_item.return_value = {"Item": record.to_dynamo_item()}
        
        result = tracker.get_status("test-upload-456")
        
        assert result is not None
        assert result.status == UploadStatus.COMPLETED
        assert result.kb_document_id == "kb-doc-789"
        assert result.completed_at is not None

    def test_get_status_returns_failed_document_with_error(self, tracker, mock_table):
        """Test getting status of a failed document with error details."""
        record = UploadRecord(
            upload_id="test-upload-789",
            status=UploadStatus.FAILED,
            created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            updated_at=datetime(2024, 1, 15, 10, 32, 0, tzinfo=timezone.utc),
            uploader_id="user-123",
            file_name="failed-doc.pdf",
            file_size=512000,
            file_type=FileType.PDF,
            s3_key="uploads/pending/test-upload-789/original.pdf",
            error_details="Failed to parse PDF: Invalid format",
            processing_stage="parsing",
        )
        mock_table.get_item.return_value = {"Item": record.to_dynamo_item()}
        
        result = tracker.get_status("test-upload-789")
        
        assert result is not None
        assert result.status == UploadStatus.FAILED
        assert result.error_details == "Failed to parse PDF: Invalid format"
        assert result.processing_stage == "parsing"

    def test_get_status_returns_none_for_nonexistent(self, tracker, mock_table):
        """Test getting status returns None for non-existent document."""
        mock_table.get_item.return_value = {}
        
        result = tracker.get_status("nonexistent-id")
        
        assert result is None

    # Test get_batch_status
    def test_get_batch_status_returns_aggregate_status(self, tracker, mock_table):
        """Test getting batch status with aggregate counts."""
        records = [
            UploadRecord(
                upload_id="batch-doc-1",
                status=UploadStatus.COMPLETED,
                created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
                updated_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
                completed_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
                uploader_id="user-123",
                file_name="doc1.pdf",
                file_size=1024000,
                file_type=FileType.PDF,
                s3_key="uploads/completed/batch-doc-1/original.pdf",
                batch_id="batch-123",
                kb_document_id="kb-1",
            ),
            UploadRecord(
                upload_id="batch-doc-2",
                status=UploadStatus.PROCESSING,
                created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
                updated_at=datetime(2024, 1, 15, 10, 33, 0, tzinfo=timezone.utc),
                uploader_id="user-123",
                file_name="doc2.pdf",
                file_size=2048000,
                file_type=FileType.PDF,
                s3_key="uploads/processing/batch-doc-2/original.pdf",
                batch_id="batch-123",
                processing_stage="metadata_extraction",
            ),
            UploadRecord(
                upload_id="batch-doc-3",
                status=UploadStatus.FAILED,
                created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
                updated_at=datetime(2024, 1, 15, 10, 32, 0, tzinfo=timezone.utc),
                uploader_id="user-123",
                file_name="doc3.pdf",
                file_size=512000,
                file_type=FileType.PDF,
                s3_key="uploads/pending/batch-doc-3/original.pdf",
                batch_id="batch-123",
                error_details="Parse error",
            ),
        ]
        mock_table.query.return_value = {
            "Items": [r.to_dynamo_item() for r in records]
        }
        
        result = tracker.get_batch_status("batch-123")
        
        assert result is not None
        assert result.batch_id == "batch-123"
        assert result.total_documents == 3
        assert result.completed == 1
        assert result.processing == 1
        assert result.failed == 1
        assert result.pending == 0
        assert len(result.documents) == 3

    def test_get_batch_status_returns_none_for_nonexistent(self, tracker, mock_table):
        """Test getting batch status returns None for non-existent batch."""
        mock_table.query.return_value = {"Items": []}
        
        result = tracker.get_batch_status("nonexistent-batch")
        
        assert result is None

    # Test update_status
    def test_update_status_sets_completed_at_on_completion(self, tracker, mock_table):
        """Test that update_status sets completed_at when status is COMPLETED."""
        tracker.update_status(
            upload_id="test-upload-123",
            status=UploadStatus.COMPLETED,
            kb_document_id="kb-doc-456",
        )
        
        mock_table.update_item.assert_called_once()
        call_args = mock_table.update_item.call_args
        expr_values = call_args.kwargs["ExpressionAttributeValues"]
        
        assert ":completed_at" in expr_values
        assert ":kb_id" in expr_values
        assert expr_values[":kb_id"] == "kb-doc-456"

    def test_update_status_does_not_set_completed_at_for_other_statuses(self, tracker, mock_table):
        """Test that update_status does not set completed_at for non-COMPLETED statuses."""
        tracker.update_status(
            upload_id="test-upload-123",
            status=UploadStatus.PROCESSING,
            processing_stage="parsing",
        )
        
        mock_table.update_item.assert_called_once()
        call_args = mock_table.update_item.call_args
        expr_values = call_args.kwargs["ExpressionAttributeValues"]
        
        assert ":completed_at" not in expr_values


class TestUploadHandler:
    """Tests for upload handler status endpoints."""

    @pytest.fixture
    def mock_status_tracker(self):
        """Create a mock status tracker."""
        return MagicMock(spec=StatusTracker)

    def test_handle_upload_status_returns_document_status(self, mock_status_tracker):
        """Test _handle_upload_status returns correct response."""
        from src.handlers.upload import _handle_upload_status, _get_status_tracker
        
        # Create a mock status response
        status_response = StatusResponse(
            upload_id="test-123",
            status=UploadStatus.COMPLETED,
            created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            updated_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
            completed_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
            kb_document_id="kb-doc-456",
            metadata={"title": "Test Doc"},
        )
        
        with patch("src.handlers.upload._get_status_tracker") as mock_get_tracker:
            mock_get_tracker.return_value = mock_status_tracker
            mock_status_tracker.get_status.return_value = status_response
            
            result = _handle_upload_status("test-123", {})
            
            assert result["statusCode"] == 200
            body = json.loads(result["body"])
            assert body["upload_id"] == "test-123"
            assert body["status"] == "completed"
            assert body["kb_document_id"] == "kb-doc-456"

    def test_handle_upload_status_returns_404_for_nonexistent(self, mock_status_tracker):
        """Test _handle_upload_status returns 404 for non-existent document."""
        from src.handlers.upload import _handle_upload_status
        
        with patch("src.handlers.upload._get_status_tracker") as mock_get_tracker:
            mock_get_tracker.return_value = mock_status_tracker
            mock_status_tracker.get_status.return_value = None
            
            result = _handle_upload_status("nonexistent-id", {})
            
            assert result["statusCode"] == 404
            body = json.loads(result["body"])
            assert "not found" in body["error"].lower()

    def test_handle_batch_status_returns_aggregate_status(self, mock_status_tracker):
        """Test _handle_batch_status returns correct aggregate response."""
        from src.handlers.upload import _handle_batch_status
        
        batch_response = BatchStatusResponse(
            batch_id="batch-123",
            total_documents=3,
            pending=0,
            processing=1,
            completed=1,
            failed=1,
            documents=[
                StatusResponse(
                    upload_id="doc-1",
                    status=UploadStatus.COMPLETED,
                    created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
                    kb_document_id="kb-1",
                ),
                StatusResponse(
                    upload_id="doc-2",
                    status=UploadStatus.PROCESSING,
                    created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
                ),
                StatusResponse(
                    upload_id="doc-3",
                    status=UploadStatus.FAILED,
                    created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
                    error_details="Parse error",
                ),
            ],
        )
        
        with patch("src.handlers.upload._get_status_tracker") as mock_get_tracker:
            mock_get_tracker.return_value = mock_status_tracker
            mock_status_tracker.get_batch_status.return_value = batch_response
            
            result = _handle_batch_status("batch-123", {})
            
            assert result["statusCode"] == 200
            body = json.loads(result["body"])
            assert body["batch_id"] == "batch-123"
            assert body["total_documents"] == 3
            assert body["completed"] == 1
            assert body["processing"] == 1
            assert body["failed"] == 1
            assert len(body["documents"]) == 3

    def test_handle_batch_status_returns_404_for_nonexistent(self, mock_status_tracker):
        """Test _handle_batch_status returns 404 for non-existent batch."""
        from src.handlers.upload import _handle_batch_status
        
        with patch("src.handlers.upload._get_status_tracker") as mock_get_tracker:
            mock_get_tracker.return_value = mock_status_tracker
            mock_status_tracker.get_batch_status.return_value = None
            
            result = _handle_batch_status("nonexistent-batch", {})
            
            assert result["statusCode"] == 404
            body = json.loads(result["body"])
            assert "not found" in body["error"].lower()


class TestUploadRecordSerialization:
    """Tests for UploadRecord serialization with completed_at field."""

    def test_to_dynamo_item_includes_completed_at(self):
        """Test that to_dynamo_item includes completed_at when set."""
        record = UploadRecord(
            upload_id="test-123",
            status=UploadStatus.COMPLETED,
            created_at=datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc),
            updated_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
            completed_at=datetime(2024, 1, 15, 10, 35, 0, tzinfo=timezone.utc),
            uploader_id="user-123",
            file_name="test.pdf",
            file_size=1024,
            file_type=FileType.PDF,
            s3_key="uploads/test.pdf",
            kb_document_id="kb-456",
        )
        
        item = record.to_dynamo_item()
        
        assert "completed_at" in item
        assert item["completed_at"] == "2024-01-15T10:35:00+00:00"

    def test_to_dynamo_item_excludes_completed_at_when_none(self):
        """Test that to_dynamo_item excludes completed_at when None."""
        record = UploadRecord(
            upload_id="test-123",
            status=UploadStatus.PENDING,
            uploader_id="user-123",
            file_name="test.pdf",
            file_size=1024,
            file_type=FileType.PDF,
            s3_key="uploads/test.pdf",
        )
        
        item = record.to_dynamo_item()
        
        assert "completed_at" not in item

    def test_from_dynamo_item_parses_completed_at(self):
        """Test that from_dynamo_item correctly parses completed_at."""
        item = {
            "upload_id": "test-123",
            "status": "completed",
            "created_at": "2024-01-15T10:30:00+00:00",
            "updated_at": "2024-01-15T10:35:00+00:00",
            "completed_at": "2024-01-15T10:35:00+00:00",
            "uploader_id": "user-123",
            "file_name": "test.pdf",
            "file_size": 1024,
            "file_type": "pdf",
            "s3_key": "uploads/test.pdf",
            "kb_document_id": "kb-456",
        }
        
        record = UploadRecord.from_dynamo_item(item)
        
        assert record.completed_at is not None
        assert record.completed_at.year == 2024
        assert record.completed_at.month == 1
        assert record.completed_at.day == 15

    def test_from_dynamo_item_handles_missing_completed_at(self):
        """Test that from_dynamo_item handles missing completed_at."""
        item = {
            "upload_id": "test-123",
            "status": "pending",
            "created_at": "2024-01-15T10:30:00+00:00",
            "updated_at": "2024-01-15T10:30:00+00:00",
            "uploader_id": "user-123",
            "file_name": "test.pdf",
            "file_size": 1024,
            "file_type": "pdf",
            "s3_key": "uploads/test.pdf",
        }
        
        record = UploadRecord.from_dynamo_item(item)
        
        assert record.completed_at is None
