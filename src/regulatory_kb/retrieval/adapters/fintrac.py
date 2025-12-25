"""Financial Transactions and Reports Analysis Centre of Canada (FINTRAC) adapter.

Implements Requirements 6.1-6.5:
- LCTR (Large Cash Transaction Reports) guidance
- EFTR (Electronic Funds Transfer Reports) guidance
- STR (Suspicious Transaction Reports) guidance
- TPR (Terrorist Property Reports) guidance
- PCMLTFA Act sections and SOR/2002-184 regulations
"""

from typing import Optional
from datetime import datetime, timezone

import aiohttp
from bs4 import BeautifulSoup

from regulatory_kb.retrieval.service import (
    BaseSourceAdapter,
    RetrieverConfig,
    RetrievalResult,
    RetrievalStatus,
    ContentType,
)
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class FINTRACAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from FINTRAC Canada via web scraping."""

    # Document type to URL mappings
    DOCUMENT_URLS = {
        # LCTR Guidance (Requirement 6.1)
        "lctr_guidance": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/transaction-operation/lctr-doie/lctr-doie-eng",
        ],
        # EFTR Guidance (Requirement 6.2)
        "eftr_guidance": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/transaction-operation/eft-dt/eft-dt-eng",
        ],
        # STR Guidance (Requirement 6.3)
        "str_guidance": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/transaction-operation/str-dod/str-dod-eng",
        ],
        # TPR Guidance (Requirement 6.4)
        "tpr_guidance": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/transaction-operation/tpr-dbt/tpr-dbt-eng",
        ],
        # General Reporting Guidance
        "reporting_guidance": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/overview-apercu/FINS/1-eng",
        ],
        # Record Keeping Requirements
        "record_keeping": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/recordkeeping-document/record/record-eng",
        ],
        # Client Identification
        "client_identification": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/client-clientele/client/client-eng",
        ],
        # Risk Assessment
        "risk_assessment": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/rba/rba-eng",
        ],
        # Compliance Program
        "compliance_program": [
            "https://www.fintrac-canafe.gc.ca/guidance-directives/compliance-conformite/Guide/Guide-eng",
        ],
    }

    # Justice Canada legal references (Requirement 6.5)
    LEGAL_REFERENCES = {
        # PCMLTFA Act
        "pcmltfa_act": [
            "https://laws-lois.justice.gc.ca/eng/acts/P-24.501/",
            "https://laws-lois.justice.gc.ca/PDF/P-24.501.pdf",
        ],
        # SOR/2002-184 Regulations
        "pcmltf_regulations": [
            "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2002-184/",
            "https://laws-lois.justice.gc.ca/PDF/SOR-2002-184.pdf",
        ],
        # SOR/2001-317 (Cross-border Currency)
        "cross_border_currency": [
            "https://laws-lois.justice.gc.ca/eng/regulations/SOR-2001-317/",
        ],
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys()) + list(LEGAL_REFERENCES.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the FINTRAC adapter."""
        super().__init__(config)
        logger.info("fintrac_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "ca_fintrac"

    @property
    def base_url(self) -> str:
        """Return the base URL for FINTRAC."""
        return "https://www.fintrac-canafe.gc.ca"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'lctr_guidance', 'pcmltfa_act')

        Returns:
            List of URLs for the document type
        """
        doc_type_lower = document_type.lower()

        # Check FINTRAC guidance URLs first
        urls = self.DOCUMENT_URLS.get(doc_type_lower, [])
        if urls:
            return urls

        # Check legal references
        urls = self.LEGAL_REFERENCES.get(doc_type_lower, [])
        if urls:
            return urls

        logger.warning(
            "unknown_document_type",
            regulator=self.regulator_id,
            document_type=document_type,
            available_types=list(self.DOCUMENT_URLS.keys()) + list(self.LEGAL_REFERENCES.keys()),
        )
        return []


    async def scrape_guidance_page(
        self,
        url: str,
        session: aiohttp.ClientSession,
    ) -> RetrievalResult:
        """Scrape a FINTRAC guidance page and extract main content.

        Args:
            url: URL of the guidance page
            session: aiohttp session to use

        Returns:
            RetrievalResult with extracted content
        """
        result = await self.retrieve(url, session)

        if result.status != RetrievalStatus.SUCCESS or not result.content:
            return result

        try:
            # Parse HTML and extract main content
            soup = BeautifulSoup(result.content, "html.parser")

            # Remove navigation, headers, footers
            for element in soup.find_all(["nav", "header", "footer", "aside"]):
                element.decompose()

            # Find main content area
            main_content = soup.find("main") or soup.find("article") or soup.find("div", {"id": "wb-cont"})

            if main_content:
                # Extract text while preserving structure
                extracted_text = self._extract_structured_text(main_content)

                # Update result with extracted content
                result.content = extracted_text.encode("utf-8")
                result.content_type = ContentType.TEXT

                logger.info(
                    "guidance_page_scraped",
                    url=url,
                    content_length=len(extracted_text),
                )
            else:
                logger.warning(
                    "main_content_not_found",
                    url=url,
                )

        except Exception as e:
            logger.error(
                "scraping_failed",
                url=url,
                error=str(e),
            )
            result.status = RetrievalStatus.FAILED
            result.error_message = f"Scraping failed: {str(e)}"

        return result

    def _extract_structured_text(self, element) -> str:
        """Extract text from HTML element while preserving structure.

        Args:
            element: BeautifulSoup element to extract text from

        Returns:
            Extracted text with preserved structure
        """
        lines = []

        for child in element.descendants:
            if child.name in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                level = int(child.name[1])
                prefix = "#" * level
                lines.append(f"\n{prefix} {child.get_text(strip=True)}\n")
            elif child.name == "p":
                text = child.get_text(strip=True)
                if text:
                    lines.append(f"{text}\n")
            elif child.name == "li":
                text = child.get_text(strip=True)
                if text:
                    lines.append(f"• {text}")
            elif child.name == "table":
                lines.append("\n[TABLE]\n")
                # Extract table content
                for row in child.find_all("tr"):
                    cells = [cell.get_text(strip=True) for cell in row.find_all(["th", "td"])]
                    lines.append(" | ".join(cells))
                lines.append("[/TABLE]\n")

        return "\n".join(lines)

    def get_reporting_documents(self) -> list[str]:
        """Get all reporting-related document URLs."""
        urls = []
        for doc_type in ["lctr_guidance", "eftr_guidance", "str_guidance", "tpr_guidance"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_compliance_documents(self) -> list[str]:
        """Get all compliance-related document URLs."""
        urls = []
        for doc_type in ["compliance_program", "record_keeping", "client_identification", "risk_assessment"]:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_legal_documents(self) -> list[str]:
        """Get all legal reference document URLs."""
        urls = []
        for doc_type in self.LEGAL_REFERENCES.keys():
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_all_guidance(self) -> list[str]:
        """Get URLs for all FINTRAC guidance documents."""
        urls = []
        for doc_type in self.DOCUMENT_URLS.keys():
            urls.extend(self.get_document_urls(doc_type))
        return urls
