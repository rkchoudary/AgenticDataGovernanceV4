"""
Unit tests for the Controls Management Service.

Tests the controls management functions per Requirements 11.1, 11.2, 11.3, 11.4.
"""

import pytest
from datetime import datetime, timedelta
from uuid import uuid4

from models.controls import (
    Control,
    ControlMatrix,
    ControlEvidence,
    ControlType,
    ControlCategory,
)
from models.issues import Issue
from repository.in_memory import InMemoryGovernanceRepository
from services.controls_management import (
    ControlsManagementService,
    categorize_control,
    activate_control,
    log_evidence,
    track_compensating_control,
    schedule_effectiveness_review,
    VALID_CONTROL_TYPES,
    VALID_CONTROL_CATEGORIES,
)


@pytest.fixture
def repository():
    """Create a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def service(repository):
    """Create a Controls Management Service instance."""
    return ControlsManagementService(repository)


@pytest.fixture
def sample_control():
    """Create a sample control for testing."""
    return Control(
        id=str(uuid4()),
        name="Test Control",
        description="A test control for unit testing",
        type="process",
        category="preventive",
        owner="test_owner",
        frequency="monthly",
        linked_cdes=["cde-1", "cde-2"],
        linked_processes=["process-1"],
        automation_status="manual",
        status="inactive",
        evidence=[]
    )


@pytest.fixture
def sample_matrix(repository, sample_control):
    """Create a sample control matrix with a control."""
    matrix = ControlMatrix(
        id=str(uuid4()),
        report_id="report-1",
        controls=[sample_control],
        version=1,
        last_reviewed=datetime.now(),
        reviewed_by="test_user"
    )
    repository.set_control_matrix("report-1", matrix)
    return matrix


@pytest.fixture
def sample_issue(repository):
    """Create a sample issue for compensating control tests."""
    issue = Issue(
        id=str(uuid4()),
        title="Test Issue",
        description="A test issue",
        source="test",
        impacted_reports=["report-1"],
        impacted_cdes=["cde-1"],
        severity="high",
        status="open",
        assignee="test_assignee",
        created_at=datetime.now()
    )
    repository.create_issue(issue)
    return issue


class TestCategorizeControl:
    """Tests for the categorize_control function."""
    
    def test_categorize_control_valid_types(self, service, sample_control):
        """Test categorizing a control with valid types."""
        for control_type in VALID_CONTROL_TYPES:
            result = service.categorize_control(
                sample_control, 
                control_type, 
                "preventive"
            )
            assert result.type == control_type
            assert result.category == "preventive"
    
    def test_categorize_control_valid_categories(self, service, sample_control):
        """Test categorizing a control with valid categories."""
        for category in VALID_CONTROL_CATEGORIES:
            result = service.categorize_control(
                sample_control, 
                "process", 
                category
            )
            assert result.type == "process"
            assert result.category == category
    
    def test_categorize_control_invalid_type(self, service, sample_control):
        """Test that invalid control types raise ValueError."""
        with pytest.raises(ValueError) as exc_info:
            service.categorize_control(
                sample_control, 
                "invalid_type",  # type: ignore
                "preventive"
            )
        assert "Invalid control type" in str(exc_info.value)
    
    def test_categorize_control_invalid_category(self, service, sample_control):
        """Test that invalid control categories raise ValueError."""
        with pytest.raises(ValueError) as exc_info:
            service.categorize_control(
                sample_control, 
                "process", 
                "invalid_category"  # type: ignore
            )
        assert "Invalid control category" in str(exc_info.value)
    
    def test_categorize_control_creates_audit_entry(self, service, repository, sample_control):
        """Test that categorizing a control creates an audit entry."""
        service.categorize_control(sample_control, "access", "detective")
        
        entries = repository.get_audit_entries(
            entity_type="Control",
            entity_id=sample_control.id
        )
        assert len(entries) == 1
        assert entries[0].action == "categorize_control"


class TestActivateControl:
    """Tests for the activate_control function."""
    
    def test_activate_control_success(self, service, sample_matrix, sample_control):
        """Test activating a control successfully."""
        result = service.activate_control(sample_control.id, "report-1")
        
        assert result.status == "active"
        assert len(result.evidence) == 1
        assert result.evidence[0].outcome == "pass"
        assert "activated" in result.evidence[0].details.lower()
    
    def test_activate_control_matrix_not_found(self, service):
        """Test that activating a control with no matrix raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            service.activate_control("control-1", "nonexistent-report")
        assert "Control matrix not found" in str(exc_info.value)
    
    def test_activate_control_not_found(self, service, sample_matrix):
        """Test that activating a nonexistent control raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            service.activate_control("nonexistent-control", "report-1")
        assert "Control not found" in str(exc_info.value)
    
    def test_activate_control_creates_audit_entry(self, service, repository, sample_matrix, sample_control):
        """Test that activating a control creates an audit entry."""
        service.activate_control(sample_control.id, "report-1")
        
        entries = repository.get_audit_entries(
            entity_type="Control",
            action="activate_control"
        )
        assert len(entries) == 1


class TestLogEvidence:
    """Tests for the log_evidence function."""
    
    def test_log_evidence_success(self, service, sample_matrix, sample_control):
        """Test logging evidence successfully."""
        execution_date = datetime.now()
        result = service.log_evidence(
            control_id=sample_control.id,
            report_id="report-1",
            execution_date=execution_date,
            outcome="pass",
            details="Control executed successfully",
            executed_by="test_user"
        )
        
        assert result.control_id == sample_control.id
        assert result.execution_date == execution_date
        assert result.outcome == "pass"
        assert result.details == "Control executed successfully"
        assert result.executed_by == "test_user"
    
    def test_log_evidence_captures_all_fields(self, service, sample_matrix, sample_control):
        """Test that log_evidence captures all required fields per Requirement 11.4."""
        execution_date = datetime.now()
        result = service.log_evidence(
            control_id=sample_control.id,
            report_id="report-1",
            execution_date=execution_date,
            outcome="fail",
            details="Control failed validation",
            executed_by="auditor"
        )
        
        # Verify all fields per Requirement 11.4
        assert result.execution_date is not None
        assert result.outcome in ["pass", "fail", "exception"]
        assert result.details is not None
        assert result.executed_by is not None
    
    def test_log_evidence_matrix_not_found(self, service):
        """Test that logging evidence with no matrix raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            service.log_evidence(
                control_id="control-1",
                report_id="nonexistent-report",
                execution_date=datetime.now(),
                outcome="pass",
                details="Test",
                executed_by="test"
            )
        assert "Control matrix not found" in str(exc_info.value)


