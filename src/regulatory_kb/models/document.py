"""Document data models for regulatory guidance documents."""

from datetime import date, datetime, timezone
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    """Types of regulatory documents."""

    INSTRUCTION_MANUAL = "instruction_manual"
    REGULATION = "regulation"
    GUIDANCE = "guidance"
    FORM = "form"
    NOTICE = "notice"
    EXAMINATION_MANUAL = "examination_manual"
    GUIDELINE = "guideline"


class DocumentCategory(str, Enum):
    """Regulatory categories for document classification."""

    CAPITAL_REQUIREMENTS = "capital-requirements"
    LIQUIDITY_REPORTING = "liquidity-reporting"
    AML_COMPLIANCE = "aml-compliance"
    STRESS_TESTING = "stress-testing"
    RESOLUTION_PLANNING = "resolution-planning"
    MODEL_RISK_MANAGEMENT = "model-risk-management"
    DEPOSIT_INSURANCE = "deposit-insurance"
    CALL_REPORTS = "call-reports"


class FilingFrequency(str, Enum):
    """Frequency of regulatory filings."""

    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMI_ANNUAL = "semi-annual"
    ANNUAL = "annual"
    AD_HOC = "ad-hoc"


class DocumentMetadata(BaseModel):
    """Metadata extracted from regulatory documents."""

    form_number: Optional[str] = Field(None, description="Form number (e.g., FR Y-14A)")
    omb_control_number: Optional[str] = Field(None, description="OMB control number")
    cfr_section: Optional[str] = Field(None, description="CFR section reference")
    effective_date: Optional[date] = Field(None, description="Effective date of the document")
    filing_frequency: Optional[FilingFrequency] = Field(None, description="Filing frequency")
    filing_deadline: Optional[str] = Field(None, description="Filing deadline description")
    version: Optional[str] = Field(None, description="Document version")
    guideline_number: Optional[str] = Field(None, description="Guideline number (OSFI)")
    threshold_amount: Optional[str] = Field(None, description="Reporting threshold amount")
    last_updated: Optional[date] = Field(None, description="Last updated date")


class DocumentContent(BaseModel):
    """Content extracted from a regulatory document."""

    text: str = Field(..., description="Full text content of the document")
    sections: list[dict] = Field(default_factory=list, description="Parsed sections")
    tables: list[dict] = Field(default_factory=list, description="Extracted tables")
    embeddings: Optional[list[float]] = Field(None, description="Vector embeddings")


class Document(BaseModel):
    """Represents a regulatory guidance document."""

    id: str = Field(..., description="Unique document identifier")
    title: str = Field(..., description="Document title")
    document_type: DocumentType = Field(..., description="Type of document")
    regulator_id: str = Field(..., description="ID of the issuing regulator")
    source_url: str = Field(..., description="Original source URL")
    categories: list[DocumentCategory] = Field(
        default_factory=list, description="Document categories"
    )
    metadata: DocumentMetadata = Field(
        default_factory=DocumentMetadata, description="Document metadata"
    )
    content: Optional[DocumentContent] = Field(None, description="Document content")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version_history: list[str] = Field(
        default_factory=list, description="Previous version IDs"
    )
