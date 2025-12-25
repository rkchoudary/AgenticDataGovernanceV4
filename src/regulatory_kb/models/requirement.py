"""Regulatory requirement data models."""

from datetime import date
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class FilingFrequency(str, Enum):
    """Frequency of regulatory filings."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi-annual"
    ANNUAL = "annual"
    AD_HOC = "ad-hoc"


class InstitutionType(str, Enum):
    """Types of financial institutions subject to requirements."""

    LARGE_BHC = "large_bhc"
    IBO = "ibo"
    COMMUNITY_BANK = "community_bank"
    SAVINGS_ASSOCIATION = "savings_association"
    FOREIGN_BANKING_ORG = "foreign_banking_org"
    DTI = "dti"  # Deposit-Taking Institution (Canada)


class Deadline(BaseModel):
    """Represents a regulatory filing deadline."""

    frequency: FilingFrequency = Field(..., description="Filing frequency")
    due_date: Optional[str] = Field(None, description="Due date description")
    submission_window: Optional[str] = Field(None, description="Submission window")
    days_after_period: Optional[int] = Field(
        None, description="Days after reporting period"
    )


class RegulatoryRequirement(BaseModel):
    """Represents a regulatory requirement or obligation."""

    id: str = Field(..., description="Unique requirement identifier")
    description: str = Field(..., description="Description of the requirement")
    regulator_id: str = Field(..., description="ID of the regulator")
    applicable_institutions: list[InstitutionType] = Field(
        default_factory=list, description="Types of institutions subject to requirement"
    )
    deadline: Optional[Deadline] = Field(None, description="Filing deadline")
    implementing_documents: list[str] = Field(
        default_factory=list, description="Document IDs that implement this requirement"
    )
    related_requirements: list[str] = Field(
        default_factory=list, description="Related requirement IDs"
    )
    effective_date: Optional[date] = Field(None, description="Effective date")
    superseded_by: Optional[str] = Field(
        None, description="ID of requirement that supersedes this one"
    )
