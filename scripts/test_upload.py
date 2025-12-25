#!/usr/bin/env python3
"""Test script to upload a document to the knowledge base.

This script demonstrates the upload flow using local mocks for S3 and DynamoDB.
"""

import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from unittest.mock import MagicMock, patch
from regulatory_kb.upload.service import UploadService
from regulatory_kb.upload.models import UploadMetadata, UploadStatus
from regulatory_kb.upload.validator import FileValidator
from regulatory_kb.upload.status_tracker import StatusTracker
from regulatory_kb.processing.parser import DocumentParser
from regulatory_kb.processing.metadata import MetadataExtractor
from regulatory_kb.processing.chunker import DocumentChunker


def create_mock_services():
    """Create mock AWS services for local testing."""
    # Mock S3 client
    s3_client = MagicMock()
    s3_client.put_object.return_value = {"ETag": "mock-etag"}
    
    # Mock SQS client
    sqs_client = MagicMock()
    sqs_client.send_message.return_value = {"MessageId": "mock-message-id"}
    
    # Mock status tracker with in-memory storage
    status_tracker = MagicMock()
    status_tracker.records = {}
    status_tracker.table = MagicMock()
    
    def create_record(record):
        status_tracker.records[record.upload_id] = record
        return record
    
    def update_status(upload_id, status, **kwargs):
        if upload_id in status_tracker.records:
            status_tracker.records[upload_id].status = status
    
    status_tracker.create_record.side_effect = create_record
    status_tracker.update_status.side_effect = update_status
    
    return s3_client, sqs_client, status_tracker


def test_file_validation(file_path: str):
    """Test file validation."""
    print("\n" + "="*60)
    print("STEP 1: File Validation")
    print("="*60)
    
    with open(file_path, "rb") as f:
        content = f.read()
    
    validator = FileValidator()
    result = validator.validate(content, os.path.basename(file_path))
    
    print(f"File: {os.path.basename(file_path)}")
    print(f"Size: {len(content):,} bytes ({len(content)/1024/1024:.2f} MB)")
    print(f"Valid: {result.valid}")
    print(f"File Type: {result.file_type.value if result.file_type else 'Unknown'}")
    
    if not result.valid:
        print(f"Error: {result.error_message}")
        return None, None
    
    return content, result


def test_upload_service(file_path: str, content: bytes):
    """Test the upload service."""
    print("\n" + "="*60)
    print("STEP 2: Upload Service")
    print("="*60)
    
    s3_client, sqs_client, status_tracker = create_mock_services()
    
    service = UploadService(
        bucket_name="test-bucket",
        queue_url="https://sqs.us-east-1.amazonaws.com/123456789/test-queue",
        status_tracker=status_tracker,
        s3_client=s3_client,
        sqs_client=sqs_client,
    )
    
    # Create metadata
    metadata = UploadMetadata(
        title="FR 2052a Complex Institution Liquidity Monitoring Report",
        regulator="Fed",
        category="liquidity-reporting",
        effective_date="2025-02-26",
        description="Instructions for FR 2052a liquidity reporting form",
        tags=["liquidity", "FR 2052a", "Federal Reserve", "reporting"],
    )
    
    print(f"Uploading with metadata:")
    print(f"  Title: {metadata.title}")
    print(f"  Regulator: {metadata.regulator}")
    print(f"  Category: {metadata.category}")
    print(f"  Effective Date: {metadata.effective_date}")
    
    response, error_code = service.upload_document(
        file_content=content,
        file_name=os.path.basename(file_path),
        uploader_id="test-user",
        metadata=metadata,
    )
    
    print(f"\nUpload Result:")
    print(f"  Upload ID: {response.upload_id}")
    print(f"  Status: {response.status.value}")
    print(f"  Message: {response.message}")
    
    if error_code:
        print(f"  Error Code: {error_code}")
        return None
    
    # Verify S3 was called
    print(f"\nS3 Operations:")
    print(f"  put_object called: {s3_client.put_object.called}")
    print(f"  Call count: {s3_client.put_object.call_count}")
    
    # Verify SQS was called
    print(f"\nSQS Operations:")
    print(f"  send_message called: {sqs_client.send_message.called}")
    
    return response.upload_id


def test_document_parsing(file_path: str, content: bytes):
    """Test document parsing."""
    print("\n" + "="*60)
    print("STEP 3: Document Parsing")
    print("="*60)
    
    from regulatory_kb.processing.parser import DocumentParser, DocumentFormat
    
    parser = DocumentParser()
    
    # Parse the PDF
    parsed = parser.parse(content, DocumentFormat.PDF)
    
    print(f"Parsed Document:")
    print(f"  Content length: {len(parsed.text):,} characters")
    print(f"  Sections found: {len(parsed.sections)}")
    print(f"  Tables found: {len(parsed.tables)}")
    
    if parsed.sections:
        print(f"\nFirst 5 sections:")
        for i, section in enumerate(parsed.sections[:5]):
            title = section.title[:50] if section.title else "Untitled"
            print(f"  {i+1}. {section.number}: {title}")
    
    # Show content preview
    print(f"\nContent preview (first 500 chars):")
    print("-" * 40)
    print(parsed.text[:500])
    print("-" * 40)
    
    return parsed


