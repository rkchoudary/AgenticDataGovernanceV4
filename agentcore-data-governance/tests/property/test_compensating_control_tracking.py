"""
**Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**

For any control with status 'compensating', expiration_date must be non-null
and the control must be linked to an open issue that it compensates for.

**Validates: Requirements 6.4**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.controls import (
    Control,
    ControlMatrix,
    ControlType,
    ControlCategory,
    ControlStatus,
    ControlFrequency,
)
from models.issues import Issue, Severity, IssueStatus
from repository.in_memory import InMemoryGovernanceRepository
from services.controls_management import (
    ControlsManagementService,
    VALID_CONTROL_TYPES,
    VALID_CONTROL_CATEGORIES,
    track_compensating_control,
)


# Valid types for strategies
VALID_TYPES: list[ControlType] = ['organizational', 'process', 'access', 'change_management']
VALID_CATEGORIES: list[ControlCategory] = ['preventive', 'detective']
VALID_FREQUENCIES: list[ControlFrequency] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'continuous']
VALID_SEVERITIES: list[Severity] = ['critical', 'high', 'medium', 'low']
VALID_ISSUE_STATUSES: list[IssueStatus] = ['open', 'in_progress', 'pending_verification', 'resolved', 'closed']


# Strategy for generating valid control types
valid_control_type_strategy = st.sampled_from(VALID_TYPES)

# Strategy for generating valid control categories
valid_control_category_strategy = st.sampled_from(VALID_CATEGORIES)

# Strategy for generating valid control frequencies
valid_control_frequency_strategy = st.sampled_from(VALID_FREQUENCIES)

# Strategy for generating valid severities
valid_severity_strategy = st.sampled_from(VALID_SEVERITIES)

# Strategy for generating valid issue statuses
valid_issue_status_strategy = st.sampled_from(VALID_ISSUE_STATUSES)

# Strategy for generating control names
control_name_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Strategy for generating control descriptions
control_description_strategy = st.text(
    min_size=1,
    max_size=500,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z', 'P'))
).filter(lambda s: len(s.strip()) > 0)

# Strategy for generating owner names
owner_strategy = st.text(
    min_size=1,
    max_size=50,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)

# Strategy for generating UUIDs as strings
uuid_strategy = st.uuids().map(str)

# Strategy for generating future dates (for expiration)
future_date_strategy = st.integers(min_value=1, max_value=365).map(
    lambda days: datetime.now() + timedelta(days=days)
)

# Strategy for generating past dates
past_date_strategy = st.integers(min_value=1, max_value=365).map(
    lambda days: datetime.now() - timedelta(days=days)
)


@st.composite
def issue_strategy(draw):
    """Generate a valid Issue object."""
    return Issue(
        id=draw(uuid_strategy),
        title=draw(control_name_strategy),
        description=draw(control_description_strategy),
        source="test",
        impacted_reports=draw(st.lists(uuid_strategy, max_size=3)),
        impacted_cdes=draw(st.lists(uuid_strategy, max_size=3)),
        severity=draw(valid_severity_strategy),
        status=draw(valid_issue_status_strategy),
        assignee=draw(owner_strategy),
        created_at=datetime.now()
    )


@st.composite
def compensating_control_params_strategy(draw):
    """Generate valid parameters for creating a compensating control."""
    return {
        'name': draw(control_name_strategy),
        'description': draw(control_description_strategy),
        'control_type': draw(valid_control_type_strategy),
        'category': draw(valid_control_category_strategy),
        'owner': draw(owner_strategy),
        'frequency': draw(valid_control_frequency_strategy),
        'expiration_date': draw(future_date_strategy),
        'linked_cdes': draw(st.lists(uuid_strategy, max_size=3)),
        'linked_processes': draw(st.lists(uuid_strategy, max_size=3)),
    }


class TestCompensatingControlTracking:
    """
    Property 14: Compensating Control Tracking
    
    Tests that compensating controls always have:
    1. A non-null expiration_date
    2. A linked issue that exists
    """
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        issue=issue_strategy(),
        report_id=uuid_strategy,
    )
    def test_compensating_control_has_expiration_date_and_linked_issue(
        self, params: dict, issue: Issue, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any compensating control created through track_compensating_control,
        the control must have a non-null expiration_date and a valid linked_issue_id.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create the linked issue first
        repository.create_issue(issue)
        
        # Create compensating control
        control = service.track_compensating_control(
            report_id=report_id,
            linked_issue_id=issue.id,
            expiration_date=params['expiration_date'],
            name=params['name'],
            description=params['description'],
            control_type=params['control_type'],
            category=params['category'],
            owner=params['owner'],
            frequency=params['frequency'],
            linked_cdes=params['linked_cdes'],
            linked_processes=params['linked_processes'],
            actor="test_user",
            actor_type="human"
        )
        
        # Property: Compensating control must have status 'compensating'
        assert control.status == 'compensating', \
            f"Control status should be 'compensating', got '{control.status}'"
        
        # Property: Compensating control must have non-null expiration_date
        assert control.expiration_date is not None, \
            "Compensating control must have an expiration_date"
        
        # Property: Compensating control must have non-null linked_issue_id
        assert control.linked_issue_id is not None, \
            "Compensating control must have a linked_issue_id"
        
        # Property: The linked issue must exist in the repository
        linked_issue = repository.get_issue(control.linked_issue_id)
        assert linked_issue is not None, \
            f"Linked issue '{control.linked_issue_id}' must exist in repository"
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        report_id=uuid_strategy,
        issue_id=uuid_strategy,
    )
    def test_compensating_control_rejects_missing_linked_issue(
        self, params: dict, report_id: str, issue_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any attempt to create a compensating control with a
        non-existent linked issue, the system must reject with an error.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Don't create the issue - it should not exist
        
        # Property: Creating compensating control with non-existent issue must fail
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id=report_id,
                linked_issue_id=issue_id,  # This issue doesn't exist
                expiration_date=params['expiration_date'],
                name=params['name'],
                description=params['description'],
                control_type=params['control_type'],
                category=params['category'],
                owner=params['owner'],
                frequency=params['frequency'],
                actor="test_user",
                actor_type="human"
            )
        
        # Verify the error message mentions the issue
        assert "Issue not found" in str(exc_info.value), \
            f"Error message should mention 'Issue not found', got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        issue=issue_strategy(),
        report_id=uuid_strategy,
    )
    def test_compensating_control_rejects_missing_expiration_date(
        self, params: dict, issue: Issue, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any attempt to create a compensating control without
        an expiration_date, the system must reject with an error.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create the linked issue
        repository.create_issue(issue)
        
        # Property: Creating compensating control without expiration_date must fail
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id=report_id,
                linked_issue_id=issue.id,
                expiration_date=None,  # Missing expiration date
                name=params['name'],
                description=params['description'],
                control_type=params['control_type'],
                category=params['category'],
                owner=params['owner'],
                frequency=params['frequency'],
                actor="test_user",
                actor_type="human"
            )
        
        # Verify the error message mentions expiration_date
        assert "expiration_date" in str(exc_info.value).lower(), \
            f"Error message should mention 'expiration_date', got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        issue=issue_strategy(),
        report_id=uuid_strategy,
    )
    def test_compensating_control_rejects_missing_linked_issue_id(
        self, params: dict, issue: Issue, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any attempt to create a compensating control without
        a linked_issue_id, the system must reject with an error.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create the issue (but we won't link to it)
        repository.create_issue(issue)
        
        # Property: Creating compensating control without linked_issue_id must fail
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id=report_id,
                linked_issue_id="",  # Empty linked issue ID
                expiration_date=params['expiration_date'],
                name=params['name'],
                description=params['description'],
                control_type=params['control_type'],
                category=params['category'],
                owner=params['owner'],
                frequency=params['frequency'],
                actor="test_user",
                actor_type="human"
            )
        
        # Verify the error message mentions linked_issue_id
        assert "linked_issue_id" in str(exc_info.value).lower(), \
            f"Error message should mention 'linked_issue_id', got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        issue=issue_strategy(),
        report_id=uuid_strategy,
    )
    def test_validate_control_detects_invalid_compensating_control(
        self, params: dict, issue: Issue, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any control with status 'compensating' but missing
        expiration_date or linked_issue_id, validate_control must return errors.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create a control with compensating status but missing required fields
        invalid_control = Control(
            name=params['name'],
            description=params['description'],
            type=params['control_type'],
            category=params['category'],
            owner=params['owner'],
            frequency=params['frequency'],
            status='compensating',
            expiration_date=None,  # Missing
            linked_issue_id=None,  # Missing
        )
        
        # Validate the control
        errors = service.validate_control(invalid_control)
        
        # Property: Validation must detect missing expiration_date
        expiration_errors = [e for e in errors if 'expiration_date' in e.lower()]
        assert len(expiration_errors) > 0, \
            "Validation should detect missing expiration_date for compensating control"
        
        # Property: Validation must detect missing linked_issue_id
        issue_errors = [e for e in errors if 'linked_issue_id' in e.lower()]
        assert len(issue_errors) > 0, \
            "Validation should detect missing linked_issue_id for compensating control"
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        issue=issue_strategy(),
        report_id=uuid_strategy,
    )
    def test_valid_compensating_control_passes_validation(
        self, params: dict, issue: Issue, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any properly created compensating control with both
        expiration_date and linked_issue_id, validate_control must return no errors.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create the linked issue
        repository.create_issue(issue)
        
        # Create a valid compensating control
        control = service.track_compensating_control(
            report_id=report_id,
            linked_issue_id=issue.id,
            expiration_date=params['expiration_date'],
            name=params['name'],
            description=params['description'],
            control_type=params['control_type'],
            category=params['category'],
            owner=params['owner'],
            frequency=params['frequency'],
            actor="test_user",
            actor_type="human"
        )
        
        # Validate the control
        errors = service.validate_control(control)
        
        # Property: No compensating-control-specific errors should be present
        compensating_errors = [
            e for e in errors 
            if 'expiration_date' in e.lower() or 'linked_issue_id' in e.lower()
        ]
        assert len(compensating_errors) == 0, \
            f"Valid compensating control should have no errors, got: {compensating_errors}"
    
    @settings(max_examples=100)
    @given(
        params_list=st.lists(compensating_control_params_strategy(), min_size=1, max_size=5),
        issue=issue_strategy(),
        report_id=uuid_strategy,
        within_days=st.integers(min_value=1, max_value=60),
    )
    def test_get_expiring_compensating_controls(
        self, params_list: list, issue: Issue, report_id: str, within_days: int
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any set of compensating controls, get_expiring_compensating_controls
        must return only those controls expiring within the specified window.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create the linked issue
        repository.create_issue(issue)
        
        now = datetime.now()
        cutoff_date = now + timedelta(days=within_days)
        
        # Create controls with varying expiration dates
        created_controls = []
        for i, params in enumerate(params_list):
            # Alternate between expiring within window and after window
            if i % 2 == 0:
                # Expires within the window
                expiration = now + timedelta(days=within_days // 2 + 1)
            else:
                # Expires after the window
                expiration = now + timedelta(days=within_days + 30)
            
            control = service.track_compensating_control(
                report_id=report_id,
                linked_issue_id=issue.id,
                expiration_date=expiration,
                name=params['name'],
                description=params['description'],
                control_type=params['control_type'],
                category=params['category'],
                owner=params['owner'],
                frequency=params['frequency'],
                actor="test_user",
                actor_type="human"
            )
            created_controls.append(control)
        
        # Get expiring controls
        expiring_controls = service.get_expiring_compensating_controls(report_id, within_days)
        
        # Property: All returned controls must be compensating
        for control in expiring_controls:
            assert control.status == 'compensating', \
                f"Returned control should be compensating, got '{control.status}'"
        
        # Property: All returned controls must expire within the window
        for control in expiring_controls:
            assert control.expiration_date is not None, \
                "Expiring control must have expiration_date"
            assert control.expiration_date <= cutoff_date, \
                f"Control expires at {control.expiration_date}, but cutoff is {cutoff_date}"
        
        # Property: Count of expiring controls should match expected
        expected_expiring = [
            c for c in created_controls 
            if c.expiration_date and c.expiration_date <= cutoff_date
        ]
        assert len(expiring_controls) == len(expected_expiring), \
            f"Expected {len(expected_expiring)} expiring controls, got {len(expiring_controls)}"
    
    @settings(max_examples=100)
    @given(
        params=compensating_control_params_strategy(),
        issue=issue_strategy(),
        report_id=uuid_strategy,
    )
    def test_compensating_control_creates_audit_entry(
        self, params: dict, issue: Issue, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 14: Compensating Control Tracking**
        **Validates: Requirements 6.4**
        
        Property: For any compensating control creation, an audit entry must be
        created recording the action.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create the linked issue
        repository.create_issue(issue)
        
        # Create compensating control
        control = service.track_compensating_control(
            report_id=report_id,
            linked_issue_id=issue.id,
            expiration_date=params['expiration_date'],
            name=params['name'],
            description=params['description'],
            control_type=params['control_type'],
            category=params['category'],
            owner=params['owner'],
            frequency=params['frequency'],
            actor="test_user",
            actor_type="human"
        )
        
        # Property: An audit entry must be created
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) > 0, "No audit entry created for compensating control"
        
        # Find the compensating control audit entry
        comp_entries = [
            e for e in audit_entries 
            if e.action == "track_compensating_control" and e.entity_id == control.id
        ]
        assert len(comp_entries) > 0, \
            "No track_compensating_control audit entry found"
        
        # Verify the audit entry contains the linked issue
        entry = comp_entries[0]
        assert entry.new_state is not None, "Audit entry missing new_state"
        assert entry.new_state.get('linked_issue_id') == issue.id, \
            f"Audit entry should reference linked issue '{issue.id}'"
        assert entry.new_state.get('status') == 'compensating', \
            "Audit entry should show status as 'compensating'"

