"""
Documentation models for the Agentic Data Governance System.

This module defines Pydantic models for generated documents and
compliance packages.

Requirements: 10.2, 10.3
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases using Literal for enums
DocumentType = Literal[
    'data_dictionary',
    'lineage_documentation',
    'quality_assurance_report',
    'control_effectiveness_report',
    'bcbs239_compliance_mapping',
    'compliance_package'
]
DocumentFormat = Literal['markdown', 'html', 'pdf', 'json']
PackageStatus = Literal['draft', 'pending_review', 'approved', 'rejected']


class Document(BaseModel):
    """
    Generated document for compliance artifacts.
    
    Requirements: 10.2 - Each Document SHALL include: id, type, title,
    content, format, generated_at, version
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: DocumentType
    title: str
    content: str
    format: DocumentFormat = 'markdown'
    generated_at: datetime = Field(default_factory=datetime.now)
    version: int = 1


class BCBS239Principle(BaseModel):
    """Represents a BCBS 239 principle with compliance evidence."""
    principle_number: int
    principle_name: str
    description: str
    requirements: list[str] = []
    evidence_links: list[str] = []
    compliance_status: Literal['compliant', 'partially_compliant', 'non_compliant', 'not_assessed'] = 'not_assessed'
    notes: Optional[str] = None


class BCBS239ComplianceMapping(BaseModel):
    """
    BCBS 239 compliance mapping with all 14 principles.
    
    Requirements: 10.4 - BCBS 239 mapping SHALL reference all 14 principles
    with evidence links
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    report_id: str
    principles: list[BCBS239Principle] = []
    overall_compliance_score: float = 0.0
    generated_at: datetime = Field(default_factory=datetime.now)
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class CompliancePackage(BaseModel):
    """
    Compliance package aggregating all artifacts for a cycle.
    
    Requirements: 10.3 - compile_compliance_package SHALL aggregate all
    artifacts with status tracking
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    cycle_id: str
    report_id: str
    documents: list[Document] = []
    status: PackageStatus = 'draft'
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)


class DocumentationConfig(BaseModel):
    """Configuration for the Documentation Agent."""
    default_format: DocumentFormat = 'markdown'
    include_timestamps: bool = True
    organization_name: str = "Financial Institution"
