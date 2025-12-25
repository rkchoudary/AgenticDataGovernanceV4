"""File and metadata validation for document uploads.

Implements Requirements 1.1-1.5, 2.1-2.3:
- File type validation (PDF, HTML only)
- File size validation (PDF ≤50MB, HTML ≤10MB)
- Metadata validation (regulator, category values)
"""

from dataclasses import dataclass, field
from typing import Optional

from regulatory_kb.upload.models import (
    FileType,
    ValidationResult,
    UploadMetadata,
    Regulator,
    Category,
)


@dataclass
class FieldValidationError:
    """Represents a validation error for a specific field.
    
    Implements Requirements 2.1-2.3:
    - Provides detailed error information per field
    """
    field_name: str
    error_message: str
    provided_value: Optional[str] = None
    allowed_values: Optional[list[str]] = None


@dataclass
class MetadataValidationResult:
    """Result of metadata validation with field-level details.
    
    Implements Requirements 2.1-2.3:
    - Returns validation errors with field details
    """
    valid: bool
    error_code: Optional[int] = None
    error_message: Optional[str] = None
    field_errors: list[FieldValidationError] = field(default_factory=list)
    
    def to_validation_result(self) -> ValidationResult:
        """Convert to standard ValidationResult for API compatibility."""
        return ValidationResult(
            valid=self.valid,
            error_code=self.error_code,
            error_message=self.error_message,
        )


# File size limits in bytes
PDF_MAX_SIZE = 50 * 1024 * 1024  # 50MB
HTML_MAX_SIZE = 10 * 1024 * 1024  # 10MB

# Magic bytes for file type detection
PDF_MAGIC = b"%PDF"
HTML_SIGNATURES = [b"<!DOCTYPE", b"<html", b"<HTML", b"<!doctype"]


class FileValidator:
    """Validates uploaded files for type and size.
    
    Implements Requirements 1.1-1.5:
    - Accepts PDF files up to 50MB
    - Accepts HTML files up to 10MB
    - Validates file type from content (magic bytes)
    - Returns appropriate error codes (400, 413)
    """

    def validate(self, file_content: bytes, file_name: str) -> ValidationResult:
        """Validate an uploaded file.
        
        Args:
            file_content: Raw file content
            file_name: Original file name
            
        Returns:
            ValidationResult with validation status and details
        """
        file_size = len(file_content)
        
        # Detect file type from content
        file_type = self._detect_file_type(file_content, file_name)
        
        if file_type is None:
            return ValidationResult(
                valid=False,
                error_code=400,
                error_message="Invalid file type. Only PDF and HTML files are accepted.",
                file_size=file_size,
            )
        
        # Validate size based on file type
        if file_type == FileType.PDF:
            if file_size > PDF_MAX_SIZE:
                return ValidationResult(
                    valid=False,
                    error_code=413,
                    error_message=f"File exceeds maximum size of 50MB for PDF files.",
                    file_type=file_type,
                    file_size=file_size,
                )
        elif file_type == FileType.HTML:
            if file_size > HTML_MAX_SIZE:
                return ValidationResult(
                    valid=False,
                    error_code=413,
                    error_message=f"File exceeds maximum size of 10MB for HTML files.",
                    file_type=file_type,
                    file_size=file_size,
                )
        
        return ValidationResult(
            valid=True,
            file_type=file_type,
            file_size=file_size,
        )

    def _detect_file_type(self, content: bytes, file_name: str) -> Optional[FileType]:
        """Detect file type from content magic bytes.
        
        Uses magic bytes for detection, not just file extension.
        
        Args:
            content: File content
            file_name: Original file name (used as fallback)
            
        Returns:
            FileType if valid, None if invalid
        """
        # Check for PDF magic bytes
        if content.startswith(PDF_MAGIC):
            return FileType.PDF
        
        # Check for HTML signatures
        content_start = content[:100].strip()
        for sig in HTML_SIGNATURES:
            if content_start.lower().startswith(sig.lower()):
                return FileType.HTML
        
        # Fallback to extension check for HTML (some HTML files may not have DOCTYPE)
        lower_name = file_name.lower()
        if lower_name.endswith(".html") or lower_name.endswith(".htm"):
            # Additional check: should contain HTML-like content
            if b"<" in content and b">" in content:
                return FileType.HTML
        
        return None

    def get_file_type(self, content: bytes, file_name: str) -> Optional[FileType]:
        """Get file type from content.
        
        Args:
            content: File content
            file_name: Original file name
            
        Returns:
            FileType if valid, None if invalid
        """
        return self._detect_file_type(content, file_name)


