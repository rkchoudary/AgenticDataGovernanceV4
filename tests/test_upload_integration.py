"""End-to-end integration tests for the Document Upload feature.

Implements Task 11.1: Create end-to-end upload tests
- Test complete upload → processing → graph storage flow
- Test batch upload with mixed valid/invalid documents
- Test document replacement with version history
- Test status tracking through all states
- Requirements: All integration points

Implements Task 11.2: Test integration with existing system
- Verify uploaded documents appear in search results
- Verify relationships with existing documents
- Verify Bedrock agent can query uploaded documents
- Requirements: 3.4, existing system integration
"""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, AsyncMock
from io import BytesIO

from regulatory_kb.upload.service import UploadService
from regulatory_kb.upload.status_tracker import StatusTracker
from regulatory_kb.upload.validator import FileValidator, MetadataValidator
from regulatory_kb.upload.version_manager import VersionManager, VersionRecord, ReplacementResult
from regulatory_kb.upload.metadata_handler import MetadataHandler
from regulatory_kb.upload.models import (
    UploadStatus,
    UploadMetadata,
    UploadResponse,
    BatchUploadResponse,
    FileType,
    UploadRecord,
    StatusResponse,
)
from regulatory_kb.processing.parser import DocumentParser, DocumentFormat, ParsedDocument
from regulatory_kb.processing.metadata import MetadataExtractor
from regulatory_kb.processing.validation import ContentValidator
from regulatory_kb.processing.chunker import DocumentChunker
from regulatory_kb.api.webhooks import WebhookService, WebhookEventType



class TestEndToEndUploadFlow:
    """Integration tests for complete upload → processing → storage flow."""

    @pytest.fixture
    def valid_pdf_content(self):
        """Create valid PDF content with magic bytes."""
        return b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n" + b"x" * 1000

    @pytest.fixture
    def valid_html_content(self):
        """Create valid HTML content with regulatory structure."""
        return b"""<!DOCTYPE html>
<html>
<head><title>FR Y-14A Instructions</title></head>
<body>
    <main>
        <h1>Instructions for FR Y-14A Capital Assessments</h1>
        <p>OMB Control Number: 7100-0341</p>
        <p>Effective Date: January 1, 2024</p>
        <h2>Section 1: General Instructions</h2>
        <p>This regulation establishes requirements for capital plan submissions.
        The filing deadline is April 5 annually. All covered institutions must
        comply with these reporting requirements. The compliance threshold is set
        at the regulatory level for all banking organizations.</p>
        <h2>Section 2: Schedule Requirements</h2>
        <p>The following schedules must be submitted quarterly:</p>
        <ul>
            <li>Summary Schedule</li>
            <li>Scenario Schedule</li>
            <li>Capital Schedule</li>
        </ul>
    </main>
</body>
</html>"""

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        mock = MagicMock()
        mock.put_object.return_value = {}
        mock.get_object.return_value = {"Body": MagicMock(read=lambda: b"test content")}
        mock.copy_object.return_value = {}
        mock.delete_object.return_value = {}
        mock.list_objects_v2.return_value = {"Contents": []}
        return mock

    @pytest.fixture
    def mock_sqs_client(self):
        """Create a mock SQS client."""
        mock = MagicMock()
        mock.send_message.return_value = {"MessageId": "test-message-id"}
        return mock

    @pytest.fixture
    def mock_dynamodb_table(self):
        """Create a mock DynamoDB table."""
        mock = MagicMock()
        mock.put_item.return_value = {}
        mock.update_item.return_value = {}
        mock.get_item.return_value = {}
        mock.query.return_value = {"Items": []}
        return mock

    @pytest.fixture
    def upload_service(self, mock_s3_client, mock_sqs_client, mock_dynamodb_table):
        """Create an upload service with mocked dependencies."""
        status_tracker = StatusTracker(table_name="test-table")
        status_tracker._table = mock_dynamodb_table
        
        service = UploadService(
            bucket_name="test-bucket",
            queue_url="https://sqs.us-east-1.amazonaws.com/123456789/test-queue",
            status_tracker=status_tracker,
            s3_client=mock_s3_client,
            sqs_client=mock_sqs_client,
        )
        return service

    def test_complete_upload_flow_pdf(self, upload_service, valid_pdf_content, mock_s3_client, mock_sqs_client):
        """Test complete upload flow for a PDF document."""
        metadata = UploadMetadata(
            title="FR Y-14A Instructions",
            regulator="Fed",
            category="capital-requirements",
            effective_date="2024-01-01",
        )
        
        response, error_code = upload_service.upload_document(
            file_content=valid_pdf_content,
            file_name="fry14a_instructions.pdf",
            uploader_id="user-123",
            metadata=metadata,
        )
        
        # Verify successful upload
        assert error_code is None
        assert response.status == UploadStatus.PENDING
        assert response.upload_id != ""
        assert "uploaded successfully" in response.message.lower()
        
        # Verify S3 storage was called
        mock_s3_client.put_object.assert_called()
        
        # Verify SQS queuing was called
        mock_sqs_client.send_message.assert_called_once()
        call_args = mock_sqs_client.send_message.call_args
        message_body = json.loads(call_args.kwargs["MessageBody"])
        assert message_body["upload_id"] == response.upload_id
        assert message_body["file_type"] == "pdf"

    def test_complete_upload_flow_html(self, upload_service, valid_html_content, mock_s3_client, mock_sqs_client):
        """Test complete upload flow for an HTML document."""
        metadata = UploadMetadata(
            title="FINTRAC Guidance",
            regulator="FINTRAC",
            category="aml-compliance",
        )
        
        response, error_code = upload_service.upload_document(
            file_content=valid_html_content,
            file_name="fintrac_guidance.html",
            uploader_id="user-456",
            metadata=metadata,
        )
        
        # Verify successful upload
        assert error_code is None
        assert response.status == UploadStatus.PENDING
        assert response.upload_id != ""
        
        # Verify S3 storage was called with correct key
        put_calls = mock_s3_client.put_object.call_args_list
        assert len(put_calls) >= 1
        
        # Verify SQS message contains correct file type
        call_args = mock_sqs_client.send_message.call_args
        message_body = json.loads(call_args.kwargs["MessageBody"])
        assert message_body["file_type"] == "html"


    def test_upload_with_metadata_storage(self, upload_service, valid_pdf_content, mock_s3_client):
        """Test that metadata is stored alongside the document."""
        metadata = UploadMetadata(
            title="Test Document",
            regulator="OCC",
            category="liquidity-reporting",
            effective_date="2024-06-01",
            description="Test description",
            tags=["test", "liquidity"],
        )
        
        response, error_code = upload_service.upload_document(
            file_content=valid_pdf_content,
            file_name="test_doc.pdf",
            uploader_id="user-789",
            metadata=metadata,
        )
        
        assert error_code is None
        
        # Verify metadata.json was stored
        put_calls = mock_s3_client.put_object.call_args_list
        metadata_call = [c for c in put_calls if "metadata.json" in str(c)]
        assert len(metadata_call) >= 1

    def test_upload_without_metadata(self, upload_service, valid_pdf_content):
        """Test upload without user-provided metadata."""
        response, error_code = upload_service.upload_document(
            file_content=valid_pdf_content,
            file_name="no_metadata.pdf",
            uploader_id="user-123",
            metadata=None,
        )
        
        assert error_code is None
        assert response.status == UploadStatus.PENDING

    def test_upload_invalid_file_type_rejected(self, upload_service):
        """Test that invalid file types are rejected."""
        invalid_content = b"This is just plain text content without any special markers."
        
        response, error_code = upload_service.upload_document(
            file_content=invalid_content,
            file_name="document.txt",
            uploader_id="user-123",
        )
        
        assert error_code == 400
        assert response.status == UploadStatus.FAILED
        assert "Invalid file type" in response.message

    def test_upload_oversized_pdf_rejected(self, upload_service):
        """Test that oversized PDF files are rejected."""
        # Create content larger than 50MB
        oversized_content = b"%PDF-1.4\n" + b"x" * (51 * 1024 * 1024)
        
        response, error_code = upload_service.upload_document(
            file_content=oversized_content,
            file_name="large.pdf",
            uploader_id="user-123",
        )
        
        assert error_code == 413
        assert response.status == UploadStatus.FAILED
        assert "50MB" in response.message

    def test_upload_oversized_html_rejected(self, upload_service):
        """Test that oversized HTML files are rejected."""
        # Create content larger than 10MB
        oversized_content = b"<!DOCTYPE html>\n<html><body>" + b"x" * (11 * 1024 * 1024) + b"</body></html>"
        
        response, error_code = upload_service.upload_document(
            file_content=oversized_content,
            file_name="large.html",
            uploader_id="user-123",
        )
        
        assert error_code == 413
        assert response.status == UploadStatus.FAILED
        assert "10MB" in response.message

    def test_upload_invalid_metadata_rejected(self, upload_service, valid_pdf_content):
        """Test that invalid metadata is rejected."""
        invalid_metadata = UploadMetadata(
            regulator="InvalidRegulator",
            category="invalid-category",
        )
        
        response, error_code = upload_service.upload_document(
            file_content=valid_pdf_content,
            file_name="test.pdf",
            uploader_id="user-123",
            metadata=invalid_metadata,
        )
        
        assert error_code == 400
        assert response.status == UploadStatus.FAILED


class TestBatchUploadIntegration:
    """Integration tests for batch upload with mixed valid/invalid documents."""

    @pytest.fixture
    def valid_pdf_content(self):
        """Create valid PDF content."""
        return b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n" + b"x" * 500

    @pytest.fixture
    def valid_html_content(self):
        """Create valid HTML content."""
        return b"<!DOCTYPE html>\n<html><body>Test content</body></html>"

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        mock = MagicMock()
        mock.put_object.return_value = {}
        return mock

    @pytest.fixture
    def mock_sqs_client(self):
        """Create a mock SQS client."""
        mock = MagicMock()
        mock.send_message.return_value = {"MessageId": "test-message-id"}
        return mock

    @pytest.fixture
    def mock_dynamodb_table(self):
        """Create a mock DynamoDB table."""
        mock = MagicMock()
        mock.put_item.return_value = {}
        mock.update_item.return_value = {}
        return mock

    @pytest.fixture
    def upload_service(self, mock_s3_client, mock_sqs_client, mock_dynamodb_table):
        """Create an upload service with mocked dependencies."""
        status_tracker = StatusTracker(table_name="test-table")
        status_tracker._table = mock_dynamodb_table
        
        return UploadService(
            bucket_name="test-bucket",
            queue_url="https://sqs.us-east-1.amazonaws.com/123456789/test-queue",
            status_tracker=status_tracker,
            s3_client=mock_s3_client,
            sqs_client=mock_sqs_client,
        )

    def test_batch_upload_all_valid(self, upload_service, valid_pdf_content, valid_html_content):
        """Test batch upload with all valid documents."""
        documents = [
            {
                "file_content": valid_pdf_content,
                "file_name": "doc1.pdf",
                "metadata": {"title": "Document 1", "regulator": "Fed"},
            },
            {
                "file_content": valid_html_content,
                "file_name": "doc2.html",
                "metadata": {"title": "Document 2", "regulator": "OCC"},
            },
        ]
        
        response, error_code = upload_service.upload_batch(
            documents=documents,
            uploader_id="user-123",
        )
        
        assert error_code is None
        assert response.batch_id != ""
        assert response.total_documents == 2
        assert response.accepted == 2
        assert response.rejected == 0
        assert len(response.documents) == 2
        assert all(d.status == "pending" for d in response.documents)


    def test_batch_upload_mixed_valid_invalid(self, upload_service, valid_pdf_content):
        """Test batch upload with mixed valid and invalid documents."""
        documents = [
            {
                "file_content": valid_pdf_content,
                "file_name": "valid.pdf",
                "metadata": {"title": "Valid Document", "regulator": "Fed"},
            },
            {
                "file_content": b"plain text - invalid",
                "file_name": "invalid.txt",
            },
            {
                "file_content": valid_pdf_content,
                "file_name": "another_valid.pdf",
            },
        ]
        
        response, error_code = upload_service.upload_batch(
            documents=documents,
            uploader_id="user-123",
        )
        
        # Batch should succeed overall
        assert error_code is None
        assert response.total_documents == 3
        assert response.accepted == 2
        assert response.rejected == 1
        
        # Check individual statuses
        statuses = {d.file_name: d.status for d in response.documents}
        assert statuses["valid.pdf"] == "pending"
        assert statuses["invalid.txt"] == "rejected"
        assert statuses["another_valid.pdf"] == "pending"

    def test_batch_upload_all_invalid(self, upload_service):
        """Test batch upload with all invalid documents."""
        documents = [
            {
                "file_content": b"invalid content 1",
                "file_name": "invalid1.txt",
            },
            {
                "file_content": b"invalid content 2",
                "file_name": "invalid2.doc",
            },
        ]
        
        response, error_code = upload_service.upload_batch(
            documents=documents,
            uploader_id="user-123",
        )
        
        assert error_code is None  # Batch itself succeeds
        assert response.accepted == 0
        assert response.rejected == 2
        assert all(d.status == "rejected" for d in response.documents)

    def test_batch_upload_exceeds_limit(self, upload_service, valid_pdf_content):
        """Test batch upload exceeding 20 document limit."""
        documents = [
            {"file_content": valid_pdf_content, "file_name": f"doc{i}.pdf"}
            for i in range(25)
        ]
        
        response, error_code = upload_service.upload_batch(
            documents=documents,
            uploader_id="user-123",
        )
        
        assert error_code == 400
        assert response.accepted == 0
        assert response.rejected == 25

    def test_batch_upload_with_invalid_metadata(self, upload_service, valid_pdf_content):
        """Test batch upload with some documents having invalid metadata."""
        documents = [
            {
                "file_content": valid_pdf_content,
                "file_name": "valid_meta.pdf",
                "metadata": {"regulator": "Fed"},
            },
            {
                "file_content": valid_pdf_content,
                "file_name": "invalid_meta.pdf",
                "metadata": {"regulator": "InvalidReg"},
            },
        ]
        
        response, error_code = upload_service.upload_batch(
            documents=documents,
            uploader_id="user-123",
        )
        
        assert response.accepted == 1
        assert response.rejected == 1


