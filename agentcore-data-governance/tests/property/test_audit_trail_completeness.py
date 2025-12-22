"""
**Feature: agentcore-python-refactor, Property 2: Audit Trail Completeness**

For any state-changing action in the system, an audit entry must be created
containing timestamp, actor, actor_type, action, entity_type, entity_id, and outcome.

**Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.regulatory import ReportCatalog, RegulatoryReport
from models.audit import AuditEntry, ActorType
from repository.in_memory import InMemoryGovernanceRepository
from tools.regulatory_tools import create_regulatory_tools
from tests.strategies.regulatory_strategies import (
    regulatory_report_strategy,
    report_catalog_strategy,
    non_empty_string_strategy,
)


# Required fields for audit entries per Property 2
REQUIRED_AUDIT_FIELDS = ['timestamp', 'actor', 'actor_type', 'action', 'entity_type', 'entity_id']
VALID_ACTOR_TYPES: list[ActorType] = ['agent', 'human', 'system']


def verify_audit_entry_completeness(entry: AuditEntry) -> tuple[bool, list[str]]:
    """
    Verify that an audit entry contains all required fields.
    
    Args:
        entry: The audit entry to verify
        
    Returns:
        Tuple of (is_complete, list of missing/invalid fields)
    """
    issues = []
    
    # Check timestamp
    if entry.timestamp is None:
        issues.append("timestamp is None")
    elif not isinstance(entry.timestamp, datetime):
        issues.append(f"timestamp is not a datetime: {type(entry.timestamp)}")
    
    # Check actor
    if entry.actor is None:
        issues.append("actor is None")
    elif not isinstance(entry.actor, str) or len(entry.actor) == 0:
        issues.append(f"actor is empty or not a string: {entry.actor}")
    
    # Check actor_type
    if entry.actor_type is None:
        issues.append("actor_type is None")
    elif entry.actor_type not in VALID_ACTOR_TYPES:
        issues.append(f"actor_type is invalid: {entry.actor_type}")
    
    # Check action
    if entry.action is None:
        issues.append("action is None")
    elif not isinstance(entry.action, str) or len(entry.action) == 0:
        issues.append(f"action is empty or not a string: {entry.action}")
    
    # Check entity_type
    if entry.entity_type is None:
        issues.append("entity_type is None")
    elif not isinstance(entry.entity_type, str) or len(entry.entity_type) == 0:
        issues.append(f"entity_type is empty or not a string: {entry.entity_type}")
    
    # Check entity_id
    if entry.entity_id is None:
        issues.append("entity_id is None")
    elif not isinstance(entry.entity_id, str) or len(entry.entity_id) == 0:
        issues.append(f"entity_id is empty or not a string: {entry.entity_id}")
    
    return (len(issues) == 0, issues)


class TestAuditTrailCompleteness:
    """
    Property 2: Audit Trail Completeness
    
    Tests that all state-changing actions create audit entries with required fields.
    """
    
    @settings(max_examples=100)
    @given(jurisdictions=st.lists(st.sampled_from(['US', 'CA']), min_size=1, max_size=2, unique=True))
    def test_scan_regulatory_sources_creates_audit_entry(self, jurisdictions: list[str]):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: scan_regulatory_sources action creates a complete audit entry.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        scan_regulatory_sources = tools[0]
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries()
        initial_count = len(initial_entries)
        
        # Perform the state-changing action
        scan_regulatory_sources(jurisdictions)
        
        # Verify audit entry was created
        entries = repository.get_audit_entries()
        assert len(entries) > initial_count, \
            f"No audit entry created for scan_regulatory_sources action"
        
        # Get the new entry (most recent)
        new_entry = entries[0]  # Entries are sorted by timestamp descending
        
        # Verify all required fields are present and valid
        is_complete, issues = verify_audit_entry_completeness(new_entry)
        assert is_complete, \
            f"Audit entry missing required fields: {issues}"
        
        # Verify action is correctly recorded
        assert new_entry.action == "scan_regulatory_sources", \
            f"Expected action 'scan_regulatory_sources', got '{new_entry.action}'"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        submitter=non_empty_string_strategy,
    )
    def test_submit_for_review_creates_audit_entry(
        self, reports: list[RegulatoryReport], submitter: str
    ):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: submit_for_review action creates a complete audit entry.
        """
        assume(len(submitter) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]
        
        # Create initial catalog in draft status
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries()
        initial_count = len(initial_entries)
        
        # Perform the state-changing action
        submit_for_review(submitter)
        
        # Verify audit entry was created
        entries = repository.get_audit_entries()
        assert len(entries) > initial_count, \
            f"No audit entry created for submit_for_review action"
        
        # Get the new entry
        new_entry = entries[0]
        
        # Verify all required fields are present and valid
        is_complete, issues = verify_audit_entry_completeness(new_entry)
        assert is_complete, \
            f"Audit entry missing required fields: {issues}"
        
        # Verify action is correctly recorded
        assert new_entry.action == "submit_for_review", \
            f"Expected action 'submit_for_review', got '{new_entry.action}'"
        
        # Verify actor is the submitter
        assert new_entry.actor == submitter, \
            f"Expected actor '{submitter}', got '{new_entry.actor}'"
        
        # Verify actor_type is human
        assert new_entry.actor_type == "human", \
            f"Expected actor_type 'human', got '{new_entry.actor_type}'"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        submitter=non_empty_string_strategy,
        approver=non_empty_string_strategy,
        rationale=st.text(min_size=20, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))),
    )
    def test_approve_catalog_creates_audit_entry(
        self, reports: list[RegulatoryReport], submitter: str, approver: str, rationale: str
    ):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: approve_catalog action creates a complete audit entry with rationale.
        """
        assume(len(submitter) > 0 and len(approver) > 0)
        assume(submitter != approver)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]
        approve_catalog = tools[4]
        
        # Create initial catalog and submit for review
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        submit_for_review(submitter)
        
        # Get audit count before approval
        entries_before = repository.get_audit_entries()
        count_before = len(entries_before)
        
        # Perform the approval action
        approve_catalog(approver, rationale)
        
        # Verify audit entry was created
        entries = repository.get_audit_entries()
        assert len(entries) > count_before, \
            f"No audit entry created for approve_catalog action"
        
        # Get the new entry
        new_entry = entries[0]
        
        # Verify all required fields are present and valid
        is_complete, issues = verify_audit_entry_completeness(new_entry)
        assert is_complete, \
            f"Audit entry missing required fields: {issues}"
        
        # Verify action is correctly recorded
        assert new_entry.action == "approve_catalog", \
            f"Expected action 'approve_catalog', got '{new_entry.action}'"
        
        # Verify actor is the approver
        assert new_entry.actor == approver, \
            f"Expected actor '{approver}', got '{new_entry.actor}'"
        
        # Verify rationale is recorded
        assert new_entry.rationale == rationale, \
            f"Expected rationale to be recorded"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        modifier=non_empty_string_strategy,
    )
    def test_modify_catalog_creates_audit_entry(
        self, reports: list[RegulatoryReport], modifier: str
    ):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: modify_catalog action creates a complete audit entry.
        """
        assume(len(modifier) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        modify_catalog = tools[6]
        
        # Create initial catalog
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Get audit count before modification
        entries_before = repository.get_audit_entries()
        count_before = len(entries_before)
        
        # Create new report data
        new_report_data = {
            'name': 'New Test Report',
            'jurisdiction': 'US',
            'regulator': 'SEC',
            'frequency': 'quarterly',
            'due_date': {'days_after_period_end': 30, 'business_days_only': True, 'timezone': 'UTC'},
            'submission_format': 'XML',
            'submission_platform': 'EDGAR',
            'description': 'A new test report for testing modifications',
            'last_updated': datetime.now().isoformat(),
            'responsible_unit': 'Compliance'
        }
        
        # Perform the modification action
        modify_catalog(
            report_id='new-report-id',
            action='add',
            report_data=new_report_data,
            modifier=modifier,
            rationale='Adding new report for testing'
        )
        
        # Verify audit entry was created
        entries = repository.get_audit_entries()
        assert len(entries) > count_before, \
            f"No audit entry created for modify_catalog action"
        
        # Get the new entry
        new_entry = entries[0]
        
        # Verify all required fields are present and valid
        is_complete, issues = verify_audit_entry_completeness(new_entry)
        assert is_complete, \
            f"Audit entry missing required fields: {issues}"
        
        # Verify action contains modify_catalog
        assert "modify_catalog" in new_entry.action, \
            f"Expected action to contain 'modify_catalog', got '{new_entry.action}'"
        
        # Verify actor is the modifier
        assert new_entry.actor == modifier, \
            f"Expected actor '{modifier}', got '{new_entry.actor}'"
    
    @settings(max_examples=100)
    @given(since_days_ago=st.integers(min_value=1, max_value=365))
    def test_detect_changes_creates_audit_entry(self, since_days_ago: int):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: detect_changes action creates a complete audit entry.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        detect_changes = tools[1]
        
        # Calculate since date
        from datetime import timedelta
        since_date = datetime.now() - timedelta(days=since_days_ago)
        since_str = since_date.isoformat()
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries()
        initial_count = len(initial_entries)
        
        # Perform the state-changing action
        detect_changes(since_str)
        
        # Verify audit entry was created
        entries = repository.get_audit_entries()
        assert len(entries) > initial_count, \
            f"No audit entry created for detect_changes action"
        
        # Get the new entry
        new_entry = entries[0]
        
        # Verify all required fields are present and valid
        is_complete, issues = verify_audit_entry_completeness(new_entry)
        assert is_complete, \
            f"Audit entry missing required fields: {issues}"
        
        # Verify action is correctly recorded
        assert new_entry.action == "detect_changes", \
            f"Expected action 'detect_changes', got '{new_entry.action}'"
    
    @settings(max_examples=100)
    @given(changes=st.lists(st.just({}), min_size=0, max_size=3))
    def test_update_report_catalog_creates_audit_entry(self, changes: list[dict]):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: update_report_catalog action creates a complete audit entry.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        update_report_catalog = tools[2]
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries()
        initial_count = len(initial_entries)
        
        # Perform the state-changing action (with empty changes for simplicity)
        update_report_catalog([])
        
        # Verify audit entry was created
        entries = repository.get_audit_entries()
        assert len(entries) > initial_count, \
            f"No audit entry created for update_report_catalog action"
        
        # Get the new entry
        new_entry = entries[0]
        
        # Verify all required fields are present and valid
        is_complete, issues = verify_audit_entry_completeness(new_entry)
        assert is_complete, \
            f"Audit entry missing required fields: {issues}"
        
        # Verify action is correctly recorded
        assert new_entry.action == "update_report_catalog", \
            f"Expected action 'update_report_catalog', got '{new_entry.action}'"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        submitter=non_empty_string_strategy,
        approver=non_empty_string_strategy,
    )
    def test_all_workflow_actions_create_audit_entries(
        self, reports: list[RegulatoryReport], submitter: str, approver: str
    ):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: A complete workflow (submit -> approve) creates audit entries
        for each state-changing action.
        """
        assume(len(submitter) > 0 and len(approver) > 0)
        assume(submitter != approver)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]
        approve_catalog = tools[4]
        
        # Create initial catalog
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Perform workflow
        submit_for_review(submitter)
        approve_catalog(approver, "Approved after thorough review")
        
        # Get all audit entries
        entries = repository.get_audit_entries()
        
        # Should have at least 2 entries (submit + approve)
        assert len(entries) >= 2, \
            f"Expected at least 2 audit entries, got {len(entries)}"
        
        # Verify each entry is complete
        for entry in entries:
            is_complete, issues = verify_audit_entry_completeness(entry)
            assert is_complete, \
                f"Audit entry for action '{entry.action}' missing required fields: {issues}"
        
        # Verify we have entries for both actions
        actions = [e.action for e in entries]
        assert "submit_for_review" in actions, \
            f"Missing audit entry for submit_for_review action"
        assert "approve_catalog" in actions, \
            f"Missing audit entry for approve_catalog action"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        actor=non_empty_string_strategy,
    )
    def test_audit_entry_captures_state_changes(
        self, reports: list[RegulatoryReport], actor: str
    ):
        """
        **Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
        
        Property: Audit entries capture previous_state and new_state for
        state-changing actions.
        """
        assume(len(actor) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]
        
        # Create initial catalog
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Perform state-changing action
        submit_for_review(actor)
        
        # Get the audit entry
        entries = repository.get_audit_entries(action="submit_for_review")
        assert len(entries) > 0, "No audit entry found for submit_for_review"
        
        entry = entries[0]
        
        # Verify previous_state and new_state are captured
        assert entry.previous_state is not None, \
            "Audit entry should capture previous_state"
        assert entry.new_state is not None, \
            "Audit entry should capture new_state"
        
        # Verify state change is reflected
        if isinstance(entry.previous_state, dict) and isinstance(entry.new_state, dict):
            assert entry.previous_state.get('status') == 'draft', \
                f"Expected previous status 'draft', got '{entry.previous_state.get('status')}'"
            assert entry.new_state.get('status') == 'pending_review', \
                f"Expected new status 'pending_review', got '{entry.new_state.get('status')}'"