class TestTrackCompensatingControl:
    """Tests for the track_compensating_control function."""
    
    def test_track_compensating_control_success(self, service, repository, sample_issue):
        """Test creating a compensating control successfully."""
        expiration_date = datetime.now() + timedelta(days=30)
        
        result = service.track_compensating_control(
            report_id="report-1",
            linked_issue_id=sample_issue.id,
            expiration_date=expiration_date,
            name="Compensating Control",
            description="A compensating control for the issue",
            control_type="process",
            category="detective",
            owner="risk_manager"
        )
        
        assert result.status == "compensating"
        assert result.linked_issue_id == sample_issue.id
        assert result.expiration_date == expiration_date
        assert result.name == "Compensating Control"
    
    def test_track_compensating_control_requires_issue_id(self, service, repository):
        """Test that compensating controls require a linked issue ID per Requirement 11.3."""
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id="report-1",
                linked_issue_id="",  # Empty issue ID
                expiration_date=datetime.now() + timedelta(days=30),
                name="Test",
                description="Test",
                control_type="process",
                category="preventive",
                owner="test"
            )
        assert "linked_issue_id" in str(exc_info.value)
    
    def test_track_compensating_control_requires_expiration_date(self, service, repository, sample_issue):
        """Test that compensating controls require an expiration date per Requirement 11.3."""
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id="report-1",
                linked_issue_id=sample_issue.id,
                expiration_date=None,  # type: ignore
                name="Test",
                description="Test",
                control_type="process",
                category="preventive",
                owner="test"
            )
        assert "expiration_date" in str(exc_info.value)
    
    def test_track_compensating_control_validates_type(self, service, repository, sample_issue):
        """Test that compensating controls validate control type per Requirement 11.2."""
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id="report-1",
                linked_issue_id=sample_issue.id,
                expiration_date=datetime.now() + timedelta(days=30),
                name="Test",
                description="Test",
                control_type="invalid_type",  # type: ignore
                category="preventive",
                owner="test"
            )
        assert "Invalid control type" in str(exc_info.value)
    
    def test_track_compensating_control_issue_not_found(self, service, repository):
        """Test that compensating controls require an existing issue."""
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id="report-1",
                linked_issue_id="nonexistent-issue",
                expiration_date=datetime.now() + timedelta(days=30),
                name="Test",
                description="Test",
                control_type="process",
                category="preventive",
                owner="test"
            )
        assert "Issue not found" in str(exc_info.value)
    
    def test_track_compensating_control_logs_evidence(self, service, repository, sample_issue):
        """Test that creating a compensating control logs evidence."""
        result = service.track_compensating_control(
            report_id="report-1",
            linked_issue_id=sample_issue.id,
            expiration_date=datetime.now() + timedelta(days=30),
            name="Test",
            description="Test",
            control_type="process",
            category="preventive",
            owner="test"
        )
        
        assert len(result.evidence) == 1
        assert "Compensating control created" in result.evidence[0].details