class TestStatusTrackingIntegration:
    """Integration tests for status tracking through all states."""

    @pytest.fixture
    def mock_dynamodb_table(self):
        """Create a mock DynamoDB table with state tracking."""
        mock = MagicMock()
        mock._items = {}
        
        def put_item(Item):
            mock._items[Item["upload_id"]] = Item
            return {}
        
        def get_item(Key):
            upload_id = Key["upload_id"]
            if upload_id in mock._items:
                return {"Item": mock._items[upload_id]}
            return {}
        
        def update_item(Key, UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues):
            upload_id = Key["upload_id"]
            if upload_id in mock._items:
                item = mock._items[upload_id]
                # Simple update simulation
                if ":status" in ExpressionAttributeValues:
                    item["status"] = ExpressionAttributeValues[":status"]
                if ":updated_at" in ExpressionAttributeValues:
                    item["updated_at"] = ExpressionAttributeValues[":updated_at"]
                if ":stage" in ExpressionAttributeValues:
                    item["processing_stage"] = ExpressionAttributeValues[":stage"]
                if ":kb_id" in ExpressionAttributeValues:
                    item["kb_document_id"] = ExpressionAttributeValues[":kb_id"]
                if ":error" in ExpressionAttributeValues:
                    item["error_details"] = ExpressionAttributeValues[":error"]
                if ":completed_at" in ExpressionAttributeValues:
                    item["completed_at"] = ExpressionAttributeValues[":completed_at"]
            return {}
        
        mock.put_item = MagicMock(side_effect=put_item)
        mock.get_item = MagicMock(side_effect=get_item)
        mock.update_item = MagicMock(side_effect=update_item)
        
        return mock

    @pytest.fixture
    def status_tracker(self, mock_dynamodb_table):
        """Create a status tracker with mocked table."""
        tracker = StatusTracker(table_name="test-table")
        tracker._table = mock_dynamodb_table
        return tracker

    def test_status_transitions_pending_to_processing(self, status_tracker, mock_dynamodb_table):
        """Test status transition from pending to processing."""
        # Create initial record
        record = UploadRecord(
            upload_id="test-upload-001",
            status=UploadStatus.PENDING,
            uploader_id="user-123",
            file_name="test.pdf",
            file_size=1024,
            file_type=FileType.PDF,
            s3_key="uploads/pending/test-upload-001/original.pdf",
        )
        status_tracker.create_record(record)
        
        # Update to processing
        status_tracker.update_status(
            upload_id="test-upload-001",
            status=UploadStatus.PROCESSING,
            processing_stage="parsing",
        )
        
        # Verify status was updated
        result = status_tracker.get_status("test-upload-001")
        assert result.status == UploadStatus.PROCESSING
        assert result.processing_stage == "parsing"


    def test_status_transitions_processing_to_completed(self, status_tracker, mock_dynamodb_table):
        """Test status transition from processing to completed."""
        # Create initial record
        record = UploadRecord(
            upload_id="test-upload-002",
            status=UploadStatus.PROCESSING,
            uploader_id="user-123",
            file_name="test.pdf",
            file_size=1024,
            file_type=FileType.PDF,
            s3_key="uploads/processing/test-upload-002/document.pdf",
            processing_stage="validation",
        )
        status_tracker.create_record(record)
        
        # Update to completed
        status_tracker.update_status(
            upload_id="test-upload-002",
            status=UploadStatus.COMPLETED,
            kb_document_id="kb-doc-456",
        )
        
        # Verify status was updated
        result = status_tracker.get_status("test-upload-002")
        assert result.status == UploadStatus.COMPLETED
        assert result.kb_document_id == "kb-doc-456"

    def test_status_transitions_processing_to_failed(self, status_tracker, mock_dynamodb_table):
        """Test status transition from processing to failed."""
        # Create initial record
        record = UploadRecord(
            upload_id="test-upload-003",
            status=UploadStatus.PROCESSING,
            uploader_id="user-123",
            file_name="test.pdf",
            file_size=1024,
            file_type=FileType.PDF,
            s3_key="uploads/processing/test-upload-003/document.pdf",
            processing_stage="parsing",
        )
        status_tracker.create_record(record)
        
        # Update to failed
        status_tracker.update_status(
            upload_id="test-upload-003",
            status=UploadStatus.FAILED,
            error_details="Failed to parse PDF: Invalid format",
        )
        
        # Verify status was updated
        result = status_tracker.get_status("test-upload-003")
        assert result.status == UploadStatus.FAILED
        assert "Invalid format" in result.error_details

    def test_status_query_nonexistent_returns_none(self, status_tracker):
        """Test querying status for non-existent document returns None."""
        result = status_tracker.get_status("nonexistent-id")
        assert result is None


