"""
Hypothesis strategies for Issue models.

Contains test data generators for issue-related Pydantic models.

**Feature: agentcore-python-refactor, Property 18-22: Issue Management**
**Validates: Requirements 9.1, 9.2, 9.4, 9.5, 9.6**
"""

from datetime import datetime, timedelta
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.issues import (
    Issue,
    Resolution,
    IssueContext,
    RootCauseSuggestion,
    RecurringTheme,
    IssueMetrics,
    IssueFilters,
    Severity,
    IssueStatus,
    ResolutionType,
)


# Basic strategies - severity and status enums
severity_strategy = st.sampled_from(['critical', 'high', 'medium', 'low'])
issue_status_strategy = st.sampled_from(['open', 'in_progress', 'pending_verification', 'resolved', 'closed'])
resolution_type_strategy = st.sampled_from(['data_correction', 'process_change', 'system_fix', 'exception_approved'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Data domain strategy for issue assignment
data_domain_strategy = st.sampled_from([
    'finance', 'risk', 'compliance', 'operations',
    'trading', 'treasury', 'credit', 'market_data'
])


@composite
def resolution_strategy(draw, verified: bool = None):
    """
    Generate a Resolution.
    
    Args:
        verified: If True, include verification info. If False, exclude.
                 If None, randomly decide.
    """
    is_verified = verified if verified is not None else draw(st.booleans())
    implemented_at = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2030, 12, 31)
    ))
    
    resolution = Resolution(
        type=draw(resolution_type_strategy),
        description=draw(st.text(
            min_size=10,
            max_size=500,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        implemented_by=draw(non_empty_string_strategy),
        implemented_at=implemented_at
    )
    
    if is_verified:
        resolution.verified_by = draw(non_empty_string_strategy)
        resolution.verified_at = draw(st.datetimes(
            min_value=implemented_at,
            max_value=datetime(2030, 12, 31)
        ))
    
    return resolution


@composite
def issue_strategy(
    draw,
    severity: Severity = None,
    status: IssueStatus = None,
    with_resolution: bool = None,
    escalation_level: int = None
):
    """
    Generate an Issue.
    
    Args:
        severity: Optional specific severity.
        status: Optional specific status.
        with_resolution: If True, include resolution. If False, exclude.
        escalation_level: Optional specific escalation level.
    """
    actual_severity = severity or draw(severity_strategy)
    actual_status = status or draw(issue_status_strategy)
    
    created_at = draw(st.datetimes(
        min_value=datetime(2020, 1, 1),
        max_value=datetime(2025, 12, 31)
    ))
    
    issue = Issue(
        id=draw(st.uuids().map(str)),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(
            min_size=10,
            max_size=500,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        source=draw(st.sampled_from(['dq_rule_failure', 'manual_report', 'reconciliation', 'audit'])),
        impacted_reports=draw(st.lists(st.uuids().map(str), min_size=0, max_size=5)),
        impacted_cdes=draw(st.lists(st.uuids().map(str), min_size=0, max_size=10)),
        severity=actual_severity,
        status=actual_status,
        assignee=draw(non_empty_string_strategy),
        created_at=created_at,
        due_date=draw(st.none() | st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        )),
        root_cause=draw(st.none() | st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        escalation_level=escalation_level if escalation_level is not None else draw(st.integers(min_value=0, max_value=3))
    )
    
    # Add resolution if status indicates it should have one
    has_resolution = with_resolution if with_resolution is not None else (
        actual_status in ['resolved', 'closed']
    )
    if has_resolution:
        issue.resolution = draw(resolution_strategy())
    
    # Add escalation timestamp if escalated
    if issue.escalation_level > 0:
        issue.escalated_at = draw(st.datetimes(
            min_value=created_at,
            max_value=datetime(2030, 12, 31)
        ))
    
    return issue


@composite
def issue_context_strategy(draw):
    """Generate an IssueContext."""
    return IssueContext(
        report_id=draw(st.uuids().map(str)),
        cde_id=draw(st.none() | st.uuids().map(str)),
        rule_id=draw(st.none() | st.uuids().map(str)),
        data_domain=draw(st.none() | data_domain_strategy)
    )


@composite
def root_cause_suggestion_strategy(draw):
    """Generate a RootCauseSuggestion."""
    return RootCauseSuggestion(
        issue_id=draw(st.uuids().map(str)),
        suggested_cause=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        confidence=draw(st.floats(min_value=0.0, max_value=1.0)),
        similar_issue_ids=draw(st.lists(st.uuids().map(str), min_size=0, max_size=5))
    )


@composite
def recurring_theme_strategy(draw):
    """Generate a RecurringTheme."""
    return RecurringTheme(
        theme=draw(non_empty_string_strategy),
        count=draw(st.integers(min_value=1, max_value=100))
    )


@composite
def issue_metrics_strategy(draw):
    """Generate IssueMetrics."""
    open_by_severity = {
        'critical': draw(st.integers(min_value=0, max_value=10)),
        'high': draw(st.integers(min_value=0, max_value=20)),
        'medium': draw(st.integers(min_value=0, max_value=50)),
        'low': draw(st.integers(min_value=0, max_value=100))
    }
    
    return IssueMetrics(
        open_count=sum(open_by_severity.values()),
        open_by_severity=open_by_severity,
        avg_resolution_time=draw(st.floats(min_value=0.0, max_value=720.0)),  # hours
        recurring_themes=draw(st.lists(recurring_theme_strategy(), min_size=0, max_size=10))
    )


@composite
def issue_filters_strategy(draw):
    """Generate IssueFilters."""
    return IssueFilters(
        status=draw(st.none() | st.lists(issue_status_strategy, min_size=1, max_size=3)),
        severity=draw(st.none() | st.lists(severity_strategy, min_size=1, max_size=2)),
        assignee=draw(st.none() | non_empty_string_strategy),
        report_id=draw(st.none() | st.uuids().map(str)),
        cde_id=draw(st.none() | st.uuids().map(str)),
        from_date=draw(st.none() | st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2025, 12, 31)
        )),
        to_date=draw(st.none() | st.datetimes(
            min_value=datetime(2025, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def critical_issue_strategy(draw, escalation_level: int = None):
    """
    Generate a critical severity issue.
    
    Convenience strategy for testing critical issue escalation.
    """
    return draw(issue_strategy(
        severity='critical',
        escalation_level=escalation_level
    ))


@composite
def resolved_issue_strategy(draw, verified: bool = None):
    """
    Generate a resolved issue with resolution.
    
    Args:
        verified: If True, resolution is verified. If False, not verified.
    """
    issue = draw(issue_strategy(status='resolved', with_resolution=True))
    if verified is not None and issue.resolution:
        if verified:
            issue.resolution.verified_by = draw(non_empty_string_strategy)
            issue.resolution.verified_at = draw(st.datetimes(
                min_value=issue.resolution.implemented_at,
                max_value=datetime(2030, 12, 31)
            ))
        else:
            issue.resolution.verified_by = None
            issue.resolution.verified_at = None
    return issue
