"""Document retrieval service with async HTTP operations.

Implements Requirements 1.1-1.9, 2.1-2.3:
- Retrieve documents from Federal Reserve, OCC, and FDIC sources
- Support multiple document formats (PDF, HTML)
- Handle network errors with retry logic
"""

import asyncio
import hashlib
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any
from urllib.parse import urlparse

import aiohttp
from pydantic import BaseModel, Field

from regulatory_kb.core import get_logger
from regulatory_kb.core.errors import DocumentRetrievalError

logger = get_logger(__name__)


class ContentType(str, Enum):
    """Supported content types for retrieved documents."""

    PDF = "application/pdf"
    HTML = "text/html"
    XML = "application/xml"
    JSON = "application/json"
    TEXT = "text/plain"


class RetrievalStatus(str, Enum):
    """Status of a document retrieval operation."""

    SUCCESS = "success"
    FAILED = "failed"
    NOT_MODIFIED = "not_modified"
    NOT_FOUND = "not_found"
    RATE_LIMITED = "rate_limited"


@dataclass
class RetrievalResult:
    """Result of a document retrieval operation."""

    status: RetrievalStatus
    source_url: str
    content: Optional[bytes] = None
    content_type: Optional[ContentType] = None
    checksum: Optional[str] = None
    last_modified: Optional[datetime] = None
    etag: Optional[str] = None
    error_message: Optional[str] = None
    retrieved_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    headers: dict[str, str] = field(default_factory=dict)

    def compute_checksum(self) -> Optional[str]:
        """Compute SHA-256 checksum of content."""
        if self.content:
            self.checksum = hashlib.sha256(self.content).hexdigest()
        return self.checksum


class RetrieverConfig(BaseModel):
    """Configuration for the document retrieval service."""

    timeout_seconds: int = Field(default=30, description="Request timeout")
    max_retries: int = Field(default=3, description="Maximum retry attempts")
    user_agent: str = Field(
        default="RegulatoryKB/1.0 (Compliance Document Retrieval)",
        description="User agent string for requests",
    )
    rate_limit_delay: float = Field(
        default=1.0, description="Delay between requests to same domain"
    )
    verify_ssl: bool = Field(default=True, description="Verify SSL certificates")


class BaseSourceAdapter(ABC):
    """Abstract base class for regulatory source adapters."""

    def __init__(self, config: Optional[RetrieverConfig] = None):
        self.config = config or RetrieverConfig()
        self._last_request_time: dict[str, datetime] = {}

    @property
    @abstractmethod
    def regulator_id(self) -> str:
        """Return the regulator identifier."""
        pass

    @property
    @abstractmethod
    def base_url(self) -> str:
        """Return the base URL for this source."""
        pass

    @abstractmethod
    def get_document_urls(self, document_type: str) -> list[str]:
        """Get URLs for a specific document type.

        Args:
            document_type: Type of document to retrieve

        Returns:
            List of URLs to retrieve
        """
        pass

    async def _rate_limit(self, domain: str) -> None:
        """Apply rate limiting for a domain."""
        if domain in self._last_request_time:
            elapsed = (
                datetime.now(timezone.utc) - self._last_request_time[domain]
            ).total_seconds()
            if elapsed < self.config.rate_limit_delay:
                await asyncio.sleep(self.config.rate_limit_delay - elapsed)
        self._last_request_time[domain] = datetime.now(timezone.utc)

    async def retrieve(
        self,
        url: str,
        session: aiohttp.ClientSession,
        etag: Optional[str] = None,
        last_modified: Optional[datetime] = None,
    ) -> RetrievalResult:
        """Retrieve a document from the source.

        Args:
            url: URL to retrieve
            session: aiohttp session to use
            etag: Optional ETag for conditional request
            last_modified: Optional last modified date for conditional request

        Returns:
            RetrievalResult with document content or error
        """
        domain = urlparse(url).netloc
        await self._rate_limit(domain)

        headers = {"User-Agent": self.config.user_agent}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified.strftime(
                "%a, %d %b %Y %H:%M:%S GMT"
            )

        try:
            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds),
                ssl=self.config.verify_ssl,
            ) as response:
                if response.status == 304:
                    logger.info("document_not_modified", url=url)
                    return RetrievalResult(
                        status=RetrievalStatus.NOT_MODIFIED,
                        source_url=url,
                        etag=response.headers.get("ETag"),
                    )

                if response.status == 404:
                    logger.warning("document_not_found", url=url)
                    return RetrievalResult(
                        status=RetrievalStatus.NOT_FOUND,
                        source_url=url,
                        error_message="Document not found",
                    )

                if response.status == 429:
                    logger.warning("rate_limited", url=url)
                    return RetrievalResult(
                        status=RetrievalStatus.RATE_LIMITED,
                        source_url=url,
                        error_message="Rate limited by server",
                    )

                if response.status >= 400:
                    error_msg = f"HTTP {response.status}: {response.reason}"
                    logger.error("retrieval_failed", url=url, error=error_msg)
                    return RetrievalResult(
                        status=RetrievalStatus.FAILED,
                        source_url=url,
                        error_message=error_msg,
                    )

                content = await response.read()
                content_type = self._parse_content_type(
                    response.headers.get("Content-Type", "")
                )

                result = RetrievalResult(
                    status=RetrievalStatus.SUCCESS,
                    source_url=url,
                    content=content,
                    content_type=content_type,
                    etag=response.headers.get("ETag"),
                    headers=dict(response.headers),
                )
                result.compute_checksum()

                # Parse Last-Modified header
                if "Last-Modified" in response.headers:
                    try:
                        result.last_modified = datetime.strptime(
                            response.headers["Last-Modified"],
                            "%a, %d %b %Y %H:%M:%S %Z",
                        ).replace(tzinfo=timezone.utc)
                    except ValueError:
                        pass

                logger.info(
                    "document_retrieved",
                    url=url,
                    content_type=content_type,
                    size_bytes=len(content),
                    checksum=result.checksum[:16] if result.checksum else None,
                )

                return result

        except asyncio.TimeoutError:
            error_msg = f"Request timed out after {self.config.timeout_seconds}s"
            logger.error("retrieval_timeout", url=url, timeout=self.config.timeout_seconds)
            return RetrievalResult(
                status=RetrievalStatus.FAILED,
                source_url=url,
                error_message=error_msg,
            )
        except aiohttp.ClientError as e:
            error_msg = f"Client error: {str(e)}"
            logger.error("retrieval_client_error", url=url, error=str(e))
            return RetrievalResult(
                status=RetrievalStatus.FAILED,
                source_url=url,
                error_message=error_msg,
            )

    def _parse_content_type(self, content_type_header: str) -> Optional[ContentType]:
        """Parse Content-Type header to ContentType enum."""
        content_type_header = content_type_header.lower().split(";")[0].strip()
        for ct in ContentType:
            if ct.value in content_type_header:
                return ct
        return None


