"""Office of the Comptroller of the Currency (OCC) document retrieval adapter.

Implements Requirements 2.1-2.3:
- FFIEC 031/041 Call Report instruction manuals
- DFAST-14A Reporting Instructions
- 12 CFR 30 Appendix E (Recovery Plans)
"""

from typing import Optional

from regulatory_kb.retrieval.service import BaseSourceAdapter, RetrieverConfig
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class OCCAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from the OCC."""

    # Document type to URL mappings
    DOCUMENT_URLS = {
        # DFAST Reporting (Requirement 2.2)
        "dfast_14a": [
            "https://www.occ.treas.gov/publications-and-resources/forms/dfast-14a-reporting-instructions.pdf",
        ],
        # Recovery Plans (Requirement 2.3)
        "recovery_plans": [
            "https://www.occ.treas.gov/news-issuances/bulletins/2024/bulletin-2024-recovery-plans.pdf",
        ],
        # Comptroller's Handbook
        "comptrollers_handbook": [
            "https://www.occ.treas.gov/publications-and-resources/publications/comptrollers-handbook/files/large-bank-supervision/pub-ch-large-bank-supervision.pdf",
        ],
        # Stress Testing Guidance
        "stress_testing": [
            "https://www.occ.treas.gov/news-issuances/bulletins/2012/bulletin-2012-33.pdf",
        ],
        # Capital Requirements
        "capital_requirements": [
            "https://www.occ.treas.gov/topics/capital-markets/capital/capital-rules-regulations.pdf",
        ],
        # Model Risk Management
        "model_risk": [
            "https://www.occ.treas.gov/publications-and-resources/publications/comptrollers-handbook/files/model-risk-management/pub-ch-model-risk.pdf",
        ],
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the OCC adapter."""
        super().__init__(config)
        logger.info("occ_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "us_occ"

    @property
    def base_url(self) -> str:
        """Return the base URL for OCC."""
        return "https://www.occ.treas.gov"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'dfast_14a', 'recovery_plans')

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

    def get_stress_testing_documents(self) -> list[str]:
        """Get all stress testing document URLs."""
        urls = []
        for doc_type in ["dfast_14a", "stress_testing"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_capital_documents(self) -> list[str]:
        """Get all capital-related document URLs."""
        return self.get_document_urls("capital_requirements")