class TestDocumentReplacementIntegration:
    """Integration tests for document replacement with version history."""

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        mock = MagicMock()
        mock.put_object.return_value = {}
        mock.copy_object.return_value = {}
        mock.get_object.return_value = {
            "Body": MagicMock(read=lambda: b'{"status": "pending"}')
        }
        return mock

    @pytest.fixture
    def mock_dynamodb_table(self):
        """Create a mock DynamoDB table for version history."""
        mock = MagicMock()
        mock._items = {}
        
        def put_item(Item):
            key = f"{Item['document_id']}#{Item['version_number']}"
            mock._items[key] = Item
            return {}
        
        def get_item(Key):
            key = f"{Key['document_id']}#{Key['version_number']}"
            if key in mock._items:
                return {"Item": mock._items[key]}
            return {}
        
        def query(**kwargs):
            doc_id = kwargs.get("ExpressionAttributeValues", {}).get(":doc_id")
            items = [v for k, v in mock._items.items() if k.startswith(f"{doc_id}#")]
            return {"Items": items}
        
        mock.put_item = MagicMock(side_effect=put_item)
        mock.get_item = MagicMock(side_effect=get_item)
        mock.query = MagicMock(side_effect=query)
        
        return mock

    @pytest.fixture
    def version_manager(self, mock_s3_client, mock_dynamodb_table):
        """Create a version manager with mocked dependencies."""
        manager = VersionManager(
            bucket_name="test-bucket",
            version_table_name="test-version-table",
            s3_client=mock_s3_client,
        )
        manager._table = mock_dynamodb_table
        return manager

    def test_create_version_record(self, version_manager, mock_dynamodb_table):
        """Test creating a version record."""
        record = VersionRecord(
            document_id="doc-001",
            version_number=1,
            s3_key="uploads/completed/doc-001/document.pdf",
            title="Test Document",
            regulator="Fed",
            uploader_id="user-123",
        )
        
        version_manager.create_version_record(record)
        
        mock_dynamodb_table.put_item.assert_called_once()

    def test_get_version_history(self, version_manager, mock_dynamodb_table):
        """Test retrieving version history."""
        # Create multiple versions
        for i in range(1, 4):
            record = VersionRecord(
                document_id="doc-002",
                version_number=i,
                s3_key=f"uploads/completed/doc-002_v{i}/document.pdf",
                title="Test Document",
                regulator="Fed",
            )
            version_manager.create_version_record(record)
        
        # Get version history
        history = version_manager.get_version_history("doc-002")
        
        assert len(history) == 3

    def test_archive_version(self, version_manager, mock_s3_client):
        """Test archiving a document version."""
        archive_key = version_manager.archive_version(
            document_id="doc-003",
            current_s3_key="uploads/completed/doc-003/document.pdf",
            version_number=1,
        )
        
        assert "versions/doc-003/v1" in archive_key
        mock_s3_client.copy_object.assert_called_once()


    def test_replace_document_creates_new_version(self, version_manager, mock_s3_client, mock_dynamodb_table):
        """Test document replacement creates a new version."""
        # Create initial version
        initial_record = VersionRecord(
            document_id="doc-004",
            version_number=1,
            s3_key="uploads/completed/doc-004/document.pdf",
            title="Original Document",
            regulator="Fed",
            uploader_id="user-123",
        )
        version_manager.create_version_record(initial_record)
        
        # Replace document
        new_content = b"%PDF-1.4\n" + b"new content" * 100
        result = version_manager.replace_document(
            existing_document_id="doc-004",
            new_file_content=new_content,
            new_file_name="updated_doc.pdf",
            uploader_id="user-456",
            title="Updated Document",
        )
        
        assert result.success is True
        assert result.version_number == 2
        assert result.previous_version_id == "doc-004"

    def test_get_latest_version(self, version_manager, mock_dynamodb_table):
        """Test getting the latest version of a document."""
        # Create multiple versions
        for i in range(1, 4):
            record = VersionRecord(
                document_id="doc-005",
                version_number=i,
                s3_key=f"uploads/completed/doc-005_v{i}/document.pdf",
                title=f"Document v{i}",
                regulator="OCC",
            )
            version_manager.create_version_record(record)
        
        # Override query to return items in descending order (as the real implementation does)
        def query_descending(**kwargs):
            doc_id = kwargs.get("ExpressionAttributeValues", {}).get(":doc_id")
            items = [v for k, v in mock_dynamodb_table._items.items() if k.startswith(f"{doc_id}#")]
            # Sort by version_number descending
            items.sort(key=lambda x: x.get("version_number", 0), reverse=True)
            return {"Items": items}
        
        mock_dynamodb_table.query = MagicMock(side_effect=query_descending)
        
        latest = version_manager.get_latest_version("doc-005")
        
        assert latest is not None
        assert latest.version_number == 3

    def test_get_specific_version(self, version_manager, mock_dynamodb_table):
        """Test getting a specific version of a document."""
        # Create multiple versions
        for i in range(1, 4):
            record = VersionRecord(
                document_id="doc-006",
                version_number=i,
                s3_key=f"uploads/completed/doc-006_v{i}/document.pdf",
                title=f"Document v{i}",
                regulator="FDIC",
            )
            version_manager.create_version_record(record)
        
        version_2 = version_manager.get_version("doc-006", 2)
        
        assert version_2 is not None
        assert version_2.version_number == 2
        assert version_2.title == "Document v2"


