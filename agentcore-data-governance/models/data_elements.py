"""
Data element models for the Agentic Data Governance System.

This module defines Pydantic models for data elements, mappings, and gaps.

Requirements: 2.2
"""

from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases
DataType = Literal['string', 'number', 'date', 'boolean', 'decimal', 'integer']
DataGapReason = Literal['no_source', 'partial_source', 'calculation_needed']
ArtifactStatus = Literal['draft', 'pending_review', 'approved', 'rejected']
ReconciliationItemStatus = Literal['matched', 'added', 'removed', 'modified']


class DataElement(BaseModel):
    """Represents a data element from a regulatory template."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    regulatory_definition: str
    data_type: DataType
    format: str
    calculation_logic: Optional[str] = None
    unit: Optional[str] = None
    mandatory: bool


class DataMapping(BaseModel):
    """Mapping of a data element to internal sources."""
    element_id: str
    source_system: str
    source_table: str
    source_field: str
    transformation_logic: Optional[str] = None
    confidence: float
    validated_by: Optional[str] = None


class DataGap(BaseModel):
    """Represents a data gap where no internal source is found."""
    element_id: str
    element_name: str
    reason: DataGapReason
    suggested_resolution: Optional[str] = None


class RequirementsDocument(BaseModel):
    """Requirements document for a regulatory report."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    report_id: str
    elements: list[DataElement] = []
    mappings: list[DataMapping] = []
    gaps: list[DataGap] = []
    version: int = 0
    status: ArtifactStatus = 'draft'
    created_at: datetime
    updated_at: datetime
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None


class ReconciliationItem(BaseModel):
    """Individual item in reconciliation result."""
    item_id: str
    item_type: str
    status: ReconciliationItemStatus
    existing_value: Optional[dict] = None
    new_value: Optional[dict] = None
    differences: list[str] = []


class ReconciliationResult(BaseModel):
    """Result of reconciling documents."""
    items: list[ReconciliationItem] = []
    matched_count: int = 0
    added_count: int = 0
    removed_count: int = 0
    modified_count: int = 0
