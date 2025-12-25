"""Tests for metadata handling in document uploads.

Tests Requirements 2.4-2.6:
- Auto-extract metadata from document content when not provided
- Merge user-provided and auto-extracted metadata
- User values take precedence over extracted values
- Flag documents with missing required fields
"""

import pytest

from regulatory_kb.upload.metadata_handler import (
    MetadataHandler,
    MergedMetadata,
    REQUIRED_METADATA_FIELDS,
)
from regulatory_kb.upload.models import UploadMetadata
from regulatory_kb.processing.metadata import ExtractedMetadata
from regulatory_kb.models.document import DocumentCategory


class TestMetadataHandler:
    """Tests for MetadataHandler class."""

    @pytest.fixture
    def handler(self):
        return MetadataHandler()

    @pytest.fixture
    def sample_document_text(self):
        """Sample regulatory document text for extraction."""
        return """
        FR 2052a Complex Institution Liquidity Monitoring Report
        
        Effective Date: January 1, 2024
        
        This report is filed quarterly by large financial institutions.
        The liquidity coverage ratio (LCR) requirements apply to all
        institutions with total consolidated assets of $250 billion or more.
        
        12 CFR Part 249 - Liquidity Risk Measurement Standards
        """

    # Test metadata extraction
    def test_extract_metadata_from_document(self, handler, sample_document_text):
        """Test metadata extraction from document text."""
        result = handler.process_metadata(
            document_text=sample_document_text,
            user_metadata=None,
            document_id="test-doc-1",
        )
        
        # Should have extracted some metadata
        assert result.extraction_confidence > 0
        # Category should be extracted (liquidity-related)
        assert "category" in result.auto_extracted_fields or result.category is not None

    def test_extract_metadata_flags_missing_required(self, handler):
        """Test that missing required fields are flagged."""
        result = handler.process_metadata(
            document_text="Some generic text without regulatory content",
            user_metadata=None,
            document_id="test-doc-2",
        )
        
        # Should flag for manual review due to missing required fields
        assert result.requires_manual_review is True
        assert len(result.missing_required_fields) > 0

    # Test user metadata precedence
    def test_user_metadata_takes_precedence(self, handler, sample_document_text):
        """Test that user-provided metadata takes precedence over extracted."""
        user_metadata = UploadMetadata(
            title="My Custom Title",
            regulator="OCC",
            category="capital-requirements",
            effective_date="2024-06-15",
        )
        
        result = handler.process_metadata(
            document_text=sample_document_text,
            user_metadata=user_metadata,
            document_id="test-doc-3",
        )
        
        # User values should be used
        assert result.title == "My Custom Title"
        assert result.regulator == "OCC"
        assert result.category == "capital-requirements"
        assert result.effective_date == "2024-06-15"
        
        # Should track user-provided fields
        assert "title" in result.user_provided_fields
        assert "regulator" in result.user_provided_fields
        assert "category" in result.user_provided_fields
        assert "effective_date" in result.user_provided_fields

    def test_partial_user_metadata_merged_with_extracted(self, handler, sample_document_text):
        """Test partial user metadata is merged with extracted values."""
        user_metadata = UploadMetadata(
            title="My Document Title",
            regulator="Fed",
        )
        
        result = handler.process_metadata(
            document_text=sample_document_text,
            user_metadata=user_metadata,
            document_id="test-doc-4",
        )
        
        # User values should be used
        assert result.title == "My Document Title"
        assert result.regulator == "Fed"
        assert "title" in result.user_provided_fields
        assert "regulator" in result.user_provided_fields

    # Test missing required fields detection
    def test_complete_metadata_not_flagged(self, handler):
        """Test that complete metadata is not flagged for review."""
        user_metadata = UploadMetadata(
            title="Complete Document",
            regulator="Fed",
            category="liquidity-reporting",
        )
        
        result = handler.process_metadata(
            document_text="Some text",
            user_metadata=user_metadata,
            document_id="test-doc-5",
        )
        
        # Should not require manual review
        assert result.requires_manual_review is False
        assert len(result.missing_required_fields) == 0

    def test_missing_title_flagged(self, handler):
        """Test that missing title is flagged."""
        user_metadata = UploadMetadata(
            regulator="Fed",
            category="liquidity-reporting",
        )
        
        result = handler.process_metadata(
            document_text="Some text",
            user_metadata=user_metadata,
            document_id="test-doc-6",
        )
        
        assert "title" in result.missing_required_fields
        assert result.requires_manual_review is True

    def test_missing_regulator_flagged(self, handler):
        """Test that missing regulator is flagged."""
        user_metadata = UploadMetadata(
            title="Document Title",
            category="liquidity-reporting",
        )
        
        result = handler.process_metadata(
            document_text="Some text",
            user_metadata=user_metadata,
            document_id="test-doc-7",
        )
        
        assert "regulator" in result.missing_required_fields
        assert result.requires_manual_review is True

    def test_missing_category_flagged(self, handler):
        """Test that missing category is flagged."""
        user_metadata = UploadMetadata(
            title="Document Title",
            regulator="Fed",
        )
        
        result = handler.process_metadata(
            document_text="Some text",
            user_metadata=user_metadata,
            document_id="test-doc-8",
        )
        
        assert "category" in result.missing_required_fields
        assert result.requires_manual_review is True

    # Test merge_with_precedence method
    def test_merge_with_precedence_direct(self, handler):
        """Test direct merge without re-extraction."""
        user_metadata = UploadMetadata(
            title="User Title",
            category="aml-compliance",
        )
        
        extracted = ExtractedMetadata(
            categories=[DocumentCategory.LIQUIDITY_REPORTING],
            confidence_score=0.8,
        )
        
        result = handler.merge_with_precedence(user_metadata, extracted)
        
        # User category should take precedence
        assert result.category == "aml-compliance"
        assert "category" in result.user_provided_fields

    def test_merge_uses_extracted_when_user_empty(self, handler):
        """Test that extracted values are used when user doesn't provide them."""
        user_metadata = UploadMetadata(
            title="User Title",
        )
        
        extracted = ExtractedMetadata(
            categories=[DocumentCategory.CAPITAL_REQUIREMENTS],
            confidence_score=0.7,
        )
        
        result = handler.merge_with_precedence(user_metadata, extracted)
        
        # Extracted category should be used
        assert result.category == "capital-requirements"
        assert "category" in result.auto_extracted_fields

    # Test flag_for_review method
    def test_flag_for_review(self, handler):
        """Test manual flagging for review."""
        merged = MergedMetadata(
            title="Test",
            regulator="Fed",
            category="other",
        )
        
        result = handler.flag_for_review(merged, "Low confidence extraction")
        
        assert result.requires_manual_review is True
        assert "Low confidence extraction" in result.extraction_warnings[-1]

    # Test to_dict conversion
    def test_merged_metadata_to_dict(self):
        """Test MergedMetadata to_dict conversion."""
        merged = MergedMetadata(
            title="Test Document",
            regulator="Fed",
            category="liquidity-reporting",
            effective_date="2024-01-15",
            user_provided_fields=["title", "regulator"],
            auto_extracted_fields=["category"],
            extraction_confidence=0.85,
        )
        
        result = merged.to_dict()
        
        assert result["title"] == "Test Document"
        assert result["regulator"] == "Fed"
        assert result["category"] == "liquidity-reporting"
        assert result["user_provided_fields"] == ["title", "regulator"]
        assert result["auto_extracted_fields"] == ["category"]
        assert result["extraction_confidence"] == 0.85

    # Test to_upload_metadata conversion
    def test_merged_metadata_to_upload_metadata(self):
        """Test MergedMetadata to UploadMetadata conversion."""
        merged = MergedMetadata(
            title="Test Document",
            regulator="Fed",
            category="liquidity-reporting",
            effective_date="2024-01-15",
            description="Test description",
            tags=["tag1", "tag2"],
        )
        
        result = merged.to_upload_metadata()
        
        assert isinstance(result, UploadMetadata)
        assert result.title == "Test Document"
        assert result.regulator == "Fed"
        assert result.category == "liquidity-reporting"
        assert result.effective_date == "2024-01-15"
        assert result.description == "Test description"
        assert result.tags == ["tag1", "tag2"]


