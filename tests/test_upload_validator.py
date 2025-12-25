"""Tests for file and metadata validation in document uploads.

Tests Requirements 1.1-1.5, 2.1-2.3:
- File type validation (PDF, HTML only)
- File size validation (PDF ≤50MB, HTML ≤10MB)
- Metadata validation (regulator, category values)
"""

import pytest

from regulatory_kb.upload.validator import (
    FileValidator,
    MetadataValidator,
    PDF_MAX_SIZE,
    HTML_MAX_SIZE,
)
from regulatory_kb.upload.models import (
    FileType,
    UploadMetadata,
    Regulator,
    Category,
)


class TestFileValidator:
    """Tests for FileValidator class."""

    @pytest.fixture
    def validator(self):
        return FileValidator()

    @pytest.fixture
    def valid_pdf_content(self):
        """Create valid PDF content with magic bytes."""
        return b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\n"

    @pytest.fixture
    def valid_html_content(self):
        """Create valid HTML content."""
        return b"<!DOCTYPE html>\n<html>\n<head><title>Test</title></head>\n<body>Content</body>\n</html>"

    # File type detection tests
    def test_detect_pdf_from_magic_bytes(self, validator, valid_pdf_content):
        """Test PDF detection using magic bytes."""
        result = validator.validate(valid_pdf_content, "document.pdf")
        
        assert result.valid is True
        assert result.file_type == FileType.PDF

    def test_detect_pdf_ignores_extension(self, validator, valid_pdf_content):
        """Test PDF detection works regardless of file extension."""
        result = validator.validate(valid_pdf_content, "document.txt")
        
        assert result.valid is True
        assert result.file_type == FileType.PDF

    def test_detect_html_from_doctype(self, validator, valid_html_content):
        """Test HTML detection using DOCTYPE."""
        result = validator.validate(valid_html_content, "page.html")
        
        assert result.valid is True
        assert result.file_type == FileType.HTML

    def test_detect_html_from_html_tag(self, validator):
        """Test HTML detection using <html> tag."""
        content = b"<html>\n<head><title>Test</title></head>\n<body>Content</body>\n</html>"
        result = validator.validate(content, "page.html")
        
        assert result.valid is True
        assert result.file_type == FileType.HTML

    def test_detect_html_case_insensitive(self, validator):
        """Test HTML detection is case insensitive."""
        content = b"<HTML>\n<HEAD><TITLE>Test</TITLE></HEAD>\n<BODY>Content</BODY>\n</HTML>"
        result = validator.validate(content, "page.html")
        
        assert result.valid is True
        assert result.file_type == FileType.HTML

    def test_reject_invalid_file_type(self, validator):
        """Test rejection of invalid file types."""
        content = b"This is just plain text content without any special markers."
        result = validator.validate(content, "document.txt")
        
        assert result.valid is False
        assert result.error_code == 400
        assert "Invalid file type" in result.error_message

    def test_reject_docx_file(self, validator):
        """Test rejection of DOCX files (ZIP-based)."""
        # DOCX files start with PK (ZIP signature)
        content = b"PK\x03\x04\x14\x00\x06\x00\x08\x00\x00\x00!\x00"
        result = validator.validate(content, "document.docx")
        
        assert result.valid is False
        assert result.error_code == 400

    def test_reject_image_file(self, validator):
        """Test rejection of image files."""
        # PNG magic bytes
        content = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
        result = validator.validate(content, "image.png")
        
        assert result.valid is False
        assert result.error_code == 400

    # File size validation tests
    def test_accept_pdf_under_size_limit(self, validator):
        """Test acceptance of PDF under 50MB."""
        content = b"%PDF-1.4\n" + b"x" * 1000
        result = validator.validate(content, "small.pdf")
        
        assert result.valid is True
        assert result.file_size == len(content)

    def test_reject_pdf_over_size_limit(self, validator):
        """Test rejection of PDF over 50MB."""
        content = b"%PDF-1.4\n" + b"x" * (PDF_MAX_SIZE + 1)
        result = validator.validate(content, "large.pdf")
        
        assert result.valid is False
        assert result.error_code == 413
        assert "50MB" in result.error_message

    def test_accept_html_under_size_limit(self, validator):
        """Test acceptance of HTML under 10MB."""
        content = b"<!DOCTYPE html>\n<html><body>" + b"x" * 1000 + b"</body></html>"
        result = validator.validate(content, "page.html")
        
        assert result.valid is True

    def test_reject_html_over_size_limit(self, validator):
        """Test rejection of HTML over 10MB."""
        content = b"<!DOCTYPE html>\n<html><body>" + b"x" * (HTML_MAX_SIZE + 1) + b"</body></html>"
        result = validator.validate(content, "large.html")
        
        assert result.valid is False
        assert result.error_code == 413
        assert "10MB" in result.error_message

    def test_pdf_at_exact_size_limit(self, validator):
        """Test PDF at exactly 50MB is accepted."""
        header = b"%PDF-1.4\n"
        content = header + b"x" * (PDF_MAX_SIZE - len(header))
        result = validator.validate(content, "exact.pdf")
        
        assert result.valid is True

    def test_html_at_exact_size_limit(self, validator):
        """Test HTML at exactly 10MB is accepted."""
        header = b"<!DOCTYPE html>\n"
        content = header + b"x" * (HTML_MAX_SIZE - len(header))
        result = validator.validate(content, "exact.html")
        
        assert result.valid is True

    # get_file_type method tests
    def test_get_file_type_pdf(self, validator, valid_pdf_content):
        """Test get_file_type returns PDF for PDF content."""
        file_type = validator.get_file_type(valid_pdf_content, "doc.pdf")
        assert file_type == FileType.PDF

    def test_get_file_type_html(self, validator, valid_html_content):
        """Test get_file_type returns HTML for HTML content."""
        file_type = validator.get_file_type(valid_html_content, "page.html")
        assert file_type == FileType.HTML

    def test_get_file_type_invalid(self, validator):
        """Test get_file_type returns None for invalid content."""
        file_type = validator.get_file_type(b"plain text", "file.txt")
        assert file_type is None


