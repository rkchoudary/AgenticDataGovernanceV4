"""Metadata extraction system for regulatory documents.

Implements Requirements 8.1-8.8:
- Regulator-specific metadata extraction (form numbers, dates, citations)
- NLP-based extraction for deadlines using spaCy
- Regulatory taxonomy classification
- Cross-reference identification
"""

import re
from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional

import structlog

from regulatory_kb.core.errors import MetadataExtractionError
from regulatory_kb.models.document import (
    DocumentCategory,
    DocumentMetadata,
    FilingFrequency,
)

logger = structlog.get_logger(__name__)


class RegulatorType(str, Enum):
    """Types of regulators for metadata extraction."""

    FEDERAL_RESERVE = "federal_reserve"
    OCC = "occ"
    FDIC = "fdic"
    FINCEN = "fincen"
    OSFI = "osfi"
    FINTRAC = "fintrac"
    BASEL = "basel"


@dataclass
class ExtractedMetadata:
    """Result of metadata extraction."""

    form_number: Optional[str] = None
    omb_control_number: Optional[str] = None
    cfr_section: Optional[str] = None
    effective_date: Optional[date] = None
    filing_frequency: Optional[FilingFrequency] = None
    filing_deadline: Optional[str] = None
    version: Optional[str] = None
    guideline_number: Optional[str] = None
    threshold_amount: Optional[str] = None
    last_updated: Optional[date] = None
    categories: list[DocumentCategory] = field(default_factory=list)
    cross_references: list[str] = field(default_factory=list)
    deadlines: list[str] = field(default_factory=list)
    confidence_score: float = 0.0
    warnings: list[str] = field(default_factory=list)

    def to_document_metadata(self) -> DocumentMetadata:
        """Convert to DocumentMetadata model."""
        return DocumentMetadata(
            form_number=self.form_number,
            omb_control_number=self.omb_control_number,
            cfr_section=self.cfr_section,
            effective_date=self.effective_date,
            filing_frequency=self.filing_frequency,
            filing_deadline=self.filing_deadline,
            version=self.version,
            guideline_number=self.guideline_number,
            threshold_amount=self.threshold_amount,
            last_updated=self.last_updated,
        )