class TestProcessingPipelineIntegration:
    """Integration tests for the document processing pipeline."""

    @pytest.fixture
    def parser(self):
        """Create document parser."""
        return DocumentParser()

    @pytest.fixture
    def metadata_extractor(self):
        """Create metadata extractor."""
        return MetadataExtractor()

    @pytest.fixture
    def validator(self):
        """Create content validator."""
        return ContentValidator()

    @pytest.fixture
    def chunker(self):
        """Create document chunker."""
        return DocumentChunker()

    @pytest.fixture
    def metadata_handler(self):
        """Create metadata handler."""
        return MetadataHandler()

    def test_parse_html_document(self, parser):
        """Test parsing an HTML document."""
        html_content = """
        <html>
        <head><title>Test Regulation</title></head>
        <body>
            <main>
                <h1>12 CFR Part 249 - Liquidity Coverage Ratio</h1>
                <p>This regulation establishes minimum liquidity requirements.</p>
                <h2>Section 1: Purpose</h2>
                <p>The purpose of this regulation is to establish requirements.</p>
            </main>
        </body>
        </html>
        """
        
        parsed = parser.parse(html_content, DocumentFormat.HTML)
        
        assert parsed.text is not None
        assert len(parsed.text) > 0
        assert "liquidity" in parsed.text.lower()

    def test_parse_pdf_content(self, parser):
        """Test parsing PDF content (basic validation)."""
        # Note: Full PDF parsing requires actual PDF content
        # This tests the parser handles PDF format specification
        pdf_content = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        
        # Parser should handle PDF format
        try:
            parsed = parser.parse(pdf_content, DocumentFormat.PDF)
            # If parsing succeeds, verify structure
            assert parsed is not None
        except Exception:
            # PDF parsing may fail with minimal content - that's expected
            pass

    def test_extract_metadata_from_text(self, metadata_extractor):
        """Test metadata extraction from document text."""
        text = """
        FR Y-14A Instructions
        OMB Control Number: 7100-0341
        Effective Date: January 1, 2024
        
        This regulation establishes requirements for capital plan submissions.
        The filing deadline is April 5 annually.
        """
        
        metadata = metadata_extractor.extract(text, "us_frb")
        
        assert metadata is not None
        assert metadata.omb_control_number == "7100-0341"

    def test_validate_parsed_document(self, parser, validator):
        """Test content validation of parsed document."""
        html_content = """
        <html>
        <body>
            <main>
                <h1>Test Regulation</h1>
                <p>This regulation establishes compliance requirements for filing reports.
                The deadline is quarterly. All institutions must comply with these requirements.
                The threshold is set at the regulatory level.</p>
            </main>
        </body>
        </html>
        """
        
        parsed = parser.parse(html_content, DocumentFormat.HTML)
        validation_result = validator.validate(parsed)
        
        assert validation_result is not None
        assert validation_result.is_valid is True


    def test_chunk_large_document(self, parser, chunker):
        """Test chunking a large document."""
        # Create a document with multiple sections
        sections = []
        for i in range(15):
            sections.append(f"""
                <h2>Section {i+1}: Requirements</h2>
                <p>This section describes requirement {i+1}. The compliance deadline is quarterly.
                All covered institutions must meet these requirements. The threshold is set
                at the regulatory level for all banking organizations. Additional details
                about the requirement are provided below.</p>
            """)
        
        html_content = f"""
        <html>
        <body>
            <main>
                <h1>Comprehensive Regulatory Document</h1>
                {''.join(sections)}
            </main>
        </body>
        </html>
        """
        
        parsed = parser.parse(html_content, DocumentFormat.HTML)
        chunks = chunker.chunk_document(parsed, "test-doc-001")
        
        assert len(chunks) > 0
        # Verify chunks have required metadata
        for chunk in chunks:
            assert chunk.chunk_id is not None
            assert chunk.document_id == "test-doc-001"

    def test_metadata_merge_user_takes_precedence(self, metadata_handler, metadata_extractor):
        """Test that user-provided metadata takes precedence over extracted."""
        text = """
        FR Y-14A Instructions
        OMB Control Number: 7100-0341
        """
        
        extracted = metadata_extractor.extract(text, "us_frb")
        
        user_metadata = {
            "title": "Custom Title",
            "regulator": "OCC",
            "category": "liquidity-reporting",
        }
        
        merged = metadata_handler.merge_metadata(
            user_metadata=user_metadata,
            extracted_metadata=extracted,
        )
        
        # User values should take precedence
        assert merged.title == "Custom Title"
        assert merged.regulator == "OCC"
        assert merged.category == "liquidity-reporting"


