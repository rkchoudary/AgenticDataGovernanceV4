"""
**Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**

For any issue with severity 'critical', escalation must occur within configured threshold.
When escalating, the escalate_issue tool SHALL increment escalation_level and notify 
senior management for critical issues.

**Validates: Requirements 9.4**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.issues import Issue, Severity, IssueStatus
from models.audit import AuditEntry
from repository.in_memory import InMemoryGovernanceRepository
from tools.issue_tools import create_issue_tools


# Strategies for generating test data
severity_strategy = st.sampled_from(['critical', 'high', 'medium', 'low'])
non_critical_severity_strategy = st.sampled_from(['high', 'medium', 'low'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# UUID strategy
uuid_strategy = st.uuids().map(str)


# Escalation time thresholds in hours for different severities
ESCALATION_THRESHOLDS = {
    'critical': 1,   # 1 hour
    'high': 4,       # 4 hours
    'medium': 24,    # 24 hours
    'low': 72        # 72 hours
}


@st.composite
def critical_issue_strategy(draw):
    """Generate a critical severity issue."""
    return Issue(
        id=draw(uuid_strategy),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        source=draw(st.sampled_from(['dq_rule', 'manual', 'reconciliation', 'audit', 'system'])),
        impacted_reports=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        impacted_cdes=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        severity='critical',
        status=draw(st.sampled_from(['open', 'in_progress'])),
        assignee=draw(non_empty_string_strategy),
        created_at=datetime.now() - timedelta(hours=draw(st.integers(min_value=0, max_value=48))),
        due_date=datetime.now() + timedelta(days=draw(st.integers(min_value=1, max_value=7))),
        escalation_level=0
    )


@st.composite
def issue_with_severity_strategy(draw, severity: str):
    """Generate an issue with a specific severity."""
    return Issue(
        id=draw(uuid_strategy),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        source=draw(st.sampled_from(['dq_rule', 'manual', 'reconciliation', 'audit', 'system'])),
        impacted_reports=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        impacted_cdes=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        severity=severity,
        status=draw(st.sampled_from(['open', 'in_progress'])),
        assignee=draw(non_empty_string_strategy),
        created_at=datetime.now() - timedelta(hours=draw(st.integers(min_value=0, max_value=48))),
        due_date=datetime.now() + timedelta(days=draw(st.integers(min_value=1, max_value=7))),
        escalation_level=0
    )


@st.composite
def escalation_reason_strategy(draw):
    """Generate a valid escalation reason."""
    reasons = [
        "Issue has exceeded SLA threshold",
        "Critical business impact requires immediate attention",
        "Regulatory deadline approaching",
        "Multiple related issues detected",
        "Customer escalation received",
        "Data quality degradation detected",
        "Compliance risk identified"
    ]
    return draw(st.sampled_from(reasons))


class TestCriticalIssueEscalation:
    """
    Property 20: Critical Issue Escalation
    
    Tests that critical issues are properly escalated with escalation_level
    incremented and senior management notified.
    """
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalate_critical_issue_increments_escalation_level(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue, escalation must increment the escalation_level.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        initial_escalation_level = created_issue.escalation_level
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]  # escalate_issue is the 5th tool
        
        # Escalate the issue
        result = escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify escalation level was incremented
        assert result['escalation_level'] == initial_escalation_level + 1, \
            f"Escalation level must be incremented from {initial_escalation_level} to {initial_escalation_level + 1}"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalate_critical_issue_sets_escalated_at(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue escalation, escalated_at timestamp must be set.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        result = escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify escalated_at is set
        assert result['escalated_at'] is not None, \
            "escalated_at must be set after escalation"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalate_critical_issue_notifies_senior_management(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue escalation, senior management must be notified
        (evidenced by audit entry with notify_senior_management action).
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify senior management notification audit entry exists
        audit_entries = repository.get_audit_entries(
            action='notify_senior_management',
            entity_id=created_issue.id
        )
        
        assert len(audit_entries) >= 1, \
            "Senior management notification audit entry must be created for critical issue escalation"
        
        # Verify notification details
        notification_entry = audit_entries[0]
        assert notification_entry.new_state is not None, \
            "Notification audit entry must have new_state"
        assert notification_entry.new_state.get('notification_type') == 'critical_issue_escalation', \
            "Notification type must be 'critical_issue_escalation'"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalate_critical_issue_creates_audit_entry(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue escalation, an audit entry must be created
        with the escalator and reason recorded.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify escalation audit entry exists
        audit_entries = repository.get_audit_entries(
            action='escalate_issue',
            entity_id=created_issue.id
        )
        
        assert len(audit_entries) >= 1, \
            "Audit entry must be created for escalation"
        
        entry = audit_entries[0]
        assert entry.actor == escalator, \
            f"Audit entry actor must be '{escalator}', got '{entry.actor}'"
        assert entry.rationale == reason, \
            f"Audit entry rationale must be '{reason}', got '{entry.rationale}'"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy(),
        num_escalations=st.integers(min_value=2, max_value=5)
    )
    def test_multiple_escalations_increment_level_each_time(
        self, issue: Issue, escalator: str, reason: str, num_escalations: int
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue, each escalation must increment the
        escalation_level by exactly 1.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Perform multiple escalations
        for i in range(num_escalations):
            result = escalate_issue(
                issue_id=created_issue.id,
                escalator=f"{escalator}_{i}",
                reason=f"{reason} - escalation {i + 1}"
            )
            
            expected_level = i + 1
            assert result['escalation_level'] == expected_level, \
                f"After {i + 1} escalations, level must be {expected_level}, got {result['escalation_level']}"
    
    @settings(max_examples=100)
    @given(
        severity=non_critical_severity_strategy,
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_non_critical_escalation_does_not_notify_senior_management(
        self, severity: str, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any non-critical issue escalation, senior management
        notification should NOT be triggered (only critical issues trigger this).
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a non-critical issue
        issue = Issue(
            title="Non-critical test issue",
            description="Test description for non-critical issue",
            source="manual",
            severity=severity,
            status='open',
            assignee="test-assignee",
            created_at=datetime.now(),
            escalation_level=0
        )
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify NO senior management notification for non-critical issues
        notification_entries = repository.get_audit_entries(
            action='notify_senior_management',
            entity_id=created_issue.id
        )
        
        assert len(notification_entries) == 0, \
            f"Non-critical ({severity}) issues should NOT trigger senior management notification"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalation_persists_to_repository(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue escalation, the updated issue must be
        persisted to the repository with the new escalation_level.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify the persisted issue has updated escalation level
        stored_issue = repository.get_issue(created_issue.id)
        
        assert stored_issue is not None, \
            "Issue must be persisted after escalation"
        assert stored_issue.escalation_level == 1, \
            f"Persisted issue escalation_level must be 1, got {stored_issue.escalation_level}"
        assert stored_issue.escalated_at is not None, \
            "Persisted issue escalated_at must be set"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalation_notification_includes_escalation_level(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue escalation notification, the notification
        must include the current escalation_level.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify notification includes escalation level
        notification_entries = repository.get_audit_entries(
            action='notify_senior_management',
            entity_id=created_issue.id
        )
        
        assert len(notification_entries) >= 1, \
            "Notification audit entry must exist"
        
        notification = notification_entries[0]
        assert notification.new_state.get('escalation_level') == 1, \
            f"Notification must include escalation_level=1, got {notification.new_state.get('escalation_level')}"
    
    @settings(max_examples=100)
    @given(
        issue=critical_issue_strategy(),
        escalator=non_empty_string_strategy,
        reason=escalation_reason_strategy()
    )
    def test_escalation_notification_includes_reason(
        self, issue: Issue, escalator: str, reason: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 20: Critical Issue Escalation**
        **Validates: Requirements 9.4**
        
        Property: For any critical issue escalation notification, the notification
        must include the escalation reason.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create tools and escalate
        tools = create_issue_tools(repository)
        escalate_issue = tools[4]
        
        # Escalate the issue
        escalate_issue(
            issue_id=created_issue.id,
            escalator=escalator,
            reason=reason
        )
        
        # Verify notification includes reason
        notification_entries = repository.get_audit_entries(
            action='notify_senior_management',
            entity_id=created_issue.id
        )
        
        assert len(notification_entries) >= 1, \
            "Notification audit entry must exist"
        
        notification = notification_entries[0]
        assert notification.new_state.get('reason') == reason, \
            f"Notification must include reason '{reason}', got '{notification.new_state.get('reason')}'"
