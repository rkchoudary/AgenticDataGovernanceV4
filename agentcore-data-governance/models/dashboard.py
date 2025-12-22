"""
Dashboard models for the Agentic Data Governance System.

This module defines Pydantic models for dashboard display and monitoring.

Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


class CDEQualityScore(BaseModel):
    """CDE quality score for dashboard display."""
    cde_id: str
    cde_name: str
    completeness: float
    accuracy: float
    timeliness: float
    overall_score: float
    threshold_breached: bool
    last_updated: datetime


class QualityTrend(BaseModel):
    """Quality trend data point."""
    date: datetime
    dimension: str
    score: float


class IssueSummary(BaseModel):
    """Issue summary for dashboard."""
    total_open: int
    by_severity: dict[str, int]
    avg_resolution_time: float
    top_priority_items: list[str]


class ControlStatusDisplay(BaseModel):
    """Control status for dashboard display."""
    control_id: str
    control_name: str
    type: Literal['reconciliation', 'validation', 'approval']
    status: Literal['pass', 'fail', 'pending']
    last_executed: datetime
    evidence: Optional[str] = None


class CalendarEntry(BaseModel):
    """Calendar entry for regulatory deadlines."""
    id: str
    report_id: str
    report_name: str
    due_date: datetime
    status: Literal['upcoming', 'in_progress', 'completed', 'overdue']


class Annotation(BaseModel):
    """Annotation on a metric."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    metric_id: str
    comment: str
    created_by: str
    created_at: datetime = Field(default_factory=datetime.now)


class DateRange(BaseModel):
    """Date range for queries."""
    start: datetime
    end: datetime
