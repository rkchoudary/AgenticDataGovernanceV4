"""Tests for content validation system."""

import pytest

from regulatory_kb.processing.validation import (
    ContentValidator,
    ValidationResult,
    ValidationSeverity,
    ValidationCategory,
    ReferentialIntegrityChecker,
)
from regulatory_kb.processing.parser import ParsedDocument, ParsedSection, DocumentFormat
from regulatory_kb.processing.metadata import ExtractedMetadata, RegulatorType
from regulatory_kb.models.document import DocumentCategory


class TestContentValidator:
    """Tests for ContentValidator class."""

    @pytest.fixture
    def validator(self):
        return ContentValidator()

    @pytest.fixture
    def valid_regulatory_document(self):
        return ParsedDocument(
            text="""
            This regulation establishes compliance requirements for filing
            quarterly reports. The deadline for submission is 30 days after
            quarter end. See section 249.20 for threshold requirements.
            All institutions must maintain adequate capital ratios.
            """,
            sections=[
                ParsedSection(number="1", title="Purpose", content="Purpose content", level=1),
                ParsedSection(number="2", title="Requirements", content="Requirements content", level=1),
            ],
            format=DocumentFormat.HTML,
        )

    @pytest.fixture
    def valid_metadata(self):
        return ExtractedMetadata(
            form_number="FR Y-14A",
            effective_date=None,
            categories=[DocumentCategory.CAPITAL_REQUIREMENTS],
            confidence_score=0.8,
        )

    def test_validate_passes_for_valid_document(self, validator, valid_regulatory_document, valid_metadata):
        """Test validation passes for valid regulatory document."""
        result = validator.validate(valid_regulatory_document, valid_metadata)

        assert result.is_valid
        assert result.quality_score > 0.5
        assert "content_length" in result.passed_checks

    def test_validate_fails_for_short_content(self, validator):
        """Test validation fails for content that is too short."""
        short_doc = ParsedDocument(
            text="Short text",
            format=DocumentFormat.HTML,
        )
        result = validator.validate(short_doc)

        assert not result.is_valid
        assert result.error_count > 0
        assert any("too short" in i.message for i in result.issues)

    def test_validate_warns_for_non_regulatory_content(self, validator):
        """Test validation warns for non-regulatory content."""
        non_reg_doc = ParsedDocument(
            text="This is a recipe for chocolate cake. Mix flour and sugar together. " * 20,
            format=DocumentFormat.HTML,
        )
        result = validator.validate(non_reg_doc)

        assert result.warning_count > 0
        assert any("regulatory content" in i.message.lower() for i in result.issues)

    def test_validate_warns_for_missing_sections(self, validator):
        """Test validation warns when no sections are detected."""
        no_sections_doc = ParsedDocument(
            text="This regulation establishes compliance requirements for filing reports. " * 10,
            sections=[],
            format=DocumentFormat.HTML,
        )
        result = validator.validate(no_sections_doc)

        assert any("No sections" in i.message for i in result.issues)

    def test_validate_metadata_completeness(self, validator, valid_regulatory_document):
        """Test validation checks metadata completeness."""
        incomplete_metadata = ExtractedMetadata(
            confidence_score=0.2,
        )
        result = validator.validate(valid_regulatory_document, incomplete_metadata)

        assert any("document identifier" in i.message.lower() for i in result.issues)
        assert any("confidence" in i.message.lower() for i in result.issues)

    def test_validate_federal_reserve_fr_y14(self, validator):
        """Test Federal Reserve FR Y-14 specific validation."""
        fr_y14_doc = ParsedDocument(
            text="""
            FR Y-14A Capital Assessments and Stress Testing
            Schedule A: Summary
            Capital plan projections under baseline scenario
            Risk-weighted assets calculation methodology
            """ * 5,
            format=DocumentFormat.PDF,
        )
        metadata = ExtractedMetadata(
            form_number="FR Y-14A",
            confidence_score=0.8,
        )
        result = validator.validate(fr_y14_doc, metadata, RegulatorType.FEDERAL_RESERVE)

        assert "fr_y14_elements" in result.passed_checks

    def test_validate_fintrac_threshold_and_timing(self, validator):
        """Test FINTRAC validation for threshold and timing."""
        fintrac_doc = ParsedDocument(
            text="""
            Large Cash Transaction Report (LCTR) Requirements
            You must report transactions of C$10,000 or more
            within 15 business days of the transaction.
            Compliance with FINTRAC reporting requirements.
            """ * 5,
            format=DocumentFormat.FINTRAC,
        )
        result = validator.validate(fintrac_doc, regulator_type=RegulatorType.FINTRAC)

        assert "fintrac_threshold" in result.passed_checks
        assert "fintrac_timing" in result.passed_checks

    def test_validate_fincen_ctr_threshold(self, validator):
        """Test FinCEN CTR threshold validation."""
        ctr_doc = ParsedDocument(
            text="""
            Currency Transaction Report (CTR) Filing Requirements
            Financial institutions must file a CTR for each transaction
            in currency of more than $10,000.
            Filing deadline is within 15 days.
            """ * 5,
            format=DocumentFormat.HTML,
        )
        result = validator.validate(ctr_doc, regulator_type=RegulatorType.FINCEN)

        assert "ctr_threshold" in result.passed_checks

    def test_validate_osfi_guideline(self, validator):
        """Test OSFI guideline validation."""
        osfi_doc = ParsedDocument(
            text="""
            Guideline E-23: Model Risk Management
            This guideline sets out OSFI's expectations for
            federally regulated financial institutions.
            Risk management requirements and controls.
            """ * 5,
            format=DocumentFormat.PDF,
        )
        metadata = ExtractedMetadata(
            guideline_number="E-23",
            confidence_score=0.8,
        )
        result = validator.validate(osfi_doc, metadata, RegulatorType.OSFI)

        assert "osfi_guideline_structure" in result.passed_checks

    def test_quality_score_calculation(self, validator, valid_regulatory_document, valid_metadata):
        """Test quality score calculation."""
        result = validator.validate(valid_regulatory_document, valid_metadata)

        assert 0.0 <= result.quality_score <= 1.0
        # Valid document should have good score
        assert result.quality_score >= 0.6

    def test_manual_review_flagging(self, validator):
        """Test documents are flagged for manual review appropriately."""
        low_quality_doc = ParsedDocument(
            text="Short regulatory content",
            format=DocumentFormat.HTML,
        )
        result = validator.validate(low_quality_doc)

        assert result.requires_manual_review

    def test_generate_validation_report(self, validator, valid_regulatory_document, valid_metadata):
        """Test validation report generation."""
        result = validator.validate(
            valid_regulatory_document, valid_metadata, document_id="test_doc_001"
        )
        report = validator.generate_validation_report(result)

        assert report["document_id"] == "test_doc_001"
        assert "summary" in report
        assert "issues" in report
        assert "passed_checks" in report
        assert isinstance(report["summary"]["quality_score"], float)


