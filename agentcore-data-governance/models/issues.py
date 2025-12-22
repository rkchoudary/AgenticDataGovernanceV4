"""
Issue management models for the Agentic Data Governance System.

This module defines Pydantic models for issues, resolutions, and metrics.

Requirements: 2.5
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases - severity and status enums
Severity = Literal['critical', 'high', 'medium', 'low']
IssueStatus = Literal['open', 'in_progress', 'pending_verification', 'resolved', 'closed']
ResolutionType = Literal['data_correction', 'process_change', 'system_fix', 'exception_approved']


class Resolution(BaseModel):
    """Resolution details for an issue."""
    type: ResolutionType
    description: str
    implemented_by: str
    implemented_at: datetime
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None


class Issue(BaseModel):
    """Issue record."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    title: str
    description: str
    source: str
    impacted_reports: list[str] = []
    impacted_cdes: list[str] = []
    severity: Severity
    status: IssueStatus = 'open'
    assignee: str
    created_at: datetime
    due_date: Optional[datetime] = None
    root_cause: Optional[str] = None
    resolution: Optional[Resolution] = None
    compensating_control: Optional[str] = None
    escalation_level: int = 0
    escalated_at: Optional[datetime] = None


class IssueContext(BaseModel):
    """Context for creating an issue."""
    report_id: str
    cde_id: Optional[str] = None
    rule_id: Optional[str] = None
    data_domain: Optional[str] = None


class RootCauseSuggestion(BaseModel):
    """Root cause suggestion."""
    issue_id: str
    suggested_cause: str
    confidence: float
    similar_issue_ids: list[str] = []


class RecurringTheme(BaseModel):
    """Recurring theme in issues."""
    theme: str
    count: int


class IssueMetrics(BaseModel):
    """Issue metrics."""
    open_count: int = 0
    open_by_severity: dict[str, int] = {}
    avg_resolution_time: float = 0.0
    recurring_themes: list[RecurringTheme] = []


class IssueFilters(BaseModel):
    """Filters for querying issues."""
    status: Optional[list[IssueStatus]] = None
    severity: Optional[list[Severity]] = None
    assignee: Optional[str] = None
    report_id: Optional[str] = None
    cde_id: Optional[str] = None
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
