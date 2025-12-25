"""Lambda handler for monitoring and reporting operations.

Implements Requirements 11.3-11.7:
- Document change detection
- RSS/Atom feed monitoring
- Alert generation
- Status report generation
"""

import json
import os
from datetime import datetime, timezone
from typing import Any

from regulatory_kb.core import get_logger
from regulatory_kb.monitoring import (
    UpdateMonitor,
    MonitorConfig,
    ReportingService,
    ReportConfig,
    AlertLevel,
)

logger = get_logger(__name__)

# Initialize services
_monitor: UpdateMonitor | None = None
_reporting: ReportingService | None = None


def get_monitor() -> UpdateMonitor:
    """Get or create the update monitor instance."""
    global _monitor
    if _monitor is None:
        config = MonitorConfig(
            check_interval_seconds=int(os.environ.get("CHECK_INTERVAL_SECONDS", "3600")),
            timeout_seconds=int(os.environ.get("TIMEOUT_SECONDS", "30")),
            max_concurrent_checks=int(os.environ.get("MAX_CONCURRENT_CHECKS", "10")),
            critical_update_threshold_days=int(os.environ.get("CRITICAL_THRESHOLD_DAYS", "14")),
        )
        _monitor = UpdateMonitor(config=config)
    return _monitor


def get_reporting() -> ReportingService:
    """Get or create the reporting service instance."""
    global _reporting
    if _reporting is None:
        config = ReportConfig(
            report_retention_days=int(os.environ.get("REPORT_RETENTION_DAYS", "90")),
            alert_retention_days=int(os.environ.get("ALERT_RETENTION_DAYS", "30")),
            critical_threshold_hours=int(os.environ.get("CRITICAL_THRESHOLD_HOURS", "336")),
            error_rate_threshold=float(os.environ.get("ERROR_RATE_THRESHOLD", "0.1")),
        )
        _reporting = ReportingService(config=config)
    return _reporting


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """Main Lambda handler for monitoring operations.
    
    Supports operations:
    - check_documents: Check tracked documents for updates
    - check_feeds: Check RSS/Atom feeds for new entries
    - generate_report: Generate a status report
    - get_dashboard: Get dashboard data
    - list_alerts: List alerts
    - acknowledge_alert: Acknowledge an alert
    - resolve_alert: Resolve an alert
    - get_stats: Get monitoring statistics
    
    Args:
        event: Lambda event with operation and parameters.
        context: Lambda context.
        
    Returns:
        Response with operation results.
    """
    operation = event.get("operation", "")
    params = event.get("params", {})
    
    logger.info(
        "monitoring_handler_invoked",
        operation=operation,
        params=params,
    )
    
    try:
        if operation == "check_documents":
            return _check_documents(params)
        elif operation == "check_feeds":
            return _check_feeds(params)
        elif operation == "generate_report":
            return _generate_report(params)
        elif operation == "get_dashboard":
            return _get_dashboard(params)
        elif operation == "list_alerts":
            return _list_alerts(params)
        elif operation == "acknowledge_alert":
            return _acknowledge_alert(params)
        elif operation == "resolve_alert":
            return _resolve_alert(params)
        elif operation == "get_stats":
            return _get_stats(params)
        elif operation == "track_document":
            return _track_document(params)
        elif operation == "add_feed":
            return _add_feed(params)
        else:
            return {
                "statusCode": 400,
                "body": json.dumps({
                    "error": f"Unknown operation: {operation}",
                    "supported_operations": [
                        "check_documents",
                        "check_feeds",
                        "generate_report",
                        "get_dashboard",
                        "list_alerts",
                        "acknowledge_alert",
                        "resolve_alert",
                        "get_stats",
                        "track_document",
                        "add_feed",
                    ],
                }),
            }
    except Exception as e:
        logger.error("monitoring_handler_error", error=str(e))
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }


def _check_documents(params: dict[str, Any]) -> dict[str, Any]:
    """Check tracked documents for updates."""
    import asyncio
    
    monitor = get_monitor()
    regulator_id = params.get("regulator_id")
    
    # Run async check
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        changes = loop.run_until_complete(
            monitor.check_all_documents(regulator_id=regulator_id)
        )
    finally:
        loop.close()
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "changes_detected": len(changes),
            "changes": [
                {
                    "document_id": c.document_id,
                    "change_type": c.change_type.value,
                    "detected_at": c.detected_at.isoformat(),
                    "is_significant": c.is_significant,
                }
                for c in changes
            ],
        }),
    }


def _check_feeds(params: dict[str, Any]) -> dict[str, Any]:
    """Check RSS/Atom feeds for new entries."""
    import asyncio
    
    monitor = get_monitor()
    
    # Run async check
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        entries = loop.run_until_complete(monitor.check_all_feeds())
    finally:
        loop.close()
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "new_entries": len(entries),
            "entries": [
                {
                    "id": e.id,
                    "title": e.title,
                    "link": e.link,
                    "published": e.published.isoformat() if e.published else None,
                }
                for e in entries[:50]  # Limit response size
            ],
        }),
    }


