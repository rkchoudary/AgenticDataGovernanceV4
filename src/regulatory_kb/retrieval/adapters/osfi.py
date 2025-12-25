"""Office of the Superintendent of Financial Institutions (OSFI) document retrieval adapter.

Implements Requirements 5.1-5.8:
- CAR (Capital Adequacy Requirements) Guideline
- LR (Leverage Requirements) Guideline
- LAR (Liquidity Adequacy Requirements) Guideline
- Manual of Reporting Forms and Instructions for DTIs
- Guideline E-19 (ICAAP)
- Guideline E-18 (Stress Testing)
- Guideline E-23 (Model Risk Management)
- BCAR, LRR, and liquidity returns instructions
"""

from typing import Optional

from regulatory_kb.retrieval.service import BaseSourceAdapter, RetrieverConfig
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class OSFIAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from OSFI Canada."""

    # Document type to URL mappings
    DOCUMENT_URLS = {
        # Capital Adequacy Requirements (Requirement 5.1)
        "car_guideline": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/CAR24.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/Docs/CAR2024.pdf",
        ],
        # Leverage Requirements (Requirement 5.2)
        "lr_guideline": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/LR24.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/Docs/LR2024.pdf",
        ],
        # Liquidity Adequacy Requirements (Requirement 5.3)
        "lar_guideline": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/LAR24.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/Docs/LAR2024.pdf",
        ],
        # Manual of Reporting Forms (Requirement 5.4)
        "reporting_forms_manual": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rtn-rlv/fr-rf/Pages/default.aspx",
        ],
        # ICAAP Guideline E-19 (Requirement 5.5)
        "e19_icaap": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/e19.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/Docs/e19.pdf",
        ],
        # Stress Testing Guideline E-18 (Requirement 5.6)
        "e18_stress_testing": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/e18.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/Docs/e18.pdf",
        ],
        # Model Risk Management Guideline E-23 (Requirement 5.7)
        "e23_model_risk": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/e23.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/Docs/e23.pdf",
        ],
        # BCAR Return BA (Requirement 5.8)
        "bcar_return": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rtn-rlv/fr-rf/Pages/BA.aspx",
        ],
        # LRR Return LR (Requirement 5.8)
        "lrr_return": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rtn-rlv/fr-rf/Pages/LR.aspx",
        ],
        # Liquidity Returns LA and NSFR (Requirement 5.8)
        "liquidity_returns": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rtn-rlv/fr-rf/Pages/LA.aspx",
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rtn-rlv/fr-rf/Pages/NSFR.aspx",
        ],
        # Corporate Governance Guideline
        "corporate_governance": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/CG.aspx",
        ],
        # Operational Risk Guideline
        "operational_risk": [
            "https://www.osfi-bsif.gc.ca/Eng/fi-if/rg-ro/gdn-ort/gl-ld/Pages/e21.aspx",
        ],
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the OSFI adapter."""
        super().__init__(config)
        logger.info("osfi_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "ca_osfi"

    @property
    def base_url(self) -> str:
        """Return the base URL for OSFI."""
        return "https://www.osfi-bsif.gc.ca"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'car_guideline', 'e18_stress_testing')

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

    def get_capital_documents(self) -> list[str]:
        """Get all capital-related document URLs."""
        urls = []
        for doc_type in ["car_guideline", "lr_guideline", "bcar_return", "lrr_return"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_liquidity_documents(self) -> list[str]:
        """Get all liquidity-related document URLs."""
        urls = []
        for doc_type in ["lar_guideline", "liquidity_returns"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_risk_management_documents(self) -> list[str]:
        """Get all risk management document URLs."""
        urls = []
        for doc_type in ["e18_stress_testing", "e19_icaap", "e23_model_risk", "operational_risk"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_all_guidelines(self) -> list[str]:
        """Get URLs for all OSFI guidelines."""
        guideline_types = [
            "car_guideline",
            "lr_guideline",
            "lar_guideline",
            "e18_stress_testing",
            "e19_icaap",
            "e23_model_risk",
            "corporate_governance",
            "operational_risk",
        ]
        urls = []
        for doc_type in guideline_types:
            urls.extend(self.get_document_urls(doc_type))
        return urls
