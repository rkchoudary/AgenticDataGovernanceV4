"""
Controls models for the Agentic Data Governance System.

This module defines Pydantic models for controls, evidence, and control matrix.

Requirements: 2.6
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases - control types and categories
ControlType = Literal['organizational', 'process', 'access', 'change_management']
ControlCategory = Literal['preventive', 'detective']
ControlStatus = Literal['active', 'inactive', 'compensating']
AutomationStatus = Literal['manual', 'semi_automated', 'fully_automated']
ControlEvidenceOutcome = Literal['pass', 'fail', 'exception']
ControlFrequency = Literal['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'continuous']


class ControlEvidence(BaseModel):
    """Evidence of control execution."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    control_id: str
    execution_date: datetime
    outcome: ControlEvidenceOutcome
    details: str
    executed_by: str


class Control(BaseModel):
    """Control definition."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    name: str
    description: str
    type: ControlType
    category: ControlCategory
    owner: str
    frequency: ControlFrequency
    linked_cdes: list[str] = []
    linked_processes: list[str] = []
    automation_status: AutomationStatus = 'manual'
    rule_id: Optional[str] = None
    status: ControlStatus = 'active'
    expiration_date: Optional[datetime] = None
    linked_issue_id: Optional[str] = None
    evidence: list[ControlEvidence] = []


class ControlMatrix(BaseModel):
    """Control Matrix for a report."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    report_id: str
    controls: list[Control] = []
    version: int = 0
    last_reviewed: datetime
    reviewed_by: str
