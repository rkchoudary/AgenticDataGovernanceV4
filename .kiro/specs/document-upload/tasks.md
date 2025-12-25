# Implementation Plan: Document Upload Feature

## Overview

This implementation plan extends the existing Regulatory Knowledge Base with document upload capabilities. The approach builds on the existing processing pipeline, adding upload-specific components while reusing parsing, metadata extraction, and graph storage functionality.

## Tasks

- [x] 1. Set up upload infrastructure
  - [x] 1.1 Create upload API Lambda handler
    - Add new Lambda function for upload endpoints
    - Configure API Gateway routes for upload, status, and batch endpoints
    - Set up multipart form data handling for file uploads
    - _Requirements: 1.1-1.7_

  - [x] 1.2 Create DynamoDB table for upload status tracking
    - Define schema with upload_id as partition key
    - Add GSI for uploader_id and batch_id queries
    - Configure TTL for completed uploads (30 days)
    - _Requirements: 4.1-4.5_

  - [x] 1.3 Set up S3 upload bucket structure
    - Create uploads/ prefix with pending/, processing/, completed/ folders
    - Configure lifecycle rules for cleanup
    - Set up versioning for document replacement
    - _Requirements: 1.6, 6.2_

  - [x] 1.4 Create SQS queue for upload processing
    - Configure dead letter queue for failed processing
    - Set visibility timeout for processing duration
    - Add Lambda trigger for processing queue
    - _Requirements: 1.7, 3.1_

- [x] 2. Implement file validation
  - [x] 2.1 Create file validator module
    - Implement file type detection (magic bytes, not just extension)
    - Add size validation for PDF (50MB) and HTML (10MB)
    - Create validation result model with error details
    - _Requirements: 1.1-1.5_

  - [ ]* 2.2 Write property test for file validation
    - **Property 1: File validation consistency**
    - **Validates: Requirements 1.1-1.5**

- [x] 3. Implement upload service
  - [x] 3.1 Create upload handler for single documents
    - Parse multipart form data
    - Validate file and optional metadata
    - Store file in S3 pending folder
    - Create status record in DynamoDB
    - Queue document for processing
    - Return upload_id
    - _Requirements: 1.1-1.7, 2.1_

  - [ ]* 3.2 Write property test for upload storage and queuing
    - **Property 2: Upload storage and queuing**
    - **Validates: Requirements 1.6, 1.7**

  - [x] 3.3 Create batch upload handler
    - Accept up to 20 documents per request
    - Validate each document independently
    - Return batch_id and individual document statuses
    - Handle partial success (some valid, some invalid)
    - _Requirements: 5.1-5.5_

  - [ ]* 3.4 Write property test for batch upload handling
    - **Property 8: Batch upload handling**
    - **Validates: Requirements 5.1-5.5**

- [x] 4. Implement metadata handling
  - [x] 4.1 Create metadata validator
    - Validate regulator values against known list
    - Validate category values against known list
    - Validate date formats
    - Return validation errors with field details
    - _Requirements: 2.1-2.3_

  - [ ]* 4.2 Write property test for metadata validation
    - **Property 3: Metadata validation**
    - **Validates: Requirements 2.1-2.3**

  - [x] 4.3 Implement metadata precedence logic
    - Merge user-provided and auto-extracted metadata
    - User values take precedence over extracted
    - Flag documents with missing required fields
    - _Requirements: 2.4-2.6_

  - [ ]* 4.4 Write property test for metadata extraction and precedence
    - **Property 4: Metadata extraction and precedence**
    - **Validates: Requirements 2.4-2.6**

- [x] 5. Implement document chunker
  - [x] 5.1 Create document chunker module
    - Implement structural chunking by section headers
    - Add size-based chunking with token limits (1000-4000)
    - Handle overlap between chunks (200 tokens)
    - Preserve regulatory structure boundaries
    - _Requirements: 3.1, 3.4_

  - [x] 5.2 Implement chunk metadata tracking
    - Track section path, page range, token count
    - Create navigation links between chunks
    - Store chunk relationships in graph
    - _Requirements: 3.4_

  - [ ]* 5.3 Write property test for document chunking
    - **Property 11: Document chunking consistency**
    - **Validates: Requirements 3.1, 3.4**