class TestScheduleEffectivenessReview:
    """Tests for the schedule_effectiveness_review function."""
    
    def test_schedule_effectiveness_review_success(self, service, sample_matrix, sample_control):
        """Test scheduling an effectiveness review successfully."""
        review_date = datetime.now() + timedelta(days=30)
        
        result = service.schedule_effectiveness_review(
            control_id=sample_control.id,
            report_id="report-1",
            review_date=review_date,
            reviewer="auditor"
        )
        
        assert "review scheduled" in result.details.lower()
        assert review_date.isoformat() in result.details
    
    def test_schedule_effectiveness_review_with_reviewer(self, service, sample_matrix, sample_control):
        """Test scheduling a review with a specific reviewer."""
        review_date = datetime.now() + timedelta(days=30)
        
        result = service.schedule_effectiveness_review(
            control_id=sample_control.id,
            report_id="report-1",
            review_date=review_date,
            reviewer="senior_auditor"
        )
        
        assert "senior_auditor" in result.details
    
    def test_schedule_effectiveness_review_matrix_not_found(self, service):
        """Test that scheduling a review with no matrix raises ValueError."""
        with pytest.raises(ValueError) as exc_info:
            service.schedule_effectiveness_review(
                control_id="control-1",
                report_id="nonexistent-report",
                review_date=datetime.now() + timedelta(days=30)
            )
        assert "Control matrix not found" in str(exc_info.value)


class TestGetControlsForReview:
    """Tests for the get_controls_for_review function."""
    
    def test_get_controls_for_review_empty_matrix(self, service):
        """Test getting controls for review with no matrix."""
        result = service.get_controls_for_review("nonexistent-report")
        assert result == []
    
    def test_get_controls_for_review_active_only(self, service, repository):
        """Test that only active controls are returned for review."""
        # Create matrix with active and inactive controls
        active_control = Control(
            id="active-1",
            name="Active Control",
            description="An active control",
            type="process",
            category="preventive",
            owner="test",
            frequency="monthly",
            status="active",
            evidence=[]
        )
        inactive_control = Control(
            id="inactive-1",
            name="Inactive Control",
            description="An inactive control",
            type="process",
            category="preventive",
            owner="test",
            frequency="monthly",
            status="inactive",
            evidence=[]
        )
        
        matrix = ControlMatrix(
            id="matrix-1",
            report_id="report-1",
            controls=[active_control, inactive_control],
            version=1,
            last_reviewed=datetime.now(),
            reviewed_by="test"
        )
        repository.set_control_matrix("report-1", matrix)
        
        result = service.get_controls_for_review("report-1")
        
        # Only active control should be returned (and it needs review since never reviewed)
        assert len(result) == 1
        assert result[0].id == "active-1"