def test_metadata_extraction(parsed_doc):
    """Test metadata extraction."""
    print("\n" + "="*60)
    print("STEP 4: Metadata Extraction")
    print("="*60)
    
    extractor = MetadataExtractor()
    
    # Extract metadata
    extracted = extractor.extract(parsed_doc.text)
    
    print(f"Extracted Metadata:")
    print(f"  Form Number: {extracted.form_number or 'Not found'}")
    print(f"  OMB Control Number: {extracted.omb_control_number or 'Not found'}")
    print(f"  CFR Section: {extracted.cfr_section or 'Not found'}")
    print(f"  Effective Date: {extracted.effective_date or 'Not found'}")
    print(f"  Filing Frequency: {extracted.filing_frequency.value if extracted.filing_frequency else 'Not found'}")
    print(f"  Filing Deadline: {extracted.filing_deadline or 'Not found'}")
    print(f"  Guideline Number: {extracted.guideline_number or 'Not found'}")
    print(f"  Threshold Amount: {extracted.threshold_amount or 'Not found'}")
    print(f"  Confidence Score: {extracted.confidence_score:.2f}")
    
    if extracted.categories:
        print(f"\nCategories:")
        for cat in extracted.categories:
            print(f"  - {cat.value if hasattr(cat, 'value') else cat}")
    
    if extracted.cross_references:
        print(f"\nCross References (first 5):")
        for ref in extracted.cross_references[:5]:
            print(f"  - {ref}")
    
    if extracted.deadlines:
        print(f"\nDeadlines:")
        for deadline in extracted.deadlines[:5]:
            print(f"  - {deadline}")
    
    return extracted


def test_document_chunking(parsed_doc, document_id: str):
    """Test document chunking."""
    print("\n" + "="*60)
    print("STEP 5: Document Chunking")
    print("="*60)
    
    chunker = DocumentChunker()
    
    # Chunk the document
    chunks = chunker.chunk_document(parsed_doc, document_id)
    
    print(f"Chunking Results:")
    print(f"  Total chunks: {len(chunks)}")
    
    if chunks:
        # Calculate stats
        token_counts = [c.token_count for c in chunks]
        print(f"  Min tokens: {min(token_counts)}")
        print(f"  Max tokens: {max(token_counts)}")
        print(f"  Avg tokens: {sum(token_counts) / len(token_counts):.0f}")
        
        # Show chunk types
        chunk_types = {}
        for c in chunks:
            ctype = c.chunk_type.value if hasattr(c.chunk_type, 'value') else str(c.chunk_type)
            chunk_types[ctype] = chunk_types.get(ctype, 0) + 1
        print(f"\nChunk types:")
        for ctype, count in chunk_types.items():
            print(f"  {ctype}: {count}")
        
        # Show first few chunks
        print(f"\nFirst 3 chunks:")
        for i, chunk in enumerate(chunks[:3]):
            print(f"\n  Chunk {i+1}:")
            print(f"    ID: {chunk.chunk_id}")
            print(f"    Type: {chunk.chunk_type.value if hasattr(chunk.chunk_type, 'value') else chunk.chunk_type}")
            print(f"    Tokens: {chunk.token_count}")
            print(f"    Section: {' > '.join(chunk.section_path) if chunk.section_path else 'N/A'}")
            print(f"    Content preview: {chunk.content[:100]}...")
    
    return chunks
    
    return chunks


def main():
    """Main test function."""
    file_path = "/Users/rampeddu/AI/KIRO/DataGovernanceAgents_V2/input/final/FR_2052a20250226_f.pdf"
    
    print("="*60)
    print("DOCUMENT UPLOAD TEST")
    print("="*60)
    print(f"File: {file_path}")
    
    # Check file exists
    if not os.path.exists(file_path):
        print(f"ERROR: File not found: {file_path}")
        return
    
    # Step 1: Validate file
    content, validation = test_file_validation(file_path)
    if content is None:
        return
    
    # Step 2: Test upload service
    upload_id = test_upload_service(file_path, content)
    if upload_id is None:
        return
    
    # Step 3: Parse document
    parsed = test_document_parsing(file_path, content)
    
    # Step 4: Extract metadata
    extracted = test_metadata_extraction(parsed)
    
    # Step 5: Chunk document
    chunks = test_document_chunking(parsed, upload_id)
    
    print("\n" + "="*60)
    print("TEST COMPLETE")
    print("="*60)
    print(f"Upload ID: {upload_id}")
    print(f"Document parsed: {len(parsed.text):,} characters")
    print(f"Chunks created: {len(chunks)}")
    print("\nThe document is ready to be stored in the knowledge base!")
    print("In production, the SQS message would trigger the upload processor")
    print("which would store the document in FalkorDB with relationships.")


if __name__ == "__main__":
    main()