- [x] 6. Checkpoint - Ensure upload and chunking work end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Integrate with existing processing pipeline ✓
  - [x] 7.1 Create upload processing Lambda ✓
    - Consume messages from upload queue
    - Move file from pending to processing
    - Call existing document parser
    - Call existing metadata extractor
    - Call document chunker for large documents
    - Call existing content validator
    - Update status throughout processing
    - _Requirements: 3.1-3.4_

  - [ ]* 7.2 Write property test for processing pipeline integration
    - **Property 5: Processing pipeline integration**
    - **Validates: Requirements 3.1-3.4**

  - [x] 7.3 Implement processing error handling ✓
    - Catch and log errors at each stage
    - Update status to failed with error details
    - Move failed documents to quarantine
    - _Requirements: 3.5_

  - [ ]* 7.4 Write property test for processing error handling
    - **Property 6: Processing error handling**
    - **Validates: Requirements 3.5, 3.6**

  - [x] 7.5 Add webhook notifications for upload events ✓
    - Trigger webhook on processing complete
    - Trigger webhook on processing failed
    - Trigger webhook on document replaced
    - _Requirements: 3.6, 6.5_

- [x] 8. Implement status tracking
  - [x] 8.1 Create status query endpoints
    - GET /documents/upload/{id}/status for single document
    - GET /documents/upload/batch/{id}/status for batch
    - Return appropriate status, metadata, and error details
    - _Requirements: 4.1-4.5_

  - [ ]* 8.2 Write property test for status tracking
    - **Property 7: Status tracking consistency**
    - **Validates: Requirements 4.1-4.5**

- [x] 9. Implement version management
  - [x] 9.1 Create document replacement endpoint
    - PUT /documents/{id}/replace
    - Detect matching documents by title and regulator
    - Archive previous version in S3
    - Preserve relationships from previous version
    - _Requirements: 6.1-6.4_

  - [x] 9.2 Implement version history tracking
    - Store version metadata in DynamoDB
    - Create version relationships in graph
    - Support querying previous versions
    - _Requirements: 6.2, 6.4_

  - [ ]* 9.3 Write property test for version management
    - **Property 9: Version management**
    - **Validates: Requirements 6.1-6.5**

- [x] 10. Implement authentication and audit
  - [x] 10.1 Add authentication to upload endpoints
    - Integrate with existing API authentication
    - Validate API keys/tokens on all upload requests
    - Return 401/403 for auth failures
    - _Requirements: 7.1_

  - [x] 10.2 Create audit logging system
    - Log all upload actions with uploader identity
    - Log document modifications with before/after states
    - Store logs in CloudWatch with 7-year retention
    - _Requirements: 7.2, 7.3, 7.5_

  - [x] 10.3 Implement audit log query endpoint
    - Support filtering by uploader, date range, document ID
    - Paginate results for large log sets
    - _Requirements: 7.4_

  - [ ]* 10.4 Write property test for authentication and audit
    - **Property 10: Authentication and audit logging**
    - **Validates: Requirements 7.1-7.4**

- [x] 11. Integration testing
  - [x] 11.1 Create end-to-end upload tests
    - Test complete upload → processing → graph storage flow
    - Test batch upload with mixed valid/invalid documents
    - Test document replacement with version history
    - Test status tracking through all states
    - _Requirements: All integration points_

  - [x] 11.2 Test integration with existing system
    - Verify uploaded documents appear in search results
    - Verify relationships with existing documents
    - Verify Bedrock agent can query uploaded documents
    - _Requirements: 3.4, existing system integration_

- [x] 12. Final checkpoint - Complete upload feature validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout development
- Property tests validate universal correctness properties using Hypothesis
- The implementation reuses existing parser, metadata extractor, and validator components
- Document chunker is new but follows patterns from existing processing pipeline
