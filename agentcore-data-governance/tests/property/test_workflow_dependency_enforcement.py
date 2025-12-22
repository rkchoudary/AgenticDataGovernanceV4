"""
**Feature: agentcore-python-refactor, Property 3: Workflow Dependency Enforcement**

For any workflow with task dependencies, a dependent task cannot transition
to 'in_progress' or 'completed' status while any of its prerequisite tasks
remain in 'pending' or 'in_progress' status.

**Validates: Requirements 2.2, 12.1**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.regulatory import ReportCatalog, RegulatoryReport, DueDateRule
from models.workflow import (
    CycleInstance,
    Phase,
    AgentType,
    Checkpoint,
)
from repository.in_memory import InMemoryGovernanceRepository
from tools.orchestrator_tools import (
    create_orchestrator_tools,
    PHASE_DEPENDENCIES,
    AGENT_PHASE_MAPPING,
)


# Agent dependency configuration (mirrors the orchestrator)
AGENT_DEPENDENCIES: dict[AgentType, list[AgentType]] = {
    'regulatory_intelligence': [],
    'data_requirements': [],  # Same phase as regulatory_intelligence
    'cde_identification': [],  # Same phase as data_requirements
    'data_quality_rule': [],  # Depends on data_gathering phase completion
    'lineage_mapping': [],  # Same phase as data_requirements
    'issue_management': [],  # Depends on data_gathering phase completion
    'documentation': [],  # Depends on validation phase completion
}

# Agents that have phase dependencies (require prior phase completion)
AGENTS_WITH_PHASE_DEPS: list[AgentType] = [
    'data_quality_rule',  # validation phase - requires data_gathering
    'issue_management',   # validation phase - requires data_gathering
    'documentation',      # review phase - requires validation
]


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
def agent_with_phase_deps_strategy(draw):
    """Generate an agent type that has phase dependencies."""
    return draw(st.sampled_from(AGENTS_WITH_PHASE_DEPS))


@st.composite
def agent_without_phase_deps_strategy(draw):
    """Generate an agent type that has no phase dependencies."""
    agents_without_deps: list[AgentType] = [
        'regulatory_intelligence',
        'data_requirements',
        'cde_identification',
        'lineage_mapping',
    ]
    return draw(st.sampled_from(agents_without_deps))


@st.composite
def non_empty_string_strategy(draw):
    """Generate a non-empty string for names and identifiers."""
    return draw(st.text(
        min_size=1,
        max_size=50,
        alphabet=st.characters(whitelist_categories=('L', 'N'))
    ))


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


class TestWorkflowDependencyEnforcement:
    """
    Property 3: Workflow Dependency Enforcement
    
    Tests that workflow dependencies are enforced - dependent tasks cannot
    proceed until their prerequisites are completed.
    """
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        agent_type=agent_with_phase_deps_strategy(),
        initiator=non_empty_string_strategy(),
    )
    def test_agent_with_phase_deps_blocked_when_prereqs_incomplete(
        self,
        report_id: str,
        period_end: datetime,
        agent_type: AgentType,
        initiator: str,
    ):
        """
        **Validates: Requirements 2.2, 12.1**
        
        Property: For any agent with phase dependencies, triggering the agent
        must fail when prerequisite phases have not completed their checkpoints.
        """
        assume(len(initiator) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        trigger_agent = tools[3]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Verify cycle was created
        assert cycle_result['status'] == 'active'
        
        # Try to trigger an agent that has phase dependencies
        # This should fail because prerequisite phases are not completed
        with pytest.raises(ValueError) as exc_info:
            trigger_agent(
                cycle_id=cycle_id,
                agent_type=agent_type,
                parameters=None,
                triggerer=initiator
            )
        
        # Verify the error mentions prerequisites or phase
        error_message = str(exc_info.value).lower()
        assert 'prerequisite' in error_message or 'phase' in error_message, \
            f"Expected error about prerequisites/phase, got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        agent_type=agent_without_phase_deps_strategy(),
        initiator=non_empty_string_strategy(),
    )
    def test_agent_without_phase_deps_can_be_triggered(
        self,
        report_id: str,
        period_end: datetime,
        agent_type: AgentType,
        initiator: str,
    ):
        """
        **Validates: Requirements 2.2, 12.1**
        
        Property: For any agent without phase dependencies (in data_gathering phase),
        triggering the agent should succeed when the cycle is active.
        """
        assume(len(initiator) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        trigger_agent = tools[3]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Trigger an agent without phase dependencies - should succeed
        result = trigger_agent(
            cycle_id=cycle_id,
            agent_type=agent_type,
            parameters=None,
            triggerer=initiator
        )
        
        # Verify the agent was triggered successfully
        assert result['triggered'] is True
        assert result['agent_type'] == agent_type
        assert result['result']['success'] is True
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        advancer=non_empty_string_strategy(),
    )
    def test_phase_advancement_requires_checkpoint_completion(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        advancer: str,
    ):
        """
        **Validates: Requirements 2.2, 12.1**
        
        Property: For any cycle, advancing to the next phase must fail
        when the current phase checkpoint is not completed.
        """
        assume(len(initiator) > 0 and len(advancer) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        advance_phase = tools[8]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Verify we're in data_gathering phase
        assert cycle_result['current_phase'] == 'data_gathering'
        
        # Try to advance phase without completing checkpoint
        with pytest.raises(ValueError) as exc_info:
            advance_phase(
                cycle_id=cycle_id,
                advancer=advancer,
                rationale="Trying to advance without checkpoint completion"
            )
        
        # Verify the error mentions checkpoint
        error_message = str(exc_info.value).lower()
        assert 'checkpoint' in error_message or 'completed' in error_message, \
            f"Expected error about checkpoint completion, got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
        advancer=non_empty_string_strategy(),
    )
    def test_phase_advancement_succeeds_after_checkpoint_completion(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
        advancer: str,
    ):
        """
        **Validates: Requirements 2.2, 12.1**
        
        Property: For any cycle, advancing to the next phase should succeed
        when the current phase checkpoint is completed.
        """
        assume(len(initiator) > 0 and len(advancer) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        advance_phase = tools[8]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Manually complete the data_gathering checkpoint
        cycle = repository.get_cycle_instance(cycle_id)
        for checkpoint in cycle.checkpoints:
            if checkpoint.phase == 'data_gathering':
                checkpoint.status = 'completed'
                checkpoint.completed_approvals = checkpoint.required_approvals.copy()
                break
        repository.update_cycle_instance(cycle)
        
        # Now advance phase should succeed
        result = advance_phase(
            cycle_id=cycle_id,
            advancer=advancer,
            rationale="Advancing after checkpoint completion"
        )
        
        # Verify phase was advanced
        assert result['current_phase'] == 'validation', \
            f"Expected 'validation' phase, got '{result['current_phase']}'"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
    )
    def test_agent_trigger_blocked_on_paused_cycle(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
    ):
        """
        **Validates: Requirements 2.2, 12.1**
        
        Property: For any paused cycle, triggering any agent must fail.
        """
        assume(len(initiator) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        pause_cycle = tools[1]
        trigger_agent = tools[3]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Pause the cycle
        pause_cycle(
            cycle_id=cycle_id,
            reason="Testing pause behavior",
            pauser=initiator
        )
        
        # Try to trigger an agent on paused cycle
        with pytest.raises(ValueError) as exc_info:
            trigger_agent(
                cycle_id=cycle_id,
                agent_type='regulatory_intelligence',
                parameters=None,
                triggerer=initiator
            )
        
        # Verify the error mentions status
        error_message = str(exc_info.value).lower()
        assert 'status' in error_message or 'paused' in error_message, \
            f"Expected error about cycle status, got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        report_id=report_id_strategy(),
        period_end=period_end_strategy(),
        initiator=non_empty_string_strategy(),
    )
    def test_validation_agent_allowed_after_data_gathering_complete(
        self,
        report_id: str,
        period_end: datetime,
        initiator: str,
    ):
        """
        **Validates: Requirements 2.2, 12.1**
        
        Property: For any cycle where data_gathering phase is complete,
        validation phase agents (data_quality_rule, issue_management) can be triggered.
        """
        assume(len(initiator) > 0)
        
        repository = setup_repository_with_report(report_id)
        tools = create_orchestrator_tools(repository)
        
        # Get tool functions
        start_report_cycle = tools[0]
        advance_phase = tools[8]
        trigger_agent = tools[3]
        
        # Start a new cycle
        cycle_result = start_report_cycle(
            report_id=report_id,
            period_end=period_end.isoformat(),
            initiator=initiator
        )
        cycle_id = cycle_result['id']
        
        # Complete data_gathering checkpoint and advance to validation
        cycle = repository.get_cycle_instance(cycle_id)
        for checkpoint in cycle.checkpoints:
            if checkpoint.phase == 'data_gathering':
                checkpoint.status = 'completed'
                checkpoint.completed_approvals = checkpoint.required_approvals.copy()
                break
        repository.update_cycle_instance(cycle)
        
        advance_phase(
            cycle_id=cycle_id,
            advancer=initiator,
            rationale="Advancing to validation phase"
        )
        
        # Now validation phase agents should be triggerable
        result = trigger_agent(
            cycle_id=cycle_id,
            agent_type='data_quality_rule',
            parameters=None,
            triggerer=initiator
        )
        
        # Verify the agent was triggered successfully
        assert result['triggered'] is True
        assert result['agent_type'] == 'data_quality_rule'
        assert result['result']['success'] is True

