"""Electronic Code of Federal Regulations (eCFR) document retrieval adapter.

Implements Requirements 1.5, 1.7, 3.1-3.3, 4.1-4.3:
- 12 CFR Part 249 (LCR rule)
- 12 CFR Part 243/381 (Living Wills)
- 12 CFR Part 370 (Deposit Recordkeeping)
- 12 CFR 360.10 (IDI Resolution Plans)
- 12 CFR Part 327 (Assessment Methodology)
- 31 CFR 1010.311 (CTR requirements)
- 31 CFR 1020.320 (SAR requirements)
- 31 CFR Part 501 (OFAC requirements)
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlencode

import aiohttp

from regulatory_kb.retrieval.service import (
    BaseSourceAdapter,
    RetrieverConfig,
    RetrievalResult,
    RetrievalStatus,
    ContentType,
)
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class ECFRAdapter(BaseSourceAdapter):
    """Adapter for retrieving regulations from the eCFR API."""

    # eCFR API base URL
    API_BASE = "https://www.ecfr.gov/api/versioner/v1"

    # CFR section mappings for regulatory documents
    CFR_SECTIONS = {
        # Federal Reserve Regulations
        "lcr_rule": {"title": 12, "part": 249},  # Requirement 1.5
        "living_wills_fed": {"title": 12, "part": 243},  # Requirement 1.7
        "living_wills_fdic": {"title": 12, "part": 381},  # Requirement 1.7
        # FDIC Regulations
        "deposit_recordkeeping": {"title": 12, "part": 370},  # Requirement 3.1
        "idi_resolution": {"title": 12, "part": 360, "section": "10"},  # Requirement 3.2
        "assessment_methodology": {"title": 12, "part": 327},  # Requirement 3.3
        # FinCEN/Treasury Regulations
        "ctr_requirements": {"title": 31, "part": 1010, "section": "311"},  # Requirement 4.1
        "sar_requirements": {"title": 31, "part": 1020, "section": "320"},  # Requirement 4.2
        "ofac_blocking": {"title": 31, "part": 501},  # Requirement 4.3
        # OCC Regulations
        "recovery_plans": {"title": 12, "part": 30, "appendix": "E"},  # Requirement 2.3
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(CFR_SECTIONS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the eCFR adapter."""
        super().__init__(config)
        self._version_cache: dict[str, str] = {}
        logger.info("ecfr_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "ecfr"

    @property
    def base_url(self) -> str:
        """Return the base URL for eCFR."""
        return "https://www.ecfr.gov"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific CFR section.

        Args:
            document_type: Type of document (e.g., 'lcr_rule', 'sar_requirements')

        Returns:
            List of URLs for the document type
        """
        section_info = self.CFR_SECTIONS.get(document_type.lower())
        if not section_info:
            logger.warning(
                "unknown_document_type",
                regulator=self.regulator_id,
                document_type=document_type,
                available_types=list(self.CFR_SECTIONS.keys()),
            )
            return []

        # Build eCFR API URL
        url = self._build_api_url(section_info)
        return [url]

    def _build_api_url(self, section_info: dict) -> str:
        """Build eCFR API URL for a CFR section."""
        title = section_info["title"]
        part = section_info["part"]

        # Base URL for full part
        url = f"{self.API_BASE}/full/{datetime.now().strftime('%Y-%m-%d')}/title-{title}/part-{part}"

        # Add section if specified
        if "section" in section_info:
            url = f"{url}/section-{section_info['section']}"

        return url + ".xml"

    def _build_html_url(self, section_info: dict) -> str:
        """Build eCFR HTML URL for a CFR section."""
        title = section_info["title"]
        part = section_info["part"]

        url = f"https://www.ecfr.gov/current/title-{title}/part-{part}"

        if "section" in section_info:
            url = f"{url}/section-{part}.{section_info['section']}"

        return url


    async def retrieve_with_version_check(
        self,
        document_type: str,
        session: aiohttp.ClientSession,
    ) -> RetrievalResult:
        """Retrieve a CFR section with version detection.

        Args:
            document_type: Type of document to retrieve
            session: aiohttp session to use

        Returns:
            RetrievalResult with content and version information
        """
        section_info = self.CFR_SECTIONS.get(document_type.lower())
        if not section_info:
            return RetrievalResult(
                status=RetrievalStatus.FAILED,
                source_url="",
                error_message=f"Unknown document type: {document_type}",
            )

        url = self._build_api_url(section_info)
        result = await self.retrieve(url, session)

        if result.status == RetrievalStatus.SUCCESS and result.content:
            # Compute checksum for version detection
            new_checksum = result.compute_checksum()
            cached_checksum = self._version_cache.get(document_type)

            if cached_checksum and cached_checksum == new_checksum:
                logger.info(
                    "cfr_section_unchanged",
                    document_type=document_type,
                    checksum=new_checksum[:16],
                )
            elif cached_checksum:
                logger.info(
                    "cfr_section_updated",
                    document_type=document_type,
                    old_checksum=cached_checksum[:16],
                    new_checksum=new_checksum[:16] if new_checksum else None,
                )

            if new_checksum:
                self._version_cache[document_type] = new_checksum

        return result

    def get_cached_version(self, document_type: str) -> Optional[str]:
        """Get the cached checksum for a document type."""
        return self._version_cache.get(document_type)

    def clear_version_cache(self) -> None:
        """Clear the version cache."""
        self._version_cache.clear()
        logger.info("ecfr_version_cache_cleared")

    def get_banking_regulations(self) -> list[str]:
        """Get URLs for all banking-related CFR sections."""
        banking_types = [
            "lcr_rule",
            "living_wills_fed",
            "living_wills_fdic",
            "deposit_recordkeeping",
            "idi_resolution",
            "assessment_methodology",
            "recovery_plans",
        ]
        urls = []
        for doc_type in banking_types:
            urls.extend(self.get_document_urls(doc_type))
        return urls

    def get_aml_regulations(self) -> list[str]:
        """Get URLs for all AML-related CFR sections."""
        aml_types = ["ctr_requirements", "sar_requirements", "ofac_blocking"]
        urls = []
        for doc_type in aml_types:
            urls.extend(self.get_document_urls(doc_type))
        return urls
