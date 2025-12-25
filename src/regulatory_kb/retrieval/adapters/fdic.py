"""Federal Deposit Insurance Corporation (FDIC) document retrieval adapter.

Implements Requirements 3.1-3.3:
- 12 CFR Part 370 (Deposit Recordkeeping)
- 12 CFR 360.10 (IDI Resolution Plans)
- 12 CFR Part 327 (Assessment Methodology)
- FFIEC 031/041 Call Report instruction manuals
"""

from typing import Optional

from regulatory_kb.retrieval.service import BaseSourceAdapter, RetrieverConfig
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class FDICAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from the FDIC."""

    # Document type to URL mappings
    DOCUMENT_URLS = {
        # Call Reports (Requirement 2.1 - shared with OCC)
        "call_reports": [
            "https://www.fdic.gov/resources/bankers/call-reports/call-report-instructions.pdf",
            "https://www.ffiec.gov/pdf/FFIEC_forms/FFIEC031_FFIEC041_202312_i.pdf",
        ],
        "ffiec_031": [
            "https://www.ffiec.gov/pdf/FFIEC_forms/FFIEC031_202312_i.pdf",
        ],
        "ffiec_041": [
            "https://www.ffiec.gov/pdf/FFIEC_forms/FFIEC041_202312_i.pdf",
        ],
        # Resolution Plans (Requirement 3.2)
        "resolution_plans": [
            "https://www.fdic.gov/resources/resolutions/resolution-authority/resolution-plans.pdf",
        ],
        "idi_resolution": [
            "https://www.fdic.gov/news/financial-institution-letters/2024/fil24001.pdf",
        ],
        # Deposit Insurance (Requirement 3.1)
        "deposit_insurance": [
            "https://www.fdic.gov/resources/deposit-insurance/deposit-insurance-coverage.pdf",
        ],
        # Assessment Methodology (Requirement 3.3)
        "assessment_methodology": [
            "https://www.fdic.gov/resources/deposit-insurance/deposit-insurance-assessments/assessment-methodology.pdf",
        ],
        # Risk Management
        "risk_management": [
            "https://www.fdic.gov/resources/supervision-and-examinations/examination-policies-manual/section3-1.pdf",
        ],
        # NSFR Final Rule (Requirement 1.6 - joint with Fed)
        "nsfr_rule": [
            "https://www.fdic.gov/news/financial-institution-letters/2021/fil21056.pdf",
        ],
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the FDIC adapter."""
        super().__init__(config)
        logger.info("fdic_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "us_fdic"

    @property
    def base_url(self) -> str:
        """Return the base URL for FDIC."""
        return "https://www.fdic.gov"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'call_reports', 'resolution_plans')

        Returns:
            List of URLs for the document type
        """
        urls = self.DOCUMENT_URLS.get(document_type.lower(), [])
        if not urls:
            logger.warning(
                "unknown_document_type",
                regulator=self.regulator_id,
                document_type=document_type,
                available_types=list(self.DOCUMENT_URLS.keys()),
            )
        return urls

    def get_call_report_documents(self) -> list[str]:
        """Get all Call Report document URLs."""
        urls = []
        for doc_type in ["call_reports", "ffiec_031", "ffiec_041"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_resolution_documents(self) -> list[str]:
        """Get all resolution-related document URLs."""
        urls = []
        for doc_type in ["resolution_plans", "idi_resolution"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_deposit_insurance_documents(self) -> list[str]:
        """Get all deposit insurance document URLs."""
        urls = []
        for doc_type in ["deposit_insurance", "assessment_methodology"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls
