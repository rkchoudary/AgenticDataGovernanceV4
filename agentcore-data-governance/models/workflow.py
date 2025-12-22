"""
Workflow and orchestration models for the Agentic Data Governance System.

This module defines Pydantic models for cycles, tasks, checkpoints, and decisions.

Requirements: 2.7
"""

from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type aliases - CycleStatus and Phase enums
CycleStatus = Literal['active', 'paused', 'completed', 'failed']
Phase = Literal['data_gathering', 'validation', 'review', 'approval', 'submission']
TaskType = Literal[
    'catalog_review',
    'requirements_validation',
    'cde_approval',
    'rule_review',
    'lineage_validation',
    'issue_resolution_confirmation',
    'submission_approval',
    'attestation'
]
TaskStatus = Literal['pending', 'in_progress', 'completed', 'escalated']
DecisionOutcome = Literal['approved', 'rejected', 'approved_with_changes']
AgentType = Literal[
    'regulatory_intelligence',
    'data_requirements',
    'cde_identification',
    'data_quality_rule',
    'lineage_mapping',
    'issue_management',
    'documentation'
]
AgentStatus = Literal['idle', 'running', 'completed', 'failed', 'waiting']
WorkflowActionType = Literal['retry', 'skip', 'pause', 'fail']
WorkflowStepStatus = Literal['pending', 'in_progress', 'completed', 'failed', 'waiting_for_human']


class Decision(BaseModel):
    """Decision made at a checkpoint."""
    outcome: DecisionOutcome
    changes: Optional[Any] = None


class Checkpoint(BaseModel):
    """Checkpoint in a workflow cycle."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    phase: Phase
    required_approvals: list[str] = []
    completed_approvals: list[str] = []
    status: Literal['pending', 'completed', 'skipped'] = 'pending'


class HumanTask(BaseModel):
    """Human task in the workflow."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    cycle_id: str
    type: TaskType
    title: str
    description: str
    assigned_to: str
    assigned_role: str
    due_date: datetime
    status: TaskStatus = 'pending'
    decision: Optional[Decision] = None
    decision_rationale: Optional[str] = None
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None
    created_at: datetime
    escalation_level: int = 0


class CycleInstance(BaseModel):
    """Cycle instance for a report."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    tenant_id: Optional[str] = None  # Multi-tenant support
    report_id: str
    period_end: datetime
    status: CycleStatus = 'active'
    current_phase: Phase = 'data_gathering'
    checkpoints: list[Checkpoint] = []
    started_at: datetime
    completed_at: Optional[datetime] = None
    paused_at: Optional[datetime] = None
    pause_reason: Optional[str] = None


class AgentContext(BaseModel):
    """Context passed to agents."""
    cycle_id: str
    report_id: str
    phase: Phase
    parameters: Optional[dict[str, Any]] = None


class AgentResult(BaseModel):
    """Result from agent execution."""
    agent_type: AgentType
    success: bool
    output: Optional[Any] = None
    errors: list[str] = []
    executed_at: datetime
    duration: float


class AgentStatusInfo(BaseModel):
    """Status of an agent."""
    agent_type: AgentType
    status: AgentStatus
    last_run: Optional[datetime] = None
    last_result: Optional[AgentResult] = None


class Notification(BaseModel):
    """Notification for workflow events."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: Literal['info', 'warning', 'error', 'escalation']
    title: str
    message: str
    recipients: list[str] = []
    sent_at: Optional[datetime] = None


class WorkflowAction(BaseModel):
    """Workflow action."""
    type: WorkflowActionType
    delay: Optional[int] = None
    reason: Optional[str] = None
    notification: Optional[Notification] = None
    error: Optional[str] = None


class WorkflowStep(BaseModel):
    """Workflow step definition."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    agent_type: Optional[AgentType] = None
    is_human_checkpoint: bool = False
    required_role: Optional[str] = None
    dependencies: list[str] = []
    status: WorkflowStepStatus = 'pending'


class ValidationError(BaseModel):
    """Validation error in workflow."""
    field: str
    message: str
    code: str