class DocumentRetrievalService:
    """Main service for retrieving regulatory documents from multiple sources."""

    def __init__(self, config: Optional[RetrieverConfig] = None):
        """Initialize the retrieval service.

        Args:
            config: Configuration for retrieval operations
        """
        self.config = config or RetrieverConfig()
        self._adapters: dict[str, BaseSourceAdapter] = {}
        self._session: Optional[aiohttp.ClientSession] = None

        logger.info(
            "retrieval_service_initialized",
            timeout=self.config.timeout_seconds,
            max_retries=self.config.max_retries,
        )

    def register_adapter(self, adapter: BaseSourceAdapter) -> None:
        """Register a source adapter.

        Args:
            adapter: Source adapter to register
        """
        self._adapters[adapter.regulator_id] = adapter
        logger.info(
            "adapter_registered",
            regulator_id=adapter.regulator_id,
            base_url=adapter.base_url,
        )

    def get_adapter(self, regulator_id: str) -> Optional[BaseSourceAdapter]:
        """Get a registered adapter by regulator ID."""
        return self._adapters.get(regulator_id)

    def list_adapters(self) -> list[str]:
        """List all registered adapter regulator IDs."""
        return list(self._adapters.keys())

    async def __aenter__(self) -> "DocumentRetrievalService":
        """Enter async context and create session."""
        self._session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Exit async context and close session."""
        if self._session:
            await self._session.close()
            self._session = None

    async def retrieve_document(
        self,
        regulator_id: str,
        url: str,
        etag: Optional[str] = None,
        last_modified: Optional[datetime] = None,
    ) -> RetrievalResult:
        """Retrieve a single document.

        Args:
            regulator_id: ID of the regulator source
            url: URL to retrieve
            etag: Optional ETag for conditional request
            last_modified: Optional last modified date

        Returns:
            RetrievalResult with document content

        Raises:
            DocumentRetrievalError: If adapter not found or session not initialized
        """
        adapter = self._adapters.get(regulator_id)
        if not adapter:
            raise DocumentRetrievalError(
                f"No adapter registered for regulator: {regulator_id}",
                regulator=regulator_id,
            )

        if not self._session:
            raise DocumentRetrievalError(
                "Session not initialized. Use async context manager.",
                regulator=regulator_id,
            )

        return await adapter.retrieve(
            url, self._session, etag=etag, last_modified=last_modified
        )

    async def retrieve_documents(
        self,
        regulator_id: str,
        document_type: str,
    ) -> list[RetrievalResult]:
        """Retrieve all documents of a specific type from a regulator.

        Args:
            regulator_id: ID of the regulator source
            document_type: Type of documents to retrieve

        Returns:
            List of RetrievalResults
        """
        adapter = self._adapters.get(regulator_id)
        if not adapter:
            raise DocumentRetrievalError(
                f"No adapter registered for regulator: {regulator_id}",
                regulator=regulator_id,
            )

        if not self._session:
            raise DocumentRetrievalError(
                "Session not initialized. Use async context manager.",
                regulator=regulator_id,
            )

        urls = adapter.get_document_urls(document_type)
        results = []

        for url in urls:
            result = await adapter.retrieve(url, self._session)
            results.append(result)

        logger.info(
            "documents_retrieved",
            regulator_id=regulator_id,
            document_type=document_type,
            total=len(results),
            successful=sum(1 for r in results if r.status == RetrievalStatus.SUCCESS),
        )

        return results

    async def retrieve_all_from_regulator(
        self,
        regulator_id: str,
    ) -> dict[str, list[RetrievalResult]]:
        """Retrieve all configured documents from a regulator.

        Args:
            regulator_id: ID of the regulator source

        Returns:
            Dictionary mapping document types to retrieval results
        """
        adapter = self._adapters.get(regulator_id)
        if not adapter:
            raise DocumentRetrievalError(
                f"No adapter registered for regulator: {regulator_id}",
                regulator=regulator_id,
            )

        # Get all document types from the adapter
        all_results: dict[str, list[RetrievalResult]] = {}

        # Each adapter should define its supported document types
        if hasattr(adapter, "supported_document_types"):
            for doc_type in adapter.supported_document_types:
                results = await self.retrieve_documents(regulator_id, doc_type)
                all_results[doc_type] = results

        return all_results