def _generate_report(params: dict[str, Any]) -> dict[str, Any]:
    """Generate a status report."""
    reporting = get_reporting()
    
    report_type = params.get("report_type", "weekly")
    
    # Parse dates if provided
    period_start = None
    period_end = None
    
    if "period_start" in params:
        period_start = datetime.fromisoformat(params["period_start"])
    if "period_end" in params:
        period_end = datetime.fromisoformat(params["period_end"])
    
    report = reporting.generate_report(
        period_start=period_start,
        period_end=period_end,
        report_type=report_type,
    )
    
    # Return format based on request
    output_format = params.get("format", "json")
    
    if output_format == "markdown":
        return {
            "statusCode": 200,
            "headers": {"Content-Type": "text/markdown"},
            "body": report.to_markdown(),
        }
    else:
        return {
            "statusCode": 200,
            "body": json.dumps(report.to_dict()),
        }


def _get_dashboard(params: dict[str, Any]) -> dict[str, Any]:
    """Get dashboard data."""
    reporting = get_reporting()
    monitor = get_monitor()
    
    dashboard = reporting.get_dashboard_data()
    
    # Add monitoring stats
    dashboard["monitoring"] = monitor.get_monitoring_stats()
    
    return {
        "statusCode": 200,
        "body": json.dumps(dashboard),
    }


def _list_alerts(params: dict[str, Any]) -> dict[str, Any]:
    """List alerts with optional filtering."""
    reporting = get_reporting()
    
    level = None
    if "level" in params:
        level = AlertLevel(params["level"])
    
    unresolved_only = params.get("unresolved_only", False)
    limit = params.get("limit", 100)
    
    alerts = reporting.list_alerts(
        level=level,
        unresolved_only=unresolved_only,
        limit=limit,
    )
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "total": len(alerts),
            "alerts": [a.to_dict() for a in alerts],
        }),
    }


def _acknowledge_alert(params: dict[str, Any]) -> dict[str, Any]:
    """Acknowledge an alert."""
    reporting = get_reporting()
    
    alert_id = params.get("alert_id")
    acknowledged_by = params.get("acknowledged_by", "system")
    
    if not alert_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "alert_id is required"}),
        }
    
    success = reporting.acknowledge_alert(alert_id, acknowledged_by)
    
    if success:
        return {
            "statusCode": 200,
            "body": json.dumps({"acknowledged": True, "alert_id": alert_id}),
        }
    else:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": f"Alert not found: {alert_id}"}),
        }


def _resolve_alert(params: dict[str, Any]) -> dict[str, Any]:
    """Resolve an alert."""
    reporting = get_reporting()
    
    alert_id = params.get("alert_id")
    
    if not alert_id:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "alert_id is required"}),
        }
    
    success = reporting.resolve_alert(alert_id)
    
    if success:
        return {
            "statusCode": 200,
            "body": json.dumps({"resolved": True, "alert_id": alert_id}),
        }
    else:
        return {
            "statusCode": 404,
            "body": json.dumps({"error": f"Alert not found: {alert_id}"}),
        }


def _get_stats(params: dict[str, Any]) -> dict[str, Any]:
    """Get monitoring statistics."""
    monitor = get_monitor()
    reporting = get_reporting()
    
    stats = {
        "monitoring": monitor.get_monitoring_stats(),
        "errors": reporting.get_error_summary(hours=params.get("hours", 24)),
    }
    
    return {
        "statusCode": 200,
        "body": json.dumps(stats),
    }


def _track_document(params: dict[str, Any]) -> dict[str, Any]:
    """Add a document to track for updates."""
    monitor = get_monitor()
    
    document_id = params.get("document_id")
    source_url = params.get("source_url")
    regulator_id = params.get("regulator_id")
    
    if not all([document_id, source_url, regulator_id]):
        return {
            "statusCode": 400,
            "body": json.dumps({
                "error": "document_id, source_url, and regulator_id are required"
            }),
        }
    
    state = monitor.track_document(
        document_id=document_id,
        source_url=source_url,
        regulator_id=regulator_id,
        is_critical=params.get("is_critical", False),
        initial_hash=params.get("initial_hash"),
        initial_version=params.get("initial_version"),
        metadata=params.get("metadata"),
    )
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "tracked": True,
            "document_id": state.document_id,
            "source_url": state.source_url,
        }),
    }


def _add_feed(params: dict[str, Any]) -> dict[str, Any]:
    """Add an RSS/Atom feed to monitor."""
    monitor = get_monitor()
    
    feed_id = params.get("feed_id")
    url = params.get("url")
    regulator_id = params.get("regulator_id")
    
    if not all([feed_id, url, regulator_id]):
        return {
            "statusCode": 400,
            "body": json.dumps({
                "error": "feed_id, url, and regulator_id are required"
            }),
        }
    
    monitor.add_feed(
        feed_id=feed_id,
        url=url,
        regulator_id=regulator_id,
        is_critical=params.get("is_critical", False),
        metadata=params.get("metadata"),
    )
    
    return {
        "statusCode": 200,
        "body": json.dumps({
            "added": True,
            "feed_id": feed_id,
            "url": url,
        }),
    }