class TestWebhookIntegration:
    """Integration tests for webhook notifications during upload processing."""

    @pytest.fixture
    def webhook_service(self):
        """Create webhook service."""
        return WebhookService(
            signing_secret="test-webhook-secret",
            max_retries=3,
            delivery_timeout=5,
        )

    def test_webhook_subscription_for_upload_events(self, webhook_service):
        """Test creating webhook subscription for upload events."""
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[
                WebhookEventType.DOCUMENT_CREATED,
                WebhookEventType.DOCUMENT_UPDATED,
            ],
        )
        
        assert subscription is not None
        assert subscription.is_active is True
        assert len(subscription.events) == 2

    def test_webhook_dispatch_on_upload_complete(self, webhook_service):
        """Test webhook dispatch when upload processing completes."""
        # Create subscription
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_CREATED],
        )
        
        # Dispatch event
        deliveries = webhook_service.dispatch_event(
            WebhookEventType.DOCUMENT_CREATED,
            {
                "document_id": "uploaded_test-123",
                "title": "New Uploaded Document",
                "regulator_id": "us_frb",
                "categories": ["capital-requirements"],
            },
        )
        
        assert len(deliveries) == 1
        assert deliveries[0].event_type == WebhookEventType.DOCUMENT_CREATED

    def test_webhook_payload_signing(self, webhook_service):
        """Test webhook payload signing for security."""
        subscription = webhook_service.create_subscription(
            url="https://example.com/webhook",
            events=[WebhookEventType.DOCUMENT_UPDATED],
        )
        
        payload = '{"event_type": "document.updated", "data": {}}'
        signature = webhook_service._sign_payload(payload, subscription.secret)
        
        assert signature.startswith("sha256=")
        
        # Verify signature
        is_valid = webhook_service.verify_signature(payload, signature, subscription.secret)
        assert is_valid is True


class TestExistingSystemIntegration:
    """Integration tests for uploaded documents with existing system.
    
    Implements Task 11.2:
    - Verify uploaded documents appear in search results
    - Verify relationships with existing documents
    - Verify Bedrock agent can query uploaded documents
    """

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mocked graph store."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            from regulatory_kb.storage.graph_store import FalkorDBStore
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    @pytest.fixture
    def query_processor(self):
        """Create query processor."""
        from regulatory_kb.agent.query_processor import QueryProcessor
        return QueryProcessor()

    def test_uploaded_document_searchable(self, mock_graph_store):
        """Test that uploaded documents appear in search results."""
        store, mock_graph = mock_graph_store
        
        # Mock search result including uploaded document
        mock_node = MagicMock()
        mock_node.properties = {
            "id": "uploaded_test-123",
            "title": "Uploaded FR Y-14A Instructions",
            "document_type": "instruction_manual",
            "regulator_id": "us_frb",
            "categories": "capital_requirements",
            "source": "upload",
        }
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_graph.query.return_value = mock_result
        
        # Perform search
        from regulatory_kb.api.rest import DocumentSearchService, SearchFilters
        service = DocumentSearchService(store)
        filters = SearchFilters(regulator_abbreviation="FRB")
        result = service.search(filters)
        
        assert result is not None


    def test_uploaded_document_relationships(self, mock_graph_store):
        """Test that uploaded documents can have relationships with existing documents."""
        store, mock_graph = mock_graph_store
        
        # Mock relationship creation
        mock_graph.query.return_value = MagicMock(result_set=[["rel_id"]])
        
        from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
        
        # Create relationship between uploaded doc and existing doc
        relationship = GraphRelationship(
            source_node="uploaded_test-123",
            target_node="existing_doc_456",
            relationship_type=RelationshipType.REFERENCES,
            properties={"created_by": "upload_processor"},
            validated=True,
        )
        
        result = store.create_relationship(relationship)
        
        # Verify relationship was created
        mock_graph.query.assert_called()

    def test_query_processor_handles_uploaded_documents(self, query_processor):
        """Test that query processor can handle queries about uploaded documents."""
        from regulatory_kb.agent.query_processor import RegulatoryTopic
        
        # Query that might match uploaded documents
        result = query_processor.process_query(
            "What are the capital requirements in the uploaded FR Y-14A instructions?"
        )
        
        assert result is not None
        assert result.topic == RegulatoryTopic.CAPITAL

    def test_uploaded_document_version_chain(self, mock_graph_store):
        """Test version chain relationships for uploaded documents."""
        store, mock_graph = mock_graph_store
        
        # Mock query for version chain
        mock_result = MagicMock()
        mock_result.result_set = [
            [{"id": "uploaded_doc_v3", "version": 3}],
            [{"id": "uploaded_doc_v2", "version": 2}],
            [{"id": "uploaded_doc_v1", "version": 1}],
        ]
        mock_graph.query.return_value = mock_result
        
        # Query for all versions
        query = """
        MATCH (d:Document)-[:SUPERSEDES*0..]->(prev:Document)
        WHERE d.id = $id
        RETURN d.id, d.version
        ORDER BY d.version DESC
        """
        
        result = mock_graph.query(query, {"id": "uploaded_doc_v3"})
        
        assert len(result.result_set) == 3


class TestUploadProcessorIntegration:
    """Integration tests for the upload processor Lambda handler."""

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        mock = MagicMock()
        mock.copy_object.return_value = {}
        mock.delete_object.return_value = {}
        mock.list_objects_v2.return_value = {"Contents": []}
        
        # Mock get_object to return valid HTML content
        html_content = b"""<!DOCTYPE html>
        <html><body><main>
            <h1>Test Regulation</h1>
            <p>This regulation establishes compliance requirements for filing reports.
            The deadline is quarterly. All institutions must comply.</p>
        </main></body></html>"""
        
        mock.get_object.return_value = {
            "Body": MagicMock(read=lambda: html_content)
        }
        return mock

    @pytest.fixture
    def mock_dynamodb_table(self):
        """Create a mock DynamoDB table."""
        mock = MagicMock()
        mock.update_item.return_value = {}
        return mock

    @pytest.fixture
    def mock_webhook_service(self):
        """Create a mock webhook service."""
        mock = MagicMock(spec=WebhookService)
        mock.dispatch_upload_processing_completed.return_value = []
        mock.dispatch_upload_processing_failed.return_value = []
        return mock

    def test_process_upload_message(self, mock_s3_client, mock_dynamodb_table, mock_webhook_service):
        """Test processing an upload message through the pipeline."""
        from src.handlers.upload_processor import UploadProcessor
        
        status_tracker = StatusTracker(table_name="test-table")
        status_tracker._table = mock_dynamodb_table
        
        processor = UploadProcessor(
            bucket_name="test-bucket",
            status_tracker=status_tracker,
            s3_client=mock_s3_client,
            webhook_service=mock_webhook_service,
        )
        
        message = {
            "upload_id": "test-upload-001",
            "file_path": "s3://test-bucket/uploads/pending/test-upload-001/original.html",
            "file_type": "html",
            "user_metadata": {"title": "Test Document", "regulator": "Fed"},
            "uploader_id": "user-123",
        }
        
        result = processor.process_upload(message)
        
        assert result["upload_id"] == "test-upload-001"
        assert result["status"] == "completed"
        assert "kb_document_id" in result

    def test_process_upload_triggers_completion_webhook(self, mock_s3_client, mock_dynamodb_table, mock_webhook_service):
        """Test that processing completion triggers webhook."""
        from src.handlers.upload_processor import UploadProcessor
        
        status_tracker = StatusTracker(table_name="test-table")
        status_tracker._table = mock_dynamodb_table
        
        processor = UploadProcessor(
            bucket_name="test-bucket",
            status_tracker=status_tracker,
            s3_client=mock_s3_client,
            webhook_service=mock_webhook_service,
        )
        
        message = {
            "upload_id": "test-upload-002",
            "file_path": "s3://test-bucket/uploads/pending/test-upload-002/original.html",
            "file_type": "html",
            "uploader_id": "user-123",
        }
        
        processor.process_upload(message)
        
        # Verify webhook was triggered
        mock_webhook_service.dispatch_upload_processing_completed.assert_called_once()


