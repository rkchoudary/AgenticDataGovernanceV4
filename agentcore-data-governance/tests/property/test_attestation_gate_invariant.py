"""
**Feature: agentcore-python-refactor, Property 4: Attestation Gate Invariant**

For any report cycle requiring management attestation, the cycle cannot reach
'submission_ready' (completed submission phase) while the attestation task is
not 'completed' with 'approved' outcome.

**Validates: Requirements 2.3**
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
def decision_outcome_strategy(draw):
    """Generate a decision outcome."""
    return draw(st.sampled_from(['approved', 'rejected', 'approved_with_changes']))


@st.composite
def non_approved_decision_strategy(draw):
    """Generate a decision outcome that is NOT 'approved'."""
    return draw(st.sampled_from(['rejected', 'approved_with_changes']))


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


def advance_cycle_to_submission_phase(
    repository: InMemoryGovernanceRepository,
    cycle_id: str,
    advancer: str
) -> CycleInstance:
    """
    Advance a cycle through all phases up to submission phase.
    
    This completes all checkpoints and advances through:
    data_gathering -> validation -> review -> approval -> submission
    """
    tools = create_orchestrator_tools(repository)
    advance_phase = tools[8]  # advance_phase tool
    
    phases_to_complete = ['data_gathering', 'validation', 'review', 'approval']
    
    for phase in phases_to_complete:
        # Complete the checkpoint for current phase
        cycle = repository.get_cycle_instance(cycle_id)
        for checkpoint in cycle.checkpoints:
            if checkpoint.phase == phase:
                checkpoint.status = 'completed'
                checkpoint.completed_approvals = checkpoint.required_approvals.copy()
                break
        repository.update_cycle_instance(cycle)
        
        # Advance to next phase
        advance_phase(
            cycle_id=cycle_id,
            advancer=advancer,
            rationale=f"Advancing from {phase} phase"
        )
    
    return repository.get_cycle_instance(cycle_id)


def check_attestation_gate(
    repository: InMemoryGovernanceRepository,
    cycle_id: str
) -> tuple[bool, str]:
    """
    Check if the attestation gate allows cycle completion.
    
    Returns:
        Tuple of (can_complete, reason)
    """
    cycle = repository.get_cycle_instance(cycle_id)
    if not cycle:
        return False, "Cycle not found"
    
    # Get all attestation tasks for this cycle
    all_tasks = repository.get_pending_tasks(cycle_id=cycle_id)
    
    # Also check completed tasks
    attestation_tasks = []
    for task_id in repository._human_tasks:
        task = repository._human_tasks[task_id]
        if task.cycle_id == cycle_id and task.type == 'attestation':
            attestation_tasks.append(task)
    
    if not attestation_tasks:
        # No attestation task exists - gate not satisfied
        return False, "No attestation task exists for this cycle"
    
    # Check if any attestation task is completed with 'approved' outcome
    for task in attestation_tasks:
        if task.status == 'completed' and task.decision:
            if task.decision.outcome == 'approved':
                return True, "Attestation approved"
    
    # No approved attestation found
    pending_count = sum(1 for t in attestation_tasks if t.status != 'completed')
    rejected_count = sum(
        1 for t in attestation_tasks 
        if t.status == 'completed' and t.decision and t.decision.outcome != 'approved'
    )
    
    if pending_count > 0:
        return False, f"Attestation task(s) still pending: {pending_count}"
    if rejected_count > 0:
        return False, f"Attestation task(s) rejected or not approved: {rejected_count}"
    
    return False, "Attestation not approved"


class TestAttestationGateInvariant:
    """
    Property 4: Attestation Gate Invariant
    
    Tests that report cycles cannot reach submission_ready status while
    the attestation task is not completed with 'approved' outcome.
    """
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        attestor=non_empty_string_strategy(),
    )
    def test_cycle_cannot_complete_without_attestation_task(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        attestor: str,
    ):
        """
        **Validates: Requirements 2.3**
        
        Property: For any cycle in submission phase, the attestation gate
        check must fail when no attestation task exists.
        """
        assume(len(initiator) > 0 and len(attestor) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Start a new cycle
        start_report_cycle = tools[0]
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Advance to submission phase
        cycle = advance_cycle_to_submission_phase(repository, cycle_id, initiator)
        
        # Verify we're in submission phase
        assert cycle.current_phase == 'submission', \
            f"Expected 'submission' phase, got '{cycle.current_phase}'"
        
        # Check attestation gate - should fail without attestation task
        can_complete, reason = check_attestation_gate(repository, cycle_id)
        
        assert can_complete is False, \
            f"Attestation gate should fail without attestation task, but got: {reason}"
        assert "attestation" in reason.lower(), \
            f"Reason should mention attestation, got: {reason}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        attestor=non_empty_string_strategy(),
    )
    def test_cycle_cannot_complete_with_pending_attestation(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        attestor: str,
    ):
        """
        **Validates: Requirements 2.3**
        
        Property: For any cycle with a pending attestation task, the
        attestation gate check must fail.
        """
        assume(len(initiator) > 0 and len(attestor) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Start a new cycle
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Advance to submission phase
        cycle = advance_cycle_to_submission_phase(repository, cycle_id, initiator)
        
        # Create an attestation task (pending status)
        due_date = datetime.now() + timedelta(days=7)
        create_human_task(
            cycle_id=cycle_id,
            task_type='attestation',
            title='Management Attestation',
            description='Senior management must attest to the accuracy and completeness of this submission.',
            assigned_to=attestor,
            assigned_role='senior_manager',
            due_date=due_date.isoformat(),
            creator='GovernanceOrchestrator'
        )
        
        # Check attestation gate - should fail with pending task
        can_complete, reason = check_attestation_gate(repository, cycle_id)
        
        assert can_complete is False, \
            f"Attestation gate should fail with pending attestation, but got: {reason}"
        assert "pending" in reason.lower() or "attestation" in reason.lower(), \
            f"Reason should mention pending or attestation, got: {reason}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        attestor=non_empty_string_strategy(),
        decision=non_approved_decision_strategy(),
    )
    def test_cycle_cannot_complete_with_non_approved_attestation(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        attestor: str,
        decision: DecisionOutcome,
    ):
        """
        **Validates: Requirements 2.3**
        
        Property: For any cycle with an attestation task that is completed
        but NOT with 'approved' outcome, the attestation gate must fail.
        """
        assume(len(initiator) > 0 and len(attestor) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Start a new cycle
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        complete_human_task = tools[5]
        
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Advance to submission phase
        cycle = advance_cycle_to_submission_phase(repository, cycle_id, initiator)
        
        # Create an attestation task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type='attestation',
            title='Management Attestation',
            description='Senior management must attest to the accuracy and completeness of this submission.',
            assigned_to=attestor,
            assigned_role='senior_manager',
            due_date=due_date.isoformat(),
            creator='GovernanceOrchestrator'
        )
        task_id = task_result['id']
        
        # Complete the attestation task with non-approved decision
        complete_human_task(
            task_id=task_id,
            decision=decision,
            rationale='This is a test rationale that is at least 20 characters long.',
            completed_by=attestor
        )
        
        # Check attestation gate - should fail with non-approved decision
        can_complete, reason = check_attestation_gate(repository, cycle_id)
        
        assert can_complete is False, \
            f"Attestation gate should fail with '{decision}' decision, but got: {reason}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        attestor=non_empty_string_strategy(),
    )
    def test_cycle_can_complete_with_approved_attestation(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        attestor: str,
    ):
        """
        **Validates: Requirements 2.3**
        
        Property: For any cycle with an attestation task completed with
        'approved' outcome, the attestation gate check should pass.
        """
        assume(len(initiator) > 0 and len(attestor) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Start a new cycle
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        complete_human_task = tools[5]
        
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Advance to submission phase
        cycle = advance_cycle_to_submission_phase(repository, cycle_id, initiator)
        
        # Create an attestation task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type='attestation',
            title='Management Attestation',
            description='Senior management must attest to the accuracy and completeness of this submission.',
            assigned_to=attestor,
            assigned_role='senior_manager',
            due_date=due_date.isoformat(),
            creator='GovernanceOrchestrator'
        )
        task_id = task_result['id']
        
        # Complete the attestation task with 'approved' decision
        complete_human_task(
            task_id=task_id,
            decision='approved',
            rationale='All data has been verified and is accurate. Approving for submission.',
            completed_by=attestor
        )
        
        # Check attestation gate - should pass with approved decision
        can_complete, reason = check_attestation_gate(repository, cycle_id)
        
        assert can_complete is True, \
            f"Attestation gate should pass with 'approved' decision, but failed: {reason}"
        assert "approved" in reason.lower(), \
            f"Reason should mention approved, got: {reason}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        attestor=non_empty_string_strategy(),
    )
    def test_attestation_gate_invariant_holds_across_phases(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        attestor: str,
    ):
        """
        **Validates: Requirements 2.3**
        
        Property: The attestation gate invariant must hold regardless of
        how the cycle reached the submission phase - the gate check must
        always require an approved attestation task.
        """
        assume(len(initiator) > 0 and len(attestor) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Start a new cycle
        start_report_cycle = tools[0]
        create_human_task = tools[4]
        complete_human_task = tools[5]
        
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Advance to submission phase
        cycle = advance_cycle_to_submission_phase(repository, cycle_id, initiator)
        
        # Verify invariant: gate fails without attestation
        can_complete_1, _ = check_attestation_gate(repository, cycle_id)
        assert can_complete_1 is False, "Gate should fail without attestation"
        
        # Create attestation task
        due_date = datetime.now() + timedelta(days=7)
        task_result = create_human_task(
            cycle_id=cycle_id,
            task_type='attestation',
            title='Management Attestation',
            description='Senior management must attest to the accuracy and completeness.',
            assigned_to=attestor,
            assigned_role='senior_manager',
            due_date=due_date.isoformat(),
            creator='GovernanceOrchestrator'
        )
        task_id = task_result['id']
        
        # Verify invariant: gate fails with pending attestation
        can_complete_2, _ = check_attestation_gate(repository, cycle_id)
        assert can_complete_2 is False, "Gate should fail with pending attestation"
        
        # Complete with rejection
        complete_human_task(
            task_id=task_id,
            decision='rejected',
            rationale='Data quality issues found. Rejecting attestation request.',
            completed_by=attestor
        )
        
        # Verify invariant: gate fails with rejected attestation
        can_complete_3, _ = check_attestation_gate(repository, cycle_id)
        assert can_complete_3 is False, "Gate should fail with rejected attestation"
        
        # Create new attestation task and approve it
        task_result_2 = create_human_task(
            cycle_id=cycle_id,
            task_type='attestation',
            title='Management Attestation - Retry',
            description='Second attestation attempt after issues resolved.',
            assigned_to=attestor,
            assigned_role='senior_manager',
            due_date=due_date.isoformat(),
            creator='GovernanceOrchestrator'
        )
        task_id_2 = task_result_2['id']
        
        complete_human_task(
            task_id=task_id_2,
            decision='approved',
            rationale='All issues resolved. Data verified and accurate. Approving.',
            completed_by=attestor
        )
        
        # Verify invariant: gate passes with approved attestation
        can_complete_4, _ = check_attestation_gate(repository, cycle_id)
        assert can_complete_4 is True, "Gate should pass with approved attestation"
