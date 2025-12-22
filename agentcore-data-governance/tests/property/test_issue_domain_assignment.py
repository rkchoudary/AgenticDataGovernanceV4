"""
**Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**

For any auto-created issue, the assignee must be set to the data owner of the 
primary impacted CDE, or to the domain steward if no CDE owner is defined.

**Validates: Requirements 9.2**
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
)
from models.cde import CDE, CDEInventory, CDEScoringFactors
from models.issues import Issue
from repository.in_memory import InMemoryGovernanceRepository
from tools.issue_tools import create_issue_tools


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

# Domain strategy
domain_strategy = st.sampled_from(['finance', 'risk', 'compliance', 'operations', 'trading', 'treasury'])


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
def cde_with_owner_strategy(draw):
    """Generate a CDE with a defined data owner."""
    return CDE(
        id=draw(uuid_strategy),
        element_id=draw(uuid_strategy),
        name=draw(non_empty_string_strategy),
        business_definition=draw(st.text(min_size=10, max_size=200)),
        criticality_rationale=draw(st.text(min_size=10, max_size=200)),
        data_owner=draw(non_empty_string_strategy),
        data_owner_email=draw(st.emails()),
        status='approved'
    )


@st.composite
def cde_without_owner_strategy(draw):
    """Generate a CDE without a data owner."""
    return CDE(
        id=draw(uuid_strategy),
        element_id=draw(uuid_strategy),
        name=draw(non_empty_string_strategy),
        business_definition=draw(st.text(min_size=10, max_size=200)),
        criticality_rationale=draw(st.text(min_size=10, max_size=200)),
        data_owner=None,  # No owner defined
        data_owner_email=None,
        status='approved'
    )


@st.composite
def dq_rule_for_cde_strategy(draw, cde_id: str, severity: str = None):
    """Generate a DQRule for a specific CDE."""
    return DQRule(
        id=draw(uuid_strategy),
        cde_id=cde_id,
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
def issue_context_with_domain_strategy(draw):
    """Generate context for issue creation with domain information."""
    return {
        'report_id': draw(uuid_strategy),
        'cde_id': draw(uuid_strategy),
        'data_domain': draw(domain_strategy)
    }


def get_domain_steward(data_domain: str) -> str:
    """
    Get the domain steward for a given data domain.
    
    In a real system, this would look up the steward from a configuration
    or directory service. For testing, we use a deterministic mapping.
    
    Args:
        data_domain: The data domain name.
        
    Returns:
        The domain steward identifier.
    """
    domain_stewards = {
        'finance': 'finance-steward@company.com',
        'risk': 'risk-steward@company.com',
        'compliance': 'compliance-steward@company.com',
        'operations': 'operations-steward@company.com',
        'trading': 'trading-steward@company.com',
        'treasury': 'treasury-steward@company.com',
    }
    return domain_stewards.get(data_domain, 'default-steward@company.com')


def create_issue_with_domain_assignment(
    repository: InMemoryGovernanceRepository,
    rule: DQRule,
    execution_result: RuleExecutionResult,
    cde: CDE,
    data_domain: str,
    report_id: str
) -> dict:
    """
    Create an issue from a rule failure with domain-based assignment.
    
    This implements the domain-based assignment logic:
    - If CDE has an owner, assign to CDE owner
    - If CDE has no owner, assign to domain steward
    
    Args:
        repository: The governance repository.
        rule: The DQ rule that failed.
        execution_result: The execution result showing failure.
        cde: The CDE associated with the rule.
        data_domain: The data domain for fallback assignment.
        report_id: The report ID for context.
        
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
        f"CDE: {cde.name}\n"
        f"Dimension: {rule.dimension}\n"
        f"Expected: {execution_result.expected_value}\n"
        f"Actual: {execution_result.actual_value}\n"
        f"Failed Records: {execution_result.failed_records} out of {execution_result.total_records}"
    )
    
    # Domain-based assignment logic:
    # 1. If CDE has an owner, assign to CDE owner
    # 2. If CDE has no owner, assign to domain steward
    if cde.data_owner:
        assignee = cde.data_owner
    else:
        assignee = get_domain_steward(data_domain)
    
    # Create the issue
    issue = create_issue(
        title=title,
        description=description,
        source=f"dq_rule:{rule.id}",
        severity=rule.severity,
        assignee=assignee,
        impacted_reports=[report_id],
        impacted_cdes=[cde.id]
    )
    
    return issue


