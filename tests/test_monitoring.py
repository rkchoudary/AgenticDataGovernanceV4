"""Tests for the monitoring and reporting system.

Tests Requirements 11.3-11.7:
- Document change detection using checksums
- RSS/Atom feed monitoring
- Alert generation for critical updates
- Weekly status reports with processing statistics
- Escalated alerts for critical failures
"""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from regulatory_kb.monitoring import (
    UpdateMonitor,
    MonitorConfig,
    DocumentChange,
    ChangeType,
    FeedMonitor,
    FeedEntry,
    ReportingService,
    ReportConfig,
    StatusReport,
    AlertLevel,
    Alert,
)
from regulatory_kb.monitoring.update_monitor import DocumentState
from regulatory_kb.monitoring.reporting import AlertType, ProcessingStats


class TestDocumentState:
    """Tests for DocumentState."""
    
    def test_compute_hash(self):
        """Test content hash computation."""
        state = DocumentState(
            document_id="test_doc",
            source_url="https://example.com/doc.pdf",
            regulator_id="FRB",
        )
        
        content = b"Test document content"
        hash_value = state.compute_hash(content)
        
        assert hash_value is not None
        assert len(hash_value) == 64  # SHA-256 hex length
    
    def test_has_changed_no_previous_hash(self):
        """Test change detection with no previous hash."""
        state = DocumentState(
            document_id="test_doc",
            source_url="https://example.com/doc.pdf",
            regulator_id="FRB",
        )
        
        assert state.has_changed("abc123") is True
    
    def test_has_changed_same_hash(self):
        """Test change detection with same hash."""
        state = DocumentState(
            document_id="test_doc",
            source_url="https://example.com/doc.pdf",
            regulator_id="FRB",
            content_hash="abc123",
        )
        
        assert state.has_changed("abc123") is False
    
    def test_has_changed_different_hash(self):
        """Test change detection with different hash."""
        state = DocumentState(
            document_id="test_doc",
            source_url="https://example.com/doc.pdf",
            regulator_id="FRB",
            content_hash="abc123",
        )
        
        assert state.has_changed("def456") is True


class TestUpdateMonitor:
    """Tests for UpdateMonitor."""
    
    def test_track_document(self):
        """Test adding a document to track."""
        monitor = UpdateMonitor()
        
        state = monitor.track_document(
            document_id="frb_fry14a_2024",
            source_url="https://federalreserve.gov/fry14a.pdf",
            regulator_id="FRB",
            is_critical=True,
        )
        
        assert state.document_id == "frb_fry14a_2024"
        assert state.source_url == "https://federalreserve.gov/fry14a.pdf"
        assert state.regulator_id == "FRB"
        assert state.is_critical is True
    
    def test_untrack_document(self):
        """Test removing a document from tracking."""
        monitor = UpdateMonitor()
        
        monitor.track_document(
            document_id="test_doc",
            source_url="https://example.com/doc.pdf",
            regulator_id="FRB",
        )
        
        assert monitor.untrack_document("test_doc") is True
        assert monitor.get_tracked_document("test_doc") is None
    
    def test_untrack_nonexistent_document(self):
        """Test removing a non-existent document."""
        monitor = UpdateMonitor()
        
        assert monitor.untrack_document("nonexistent") is False
    
    def test_list_tracked_documents(self):
        """Test listing tracked documents."""
        monitor = UpdateMonitor()
        
        monitor.track_document("doc1", "https://example.com/1", "FRB")
        monitor.track_document("doc2", "https://example.com/2", "OCC")
        monitor.track_document("doc3", "https://example.com/3", "FRB", is_critical=True)
        
        all_docs = monitor.list_tracked_documents()
        assert len(all_docs) == 3
        
        frb_docs = monitor.list_tracked_documents(regulator_id="FRB")
        assert len(frb_docs) == 2
        
        critical_docs = monitor.list_tracked_documents(critical_only=True)
        assert len(critical_docs) == 1
    
    def test_add_feed(self):
        """Test adding an RSS feed to monitor."""
        monitor = UpdateMonitor()
        
        monitor.add_feed(
            feed_id="federal_register",
            url="https://federalregister.gov/feed.rss",
            regulator_id="FRB",
            is_critical=True,
        )
        
        feeds = monitor.list_feeds()
        assert "federal_register" in feeds
        assert feeds["federal_register"]["url"] == "https://federalregister.gov/feed.rss"
    
    def test_remove_feed(self):
        """Test removing a feed from monitoring."""
        monitor = UpdateMonitor()
        
        monitor.add_feed("test_feed", "https://example.com/feed.rss", "FRB")
        
        assert monitor.remove_feed("test_feed") is True
        assert "test_feed" not in monitor.list_feeds()
    
    def test_get_stale_documents(self):
        """Test getting stale documents."""
        monitor = UpdateMonitor()
        
        # Add a critical document with old last_changed
        state = monitor.track_document(
            document_id="stale_doc",
            source_url="https://example.com/doc.pdf",
            regulator_id="FRB",
            is_critical=True,
        )
        state.last_changed = datetime.now(timezone.utc) - timedelta(days=20)
        
        # Add a recent document
        recent_state = monitor.track_document(
            document_id="recent_doc",
            source_url="https://example.com/recent.pdf",
            regulator_id="FRB",
            is_critical=True,
        )
        recent_state.last_changed = datetime.now(timezone.utc)
        
        stale = monitor.get_stale_documents(threshold_days=14)
        assert len(stale) == 1
        assert stale[0].document_id == "stale_doc"
    
    def test_get_monitoring_stats(self):
        """Test getting monitoring statistics."""
        monitor = UpdateMonitor()
        
        monitor.track_document("doc1", "https://example.com/1", "FRB", is_critical=True)
        monitor.track_document("doc2", "https://example.com/2", "OCC")
        monitor.add_feed("feed1", "https://example.com/feed.rss", "FRB")
        
        stats = monitor.get_monitoring_stats()
        
        assert stats["total_documents"] == 2
        assert stats["critical_documents"] == 1
        assert stats["total_feeds"] == 1
        assert "FRB" in stats["documents_by_regulator"]


class TestFeedMonitor:
    """Tests for FeedMonitor."""
    
    def test_add_feed(self):
        """Test adding a feed."""
        monitor = FeedMonitor()
        
        monitor.add_feed(
            feed_id="test_feed",
            url="https://example.com/feed.rss",
            regulator_id="FRB",
        )
        
        feeds = monitor.list_feeds()
        assert "test_feed" in feeds
    
    def test_remove_feed(self):
        """Test removing a feed."""
        monitor = FeedMonitor()
        
        monitor.add_feed("test_feed", "https://example.com/feed.rss", "FRB")
        
        assert monitor.remove_feed("test_feed") is True
        assert monitor.remove_feed("nonexistent") is False
    
    def test_parse_rss_feed(self):
        """Test parsing RSS feed content."""
        monitor = FeedMonitor()
        
        rss_content = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Test Feed</title>
                <item>
                    <guid>item1</guid>
                    <title>Test Item 1</title>
                    <link>https://example.com/item1</link>
                    <description>Test description</description>
                    <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
                </item>
            </channel>
        </rss>
        """
        
        entries = monitor._parse_feed(rss_content)
        
        assert len(entries) == 1
        assert entries[0].id == "item1"
        assert entries[0].title == "Test Item 1"
        assert entries[0].link == "https://example.com/item1"
    
    def test_parse_atom_feed(self):
        """Test parsing Atom feed content."""
        monitor = FeedMonitor()
        
        atom_content = """<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
            <title>Test Feed</title>
            <entry>
                <id>entry1</id>
                <title>Test Entry 1</title>
                <link href="https://example.com/entry1"/>
                <summary>Test summary</summary>
                <published>2024-01-01T12:00:00Z</published>
            </entry>
        </feed>
        """
        
        entries = monitor._parse_feed(atom_content)
        
        assert len(entries) == 1
        assert entries[0].id == "entry1"
        assert entries[0].title == "Test Entry 1"


class TestReportingService:
    """Tests for ReportingService."""
    
    def test_create_alert(self):
        """Test creating an alert."""
        service = ReportingService()
        
        alert = service.create_alert(
            alert_type=AlertType.DOCUMENT_STALE,
            level=AlertLevel.WARNING,
            title="Test Alert",
            message="Test message",
        )
        
        assert alert.id is not None
        assert alert.alert_type == AlertType.DOCUMENT_STALE
        assert alert.level == AlertLevel.WARNING
        assert alert.title == "Test Alert"
    
    def test_alert_document_stale(self):
        """Test creating stale document alert."""
        service = ReportingService()
        
        alert = service.alert_document_stale(
            document_id="test_doc",
            regulator_id="FRB",
            days_since_update=15,
        )
        
        assert alert.alert_type == AlertType.DOCUMENT_STALE
        assert alert.level == AlertLevel.CRITICAL  # 15 days >= 14
        assert "test_doc" in alert.title
    
    def test_alert_processing_failed(self):
        """Test creating processing failure alert."""
        service = ReportingService()
        
        alert = service.alert_processing_failed(
            document_id="test_doc",
            error="Connection timeout",
            retry_count=3,
        )
        
        assert alert.alert_type == AlertType.PROCESSING_FAILED
        assert alert.level == AlertLevel.ERROR  # retry_count >= 3
    
    def test_acknowledge_alert(self):
        """Test acknowledging an alert."""
        service = ReportingService()
        
        alert = service.create_alert(
            alert_type=AlertType.DOCUMENT_STALE,
            level=AlertLevel.WARNING,
            title="Test",
            message="Test",
        )
        
        assert service.acknowledge_alert(alert.id, "test_user") is True
        assert alert.acknowledged is True
        assert alert.acknowledged_by == "test_user"
    
    def test_resolve_alert(self):
        """Test resolving an alert."""
        service = ReportingService()
        
        alert = service.create_alert(
            alert_type=AlertType.DOCUMENT_STALE,
            level=AlertLevel.WARNING,
            title="Test",
            message="Test",
        )
        
        assert service.resolve_alert(alert.id) is True
        assert alert.resolved is True
    
    def test_list_alerts(self):
        """Test listing alerts with filtering."""
        service = ReportingService()
        
        service.create_alert(AlertType.DOCUMENT_STALE, AlertLevel.WARNING, "Alert 1", "Msg")
        service.create_alert(AlertType.PROCESSING_FAILED, AlertLevel.ERROR, "Alert 2", "Msg")
        service.create_alert(AlertType.DOCUMENT_STALE, AlertLevel.CRITICAL, "Alert 3", "Msg")
        
        all_alerts = service.list_alerts()
        assert len(all_alerts) == 3
        
        warning_alerts = service.list_alerts(level=AlertLevel.WARNING)
        assert len(warning_alerts) == 1
        
        stale_alerts = service.list_alerts(alert_type=AlertType.DOCUMENT_STALE)
        assert len(stale_alerts) == 2
    
    def test_record_processing_event(self):
        """Test recording processing events."""
        service = ReportingService()
        
        service.record_processing_event(
            document_id="doc1",
            regulator_id="FRB",
            success=True,
            processing_time_ms=150,
            updated=True,
        )
        
        service.record_processing_event(
            document_id="doc2",
            regulator_id="OCC",
            success=False,
            processing_time_ms=50,
            error="Connection failed",
        )
        
        dashboard = service.get_dashboard_data()
        assert dashboard["last_24h"]["documents_processed"] == 1
        assert dashboard["last_24h"]["documents_failed"] == 1
    
    def test_generate_report(self):
        """Test generating a status report."""
        service = ReportingService()
        
        # Record some events
        for i in range(5):
            service.record_processing_event(
                document_id=f"doc{i}",
                regulator_id="FRB",
                success=True,
                processing_time_ms=100 + i * 10,
                updated=i % 2 == 0,
            )
        
        service.record_processing_event(
            document_id="failed_doc",
            regulator_id="OCC",
            success=False,
            processing_time_ms=50,
            error="Test error",
        )
        
        report = service.generate_report(report_type="daily")
        
        assert report.id is not None
        assert report.report_type == "daily"
        assert report.processing_stats.documents_processed == 5
        assert report.processing_stats.documents_failed == 1
    
    def test_report_to_markdown(self):
        """Test converting report to markdown."""
        service = ReportingService()
        
        service.record_processing_event(
            document_id="doc1",
            regulator_id="FRB",
            success=True,
            processing_time_ms=100,
        )
        
        report = service.generate_report()
        markdown = report.to_markdown()
        
        assert "# Regulatory Knowledge Base Status Report" in markdown
        # Check that the report contains expected sections
        assert "## Summary" in markdown
        assert "## Processing Statistics" in markdown
    
    def test_get_dashboard_data(self):
        """Test getting dashboard data."""
        service = ReportingService()
        
        service.record_processing_event(
            document_id="doc1",
            regulator_id="FRB",
            success=True,
            processing_time_ms=100,
        )
        
        dashboard = service.get_dashboard_data()
        
        assert "timestamp" in dashboard
        assert "last_24h" in dashboard
        assert "last_7d" in dashboard
        assert "alerts" in dashboard
    
    def test_get_error_summary(self):
        """Test getting error summary."""
        service = ReportingService()
        
        service.record_processing_event(
            document_id="doc1",
            regulator_id="FRB",
            success=False,
            processing_time_ms=50,
            error="Connection timeout",
        )
        
        service.record_processing_event(
            document_id="doc2",
            regulator_id="FRB",
            success=False,
            processing_time_ms=50,
            error="Connection timeout",
        )
        
        summary = service.get_error_summary(hours=24)
        
        assert summary["total_errors"] == 2
        assert "Connection timeout" in summary["errors_by_type"]
        assert summary["errors_by_type"]["Connection timeout"] == 2


class TestProcessingStats:
    """Tests for ProcessingStats."""
    
    def test_success_rate(self):
        """Test success rate calculation."""
        stats = ProcessingStats(
            documents_processed=8,
            documents_failed=2,
        )
        
        assert stats.success_rate == 0.8
        assert abs(stats.error_rate - 0.2) < 0.001  # Use approximate comparison for floats
    
    def test_success_rate_no_documents(self):
        """Test success rate with no documents."""
        stats = ProcessingStats()
        
        assert stats.success_rate == 1.0
        assert stats.error_rate == 0.0
    
    def test_to_dict(self):
        """Test converting stats to dictionary."""
        stats = ProcessingStats(
            documents_processed=10,
            documents_failed=2,
            avg_processing_time_ms=150.5,
        )
        
        data = stats.to_dict()
        
        assert data["documents_processed"] == 10
        assert data["documents_failed"] == 2
        assert data["success_rate"] == 0.8333


class TestAlert:
    """Tests for Alert."""
    
    def test_acknowledge(self):
        """Test acknowledging an alert."""
        alert = Alert(
            id="test_alert",
            alert_type=AlertType.DOCUMENT_STALE,
            level=AlertLevel.WARNING,
            title="Test",
            message="Test message",
        )
        
        alert.acknowledge("test_user")
        
        assert alert.acknowledged is True
        assert alert.acknowledged_by == "test_user"
        assert alert.acknowledged_at is not None
    
    def test_resolve(self):
        """Test resolving an alert."""
        alert = Alert(
            id="test_alert",
            alert_type=AlertType.DOCUMENT_STALE,
            level=AlertLevel.WARNING,
            title="Test",
            message="Test message",
        )
        
        alert.resolve()
        
        assert alert.resolved is True
        assert alert.resolved_at is not None
    
    def test_to_dict(self):
        """Test converting alert to dictionary."""
        alert = Alert(
            id="test_alert",
            alert_type=AlertType.DOCUMENT_STALE,
            level=AlertLevel.WARNING,
            title="Test",
            message="Test message",
        )
        
        data = alert.to_dict()
        
        assert data["id"] == "test_alert"
        assert data["alert_type"] == "document_stale"
        assert data["level"] == "warning"


class TestStatusReport:
    """Tests for StatusReport."""
    
    def test_to_dict(self):
        """Test converting report to dictionary."""
        report = StatusReport(
            id="test_report",
            report_type="weekly",
            total_documents=100,
            documents_updated=10,
        )
        
        data = report.to_dict()
        
        assert data["id"] == "test_report"
        assert data["report_type"] == "weekly"
        assert data["total_documents"] == 100
    
    def test_to_json(self):
        """Test converting report to JSON."""
        report = StatusReport(
            id="test_report",
            report_type="weekly",
        )
        
        json_str = report.to_json()
        
        assert '"id": "test_report"' in json_str
        assert '"report_type": "weekly"' in json_str
