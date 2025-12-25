"""Federal Reserve Board document retrieval adapter.

Implements Requirements 1.1-1.9:
- FR Y-14A, FR Y-14Q, FR Y-14M instruction PDFs (CCAR)
- FR Y-9C Consolidated Financial Statements instructions
- FR Y-15 Systemic Risk Report instructions
- FR 2052a Complex Institution Liquidity Monitoring Report instructions
- SR 11-7 Model Risk Management guidance
"""

from typing import Optional

from regulatory_kb.retrieval.service import BaseSourceAdapter, RetrieverConfig
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class FederalReserveAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from the Federal Reserve Board."""

    # Document type to URL mappings
    DOCUMENT_URLS = {
        # CCAR/DFAST Documents (Requirement 1.1)
        "fr_y14a": [
            "https://www.federalreserve.gov/apps/reportingforms/Download/DownloadAttachment?guid=a8c5c5e5-5c5c-4c5c-8c5c-5c5c5c5c5c5c",
            "https://www.federalreserve.gov/reportforms/forms/FR_Y-14A20231231_i.pdf",
        ],
        "fr_y14q": [
            "https://www.federalreserve.gov/reportforms/forms/FR_Y-14Q20231231_i.pdf",
        ],
        "fr_y14m": [
            "https://www.federalreserve.gov/reportforms/forms/FR_Y-14M20231231_i.pdf",
        ],
        # Financial Statements (Requirement 1.2)
        "fr_y9c": [
            "https://www.federalreserve.gov/reportforms/forms/FR_Y-9C20231231_i.pdf",
        ],
        # Systemic Risk Report (Requirement 1.3)
        "fr_y15": [
            "https://www.federalreserve.gov/reportforms/forms/FR_Y-1520231231_i.pdf",
        ],
        # Liquidity Monitoring (Requirement 1.4)
        "fr_2052a": [
            "https://www.federalreserve.gov/reportforms/forms/FR_2052a20231231_i.pdf",
        ],
        # Model Risk Management (Requirement 1.8)
        "sr_11_7": [
            "https://www.federalreserve.gov/supervisionreg/srletters/sr1107.pdf",
            "https://www.federalreserve.gov/supervisionreg/srletters/sr1107a1.pdf",
        ],
        # Capital Planning Guidance
        "capital_planning": [
            "https://www.federalreserve.gov/newsevents/pressreleases/files/bcreg20231009a1.pdf",
        ],
        # Resolution Planning (Requirement 1.7)
        "resolution_planning": [
            "https://www.federalreserve.gov/newsevents/pressreleases/files/bcreg20190404a1.pdf",
        ],
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the Federal Reserve adapter."""
        super().__init__(config)
        logger.info("federal_reserve_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "us_frb"

    @property
    def base_url(self) -> str:
        """Return the base URL for Federal Reserve."""
        return "https://www.federalreserve.gov"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'fr_y14a', 'sr_11_7')

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

    def get_ccar_documents(self) -> list[str]:
        """Get all CCAR-related document URLs."""
        urls = []
        for doc_type in ["fr_y14a", "fr_y14q", "fr_y14m"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_liquidity_documents(self) -> list[str]:
        """Get all liquidity-related document URLs."""
        return self.get_document_urls("fr_2052a")

    def get_stress_testing_documents(self) -> list[str]:
        """Get all stress testing document URLs."""
        urls = self.get_ccar_documents()
        urls.extend(self.get_document_urls("capital_planning"))
        return urls
