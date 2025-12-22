"""
Unit tests for the Issue Management Agent.

Tests issue creation, escalation, and resolution workflows.
Requirements: 9.1, 9.4, 9.5
"""
import pytest
from datetime import datetime

from repository.in_memory import InMemoryGovernanceRepository
from tools.issue_tools import create_issue_tools
from models.issues import Issue, Resolution


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def issue_tools(repository):
    """Create issue tools with the test repository."""
    return create_issue_tools(repository)


@pytest.fixture
def sample_issue(repository):
    """Create a sample issue in the repository."""
    issue = Issue(
        id="issue-001",
        title="Data Quality Failure",
        description="Completeness check failed for Total Assets",
        source="dq_rule",
        severity="high",
        status="open",
        assignee="data_steward",
        impacted_reports=["report-001"],
        impacted_cdes=["cde-001"],
        created_at=datetime.now(),
        escalation_level=0
    )
    repository.create_issue(issue)
    return issue


@pytest.fixture
def critical_issue(repository):
    """Create a critical issue in the repository."""
    issue = Issue(
        id="issue-critical",
        title="Critical Regulatory Data Missing",
        description="Required regulatory data is missing from submission",
        source="reconciliation",
        severity="critical",
        status="open",
        assignee="compliance_officer",
        impacted_reports=["report-001", "report-002"],
        impacted_cdes=["cde-001", "cde-002"],
        created_at=datetime.now(),
        escalation_level=0
    )
    repository.create_issue(issue)
    return issue


class TestCreateIssue:
    """Tests for create_issue tool - Requirements 9.1."""
    
    def test_creates_issue_with_required_fields(self, issue_tools, repository):
        """Test that issue is created with all required fields."""
        create_tool = issue_tools[0]  # create_issue
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        
        assert result['title'] == "Test Issue"
        assert result['description'] == "Test description"
        assert result['source'] == "manual"
        assert result['severity'] == "medium"
        assert result['assignee'] == "test_user"
    
    def test_auto_populates_status_as_open(self, issue_tools, repository):
        """Test that status is auto-populated as 'open'."""
        create_tool = issue_tools[0]
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        
        assert result['status'] == "open"
    
    def test_auto_populates_created_at(self, issue_tools, repository):
        """Test that created_at is auto-populated."""
        create_tool = issue_tools[0]
        
        before = datetime.now()
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        after = datetime.now()
        
        # Handle both datetime object and string formats
        created_at = result['created_at']
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        assert before <= created_at <= after
    
    def test_auto_populates_escalation_level_zero(self, issue_tools, repository):
        """Test that escalation_level is auto-populated as 0."""
        create_tool = issue_tools[0]
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        
        assert result['escalation_level'] == 0
    
    def test_auto_generates_id(self, issue_tools, repository):
        """Test that ID is auto-generated."""
        create_tool = issue_tools[0]
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        
        assert 'id' in result
        assert result['id'] is not None
        assert len(result['id']) > 0
    
    def test_accepts_impacted_reports(self, issue_tools, repository):
        """Test that impacted_reports is accepted."""
        create_tool = issue_tools[0]
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user",
            impacted_reports=["report-001", "report-002"]
        )
        
        assert result['impacted_reports'] == ["report-001", "report-002"]
    
    def test_accepts_impacted_cdes(self, issue_tools, repository):
        """Test that impacted_cdes is accepted."""
        create_tool = issue_tools[0]
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user",
            impacted_cdes=["cde-001", "cde-002"]
        )
        
        assert result['impacted_cdes'] == ["cde-001", "cde-002"]
    
    def test_validates_severity(self, issue_tools, repository):
        """Test that invalid severity raises an error."""
        create_tool = issue_tools[0]
        
        with pytest.raises(ValueError, match="Invalid severity"):
            create_tool(
                title="Test Issue",
                description="Test description",
                source="manual",
                severity="invalid_severity",
                assignee="test_user"
            )
    
    def test_accepts_valid_severities(self, issue_tools, repository):
        """Test that all valid severities are accepted."""
        create_tool = issue_tools[0]
        
        for severity in ['critical', 'high', 'medium', 'low']:
            result = create_tool(
                title=f"Test Issue {severity}",
                description="Test description",
                source="manual",
                severity=severity,
                assignee="test_user"
            )
            assert result['severity'] == severity
    
    def test_persists_issue_to_repository(self, issue_tools, repository):
        """Test that issue is persisted to repository."""
        create_tool = issue_tools[0]
        
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        
        stored_issue = repository.get_issue(result['id'])
        assert stored_issue is not None
        assert stored_issue.title == "Test Issue"
    
    def test_creates_audit_entry(self, issue_tools, repository):
        """Test that issue creation creates an audit entry."""
        create_tool = issue_tools[0]
        
        create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user"
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "create_issue"
        assert audit_entries[0].actor == "IssueManagementAgent"
    
    def test_accepts_due_date(self, issue_tools, repository):
        """Test that due_date is accepted."""
        create_tool = issue_tools[0]
        
        due_date = "2025-12-31T23:59:59"
        result = create_tool(
            title="Test Issue",
            description="Test description",
            source="manual",
            severity="medium",
            assignee="test_user",
            due_date=due_date
        )
        
        assert result['due_date'] is not None


