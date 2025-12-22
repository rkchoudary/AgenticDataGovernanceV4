"""
Critical Data Element (CDE) models for the Agentic Data Governance System.

This module defines Pydantic models for CDEs, scoring, and inventory.

Requirements: 2.2
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases
CDEStatus = Literal['pending_approval', 'approved', 'rejected']
ArtifactStatus = Literal['draft', 'pending_review', 'approved', 'rejected']


class CDEScoringFactors(BaseModel):
    """Scoring factors for CDE identification."""
    regulatory_calculation_usage: float
    cross_report_usage: float
    financial_impact: float
    regulatory_scrutiny: float


class CDEScore(BaseModel):
    """CDE score result."""
    element_id: str
    overall_score: float
    factors: CDEScoringFactors
    rationale: str


class CDE(BaseModel):
    """Critical Data Element."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    element_id: str
    name: str
    business_definition: str
    criticality_rationale: str
    data_owner: Optional[str] = None
    data_owner_email: Optional[str] = None
    status: CDEStatus = 'pending_approval'
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None


class CDEInventory(BaseModel):
    """Inventory of CDEs for a report."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    report_id: str
    cdes: list[CDE] = []
    version: int = 0
    status: ArtifactStatus = 'draft'
    created_at: datetime
    updated_at: datetime


class OwnerSuggestion(BaseModel):
    """Suggestion for data owner assignment."""
    cde_id: str
    suggested_owner: str
    suggested_owner_email: str
    confidence: float
    rationale: str


class ScoringContext(BaseModel):
    """Context for CDE scoring."""
    report_id: str
    existing_cdes: list[CDE] = []
    threshold: float = 0.7