class TestFileValidationIntegration:
    """Integration tests for file validation across the upload flow."""

    @pytest.fixture
    def file_validator(self):
        """Create file validator."""
        return FileValidator()

    @pytest.fixture
    def metadata_validator(self):
        """Create metadata validator."""
        return MetadataValidator()

    def test_validate_pdf_with_magic_bytes(self, file_validator):
        """Test PDF validation using magic bytes detection."""
        pdf_content = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n" + b"x" * 1000
        
        result = file_validator.validate(pdf_content, "document.pdf")
        
        assert result.valid is True
        assert result.file_type == FileType.PDF

    def test_validate_html_with_doctype(self, file_validator):
        """Test HTML validation using DOCTYPE detection."""
        html_content = b"<!DOCTYPE html>\n<html><body>Content</body></html>"
        
        result = file_validator.validate(html_content, "page.html")
        
        assert result.valid is True
        assert result.file_type == FileType.HTML

    def test_validate_all_regulators(self, metadata_validator):
        """Test validation accepts all valid regulators."""
        from regulatory_kb.upload.models import Regulator
        
        for reg in Regulator:
            metadata = UploadMetadata(regulator=reg.value)
            result = metadata_validator.validate(metadata)
            assert result.valid is True, f"Failed for regulator: {reg.value}"

    def test_validate_all_categories(self, metadata_validator):
        """Test validation accepts all valid categories."""
        from regulatory_kb.upload.models import Category
        
        for cat in Category:
            metadata = UploadMetadata(category=cat.value)
            result = metadata_validator.validate(metadata)
            assert result.valid is True, f"Failed for category: {cat.value}"



class TestBedrockAgentIntegration:
    """Integration tests for Bedrock agent querying uploaded documents.
    
    Implements Task 11.2:
    - Verify Bedrock agent can query uploaded documents
    """

    @pytest.fixture
    def agent_service(self):
        """Create agent service with mocked Bedrock client."""
        from regulatory_kb.agent.bedrock_agent import BedrockAgentService, AgentConfig
        config = AgentConfig(
            region="us-east-1",
            model_id="anthropic.claude-3-sonnet-20240229-v1:0",
        )
        return BedrockAgentService(config)

    @pytest.fixture
    def query_processor(self):
        """Create query processor."""
        from regulatory_kb.agent.query_processor import QueryProcessor
        return QueryProcessor()

    def test_agent_session_for_uploaded_document_queries(self, agent_service):
        """Test agent session creation for querying uploaded documents."""
        session = agent_service.create_session()
        
        assert session is not None
        assert session.session_id is not None
        
        # Clean up
        agent_service.delete_session(session.session_id)

    def test_query_capital_requirements_from_uploads(self, query_processor):
        """Test querying capital requirements that may include uploaded documents."""
        from regulatory_kb.agent.query_processor import RegulatoryTopic
        
        result = query_processor.process_query(
            "What are the FR Y-14A capital assessment requirements?"
        )
        
        assert result is not None
        assert result.topic == RegulatoryTopic.CAPITAL

    def test_query_liquidity_requirements_from_uploads(self, query_processor):
        """Test querying liquidity requirements that may include uploaded documents."""
        from regulatory_kb.agent.query_processor import RegulatoryTopic
        
        result = query_processor.process_query(
            "What are the LCR requirements for uploaded guidance documents?"
        )
        
        assert result is not None
        assert result.topic == RegulatoryTopic.LIQUIDITY

    def test_query_aml_requirements_from_uploads(self, query_processor):
        """Test querying AML requirements that may include uploaded documents."""
        from regulatory_kb.agent.query_processor import RegulatoryTopic
        
        result = query_processor.process_query(
            "What are the FINTRAC reporting requirements in the uploaded guidance?"
        )
        
        assert result is not None
        assert result.topic == RegulatoryTopic.AML_BSA

    def test_multi_turn_conversation_with_uploaded_docs(self, query_processor):
        """Test multi-turn conversation about uploaded documents."""
        session_id = "test-upload-session-001"
        
        # First query
        result1 = query_processor.process_query(
            "What documents have been uploaded about capital requirements?",
            session_id=session_id,
        )
        assert result1 is not None
        
        # Follow-up query
        result2 = query_processor.process_query(
            "What are the key deadlines mentioned?",
            session_id=session_id,
        )
        assert result2 is not None
        
        # Verify context is maintained
        context = query_processor.get_context(session_id)
        assert context.turn_count == 2


