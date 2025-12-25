"""Financial Crimes Enforcement Network (FinCEN) document retrieval adapter.

Implements Requirements 4.1-4.5:
- 31 CFR 1010.311 (CTR requirements)
- 31 CFR 1020.320 (SAR requirements)
- 31 CFR Part 501 (OFAC requirements)
- SAR filing instructions and XML schemas
- FFIEC BSA/AML Exam Manual chapters
"""

from typing import Optional

from regulatory_kb.retrieval.service import BaseSourceAdapter, RetrieverConfig
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class FinCENAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from FinCEN."""

    # Document type to URL mappings
    DOCUMENT_URLS = {
        # SAR Filing Instructions (Requirement 4.4)
        "sar_instructions": [
            "https://www.fincen.gov/sites/default/files/shared/FinCEN_SAR_ElectronicFilingInstructions.pdf",
            "https://www.fincen.gov/sites/default/files/shared/FinCENSAR-XMLUserGuide.pdf",
        ],
        # SAR XML Schema
        "sar_schema": [
            "https://www.fincen.gov/sites/default/files/shared/FinCEN_SAR_Schema.xsd",
        ],
        # CTR Filing Instructions (Requirement 4.1)
        "ctr_instructions": [
            "https://www.fincen.gov/sites/default/files/shared/FinCEN_CTR_ElectronicFilingInstructions.pdf",
        ],
        # BSA E-Filing
        "bsa_efiling": [
            "https://www.fincen.gov/sites/default/files/shared/BSAEFilingRequirements.pdf",
        ],
        # AML Guidance
        "aml_guidance": [
            "https://www.fincen.gov/sites/default/files/shared/AML_CFT_Priorities.pdf",
        ],
        # Beneficial Ownership
        "beneficial_ownership": [
            "https://www.fincen.gov/sites/default/files/shared/BOI_Small_Entity_Compliance_Guide.pdf",
        ],
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the FinCEN adapter."""
        super().__init__(config)
        logger.info("fincen_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "us_fincen"

    @property
    def base_url(self) -> str:
        """Return the base URL for FinCEN."""
        return "https://www.fincen.gov"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'sar_instructions', 'ctr_instructions')

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

    def get_sar_documents(self) -> list[str]:
        """Get all SAR-related document URLs."""
        urls = []
        for doc_type in ["sar_instructions", "sar_schema"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_ctr_documents(self) -> list[str]:
        """Get all CTR-related document URLs."""
        return self.get_document_urls("ctr_instructions")

    def get_aml_documents(self) -> list[str]:
        """Get all AML-related document URLs."""
        urls = []
        for doc_type in ["aml_guidance", "bsa_efiling"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls
