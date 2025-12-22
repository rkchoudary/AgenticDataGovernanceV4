"""
Unit tests for the Governance Orchestrator.

Tests cycle management, human task workflows, and dependency enforcement.
Requirements: 12.1, 12.2, 12.3
"""
import pytest
from datetime import datetime, timedelta

from repository.in_memory import InMemoryGovernanceRepository
from tools.orchestrator_tools import create_orchestrator_tools
from models.workflow import CycleInstance, HumanTask, Checkpoint, Phase
from models.regulatory import RegulatoryReport, ReportCatalog, DueDateRule
from models.issues import Issue


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def orchestrator_tools(repository):
    """Create orchestrator tools with the test repository."""
    return create_orchestrator_tools(repository)


@pytest.fixture
def sample_report(repository):
    """Create a sample regulatory report in the repository."""
    report = RegulatoryReport(
        id="report-001",
        name="Test Regulatory Report",
        jurisdiction="US",
        regulator="Federal Reserve",
        frequency="quarterly",
        due_date=DueDateRule(days_after_period_end=30),
        submission_format="XML",
        submission_platform="FedLine",
        description="Test report for unit testing",
        last_updated=datetime.now(),
        responsible_unit="Regulatory Reporting"
    )
    catalog = ReportCatalog(
        reports=[report],
        version=1,
        last_scanned=datetime.now(),
        status='approved'
    )
    repository.set_report_catalog(catalog)
    return report


@pytest.fixture
def active_cycle(repository, sample_report):
    """Create an active cycle in the repository."""
    checkpoints = [
        Checkpoint(name="Data Gathering Complete", phase='data_gathering', required_approvals=['data_steward']),
        Checkpoint(name="Validation Complete", phase='validation', required_approvals=['data_steward']),
    ]
    cycle = CycleInstance(
        id="cycle-001",
        report_id="report-001",
        period_end=datetime.now() + timedelta(days=30),
        status='active',
        current_phase='data_gathering',
        checkpoints=checkpoints,
        started_at=datetime.now()
    )
    repository.create_cycle_instance(cycle)
    return cycle


@pytest.fixture
def paused_cycle(repository, sample_report):
    """Create a paused cycle in the repository."""
    cycle = CycleInstance(
        id="cycle-paused",
        report_id="report-001",
        period_end=datetime.now() + timedelta(days=30),
        status='paused',
        current_phase='data_gathering',
        checkpoints=[],
        started_at=datetime.now(),
        paused_at=datetime.now(),
        pause_reason="Blocking issue detected"
    )
    repository.create_cycle_instance(cycle)
    return cycle


@pytest.fixture
def pending_task(repository, active_cycle):
    """Create a pending human task in the repository."""
    task = HumanTask(
        id="task-001",
        cycle_id="cycle-001",
        type='catalog_review',
        title="Review Report Catalog",
        description="Review and approve the updated report catalog",
        assigned_to="compliance_officer",
        assigned_role="compliance_officer",
        due_date=datetime.now() + timedelta(days=7),
        status='pending',
        created_at=datetime.now()
    )
    repository.create_human_task(task)
    return task


class TestStartReportCycle:
    """Tests for start_report_cycle tool - Requirements 12.1, 12.2."""
    
    def test_creates_cycle_with_active_status(self, orchestrator_tools, repository, sample_report):
        """Test that cycle is created with active status."""
        start_tool = orchestrator_tools[0]  # start_report_cycle
        
        result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        
        assert result['status'] == 'active'
    
    def test_creates_cycle_with_data_gathering_phase(self, orchestrator_tools, repository, sample_report):
        """Test that cycle starts in data_gathering phase."""
        start_tool = orchestrator_tools[0]
        
        result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        
        assert result['current_phase'] == 'data_gathering'
    
    def test_generates_checkpoints(self, orchestrator_tools, repository, sample_report):
        """Test that checkpoints are generated for all phases."""
        start_tool = orchestrator_tools[0]
        
        result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        
        assert len(result['checkpoints']) == 5
        phases = [cp['phase'] for cp in result['checkpoints']]
        assert 'data_gathering' in phases
        assert 'validation' in phases
        assert 'review' in phases
        assert 'approval' in phases
        assert 'submission' in phases
    
    def test_fails_for_nonexistent_report(self, orchestrator_tools, repository):
        """Test that starting cycle fails for nonexistent report."""
        start_tool = orchestrator_tools[0]
        
        with pytest.raises(ValueError, match="not found"):
            start_tool(
                report_id="nonexistent",
                period_end="2025-12-31",
                initiator="compliance_officer"
            )
    
    def test_fails_if_active_cycle_exists(self, orchestrator_tools, repository, active_cycle):
        """Test that starting cycle fails if active cycle already exists."""
        start_tool = orchestrator_tools[0]
        
        with pytest.raises(ValueError, match="already has an active cycle"):
            start_tool(
                report_id="report-001",
                period_end="2025-12-31",
                initiator="compliance_officer"
            )
    
    def test_creates_audit_entry(self, orchestrator_tools, repository, sample_report):
        """Test that starting cycle creates an audit entry."""
        start_tool = orchestrator_tools[0]
        
        start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        
        audit_entries = repository.get_audit_entries()
        start_entries = [e for e in audit_entries if e.action == "start_report_cycle"]
        assert len(start_entries) == 1
        assert start_entries[0].actor == "compliance_officer"
    
    def test_persists_cycle_to_repository(self, orchestrator_tools, repository, sample_report):
        """Test that cycle is persisted to repository."""
        start_tool = orchestrator_tools[0]
        
        result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        
        stored_cycle = repository.get_cycle_instance(result['id'])
        assert stored_cycle is not None
        assert stored_cycle.report_id == "report-001"


class TestPauseCycle:
    """Tests for pause_cycle tool - Requirements 12.2."""
    
    def test_pauses_active_cycle(self, orchestrator_tools, repository, active_cycle):
        """Test that active cycle can be paused."""
        pause_tool = orchestrator_tools[1]  # pause_cycle
        
        result = pause_tool(
            cycle_id="cycle-001",
            reason="Blocking issue detected",
            pauser="compliance_officer"
        )
        
        assert result['status'] == 'paused'
    
    def test_sets_pause_reason(self, orchestrator_tools, repository, active_cycle):
        """Test that pause reason is set."""
        pause_tool = orchestrator_tools[1]
        
        result = pause_tool(
            cycle_id="cycle-001",
            reason="Critical data quality issue",
            pauser="compliance_officer"
        )
        
        assert result['pause_reason'] == "Critical data quality issue"
    
    def test_sets_paused_at_timestamp(self, orchestrator_tools, repository, active_cycle):
        """Test that paused_at timestamp is set."""
        pause_tool = orchestrator_tools[1]
        
        before = datetime.now()
        result = pause_tool(
            cycle_id="cycle-001",
            reason="Blocking issue",
            pauser="compliance_officer"
        )
        after = datetime.now()
        
        paused_at = result['paused_at']
        if isinstance(paused_at, str):
            paused_at = datetime.fromisoformat(paused_at)
        assert before <= paused_at <= after
    
    def test_fails_for_nonexistent_cycle(self, orchestrator_tools, repository):
        """Test that pausing fails for nonexistent cycle."""
        pause_tool = orchestrator_tools[1]
        
        with pytest.raises(ValueError, match="not found"):
            pause_tool(
                cycle_id="nonexistent",
                reason="Test",
                pauser="compliance_officer"
            )
    
    def test_fails_for_non_active_cycle(self, orchestrator_tools, repository, paused_cycle):
        """Test that pausing fails for non-active cycle."""
        pause_tool = orchestrator_tools[1]
        
        with pytest.raises(ValueError, match="Only active cycles can be paused"):
            pause_tool(
                cycle_id="cycle-paused",
                reason="Test",
                pauser="compliance_officer"
            )
    
    def test_creates_audit_entry(self, orchestrator_tools, repository, active_cycle):
        """Test that pausing creates an audit entry."""
        pause_tool = orchestrator_tools[1]
        
        pause_tool(
            cycle_id="cycle-001",
            reason="Blocking issue",
            pauser="compliance_officer"
        )
        
        audit_entries = repository.get_audit_entries()
        pause_entries = [e for e in audit_entries if e.action == "pause_cycle"]
        assert len(pause_entries) == 1


class TestResumeCycle:
    """Tests for resume_cycle tool - Requirements 12.2."""
    
    def test_resumes_paused_cycle(self, orchestrator_tools, repository, paused_cycle):
        """Test that paused cycle can be resumed."""
        resume_tool = orchestrator_tools[2]  # resume_cycle
        
        result = resume_tool(
            cycle_id="cycle-paused",
            resumer="compliance_officer"
        )
        
        assert result['status'] == 'active'
    
    def test_clears_pause_fields(self, orchestrator_tools, repository, paused_cycle):
        """Test that pause fields are cleared on resume."""
        resume_tool = orchestrator_tools[2]
        
        result = resume_tool(
            cycle_id="cycle-paused",
            resumer="compliance_officer"
        )
        
        assert result['paused_at'] is None
        assert result['pause_reason'] is None
    
    def test_fails_for_non_paused_cycle(self, orchestrator_tools, repository, active_cycle):
        """Test that resuming fails for non-paused cycle."""
        resume_tool = orchestrator_tools[2]
        
        with pytest.raises(ValueError, match="Only paused cycles can be resumed"):
            resume_tool(
                cycle_id="cycle-001",
                resumer="compliance_officer"
            )
    
    def test_fails_with_blocking_critical_issues(self, orchestrator_tools, repository, paused_cycle):
        """Test that resuming fails when critical issues exist."""
        # Create a critical issue impacting the report
        issue = Issue(
            id="issue-critical",
            title="Critical Issue",
            description="Critical blocking issue",
            source="dq_rule",
            severity="critical",
            status="open",
            assignee="data_steward",
            impacted_reports=["report-001"],
            created_at=datetime.now(),
            escalation_level=0
        )
        repository.create_issue(issue)
        
        resume_tool = orchestrator_tools[2]
        
        with pytest.raises(ValueError, match="critical issue"):
            resume_tool(
                cycle_id="cycle-paused",
                resumer="compliance_officer"
            )


class TestCreateHumanTask:
    """Tests for create_human_task tool - Requirements 12.2, 12.4."""
    
    def test_creates_task_with_pending_status(self, orchestrator_tools, repository, active_cycle):
        """Test that task is created with pending status."""
        create_task_tool = orchestrator_tools[4]  # create_human_task
        
        result = create_task_tool(
            cycle_id="cycle-001",
            task_type="catalog_review",
            title="Review Catalog",
            description="Review and approve the report catalog",
            assigned_to="compliance_officer",
            assigned_role="compliance_officer",
            due_date="2025-12-31"
        )
        
        assert result['status'] == 'pending'
    
    def test_validates_task_type(self, orchestrator_tools, repository, active_cycle):
        """Test that invalid task type raises an error."""
        create_task_tool = orchestrator_tools[4]
        
        with pytest.raises(ValueError, match="Invalid task_type"):
            create_task_tool(
                cycle_id="cycle-001",
                task_type="invalid_type",
                title="Test Task",
                description="Test description",
                assigned_to="user",
                assigned_role="role",
                due_date="2025-12-31"
            )
    
    def test_creates_audit_entry(self, orchestrator_tools, repository, active_cycle):
        """Test that creating task creates an audit entry."""
        create_task_tool = orchestrator_tools[4]
        
        create_task_tool(
            cycle_id="cycle-001",
            task_type="catalog_review",
            title="Review Catalog",
            description="Review and approve the report catalog",
            assigned_to="compliance_officer",
            assigned_role="compliance_officer",
            due_date="2025-12-31"
        )
        
        audit_entries = repository.get_audit_entries()
        task_entries = [e for e in audit_entries if e.action == "create_human_task"]
        assert len(task_entries) == 1


class TestCompleteHumanTask:
    """Tests for complete_human_task tool - Requirements 12.5."""
    
    def test_completes_task_with_decision(self, orchestrator_tools, repository, pending_task):
        """Test that task can be completed with decision."""
        complete_tool = orchestrator_tools[5]  # complete_human_task
        
        result = complete_tool(
            task_id="task-001",
            decision="approved",
            rationale="All requirements have been met and verified",
            completed_by="compliance_officer"
        )
        
        assert result['status'] == 'completed'
        assert result['decision']['outcome'] == 'approved'
    
    def test_requires_minimum_rationale_length(self, orchestrator_tools, repository, pending_task):
        """Test that rationale must be at least 20 characters."""
        complete_tool = orchestrator_tools[5]
        
        with pytest.raises(ValueError, match="at least 20 characters"):
            complete_tool(
                task_id="task-001",
                decision="approved",
                rationale="Too short",  # Less than 20 chars
                completed_by="compliance_officer"
            )
    
    def test_validates_decision_outcome(self, orchestrator_tools, repository, pending_task):
        """Test that invalid decision raises an error."""
        complete_tool = orchestrator_tools[5]
        
        with pytest.raises(ValueError, match="Invalid decision"):
            complete_tool(
                task_id="task-001",
                decision="invalid_decision",
                rationale="This is a valid rationale with enough characters",
                completed_by="compliance_officer"
            )
    
    def test_sets_completed_at_timestamp(self, orchestrator_tools, repository, pending_task):
        """Test that completed_at timestamp is set."""
        complete_tool = orchestrator_tools[5]
        
        before = datetime.now()
        result = complete_tool(
            task_id="task-001",
            decision="approved",
            rationale="All requirements have been met and verified",
            completed_by="compliance_officer"
        )
        after = datetime.now()
        
        completed_at = result['completed_at']
        if isinstance(completed_at, str):
            completed_at = datetime.fromisoformat(completed_at)
        assert before <= completed_at <= after
    
    def test_creates_audit_entry(self, orchestrator_tools, repository, pending_task):
        """Test that completing task creates an audit entry."""
        complete_tool = orchestrator_tools[5]
        
        complete_tool(
            task_id="task-001",
            decision="approved",
            rationale="All requirements have been met and verified",
            completed_by="compliance_officer"
        )
        
        audit_entries = repository.get_audit_entries()
        complete_entries = [e for e in audit_entries if e.action == "complete_human_task"]
        assert len(complete_entries) == 1
        assert complete_entries[0].actor == "compliance_officer"


class TestEscalateTask:
    """Tests for escalate_task tool - Requirements 12.5."""
    
    def test_increments_escalation_level(self, orchestrator_tools, repository, pending_task):
        """Test that escalation increments the level."""
        escalate_tool = orchestrator_tools[6]  # escalate_task
        
        result = escalate_tool(
            task_id="task-001",
            reason="Task overdue by 3 days",
            escalator="manager"
        )
        
        assert result['escalation_level'] == 1
    
    def test_sets_escalated_status(self, orchestrator_tools, repository, pending_task):
        """Test that status is set to escalated."""
        escalate_tool = orchestrator_tools[6]
        
        result = escalate_tool(
            task_id="task-001",
            reason="Task overdue",
            escalator="manager"
        )
        
        assert result['status'] == 'escalated'
    
    def test_creates_notification_audit_entry(self, orchestrator_tools, repository, pending_task):
        """Test that escalation creates notification audit entry."""
        escalate_tool = orchestrator_tools[6]
        
        escalate_tool(
            task_id="task-001",
            reason="Task overdue",
            escalator="manager"
        )
        
        audit_entries = repository.get_audit_entries()
        notification_entries = [e for e in audit_entries if e.action == "notify_escalation"]
        assert len(notification_entries) == 1


class TestTriggerAgent:
    """Tests for trigger_agent tool - Requirements 12.3."""
    
    def test_triggers_agent_successfully(self, orchestrator_tools, repository, active_cycle):
        """Test that agent can be triggered."""
        trigger_tool = orchestrator_tools[3]  # trigger_agent
        
        result = trigger_tool(
            cycle_id="cycle-001",
            agent_type="regulatory_intelligence"
        )
        
        assert result['triggered'] is True
        assert result['agent_type'] == "regulatory_intelligence"
    
    def test_validates_agent_type(self, orchestrator_tools, repository, active_cycle):
        """Test that invalid agent type raises an error."""
        trigger_tool = orchestrator_tools[3]
        
        with pytest.raises(ValueError, match="Invalid agent_type"):
            trigger_tool(
                cycle_id="cycle-001",
                agent_type="invalid_agent"
            )
    
    def test_fails_for_non_active_cycle(self, orchestrator_tools, repository, paused_cycle):
        """Test that triggering fails for non-active cycle."""
        trigger_tool = orchestrator_tools[3]
        
        with pytest.raises(ValueError, match="Cannot trigger agent"):
            trigger_tool(
                cycle_id="cycle-paused",
                agent_type="regulatory_intelligence"
            )
    
    def test_fails_with_blocking_critical_issues(self, orchestrator_tools, repository, active_cycle):
        """Test that triggering fails when critical issues exist."""
        # Create a critical issue impacting the report
        issue = Issue(
            id="issue-critical",
            title="Critical Issue",
            description="Critical blocking issue",
            source="dq_rule",
            severity="critical",
            status="open",
            assignee="data_steward",
            impacted_reports=["report-001"],
            created_at=datetime.now(),
            escalation_level=0
        )
        repository.create_issue(issue)
        
        trigger_tool = orchestrator_tools[3]
        
        with pytest.raises(ValueError, match="critical issue"):
            trigger_tool(
                cycle_id="cycle-001",
                agent_type="regulatory_intelligence"
            )
    
    def test_enforces_phase_dependencies(self, orchestrator_tools, repository, sample_report):
        """Test that phase dependencies are enforced - Requirements 12.3."""
        start_tool = orchestrator_tools[0]
        trigger_tool = orchestrator_tools[3]
        
        # Start a new cycle
        cycle_result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        cycle_id = cycle_result['id']
        
        # Try to trigger data_quality_rule agent (validation phase)
        # without completing data_gathering phase checkpoint
        with pytest.raises(ValueError, match="prerequisite phase"):
            trigger_tool(
                cycle_id=cycle_id,
                agent_type="data_quality_rule"
            )


class TestGetCycleStatus:
    """Tests for get_cycle_status tool - Requirements 12.1."""
    
    def test_returns_cycle_details(self, orchestrator_tools, repository, active_cycle):
        """Test that cycle status returns complete details."""
        get_status_tool = orchestrator_tools[7]  # get_cycle_status
        
        result = get_status_tool(cycle_id="cycle-001")
        
        assert 'cycle' in result
        assert result['cycle']['id'] == "cycle-001"
        assert result['cycle']['status'] == 'active'
    
    def test_calculates_progress_percentage(self, orchestrator_tools, repository, active_cycle):
        """Test that progress percentage is calculated."""
        get_status_tool = orchestrator_tools[7]
        
        result = get_status_tool(cycle_id="cycle-001")
        
        assert 'progress_percentage' in result
        assert isinstance(result['progress_percentage'], (int, float))
        assert 0 <= result['progress_percentage'] <= 100
    
    def test_includes_pending_tasks(self, orchestrator_tools, repository, pending_task):
        """Test that pending tasks are included."""
        get_status_tool = orchestrator_tools[7]
        
        result = get_status_tool(cycle_id="cycle-001")
        
        assert 'pending_tasks' in result
        assert len(result['pending_tasks']) >= 1
    
    def test_includes_blocking_issues(self, orchestrator_tools, repository, active_cycle):
        """Test that blocking issues are included."""
        # Create a critical issue
        issue = Issue(
            id="issue-blocking",
            title="Blocking Issue",
            description="Critical blocking issue",
            source="dq_rule",
            severity="critical",
            status="open",
            assignee="data_steward",
            impacted_reports=["report-001"],
            created_at=datetime.now(),
            escalation_level=0
        )
        repository.create_issue(issue)
        
        get_status_tool = orchestrator_tools[7]
        
        result = get_status_tool(cycle_id="cycle-001")
        
        assert 'blocking_issues' in result
        assert len(result['blocking_issues']) == 1
        assert result['can_proceed'] is False
    
    def test_fails_for_nonexistent_cycle(self, orchestrator_tools, repository):
        """Test that status fails for nonexistent cycle."""
        get_status_tool = orchestrator_tools[7]
        
        with pytest.raises(ValueError, match="not found"):
            get_status_tool(cycle_id="nonexistent")


class TestAdvancePhase:
    """Tests for advance_phase tool - Requirements 12.1, 12.3."""
    
    def test_advances_to_next_phase(self, orchestrator_tools, repository, sample_report):
        """Test that phase can be advanced when checkpoint is complete."""
        start_tool = orchestrator_tools[0]
        advance_tool = orchestrator_tools[8]  # advance_phase
        
        # Start a new cycle
        cycle_result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        cycle_id = cycle_result['id']
        
        # Manually complete the data_gathering checkpoint
        cycle = repository.get_cycle_instance(cycle_id)
        for cp in cycle.checkpoints:
            if cp.phase == 'data_gathering':
                cp.status = 'completed'
                cp.completed_approvals = cp.required_approvals.copy()
        repository.update_cycle_instance(cycle)
        
        # Advance phase
        result = advance_tool(
            cycle_id=cycle_id,
            advancer="compliance_officer"
        )
        
        assert result['current_phase'] == 'validation'
    
    def test_fails_if_checkpoint_not_completed(self, orchestrator_tools, repository, active_cycle):
        """Test that advance fails if checkpoint is not completed."""
        advance_tool = orchestrator_tools[8]
        
        with pytest.raises(ValueError, match="not completed"):
            advance_tool(
                cycle_id="cycle-001",
                advancer="compliance_officer"
            )
    
    def test_completes_cycle_after_final_phase(self, orchestrator_tools, repository, sample_report):
        """Test that cycle is completed after final phase."""
        start_tool = orchestrator_tools[0]
        advance_tool = orchestrator_tools[8]
        
        # Start a new cycle
        cycle_result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        cycle_id = cycle_result['id']
        
        # Complete all checkpoints and advance through all phases
        phases = ['data_gathering', 'validation', 'review', 'approval', 'submission']
        for i, phase in enumerate(phases):
            cycle = repository.get_cycle_instance(cycle_id)
            for cp in cycle.checkpoints:
                if cp.phase == phase:
                    cp.status = 'completed'
                    cp.completed_approvals = cp.required_approvals.copy()
            repository.update_cycle_instance(cycle)
            
            result = advance_tool(
                cycle_id=cycle_id,
                advancer="compliance_officer"
            )
            
            if i < len(phases) - 1:
                assert result['current_phase'] == phases[i + 1]
            else:
                assert result['status'] == 'completed'
    
    def test_fails_for_non_active_cycle(self, orchestrator_tools, repository, paused_cycle):
        """Test that advance fails for non-active cycle."""
        advance_tool = orchestrator_tools[8]
        
        with pytest.raises(ValueError, match="Cannot advance cycle"):
            advance_tool(
                cycle_id="cycle-paused",
                advancer="compliance_officer"
            )
    
    def test_creates_audit_entry(self, orchestrator_tools, repository, sample_report):
        """Test that advancing creates an audit entry."""
        start_tool = orchestrator_tools[0]
        advance_tool = orchestrator_tools[8]
        
        # Start a new cycle
        cycle_result = start_tool(
            report_id="report-001",
            period_end="2025-12-31",
            initiator="compliance_officer"
        )
        cycle_id = cycle_result['id']
        
        # Complete the data_gathering checkpoint
        cycle = repository.get_cycle_instance(cycle_id)
        for cp in cycle.checkpoints:
            if cp.phase == 'data_gathering':
                cp.status = 'completed'
                cp.completed_approvals = cp.required_approvals.copy()
        repository.update_cycle_instance(cycle)
        
        # Advance phase
        advance_tool(
            cycle_id=cycle_id,
            advancer="compliance_officer"
        )
        
        audit_entries = repository.get_audit_entries()
        advance_entries = [e for e in audit_entries if e.action == "advance_phase"]
        assert len(advance_entries) == 1