class TestIssueDomainBasedAssignment:
    """
    Property 19: Issue Domain-Based Assignment
    
    Tests that auto-created issues are assigned to the CDE owner if defined,
    or to the domain steward if no CDE owner is defined.
    """
    
    @settings(max_examples=100)
    @given(
        cde=cde_with_owner_strategy(),
        severity=high_severity_strategy,
        data_domain=domain_strategy,
        report_id=uuid_strategy
    )
    def test_issue_assigned_to_cde_owner_when_owner_defined(
        self, cde: CDE, severity: str, data_domain: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any auto-created issue where the CDE has an owner,
        the assignee must be set to the CDE owner.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a CDE inventory with the CDE
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for the CDE
        rule = DQRule(
            cde_id=cde.id,
            dimension='completeness',
            name="Test Rule",
            description="Test rule description",
            logic=RuleLogic(type='null_check', expression='value IS NOT NULL'),
            threshold=Threshold(type='percentage', value=0.95),
            severity=severity,
            owner="rule-owner"
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
        
        # Create issue with domain-based assignment
        issue = create_issue_with_domain_assignment(
            repository, rule, execution_result, cde, data_domain, report_id
        )
        
        # Verify assignee is the CDE owner
        assert issue['assignee'] == cde.data_owner, \
            f"Issue assignee must be CDE owner '{cde.data_owner}', got '{issue['assignee']}'"
    
    @settings(max_examples=100)
    @given(
        cde=cde_without_owner_strategy(),
        severity=high_severity_strategy,
        data_domain=domain_strategy,
        report_id=uuid_strategy
    )
    def test_issue_assigned_to_domain_steward_when_no_cde_owner(
        self, cde: CDE, severity: str, data_domain: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any auto-created issue where the CDE has no owner,
        the assignee must be set to the domain steward.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a CDE inventory with the CDE (no owner)
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for the CDE
        rule = DQRule(
            cde_id=cde.id,
            dimension='accuracy',
            name="Test Accuracy Rule",
            description="Test accuracy rule description",
            logic=RuleLogic(type='referential_check', expression='value IN reference'),
            threshold=Threshold(type='percentage', value=0.98),
            severity=severity,
            owner="rule-owner"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.7,
            expected_value=0.98,
            failed_records=30,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue with domain-based assignment
        issue = create_issue_with_domain_assignment(
            repository, rule, execution_result, cde, data_domain, report_id
        )
        
        # Verify assignee is the domain steward
        expected_steward = get_domain_steward(data_domain)
        assert issue['assignee'] == expected_steward, \
            f"Issue assignee must be domain steward '{expected_steward}', got '{issue['assignee']}'"
    
    @settings(max_examples=100)
    @given(
        cde=cde_with_owner_strategy(),
        severity=severity_strategy,
        data_domain=domain_strategy,
        report_id=uuid_strategy
    )
    def test_assignee_is_never_empty_with_cde_owner(
        self, cde: CDE, severity: str, data_domain: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any auto-created issue, the assignee must never be empty
        when the CDE has an owner.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a CDE inventory with the CDE
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for the CDE
        rule = DQRule(
            cde_id=cde.id,
            dimension='validity',
            name="Test Validity Rule",
            description="Test validity rule description",
            logic=RuleLogic(type='format_check', expression='value MATCHES pattern'),
            threshold=Threshold(type='percentage', value=0.99),
            severity=severity,
            owner="rule-owner"
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
        
        # Create issue with domain-based assignment
        issue = create_issue_with_domain_assignment(
            repository, rule, execution_result, cde, data_domain, report_id
        )
        
        # Verify assignee is not empty
        assert issue['assignee'] is not None and len(issue['assignee']) > 0, \
            "Issue assignee must not be empty"
    
    @settings(max_examples=100)
    @given(
        cde=cde_without_owner_strategy(),
        severity=severity_strategy,
        data_domain=domain_strategy,
        report_id=uuid_strategy
    )
    def test_assignee_is_never_empty_without_cde_owner(
        self, cde: CDE, severity: str, data_domain: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any auto-created issue, the assignee must never be empty
        even when the CDE has no owner (falls back to domain steward).
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a CDE inventory with the CDE (no owner)
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for the CDE
        rule = DQRule(
            cde_id=cde.id,
            dimension='consistency',
            name="Test Consistency Rule",
            description="Test consistency rule description",
            logic=RuleLogic(type='reconciliation', expression='value == related_value'),
            threshold=Threshold(type='percentage', value=0.95),
            severity=severity,
            owner="rule-owner"
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
        
        # Create issue with domain-based assignment
        issue = create_issue_with_domain_assignment(
            repository, rule, execution_result, cde, data_domain, report_id
        )
        
        # Verify assignee is not empty
        assert issue['assignee'] is not None and len(issue['assignee']) > 0, \
            "Issue assignee must not be empty (should fall back to domain steward)"
    
    @settings(max_examples=100)
    @given(
        cde=cde_with_owner_strategy(),
        severity=high_severity_strategy,
        data_domain=domain_strategy,
        report_id=uuid_strategy
    )
    def test_cde_owner_takes_precedence_over_domain_steward(
        self, cde: CDE, severity: str, data_domain: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any auto-created issue, if the CDE has an owner,
        the CDE owner takes precedence over the domain steward.
        """
        repository = InMemoryGovernanceRepository()
        
        # Ensure CDE owner is different from domain steward
        domain_steward = get_domain_steward(data_domain)
        assume(cde.data_owner != domain_steward)
        
        # Create a CDE inventory with the CDE
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for the CDE
        rule = DQRule(
            cde_id=cde.id,
            dimension='timeliness',
            name="Test Timeliness Rule",
            description="Test timeliness rule description",
            logic=RuleLogic(type='custom', expression='timestamp < threshold'),
            threshold=Threshold(type='absolute', value=24.0),
            severity=severity,
            owner="rule-owner"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=48.0,
            expected_value=24.0,
            failed_records=10,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue with domain-based assignment
        issue = create_issue_with_domain_assignment(
            repository, rule, execution_result, cde, data_domain, report_id
        )
        
        # Verify CDE owner takes precedence
        assert issue['assignee'] == cde.data_owner, \
            f"CDE owner '{cde.data_owner}' must take precedence over domain steward '{domain_steward}'"
        assert issue['assignee'] != domain_steward, \
            "Issue should not be assigned to domain steward when CDE has an owner"
    
    @settings(max_examples=100)
    @given(
        cde=cde_without_owner_strategy(),
        severity=high_severity_strategy,
        report_id=uuid_strategy
    )
    def test_all_domains_have_valid_steward(
        self, cde: CDE, severity: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any data domain, there must be a valid domain steward
        to fall back to when CDE has no owner.
        """
        repository = InMemoryGovernanceRepository()
        
        # Test all known domains
        domains = ['finance', 'risk', 'compliance', 'operations', 'trading', 'treasury']
        
        for data_domain in domains:
            # Create a CDE inventory with the CDE (no owner)
            inventory = CDEInventory(
                report_id=report_id,
                cdes=[cde],
                version=1,
                status='approved',
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            repository.set_cde_inventory(report_id, inventory)
            
            # Create a rule for the CDE
            rule = DQRule(
                cde_id=cde.id,
                dimension='uniqueness',
                name=f"Test Rule for {data_domain}",
                description="Test rule description",
                logic=RuleLogic(type='custom', expression='COUNT(DISTINCT value) == COUNT(value)'),
                threshold=Threshold(type='percentage', value=1.0),
                severity=severity,
                owner="rule-owner"
            )
            repository.add_dq_rule(rule)
            
            # Create a failed execution result
            execution_result = RuleExecutionResult(
                rule_id=rule.id,
                passed=False,
                actual_value=0.95,
                expected_value=1.0,
                failed_records=5,
                total_records=100,
                executed_at=datetime.now()
            )
            
            # Create issue with domain-based assignment
            issue = create_issue_with_domain_assignment(
                repository, rule, execution_result, cde, data_domain, report_id
            )
            
            # Verify domain steward is valid
            expected_steward = get_domain_steward(data_domain)
            assert issue['assignee'] == expected_steward, \
                f"Domain '{data_domain}' must have valid steward '{expected_steward}'"
            assert '@' in issue['assignee'], \
                f"Domain steward must be a valid email address, got '{issue['assignee']}'"
    
    @settings(max_examples=100)
    @given(
        cde=cde_with_owner_strategy(),
        severity=high_severity_strategy,
        data_domain=domain_strategy,
        report_id=uuid_strategy
    )
    def test_issue_persisted_with_correct_assignee(
        self, cde: CDE, severity: str, data_domain: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 19: Issue Domain-Based Assignment**
        **Validates: Requirements 9.2**
        
        Property: For any auto-created issue, the persisted issue must have
        the correct assignee based on domain assignment rules.
        """
        repository = InMemoryGovernanceRepository()
        
        # Create a CDE inventory with the CDE
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for the CDE
        rule = DQRule(
            cde_id=cde.id,
            dimension='integrity',
            name="Test Integrity Rule",
            description="Test integrity rule description",
            logic=RuleLogic(type='referential_check', expression='FK EXISTS IN parent'),
            threshold=Threshold(type='percentage', value=1.0),
            severity=severity,
            owner="rule-owner"
        )
        repository.add_dq_rule(rule)
        
        # Create a failed execution result
        execution_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=0.98,
            expected_value=1.0,
            failed_records=2,
            total_records=100,
            executed_at=datetime.now()
        )
        
        # Create issue with domain-based assignment
        issue = create_issue_with_domain_assignment(
            repository, rule, execution_result, cde, data_domain, report_id
        )
        
        # Verify persisted issue has correct assignee
        stored_issue = repository.get_issue(issue['id'])
        assert stored_issue is not None, \
            f"Issue with ID '{issue['id']}' must be persisted"
        assert stored_issue.assignee == cde.data_owner, \
            f"Persisted issue assignee must be CDE owner '{cde.data_owner}', got '{stored_issue.assignee}'"
