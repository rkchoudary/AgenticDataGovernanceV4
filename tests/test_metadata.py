"""Tests for metadata extraction system."""

import pytest
from datetime import date

from regulatory_kb.processing.metadata import (
    MetadataExtractor,
    ExtractedMetadata,
    RegulatorType,
)
from regulatory_kb.models.document import DocumentCategory, FilingFrequency


class TestMetadataExtractor:
    """Tests for MetadataExtractor class."""

    @pytest.fixture
    def extractor(self):
        return MetadataExtractor(use_nlp=False)

    def test_extract_federal_reserve_form_number(self, extractor):
        """Test extraction of Federal Reserve form numbers."""
        text = """
        Instructions for the FR Y-14A Capital Assessments and Stress Testing
        OMB Control Number: 7100-0341
        """
        result = extractor.extract(text, RegulatorType.FEDERAL_RESERVE)

        assert result.form_number is not None
        assert "Y-14A" in result.form_number.upper()
        assert result.omb_control_number == "7100-0341"

    def test_extract_occ_form_number(self, extractor):
        """Test extraction of OCC/FFIEC form numbers."""
        text = """
        FFIEC 031/041 Call Report Instructions
        Quarterly reporting requirements for Q1 2024
        """
        result = extractor.extract(text, RegulatorType.OCC)

        assert result.form_number is not None
        assert "FFIEC" in result.form_number.upper()

    def test_extract_cfr_section(self, extractor):
        """Test extraction of CFR section references."""
        text = """
        This regulation implements 12 CFR Part 249 (Liquidity Coverage Ratio)
        and related provisions under § 249.20.
        """
        result = extractor.extract(text)

        assert result.cfr_section is not None
        assert "249" in result.cfr_section

    def test_extract_effective_date(self, extractor):
        """Test extraction of effective dates."""
        text = """
        EFFECTIVE DATE: January 1, 2024
        This rule becomes effective as of the date specified above.
        """
        result = extractor.extract(text)

        assert result.effective_date == date(2024, 1, 1)

    def test_extract_filing_frequency(self, extractor):
        """Test extraction of filing frequency."""
        text = "Banks must submit quarterly reports within 30 days of quarter end."
        result = extractor.extract(text)

        assert result.filing_frequency == FilingFrequency.QUARTERLY

    def test_extract_fincen_threshold(self, extractor):
        """Test extraction of FinCEN threshold amounts."""
        text = """
        Currency Transaction Reports (CTR) must be filed for transactions
        exceeding $10,000 in currency.
        """
        result = extractor.extract(text, RegulatorType.FINCEN)

        assert result.threshold_amount == "$10,000"

    def test_extract_fintrac_threshold(self, extractor):
        """Test extraction of FINTRAC threshold amounts."""
        text = """
        Large cash transaction reports must be filed for amounts of
        C$10,000 or more within 15 days.
        """
        result = extractor.extract(text, RegulatorType.FINTRAC)

        assert result.threshold_amount == "C$10,000"

    def test_extract_osfi_guideline(self, extractor):
        """Test extraction of OSFI guideline numbers."""
        text = """
        Guideline E-23 Model Risk Management
        This guideline establishes expectations for model risk management.
        """
        result = extractor.extract(text, RegulatorType.OSFI)

        assert result.guideline_number == "E-23"

    def test_classify_capital_requirements(self, extractor):
        """Test classification of capital requirements documents."""
        text = """
        Capital Adequacy Requirements (CAR) Guideline
        This document outlines Tier 1 and Tier 2 capital requirements
        under the Basel III framework for risk-weighted assets.
        """
        result = extractor.extract(text)

        assert DocumentCategory.CAPITAL_REQUIREMENTS in result.categories

    def test_classify_aml_compliance(self, extractor):
        """Test classification of AML compliance documents."""
        text = """
        Anti-Money Laundering (AML) Compliance Program
        Requirements for suspicious activity reporting (SAR) and
        currency transaction reports (CTR) under the BSA.
        """
        result = extractor.extract(text)

        assert DocumentCategory.AML_COMPLIANCE in result.categories

    def test_extract_cross_references(self, extractor):
        """Test extraction of regulatory cross-references."""
        text = """
        See 12 CFR Part 249 for liquidity requirements.
        Also refer to SR 11-7 for model risk guidance and
        BCBS 239 for risk data aggregation principles.
        """
        result = extractor.extract(text)

        assert len(result.cross_references) >= 2
        assert any("CFR" in ref for ref in result.cross_references)

    def test_extract_filing_deadline(self, extractor):
        """Test extraction of filing deadlines."""
        text = "Reports must be submitted within 30 days of quarter end."
        result = extractor.extract(text)

        assert result.filing_deadline is not None
        assert "30" in result.filing_deadline

    def test_enhance_federal_reserve_metadata(self, extractor):
        """Test Federal Reserve specific metadata enhancement."""
        text = "FR Y-14A Capital Assessments annual submission"
        result = extractor.extract_for_regulator(text, RegulatorType.FEDERAL_RESERVE)

        assert result.filing_frequency == FilingFrequency.ANNUAL
        assert result.filing_deadline == "April 5"

    def test_enhance_fincen_metadata(self, extractor):
        """Test FinCEN specific metadata enhancement."""
        text = "Currency Transaction Report (CTR) filing requirements"
        result = extractor.extract_for_regulator(text, RegulatorType.FINCEN)

        assert result.threshold_amount == "$10,000"
        assert "15 days" in result.filing_deadline

    def test_enhance_fintrac_metadata(self, extractor):
        """Test FINTRAC specific metadata enhancement."""
        text = "Large Cash Transaction Report (LCTR) requirements"
        result = extractor.extract_for_regulator(text, RegulatorType.FINTRAC)

        assert result.threshold_amount == "C$10,000"
        assert "15 days" in result.filing_deadline

    def test_flag_missing_fields(self, extractor):
        """Test flagging of missing required fields."""
        metadata = ExtractedMetadata()
        missing = extractor.flag_missing_fields(
            metadata, ["form_number", "effective_date", "threshold"]
        )

        assert "form_number" in missing
        assert "effective_date" in missing
        assert len(metadata.warnings) >= 2

    def test_confidence_score_calculation(self, extractor):
        """Test confidence score calculation."""
        text = """
        FR Y-14A Instructions
        OMB Control Number: 7100-0341
        Effective Date: January 1, 2024
        Annual filing deadline: April 5
        Version 2024.1
        """
        result = extractor.extract(text, RegulatorType.FEDERAL_RESERVE)

        assert result.confidence_score > 0.5

    def test_to_document_metadata(self, extractor):
        """Test conversion to DocumentMetadata model."""
        text = """
        FR Y-14A Instructions
        OMB Control Number: 7100-0341
        Effective Date: January 1, 2024
        """
        result = extractor.extract(text, RegulatorType.FEDERAL_RESERVE)
        doc_metadata = result.to_document_metadata()

        assert doc_metadata.form_number is not None
        assert doc_metadata.omb_control_number == "7100-0341"