class TestValidationResult:
    """Tests for ValidationResult class."""

    def test_add_issue(self):
        """Test adding validation issues."""
        result = ValidationResult(is_valid=True, quality_score=1.0)
        result.add_issue(
            "Test issue",
            ValidationSeverity.WARNING,
            ValidationCategory.CONTENT,
        )

        assert len(result.issues) == 1
        assert result.warning_count == 1

    def test_add_passed(self):
        """Test recording passed checks."""
        result = ValidationResult(is_valid=True, quality_score=1.0)
        result.add_passed("test_check")

        assert "test_check" in result.passed_checks

    def test_error_count(self):
        """Test error counting."""
        result = ValidationResult(is_valid=True, quality_score=1.0)
        result.add_issue("Error 1", ValidationSeverity.ERROR, ValidationCategory.CONTENT)
        result.add_issue("Warning 1", ValidationSeverity.WARNING, ValidationCategory.CONTENT)
        result.add_issue("Error 2", ValidationSeverity.ERROR, ValidationCategory.STRUCTURE)

        assert result.error_count == 2
        assert result.warning_count == 1

    def test_to_dict(self):
        """Test conversion to dictionary."""
        result = ValidationResult(
            is_valid=True,
            quality_score=0.85,
            document_id="test_doc",
        )
        result.add_passed("check1")

        d = result.to_dict()
        assert d["is_valid"] is True
        assert d["quality_score"] == 0.85
        assert d["document_id"] == "test_doc"


class TestReferentialIntegrityChecker:
    """Tests for ReferentialIntegrityChecker class."""

    @pytest.fixture
    def checker(self):
        return ReferentialIntegrityChecker()

    def test_register_document(self, checker):
        """Test document registration."""
        checker.register_document("doc1")
        checker.register_document("doc2")

        assert "doc1" in checker._known_documents
        assert "doc2" in checker._known_documents

    def test_add_reference(self, checker):
        """Test adding references."""
        checker.add_reference("doc1", "doc2")
        checker.add_reference("doc1", "doc3")

        assert "doc2" in checker._references["doc1"]
        assert "doc3" in checker._references["doc1"]

    def test_check_integrity_finds_orphaned_references(self, checker):
        """Test detection of orphaned references."""
        checker.register_document("doc1")
        checker.register_document("doc2")
        checker.add_reference("doc1", "doc2")
        checker.add_reference("doc1", "doc3")  # doc3 doesn't exist

        issues = checker.check_integrity()

        assert len(issues) == 1
        assert issues[0]["type"] == "orphaned_reference"
        assert issues[0]["target"] == "doc3"

    def test_check_integrity_passes_for_valid_references(self, checker):
        """Test no issues for valid references."""
        checker.register_document("doc1")
        checker.register_document("doc2")
        checker.register_document("doc3")
        checker.add_reference("doc1", "doc2")
        checker.add_reference("doc2", "doc3")

        issues = checker.check_integrity()

        assert len(issues) == 0

    def test_find_orphaned_documents(self, checker):
        """Test finding documents with no incoming references."""
        checker.register_document("doc1")
        checker.register_document("doc2")
        checker.register_document("doc3")
        checker.add_reference("doc1", "doc2")
        # doc3 is never referenced

        orphaned = checker.find_orphaned_documents()

        assert "doc3" in orphaned
        assert "doc2" not in orphaned
