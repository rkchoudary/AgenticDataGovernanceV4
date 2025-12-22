"""
**Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**

For any control, the type must be one of: organizational, process, access, change_management.

**Validates: Requirements 6.1**
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
from models.issues import Issue
from repository.in_memory import InMemoryGovernanceRepository
from services.controls_management import (
    ControlsManagementService,
    VALID_CONTROL_TYPES,
    VALID_CONTROL_CATEGORIES,
    categorize_control,
    track_compensating_control,
)


# Valid control types per Requirement 11.2 / 6.1
VALID_TYPES: list[ControlType] = ['organizational', 'process', 'access', 'change_management']
VALID_CATEGORIES: list[ControlCategory] = ['preventive', 'detective']
VALID_STATUSES: list[ControlStatus] = ['active', 'inactive', 'compensating']
VALID_FREQUENCIES: list[ControlFrequency] = ['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'continuous']


# Strategy for generating valid control types
valid_control_type_strategy = st.sampled_from(VALID_TYPES)

# Strategy for generating valid control categories
valid_control_category_strategy = st.sampled_from(VALID_CATEGORIES)

# Strategy for generating valid control statuses
valid_control_status_strategy = st.sampled_from(VALID_STATUSES)

# Strategy for generating valid control frequencies
valid_control_frequency_strategy = st.sampled_from(VALID_FREQUENCIES)

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

# Strategy for generating invalid control types (strings not in valid types)
invalid_control_type_strategy = st.text(
    min_size=1,
    max_size=50,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: s not in VALID_TYPES and len(s.strip()) > 0)


# Strategy for generating a valid Control object
@st.composite
def control_strategy(draw):
    """Generate a valid Control object."""
    return Control(
        id=draw(uuid_strategy),
        name=draw(control_name_strategy),
        description=draw(control_description_strategy),
        type=draw(valid_control_type_strategy),
        category=draw(valid_control_category_strategy),
        owner=draw(owner_strategy),
        frequency=draw(valid_control_frequency_strategy),
        linked_cdes=draw(st.lists(uuid_strategy, max_size=5)),
        linked_processes=draw(st.lists(uuid_strategy, max_size=5)),
        status=draw(st.sampled_from(['active', 'inactive'])),  # Exclude compensating for simplicity
        evidence=[]
    )


class TestControlCategorizationValidity:
    """
    Property 13: Control Categorization Validity
    
    Tests that all controls have valid type values from the allowed set:
    organizational, process, access, change_management.
    """
    
    @settings(max_examples=100)
    @given(
        control=control_strategy(),
        new_type=valid_control_type_strategy,
        new_category=valid_control_category_strategy,
    )
    def test_categorize_control_accepts_valid_types(
        self, control: Control, new_type: ControlType, new_category: ControlCategory
    ):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any control and any valid control type, categorize_control
        must accept the type and update the control accordingly.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Categorize the control with a valid type
        updated_control = service.categorize_control(
            control=control,
            control_type=new_type,
            category=new_category,
            actor="test_user",
            actor_type="human"
        )
        
        # Property: The control type must be updated to the specified valid type
        assert updated_control.type == new_type, \
            f"Control type not updated: expected '{new_type}', got '{updated_control.type}'"
        
        # Property: The updated type must be in the valid types list
        assert updated_control.type in VALID_TYPES, \
            f"Control type '{updated_control.type}' is not in valid types: {VALID_TYPES}"
        
        # Property: The category must also be updated
        assert updated_control.category == new_category, \
            f"Control category not updated: expected '{new_category}', got '{updated_control.category}'"
    
    @settings(max_examples=100)
    @given(
        control=control_strategy(),
        invalid_type=invalid_control_type_strategy,
        category=valid_control_category_strategy,
    )
    def test_categorize_control_rejects_invalid_types(
        self, control: Control, invalid_type: str, category: ControlCategory
    ):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any control and any invalid control type, categorize_control
        must reject the type with a ValueError.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Property: Invalid types must be rejected
        with pytest.raises(ValueError) as exc_info:
            service.categorize_control(
                control=control,
                control_type=invalid_type,  # type: ignore - intentionally passing invalid type
                category=category,
                actor="test_user",
                actor_type="human"
            )
        
        # Verify the error message mentions the invalid type
        assert invalid_type in str(exc_info.value), \
            f"Error message should mention the invalid type '{invalid_type}'"
    
    @settings(max_examples=100)
    @given(control_type=valid_control_type_strategy)
    def test_all_valid_types_are_accepted(self, control_type: ControlType):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: Each of the four valid control types must be accepted by
        the categorize_control function.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create a basic control
        control = Control(
            name="Test Control",
            description="A test control for validation",
            type='organizational',  # Initial type
            category='preventive',
            owner="test_owner",
            frequency='monthly'
        )
        
        # Property: The valid type must be accepted without error
        updated_control = service.categorize_control(
            control=control,
            control_type=control_type,
            category='preventive',
            actor="test_user",
            actor_type="human"
        )
        
        assert updated_control.type == control_type, \
            f"Valid type '{control_type}' was not properly set"
        assert updated_control.type in VALID_TYPES, \
            f"Type '{updated_control.type}' is not in valid types"
    
    @settings(max_examples=100)
    @given(
        control=control_strategy(),
    )
    def test_control_type_always_valid_after_creation(self, control: Control):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any control created through the strategy, the type
        must always be one of the valid types.
        """
        # Property: Control type must be in the valid types list
        assert control.type in VALID_TYPES, \
            f"Control type '{control.type}' is not in valid types: {VALID_TYPES}"
    
    @settings(max_examples=100)
    @given(
        control=control_strategy(),
    )
    def test_validate_control_detects_valid_types(self, control: Control):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any control with a valid type, the validate_control
        function must return no type-related errors.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Validate the control
        errors = service.validate_control(control)
        
        # Property: No type-related errors should be present for valid controls
        type_errors = [e for e in errors if 'control type' in e.lower()]
        assert len(type_errors) == 0, \
            f"Valid control type '{control.type}' produced errors: {type_errors}"
    
    @settings(max_examples=100)
    @given(
        name=control_name_strategy,
        description=control_description_strategy,
        control_type=valid_control_type_strategy,
        category=valid_control_category_strategy,
        owner=owner_strategy,
        frequency=valid_control_frequency_strategy,
        report_id=uuid_strategy,
        issue_id=uuid_strategy,
    )
    def test_compensating_control_has_valid_type(
        self,
        name: str,
        description: str,
        control_type: ControlType,
        category: ControlCategory,
        owner: str,
        frequency: ControlFrequency,
        report_id: str,
        issue_id: str,
    ):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any compensating control created through track_compensating_control,
        the type must be one of the valid types.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create a linked issue (required for compensating controls)
        issue = Issue(
            id=issue_id,
            title="Test Issue",
            description="A test issue for compensating control",
            source="test",
            impacted_reports=[report_id],
            impacted_cdes=[],
            severity='medium',
            status='open',
            assignee="test_assignee",
            created_at=datetime.now()
        )
        repository.create_issue(issue)
        
        # Create compensating control
        expiration_date = datetime.now() + timedelta(days=30)
        
        compensating_control = service.track_compensating_control(
            report_id=report_id,
            linked_issue_id=issue_id,
            expiration_date=expiration_date,
            name=name,
            description=description,
            control_type=control_type,
            category=category,
            owner=owner,
            frequency=frequency,
            actor="test_user",
            actor_type="human"
        )
        
        # Property: The compensating control type must be valid
        assert compensating_control.type in VALID_TYPES, \
            f"Compensating control type '{compensating_control.type}' is not in valid types: {VALID_TYPES}"
        
        # Property: The type must match what was specified
        assert compensating_control.type == control_type, \
            f"Compensating control type mismatch: expected '{control_type}', got '{compensating_control.type}'"
    
    @settings(max_examples=100)
    @given(
        invalid_type=invalid_control_type_strategy,
        report_id=uuid_strategy,
        issue_id=uuid_strategy,
    )
    def test_compensating_control_rejects_invalid_type(
        self,
        invalid_type: str,
        report_id: str,
        issue_id: str,
    ):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any invalid control type, track_compensating_control
        must reject the type with a ValueError.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Create a linked issue (required for compensating controls)
        issue = Issue(
            id=issue_id,
            title="Test Issue",
            description="A test issue for compensating control",
            source="test",
            impacted_reports=[report_id],
            impacted_cdes=[],
            severity='medium',
            status='open',
            assignee="test_assignee",
            created_at=datetime.now()
        )
        repository.create_issue(issue)
        
        expiration_date = datetime.now() + timedelta(days=30)
        
        # Property: Invalid types must be rejected
        with pytest.raises(ValueError) as exc_info:
            service.track_compensating_control(
                report_id=report_id,
                linked_issue_id=issue_id,
                expiration_date=expiration_date,
                name="Test Compensating Control",
                description="A test compensating control",
                control_type=invalid_type,  # type: ignore - intentionally passing invalid type
                category='preventive',
                owner="test_owner",
                frequency='monthly',
                actor="test_user",
                actor_type="human"
            )
        
        # Verify the error message mentions the invalid type
        assert invalid_type in str(exc_info.value), \
            f"Error message should mention the invalid type '{invalid_type}'"
    
    def test_valid_types_constant_matches_model(self):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: The VALID_CONTROL_TYPES constant in the service must match
        the expected valid types from the requirements.
        """
        expected_types = {'organizational', 'process', 'access', 'change_management'}
        actual_types = set(VALID_CONTROL_TYPES)
        
        assert actual_types == expected_types, \
            f"VALID_CONTROL_TYPES mismatch: expected {expected_types}, got {actual_types}"
    
    @settings(max_examples=100)
    @given(
        control=control_strategy(),
        new_type=valid_control_type_strategy,
        new_category=valid_control_category_strategy,
    )
    def test_categorize_control_creates_audit_entry(
        self, control: Control, new_type: ControlType, new_category: ControlCategory
    ):
        """
        **Feature: agentcore-python-refactor, Property 13: Control Categorization Validity**
        **Validates: Requirements 6.1**
        
        Property: For any successful categorization, an audit entry must be created
        recording the type change.
        """
        repository = InMemoryGovernanceRepository()
        service = ControlsManagementService(repository)
        
        # Categorize the control
        service.categorize_control(
            control=control,
            control_type=new_type,
            category=new_category,
            actor="test_user",
            actor_type="human"
        )
        
        # Property: An audit entry must be created
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) > 0, "No audit entry created for categorization"
        
        # Find the categorization audit entry
        categorize_entries = [
            e for e in audit_entries 
            if e.action == "categorize_control" and e.entity_id == control.id
        ]
        assert len(categorize_entries) > 0, \
            "No categorize_control audit entry found"
        
        # Verify the audit entry contains the new type
        entry = categorize_entries[0]
        assert entry.new_state is not None, "Audit entry missing new_state"
        assert entry.new_state.get('type') == new_type, \
            f"Audit entry type mismatch: expected '{new_type}', got '{entry.new_state.get('type')}'"
