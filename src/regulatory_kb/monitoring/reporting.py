"""Reporting and alerting system for regulatory knowledge base.

Implements Requirements 11.6, 11.7:
- Weekly status reports with processing statistics
- Escalated alerts for critical failures
- Dashboard data for system health monitoring
- Performance metrics and error tracking
"""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Callable, Optional
from collections import defaultdict

from pydantic import BaseModel, Field

from regulatory_kb.core import get_logger

logger = get_logger(__name__)


class AlertLevel(str, Enum):
    """Alert severity levels."""
    
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertType(str, Enum):
    """Types of alerts."""
    
    # Document alerts
    DOCUMENT_UPDATE_FAILED = "document_update_failed"
    DOCUMENT_STALE = "document_stale"
    DOCUMENT_MISSING = "document_missing"
    
    # Processing alerts
    PROCESSING_FAILED = "processing_failed"
    PROCESSING_DELAYED = "processing_delayed"
    VALIDATION_FAILED = "validation_failed"
    
    # System alerts
    SERVICE_UNAVAILABLE = "service_unavailable"
    HIGH_ERROR_RATE = "high_error_rate"
    STORAGE_ISSUE = "storage_issue"
    
    # Regulatory alerts
    CRITICAL_UPDATE_DETECTED = "critical_update_detected"
    DEADLINE_APPROACHING = "deadline_approaching"
    CFR_AMENDMENT = "cfr_amendment"


class ReportConfig(BaseModel):
    """Configuration for the reporting service."""
    
    report_retention_days: int = Field(
        default=90, description="Days to retain reports"
    )
    alert_retention_days: int = Field(
        default=30, description="Days to retain alerts"
    )
    critical_threshold_hours: int = Field(
        default=336, description="Hours (14 days) without update for critical alert"
    )
    error_rate_threshold: float = Field(
        default=0.1, description="Error rate threshold for alerts (10%)"
    )
    min_samples_for_rate: int = Field(
        default=10, description="Minimum samples before calculating error rate"
    )


@dataclass
class Alert:
    """Represents a system alert."""
    
    id: str = ""
    alert_type: AlertType = AlertType.PROCESSING_FAILED
    level: AlertLevel = AlertLevel.WARNING
    title: str = ""
    message: str = ""
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    acknowledged: bool = False
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved: bool = False
    resolved_at: Optional[datetime] = None
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def acknowledge(self, by: str) -> None:
        """Acknowledge the alert."""
        self.acknowledged = True
        self.acknowledged_at = datetime.now(timezone.utc)
        self.acknowledged_by = by
    
    def resolve(self) -> None:
        """Mark alert as resolved."""
        self.resolved = True
        self.resolved_at = datetime.now(timezone.utc)
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "alert_type": self.alert_type.value,
            "level": self.level.value,
            "title": self.title,
            "message": self.message,
            "created_at": self.created_at.isoformat(),
            "acknowledged": self.acknowledged,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "acknowledged_by": self.acknowledged_by,
            "resolved": self.resolved,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "metadata": self.metadata,
        }


@dataclass
class ProcessingStats:
    """Statistics for document processing."""
    
    period_start: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    period_end: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Document counts
    documents_processed: int = 0
    documents_failed: int = 0
    documents_updated: int = 0
    documents_unchanged: int = 0
    
    # Processing metrics
    total_processing_time_ms: int = 0
    avg_processing_time_ms: float = 0.0
    max_processing_time_ms: int = 0
    
    # Error tracking
    errors_by_type: dict[str, int] = field(default_factory=dict)
    errors_by_regulator: dict[str, int] = field(default_factory=dict)
    
    # Regulator breakdown
    documents_by_regulator: dict[str, int] = field(default_factory=dict)
    updates_by_regulator: dict[str, int] = field(default_factory=dict)
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = self.documents_processed + self.documents_failed
        if total == 0:
            return 1.0
        return self.documents_processed / total
    
    @property
    def error_rate(self) -> float:
        """Calculate error rate."""
        return 1.0 - self.success_rate
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
            "documents_processed": self.documents_processed,
            "documents_failed": self.documents_failed,
            "documents_updated": self.documents_updated,
            "documents_unchanged": self.documents_unchanged,
            "success_rate": round(self.success_rate, 4),
            "error_rate": round(self.error_rate, 4),
            "total_processing_time_ms": self.total_processing_time_ms,
            "avg_processing_time_ms": round(self.avg_processing_time_ms, 2),
            "max_processing_time_ms": self.max_processing_time_ms,
            "errors_by_type": self.errors_by_type,
            "errors_by_regulator": self.errors_by_regulator,
            "documents_by_regulator": self.documents_by_regulator,
            "updates_by_regulator": self.updates_by_regulator,
        }


@dataclass
class StatusReport:
    """Weekly status report for the regulatory knowledge base."""
    
    id: str = ""
    report_type: str = "weekly"
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    period_start: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    period_end: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Processing statistics
    processing_stats: ProcessingStats = field(default_factory=ProcessingStats)
    
    # Document status
    total_documents: int = 0
    documents_by_regulator: dict[str, int] = field(default_factory=dict)
    documents_by_category: dict[str, int] = field(default_factory=dict)
    
    # Update status
    documents_updated: int = 0
    documents_added: int = 0
    documents_removed: int = 0
    version_changes: list[dict[str, Any]] = field(default_factory=list)
    
    # Health metrics
    stale_documents: list[str] = field(default_factory=list)
    failed_retrievals: list[dict[str, Any]] = field(default_factory=list)
    pending_reviews: int = 0
    
    # Alerts summary
    alerts_generated: int = 0
    alerts_by_level: dict[str, int] = field(default_factory=dict)
    unresolved_alerts: int = 0
    
    # System health
    system_uptime_percent: float = 100.0
    avg_response_time_ms: float = 0.0
    storage_usage_percent: float = 0.0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "report_type": self.report_type,
            "generated_at": self.generated_at.isoformat(),
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
            "processing_stats": self.processing_stats.to_dict(),
            "total_documents": self.total_documents,
            "documents_by_regulator": self.documents_by_regulator,
            "documents_by_category": self.documents_by_category,
            "documents_updated": self.documents_updated,
            "documents_added": self.documents_added,
            "documents_removed": self.documents_removed,
            "version_changes": self.version_changes,
            "stale_documents": self.stale_documents,
            "failed_retrievals": self.failed_retrievals,
            "pending_reviews": self.pending_reviews,
            "alerts_generated": self.alerts_generated,
            "alerts_by_level": self.alerts_by_level,
            "unresolved_alerts": self.unresolved_alerts,
            "system_uptime_percent": round(self.system_uptime_percent, 2),
            "avg_response_time_ms": round(self.avg_response_time_ms, 2),
            "storage_usage_percent": round(self.storage_usage_percent, 2),
        }
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict(), indent=2)
    
    def to_markdown(self) -> str:
        """Generate markdown report."""
        lines = [
            f"# Regulatory Knowledge Base Status Report",
            f"",
            f"**Report ID:** {self.id}",
            f"**Generated:** {self.generated_at.strftime('%Y-%m-%d %H:%M:%S UTC')}",
            f"**Period:** {self.period_start.strftime('%Y-%m-%d')} to {self.period_end.strftime('%Y-%m-%d')}",
            f"",
            f"## Summary",
            f"",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| Total Documents | {self.total_documents} |",
            f"| Documents Updated | {self.documents_updated} |",
            f"| Documents Added | {self.documents_added} |",
            f"| Success Rate | {self.processing_stats.success_rate:.1%} |",
            f"| Alerts Generated | {self.alerts_generated} |",
            f"",
            f"## Processing Statistics",
            f"",
            f"- **Documents Processed:** {self.processing_stats.documents_processed}",
            f"- **Documents Failed:** {self.processing_stats.documents_failed}",
            f"- **Average Processing Time:** {self.processing_stats.avg_processing_time_ms:.0f}ms",
            f"",
            f"## Documents by Regulator",
            f"",
        ]
        
        for regulator, count in sorted(self.documents_by_regulator.items()):
            lines.append(f"- **{regulator}:** {count}")
        
        lines.extend([
            f"",
            f"## Health Status",
            f"",
            f"- **System Uptime:** {self.system_uptime_percent:.1f}%",
            f"- **Stale Documents:** {len(self.stale_documents)}",
            f"- **Unresolved Alerts:** {self.unresolved_alerts}",
            f"- **Pending Reviews:** {self.pending_reviews}",
        ])
        
        if self.stale_documents:
            lines.extend([
                f"",
                f"### Stale Documents (No updates in 14+ days)",
                f"",
            ])
            for doc_id in self.stale_documents[:10]:
                lines.append(f"- {doc_id}")
            if len(self.stale_documents) > 10:
                lines.append(f"- ... and {len(self.stale_documents) - 10} more")
        
        if self.failed_retrievals:
            lines.extend([
                f"",
                f"### Failed Retrievals",
                f"",
            ])
            for failure in self.failed_retrievals[:5]:
                lines.append(f"- {failure.get('document_id', 'Unknown')}: {failure.get('error', 'Unknown error')}")
        
        return "\n".join(lines)


class ReportingService:
    """Reporting and alerting service for the regulatory knowledge base.
    
    Provides:
    - Weekly status reports with processing statistics
    - Escalated alerts for critical failures
    - Dashboard data for system health monitoring
    - Performance metrics and error tracking
    """
    
    def __init__(
        self,
        config: Optional[ReportConfig] = None,
        on_alert: Optional[Callable[[Alert], None]] = None,
    ):
        """Initialize the reporting service.
        
        Args:
            config: Report configuration.
            on_alert: Callback for new alerts.
        """
        self.config = config or ReportConfig()
        self._on_alert = on_alert
        
        self._alerts: list[Alert] = []
        self._reports: list[StatusReport] = []
        self._processing_events: list[dict[str, Any]] = []
        self._error_events: list[dict[str, Any]] = []
        self._alert_counter = 0
        self._report_counter = 0
    
    # ==================== Alert Management ====================
    
    def create_alert(
        self,
        alert_type: AlertType,
        level: AlertLevel,
        title: str,
        message: str,
        metadata: Optional[dict[str, Any]] = None,
    ) -> Alert:
        """Create a new alert.
        
        Args:
            alert_type: Type of alert.
            level: Severity level.
            title: Alert title.
            message: Alert message.
            metadata: Additional metadata.
            
        Returns:
            Created Alert.
        """
        self._alert_counter += 1
        alert = Alert(
            id=f"alert_{self._alert_counter}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            alert_type=alert_type,
            level=level,
            title=title,
            message=message,
            metadata=metadata or {},
        )
        
        self._alerts.append(alert)
        
        # Trigger callback
        if self._on_alert:
            self._on_alert(alert)
        
        if level in [AlertLevel.WARNING, AlertLevel.ERROR, AlertLevel.CRITICAL]:
            logger.warning(
                "alert_created",
                alert_id=alert.id,
                alert_type=alert_type.value,
                alert_level=level.value,
                title=title,
            )
        else:
            logger.info(
                "alert_created",
                alert_id=alert.id,
                alert_type=alert_type.value,
                alert_level=level.value,
                title=title,
            )
        
        return alert
    
    def alert_document_stale(
        self,
        document_id: str,
        regulator_id: str,
        days_since_update: int,
    ) -> Alert:
        """Create alert for stale document.
        
        Args:
            document_id: Document identifier.
            regulator_id: Regulator identifier.
            days_since_update: Days since last update.
            
        Returns:
            Created Alert.
        """
        level = AlertLevel.CRITICAL if days_since_update >= 14 else AlertLevel.WARNING
        
        return self.create_alert(
            alert_type=AlertType.DOCUMENT_STALE,
            level=level,
            title=f"Document Stale: {document_id}",
            message=f"Document {document_id} from {regulator_id} has not been updated in {days_since_update} days.",
            metadata={
                "document_id": document_id,
                "regulator_id": regulator_id,
                "days_since_update": days_since_update,
            },
        )
    
    def alert_processing_failed(
        self,
        document_id: str,
        error: str,
        retry_count: int = 0,
    ) -> Alert:
        """Create alert for processing failure.
        
        Args:
            document_id: Document identifier.
            error: Error message.
            retry_count: Number of retries attempted.
            
        Returns:
            Created Alert.
        """
        level = AlertLevel.ERROR if retry_count >= 3 else AlertLevel.WARNING
        
        return self.create_alert(
            alert_type=AlertType.PROCESSING_FAILED,
            level=level,
            title=f"Processing Failed: {document_id}",
            message=f"Failed to process document {document_id}: {error}",
            metadata={
                "document_id": document_id,
                "error": error,
                "retry_count": retry_count,
            },
        )
    
    def alert_critical_update(
        self,
        document_id: str,
        document_title: str,
        regulator_id: str,
        change_description: str,
    ) -> Alert:
        """Create alert for critical document update.
        
        Args:
            document_id: Document identifier.
            document_title: Document title.
            regulator_id: Regulator identifier.
            change_description: Description of changes.
            
        Returns:
            Created Alert.
        """
        return self.create_alert(
            alert_type=AlertType.CRITICAL_UPDATE_DETECTED,
            level=AlertLevel.CRITICAL,
            title=f"Critical Update: {document_title}",
            message=f"Critical regulatory document updated: {document_title}. {change_description}",
            metadata={
                "document_id": document_id,
                "document_title": document_title,
                "regulator_id": regulator_id,
                "change_description": change_description,
            },
        )
    
    def alert_high_error_rate(
        self,
        error_rate: float,
        period_hours: int,
        sample_count: int,
    ) -> Alert:
        """Create alert for high error rate.
        
        Args:
            error_rate: Current error rate.
            period_hours: Period over which rate was calculated.
            sample_count: Number of samples.
            
        Returns:
            Created Alert.
        """
        return self.create_alert(
            alert_type=AlertType.HIGH_ERROR_RATE,
            level=AlertLevel.ERROR,
            title=f"High Error Rate: {error_rate:.1%}",
            message=f"Error rate of {error_rate:.1%} detected over the last {period_hours} hours ({sample_count} samples).",
            metadata={
                "error_rate": error_rate,
                "period_hours": period_hours,
                "sample_count": sample_count,
            },
        )
    
    def alert_deadline_approaching(
        self,
        deadline_type: str,
        deadline_date: str,
        document_id: str,
        days_remaining: int,
    ) -> Alert:
        """Create alert for approaching deadline.
        
        Args:
            deadline_type: Type of deadline.
            deadline_date: Deadline date.
            document_id: Related document ID.
            days_remaining: Days until deadline.
            
        Returns:
            Created Alert.
        """
        level = AlertLevel.CRITICAL if days_remaining <= 7 else AlertLevel.WARNING
        
        return self.create_alert(
            alert_type=AlertType.DEADLINE_APPROACHING,
            level=level,
            title=f"Deadline Approaching: {deadline_type}",
            message=f"{deadline_type} deadline on {deadline_date} is {days_remaining} days away.",
            metadata={
                "deadline_type": deadline_type,
                "deadline_date": deadline_date,
                "document_id": document_id,
                "days_remaining": days_remaining,
            },
        )
    
    def get_alert(self, alert_id: str) -> Optional[Alert]:
        """Get alert by ID."""
        for alert in self._alerts:
            if alert.id == alert_id:
                return alert
        return None
    
    def acknowledge_alert(self, alert_id: str, by: str) -> bool:
        """Acknowledge an alert.
        
        Args:
            alert_id: Alert identifier.
            by: User acknowledging the alert.
            
        Returns:
            True if alert was acknowledged.
        """
        alert = self.get_alert(alert_id)
        if alert:
            alert.acknowledge(by)
            logger.info("alert_acknowledged", alert_id=alert_id, by=by)
            return True
        return False
    
    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve an alert.
        
        Args:
            alert_id: Alert identifier.
            
        Returns:
            True if alert was resolved.
        """
        alert = self.get_alert(alert_id)
        if alert:
            alert.resolve()
            logger.info("alert_resolved", alert_id=alert_id)
            return True
        return False
    
    def list_alerts(
        self,
        level: Optional[AlertLevel] = None,
        alert_type: Optional[AlertType] = None,
        unresolved_only: bool = False,
        limit: int = 100,
    ) -> list[Alert]:
        """List alerts with optional filtering.
        
        Args:
            level: Filter by level.
            alert_type: Filter by type.
            unresolved_only: Only return unresolved alerts.
            limit: Maximum results.
            
        Returns:
            List of alerts.
        """
        alerts = list(self._alerts)
        
        if level:
            alerts = [a for a in alerts if a.level == level]
        
        if alert_type:
            alerts = [a for a in alerts if a.alert_type == alert_type]
        
        if unresolved_only:
            alerts = [a for a in alerts if not a.resolved]
        
        # Sort by created_at descending
        alerts.sort(key=lambda a: a.created_at, reverse=True)
        
        return alerts[:limit]
    
    def get_unresolved_count(self) -> int:
        """Get count of unresolved alerts."""
        return len([a for a in self._alerts if not a.resolved])
    
    def get_alerts_by_level(self) -> dict[str, int]:
        """Get alert counts by level."""
        counts: dict[str, int] = defaultdict(int)
        for alert in self._alerts:
            counts[alert.level.value] += 1
        return dict(counts)
    
    # ==================== Event Recording ====================
    
    def record_processing_event(
        self,
        document_id: str,
        regulator_id: str,
        success: bool,
        processing_time_ms: int,
        updated: bool = False,
        error: Optional[str] = None,
    ) -> None:
        """Record a document processing event.
        
        Args:
            document_id: Document identifier.
            regulator_id: Regulator identifier.
            success: Whether processing succeeded.
            processing_time_ms: Processing time in milliseconds.
            updated: Whether document was updated.
            error: Error message if failed.
        """
        event = {
            "document_id": document_id,
            "regulator_id": regulator_id,
            "success": success,
            "processing_time_ms": processing_time_ms,
            "updated": updated,
            "error": error,
            "timestamp": datetime.now(timezone.utc),
        }
        
        self._processing_events.append(event)
        
        if not success and error:
            self._error_events.append(event)
        
        # Check for high error rate
        self._check_error_rate()
    
    def _check_error_rate(self) -> None:
        """Check if error rate exceeds threshold."""
        # Get events from last hour
        hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_events = [
            e for e in self._processing_events
            if e["timestamp"] >= hour_ago
        ]
        
        if len(recent_events) < self.config.min_samples_for_rate:
            return
        
        failures = len([e for e in recent_events if not e["success"]])
        error_rate = failures / len(recent_events)
        
        if error_rate > self.config.error_rate_threshold:
            # Check if we already have an unresolved high error rate alert
            existing = [
                a for a in self._alerts
                if a.alert_type == AlertType.HIGH_ERROR_RATE
                and not a.resolved
                and a.created_at >= hour_ago
            ]
            
            if not existing:
                self.alert_high_error_rate(
                    error_rate=error_rate,
                    period_hours=1,
                    sample_count=len(recent_events),
                )
    
    # ==================== Report Generation ====================
    
    def generate_report(
        self,
        period_start: Optional[datetime] = None,
        period_end: Optional[datetime] = None,
        report_type: str = "weekly",
    ) -> StatusReport:
        """Generate a status report.
        
        Args:
            period_start: Start of reporting period.
            period_end: End of reporting period.
            report_type: Type of report (daily, weekly, monthly).
            
        Returns:
            Generated StatusReport.
        """
        now = datetime.now(timezone.utc)
        
        if period_end is None:
            period_end = now
        
        if period_start is None:
            if report_type == "daily":
                period_start = period_end - timedelta(days=1)
            elif report_type == "weekly":
                period_start = period_end - timedelta(days=7)
            elif report_type == "monthly":
                period_start = period_end - timedelta(days=30)
            else:
                period_start = period_end - timedelta(days=7)
        
        # Filter events to period
        period_events = [
            e for e in self._processing_events
            if period_start <= e["timestamp"] <= period_end
        ]
        
        # Calculate processing stats
        stats = self._calculate_processing_stats(period_events, period_start, period_end)
        
        # Get alerts for period
        period_alerts = [
            a for a in self._alerts
            if period_start <= a.created_at <= period_end
        ]
        
        # Generate report
        self._report_counter += 1
        report = StatusReport(
            id=f"report_{self._report_counter}_{now.strftime('%Y%m%d')}",
            report_type=report_type,
            generated_at=now,
            period_start=period_start,
            period_end=period_end,
            processing_stats=stats,
            documents_updated=stats.documents_updated,
            alerts_generated=len(period_alerts),
            alerts_by_level=self._count_alerts_by_level(period_alerts),
            unresolved_alerts=len([a for a in period_alerts if not a.resolved]),
        )
        
        self._reports.append(report)
        
        logger.info(
            "report_generated",
            report_id=report.id,
            report_type=report_type,
            period_start=period_start.isoformat(),
            period_end=period_end.isoformat(),
        )
        
        return report
    
    def _calculate_processing_stats(
        self,
        events: list[dict[str, Any]],
        period_start: datetime,
        period_end: datetime,
    ) -> ProcessingStats:
        """Calculate processing statistics from events."""
        stats = ProcessingStats(
            period_start=period_start,
            period_end=period_end,
        )
        
        if not events:
            return stats
        
        processing_times = []
        
        for event in events:
            if event["success"]:
                stats.documents_processed += 1
                if event.get("updated"):
                    stats.documents_updated += 1
                else:
                    stats.documents_unchanged += 1
            else:
                stats.documents_failed += 1
                error = event.get("error", "Unknown")
                stats.errors_by_type[error] = stats.errors_by_type.get(error, 0) + 1
                
                regulator = event.get("regulator_id", "Unknown")
                stats.errors_by_regulator[regulator] = stats.errors_by_regulator.get(regulator, 0) + 1
            
            # Track processing time
            processing_time = event.get("processing_time_ms", 0)
            processing_times.append(processing_time)
            stats.total_processing_time_ms += processing_time
            
            # Track by regulator
            regulator = event.get("regulator_id", "Unknown")
            stats.documents_by_regulator[regulator] = stats.documents_by_regulator.get(regulator, 0) + 1
            
            if event.get("updated"):
                stats.updates_by_regulator[regulator] = stats.updates_by_regulator.get(regulator, 0) + 1
        
        # Calculate averages
        if processing_times:
            stats.avg_processing_time_ms = sum(processing_times) / len(processing_times)
            stats.max_processing_time_ms = max(processing_times)
        
        return stats
    
    def _count_alerts_by_level(self, alerts: list[Alert]) -> dict[str, int]:
        """Count alerts by level."""
        counts: dict[str, int] = defaultdict(int)
        for alert in alerts:
            counts[alert.level.value] += 1
        return dict(counts)
    
    def get_report(self, report_id: str) -> Optional[StatusReport]:
        """Get report by ID."""
        for report in self._reports:
            if report.id == report_id:
                return report
        return None
    
    def list_reports(
        self,
        report_type: Optional[str] = None,
        limit: int = 50,
    ) -> list[StatusReport]:
        """List reports with optional filtering.
        
        Args:
            report_type: Filter by report type.
            limit: Maximum results.
            
        Returns:
            List of reports.
        """
        reports = list(self._reports)
        
        if report_type:
            reports = [r for r in reports if r.report_type == report_type]
        
        # Sort by generated_at descending
        reports.sort(key=lambda r: r.generated_at, reverse=True)
        
        return reports[:limit]
    
    # ==================== Dashboard Data ====================
    
    def get_dashboard_data(self) -> dict[str, Any]:
        """Get data for system health dashboard.
        
        Returns:
            Dictionary with dashboard metrics.
        """
        now = datetime.now(timezone.utc)
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        
        # Recent events
        day_events = [
            e for e in self._processing_events
            if e["timestamp"] >= day_ago
        ]
        week_events = [
            e for e in self._processing_events
            if e["timestamp"] >= week_ago
        ]
        
        # Calculate rates
        day_success = len([e for e in day_events if e["success"]])
        day_total = len(day_events)
        day_success_rate = day_success / day_total if day_total > 0 else 1.0
        
        week_success = len([e for e in week_events if e["success"]])
        week_total = len(week_events)
        week_success_rate = week_success / week_total if week_total > 0 else 1.0
        
        # Processing times
        day_times = [e.get("processing_time_ms", 0) for e in day_events]
        avg_time = sum(day_times) / len(day_times) if day_times else 0
        
        return {
            "timestamp": now.isoformat(),
            "last_24h": {
                "documents_processed": day_success,
                "documents_failed": day_total - day_success,
                "success_rate": round(day_success_rate, 4),
                "avg_processing_time_ms": round(avg_time, 2),
            },
            "last_7d": {
                "documents_processed": week_success,
                "documents_failed": week_total - week_success,
                "success_rate": round(week_success_rate, 4),
            },
            "alerts": {
                "total": len(self._alerts),
                "unresolved": self.get_unresolved_count(),
                "by_level": self.get_alerts_by_level(),
            },
            "reports": {
                "total": len(self._reports),
                "latest": self._reports[-1].id if self._reports else None,
            },
        }
    
    def get_error_summary(
        self,
        hours: int = 24,
    ) -> dict[str, Any]:
        """Get error summary for specified period.
        
        Args:
            hours: Number of hours to look back.
            
        Returns:
            Dictionary with error summary.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        recent_errors = [
            e for e in self._error_events
            if e["timestamp"] >= cutoff
        ]
        
        errors_by_type: dict[str, int] = defaultdict(int)
        errors_by_regulator: dict[str, int] = defaultdict(int)
        
        for error in recent_errors:
            error_msg = error.get("error", "Unknown")
            errors_by_type[error_msg] += 1
            
            regulator = error.get("regulator_id", "Unknown")
            errors_by_regulator[regulator] += 1
        
        return {
            "period_hours": hours,
            "total_errors": len(recent_errors),
            "errors_by_type": dict(errors_by_type),
            "errors_by_regulator": dict(errors_by_regulator),
            "recent_errors": [
                {
                    "document_id": e.get("document_id"),
                    "error": e.get("error"),
                    "timestamp": e["timestamp"].isoformat(),
                }
                for e in sorted(recent_errors, key=lambda x: x["timestamp"], reverse=True)[:10]
            ],
        }
    
    # ==================== Cleanup ====================
    
    def cleanup_old_data(self) -> dict[str, int]:
        """Clean up old alerts and reports.
        
        Returns:
            Dictionary with counts of cleaned items.
        """
        now = datetime.now(timezone.utc)
        
        # Clean old alerts
        alert_cutoff = now - timedelta(days=self.config.alert_retention_days)
        old_alerts = [a for a in self._alerts if a.created_at < alert_cutoff]
        for alert in old_alerts:
            self._alerts.remove(alert)
        
        # Clean old reports
        report_cutoff = now - timedelta(days=self.config.report_retention_days)
        old_reports = [r for r in self._reports if r.generated_at < report_cutoff]
        for report in old_reports:
            self._reports.remove(report)
        
        # Clean old events (keep 30 days)
        event_cutoff = now - timedelta(days=30)
        self._processing_events = [
            e for e in self._processing_events
            if e["timestamp"] >= event_cutoff
        ]
        self._error_events = [
            e for e in self._error_events
            if e["timestamp"] >= event_cutoff
        ]
        
        logger.info(
            "cleanup_completed",
            alerts_removed=len(old_alerts),
            reports_removed=len(old_reports),
        )
        
        return {
            "alerts_removed": len(old_alerts),
            "reports_removed": len(old_reports),
        }
