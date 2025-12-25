"""Federal Register document retrieval adapter.

Implements Requirements 1.6, 2.3, 3.2:
- NSFR Final Rule PDF
- Recovery plan rescission notices
- IDI resolution plan final rule notices
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional

import aiohttp

from regulatory_kb.retrieval.service import (
    BaseSourceAdapter,
    RetrieverConfig,
    RetrievalResult,
    RetrievalStatus,
)
from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class FederalRegisterAdapter(BaseSourceAdapter):
    """Adapter for retrieving documents from the Federal Register."""

    # Federal Register API base URL
    API_BASE = "https://www.federalregister.gov/api/v1"

    # Document type to URL/document number mappings
    DOCUMENT_URLS = {
        # NSFR Final Rule (Requirement 1.6)
        "nsfr_final_rule": [
            "https://www.federalregister.gov/documents/2021/02/11/2020-26546/net-stable-funding-ratio-liquidity-risk-measurement-standards-and-disclosure-requirements",
        ],
        # Recovery Plan Rescission (Requirement 2.3)
        "recovery_plan_rescission": [
            "https://www.federalregister.gov/documents/2025/01/recovery-plan-rescission",
        ],
        # IDI Resolution Plan Final Rule (Requirement 3.2)
        "idi_resolution_final_rule": [
            "https://www.federalregister.gov/documents/2024/idi-resolution-plan-final-rule",
        ],
        # Capital Planning Rules
        "capital_planning_rules": [
            "https://www.federalregister.gov/documents/2023/capital-planning-requirements",
        ],
        # Stress Testing Rules
        "stress_testing_rules": [
            "https://www.federalregister.gov/documents/2023/stress-testing-requirements",
        ],
    }

    # Federal Register document numbers for API queries
    DOCUMENT_NUMBERS = {
        "nsfr_final_rule": "2020-26546",
        "recovery_plan_rescission": "2025-00001",
        "idi_resolution_final_rule": "2024-00001",
    }

    # Supported document types for bulk retrieval
    supported_document_types = list(DOCUMENT_URLS.keys())

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the Federal Register adapter."""
        super().__init__(config)
        self._version_cache: dict[str, str] = {}
        logger.info("federal_register_adapter_initialized")

    @property
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        return "federal_register"

    @property
    def base_url(self) -> str:
        """Return the base URL for Federal Register."""
        return "https://www.federalregister.gov"

    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document (e.g., 'nsfr_final_rule')

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

    def _build_api_url(self, document_number: str) -> str:
        """Build Federal Register API URL for a document."""
        return f"{self.API_BASE}/documents/{document_number}.json"

    def _build_pdf_url(self, document_number: str) -> str:
        """Build Federal Register PDF URL for a document."""
        return f"https://www.govinfo.gov/content/pkg/FR-{document_number}/pdf/FR-{document_number}.pdf"


    async def retrieve_document_metadata(
        self,
        document_number: str,
        session: aiohttp.ClientSession,
    ) -> Optional[dict]:
        """Retrieve document metadata from Federal Register API.

        Args:
            document_number: Federal Register document number
            session: aiohttp session to use

        Returns:
            Document metadata dictionary or None if not found
        """
        url = self._build_api_url(document_number)
        result = await self.retrieve(url, session)

        if result.status == RetrievalStatus.SUCCESS and result.content:
            import json
            try:
                return json.loads(result.content.decode("utf-8"))
            except json.JSONDecodeError:
                logger.error(
                    "failed_to_parse_metadata",
                    document_number=document_number,
                )
                return None
        return None

    async def retrieve_with_version_check(
        self,
        document_type: str,
        session: aiohttp.ClientSession,
    ) -> RetrievalResult:
        """Retrieve a document with version detection.

        Args:
            document_type: Type of document to retrieve
            session: aiohttp session to use

        Returns:
            RetrievalResult with content and version information
        """
        urls = self.get_document_urls(document_type)
        if not urls:
            return RetrievalResult(
                status=RetrievalStatus.FAILED,
                source_url="",
                error_message=f"Unknown document type: {document_type}",
            )

        url = urls[0]
        result = await self.retrieve(url, session)

        if result.status == RetrievalStatus.SUCCESS and result.content:
            # Compute checksum for version detection
            new_checksum = result.compute_checksum()
            cached_checksum = self._version_cache.get(document_type)

            if cached_checksum and cached_checksum == new_checksum:
                logger.info(
                    "federal_register_doc_unchanged",
                    document_type=document_type,
                    checksum=new_checksum[:16],
                )
            elif cached_checksum:
                logger.info(
                    "federal_register_doc_updated",
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
        logger.info("federal_register_version_cache_cleared")

    async def search_documents(
        self,
        session: aiohttp.ClientSession,
        agencies: Optional[list[str]] = None,
        document_type: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> list[dict]:
        """Search Federal Register documents.

        Args:
            session: aiohttp session to use
            agencies: List of agency slugs to filter by
            document_type: Type of document (rule, proposed_rule, notice)
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format

        Returns:
            List of document metadata dictionaries
        """
        params = {"per_page": 100}

        if agencies:
            params["conditions[agencies][]"] = agencies
        if document_type:
            params["conditions[type][]"] = document_type
        if start_date:
            params["conditions[publication_date][gte]"] = start_date
        if end_date:
            params["conditions[publication_date][lte]"] = end_date

        # Build search URL
        from urllib.parse import urlencode
        url = f"{self.API_BASE}/documents.json?{urlencode(params, doseq=True)}"

        result = await self.retrieve(url, session)

        if result.status == RetrievalStatus.SUCCESS and result.content:
            import json
            try:
                data = json.loads(result.content.decode("utf-8"))
                return data.get("results", [])
            except json.JSONDecodeError:
                logger.error("failed_to_parse_search_results")
                return []
        return []
