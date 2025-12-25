"""Update monitoring system for regulatory documents.

Implements Requirements 11.3-11.5:
- Document change detection using checksums
- RSS/Atom feed monitoring
- Alert generation for critical updates
- Automated update processing workflows
"""

import asyncio
import hashlib
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from urllib.parse import urlparse

import aiohttp
from pydantic import BaseModel, Field

from regulatory_kb.core import get_logger
from regulatory_kb.core.errors import RegulatoryKBError

logger = get_logger(__name__)


class ChangeType(str, Enum):
    """Types of document changes detected."""
    
    NEW_DOCUMENT = "new_document"
    CONTENT_MODIFIED = "content_modified"
    METADATA_UPDATED = "metadata_updated"
    VERSION_CHANGED = "version_changed"
    DELETED = "deleted"


class MonitoringError(RegulatoryKBError):
    """Error during monitoring operations."""
    
    def __init__(
        self,
        message: str,
        source_url: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(message, error_code="MONITORING", **kwargs)
        self.source_url = source_url
        self.details["source_url"] = source_url


class MonitorConfig(BaseModel):
    """Configuration for the update monitor."""
    
    check_interval_seconds: int = Field(
        default=3600, description="Interval between checks in seconds"
    )
    timeout_seconds: int = Field(
        default=30, description="Request timeout in seconds"
    )
    max_concurrent_checks: int = Field(
        default=10, description="Maximum concurrent HTTP requests"
    )
    critical_update_threshold_days: int = Field(
        default=14, description="Days without update before critical alert"
    )
    user_agent: str = Field(
        default="RegulatoryKB-Monitor/1.0",
        description="User agent for HTTP requests"
    )


@dataclass
class DocumentState:
    """Tracked state of a monitored document."""
    
    document_id: str
    source_url: str
    regulator_id: str
    content_hash: Optional[str] = None
    last_modified: Optional[datetime] = None
    etag: Optional[str] = None
    last_checked: Optional[datetime] = None
    last_changed: Optional[datetime] = None
    version: Optional[str] = None
    is_critical: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def compute_hash(self, content: bytes) -> str:
        """Compute SHA-256 hash of content."""
        return hashlib.sha256(content).hexdigest()
    
    def has_changed(self, new_hash: str) -> bool:
        """Check if content has changed based on hash."""
        return self.content_hash is None or self.content_hash != new_hash


@dataclass
class DocumentChange:
    """Represents a detected document change."""
    
    document_id: str
    source_url: str
    regulator_id: str
    change_type: ChangeType
    detected_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    old_hash: Optional[str] = None
    new_hash: Optional[str] = None
    old_version: Optional[str] = None
    new_version: Optional[str] = None
    old_modified: Optional[datetime] = None
    new_modified: Optional[datetime] = None
    is_significant: bool = False
    description: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class FeedEntry:
    """An entry from an RSS/Atom feed."""
    
    id: str
    title: str
    link: str
    published: Optional[datetime] = None
    updated: Optional[datetime] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    author: Optional[str] = None
    categories: list[str] = field(default_factory=list)


class FeedMonitor:
    """Monitor RSS/Atom feeds for regulatory updates.
    
    Supports monitoring Federal Register, regulatory agency feeds,
    and other sources that provide RSS/Atom feeds.
    """
    
    def __init__(self, config: Optional[MonitorConfig] = None):
        """Initialize the feed monitor.
        
        Args:
            config: Monitor configuration.
        """
        self.config = config or MonitorConfig()
        self._tracked_feeds: dict[str, dict[str, Any]] = {}
        self._seen_entries: dict[str, set[str]] = {}
    
    def add_feed(
        self,
        feed_id: str,
        url: str,
        regulator_id: str,
        is_critical: bool = False,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Add a feed to monitor.
        
        Args:
            feed_id: Unique identifier for the feed.
            url: Feed URL.
            regulator_id: Associated regulator ID.
            is_critical: Whether updates are critical.
            metadata: Additional metadata.
        """
        self._tracked_feeds[feed_id] = {
            "url": url,
            "regulator_id": regulator_id,
            "is_critical": is_critical,
            "metadata": metadata or {},
            "last_checked": None,
        }
        self._seen_entries[feed_id] = set()
        
        logger.info(
            "feed_added",
            feed_id=feed_id,
            url=url,
            regulator_id=regulator_id,
        )
    
    def remove_feed(self, feed_id: str) -> bool:
        """Remove a feed from monitoring.
        
        Args:
            feed_id: Feed identifier.
            
        Returns:
            True if feed was removed.
        """
        if feed_id in self._tracked_feeds:
            del self._tracked_feeds[feed_id]
            self._seen_entries.pop(feed_id, None)
            logger.info("feed_removed", feed_id=feed_id)
            return True
        return False
    
    def list_feeds(self) -> dict[str, dict[str, Any]]:
        """List all tracked feeds."""
        return dict(self._tracked_feeds)
    
    async def check_feed(
        self,
        feed_id: str,
        session: aiohttp.ClientSession,
    ) -> list[FeedEntry]:
        """Check a feed for new entries.
        
        Args:
            feed_id: Feed identifier.
            session: aiohttp session.
            
        Returns:
            List of new entries.
        """
        feed_info = self._tracked_feeds.get(feed_id)
        if not feed_info:
            raise MonitoringError(f"Feed not found: {feed_id}")
        
        url = feed_info["url"]
        headers = {"User-Agent": self.config.user_agent}
        
        try:
            async with session.get(
                url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds),
            ) as response:
                if response.status != 200:
                    logger.warning(
                        "feed_check_failed",
                        feed_id=feed_id,
                        status=response.status,
                    )
                    return []
                
                content = await response.text()
                entries = self._parse_feed(content)
                
                # Filter to new entries
                seen = self._seen_entries.get(feed_id, set())
                new_entries = [e for e in entries if e.id not in seen]
                
                # Update seen entries
                for entry in entries:
                    seen.add(entry.id)
                self._seen_entries[feed_id] = seen
                
                # Update last checked
                feed_info["last_checked"] = datetime.now(timezone.utc)
                
                logger.info(
                    "feed_checked",
                    feed_id=feed_id,
                    total_entries=len(entries),
                    new_entries=len(new_entries),
                )
                
                return new_entries
                
        except asyncio.TimeoutError:
            logger.error("feed_check_timeout", feed_id=feed_id, url=url)
            return []
        except aiohttp.ClientError as e:
            logger.error("feed_check_error", feed_id=feed_id, error=str(e))
            return []
    
    def _parse_feed(self, content: str) -> list[FeedEntry]:
        """Parse RSS or Atom feed content.
        
        Args:
            content: Feed XML content.
            
        Returns:
            List of parsed entries.
        """
        entries = []
        
        try:
            root = ET.fromstring(content)
            
            # Detect feed type and parse accordingly
            if root.tag.endswith("feed") or "{http://www.w3.org/2005/Atom}" in root.tag:
                entries = self._parse_atom(root)
            else:
                entries = self._parse_rss(root)
                
        except ET.ParseError as e:
            logger.error("feed_parse_error", error=str(e))
        
        return entries
    
    def _parse_atom(self, root: ET.Element) -> list[FeedEntry]:
        """Parse Atom feed."""
        entries = []
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        for entry_elem in root.findall(".//atom:entry", ns) or root.findall(".//entry"):
            entry = FeedEntry(
                id=self._get_text(entry_elem, "atom:id", ns) or self._get_text(entry_elem, "id") or "",
                title=self._get_text(entry_elem, "atom:title", ns) or self._get_text(entry_elem, "title") or "",
                link=self._get_link(entry_elem, ns),
                summary=self._get_text(entry_elem, "atom:summary", ns) or self._get_text(entry_elem, "summary"),
                content=self._get_text(entry_elem, "atom:content", ns) or self._get_text(entry_elem, "content"),
                author=self._get_text(entry_elem, "atom:author/atom:name", ns),
            )
            
            # Parse dates
            published = self._get_text(entry_elem, "atom:published", ns) or self._get_text(entry_elem, "published")
            updated = self._get_text(entry_elem, "atom:updated", ns) or self._get_text(entry_elem, "updated")
            
            if published:
                entry.published = self._parse_date(published)
            if updated:
                entry.updated = self._parse_date(updated)
            
            # Parse categories
            for cat in entry_elem.findall("atom:category", ns) or entry_elem.findall("category"):
                term = cat.get("term") or cat.text
                if term:
                    entry.categories.append(term)
            
            if entry.id:
                entries.append(entry)
        
        return entries
    
    def _parse_rss(self, root: ET.Element) -> list[FeedEntry]:
        """Parse RSS feed."""
        entries = []
        
        for item in root.findall(".//item"):
            guid = self._get_text(item, "guid")
            link = self._get_text(item, "link")
            
            entry = FeedEntry(
                id=guid or link or "",
                title=self._get_text(item, "title") or "",
                link=link or "",
                summary=self._get_text(item, "description"),
                author=self._get_text(item, "author") or self._get_text(item, "dc:creator"),
            )
            
            # Parse date
            pub_date = self._get_text(item, "pubDate")
            if pub_date:
                entry.published = self._parse_date(pub_date)
            
            # Parse categories
            for cat in item.findall("category"):
                if cat.text:
                    entry.categories.append(cat.text)
            
            if entry.id:
                entries.append(entry)
        
        return entries
    
    def _get_text(
        self,
        elem: ET.Element,
        path: str,
        ns: Optional[dict] = None,
    ) -> Optional[str]:
        """Get text content from element."""
        child = elem.find(path, ns) if ns else elem.find(path)
        return child.text if child is not None else None
    
    def _get_link(self, elem: ET.Element, ns: dict) -> str:
        """Get link from Atom entry."""
        link_elem = elem.find("atom:link[@rel='alternate']", ns)
        if link_elem is None:
            link_elem = elem.find("atom:link", ns)
        if link_elem is None:
            link_elem = elem.find("link")
        
        if link_elem is not None:
            return link_elem.get("href") or link_elem.text or ""
        return ""
    
    def _parse_date(self, date_str: str) -> Optional[datetime]:
        """Parse date string to datetime."""
        formats = [
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S%z",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%a, %d %b %Y %H:%M:%S %z",
            "%a, %d %b %Y %H:%M:%S %Z",
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        
        return None


class UpdateMonitor:
    """Monitor regulatory documents for updates.
    
    Implements:
    - Document change detection using checksums
    - Last-modified date tracking
    - ETag-based conditional requests
    - RSS/Atom feed monitoring
    - Alert generation for critical updates
    """
    
    def __init__(
        self,
        config: Optional[MonitorConfig] = None,
        on_change: Optional[Callable[[DocumentChange], None]] = None,
    ):
        """Initialize the update monitor.
        
        Args:
            config: Monitor configuration.
            on_change: Callback for detected changes.
        """
        self.config = config or MonitorConfig()
        self._on_change = on_change
        self._tracked_documents: dict[str, DocumentState] = {}
        self._feed_monitor = FeedMonitor(config)
        self._changes: list[DocumentChange] = []
        self._running = False
        self._semaphore: Optional[asyncio.Semaphore] = None
    
    # ==================== Document Tracking ====================
    
    def track_document(
        self,
        document_id: str,
        source_url: str,
        regulator_id: str,
        is_critical: bool = False,
        initial_hash: Optional[str] = None,
        initial_version: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> DocumentState:
        """Add a document to track for updates.
        
        Args:
            document_id: Unique document identifier.
            source_url: URL to check for updates.
            regulator_id: Associated regulator ID.
            is_critical: Whether this is a critical document.
            initial_hash: Initial content hash if known.
            initial_version: Initial version if known.
            metadata: Additional metadata.
            
        Returns:
            Created DocumentState.
        """
        state = DocumentState(
            document_id=document_id,
            source_url=source_url,
            regulator_id=regulator_id,
            content_hash=initial_hash,
            version=initial_version,
            is_critical=is_critical,
            metadata=metadata or {},
        )
        
        self._tracked_documents[document_id] = state
        
        logger.info(
            "document_tracked",
            document_id=document_id,
            source_url=source_url,
            regulator_id=regulator_id,
            is_critical=is_critical,
        )
        
        return state
    
    def untrack_document(self, document_id: str) -> bool:
        """Remove a document from tracking.
        
        Args:
            document_id: Document identifier.
            
        Returns:
            True if document was removed.
        """
        if document_id in self._tracked_documents:
            del self._tracked_documents[document_id]
            logger.info("document_untracked", document_id=document_id)
            return True
        return False
    
    def get_tracked_document(self, document_id: str) -> Optional[DocumentState]:
        """Get tracked document state."""
        return self._tracked_documents.get(document_id)
    
    def list_tracked_documents(
        self,
        regulator_id: Optional[str] = None,
        critical_only: bool = False,
    ) -> list[DocumentState]:
        """List tracked documents with optional filtering.
        
        Args:
            regulator_id: Filter by regulator.
            critical_only: Only return critical documents.
            
        Returns:
            List of document states.
        """
        documents = list(self._tracked_documents.values())
        
        if regulator_id:
            documents = [d for d in documents if d.regulator_id == regulator_id]
        
        if critical_only:
            documents = [d for d in documents if d.is_critical]
        
        return documents
    
    # ==================== Feed Tracking ====================
    
    def add_feed(
        self,
        feed_id: str,
        url: str,
        regulator_id: str,
        is_critical: bool = False,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Add an RSS/Atom feed to monitor."""
        self._feed_monitor.add_feed(
            feed_id, url, regulator_id, is_critical, metadata
        )
    
    def remove_feed(self, feed_id: str) -> bool:
        """Remove a feed from monitoring."""
        return self._feed_monitor.remove_feed(feed_id)
    
    def list_feeds(self) -> dict[str, dict[str, Any]]:
        """List all tracked feeds."""
        return self._feed_monitor.list_feeds()

    # ==================== Change Detection ====================
    
    async def check_document(
        self,
        document_id: str,
        session: aiohttp.ClientSession,
    ) -> Optional[DocumentChange]:
        """Check a single document for changes.
        
        Args:
            document_id: Document identifier.
            session: aiohttp session.
            
        Returns:
            DocumentChange if change detected, None otherwise.
        """
        state = self._tracked_documents.get(document_id)
        if not state:
            raise MonitoringError(f"Document not tracked: {document_id}")
        
        headers = {"User-Agent": self.config.user_agent}
        
        # Add conditional request headers
        if state.etag:
            headers["If-None-Match"] = state.etag
        if state.last_modified:
            headers["If-Modified-Since"] = state.last_modified.strftime(
                "%a, %d %b %Y %H:%M:%S GMT"
            )
        
        try:
            async with session.get(
                state.source_url,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=self.config.timeout_seconds),
            ) as response:
                state.last_checked = datetime.now(timezone.utc)
                
                # Not modified
                if response.status == 304:
                    logger.debug(
                        "document_not_modified",
                        document_id=document_id,
                    )
                    return None
                
                if response.status != 200:
                    logger.warning(
                        "document_check_failed",
                        document_id=document_id,
                        status=response.status,
                    )
                    return None
                
                content = await response.read()
                new_hash = state.compute_hash(content)
                
                # Check for changes
                if state.has_changed(new_hash):
                    change = DocumentChange(
                        document_id=document_id,
                        source_url=state.source_url,
                        regulator_id=state.regulator_id,
                        change_type=ChangeType.CONTENT_MODIFIED if state.content_hash else ChangeType.NEW_DOCUMENT,
                        old_hash=state.content_hash,
                        new_hash=new_hash,
                        old_modified=state.last_modified,
                        is_significant=state.is_critical,
                    )
                    
                    # Update state
                    state.content_hash = new_hash
                    state.last_changed = datetime.now(timezone.utc)
                    
                    # Update ETag and Last-Modified
                    if "ETag" in response.headers:
                        state.etag = response.headers["ETag"]
                    if "Last-Modified" in response.headers:
                        try:
                            state.last_modified = datetime.strptime(
                                response.headers["Last-Modified"],
                                "%a, %d %b %Y %H:%M:%S %Z",
                            ).replace(tzinfo=timezone.utc)
                            change.new_modified = state.last_modified
                        except ValueError:
                            pass
                    
                    # Record change
                    self._changes.append(change)
                    
                    # Trigger callback
                    if self._on_change:
                        self._on_change(change)
                    
                    logger.info(
                        "document_change_detected",
                        document_id=document_id,
                        change_type=change.change_type.value,
                        is_significant=change.is_significant,
                    )
                    
                    return change
                
                return None
                
        except asyncio.TimeoutError:
            logger.error(
                "document_check_timeout",
                document_id=document_id,
                url=state.source_url,
            )
            return None
        except aiohttp.ClientError as e:
            logger.error(
                "document_check_error",
                document_id=document_id,
                error=str(e),
            )
            return None
    
    async def check_all_documents(
        self,
        regulator_id: Optional[str] = None,
    ) -> list[DocumentChange]:
        """Check all tracked documents for changes.
        
        Args:
            regulator_id: Optional filter by regulator.
            
        Returns:
            List of detected changes.
        """
        documents = self.list_tracked_documents(regulator_id=regulator_id)
        
        if not documents:
            return []
        
        self._semaphore = asyncio.Semaphore(self.config.max_concurrent_checks)
        changes = []
        
        async with aiohttp.ClientSession() as session:
            tasks = [
                self._check_with_semaphore(doc.document_id, session)
                for doc in documents
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in results:
                if isinstance(result, DocumentChange):
                    changes.append(result)
                elif isinstance(result, Exception):
                    logger.error("check_error", error=str(result))
        
        logger.info(
            "all_documents_checked",
            total=len(documents),
            changes_detected=len(changes),
        )
        
        return changes
    
    async def _check_with_semaphore(
        self,
        document_id: str,
        session: aiohttp.ClientSession,
    ) -> Optional[DocumentChange]:
        """Check document with semaphore for rate limiting."""
        async with self._semaphore:
            return await self.check_document(document_id, session)
    
    async def check_all_feeds(self) -> list[FeedEntry]:
        """Check all tracked feeds for new entries.
        
        Returns:
            List of new feed entries.
        """
        feeds = self._feed_monitor.list_feeds()
        
        if not feeds:
            return []
        
        all_entries = []
        
        async with aiohttp.ClientSession() as session:
            for feed_id in feeds:
                try:
                    entries = await self._feed_monitor.check_feed(feed_id, session)
                    all_entries.extend(entries)
                except Exception as e:
                    logger.error("feed_check_error", feed_id=feed_id, error=str(e))
        
        return all_entries
    
    # ==================== Critical Document Monitoring ====================
    
    def get_stale_documents(
        self,
        threshold_days: Optional[int] = None,
    ) -> list[DocumentState]:
        """Get documents that haven't been updated within threshold.
        
        Args:
            threshold_days: Days without update to consider stale.
                           Defaults to config value.
            
        Returns:
            List of stale document states.
        """
        threshold = threshold_days or self.config.critical_update_threshold_days
        cutoff = datetime.now(timezone.utc) - timedelta(days=threshold)
        
        stale = []
        for state in self._tracked_documents.values():
            if state.is_critical:
                last_update = state.last_changed or state.last_checked
                if last_update is None or last_update < cutoff:
                    stale.append(state)
        
        return stale
    
    def get_unchecked_documents(
        self,
        hours: int = 24,
    ) -> list[DocumentState]:
        """Get documents not checked within specified hours.
        
        Args:
            hours: Hours since last check.
            
        Returns:
            List of unchecked document states.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        return [
            state for state in self._tracked_documents.values()
            if state.last_checked is None or state.last_checked < cutoff
        ]
    
    # ==================== Change History ====================
    
    def get_recent_changes(
        self,
        limit: int = 100,
        regulator_id: Optional[str] = None,
        change_type: Optional[ChangeType] = None,
    ) -> list[DocumentChange]:
        """Get recent document changes.
        
        Args:
            limit: Maximum changes to return.
            regulator_id: Filter by regulator.
            change_type: Filter by change type.
            
        Returns:
            List of recent changes.
        """
        changes = list(self._changes)
        
        if regulator_id:
            changes = [c for c in changes if c.regulator_id == regulator_id]
        
        if change_type:
            changes = [c for c in changes if c.change_type == change_type]
        
        # Sort by detected_at descending
        changes.sort(key=lambda c: c.detected_at, reverse=True)
        
        return changes[:limit]
    
    def get_changes_since(
        self,
        since: datetime,
        regulator_id: Optional[str] = None,
    ) -> list[DocumentChange]:
        """Get changes since a specific time.
        
        Args:
            since: Start time.
            regulator_id: Filter by regulator.
            
        Returns:
            List of changes since the specified time.
        """
        changes = [c for c in self._changes if c.detected_at >= since]
        
        if regulator_id:
            changes = [c for c in changes if c.regulator_id == regulator_id]
        
        return changes
    
    def clear_change_history(self) -> int:
        """Clear change history.
        
        Returns:
            Number of changes cleared.
        """
        count = len(self._changes)
        self._changes.clear()
        return count
    
    # ==================== Statistics ====================
    
    def get_monitoring_stats(self) -> dict[str, Any]:
        """Get monitoring statistics.
        
        Returns:
            Dictionary with monitoring stats.
        """
        documents = list(self._tracked_documents.values())
        feeds = self._feed_monitor.list_feeds()
        
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        
        return {
            "total_documents": len(documents),
            "critical_documents": len([d for d in documents if d.is_critical]),
            "total_feeds": len(feeds),
            "total_changes": len(self._changes),
            "changes_last_24h": len([c for c in self._changes if c.detected_at >= day_ago]),
            "changes_last_7d": len([c for c in self._changes if c.detected_at >= week_ago]),
            "stale_documents": len(self.get_stale_documents()),
            "unchecked_documents": len(self.get_unchecked_documents()),
            "documents_by_regulator": self._count_by_regulator(documents),
        }
    
    def _count_by_regulator(
        self,
        documents: list[DocumentState],
    ) -> dict[str, int]:
        """Count documents by regulator."""
        counts: dict[str, int] = {}
        for doc in documents:
            counts[doc.regulator_id] = counts.get(doc.regulator_id, 0) + 1
        return counts