class TestGetExpiringCompensatingControls:
    """Tests for the get_expiring_compensating_controls function."""
    
    def test_get_expiring_compensating_controls(self, service, repository, sample_issue):
        """Test getting expiring compensating controls."""
        # Create a compensating control expiring in 15 days
        expiring_control = service.track_compensating_control(
            report_id="report-1",
            linked_issue_id=sample_issue.id,
            expiration_date=datetime.now() + timedelta(days=15),
            name="Expiring Control",
            description="A control expiring soon",
            control_type="process",
            category="preventive",
            owner="test"
        )
        
        # Get controls expiring within 30 days
        result = service.get_expiring_compensating_controls("report-1", within_days=30)
        
        assert len(result) == 1
        assert result[0].id == expiring_control.id
    
    def test_get_expiring_compensating_controls_not_expiring(self, service, repository, sample_issue):
        """Test that controls not expiring soon are not returned."""
        # Create a compensating control expiring in 60 days
        service.track_compensating_control(
            report_id="report-1",
            linked_issue_id=sample_issue.id,
            expiration_date=datetime.now() + timedelta(days=60),
            name="Not Expiring Control",
            description="A control not expiring soon",
            control_type="process",
            category="preventive",
            owner="test"
        )
        
        # Get controls expiring within 30 days
        result = service.get_expiring_compensating_controls("report-1", within_days=30)
        
        assert len(result) == 0


class TestValidateControl:
    """Tests for the validate_control function."""
    
    def test_validate_control_valid(self, service, sample_control):
        """Test validating a valid control."""
        errors = service.validate_control(sample_control)
        assert errors == []
    
    def test_validate_control_invalid_type(self, service):
        """Test validating a control with invalid type.
        
        Note: Since Pydantic validates the type at construction time,
        we test that the validate_control method would catch it if
        the type were somehow invalid (e.g., from deserialization).
        """
        # Create a valid control first
        control = Control(
            id="test",
            name="Test",
            description="Test",
            type="process",
            category="preventive",
            owner="test",
            frequency="monthly",
            status="active",
            evidence=[]
        )
        # Manually set an invalid type to simulate bad data
        object.__setattr__(control, 'type', 'invalid')
        
        errors = service.validate_control(control)
        assert any("Invalid control type" in e for e in errors)
    
    def test_validate_compensating_control_missing_issue(self, service):
        """Test validating a compensating control without linked issue."""
        control = Control(
            id="test",
            name="Test",
            description="Test",
            type="process",
            category="preventive",
            owner="test",
            frequency="monthly",
            status="compensating",
            expiration_date=datetime.now() + timedelta(days=30),
            linked_issue_id=None,
            evidence=[]
        )
        errors = service.validate_control(control)
        assert any("linked_issue_id" in e for e in errors)
    
    def test_validate_compensating_control_missing_expiration(self, service):
        """Test validating a compensating control without expiration date."""
        control = Control(
            id="test",
            name="Test",
            description="Test",
            type="process",
            category="preventive",
            owner="test",
            frequency="monthly",
            status="compensating",
            linked_issue_id="issue-1",
            expiration_date=None,
            evidence=[]
        )
        errors = service.validate_control(control)
        assert any("expiration_date" in e for e in errors)


class TestConvenienceFunctions:
    """Tests for the module-level convenience functions."""
    
    def test_categorize_control_function(self, repository, sample_control):
        """Test the categorize_control convenience function."""
        result = categorize_control(
            repository, 
            sample_control, 
            "access", 
            "detective"
        )
        assert result.type == "access"
        assert result.category == "detective"
    
    def test_activate_control_function(self, repository, sample_matrix, sample_control):
        """Test the activate_control convenience function."""
        result = activate_control(repository, sample_control.id, "report-1")
        assert result.status == "active"
    
    def test_log_evidence_function(self, repository, sample_matrix, sample_control):
        """Test the log_evidence convenience function."""
        result = log_evidence(
            repository,
            sample_control.id,
            "report-1",
            datetime.now(),
            "pass",
            "Test evidence",
            "tester"
        )
        assert result.outcome == "pass"
    
    def test_track_compensating_control_function(self, repository, sample_issue):
        """Test the track_compensating_control convenience function."""
        result = track_compensating_control(
            repository,
            "report-1",
            sample_issue.id,
            datetime.now() + timedelta(days=30),
            "Test Control",
            "Test Description",
            "process",
            "preventive",
            "owner"
        )
        assert result.status == "compensating"
    
    def test_schedule_effectiveness_review_function(self, repository, sample_matrix, sample_control):
        """Test the schedule_effectiveness_review convenience function."""
        result = schedule_effectiveness_review(
            repository,
            sample_control.id,
            "report-1",
            datetime.now() + timedelta(days=30)
        )
        assert "review scheduled" in result.details.lower()
