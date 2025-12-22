"""
**Feature: agentcore-python-refactor, Property: Tenant Data Isolation**

For any two distinct tenants, data stored by one tenant must not be accessible
by the other tenant. This ensures complete tenant isolation in the multi-tenant
SaaS architecture.

**Validates: Requirements 20.3, 20.4**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st
from uuid import uuid4

from models.regulatory import ReportCatalog, RegulatoryReport, DueDateRule
from models.issues import Issue
from models.cde import CDEInventory, CDE, CDEScore
from models.data_quality import DQRule, RuleLogic, Threshold
from models.audit import AuditEntry
from repository.tenant_aware import TenantAwareRepository
from services.tenant_context import (
    TenantContextManager,
    set_current_tenant_id,
    clear_tenant_context,
)


# Strategies for generating test data
tenant_id_strategy = st.text(
    min_size=5,
    max_size=30,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)

non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)


@st.composite
def due_date_rule_strategy(draw):
    """Generate a DueDateRule."""
    return DueDateRule(
        days_after_period_end=draw(st.integers(min_value=1, max_value=90)),
        business_days_only=draw(st.booleans()),
        timezone=draw(st.sampled_from(['UTC', 'America/New_York', 'America/Toronto']))
    )


@st.composite
def regulatory_report_strategy(draw):
    """Generate a RegulatoryReport."""
    return RegulatoryReport(
        id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        jurisdiction=draw(st.sampled_from(['US', 'CA'])),
        regulator=draw(st.sampled_from(['OSFI', 'Federal Reserve', 'OCC', 'FDIC'])),
        frequency=draw(st.sampled_from(['daily', 'weekly', 'monthly', 'quarterly', 'annual'])),
        due_date=draw(due_date_rule_strategy()),
        submission_format=draw(st.sampled_from(['XML', 'XBRL', 'CSV', 'PDF'])),
        submission_platform=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        last_updated=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        responsible_unit=draw(non_empty_string_strategy)
    )


@st.composite
def report_catalog_strategy(draw):
    """Generate a ReportCatalog."""
    return ReportCatalog(
        reports=draw(st.lists(regulatory_report_strategy(), min_size=1, max_size=5)),
        version=draw(st.integers(min_value=1, max_value=100)),
        last_scanned=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        status=draw(st.sampled_from(['draft', 'pending_review', 'approved']))
    )


@st.composite
def issue_strategy(draw):
    """Generate an Issue."""
    return Issue(
        id=draw(st.uuids().map(str)),
        title=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        source=draw(st.sampled_from(['dq_rule_failure', 'manual_report', 'reconciliation', 'audit'])),
        impacted_reports=draw(st.lists(st.uuids().map(str), min_size=0, max_size=3)),
        impacted_cdes=draw(st.lists(st.uuids().map(str), min_size=0, max_size=5)),
        severity=draw(st.sampled_from(['critical', 'high', 'medium', 'low'])),
        status=draw(st.sampled_from(['open', 'in_progress', 'pending_verification', 'resolved'])),
        assignee=draw(non_empty_string_strategy),
        created_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@st.composite
def dq_rule_strategy(draw):
    """Generate a DQRule."""
    return DQRule(
        id=draw(st.uuids().map(str)),
        cde_id=draw(st.uuids().map(str)),
        dimension=draw(st.sampled_from([
            'completeness', 'accuracy', 'validity', 
            'consistency', 'timeliness', 'uniqueness', 'integrity'
        ])),
        name=draw(non_empty_string_strategy),
        description=draw(st.text(min_size=10, max_size=200)),
        logic=RuleLogic(
            type=draw(st.sampled_from([
                'null_check', 'range_check', 'format_check',
                'referential_check', 'reconciliation', 'custom'
            ])),
            expression=draw(st.text(min_size=5, max_size=100))
        ),
        threshold=Threshold(
            type=draw(st.sampled_from(['percentage', 'absolute', 'range'])),
            value=draw(st.floats(min_value=0.0, max_value=100.0))
        ),
        severity=draw(st.sampled_from(['critical', 'high', 'medium', 'low'])),
        owner=draw(non_empty_string_strategy),
        enabled=draw(st.booleans())
    )


class TestTenantIsolation:
    """
    Property tests for tenant data isolation.
    
    Validates: Requirements 20.3, 20.4
    """
    
    def setup_method(self):
        """Clear tenant context before each test."""
        clear_tenant_context()
    
    def teardown_method(self):
        """Clear tenant context after each test."""
        clear_tenant_context()
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        catalog=report_catalog_strategy()
    )
    def test_report_catalog_isolation(
        self, tenant_a_id: str, tenant_b_id: str, catalog: ReportCatalog
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Report catalog stored by tenant A is not accessible by tenant B.
        """
        # Ensure tenants are different
        assume(tenant_a_id != tenant_b_id)
        
        # Create a shared repository instance (simulating shared infrastructure)
        repository = TenantAwareRepository()
        
        # Tenant A stores a report catalog
        with TenantContextManager(tenant_a_id):
            repository.set_report_catalog(catalog)
            
            # Verify tenant A can retrieve their catalog
            retrieved_a = repository.get_report_catalog()
            assert retrieved_a is not None, \
                "Tenant A should be able to retrieve their own catalog"
            assert len(retrieved_a.reports) == len(catalog.reports), \
                "Tenant A should see all their reports"
        
        # Tenant B should NOT see tenant A's catalog
        with TenantContextManager(tenant_b_id):
            retrieved_b = repository.get_report_catalog()
            assert retrieved_b is None, \
                f"Tenant B should NOT see tenant A's catalog. Got: {retrieved_b}"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        issues_a=st.lists(issue_strategy(), min_size=1, max_size=5),
        issues_b=st.lists(issue_strategy(), min_size=1, max_size=5)
    )
    def test_issue_isolation(
        self, 
        tenant_a_id: str, 
        tenant_b_id: str, 
        issues_a: list[Issue],
        issues_b: list[Issue]
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Issues created by tenant A are not visible to tenant B and vice versa.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates issues
        with TenantContextManager(tenant_a_id):
            for issue in issues_a:
                repository.create_issue(issue)
            
            # Verify tenant A sees only their issues
            tenant_a_issues = repository.get_issues()
            assert len(tenant_a_issues) == len(issues_a), \
                f"Tenant A should see {len(issues_a)} issues, got {len(tenant_a_issues)}"
        
        # Tenant B creates issues
        with TenantContextManager(tenant_b_id):
            for issue in issues_b:
                repository.create_issue(issue)
            
            # Verify tenant B sees only their issues
            tenant_b_issues = repository.get_issues()
            assert len(tenant_b_issues) == len(issues_b), \
                f"Tenant B should see {len(issues_b)} issues, got {len(tenant_b_issues)}"
        
        # Cross-check: Tenant A still sees only their issues
        with TenantContextManager(tenant_a_id):
            tenant_a_issues_after = repository.get_issues()
            assert len(tenant_a_issues_after) == len(issues_a), \
                f"Tenant A should still see only {len(issues_a)} issues after tenant B created issues"
            
            # Verify none of tenant B's issue IDs are visible
            tenant_a_issue_ids = {i.id for i in tenant_a_issues_after}
            tenant_b_issue_ids = {i.id for i in issues_b}
            overlap = tenant_a_issue_ids & tenant_b_issue_ids
            assert len(overlap) == 0, \
                f"Tenant A should not see any of tenant B's issues. Overlap: {overlap}"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        rules_a=st.lists(dq_rule_strategy(), min_size=1, max_size=5),
        rules_b=st.lists(dq_rule_strategy(), min_size=1, max_size=5)
    )
    def test_dq_rule_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str,
        rules_a: list[DQRule],
        rules_b: list[DQRule]
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: DQ rules created by tenant A are not visible to tenant B.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates DQ rules
        with TenantContextManager(tenant_a_id):
            for rule in rules_a:
                repository.add_dq_rule(rule)
            
            # Verify tenant A sees their rules
            tenant_a_rules = repository.get_dq_rules()
            assert len(tenant_a_rules) == len(rules_a), \
                f"Tenant A should see {len(rules_a)} rules, got {len(tenant_a_rules)}"
        
        # Tenant B creates DQ rules
        with TenantContextManager(tenant_b_id):
            for rule in rules_b:
                repository.add_dq_rule(rule)
            
            # Verify tenant B sees only their rules
            tenant_b_rules = repository.get_dq_rules()
            assert len(tenant_b_rules) == len(rules_b), \
                f"Tenant B should see {len(rules_b)} rules, got {len(tenant_b_rules)}"
        
        # Cross-check: Tenant A still sees only their rules
        with TenantContextManager(tenant_a_id):
            tenant_a_rules_after = repository.get_dq_rules()
            assert len(tenant_a_rules_after) == len(rules_a), \
                f"Tenant A should still see only {len(rules_a)} rules"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        actor=non_empty_string_strategy
    )
    def test_audit_trail_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str,
        actor: str
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Audit entries created by tenant A are not visible to tenant B.
        """
        assume(tenant_a_id != tenant_b_id)
        assume(len(actor.strip()) > 0)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates audit entries
        with TenantContextManager(tenant_a_id):
            entry_a = AuditEntry(
                actor=actor,
                actor_type='human',
                action='test_action_a',
                entity_type='TestEntity',
                entity_id=str(uuid4())
            )
            repository.create_audit_entry(entry_a)
            
            # Verify tenant A sees their audit entry
            tenant_a_entries = repository.get_audit_entries()
            assert len(tenant_a_entries) >= 1, \
                "Tenant A should see at least 1 audit entry"
            assert any(e.action == 'test_action_a' for e in tenant_a_entries), \
                "Tenant A should see their audit entry"
        
        # Tenant B creates audit entries
        with TenantContextManager(tenant_b_id):
            entry_b = AuditEntry(
                actor=actor,
                actor_type='human',
                action='test_action_b',
                entity_type='TestEntity',
                entity_id=str(uuid4())
            )
            repository.create_audit_entry(entry_b)
            
            # Verify tenant B sees only their audit entry
            tenant_b_entries = repository.get_audit_entries()
            assert all(e.action != 'test_action_a' for e in tenant_b_entries), \
                "Tenant B should NOT see tenant A's audit entries"
            assert any(e.action == 'test_action_b' for e in tenant_b_entries), \
                "Tenant B should see their own audit entry"
        
        # Cross-check: Tenant A should not see tenant B's entries
        with TenantContextManager(tenant_a_id):
            tenant_a_entries_after = repository.get_audit_entries()
            assert all(e.action != 'test_action_b' for e in tenant_a_entries_after), \
                "Tenant A should NOT see tenant B's audit entries"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        issue=issue_strategy()
    )
    def test_get_issue_by_id_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str,
        issue: Issue
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Getting an issue by ID only works for the owning tenant.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates an issue
        with TenantContextManager(tenant_a_id):
            created_issue = repository.create_issue(issue)
            issue_id = created_issue.id
            
            # Verify tenant A can retrieve by ID
            retrieved = repository.get_issue(issue_id)
            assert retrieved is not None, \
                "Tenant A should be able to retrieve their issue by ID"
            assert retrieved.id == issue_id, \
                "Retrieved issue should have the correct ID"
        
        # Tenant B should NOT be able to retrieve tenant A's issue by ID
        with TenantContextManager(tenant_b_id):
            retrieved_by_b = repository.get_issue(issue_id)
            assert retrieved_by_b is None, \
                f"Tenant B should NOT be able to retrieve tenant A's issue by ID. Got: {retrieved_by_b}"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        rule=dq_rule_strategy()
    )
    def test_get_dq_rule_by_id_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str,
        rule: DQRule
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Getting a DQ rule by ID only works for the owning tenant.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates a DQ rule
        with TenantContextManager(tenant_a_id):
            repository.add_dq_rule(rule)
            rule_id = rule.id
            
            # Verify tenant A can retrieve by ID
            retrieved = repository.get_dq_rule(rule_id)
            assert retrieved is not None, \
                "Tenant A should be able to retrieve their DQ rule by ID"
            assert retrieved.id == rule_id, \
                "Retrieved rule should have the correct ID"
        
        # Tenant B should NOT be able to retrieve tenant A's rule by ID
        with TenantContextManager(tenant_b_id):
            retrieved_by_b = repository.get_dq_rule(rule_id)
            assert retrieved_by_b is None, \
                f"Tenant B should NOT be able to retrieve tenant A's DQ rule by ID"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        issue=issue_strategy()
    )
    def test_update_issue_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str,
        issue: Issue
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Updating an issue only affects the owning tenant's data.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates an issue
        with TenantContextManager(tenant_a_id):
            created_issue = repository.create_issue(issue)
            original_title = created_issue.title
        
        # Tenant B tries to update the issue (should have no effect)
        with TenantContextManager(tenant_b_id):
            # Create a modified version of the issue
            modified_issue = issue.model_copy()
            modified_issue.title = "MODIFIED_BY_TENANT_B"
            repository.update_issue(modified_issue)
        
        # Verify tenant A's issue is unchanged
        with TenantContextManager(tenant_a_id):
            retrieved = repository.get_issue(issue.id)
            assert retrieved is not None, \
                "Tenant A's issue should still exist"
            assert retrieved.title == original_title, \
                f"Tenant A's issue should be unchanged. Expected '{original_title}', got '{retrieved.title}'"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy,
        issue=issue_strategy()
    )
    def test_delete_issue_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str,
        issue: Issue
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Deleting an issue only affects the owning tenant's data.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Tenant A creates an issue
        with TenantContextManager(tenant_a_id):
            created_issue = repository.create_issue(issue)
            issue_id = created_issue.id
        
        # Tenant B tries to delete the issue (should have no effect)
        with TenantContextManager(tenant_b_id):
            result = repository.delete_issue(issue_id)
            assert result is False, \
                "Tenant B should not be able to delete tenant A's issue"
        
        # Verify tenant A's issue still exists
        with TenantContextManager(tenant_a_id):
            retrieved = repository.get_issue(issue_id)
            assert retrieved is not None, \
                "Tenant A's issue should still exist after tenant B's delete attempt"
    
    @settings(max_examples=100)
    @given(
        tenant_a_id=tenant_id_strategy,
        tenant_b_id=tenant_id_strategy
    )
    def test_clear_tenant_data_isolation(
        self,
        tenant_a_id: str,
        tenant_b_id: str
    ):
        """
        **Validates: Requirements 20.3, 20.4**
        
        Property: Clearing tenant data only affects the specified tenant.
        """
        assume(tenant_a_id != tenant_b_id)
        
        repository = TenantAwareRepository()
        
        # Both tenants create data
        with TenantContextManager(tenant_a_id):
            issue_a = Issue(
                id=str(uuid4()),
                title="Tenant A Issue",
                description="Test issue for tenant A",
                source='manual_report',
                impacted_reports=[],
                impacted_cdes=[],
                severity='medium',
                status='open',
                assignee='user_a',
                created_at=datetime.now()
            )
            repository.create_issue(issue_a)
        
        with TenantContextManager(tenant_b_id):
            issue_b = Issue(
                id=str(uuid4()),
                title="Tenant B Issue",
                description="Test issue for tenant B",
                source='manual_report',
                impacted_reports=[],
                impacted_cdes=[],
                severity='medium',
                status='open',
                assignee='user_b',
                created_at=datetime.now()
            )
            repository.create_issue(issue_b)
        
        # Clear tenant A's data
        with TenantContextManager(tenant_a_id):
            repository.clear_tenant_data()
            
            # Verify tenant A's data is cleared
            tenant_a_issues = repository.get_issues()
            assert len(tenant_a_issues) == 0, \
                "Tenant A's issues should be cleared"
        
        # Verify tenant B's data is unaffected
        with TenantContextManager(tenant_b_id):
            tenant_b_issues = repository.get_issues()
            assert len(tenant_b_issues) == 1, \
                "Tenant B's issues should be unaffected by tenant A's clear"
            assert tenant_b_issues[0].title == "Tenant B Issue", \
                "Tenant B's issue should be intact"
