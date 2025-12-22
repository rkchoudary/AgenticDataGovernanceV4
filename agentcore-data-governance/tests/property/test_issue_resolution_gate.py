"""
**Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**

For any issue transitioning to 'closed' or 'resolved' status, the resolution.verified_by 
field must be non-null and different from the resolution.implemented_by field (four-eyes principle).

**Validates: Requirements 9.5**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.issues import Issue, Resolution, Severity, IssueStatus, ResolutionType
from models.audit import AuditEntry
from repository.in_memory import InMemoryGovernanceRepository
from tools.issue_tools import create_issue_tools


# Strategies for generating test data
severity_strategy = st.sampled_from(['critical', 'high', 'medium', 'low'])
resolution_type_strategy = st.sampled_from(['data_correction', 'process_change', 'system_fix', 'exception_approved'])

# Non-empty string strategy for names/identifiers
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=50,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)

# UUID strategy
uuid_strategy = st.uuids().map(str)

# Description strategy (longer text)
description_strategy = st.text(min_size=10, max_size=200)


@st.composite
def open_issue_strategy(draw):
    """Generate an open issue that can be resolved."""
    return Issue(
        id=draw(uuid_strategy),
        title=draw(non_empty_string_strategy),
        description=draw(description_strategy),
        source=draw(st.sampled_from(['dq_rule', 'manual', 'reconciliation', 'audit', 'system'])),
        impacted_reports=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        impacted_cdes=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        severity=draw(severity_strategy),
        status=draw(st.sampled_from(['open', 'in_progress'])),
        assignee=draw(non_empty_string_strategy),
        created_at=datetime.now() - timedelta(hours=draw(st.integers(min_value=1, max_value=48))),
        due_date=datetime.now() + timedelta(days=draw(st.integers(min_value=1, max_value=7))),
        escalation_level=0
    )


@st.composite
def different_users_strategy(draw):
    """Generate two different user identifiers."""
    user1 = draw(non_empty_string_strategy)
    user2 = draw(non_empty_string_strategy.filter(lambda s: s != user1))
    return (user1, user2)


class TestIssueResolutionGate:
    """
    Property 21: Issue Resolution Confirmation Gate
    
    Tests that issue resolution enforces the four-eyes principle:
    verified_by must be different from implemented_by.
    """
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolve_issue_with_different_users_succeeds(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue, resolution with different implemented_by and verified_by
        must succeed and set the issue status to 'resolved'.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]  # resolve_issue is the 6th tool
        
        # Resolve the issue with different users
        result = resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify resolution succeeded
        assert result['status'] == 'resolved', \
            f"Issue status must be 'resolved', got '{result['status']}'"
        assert result['resolution'] is not None, \
            "Resolution must be set"
        assert result['resolution']['implemented_by'] == implemented_by, \
            f"implemented_by must be '{implemented_by}'"
        assert result['resolution']['verified_by'] == verified_by, \
            f"verified_by must be '{verified_by}'"
        assert result['resolution']['implemented_by'] != result['resolution']['verified_by'], \
            "Four-eyes principle: implemented_by must differ from verified_by"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        same_user=non_empty_string_strategy
    )
    def test_resolve_issue_with_same_user_fails(
        self, issue: Issue, resolution_type: str, resolution_description: str, same_user: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue, resolution with same implemented_by and verified_by
        must be rejected (four-eyes principle violation).
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Attempt to resolve with same user for both roles
        error_raised = False
        error_message = ""
        
        try:
            resolve_issue(
                issue_id=created_issue.id,
                resolution_type=resolution_type,
                resolution_description=resolution_description,
                implemented_by=same_user,
                verified_by=same_user
            )
        except ValueError as e:
            error_raised = True
            error_message = str(e)
        
        # Verify error was raised
        assert error_raised, \
            "Four-eyes principle violation must raise ValueError"
        assert "four-eyes" in error_message.lower() or "verified_by" in error_message.lower(), \
            f"Error message must mention four-eyes principle, got: {error_message}"
        
        # Verify issue was not resolved
        stored_issue = repository.get_issue(created_issue.id)
        assert stored_issue.status != 'resolved', \
            "Issue must not be resolved when four-eyes principle is violated"
        assert stored_issue.resolution is None, \
            "Resolution must not be set when four-eyes principle is violated"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolution_sets_verified_by_non_null(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any resolved issue, the resolution.verified_by field must be non-null.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Resolve the issue
        result = resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify verified_by is non-null
        assert result['resolution']['verified_by'] is not None, \
            "verified_by must be non-null for resolved issues"
        assert len(result['resolution']['verified_by']) > 0, \
            "verified_by must be a non-empty string"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolution_sets_implemented_by_non_null(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any resolved issue, the resolution.implemented_by field must be non-null.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Resolve the issue
        result = resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify implemented_by is non-null
        assert result['resolution']['implemented_by'] is not None, \
            "implemented_by must be non-null for resolved issues"
        assert len(result['resolution']['implemented_by']) > 0, \
            "implemented_by must be a non-empty string"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolution_creates_audit_entry(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue resolution, an audit entry must be created
        with the verifier recorded as the actor.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Resolve the issue
        resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify audit entry was created
        audit_entries = repository.get_audit_entries(
            action='resolve_issue',
            entity_id=created_issue.id
        )
        
        assert len(audit_entries) >= 1, \
            "Audit entry must be created for issue resolution"
        
        entry = audit_entries[0]
        assert entry.actor == verified_by, \
            f"Audit entry actor must be verifier '{verified_by}', got '{entry.actor}'"
        assert entry.actor_type == 'human', \
            "Audit entry actor_type must be 'human'"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolution_persists_to_repository(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue resolution, the updated issue must be
        persisted to the repository with the resolution details.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Resolve the issue
        resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify the persisted issue has resolution
        stored_issue = repository.get_issue(created_issue.id)
        
        assert stored_issue is not None, \
            "Issue must be persisted after resolution"
        assert stored_issue.status == 'resolved', \
            f"Persisted issue status must be 'resolved', got '{stored_issue.status}'"
        assert stored_issue.resolution is not None, \
            "Persisted issue must have resolution"
        assert stored_issue.resolution.implemented_by == implemented_by, \
            f"Persisted resolution implemented_by must be '{implemented_by}'"
        assert stored_issue.resolution.verified_by == verified_by, \
            f"Persisted resolution verified_by must be '{verified_by}'"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolution_sets_timestamps(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue resolution, implemented_at and verified_at
        timestamps must be set.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Resolve the issue
        result = resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify timestamps are set
        assert result['resolution']['implemented_at'] is not None, \
            "implemented_at must be set"
        assert result['resolution']['verified_at'] is not None, \
            "verified_at must be set"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_type=resolution_type_strategy,
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_resolution_type_is_valid(
        self, issue: Issue, resolution_type: str, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue resolution, the resolution type must be one of
        the valid types: data_correction, process_change, system_fix, exception_approved.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Resolve the issue
        result = resolve_issue(
            issue_id=created_issue.id,
            resolution_type=resolution_type,
            resolution_description=resolution_description,
            implemented_by=implemented_by,
            verified_by=verified_by
        )
        
        # Verify resolution type is valid
        valid_types = ['data_correction', 'process_change', 'system_fix', 'exception_approved']
        assert result['resolution']['type'] in valid_types, \
            f"Resolution type must be one of {valid_types}, got '{result['resolution']['type']}'"
    
    @settings(max_examples=100)
    @given(
        issue=open_issue_strategy(),
        resolution_description=description_strategy,
        users=different_users_strategy()
    )
    def test_invalid_resolution_type_fails(
        self, issue: Issue, resolution_description: str, users: tuple[str, str]
    ):
        """
        **Feature: agentcore-python-refactor, Property 21: Issue Resolution Confirmation Gate**
        **Validates: Requirements 9.5**
        
        Property: For any issue, resolution with an invalid resolution_type
        must be rejected.
        """
        implemented_by, verified_by = users
        
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        resolve_issue = tools[5]
        
        # Attempt to resolve with invalid type
        error_raised = False
        
        try:
            resolve_issue(
                issue_id=created_issue.id,
                resolution_type="invalid_type",
                resolution_description=resolution_description,
                implemented_by=implemented_by,
                verified_by=verified_by
            )
        except ValueError:
            error_raised = True
        
        # Verify error was raised
        assert error_raised, \
            "Invalid resolution_type must raise ValueError"