class TestMetadataValidator:
    """Tests for MetadataValidator class."""

    @pytest.fixture
    def validator(self):
        return MetadataValidator()

    # Regulator validation tests
    def test_accept_valid_regulator_fed(self, validator):
        """Test acceptance of Fed regulator."""
        metadata = UploadMetadata(regulator="Fed")
        result = validator.validate(metadata)
        assert result.valid is True

    def test_accept_valid_regulator_occ(self, validator):
        """Test acceptance of OCC regulator."""
        metadata = UploadMetadata(regulator="OCC")
        result = validator.validate(metadata)
        assert result.valid is True

    def test_accept_all_valid_regulators(self, validator):
        """Test acceptance of all valid regulators."""
        for reg in Regulator:
            metadata = UploadMetadata(regulator=reg.value)
            result = validator.validate(metadata)
            assert result.valid is True, f"Failed for regulator: {reg.value}"

    def test_reject_invalid_regulator(self, validator):
        """Test rejection of invalid regulator."""
        metadata = UploadMetadata(regulator="InvalidRegulator")
        result = validator.validate(metadata)
        
        assert result.valid is False
        assert result.error_code == 400
        assert "Invalid regulator" in result.error_message

    # Category validation tests
    def test_accept_valid_category(self, validator):
        """Test acceptance of valid category."""
        metadata = UploadMetadata(category="capital-requirements")
        result = validator.validate(metadata)
        assert result.valid is True

    def test_accept_all_valid_categories(self, validator):
        """Test acceptance of all valid categories."""
        for cat in Category:
            metadata = UploadMetadata(category=cat.value)
            result = validator.validate(metadata)
            assert result.valid is True, f"Failed for category: {cat.value}"

    def test_reject_invalid_category(self, validator):
        """Test rejection of invalid category."""
        metadata = UploadMetadata(category="invalid-category")
        result = validator.validate(metadata)
        
        assert result.valid is False
        assert result.error_code == 400
        assert "Invalid category" in result.error_message

    # Date validation tests
    def test_accept_valid_date_format(self, validator):
        """Test acceptance of valid date format."""
        metadata = UploadMetadata(effective_date="2024-01-15")
        result = validator.validate(metadata)
        assert result.valid is True

    def test_reject_invalid_date_format(self, validator):
        """Test rejection of invalid date format."""
        metadata = UploadMetadata(effective_date="01/15/2024")
        result = validator.validate(metadata)
        
        assert result.valid is False
        assert "date format" in result.error_message.lower()

    def test_reject_invalid_date_value(self, validator):
        """Test rejection of invalid date value."""
        metadata = UploadMetadata(effective_date="2024-13-45")
        result = validator.validate(metadata)
        
        assert result.valid is False

    # Combined validation tests
    def test_accept_empty_metadata(self, validator):
        """Test acceptance of empty metadata (all fields optional)."""
        metadata = UploadMetadata()
        result = validator.validate(metadata)
        assert result.valid is True

    def test_accept_partial_metadata(self, validator):
        """Test acceptance of partial metadata."""
        metadata = UploadMetadata(title="Test Document", regulator="Fed")
        result = validator.validate(metadata)
        assert result.valid is True

    def test_multiple_validation_errors(self, validator):
        """Test multiple validation errors are reported."""
        metadata = UploadMetadata(
            regulator="InvalidReg",
            category="invalid-cat",
            effective_date="bad-date"
        )
        result = validator.validate(metadata)
        
        assert result.valid is False
        # Should contain multiple error messages
        assert "regulator" in result.error_message.lower()
        assert "category" in result.error_message.lower()
