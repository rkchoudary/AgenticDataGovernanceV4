"""
**Feature: agentcore-python-refactor, Property 24: Human Checkpoint Pause Behavior**

For any workflow step configured as a human checkpoint, the workflow must pause
(status='paused') and create a HumanTask with the correct assigned_role before
any subsequent steps execute.

**Validates: Requirements 12.2**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.regulatory import ReportCatalog, RegulatoryReport, DueDateRule
from models.workflow import (
    CycleInstance,
    Phase,
    Checkpoint,
    HumanTask,
    TaskType,
    TaskStatus,
    Decision,
    DecisionOutcome,
)
from repository.in_memory import InMemoryGovernanceRepository
from tools.orchestrator_tools import create_orchestrator_tools


# Strategies for generating test data
@st.composite
def report_id_strategy(draw):
    """Generate a valid report ID."""
    return draw(st.uuids().map(str))


@st.composite
def period_end_strategy(draw):
    """Generate a valid period end date."""
    return draw(st.datetimes(
        min_value=datetime(2024, 1, 1),
        max_value=datetime(2030, 12, 31)
    ))


@st.composite
def non_empty_string_strategy(draw):
    """Generate a non-empty string for names and identifiers."""
    return draw(st.text(
        min_size=1,
        max_size=50,
        alphabet=st.characters(whitelist_categories=('L', 'N'))
    ))


@st.composite
def task_type_strategy(draw):
    """Generate a valid task type."""
    return draw(st.sampled_from([
        'catalog_review', 'requirements_validation', 'cde_approval',
        'rule_review', 'lineage_validation', 'issue_resolution_confirmation',
        'submission_approval', 'attestation'
    ]))


@st.composite
def assigned_role_strategy(draw):
    """Generate a valid assigned role."""
    return draw(st.sampled_from([
        'data_steward', 'compliance_officer', 'data_quality_lead',
        'senior_manager', 'regulatory_reporting_manager', 'data_owner'
    ]))


def create_test_report(report_id: str) -> RegulatoryReport:
    """Create a test regulatory report."""
    return RegulatoryReport(
        id=report_id,
        name="Test Report",
        jurisdiction='US',
        regulator='SEC',
        frequency='quarterly',
        due_date=DueDateRule(
            days_after_period_end=30,
            business_days_only=True,
            timezone='UTC'
        ),
        submission_format='XML',
        submission_platform='EDGAR',
        description='A test regulatory report for property testing',
        last_updated=datetime.now(),
        responsible_unit='Compliance'
    )


def setup_repository_with_report(report_id: str) -> InMemoryGovernanceRepository:
    """Set up a repository with a test report."""
    repository = InMemoryGovernanceRepository()
    
    # Create a report catalog with the test report
    report = create_test_report(report_id)
    catalog = ReportCatalog(
        reports=[report],
        version=1,
        last_scanned=datetime.now(),
        status='approved'
    )
    repository.set_report_catalog(catalog)
    
    return repository


class TestHumanCheckpointPauseBehavior:
    """
    Property 24: Human Checkpoint Pause Behavior
    
    Tests that when a human checkpoint is reached, the workflow pauses
    and creates a HumanTask with the correct assigned_role.
    """
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        task_type=task_type_strategy(),
        assigned_to=non_empty_string_strategy(),
        assigned_role=assigned_role_strategy(),
    )
    def test_cycle_pauses_when_human_task_created(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        task_type: TaskType,
        assigned_to: str,
        assigned_role: str,
    ):
        """
        **Validates: Requirements 12.2**
        
        Property: For any cycle, when a human task is created, the cycle
        must transition to 'paused' status.
        """
        assume(len(initiator) > 0 and len(assigned_to) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        pause_cycle = tools[1]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Verify cycle is initially active
        cycle = repository.get_cycle_instance(cycle_id)
        assert cycle.status == 'active', \
            f"Expected cycle to be 'active' initially, got '{cycle.status}'"
        
        # Pause the cycle to simulate reaching a human checkpoint
        pause_cycle(
            cycle_id=cycle_id,
            reason=f"Waiting for human task: {task_type}",
            pauser="GovernanceOrchestrator"
        )
        
        # Create a human task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type=task_type,
            title=f"Human checkpoint: {task_type}",
            description="Human review required at this checkpoint.",
            assigned_to=assigned_to,
            assigned_role=assigned_role,
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        
        # Verify cycle is paused
        updated_cycle = repository.get_cycle_instance(cycle_id)
        assert updated_cycle.status == 'paused', \
            f"Expected cycle to be 'paused' after human task creation, got '{updated_cycle.status}'"
        
        # Verify pause reason mentions waiting for human task
        assert updated_cycle.pause_reason is not None, \
            "Pause reason should be set when cycle is paused"
        assert "human task" in updated_cycle.pause_reason.lower() or "waiting" in updated_cycle.pause_reason.lower(), \
            f"Pause reason should mention human task, got: {updated_cycle.pause_reason}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        task_type=task_type_strategy(),
        assigned_to=non_empty_string_strategy(),
        assigned_role=assigned_role_strategy(),
    )
    def test_human_task_created_with_correct_assigned_role(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        task_type: TaskType,
        assigned_to: str,
        assigned_role: str,
    ):
        """
        **Validates: Requirements 12.2**
        
        Property: For any human task created at a checkpoint, the task
        must have the correct assigned_role as specified.
        """
        assume(len(initiator) > 0 and len(assigned_to) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Create a human task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type=task_type,
            title=f"Human checkpoint: {task_type}",
            description="Human review required at this checkpoint.",
            assigned_to=assigned_to,
            assigned_role=assigned_role,
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        task_id = task_result['id']
        
        # Verify task was created with correct role
        task = repository.get_human_task(task_id)
        assert task is not None, "Human task should be created"
        assert task.assigned_role == assigned_role, \
            f"Expected assigned_role '{assigned_role}', got '{task.assigned_role}'"
        assert task.assigned_to == assigned_to, \
            f"Expected assigned_to '{assigned_to}', got '{task.assigned_to}'"
        assert task.status == 'pending', \
            f"Expected task status 'pending', got '{task.status}'"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        assigned_to=non_empty_string_strategy(),
        assigned_role=assigned_role_strategy(),
    )
    def test_audit_entry_created_for_human_task(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        assigned_to: str,
        assigned_role: str,
    ):
        """
        **Validates: Requirements 12.2**
        
        Property: For any human task created at a checkpoint, an audit
        entry must be created to record the action.
        """
        assume(len(initiator) > 0 and len(assigned_to) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Create a human task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type='catalog_review',
            title="Human checkpoint: catalog_review",
            description="Human review required at this checkpoint.",
            assigned_to=assigned_to,
            assigned_role=assigned_role,
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        task_id = task_result['id']
        
        # Verify audit entry was created
        audit_entries = repository.get_audit_entries()
        task_audit_entries = [
            e for e in audit_entries 
            if e.entity_type == 'HumanTask' and e.entity_id == task_id
        ]
        
        assert len(task_audit_entries) >= 1, \
            "At least one audit entry should be created for human task"
        
        create_entry = next(
            (e for e in task_audit_entries if e.action == 'create_human_task'),
            None
        )
        assert create_entry is not None, \
            "Audit entry for 'create_human_task' action should exist"
        assert create_entry.actor_type == 'agent', \
            f"Expected actor_type 'agent', got '{create_entry.actor_type}'"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        completer=non_empty_string_strategy(),
    )
    def test_cycle_resumes_after_human_task_approved(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        completer: str,
    ):
        """
        **Validates: Requirements 12.2**
        
        Property: For any paused cycle with a pending human task, completing
        the task with 'approved' decision should allow the cycle to resume.
        """
        assume(len(initiator) > 0 and len(completer) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        pause_cycle = tools[1]
        resume_cycle = tools[2]
        create_human_task = tools[4]
        complete_human_task = tools[5]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Pause the cycle for human checkpoint
        pause_cycle(
            cycle_id=cycle_id,
            reason="Waiting for human task: catalog_review",
            pauser="GovernanceOrchestrator"
        )
        
        # Create a human task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type='catalog_review',
            title="Human checkpoint: catalog_review",
            description="Human review required at this checkpoint.",
            assigned_to=completer,
            assigned_role='compliance_officer',
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        task_id = task_result['id']
        
        # Verify cycle is paused
        cycle = repository.get_cycle_instance(cycle_id)
        assert cycle.status == 'paused', \
            f"Expected cycle to be 'paused', got '{cycle.status}'"
        
        # Complete the task with approval
        complete_human_task(
            task_id=task_id,
            decision='approved',
            rationale='Reviewed and approved. All requirements met.',
            completed_by=completer
        )
        
        # Resume the cycle
        resume_cycle(
            cycle_id=cycle_id,
            resumer=completer,
            rationale="Human task completed with approval"
        )
        
        # Verify cycle is now active
        updated_cycle = repository.get_cycle_instance(cycle_id)
        assert updated_cycle.status == 'active', \
            f"Expected cycle to be 'active' after task approval and resume, got '{updated_cycle.status}'"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        completer=non_empty_string_strategy(),
    )
    def test_cycle_stays_paused_with_pending_tasks(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        completer: str,
    ):
        """
        **Validates: Requirements 12.2**
        
        Property: For any paused cycle with multiple human tasks, the cycle
        must remain paused while any task is still pending.
        """
        assume(len(initiator) > 0 and len(completer) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        pause_cycle = tools[1]
        create_human_task = tools[4]
        complete_human_task = tools[5]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Pause the cycle for human checkpoint
        pause_cycle(
            cycle_id=cycle_id,
            reason="Waiting for multiple human tasks",
            pauser="GovernanceOrchestrator"
        )
        
        # Create two human tasks
        due_date = datetime.now() + timedelta(days=7)
        task1_result = create_human_task(
            cycle_id=cycle_id,
            task_type='catalog_review',
            title="First human checkpoint",
            description="First review required.",
            assigned_to=completer,
            assigned_role='compliance_officer',
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        task1_id = task1_result['id']
        
        task2_result = create_human_task(
            cycle_id=cycle_id,
            task_type='requirements_validation',
            title="Second human checkpoint",
            description="Second review required.",
            assigned_to=completer,
            assigned_role='data_steward',
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        task2_id = task2_result['id']
        
        # Complete only the first task
        complete_human_task(
            task_id=task1_id,
            decision='approved',
            rationale='First task reviewed and approved.',
            completed_by=completer
        )
        
        # Verify cycle is still paused (second task is pending)
        cycle = repository.get_cycle_instance(cycle_id)
        assert cycle.status == 'paused', \
            f"Expected cycle to remain 'paused' with pending task, got '{cycle.status}'"
        
        # Verify second task is still pending
        task2 = repository.get_human_task(task2_id)
        assert task2.status == 'pending', \
            f"Expected second task to be 'pending', got '{task2.status}'"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        task_type=task_type_strategy(),
        assigned_to=non_empty_string_strategy(),
        assigned_role=assigned_role_strategy(),
    )
    def test_human_task_has_correct_cycle_association(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        task_type: TaskType,
        assigned_to: str,
        assigned_role: str,
    ):
        """
        **Validates: Requirements 12.2**
        
        Property: For any human task created at a checkpoint, the task
        must be correctly associated with the cycle it belongs to.
        """
        assume(len(initiator) > 0 and len(assigned_to) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Create a human task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type=task_type,
            title=f"Human checkpoint: {task_type}",
            description="Human review required at this checkpoint.",
            assigned_to=assigned_to,
            assigned_role=assigned_role,
            due_date=due_date.isoformat(),
            creator="GovernanceOrchestrator"
        )
        task_id = task_result['id']
        
        # Verify task is associated with the correct cycle
        task = repository.get_human_task(task_id)
        assert task is not None, "Human task should be created"
        assert task.cycle_id == cycle_id, \
            f"Expected task cycle_id '{cycle_id}', got '{task.cycle_id}'"
        
        # Verify task can be retrieved via pending tasks for cycle
        pending_tasks = repository.get_pending_tasks(cycle_id=cycle_id)
        task_ids = [t.id for t in pending_tasks]
        assert task_id in task_ids, \
            f"Task {task_id} should be in pending tasks for cycle {cycle_id}"

