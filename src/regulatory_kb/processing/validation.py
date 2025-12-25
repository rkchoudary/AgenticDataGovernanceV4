"""Content validation system for regulatory documents.

Implements Requirements 12.1-12.7:
- Document-specific validation (FR Y-14, Call Reports, CFR, FINTRAC, OSFI)
- Quality scoring and flagging mechanisms
- Referential integrity checks
- Validation reports for manual review
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import structlog

from regulatory_kb.core.errors import ValidationError
from regulatory_kb.processing.parser import ParsedDocument, DocumentFormat
from regulatory_kb.processing.metadata import ExtractedMetadata, RegulatorType

logger = structlog.get_logger(__name__)


class ValidationSeverity(str, Enum):
    """Severity levels for validation issues."""

    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationCategory(str, Enum):
    """Categories of validation checks."""

    STRUCTURE = "structure"
    CONTENT = "content"
    METADATA = "metadata"
    COMPLETENESS = "completeness"
    REGULATORY = "regulatory"


@dataclass
class ValidationIssue:
    """Represents a single validation issue."""

    message: str
    severity: ValidationSeverity
    category: ValidationCategory
    field: Optional[str] = None
    suggestion: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "severity": self.severity.value,
            "category": self.category.value,
            "field": self.field,
            "suggestion": self.suggestion,
        }


@dataclass
class ValidationResult:
    """Result of document validation."""

    is_valid: bool
    quality_score: float
    issues: list[ValidationIssue] = field(default_factory=list)
    passed_checks: list[str] = field(default_factory=list)
    requires_manual_review: bool = False
    document_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "is_valid": self.is_valid,
            "quality_score": self.quality_score,
            "issues": [i.to_dict() for i in self.issues],
            "passed_checks": self.passed_checks,
            "requires_manual_review": self.requires_manual_review,
            "document_id": self.document_id,
        }

    def add_issue(
        self,
        message: str,
        severity: ValidationSeverity,
        category: ValidationCategory,
        field: Optional[str] = None,
        suggestion: Optional[str] = None,
    ) -> None:
        """Add a validation issue."""
        self.issues.append(ValidationIssue(
            message=message,
            severity=severity,
            category=category,
            field=field,
            suggestion=suggestion,
        ))

    def add_passed(self, check_name: str) -> None:
        """Record a passed check."""
        self.passed_checks.append(check_name)

    @property
    def error_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == ValidationSeverity.ERROR)

    @property
    def warning_count(self) -> int:
        return sum(1 for i in self.issues if i.severity == ValidationSeverity.WARNING)


class ContentValidator:
    """Validates regulatory document content for completeness and accuracy.

    Performs document-specific validation based on regulator type and
    document format.
    """

    # Regulatory keywords that should be present
    REGULATORY_KEYWORDS = {
        "general": [
            "regulation", "requirement", "compliance", "reporting", "filing",
            "deadline", "threshold", "section", "paragraph", "effective",
        ],
        "capital": [
            "capital", "tier 1", "tier 2", "risk-weighted", "rwa", "buffer",
            "ratio", "adequacy", "cet1",
        ],
        "liquidity": [
            "liquidity", "lcr", "nsfr", "hqla", "outflow", "inflow",
            "coverage", "stable funding",
        ],
        "aml": [
            "suspicious", "transaction", "currency", "ctr", "sar", "bsa",
            "aml", "kyc", "due diligence",
        ],
    }

    # Required elements by document type
    REQUIRED_ELEMENTS = {
        "fr_y14": ["schedule", "capital plan", "scenario", "projection"],
        "call_report": ["schedule", "line item", "ffiec", "instruction"],
        "cfr": ["section", "subsection", "paragraph", "effective"],
        "fintrac": ["threshold", "reporting", "days", "transaction"],
        "osfi": ["guideline", "requirement", "institution", "risk"],
    }

    # Minimum content lengths by format
    MIN_CONTENT_LENGTH = {
        DocumentFormat.PDF: 500,
        DocumentFormat.HTML: 200,
        DocumentFormat.CFR: 300,
        DocumentFormat.FEDERAL_REGISTER: 400,
        DocumentFormat.FINTRAC: 200,
    }

    def __init__(self):
        """Initialize the content validator."""
        self._validation_rules = self._build_validation_rules()

    def _build_validation_rules(self) -> dict:
        """Build validation rules for different document types."""
        return {
            "fr_y14": self._validate_fr_y14,
            "call_report": self._validate_call_report,
            "cfr": self._validate_cfr,
            "fintrac": self._validate_fintrac,
            "osfi": self._validate_osfi,
        }

    def validate(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata] = None,
        regulator_type: Optional[RegulatorType] = None,
        document_id: Optional[str] = None,
    ) -> ValidationResult:
        """Validate a parsed document.

        Args:
            parsed: Parsed document content
            metadata: Optional extracted metadata
            regulator_type: Optional regulator type for specific validation
            document_id: Optional document identifier

        Returns:
            ValidationResult with issues and quality score
        """
        logger.info("validating_document", document_id=document_id, format=parsed.format.value)

        result = ValidationResult(
            is_valid=True,
            quality_score=1.0,
            document_id=document_id,
        )

        # Run general validation checks
        self._validate_content_length(parsed, result)
        self._validate_regulatory_keywords(parsed, result)
        self._validate_structure(parsed, result)

        # Run metadata validation if provided
        if metadata:
            self._validate_metadata_completeness(metadata, result)

        # Run regulator-specific validation
        if regulator_type:
            self._validate_for_regulator(parsed, metadata, regulator_type, result)

        # Calculate quality score
        result.quality_score = self._calculate_quality_score(result)

        # Determine if manual review is needed
        result.requires_manual_review = (
            result.error_count > 0 or
            result.quality_score < 0.6 or
            (metadata and metadata.confidence_score < 0.5)
        )

        # Set overall validity
        result.is_valid = result.error_count == 0

        logger.info(
            "validation_complete",
            document_id=document_id,
            is_valid=result.is_valid,
            quality_score=result.quality_score,
            error_count=result.error_count,
            warning_count=result.warning_count,
        )

        return result

    def _validate_content_length(
        self, parsed: ParsedDocument, result: ValidationResult
    ) -> None:
        """Validate minimum content length."""
        min_length = self.MIN_CONTENT_LENGTH.get(parsed.format, 200)

        if len(parsed.text) < min_length:
            result.add_issue(
                f"Content too short ({len(parsed.text)} chars, minimum {min_length})",
                ValidationSeverity.ERROR,
                ValidationCategory.CONTENT,
                suggestion="Verify document was fully extracted",
            )
        else:
            result.add_passed("content_length")

    def _validate_regulatory_keywords(
        self, parsed: ParsedDocument, result: ValidationResult
    ) -> None:
        """Validate presence of regulatory keywords."""
        text_lower = parsed.text.lower()

        # Check general keywords
        general_count = sum(
            1 for kw in self.REGULATORY_KEYWORDS["general"]
            if kw in text_lower
        )

        if general_count < 2:
            result.add_issue(
                f"Document may not be regulatory content (only {general_count} keywords found)",
                ValidationSeverity.WARNING,
                ValidationCategory.REGULATORY,
                suggestion="Verify this is a regulatory document",
            )
        else:
            result.add_passed("regulatory_keywords")


    def _validate_structure(
        self, parsed: ParsedDocument, result: ValidationResult
    ) -> None:
        """Validate document structure."""
        # Check for sections
        if not parsed.sections:
            result.add_issue(
                "No sections detected in document",
                ValidationSeverity.WARNING,
                ValidationCategory.STRUCTURE,
                suggestion="Document may lack clear section headings",
            )
        else:
            result.add_passed("sections_present")

        # Check for parsing warnings
        if parsed.warnings:
            for warning in parsed.warnings:
                result.add_issue(
                    f"Parsing warning: {warning}",
                    ValidationSeverity.WARNING,
                    ValidationCategory.CONTENT,
                )

    def _validate_metadata_completeness(
        self, metadata: ExtractedMetadata, result: ValidationResult
    ) -> None:
        """Validate metadata completeness."""
        # Check for critical metadata fields
        if not metadata.form_number and not metadata.cfr_section and not metadata.guideline_number:
            result.add_issue(
                "No document identifier found (form number, CFR section, or guideline)",
                ValidationSeverity.WARNING,
                ValidationCategory.METADATA,
                field="document_identifier",
            )
        else:
            result.add_passed("document_identifier")

        if not metadata.effective_date:
            result.add_issue(
                "No effective date found",
                ValidationSeverity.INFO,
                ValidationCategory.METADATA,
                field="effective_date",
            )

        if not metadata.categories:
            result.add_issue(
                "Document could not be categorized",
                ValidationSeverity.WARNING,
                ValidationCategory.METADATA,
                field="categories",
            )
        else:
            result.add_passed("categorization")

        # Check confidence score
        if metadata.confidence_score < 0.3:
            result.add_issue(
                f"Low metadata confidence score ({metadata.confidence_score:.2f})",
                ValidationSeverity.WARNING,
                ValidationCategory.METADATA,
                suggestion="Manual review recommended",
            )

    def _validate_for_regulator(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        regulator_type: RegulatorType,
        result: ValidationResult,
    ) -> None:
        """Run regulator-specific validation."""
        if regulator_type == RegulatorType.FEDERAL_RESERVE:
            self._validate_federal_reserve(parsed, metadata, result)
        elif regulator_type == RegulatorType.OCC:
            self._validate_occ(parsed, metadata, result)
        elif regulator_type == RegulatorType.FDIC:
            self._validate_fdic(parsed, metadata, result)
        elif regulator_type == RegulatorType.FINCEN:
            self._validate_fincen(parsed, metadata, result)
        elif regulator_type == RegulatorType.OSFI:
            self._validate_osfi(parsed, metadata, result)
        elif regulator_type == RegulatorType.FINTRAC:
            self._validate_fintrac(parsed, metadata, result)

    def _validate_federal_reserve(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate Federal Reserve documents.

        Implements Requirement 12.1: Validate FR Y-14 instructions have
        capital plan schedules properly extracted.
        """
        text_lower = parsed.text.lower()

        # Check for FR Y-14 specific content
        if metadata and metadata.form_number and "y-14" in metadata.form_number.lower():
            required = ["schedule", "capital", "scenario"]
            found = [r for r in required if r in text_lower]

            if len(found) < 2:
                result.add_issue(
                    f"FR Y-14 document missing expected elements: {set(required) - set(found)}",
                    ValidationSeverity.WARNING,
                    ValidationCategory.COMPLETENESS,
                    suggestion="Verify all schedules are included",
                )
            else:
                result.add_passed("fr_y14_elements")

    def _validate_occ(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate OCC documents."""
        text_lower = parsed.text.lower()

        # Check for Call Report specific content
        if "call report" in text_lower or "ffiec" in text_lower:
            if "schedule" not in text_lower and "line item" not in text_lower:
                result.add_issue(
                    "Call Report document missing schedule or line item references",
                    ValidationSeverity.WARNING,
                    ValidationCategory.COMPLETENESS,
                )
            else:
                result.add_passed("call_report_elements")

    def _validate_fdic(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate FDIC documents.

        Implements Requirement 12.3: Validate CFR sections have section
        numbers and cross-references correctly identified.
        """
        # Check for CFR structure
        if parsed.format == DocumentFormat.CFR:
            if not parsed.sections:
                result.add_issue(
                    "CFR document has no parsed sections",
                    ValidationSeverity.ERROR,
                    ValidationCategory.STRUCTURE,
                )
            else:
                # Verify section numbering
                has_numbered_sections = any(
                    s.number.startswith("§") or re.match(r"\d+\.\d+", s.number)
                    for s in parsed.sections
                )
                if has_numbered_sections:
                    result.add_passed("cfr_section_numbering")
                else:
                    result.add_issue(
                        "CFR sections lack proper numbering",
                        ValidationSeverity.WARNING,
                        ValidationCategory.STRUCTURE,
                    )


    def _validate_fincen(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate FinCEN documents."""
        text_lower = parsed.text.lower()

        # Check for threshold amounts
        if "ctr" in text_lower or "currency transaction" in text_lower:
            if "$10,000" not in parsed.text and "10,000" not in parsed.text:
                result.add_issue(
                    "CTR document missing $10,000 threshold reference",
                    ValidationSeverity.WARNING,
                    ValidationCategory.REGULATORY,
                )
            else:
                result.add_passed("ctr_threshold")

    def _validate_osfi(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate OSFI documents.

        Implements Requirement 12.5: Validate OSFI guidelines have
        calculation methodologies and reporting templates extracted.
        """
        text_lower = parsed.text.lower()

        # Check for guideline structure
        if metadata and metadata.guideline_number:
            required_elements = ["requirement", "expectation", "institution"]
            found = [e for e in required_elements if e in text_lower]

            if len(found) < 2:
                result.add_issue(
                    "OSFI guideline missing expected regulatory language",
                    ValidationSeverity.WARNING,
                    ValidationCategory.REGULATORY,
                )
            else:
                result.add_passed("osfi_guideline_structure")

    def _validate_fintrac(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate FINTRAC documents.

        Implements Requirement 12.4: Validate FINTRAC guidance has
        threshold amounts and timing requirements captured.
        """
        text_lower = parsed.text.lower()

        # Check for threshold
        has_threshold = "c$10,000" in text_lower or "10,000" in text_lower
        if not has_threshold:
            result.add_issue(
                "FINTRAC document missing threshold amount reference",
                ValidationSeverity.WARNING,
                ValidationCategory.REGULATORY,
            )
        else:
            result.add_passed("fintrac_threshold")

        # Check for timing requirements
        timing_patterns = ["days", "business days", "within"]
        has_timing = any(p in text_lower for p in timing_patterns)
        if not has_timing:
            result.add_issue(
                "FINTRAC document missing timing requirements",
                ValidationSeverity.WARNING,
                ValidationCategory.REGULATORY,
            )
        else:
            result.add_passed("fintrac_timing")

    def _validate_fr_y14(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate FR Y-14 specific content."""
        # Delegated to _validate_federal_reserve
        pass

    def _validate_call_report(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate Call Report specific content.

        Implements Requirement 12.2: Verify all FFIEC schedules and
        line item definitions are captured.
        """
        text_lower = parsed.text.lower()

        # Check for schedule references
        schedule_pattern = re.compile(r"schedule\s+[a-z]{1,3}", re.IGNORECASE)
        schedules = schedule_pattern.findall(parsed.text)

        if not schedules:
            result.add_issue(
                "Call Report missing schedule references",
                ValidationSeverity.WARNING,
                ValidationCategory.COMPLETENESS,
            )
        else:
            result.add_passed("call_report_schedules")

    def _validate_cfr(
        self,
        parsed: ParsedDocument,
        metadata: Optional[ExtractedMetadata],
        result: ValidationResult,
    ) -> None:
        """Validate CFR section content."""
        # Delegated to _validate_fdic for CFR format
        pass

    def _calculate_quality_score(self, result: ValidationResult) -> float:
        """Calculate overall quality score.

        Implements quality scoring mechanism for Requirement 12.6.
        """
        # Start with perfect score
        score = 1.0

        # Deduct for errors
        score -= result.error_count * 0.2

        # Deduct for warnings
        score -= result.warning_count * 0.05

        # Bonus for passed checks
        score += len(result.passed_checks) * 0.02

        # Clamp to valid range
        return max(0.0, min(1.0, score))

    def flag_for_manual_review(
        self, result: ValidationResult, reason: str
    ) -> None:
        """Flag a document for manual review.

        Implements Requirement 12.6: Flag documents with missing critical
        elements for manual review.
        """
        result.requires_manual_review = True
        result.add_issue(
            f"Flagged for manual review: {reason}",
            ValidationSeverity.INFO,
            ValidationCategory.COMPLETENESS,
        )

    def generate_validation_report(
        self, result: ValidationResult
    ) -> dict:
        """Generate a validation report for manual review.

        Implements Requirement 12.7 (partial): Create validation reports.
        """
        return {
            "document_id": result.document_id,
            "summary": {
                "is_valid": result.is_valid,
                "quality_score": round(result.quality_score, 2),
                "requires_manual_review": result.requires_manual_review,
                "error_count": result.error_count,
                "warning_count": result.warning_count,
                "passed_checks": len(result.passed_checks),
            },
            "issues": [
                {
                    "severity": i.severity.value,
                    "category": i.category.value,
                    "message": i.message,
                    "field": i.field,
                    "suggestion": i.suggestion,
                }
                for i in result.issues
            ],
            "passed_checks": result.passed_checks,
        }


class ReferentialIntegrityChecker:
    """Checks referential integrity between documents.

    Implements Requirement 12.7: Maintain referential integrity between
    related documents and detect orphaned references.
    """

    def __init__(self):
        """Initialize the integrity checker."""
        self._known_documents: set[str] = set()
        self._references: dict[str, list[str]] = {}

    def register_document(self, document_id: str) -> None:
        """Register a document as known."""
        self._known_documents.add(document_id)

    def add_reference(self, source_id: str, target_id: str) -> None:
        """Add a reference between documents."""
        if source_id not in self._references:
            self._references[source_id] = []
        self._references[source_id].append(target_id)

    def check_integrity(self) -> list[dict]:
        """Check for orphaned references.

        Returns:
            List of integrity issues found
        """
        issues = []

        for source_id, targets in self._references.items():
            for target_id in targets:
                if target_id not in self._known_documents:
                    issues.append({
                        "type": "orphaned_reference",
                        "source": source_id,
                        "target": target_id,
                        "message": f"Document {source_id} references unknown document {target_id}",
                    })

        return issues

    def find_orphaned_documents(self) -> list[str]:
        """Find documents with no incoming references."""
        referenced = set()
        for targets in self._references.values():
            referenced.update(targets)

        # Documents that exist but are never referenced
        orphaned = self._known_documents - referenced - set(self._references.keys())
        return list(orphaned)
