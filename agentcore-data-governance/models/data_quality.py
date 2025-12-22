"""
Data Quality models for the Agentic Data Governance System.

This module defines Pydantic models for DQ rules, dimensions, and execution results.

Requirements: 2.3
"""

from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases - DQDimension with all 7 dimensions
DQDimension = Literal[
    'completeness',
    'accuracy',
    'validity',
    'consistency',
    'timeliness',
    'uniqueness',
    'integrity'
]

Severity = Literal['critical', 'high', 'medium', 'low']
RuleLogicType = Literal[
    'null_check',
    'range_check',
    'format_check',
    'referential_check',
    'reconciliation',
    'custom'
]
ThresholdType = Literal['percentage', 'absolute', 'range']


class Threshold(BaseModel):
    """Threshold configuration for a rule."""
    type: ThresholdType
    value: float
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class RuleLogic(BaseModel):
    """Rule logic definition."""
    type: RuleLogicType
    expression: str
    parameters: Optional[dict[str, Any]] = None


class DQRule(BaseModel):
    """Data Quality Rule."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    cde_id: str
    dimension: DQDimension
    name: str
    description: str
    logic: RuleLogic
    threshold: Threshold
    severity: Severity
    owner: str
    enabled: bool = True


class RuleExecutionResult(BaseModel):
    """Result of executing a DQ rule."""
    rule_id: str
    passed: bool
    actual_value: Any
    expected_value: Any
    failed_records: Optional[int] = None
    total_records: int
    executed_at: datetime


class DataSnapshot(BaseModel):
    """Data snapshot for rule execution."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    cde_id: str
    data: list[Any] = []
    captured_at: datetime


class DataProfile(BaseModel):
    """Historical data profile for threshold calculation."""
    cde_id: str
    sample_size: int
    null_percentage: float
    unique_percentage: float
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    avg_value: Optional[float] = None
    std_dev: Optional[float] = None
    patterns: list[str] = []
    captured_at: datetime


class DQRuleRepository(BaseModel):
    """DQ Rule Repository for a report."""
    report_id: str
    rules: list[DQRule] = []
    version: int = 0
    last_updated: datetime


class DQDimensionDefinition(BaseModel):
    """Data Quality Dimension Definition."""
    dimension: DQDimension
    definition: str
    measurement_method: str
    examples: list[str] = []


class DQThreshold(BaseModel):
    """Data Quality Threshold by category."""
    dimension: DQDimension
    cde_category: Literal['all', 'critical', 'high', 'medium']
    minimum_score: float
    target_score: float


class DataQualityStandards(BaseModel):
    """Data Quality Standards."""
    dimensions: list[DQDimensionDefinition] = []
    thresholds: list[DQThreshold] = []
    version: int = 0
    approved_by: str
    approved_at: datetime