class TestFieldValidationDetails:
    """Tests for detailed field validation in MetadataValidator."""

    @pytest.fixture
    def validator(self):
        from regulatory_kb.upload.validator import MetadataValidator
        return MetadataValidator()

    def test_validate_with_details_returns_field_errors(self, validator):
        """Test that validate_with_details returns field-level errors."""
        metadata = UploadMetadata(
            regulator="InvalidReg",
            category="invalid-cat",
        )
        
        result = validator.validate_with_details(metadata)
        
        assert result.valid is False
        assert len(result.field_errors) == 2
        
        # Check field error details
        field_names = [e.field_name for e in result.field_errors]
        assert "regulator" in field_names
        assert "category" in field_names

    def test_field_error_includes_provided_value(self, validator):
        """Test that field errors include the provided value."""
        metadata = UploadMetadata(regulator="BadRegulator")
        
        result = validator.validate_with_details(metadata)
        
        assert result.valid is False
        error = result.field_errors[0]
        assert error.provided_value == "BadRegulator"

    def test_field_error_includes_allowed_values(self, validator):
        """Test that field errors include allowed values."""
        metadata = UploadMetadata(regulator="BadRegulator")
        
        result = validator.validate_with_details(metadata)
        
        error = result.field_errors[0]
        assert error.allowed_values is not None
        assert "Fed" in error.allowed_values
        assert "OCC" in error.allowed_values

    def test_validate_single_regulator(self, validator):
        """Test single regulator validation."""
        # Valid regulator
        assert validator.validate_regulator("Fed") is None
        
        # Invalid regulator
        error = validator.validate_regulator("Invalid")
        assert error is not None
        assert error.field_name == "regulator"

    def test_validate_single_category(self, validator):
        """Test single category validation."""
        # Valid category
        assert validator.validate_category("capital-requirements") is None
        
        # Invalid category
        error = validator.validate_category("invalid")
        assert error is not None
        assert error.field_name == "category"

    def test_validate_single_date(self, validator):
        """Test single date validation."""
        # Valid date
        assert validator.validate_date("2024-01-15") is None
        
        # Invalid date format
        error = validator.validate_date("01/15/2024")
        assert error is not None
        assert error.field_name == "effective_date"