class TestEscalateIssue:
    """Tests for escalate_issue tool - Requirements 9.4."""
    
    def test_increments_escalation_level(self, issue_tools, repository, sample_issue):
        """Test that escalation increments the escalation level."""
        escalate_tool = issue_tools[4]  # escalate_issue
        
        result = escalate_tool(
            issue_id="issue-001",
            escalator="manager",
            reason="Issue not resolved within SLA"
        )
        
        assert result['escalation_level'] == 1
    
    def test_multiple_escalations_increment_level(self, issue_tools, repository, sample_issue):
        """Test that multiple escalations increment the level each time."""
        escalate_tool = issue_tools[4]
        
        # First escalation
        result1 = escalate_tool(
            issue_id="issue-001",
            escalator="manager",
            reason="First escalation"
        )
        assert result1['escalation_level'] == 1
        
        # Second escalation
        result2 = escalate_tool(
            issue_id="issue-001",
            escalator="director",
            reason="Second escalation"
        )
        assert result2['escalation_level'] == 2
    
    def test_sets_escalated_at_timestamp(self, issue_tools, repository, sample_issue):
        """Test that escalated_at timestamp is set."""
        escalate_tool = issue_tools[4]
        
        before = datetime.now()
        result = escalate_tool(
            issue_id="issue-001",
            escalator="manager",
            reason="Issue not resolved within SLA"
        )
        after = datetime.now()
        
        # Handle both datetime object and string formats
        escalated_at = result['escalated_at']
        if isinstance(escalated_at, str):
            escalated_at = datetime.fromisoformat(escalated_at)
        assert before <= escalated_at <= after
    
    def test_creates_audit_entry_for_escalation(self, issue_tools, repository, sample_issue):
        """Test that escalation creates an audit entry."""
        escalate_tool = issue_tools[4]
        
        escalate_tool(
            issue_id="issue-001",
            escalator="manager",
            reason="Issue not resolved within SLA"
        )
        
        audit_entries = repository.get_audit_entries()
        escalation_entries = [e for e in audit_entries if e.action == "escalate_issue"]
        assert len(escalation_entries) == 1
        assert escalation_entries[0].actor == "manager"
        assert escalation_entries[0].rationale == "Issue not resolved within SLA"
    
    def test_notifies_senior_management_for_critical_issues(self, issue_tools, repository, critical_issue):
        """Test that senior management is notified for critical issue escalation."""
        escalate_tool = issue_tools[4]
        
        escalate_tool(
            issue_id="issue-critical",
            escalator="manager",
            reason="Critical issue requires immediate attention"
        )
        
        audit_entries = repository.get_audit_entries()
        notification_entries = [e for e in audit_entries if e.action == "notify_senior_management"]
        assert len(notification_entries) == 1
        assert notification_entries[0].new_state['notification_type'] == "critical_issue_escalation"
    
    def test_no_notification_for_non_critical_issues(self, issue_tools, repository, sample_issue):
        """Test that no notification is sent for non-critical issues."""
        escalate_tool = issue_tools[4]
        
        escalate_tool(
            issue_id="issue-001",
            escalator="manager",
            reason="Issue not resolved within SLA"
        )
        
        audit_entries = repository.get_audit_entries()
        notification_entries = [e for e in audit_entries if e.action == "notify_senior_management"]
        assert len(notification_entries) == 0
    
    def test_fails_for_nonexistent_issue(self, issue_tools, repository):
        """Test that escalation fails for nonexistent issue."""
        escalate_tool = issue_tools[4]
        
        with pytest.raises(ValueError, match="not found"):
            escalate_tool(
                issue_id="nonexistent",
                escalator="manager",
                reason="This issue does not exist"
            )
    
    def test_persists_escalation_to_repository(self, issue_tools, repository, sample_issue):
        """Test that escalation is persisted to repository."""
        escalate_tool = issue_tools[4]
        
        escalate_tool(
            issue_id="issue-001",
            escalator="manager",
            reason="Issue not resolved within SLA"
        )
        
        stored_issue = repository.get_issue("issue-001")
        assert stored_issue.escalation_level == 1
        assert stored_issue.escalated_at is not None


class TestResolveIssue:
    """Tests for resolve_issue tool - Requirements 9.5."""
    
    def test_resolves_issue_with_different_verifier(self, issue_tools, repository, sample_issue):
        """Test that issue can be resolved when verifier differs from implementer."""
        resolve_tool = issue_tools[5]  # resolve_issue
        
        result = resolve_tool(
            issue_id="issue-001",
            resolution_type="data_correction",
            resolution_description="Fixed the data quality issue by correcting source data",
            implemented_by="developer",
            verified_by="qa_engineer"
        )
        
        assert result['status'] == "resolved"
        assert result['resolution'] is not None
    
    def test_enforces_four_eyes_principle(self, issue_tools, repository, sample_issue):
        """Test that four-eyes principle is enforced (verifier != implementer)."""
        resolve_tool = issue_tools[5]
        
        with pytest.raises(ValueError, match="Four-eyes principle"):
            resolve_tool(
                issue_id="issue-001",
                resolution_type="data_correction",
                resolution_description="Fixed the data quality issue",
                implemented_by="developer",
                verified_by="developer"  # Same as implementer - should fail
            )
    
    def test_resolution_includes_implemented_by(self, issue_tools, repository, sample_issue):
        """Test that resolution includes implemented_by."""
        resolve_tool = issue_tools[5]
        
        result = resolve_tool(
            issue_id="issue-001",
            resolution_type="data_correction",
            resolution_description="Fixed the data quality issue",
            implemented_by="developer",
            verified_by="qa_engineer"
        )
        
        assert result['resolution']['implemented_by'] == "developer"
    
    def test_resolution_includes_verified_by(self, issue_tools, repository, sample_issue):
        """Test that resolution includes verified_by."""
        resolve_tool = issue_tools[5]
        
        result = resolve_tool(
            issue_id="issue-001",
            resolution_type="data_correction",
            resolution_description="Fixed the data quality issue",
            implemented_by="developer",
            verified_by="qa_engineer"
        )
        
        assert result['resolution']['verified_by'] == "qa_engineer"
    
    def test_resolution_includes_timestamps(self, issue_tools, repository, sample_issue):
        """Test that resolution includes implementation and verification timestamps."""
        resolve_tool = issue_tools[5]
        
        before = datetime.now()
        result = resolve_tool(
            issue_id="issue-001",
            resolution_type="data_correction",
            resolution_description="Fixed the data quality issue",
            implemented_by="developer",
            verified_by="qa_engineer"
        )
        after = datetime.now()
        
        # Handle both datetime object and string formats
        implemented_at = result['resolution']['implemented_at']
        if isinstance(implemented_at, str):
            implemented_at = datetime.fromisoformat(implemented_at)
        
        verified_at = result['resolution']['verified_at']
        if isinstance(verified_at, str):
            verified_at = datetime.fromisoformat(verified_at)
        
        assert before <= implemented_at <= after
        assert before <= verified_at <= after
    
    def test_validates_resolution_type(self, issue_tools, repository, sample_issue):
        """Test that invalid resolution type raises an error."""
        resolve_tool = issue_tools[5]
        
        with pytest.raises(ValueError, match="Invalid resolution_type"):
            resolve_tool(
                issue_id="issue-001",
                resolution_type="invalid_type",
                resolution_description="Fixed the issue",
                implemented_by="developer",
                verified_by="qa_engineer"
            )
    
    def test_accepts_valid_resolution_types(self, issue_tools, repository):
        """Test that all valid resolution types are accepted."""
        resolve_tool = issue_tools[5]
        
        valid_types = ['data_correction', 'process_change', 'system_fix', 'exception_approved']
        
        for i, res_type in enumerate(valid_types):
            # Create a new issue for each test
            issue = Issue(
                id=f"issue-{i}",
                title=f"Test Issue {i}",
                description="Test description",
                source="manual",
                severity="medium",
                status="open",
                assignee="test_user",
                created_at=datetime.now(),
                escalation_level=0
            )
            repository.create_issue(issue)
            
            result = resolve_tool(
                issue_id=f"issue-{i}",
                resolution_type=res_type,
                resolution_description="Fixed the issue",
                implemented_by="developer",
                verified_by="qa_engineer"
            )
            
            assert result['resolution']['type'] == res_type
    
    def test_fails_for_nonexistent_issue(self, issue_tools, repository):
        """Test that resolution fails for nonexistent issue."""
        resolve_tool = issue_tools[5]
        
        with pytest.raises(ValueError, match="not found"):
            resolve_tool(
                issue_id="nonexistent",
                resolution_type="data_correction",
                resolution_description="Fixed the issue",
                implemented_by="developer",
                verified_by="qa_engineer"
            )
    
    def test_creates_audit_entry_for_resolution(self, issue_tools, repository, sample_issue):
        """Test that resolution creates an audit entry."""
        resolve_tool = issue_tools[5]
        
        resolve_tool(
            issue_id="issue-001",
            resolution_type="data_correction",
            resolution_description="Fixed the data quality issue",
            implemented_by="developer",
            verified_by="qa_engineer"
        )
        
        audit_entries = repository.get_audit_entries()
        resolution_entries = [e for e in audit_entries if e.action == "resolve_issue"]
        assert len(resolution_entries) == 1
        assert resolution_entries[0].actor == "qa_engineer"
    
    def test_persists_resolution_to_repository(self, issue_tools, repository, sample_issue):
        """Test that resolution is persisted to repository."""
        resolve_tool = issue_tools[5]
        
        resolve_tool(
            issue_id="issue-001",
            resolution_type="data_correction",
            resolution_description="Fixed the data quality issue",
            implemented_by="developer",
            verified_by="qa_engineer"
        )
        
        stored_issue = repository.get_issue("issue-001")
        assert stored_issue.status == "resolved"
        assert stored_issue.resolution is not None
        assert stored_issue.resolution.implemented_by == "developer"
        assert stored_issue.resolution.verified_by == "qa_engineer"
