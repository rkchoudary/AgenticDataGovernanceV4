"""
Hypothesis strategies for Workflow models.

Contains test data generators for workflow-related Pydantic models.

**Feature: agentcore-python-refactor, Property 3-4, 24-25: Workflow and Orchestration**
**Validates: Requirements 2.2, 2.3, 12.1, 12.2, 12.4**
"""

from datetime import datetime, timedelta
from typing import Any
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.workflow import (
    CycleInstance,
    HumanTask,
    Checkpoint,
    Decision,
    AgentContext,
    AgentResult,
    AgentStatusInfo,
    Notification,
    WorkflowAction,
    WorkflowStep,
    ValidationError,
    CycleStatus,
    Phase,
    TaskType,
    TaskStatus,
    DecisionOutcome,
    AgentType,
    AgentStatus,
    WorkflowActionType,
    WorkflowStepStatus,
)


# Basic strategies - enums
cycle_status_strategy = st.sampled_from(['active', 'paused', 'completed', 'failed'])
phase_strategy = st.sampled_from(['data_gathering', 'validation', 'review', 'approval', 'submission'])
task_type_strategy = st.sampled_from([
    'catalog_review',
    'requirements_validation',
    'cde_approval',
    'rule_review',
    'lineage_validation',
    'issue_resolution_confirmation',
    'submission_approval',
    'attestation'
])
task_status_strategy = st.sampled_from(['pending', 'in_progress', 'completed', 'escalated'])
decision_outcome_strategy = st.sampled_from(['approved', 'rejected', 'approved_with_changes'])
agent_type_strategy = st.sampled_from([
    'regulatory_intelligence',
    'data_requirements',
    'cde_identification',
    'data_quality_rule',
    'lineage_mapping',
    'issue_management',
    'documentation'
])
agent_status_strategy = st.sampled_from(['idle', 'running', 'completed', 'failed', 'waiting'])
workflow_action_type_strategy = st.sampled_from(['retry', 'skip', 'pause', 'fail'])
workflow_step_status_strategy = st.sampled_from(['pending', 'in_progress', 'completed', 'failed', 'waiting_for_human'])
checkpoint_status_strategy = st.sampled_from(['pending', 'completed', 'skipped'])
notification_type_strategy = st.sampled_from(['info', 'warning', 'error', 'escalation'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Role strategy
role_strategy = st.sampled_from([
    'compliance_officer', 'data_steward', 'data_owner',
    'risk_manager', 'auditor', 'manager', 'senior_manager'
])


@composite
def decision_strategy(draw, outcome: DecisionOutcome = None):
    """
    Generate a Decision.
    
    Args:
        outcome: Optional specific outcome.
    """
    return Decision(
        outcome=outcome or draw(decision_outcome_strategy),
        changes=draw(st.none() | st.fixed_dictionaries({
            'field': st.just('test_field'),
            'old_value': st.just('old'),
            'new_value': st.just('new')
        }))
    )


@composite
def checkpoint_strategy(draw, status: str = None):
    """
    Generate a Checkpoint.
    
    Args:
        status: Optional specific status.
    """
    actual_status = status or draw(checkpoint_status_strategy)
    required = draw(st.lists(role_strategy, min_size=1, max_size=3, unique=True))
    
    completed = []
    if actual_status == 'completed':
        completed = required.copy()
    elif actual_status == 'pending':
        # Partially completed
        num_completed = draw(st.integers(min_value=0, max_value=len(required) - 1))
        completed = required[:num_completed]
    
    return Checkpoint(
        id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        phase=draw(phase_strategy),
        required_approvals=required,
        completed_approvals=completed,
        status=actual_status
    )


@composite
def human_task_strategy(
    draw,
    task_type: TaskType = None,
    status: TaskStatus = None,
    with_decision: bool = None
):
    """
    Generate a HumanTask.
    
    Args:
        task_type: Optional specific task type.
        status: Optional specific status.
        with_decision: If True, include decision. If False, exclude.
    """
    actual_status = status or draw(task_status_strategy)
    created_at = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    
    task = HumanTask(
        id=draw(st.uuids().map(str)),
        cycle_id=draw(st.uuids().map(str)),
        type=task_type or draw(task_type_strategy),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        assigned_to=draw(non_empty_string_strategy),
        assigned_role=draw(role_strategy),
        due_date=draw(st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        )),
        status=actual_status,
        created_at=created_at,
        escalation_level=draw(st.integers(min_value=0, max_value=3))
    )
    
    # Add decision if completed or explicitly requested
    has_decision = with_decision if with_decision is not None else (actual_status == 'completed')
    if has_decision:
        task.decision = draw(decision_strategy())
        task.decision_rationale = draw(st.text(
            min_size=20,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
        task.completed_at = draw(st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        ))
        task.completed_by = draw(non_empty_string_strategy)
    
    return task


@composite
def cycle_instance_strategy(
    draw,
    status: CycleStatus = None,
    phase: Phase = None,
    with_checkpoints: bool = True
):
    """
    Generate a CycleInstance.
    
    Args:
        status: Optional specific status.
        phase: Optional specific phase.
        with_checkpoints: If True, include checkpoints.
    """
    actual_status = status or draw(cycle_status_strategy)
    started_at = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    
    cycle = CycleInstance(
        id=draw(st.uuids().map(str)),
        report_id=draw(st.uuids().map(str)),
        period_end=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        status=actual_status,
        current_phase=phase or draw(phase_strategy),
        started_at=started_at
    )
    
    if with_checkpoints:
        cycle.checkpoints = draw(st.lists(checkpoint_strategy(), min_size=0, max_size=5))
    
    if actual_status == 'completed':
        cycle.completed_at = draw(st.datetimes(
            min_value=started_at,
            max_value=datetime(2030, 12, 31)
        ))
    elif actual_status == 'paused':
        cycle.paused_at = draw(st.datetimes(
            min_value=started_at,
            max_value=datetime(2030, 12, 31)
        ))
        cycle.pause_reason = draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
    
    return cycle


@composite
def agent_context_strategy(draw):
    """Generate an AgentContext."""
    return AgentContext(
        cycle_id=draw(st.uuids().map(str)),
        report_id=draw(st.uuids().map(str)),
        phase=draw(phase_strategy),
        parameters=draw(st.none() | st.fixed_dictionaries({
            'threshold': st.floats(min_value=0.0, max_value=1.0),
            'max_items': st.integers(min_value=1, max_value=100)
        }))
    )


@composite
def agent_result_strategy(draw, success: bool = None):
    """
    Generate an AgentResult.
    
    Args:
        success: Optional specific success status.
    """
    is_success = success if success is not None else draw(st.booleans())
    
    return AgentResult(
        agent_type=draw(agent_type_strategy),
        success=is_success,
        output=draw(st.none() | st.fixed_dictionaries({
            'items_processed': st.integers(min_value=0, max_value=1000),
            'status': st.just('completed')
        })),
        errors=[] if is_success else draw(st.lists(
            st.text(min_size=5, max_size=100),
            min_size=1,
            max_size=3
        )),
        executed_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        duration=draw(st.floats(min_value=0.1, max_value=3600.0))
    )


@composite
def agent_status_info_strategy(draw):
    """Generate an AgentStatusInfo."""
    status = draw(agent_status_strategy)
    
    info = AgentStatusInfo(
        agent_type=draw(agent_type_strategy),
        status=status
    )
    
    if status != 'idle':
        info.last_run = draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
        info.last_result = draw(agent_result_strategy())
    
    return info


@composite
def notification_strategy(draw):
    """Generate a Notification."""
    return Notification(
        id=draw(st.uuids().map(str)),
        type=draw(notification_type_strategy),
        title=draw(non_empty_string_strategy),
        message=draw(st.text(
            min_size=10,
            max_size=500,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        recipients=draw(st.lists(non_empty_string_strategy, min_size=1, max_size=5)),
        sent_at=draw(st.none() | st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def workflow_action_strategy(draw):
    """Generate a WorkflowAction."""
    action_type = draw(workflow_action_type_strategy)
    
    return WorkflowAction(
        type=action_type,
        delay=draw(st.none() | st.integers(min_value=1, max_value=3600)) if action_type == 'retry' else None,
        reason=draw(st.none() | st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        notification=draw(st.none() | notification_strategy()),
        error=draw(st.none() | st.text(min_size=5, max_size=100)) if action_type == 'fail' else None
    )


@composite
def workflow_step_strategy(draw, is_human_checkpoint: bool = None):
    """
    Generate a WorkflowStep.
    
    Args:
        is_human_checkpoint: If True, make it a human checkpoint.
    """
    is_checkpoint = is_human_checkpoint if is_human_checkpoint is not None else draw(st.booleans())
    
    step = WorkflowStep(
        id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        is_human_checkpoint=is_checkpoint,
        dependencies=draw(st.lists(st.uuids().map(str), min_size=0, max_size=3)),
        status=draw(workflow_step_status_strategy)
    )
    
    if is_checkpoint:
        step.required_role = draw(role_strategy)
        step.agent_type = None
    else:
        step.agent_type = draw(agent_type_strategy)
        step.required_role = None
    
    return step


@composite
def validation_error_strategy(draw):
    """Generate a ValidationError."""
    return ValidationError(
        field=draw(non_empty_string_strategy),
        message=draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        code=draw(st.sampled_from(['REQUIRED', 'INVALID_FORMAT', 'OUT_OF_RANGE', 'DUPLICATE']))
    )


@composite
def active_cycle_strategy(draw, phase: Phase = None):
    """
    Generate an active cycle.
    
    Convenience strategy for testing active workflows.
    """
    return draw(cycle_instance_strategy(status='active', phase=phase))


@composite
def paused_cycle_strategy(draw):
    """
    Generate a paused cycle.
    
    Convenience strategy for testing paused workflows.
    """
    return draw(cycle_instance_strategy(status='paused'))