class MetadataExtractor:
    """Extracts structured metadata from regulatory documents.

    Supports regulator-specific extraction patterns for Federal Reserve, OCC,
    FDIC, FinCEN, OSFI, FINTRAC, and Basel documents.
    """

    # Form number patterns by regulator
    FORM_PATTERNS = {
        RegulatorType.FEDERAL_RESERVE: [
            re.compile(r"FR\s*Y-(\d+[A-Z]?)", re.IGNORECASE),  # FR Y-14A, FR Y-9C
            re.compile(r"FR\s*(\d+[a-z]?)", re.IGNORECASE),    # FR 2052a
        ],
        RegulatorType.OCC: [
            re.compile(r"FFIEC\s*(\d+(?:/\d+)?)", re.IGNORECASE),  # FFIEC 031/041
            re.compile(r"DFAST-(\d+[A-Z]?)", re.IGNORECASE),       # DFAST-14A
        ],
        RegulatorType.FDIC: [
            re.compile(r"FFIEC\s*(\d+(?:/\d+)?)", re.IGNORECASE),
        ],
        RegulatorType.FINCEN: [
            re.compile(r"FinCEN\s+Form\s+(\d+)", re.IGNORECASE),
            re.compile(r"CTR|SAR|CMIR", re.IGNORECASE),
        ],
        RegulatorType.OSFI: [
            re.compile(r"Guideline\s+([A-Z]-\d+)", re.IGNORECASE),  # E-18, E-19
            re.compile(r"Return\s+([A-Z]+)", re.IGNORECASE),        # Return BA, LR
            re.compile(r"BCAR|LRR|LAR|NSFR", re.IGNORECASE),
        ],
        RegulatorType.FINTRAC: [
            re.compile(r"LCTR|EFTR|STR|TPR", re.IGNORECASE),
        ],
        RegulatorType.BASEL: [
            re.compile(r"BCBS\s*(\d+)", re.IGNORECASE),  # BCBS 239
        ],
    }

    # CFR section patterns
    CFR_PATTERNS = [
        re.compile(r"(\d+)\s+CFR\s+(?:Part\s+)?(\d+(?:\.\d+)*)", re.IGNORECASE),
        re.compile(r"§\s*(\d+(?:\.\d+)*)", re.IGNORECASE),
    ]

    # OMB control number pattern
    OMB_PATTERN = re.compile(r"OMB\s+(?:Control\s+)?(?:No\.|Number)[:\s]*(\d{4}-\d{4})", re.IGNORECASE)

    # Date patterns
    DATE_PATTERNS = [
        re.compile(r"(?:effective|as of|dated?)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4})", re.IGNORECASE),
        re.compile(r"(\d{1,2}/\d{1,2}/\d{4})"),
        re.compile(r"(\d{4}-\d{2}-\d{2})"),
    ]

    # Filing frequency patterns
    FREQUENCY_PATTERNS = {
        FilingFrequency.DAILY: re.compile(r"\bdaily\b", re.IGNORECASE),
        FilingFrequency.WEEKLY: re.compile(r"\bweekly\b", re.IGNORECASE),
        FilingFrequency.MONTHLY: re.compile(r"\bmonthly\b", re.IGNORECASE),
        FilingFrequency.QUARTERLY: re.compile(r"\bquarterly\b", re.IGNORECASE),
        FilingFrequency.SEMI_ANNUAL: re.compile(r"\bsemi-?annual(?:ly)?\b", re.IGNORECASE),
        FilingFrequency.ANNUAL: re.compile(r"\bannual(?:ly)?\b", re.IGNORECASE),
    }

    # Threshold patterns
    THRESHOLD_PATTERNS = [
        re.compile(r"\$\s*([\d,]+(?:\.\d{2})?)", re.IGNORECASE),  # US dollars
        re.compile(r"C\$\s*([\d,]+(?:\.\d{2})?)", re.IGNORECASE),  # Canadian dollars
    ]

    # Category keywords mapping
    CATEGORY_KEYWORDS = {
        DocumentCategory.CAPITAL_REQUIREMENTS: [
            "capital", "ccar", "dfast", "stress test", "tier 1", "tier 2",
            "risk-weighted", "car", "capital adequacy", "basel",
        ],
        DocumentCategory.LIQUIDITY_REPORTING: [
            "liquidity", "lcr", "nsfr", "hqla", "liquidity coverage",
            "net stable funding", "lar", "2052a",
        ],
        DocumentCategory.AML_COMPLIANCE: [
            "aml", "bsa", "anti-money laundering", "suspicious activity",
            "ctr", "sar", "fincen", "fintrac", "lctr", "eftr", "kyc",
        ],
        DocumentCategory.STRESS_TESTING: [
            "stress test", "scenario", "adverse", "severely adverse",
            "ccar", "dfast", "capital plan",
        ],
        DocumentCategory.RESOLUTION_PLANNING: [
            "resolution", "living will", "recovery", "wind-down",
            "orderly liquidation",
        ],
        DocumentCategory.MODEL_RISK_MANAGEMENT: [
            "model risk", "sr 11-7", "model validation", "e-23",
            "bcbs 239",
        ],
        DocumentCategory.DEPOSIT_INSURANCE: [
            "deposit insurance", "fdic", "part 370", "recordkeeping",
        ],
        DocumentCategory.CALL_REPORTS: [
            "call report", "ffiec 031", "ffiec 041", "y-9c",
            "consolidated financial",
        ],
    }

    def __init__(self, use_nlp: bool = True):
        """Initialize the metadata extractor.

        Args:
            use_nlp: Whether to use spaCy for NLP-based extraction
        """
        self.use_nlp = use_nlp
        self._nlp = None

    def _get_nlp(self):
        """Lazy load spaCy model."""
        if self._nlp is None and self.use_nlp:
            try:
                import spacy
                self._nlp = spacy.load("en_core_web_sm")
            except (ImportError, OSError) as e:
                logger.warning("spacy_not_available", error=str(e))
                self.use_nlp = False
        return self._nlp


    def extract(
        self,
        text: str,
        regulator_type: Optional[RegulatorType] = None,
        document_id: Optional[str] = None,
    ) -> ExtractedMetadata:
        """Extract metadata from document text.

        Args:
            text: Document text content
            regulator_type: Optional regulator type for targeted extraction
            document_id: Optional document identifier for logging

        Returns:
            ExtractedMetadata with all extracted fields
        """
        logger.info("extracting_metadata", regulator=regulator_type, document_id=document_id)

        metadata = ExtractedMetadata()
        fields_found = 0

        # Extract form numbers
        form_number = self._extract_form_number(text, regulator_type)
        if form_number:
            metadata.form_number = form_number
            fields_found += 1

        # Extract OMB control number
        omb = self._extract_omb_number(text)
        if omb:
            metadata.omb_control_number = omb
            fields_found += 1

        # Extract CFR sections
        cfr = self._extract_cfr_section(text)
        if cfr:
            metadata.cfr_section = cfr
            fields_found += 1

        # Extract dates
        effective_date = self._extract_effective_date(text)
        if effective_date:
            metadata.effective_date = effective_date
            fields_found += 1

        # Extract filing frequency
        frequency = self._extract_filing_frequency(text)
        if frequency:
            metadata.filing_frequency = frequency
            fields_found += 1

        # Extract filing deadline
        deadline = self._extract_filing_deadline(text)
        if deadline:
            metadata.filing_deadline = deadline
            fields_found += 1

        # Extract threshold amounts
        threshold = self._extract_threshold(text, regulator_type)
        if threshold:
            metadata.threshold_amount = threshold
            fields_found += 1

        # Extract guideline number (OSFI)
        if regulator_type == RegulatorType.OSFI:
            guideline = self._extract_osfi_guideline(text)
            if guideline:
                metadata.guideline_number = guideline
                fields_found += 1

        # Extract version
        version = self._extract_version(text)
        if version:
            metadata.version = version
            fields_found += 1

        # Classify categories
        metadata.categories = self._classify_categories(text)

        # Extract cross-references
        metadata.cross_references = self._extract_cross_references(text)

        # Extract deadlines using NLP
        if self.use_nlp:
            metadata.deadlines = self._extract_deadlines_nlp(text)

        # Calculate confidence score
        metadata.confidence_score = min(1.0, fields_found / 5.0)

        # Add warnings for missing critical fields
        if not metadata.form_number and not metadata.cfr_section:
            metadata.warnings.append("No form number or CFR section found")

        if not metadata.effective_date:
            metadata.warnings.append("No effective date found")

        logger.info(
            "metadata_extracted",
            fields_found=fields_found,
            confidence=metadata.confidence_score,
            document_id=document_id,
        )

        return metadata

    def _extract_form_number(
        self, text: str, regulator_type: Optional[RegulatorType] = None
    ) -> Optional[str]:
        """Extract form number based on regulator type."""
        patterns = []

        if regulator_type and regulator_type in self.FORM_PATTERNS:
            patterns = self.FORM_PATTERNS[regulator_type]
        else:
            # Try all patterns
            for reg_patterns in self.FORM_PATTERNS.values():
                patterns.extend(reg_patterns)

        for pattern in patterns:
            match = pattern.search(text)
            if match:
                return match.group(0).strip()

        return None

    def _extract_omb_number(self, text: str) -> Optional[str]:
        """Extract OMB control number."""
        match = self.OMB_PATTERN.search(text)
        return match.group(1) if match else None

    def _extract_cfr_section(self, text: str) -> Optional[str]:
        """Extract CFR section reference."""
        for pattern in self.CFR_PATTERNS:
            match = pattern.search(text)
            if match:
                groups = match.groups()
                if len(groups) == 2:
                    return f"{groups[0]} CFR {groups[1]}"
                return match.group(0).strip()
        return None

    def _extract_effective_date(self, text: str) -> Optional[date]:
        """Extract effective date from text."""
        from datetime import datetime

        for pattern in self.DATE_PATTERNS:
            match = pattern.search(text)
            if match:
                date_str = match.group(1)
                # Try various date formats
                for fmt in ["%B %d, %Y", "%B %d %Y", "%m/%d/%Y", "%Y-%m-%d"]:
                    try:
                        return datetime.strptime(date_str, fmt).date()
                    except ValueError:
                        continue
        return None

    def _extract_filing_frequency(self, text: str) -> Optional[FilingFrequency]:
        """Extract filing frequency from text."""
        for frequency, pattern in self.FREQUENCY_PATTERNS.items():
            if pattern.search(text):
                return frequency
        return None

    def _extract_filing_deadline(self, text: str) -> Optional[str]:
        """Extract filing deadline description."""
        deadline_patterns = [
            re.compile(r"(?:due|submit(?:ted)?|file[d]?)\s+(?:by|within|no later than)\s+(.+?)(?:\.|$)", re.IGNORECASE),
            re.compile(r"deadline[:\s]+(.+?)(?:\.|$)", re.IGNORECASE),
            re.compile(r"within\s+(\d+)\s+(business\s+)?days?", re.IGNORECASE),
        ]

        for pattern in deadline_patterns:
            match = pattern.search(text)
            if match:
                return match.group(0).strip()
        return None


    def _extract_threshold(
        self, text: str, regulator_type: Optional[RegulatorType] = None
    ) -> Optional[str]:
        """Extract threshold amounts."""
        # Check for Canadian dollars first if FINTRAC/OSFI
        if regulator_type in [RegulatorType.FINTRAC, RegulatorType.OSFI]:
            match = self.THRESHOLD_PATTERNS[1].search(text)  # C$ pattern
            if match:
                return f"C${match.group(1)}"

        # Check for US dollars
        match = self.THRESHOLD_PATTERNS[0].search(text)
        if match:
            return f"${match.group(1)}"

        return None

    def _extract_osfi_guideline(self, text: str) -> Optional[str]:
        """Extract OSFI guideline number."""
        pattern = re.compile(r"Guideline\s+([A-Z]-\d+)", re.IGNORECASE)
        match = pattern.search(text)
        return match.group(1) if match else None

    def _extract_version(self, text: str) -> Optional[str]:
        """Extract document version."""
        patterns = [
            re.compile(r"version\s*:?\s*(\d+(?:\.\d+)*)", re.IGNORECASE),
            re.compile(r"v(\d+(?:\.\d+)*)", re.IGNORECASE),
            re.compile(r"(\d{4})\s+(?:edition|update|revision)", re.IGNORECASE),
        ]

        for pattern in patterns:
            match = pattern.search(text)
            if match:
                return match.group(1)
        return None

    def _classify_categories(self, text: str) -> list[DocumentCategory]:
        """Classify document into regulatory categories."""
        text_lower = text.lower()
        categories = []

        for category, keywords in self.CATEGORY_KEYWORDS.items():
            keyword_count = sum(1 for kw in keywords if kw in text_lower)
            # Require at least 2 keyword matches for classification
            if keyword_count >= 2:
                categories.append(category)

        return categories

    def _extract_cross_references(self, text: str) -> list[str]:
        """Extract regulatory cross-references."""
        refs = set()

        # CFR references
        cfr_pattern = re.compile(r"\d+\s+CFR\s+(?:Part\s+)?\d+(?:\.\d+)*", re.IGNORECASE)
        refs.update(cfr_pattern.findall(text))

        # Section references
        section_pattern = re.compile(r"§\s*\d+(?:\.\d+)*")
        refs.update(section_pattern.findall(text))

        # USC references
        usc_pattern = re.compile(r"\d+\s+U\.?S\.?C\.?\s+§?\s*\d+", re.IGNORECASE)
        refs.update(usc_pattern.findall(text))

        # SR letter references (Federal Reserve)
        sr_pattern = re.compile(r"SR\s+\d{2}-\d+", re.IGNORECASE)
        refs.update(sr_pattern.findall(text))

        # BCBS references
        bcbs_pattern = re.compile(r"BCBS\s+\d+", re.IGNORECASE)
        refs.update(bcbs_pattern.findall(text))

        return sorted(refs)

    def _extract_deadlines_nlp(self, text: str) -> list[str]:
        """Extract deadlines using NLP (spaCy)."""
        nlp = self._get_nlp()
        if not nlp:
            return self._extract_deadlines_regex(text)

        deadlines = []

        # Process text in chunks to handle large documents
        max_length = 100000
        chunks = [text[i:i + max_length] for i in range(0, len(text), max_length)]

        for chunk in chunks:
            doc = nlp(chunk)

            # Look for date entities near deadline keywords
            deadline_keywords = ["deadline", "due", "submit", "file", "report"]

            for sent in doc.sents:
                sent_text = sent.text.lower()
                if any(kw in sent_text for kw in deadline_keywords):
                    # Extract date entities from sentence
                    for ent in sent.ents:
                        if ent.label_ == "DATE":
                            deadlines.append(f"{ent.text} ({sent.text[:100]}...)")

        return deadlines[:10]  # Limit to 10 deadlines

    def _extract_deadlines_regex(self, text: str) -> list[str]:
        """Fallback deadline extraction using regex."""
        deadlines = []

        patterns = [
            re.compile(r"(?:due|deadline|submit|file)\s+(?:by|within|no later than)\s+(.+?)(?:\.|,|$)", re.IGNORECASE),
            re.compile(r"within\s+(\d+)\s+(business\s+)?days?\s+(?:of|after|from)", re.IGNORECASE),
            re.compile(r"(\d+)\s+days?\s+(?:after|following|from)", re.IGNORECASE),
        ]

        for pattern in patterns:
            for match in pattern.finditer(text):
                deadlines.append(match.group(0).strip())

        return deadlines[:10]

    def extract_for_regulator(
        self,
        text: str,
        regulator_type: RegulatorType,
        document_id: Optional[str] = None,
    ) -> ExtractedMetadata:
        """Extract metadata with regulator-specific patterns.

        Implements Requirements 8.1-8.6, 8.8 for regulator-specific extraction.
        """
        metadata = self.extract(text, regulator_type, document_id)

        # Apply regulator-specific post-processing
        if regulator_type == RegulatorType.FEDERAL_RESERVE:
            self._enhance_federal_reserve_metadata(text, metadata)
        elif regulator_type == RegulatorType.OCC:
            self._enhance_occ_metadata(text, metadata)
        elif regulator_type == RegulatorType.FDIC:
            self._enhance_fdic_metadata(text, metadata)
        elif regulator_type == RegulatorType.FINCEN:
            self._enhance_fincen_metadata(text, metadata)
        elif regulator_type == RegulatorType.OSFI:
            self._enhance_osfi_metadata(text, metadata)
        elif regulator_type == RegulatorType.FINTRAC:
            self._enhance_fintrac_metadata(text, metadata)
        elif regulator_type == RegulatorType.BASEL:
            self._enhance_basel_metadata(text, metadata)

        return metadata


    def _enhance_federal_reserve_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for Federal Reserve documents.

        Implements Requirement 8.1: Extract form numbers (FR Y-14A, FR Y-9C),
        OMB control numbers, and reporting frequencies.
        """
        # Extract reporting frequency from FR forms
        if metadata.form_number:
            form_upper = metadata.form_number.upper()
            if "Y-14A" in form_upper:
                metadata.filing_frequency = FilingFrequency.ANNUAL
                metadata.filing_deadline = "April 5"
            elif "Y-14Q" in form_upper:
                metadata.filing_frequency = FilingFrequency.QUARTERLY
            elif "Y-14M" in form_upper:
                metadata.filing_frequency = FilingFrequency.MONTHLY
            elif "Y-9C" in form_upper:
                metadata.filing_frequency = FilingFrequency.QUARTERLY
            elif "2052A" in form_upper or "2052a" in metadata.form_number:
                metadata.filing_frequency = FilingFrequency.DAILY

    def _enhance_occ_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for OCC documents.

        Implements Requirement 8.2: Extract FFIEC form numbers, quarter/year
        information, and update dates.
        """
        # Extract quarter/year information
        quarter_pattern = re.compile(r"Q([1-4])\s*(\d{4})|(\d{4})\s*Q([1-4])", re.IGNORECASE)
        match = quarter_pattern.search(text)
        if match:
            if match.group(1):
                metadata.version = f"Q{match.group(1)} {match.group(2)}"
            else:
                metadata.version = f"Q{match.group(4)} {match.group(3)}"

    def _enhance_fdic_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for FDIC documents.

        Implements Requirement 8.3: Extract CFR section numbers, effective
        dates, and Federal Register citations.
        """
        # Extract Federal Register citation
        fr_pattern = re.compile(r"(\d+)\s+FR\s+(\d+)", re.IGNORECASE)
        match = fr_pattern.search(text)
        if match:
            if "federal_register_citation" not in [r for r in metadata.cross_references]:
                metadata.cross_references.append(f"{match.group(1)} FR {match.group(2)}")

    def _enhance_fincen_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for FinCEN documents.

        Implements Requirement 8.4: Extract CFR citations, threshold amounts
        ($10,000), and filing deadlines.
        """
        # Standard CTR threshold
        if "ctr" in text.lower() or "currency transaction" in text.lower():
            if not metadata.threshold_amount:
                metadata.threshold_amount = "$10,000"
            if not metadata.filing_deadline:
                metadata.filing_deadline = "within 15 days"

        # SAR deadline
        if "sar" in text.lower() or "suspicious activity" in text.lower():
            if not metadata.filing_deadline:
                metadata.filing_deadline = "within 30 days"

    def _enhance_osfi_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for OSFI documents.

        Implements Requirement 8.5: Extract guideline numbers (E-18, E-19, E-23),
        effective dates, and version information.
        """
        # Map guideline numbers to categories
        guideline_categories = {
            "E-18": DocumentCategory.STRESS_TESTING,
            "E-19": DocumentCategory.CAPITAL_REQUIREMENTS,
            "E-23": DocumentCategory.MODEL_RISK_MANAGEMENT,
        }

        if metadata.guideline_number:
            category = guideline_categories.get(metadata.guideline_number.upper())
            if category and category not in metadata.categories:
                metadata.categories.append(category)

    def _enhance_fintrac_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for FINTRAC documents.

        Implements Requirement 8.6: Extract reporting thresholds (C$10,000),
        filing deadlines (5 business days, 15 days), and last updated dates.
        """
        text_lower = text.lower()

        # LCTR threshold and deadline
        if "large cash" in text_lower or "lctr" in text_lower:
            if not metadata.threshold_amount:
                metadata.threshold_amount = "C$10,000"
            if not metadata.filing_deadline:
                metadata.filing_deadline = "within 15 days"

        # EFT deadline
        if "electronic funds transfer" in text_lower or "eftr" in text_lower:
            if not metadata.filing_deadline:
                metadata.filing_deadline = "within 5 business days"

        # STR deadline
        if "suspicious transaction" in text_lower or "str" in text_lower:
            if not metadata.filing_deadline:
                metadata.filing_deadline = "within 30 days"

    def _enhance_basel_metadata(
        self, text: str, metadata: ExtractedMetadata
    ) -> None:
        """Enhance metadata for Basel documents.

        Implements Requirement 8.8: Extract BCBS publication numbers, dates,
        and principle numbers.
        """
        # Extract principle numbers
        principle_pattern = re.compile(r"Principle\s+(\d+)", re.IGNORECASE)
        principles = principle_pattern.findall(text)
        if principles:
            metadata.cross_references.extend([f"Principle {p}" for p in set(principles)])

        # BCBS 239 specific
        if "bcbs 239" in text.lower() or "risk data aggregation" in text.lower():
            if DocumentCategory.MODEL_RISK_MANAGEMENT not in metadata.categories:
                metadata.categories.append(DocumentCategory.MODEL_RISK_MANAGEMENT)

    def flag_missing_fields(
        self, metadata: ExtractedMetadata, required_fields: list[str]
    ) -> list[str]:
        """Flag documents with missing critical elements.

        Implements Requirement 8.7 (partial): Flag documents with missing
        critical elements for manual review.
        """
        missing = []

        field_mapping = {
            "form_number": metadata.form_number,
            "effective_date": metadata.effective_date,
            "threshold": metadata.threshold_amount,
            "cfr_section": metadata.cfr_section,
            "filing_deadline": metadata.filing_deadline,
            "guideline_number": metadata.guideline_number,
        }

        for field in required_fields:
            if field in field_mapping and not field_mapping[field]:
                missing.append(field)
                metadata.warnings.append(f"Missing required field: {field}")

        return missing