class MetadataValidator:
    """Validates upload metadata.
    
    Implements Requirements 2.1-2.3:
    - Validates regulator values against known list
    - Validates category values against known list
    - Validates date formats
    - Returns validation errors with field details
    """
    
    VALID_REGULATORS = {r.value for r in Regulator}
    VALID_CATEGORIES = {c.value for c in Category}

    def validate(self, metadata: UploadMetadata) -> ValidationResult:
        """Validate upload metadata.
        
        Args:
            metadata: Metadata to validate
            
        Returns:
            ValidationResult with validation status
        """
        detailed_result = self.validate_with_details(metadata)
        return detailed_result.to_validation_result()

    def validate_with_details(self, metadata: UploadMetadata) -> MetadataValidationResult:
        """Validate upload metadata with detailed field-level errors.
        
        Implements Requirements 2.1-2.3:
        - Validates regulator values against known list
        - Validates category values against known list
        - Validates date formats
        - Returns validation errors with field details
        
        Args:
            metadata: Metadata to validate
            
        Returns:
            MetadataValidationResult with field-level error details
        """
        field_errors: list[FieldValidationError] = []
        
        # Validate regulator if provided
        if metadata.regulator and metadata.regulator not in self.VALID_REGULATORS:
            field_errors.append(
                FieldValidationError(
                    field_name="regulator",
                    error_message=f"Invalid regulator value",
                    provided_value=metadata.regulator,
                    allowed_values=sorted(self.VALID_REGULATORS),
                )
            )
        
        # Validate category if provided
        if metadata.category and metadata.category not in self.VALID_CATEGORIES:
            field_errors.append(
                FieldValidationError(
                    field_name="category",
                    error_message=f"Invalid category value",
                    provided_value=metadata.category,
                    allowed_values=sorted(self.VALID_CATEGORIES),
                )
            )
        
        # Validate effective_date format if provided
        if metadata.effective_date:
            if not self._is_valid_date(metadata.effective_date):
                field_errors.append(
                    FieldValidationError(
                        field_name="effective_date",
                        error_message="Invalid date format. Use YYYY-MM-DD",
                        provided_value=metadata.effective_date,
                    )
                )
        
        if field_errors:
            # Build combined error message
            error_messages = []
            for err in field_errors:
                if err.allowed_values:
                    error_messages.append(
                        f"Invalid {err.field_name}. Must be one of: {', '.join(err.allowed_values)}"
                    )
                else:
                    error_messages.append(err.error_message)
            
            return MetadataValidationResult(
                valid=False,
                error_code=400,
                error_message="; ".join(error_messages),
                field_errors=field_errors,
            )
        
        return MetadataValidationResult(valid=True)

    def validate_regulator(self, regulator: str) -> Optional[FieldValidationError]:
        """Validate a single regulator value.
        
        Args:
            regulator: Regulator value to validate
            
        Returns:
            FieldValidationError if invalid, None if valid
        """
        if regulator not in self.VALID_REGULATORS:
            return FieldValidationError(
                field_name="regulator",
                error_message="Invalid regulator value",
                provided_value=regulator,
                allowed_values=sorted(self.VALID_REGULATORS),
            )
        return None

    def validate_category(self, category: str) -> Optional[FieldValidationError]:
        """Validate a single category value.
        
        Args:
            category: Category value to validate
            
        Returns:
            FieldValidationError if invalid, None if valid
        """
        if category not in self.VALID_CATEGORIES:
            return FieldValidationError(
                field_name="category",
                error_message="Invalid category value",
                provided_value=category,
                allowed_values=sorted(self.VALID_CATEGORIES),
            )
        return None

    def validate_date(self, date_str: str) -> Optional[FieldValidationError]:
        """Validate a single date value.
        
        Args:
            date_str: Date string to validate (expected format: YYYY-MM-DD)
            
        Returns:
            FieldValidationError if invalid, None if valid
        """
        if not self._is_valid_date(date_str):
            return FieldValidationError(
                field_name="effective_date",
                error_message="Invalid date format. Use YYYY-MM-DD",
                provided_value=date_str,
            )
        return None

    def _is_valid_date(self, date_str: str) -> bool:
        """Check if date string is valid YYYY-MM-DD format."""
        import re
        from datetime import datetime
        
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
            return False
        
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
            return True
        except ValueError:
            return False