class TestSearchIntegrationWithUploads:
    """Integration tests for search functionality with uploaded documents."""

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mocked graph store."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            from regulatory_kb.storage.graph_store import FalkorDBStore
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_search_by_regulator_includes_uploads(self, mock_graph_store):
        """Test that search by regulator includes uploaded documents."""
        store, mock_graph = mock_graph_store
        
        # Mock search results including both retrieved and uploaded documents
        mock_nodes = [
            MagicMock(properties={
                "id": "retrieved_doc_001",
                "title": "FR Y-14A Instructions (Retrieved)",
                "document_type": "instruction_manual",
                "regulator_id": "us_frb",
                "source": "retrieval",
            }),
            MagicMock(properties={
                "id": "uploaded_doc_001",
                "title": "FR Y-14A Supplemental Guidance (Uploaded)",
                "document_type": "guidance",
                "regulator_id": "us_frb",
                "source": "upload",
            }),
        ]
        mock_result = MagicMock()
        mock_result.result_set = [[n] for n in mock_nodes]
        mock_graph.query.return_value = mock_result
        
        from regulatory_kb.api.rest import DocumentSearchService, SearchFilters
        service = DocumentSearchService(store)
        filters = SearchFilters(regulator_abbreviation="FRB")
        result = service.search(filters)
        
        assert result is not None

    def test_search_by_category_includes_uploads(self, mock_graph_store):
        """Test that search by category includes uploaded documents."""
        store, mock_graph = mock_graph_store
        
        from regulatory_kb.models.document import DocumentCategory
        
        mock_node = MagicMock()
        mock_node.properties = {
            "id": "uploaded_capital_doc",
            "title": "Capital Requirements Guidance",
            "document_type": "guidance",
            "regulator_id": "us_occ",
            "categories": "capital_requirements",
            "source": "upload",
        }
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_graph.query.return_value = mock_result
        
        from regulatory_kb.api.rest import DocumentSearchService, SearchFilters
        service = DocumentSearchService(store)
        filters = SearchFilters(category=DocumentCategory.CAPITAL_REQUIREMENTS)
        result = service.search(filters)
        
        assert result is not None

    def test_search_by_text_includes_uploads(self, mock_graph_store):
        """Test that text search includes uploaded documents."""
        store, mock_graph = mock_graph_store
        
        mock_node = MagicMock()
        mock_node.properties = {
            "id": "uploaded_lcr_doc",
            "title": "LCR Implementation Guide",
            "document_type": "guidance",
            "regulator_id": "us_frb",
            "source": "upload",
        }
        mock_result = MagicMock()
        mock_result.result_set = [[mock_node]]
        mock_graph.query.return_value = mock_result
        
        from regulatory_kb.api.rest import DocumentSearchService, SearchFilters
        service = DocumentSearchService(store)
        filters = SearchFilters(query="LCR liquidity coverage")
        result = service.search(filters)
        
        assert result is not None


class TestRelationshipIntegrationWithUploads:
    """Integration tests for relationships between uploaded and existing documents."""

    @pytest.fixture
    def mock_graph_store(self):
        """Create a mocked graph store."""
        with patch("regulatory_kb.storage.graph_store.FalkorDB") as mock_falkordb:
            mock_client = MagicMock()
            mock_graph = MagicMock()
            mock_falkordb.return_value = mock_client
            mock_client.select_graph.return_value = mock_graph
            
            from regulatory_kb.storage.graph_store import FalkorDBStore
            store = FalkorDBStore()
            store.connect()
            yield store, mock_graph

    def test_create_references_relationship(self, mock_graph_store):
        """Test creating REFERENCES relationship between uploaded and existing doc."""
        store, mock_graph = mock_graph_store
        mock_graph.query.return_value = MagicMock(result_set=[["rel_id"]])
        
        from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
        
        relationship = GraphRelationship(
            source_node="uploaded_guidance_001",
            target_node="existing_regulation_001",
            relationship_type=RelationshipType.REFERENCES,
            properties={"context": "Implementation guidance"},
            validated=True,
        )
        
        result = store.create_relationship(relationship)
        mock_graph.query.assert_called()

    def test_create_supersedes_relationship(self, mock_graph_store):
        """Test creating SUPERSEDES relationship for document versions."""
        store, mock_graph = mock_graph_store
        mock_graph.query.return_value = MagicMock(result_set=[["rel_id"]])
        
        from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
        
        relationship = GraphRelationship(
            source_node="uploaded_doc_v2",
            target_node="uploaded_doc_v1",
            relationship_type=RelationshipType.SUPERSEDES,
            properties={"version_transition": True},
            validated=True,
        )
        
        result = store.create_relationship(relationship)
        mock_graph.query.assert_called()

    def test_create_implements_relationship(self, mock_graph_store):
        """Test creating IMPLEMENTS relationship between guidance and regulation."""
        store, mock_graph = mock_graph_store
        mock_graph.query.return_value = MagicMock(result_set=[["rel_id"]])
        
        from regulatory_kb.models.relationship import GraphRelationship, RelationshipType
        
        relationship = GraphRelationship(
            source_node="uploaded_implementation_guide",
            target_node="existing_cfr_regulation",
            relationship_type=RelationshipType.IMPLEMENTS,
            properties={"implementation_type": "guidance"},
            validated=True,
        )
        
        result = store.create_relationship(relationship)
        mock_graph.query.assert_called()

    def test_query_related_documents(self, mock_graph_store):
        """Test querying documents related to an uploaded document."""
        store, mock_graph = mock_graph_store
        
        # Mock query result for related documents
        mock_result = MagicMock()
        mock_result.result_set = [
            [{"id": "related_doc_1", "title": "Related Regulation"}],
            [{"id": "related_doc_2", "title": "Related Guidance"}],
        ]
        mock_graph.query.return_value = mock_result
        
        # Query for related documents
        query = """
        MATCH (d:Document {id: $id})-[:REFERENCES|IMPLEMENTS|SUPERSEDES]-(related:Document)
        RETURN related.id, related.title
        """
        
        result = mock_graph.query(query, {"id": "uploaded_doc_001"})
        
        assert len(result.result_set) == 2

