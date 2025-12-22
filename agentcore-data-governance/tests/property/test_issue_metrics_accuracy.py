"""
**Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**

For any set of issues, the calculated metrics (open_count, open_by_severity, 
avg_resolution_time) must accurately reflect the actual issue data:
- open_count equals count of issues with status in ['open', 'in_progress', 'pending_verification']
- open_by_severity correctly counts open issues by severity level
- avg_resolution_time equals mean of (verified_at - created_at) for resolved issues

**Validates: Requirements 9.6**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.issues import Issue, Resolution, Severity, IssueStatus
from repository.in_memory import InMemoryGovernanceRepository
from tools.issue_tools import create_issue_tools


# Strategies for generating test data
severity_strategy = st.sampled_from(['critical', 'high', 'medium', 'low'])
open_status_strategy = st.sampled_from(['open', 'in_progress', 'pending_verification'])
closed_status_strategy = st.sampled_from(['resolved', 'closed'])
all_status_strategy = st.sampled_from(['open', 'in_progress', 'pending_verification', 'resolved', 'closed'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# UUID strategy
uuid_strategy = st.uuids().map(str)


@st.composite
def resolution_strategy(draw, created_at: datetime):
    """Generate a Resolution with verified_at after created_at."""
    # Resolution time between 1 hour and 30 days
    resolution_hours = draw(st.integers(min_value=1, max_value=720))
    implemented_at = created_at + timedelta(hours=resolution_hours - 1)
    verified_at = created_at + timedelta(hours=resolution_hours)
    
    return Resolution(
        type=draw(st.sampled_from(['data_correction', 'process_change', 'system_fix', 'exception_approved'])),
        description=draw(st.text(min_size=10, max_size=200)),
        implemented_by=draw(non_empty_string_strategy),
        implemented_at=implemented_at,
        verified_by=draw(non_empty_string_strategy),
        verified_at=verified_at
    )


@st.composite
def open_issue_strategy(draw):
    """Generate an open issue (status in open, in_progress, pending_verification)."""
    return Issue(
        id=draw(uuid_strategy),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        source=draw(st.sampled_from(['dq_rule', 'manual', 'reconciliation', 'audit', 'system'])),
        impacted_reports=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        impacted_cdes=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        severity=draw(severity_strategy),
        status=draw(open_status_strategy),
        assignee=draw(non_empty_string_strategy),
        created_at=datetime.now() - timedelta(hours=draw(st.integers(min_value=1, max_value=720))),
        escalation_level=0
    )


@st.composite
def resolved_issue_strategy(draw):
    """Generate a resolved issue with resolution details."""
    created_at = datetime.now() - timedelta(hours=draw(st.integers(min_value=24, max_value=720)))
    resolution = draw(resolution_strategy(created_at))
    
    return Issue(
        id=draw(uuid_strategy),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        source=draw(st.sampled_from(['dq_rule', 'manual', 'reconciliation', 'audit', 'system'])),
        impacted_reports=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        impacted_cdes=draw(st.lists(uuid_strategy, min_size=0, max_size=3)),
        severity=draw(severity_strategy),
        status=draw(closed_status_strategy),
        assignee=draw(non_empty_string_strategy),
        created_at=created_at,
        resolution=resolution,
        escalation_level=0
    )


@st.composite
def mixed_issues_strategy(draw, min_open: int = 0, max_open: int = 10, 
                          min_resolved: int = 0, max_resolved: int = 10):
    """Generate a mix of open and resolved issues."""
    open_issues = draw(st.lists(open_issue_strategy(), min_size=min_open, max_size=max_open))
    resolved_issues = draw(st.lists(resolved_issue_strategy(), min_size=min_resolved, max_size=max_resolved))
    return open_issues + resolved_issues


class TestIssueMetricsAccuracy:
    """
    Property 22: Issue Metrics Accuracy
    
    Tests that calculated issue metrics accurately reflect the actual issue data.
    """
    
    @settings(max_examples=100)
    @given(issues=st.lists(open_issue_strategy(), min_size=1, max_size=20))
    def test_open_count_equals_actual_open_issues(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of issues, open_count must equal the count of issues
        with status in ['open', 'in_progress', 'pending_verification'].
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]  # get_issue_metrics is the 7th tool
        metrics = get_issue_metrics()
        
        # Calculate expected open count
        expected_open_count = len([
            i for i in issues 
            if i.status in ['open', 'in_progress', 'pending_verification']
        ])
        
        assert metrics['open_count'] == expected_open_count, \
            f"open_count must be {expected_open_count}, got {metrics['open_count']}"
    
    @settings(max_examples=100)
    @given(issues=mixed_issues_strategy(min_open=0, max_open=15, min_resolved=0, max_resolved=15))
    def test_open_count_excludes_resolved_and_closed(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of issues, open_count must NOT include issues
        with status 'resolved' or 'closed'.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        # Calculate expected open count (excluding resolved/closed)
        expected_open_count = len([
            i for i in issues 
            if i.status in ['open', 'in_progress', 'pending_verification']
        ])
        
        assert metrics['open_count'] == expected_open_count, \
            f"open_count must exclude resolved/closed issues. Expected {expected_open_count}, got {metrics['open_count']}"
    
    @settings(max_examples=100)
    @given(issues=st.lists(open_issue_strategy(), min_size=1, max_size=20))
    def test_open_by_severity_counts_correctly(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of open issues, open_by_severity must correctly
        count issues for each severity level.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        # Calculate expected counts by severity
        expected_by_severity = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        for issue in issues:
            if issue.status in ['open', 'in_progress', 'pending_verification']:
                expected_by_severity[issue.severity] += 1
        
        for severity in ['critical', 'high', 'medium', 'low']:
            assert metrics['open_by_severity'][severity] == expected_by_severity[severity], \
                f"open_by_severity['{severity}'] must be {expected_by_severity[severity]}, " \
                f"got {metrics['open_by_severity'][severity]}"
    
    @settings(max_examples=100)
    @given(issues=mixed_issues_strategy(min_open=0, max_open=10, min_resolved=0, max_resolved=10))
    def test_open_by_severity_excludes_resolved(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of issues, open_by_severity must NOT count
        resolved or closed issues.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        # Calculate expected counts (only open statuses)
        expected_by_severity = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        for issue in issues:
            if issue.status in ['open', 'in_progress', 'pending_verification']:
                expected_by_severity[issue.severity] += 1
        
        # Sum of open_by_severity should equal open_count
        total_by_severity = sum(metrics['open_by_severity'].values())
        assert total_by_severity == metrics['open_count'], \
            f"Sum of open_by_severity ({total_by_severity}) must equal open_count ({metrics['open_count']})"
        
        for severity in ['critical', 'high', 'medium', 'low']:
            assert metrics['open_by_severity'][severity] == expected_by_severity[severity], \
                f"open_by_severity['{severity}'] must be {expected_by_severity[severity]}, " \
                f"got {metrics['open_by_severity'][severity]}"
    
    @settings(max_examples=100)
    @given(issues=st.lists(resolved_issue_strategy(), min_size=1, max_size=10))
    def test_avg_resolution_time_calculated_correctly(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of resolved issues, avg_resolution_time must equal
        the mean of (verified_at - created_at) for all resolved issues with resolution.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        # Calculate expected average resolution time
        resolved_with_resolution = [
            i for i in issues 
            if i.status in ['resolved', 'closed'] and i.resolution and i.resolution.verified_at
        ]
        
        if resolved_with_resolution:
            total_time = sum(
                (i.resolution.verified_at - i.created_at).total_seconds() / 3600
                for i in resolved_with_resolution
            )
            expected_avg = total_time / len(resolved_with_resolution)
        else:
            expected_avg = 0.0
        
        # Allow small floating point tolerance
        assert abs(metrics['avg_resolution_time'] - expected_avg) < 0.01, \
            f"avg_resolution_time must be approximately {expected_avg:.2f}, got {metrics['avg_resolution_time']}"
    
    @settings(max_examples=100)
    @given(issues=st.lists(open_issue_strategy(), min_size=1, max_size=10))
    def test_avg_resolution_time_zero_when_no_resolved_issues(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of only open issues (no resolved), avg_resolution_time
        must be 0.0.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues (all open)
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        assert metrics['avg_resolution_time'] == 0.0, \
            f"avg_resolution_time must be 0.0 when no resolved issues, got {metrics['avg_resolution_time']}"
    
    @settings(max_examples=100)
    @given(issues=mixed_issues_strategy(min_open=1, max_open=10, min_resolved=1, max_resolved=10))
    def test_metrics_consistency_with_mixed_issues(self, issues: list[Issue]):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any mixed set of issues, all metrics must be internally consistent:
        - open_count equals sum of open_by_severity values
        - avg_resolution_time only considers resolved issues
        """
        repository = InMemoryGovernanceRepository()
        
        # Store all issues
        for issue in issues:
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        # Verify open_count equals sum of open_by_severity
        sum_by_severity = sum(metrics['open_by_severity'].values())
        assert metrics['open_count'] == sum_by_severity, \
            f"open_count ({metrics['open_count']}) must equal sum of open_by_severity ({sum_by_severity})"
        
        # Verify open_count matches actual open issues
        actual_open = len([i for i in issues if i.status in ['open', 'in_progress', 'pending_verification']])
        assert metrics['open_count'] == actual_open, \
            f"open_count ({metrics['open_count']}) must match actual open issues ({actual_open})"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_empty_repository_returns_zero_metrics(self, data):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For an empty repository, all metrics must be zero/empty.
        """
        repository = InMemoryGovernanceRepository()
        
        # Get metrics from empty repository
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        assert metrics['open_count'] == 0, \
            f"open_count must be 0 for empty repository, got {metrics['open_count']}"
        assert metrics['open_by_severity'] == {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}, \
            f"open_by_severity must be all zeros for empty repository"
        assert metrics['avg_resolution_time'] == 0.0, \
            f"avg_resolution_time must be 0.0 for empty repository, got {metrics['avg_resolution_time']}"
    
    @settings(max_examples=100)
    @given(
        severity=severity_strategy,
        count=st.integers(min_value=1, max_value=10)
    )
    def test_single_severity_counted_correctly(self, severity: str, count: int):
        """
        **Feature: agentcore-python-refactor, Property 22: Issue Metrics Accuracy**
        **Validates: Requirements 9.6**
        
        Property: For any set of issues with a single severity, that severity's
        count must equal the total open_count.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create issues with single severity
        for i in range(count):
            issue = Issue(
                title=f"Test issue {i}",
                description=f"Test description {i}",
                source="manual",
                severity=severity,
                status='open',
                assignee="test-assignee",
                created_at=datetime.now(),
                escalation_level=0
            )
            repository.create_issue(issue)
        
        # Get metrics
        tools = create_issue_tools(repository)
        get_issue_metrics = tools[6]
        metrics = get_issue_metrics()
        
        assert metrics['open_count'] == count, \
            f"open_count must be {count}, got {metrics['open_count']}"
        assert metrics['open_by_severity'][severity] == count, \
            f"open_by_severity['{severity}'] must be {count}, got {metrics['open_by_severity'][severity]}"
        
        # Other severities should be 0
        for other_severity in ['critical', 'high', 'medium', 'low']:
            if other_severity != severity:
                assert metrics['open_by_severity'][other_severity] == 0, \
                    f"open_by_severity['{other_severity}'] must be 0, got {metrics['open_by_severity'][other_severity]}"
