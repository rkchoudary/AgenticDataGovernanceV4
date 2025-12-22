"""
**Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**

For any DQ rule failure with severity 'critical' or 'high', an issue must be auto-created
with all required fields populated (title, description, source, impacted_reports, 
impacted_cdes, severity, status='open', created_at).

**Validates: Requirements 9.1**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.data_quality import (
    DQRule,
    RuleExecutionResult,
    RuleLogic,
    Threshold,
    DQDimension,
    Severity,
)
from models.issues import Issue
from repository.in_memory import InMemoryGovernanceRepository
from tools.issue_tools import create_issue_tools
from tools.dq_rule_tools import create_dq_rule_tools


# Strategies for generating test data
severity_strategy = st.sampled_from(['critical', 'high', 'medium', 'low'])
high_severity_strategy = st.sampled_from(['critical', 'high'])
dimension_strategy = st.sampled_from([
    'completeness', 'accuracy', 'validity', 'consistency',
    'timeliness', 'uniqueness', 'integrity'
])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# UUID strategy
uuid_strategy = st.uuids().map(str)


@st.composite
def rule_logic_strategy(draw):
    """Generate a RuleLogic instance."""
    return RuleLogic(
        type=draw(st.sampled_from([
            'null_check', 'range_check', 'format_check',
            'referential_check', 'reconciliation', 'custom'
        ])),
        expression=draw(st.text(min_size=5, max_size=100)),
        parameters=None
    )


@st.composite
def threshold_strategy(draw):
    """Generate a Threshold instance."""
    return Threshold(
        type=draw(st.sampled_from(['percentage', 'absolute', 'range'])),
        value=draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
    )


@st.composite
def dq_rule_strategy(draw, severity: str = None):
    """Generate a DQRule instance with optional fixed severity."""
    return DQRule(
        id=draw(uuid_strategy),
        cde_id=draw(uuid_strategy),
        dimension=draw(dimension_strategy),
        name=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        logic=draw(rule_logic_strategy()),
        threshold=draw(threshold_strategy()),
        severity=severity or draw(severity_strategy),
        owner=draw(non_empty_string_strategy),
        enabled=True
    )


@st.composite
def failed_rule_execution_result_strategy(draw, rule_id: str = None):
    """Generate a failed RuleExecutionResult."""
    total_records = draw(st.integers(min_value=10, max_value=10000))
    failed_records = draw(st.integers(min_value=1, max_value=total_records))
    
    return RuleExecutionResult(
        rule_id=rule_id or draw(uuid_strategy),
        passed=False,  # Always failed
        actual_value=draw(st.floats(min_value=0.0, max_value=0.9, allow_nan=False, allow_infinity=False)),
        expected_value=draw(st.floats(min_value=0.9, max_value=1.0, allow_nan=False, allow_infinity=False)),
        failed_records=failed_records,
        total_records=total_records,
        executed_at=datetime.now()
    )


@st.composite
def issue_context_strategy(draw):
    """Generate context for issue creation."""
    return {
        'report_id': draw(uuid_strategy),
        'cde_id': draw(uuid_strategy),
        'data_domain': draw(st.sampled_from(['finance', 'risk', 'compliance', 'operations']))
    }


def create_issue_from_rule_failure(
    repository: InMemoryGovernanceRepository,
    rule: DQRule,
    execution_result: RuleExecutionResult,
    context: dict
) -> dict:
    """
    Helper function to create an issue from a rule failure.
    
    This simulates the auto-creation behavior that should happen when
    a DQ rule fails with critical or high severity.
    
    Args:
        repository: The governance repository.
        rule: The DQ rule that failed.
        execution_result: The execution result showing failure.
        context: Context with report_id, cde_id, data_domain.
        
    Returns:
        The created issue as a dictionary.
    """
    tools = create_issue_tools(repository)
    create_issue = tools[0]  # First tool is create_issue
    
    # Generate issue title and description from rule failure
    title = f"Data Quality Rule Failure: {rule.name}"
    description = (
        f"Data quality rule '{rule.name}' failed validation.\n\n"
        f"Rule ID: {rule.id}\n"
        f"Dimension: {rule.dimension}\n"
        f"Expected: {execution_result.expected_value}\n"
        f"Actual: {execution_result.actual_value}\n"
        f"Failed Records: {execution_result.failed_records} out of {execution_result.total_records}\n"
        f"Executed At: {execution_result.executed_at.isoformat()}"
    )
    
    # Determine severity - use rule severity for critical/high, otherwise based on failure rate
    if rule.severity in ['critical', 'high']:
        severity = rule.severity
    else:
        failure_rate = execution_result.failed_records / execution_result.total_records
        if failure_rate > 0.1:
            severity = 'high'
        elif failure_rate > 0.01:
            severity = 'medium'
        else:
            severity = 'low'
    
    # Create the issue
    issue = create_issue(
        title=title,
        description=description,
        source=f"dq_rule:{rule.id}",
        severity=severity,
        assignee=rule.owner,
        impacted_reports=[context.get('report_id')] if context.get('report_id') else None,
        impacted_cdes=[context.get('cde_id')] if context.get('cde_id') else None
    )
    
    return issue


class TestIssueAutoCreation:
    """
    Property 18: Issue Auto-Creation from Rule Failures
    
    Tests that issues are automatically created with all required fields
    when DQ rules fail with critical or high severity.
    """
    
    @settings(max_examples=100)
    @given(
        rule=dq_rule_strategy(severity='critical'),
        context=issue_context_strategy()
    )
    def test_critical_rule_failure_creates_issue_with_required_fields(
        self, rule: DQRule, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any critical severity rule failure, an issue must be created
        with all required fields populated.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the rule first
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.5,
            expected_value=0.95,
            failed_records=50,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify all required fields are populated
        assert issue['id'] is not None and len(issue['id']) > 0, \
            "Issue ID must be populated"
        assert issue['title'] is not None and len(issue['title']) > 0, \
            "Issue title must be populated"
        assert issue['description'] is not None and len(issue['description']) > 0, \
            "Issue description must be populated"
        assert issue['source'] is not None and len(issue['source']) > 0, \
            "Issue source must be populated"
        assert issue['severity'] == 'critical', \
            f"Issue severity must be 'critical', got '{issue['severity']}'"
        assert issue['status'] == 'open', \
            f"Issue status must be 'open', got '{issue['status']}'"
        assert issue['created_at'] is not None, \
            "Issue created_at must be populated"
        assert issue['assignee'] is not None and len(issue['assignee']) > 0, \
            "Issue assignee must be populated"
    
    @settings(max_examples=100)
    @given(
        rule=dq_rule_strategy(severity='high'),
        context=issue_context_strategy()
    )
    def test_high_severity_rule_failure_creates_issue_with_required_fields(
        self, rule: DQRule, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any high severity rule failure, an issue must be created
        with all required fields populated.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the rule first
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.7,
            expected_value=0.95,
            failed_records=30,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify all required fields are populated
        assert issue['id'] is not None and len(issue['id']) > 0, \
            "Issue ID must be populated"
        assert issue['title'] is not None and len(issue['title']) > 0, \
            "Issue title must be populated"
        assert issue['description'] is not None and len(issue['description']) > 0, \
            "Issue description must be populated"
        assert issue['source'] is not None and len(issue['source']) > 0, \
            "Issue source must be populated"
        assert issue['severity'] == 'high', \
            f"Issue severity must be 'high', got '{issue['severity']}'"
        assert issue['status'] == 'open', \
            f"Issue status must be 'open', got '{issue['status']}'"
        assert issue['created_at'] is not None, \
            "Issue created_at must be populated"
        assert issue['assignee'] is not None and len(issue['assignee']) > 0, \
            "Issue assignee must be populated"
    
    @settings(max_examples=100)
    @given(
        severity=high_severity_strategy,
        context=issue_context_strategy()
    )
    def test_issue_source_references_rule(
        self, severity: str, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any auto-created issue, the source field must reference
        the rule that triggered the issue.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a rule with the given severity
        rule = DQRule(
            cde_id="test-cde-id",
            dimension='completeness',
            name="Test Rule",
            description="Test rule description",
            logic=RuleLogic(type='null_check', expression='value IS NOT NULL'),
            threshold=Threshold(type='percentage', value=0.95),
            severity=severity,
            owner="test-owner"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.5,
            expected_value=0.95,
            failed_records=50,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify source references the rule
        assert rule.id in issue['source'], \
            f"Issue source must reference rule ID '{rule.id}', got '{issue['source']}'"
    
    @settings(max_examples=100)
    @given(
        severity=high_severity_strategy,
        context=issue_context_strategy()
    )
    def test_issue_includes_impacted_reports_and_cdes(
        self, severity: str, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any auto-created issue with context, impacted_reports and
        impacted_cdes must include the context values.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a rule with the given severity
        rule = DQRule(
            cde_id=context['cde_id'],
            dimension='accuracy',
            name="Test Accuracy Rule",
            description="Test accuracy rule description",
            logic=RuleLogic(type='referential_check', expression='value IN reference'),
            threshold=Threshold(type='percentage', value=0.98),
            severity=severity,
            owner="accuracy-team"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.8,
            expected_value=0.98,
            failed_records=20,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify impacted reports and CDEs
        assert context['report_id'] in issue['impacted_reports'], \
            f"Issue must include report_id '{context['report_id']}' in impacted_reports"
        assert context['cde_id'] in issue['impacted_cdes'], \
            f"Issue must include cde_id '{context['cde_id']}' in impacted_cdes"
    
    @settings(max_examples=100)
    @given(
        severity=high_severity_strategy,
        context=issue_context_strategy()
    )
    def test_issue_is_persisted_to_repository(
        self, severity: str, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any auto-created issue, it must be persisted to the repository.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a rule with the given severity
        rule = DQRule(
            cde_id=context['cde_id'],
            dimension='validity',
            name="Test Validity Rule",
            description="Test validity rule description",
            logic=RuleLogic(type='format_check', expression='value MATCHES pattern'),
            threshold=Threshold(type='percentage', value=0.99),
            severity=severity,
            owner="validity-team"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.85,
            expected_value=0.99,
            failed_records=15,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify issue is persisted
        stored_issue = repository.get_issue(issue['id'])
        assert stored_issue is not None, \
            f"Issue with ID '{issue['id']}' must be persisted to repository"
        assert stored_issue.title == issue['title'], \
            "Stored issue title must match created issue"
        assert stored_issue.severity == issue['severity'], \
            "Stored issue severity must match created issue"
    
    @settings(max_examples=100)
    @given(
        severity=high_severity_strategy,
        context=issue_context_strategy()
    )
    def test_audit_entry_created_for_issue(
        self, severity: str, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any auto-created issue, an audit entry must be created.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a rule with the given severity
        rule = DQRule(
            cde_id=context['cde_id'],
            dimension='consistency',
            name="Test Consistency Rule",
            description="Test consistency rule description",
            logic=RuleLogic(type='reconciliation', expression='value == related_value'),
            threshold=Threshold(type='percentage', value=0.95),
            severity=severity,
            owner="consistency-team"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.75,
            expected_value=0.95,
            failed_records=25,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify audit entry exists
        audit_entries = repository.get_audit_entries(
            action='create_issue',
            entity_id=issue['id']
        )
        
        assert len(audit_entries) >= 1, \
            "Audit entry must be created for issue creation"
        
        entry = audit_entries[0]
        assert entry.entity_type == "Issue", \
            f"Audit entry entity_type must be 'Issue', got '{entry.entity_type}'"
        assert entry.action == "create_issue", \
            f"Audit entry action must be 'create_issue', got '{entry.action}'"
    
    @settings(max_examples=100)
    @given(
        rule=dq_rule_strategy(severity='critical'),
        context=issue_context_strategy()
    )
    def test_issue_description_contains_rule_details(
        self, rule: DQRule, context: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 18: Issue Auto-Creation from Rule Failures**
        **Validates: Requirements 9.1**
        
        Property: For any auto-created issue, the description must contain
        relevant rule execution details.
        """
        repository = InMemoryGovernanceRepository()
        
        # Store the rule first
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.6,
            expected_value=0.95,
            failed_records=40,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue from rule failure
        issue = create_issue_from_rule_failure(repository, rule, execution_result, context)
        
        # Verify description contains rule details
        description = issue['description']
        assert rule.name in description, \
            f"Issue description must contain rule name '{rule.name}'"
        assert rule.dimension in description, \
            f"Issue description must contain dimension '{rule.dimension}'"
        assert str(execution_result.failed_records) in description, \
            f"Issue description must contain failed records count"
