"""
Regulatory report models for the Agentic Data Governance System.

This module defines Pydantic models for regulatory reports, catalogs,
changes, and scan results.

Requirements: 2.1
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases using Literal for enums
Jurisdiction = Literal['US', 'CA']
ReportFrequency = Literal['daily', 'weekly', 'monthly', 'quarterly', 'annual']
ArtifactStatus = Literal['draft', 'pending_review', 'approved', 'rejected']
ChangeType = Literal['new', 'updated', 'removed']


class DueDateRule(BaseModel):
    """Due date rule for regulatory reports."""
    days_after_period_end: int
    business_days_only: bool = False
    timezone: str = "UTC"


class RegulatoryReport(BaseModel):
    """Represents a regulatory report in the catalog."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    name: str
    jurisdiction: Jurisdiction
    regulator: str
    frequency: ReportFrequency
    due_date: DueDateRule
    submission_format: str
    submission_platform: str
    description: str
    template_url: Optional[str] = None
    last_updated: datetime
    responsible_unit: str


class ReportCatalog(BaseModel):
    """Catalog of all regulatory reports."""
    tenant_id: Optional[str] = None  # Multi-tenant support
    reports: list[RegulatoryReport] = []
    version: int = 0
    last_scanned: datetime
    status: ArtifactStatus = 'draft'
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class RegulatoryChange(BaseModel):
    """Represents a detected regulatory change."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    report_id: Optional[str] = None
    change_type: ChangeType
    description: str
    effective_date: datetime
    detected_at: datetime
    source: str


class ScanResult(BaseModel):
    """Result of scanning regulatory sources."""
    jurisdiction: Jurisdiction
    scanned_at: datetime
    reports_found: int
    changes_detected: list[RegulatoryChange] = []


class CatalogUpdate(BaseModel):
    """Result of updating the catalog."""
    version: int
    added_reports: list[str] = []
    updated_reports: list[str] = []
    removed_reports: list[str] = []
    updated_at: datetime
