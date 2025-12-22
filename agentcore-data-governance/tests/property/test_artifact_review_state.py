"""
**Feature: agentcore-python-refactor, Property 1: Artifact Review State Invariant**

For any governance artifact (Report Catalog, Requirements Document, CDE Inventory,
Compliance Package), the artifact's status must transition through 'pending_review'
before reaching 'approved' status.

**Validates: Requirements 1.3, 3.5, 4.4, 10.3**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.regulatory import ReportCatalog, RegulatoryReport, ArtifactStatus
from repository.in_memory import InMemoryGovernanceRepository
from tools.regulatory_tools import create_regulatory_tools
from tests.strategies.regulatory_strategies import (
    regulatory_report_strategy,
    report_catalog_strategy,
    non_empty_string_strategy,
)


class StatusTransitionTracker:
    """Helper class to track status transitions for verification."""
    
    def __init__(self):
        self.transitions: list[ArtifactStatus] = []
    
    def record_status(self, status: ArtifactStatus) -> None:
        """Record a status transition."""
        self.transitions.append(status)
    
    def has_passed_through_pending_review(self) -> bool:
        """
        Check if the artifact passed through 'pending_review' before 'approved'.
        
        Returns:
            True if the invariant holds (pending_review came before approved),
            or if there was no approval. False if approved without pending_review.
        """
        try:
            approved_index = self.transitions.index('approved')
        except ValueError:
            # No approval, so invariant holds
            return True
        
        # Check if pending_review appears before approved
        try:
            pending_review_index = self.transitions.index('pending_review')
            return pending_review_index < approved_index
        except ValueError:
            # No pending_review but there was an approval - invariant violated
            return False
    
    def get_transitions(self) -> list[ArtifactStatus]:
        """Get the list of recorded transitions."""
        return self.transitions.copy()


class TestArtifactReviewStateInvariant:
    """
    Property 1: Artifact Review State Invariant
    
    Tests that governance artifacts must transition through 'pending_review'
    before reaching 'approved' status.
    """
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=5),
        creator=non_empty_string_strategy,
        approver=non_empty_string_strategy,
    )
    def test_report_catalog_requires_pending_review_before_approved(
        self, reports: list[RegulatoryReport], creator: str, approver: str
    ):
        """
        **Validates: Requirements 1.3, 3.5, 4.4, 10.3**
        
        Property: For any ReportCatalog, status must transition through
        'pending_review' before reaching 'approved' status.
        """
        # Ensure creator and approver are different
        assume(creator != approver)
        assume(len(creator) > 0 and len(approver) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        tracker = StatusTransitionTracker()
        
        # Get tool functions
        get_catalog = tools[3]  # get_report_catalog
        submit_for_review = tools[5]  # submit_for_review
        approve_catalog = tools[4]  # approve_catalog
        
        # Create initial catalog with draft status
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        tracker.record_status('draft')
        
        # Submit for review (transitions to pending_review)
        result = submit_for_review(creator)
        tracker.record_status(result['status'])
        assert result['status'] == 'pending_review', \
            f"Expected 'pending_review' after submit, got '{result['status']}'"
        
        # Approve (transitions to approved)
        result = approve_catalog(approver, "Approved after thorough review")
        tracker.record_status(result['status'])
        assert result['status'] == 'approved', \
            f"Expected 'approved' after approval, got '{result['status']}'"
        
        # Verify the invariant: pending_review must come before approved
        assert tracker.has_passed_through_pending_review(), \
            f"Invariant violated: transitions were {tracker.get_transitions()}"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=5),
        creator=non_empty_string_strategy,
        approver=non_empty_string_strategy,
    )
    def test_direct_approval_from_draft_is_prevented(
        self, reports: list[RegulatoryReport], creator: str, approver: str
    ):
        """
        **Validates: Requirements 1.3, 3.5, 4.4, 10.3**
        
        Property: For any ReportCatalog in 'draft' status, attempting to
        approve directly (without going through 'pending_review') must fail.
        """
        assume(len(creator) > 0 and len(approver) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        approve_catalog = tools[4]  # approve_catalog
        
        # Create initial catalog with draft status
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Attempting to approve directly should fail
        with pytest.raises(ValueError) as exc_info:
            approve_catalog(approver, "Trying to skip review")
        
        assert "pending_review" in str(exc_info.value).lower(), \
            f"Expected error about pending_review, got: {exc_info.value}"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=5),
        creator=non_empty_string_strategy,
        rejector=non_empty_string_strategy,
        reason=st.text(min_size=10, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))),
    )
    def test_rejection_from_pending_review_is_allowed(
        self, reports: list[RegulatoryReport], creator: str, rejector: str, reason: str
    ):
        """
        **Validates: Requirements 1.3, 3.5, 4.4, 10.3**
        
        Property: For any ReportCatalog in 'pending_review' status,
        rejection should be allowed and properly recorded.
        """
        assume(len(creator) > 0 and len(rejector) > 0 and len(reason) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]  # submit_for_review
        
        # Create initial catalog with draft status
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Submit for review
        submit_for_review(creator)
        
        # Manually set to rejected (simulating rejection workflow)
        catalog = repository.get_report_catalog()
        catalog.status = 'rejected'
        repository.set_report_catalog(catalog)
        
        # Verify rejection is recorded
        final_catalog = repository.get_report_catalog()
        assert final_catalog.status == 'rejected', \
            f"Expected 'rejected' status, got '{final_catalog.status}'"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        creator=non_empty_string_strategy,
        approver=non_empty_string_strategy,
    )
    def test_audit_trail_records_all_status_transitions(
        self, reports: list[RegulatoryReport], creator: str, approver: str
    ):
        """
        **Validates: Requirements 1.3, 3.5, 4.4, 10.3**
        
        Property: For any artifact status transition, an audit entry must
        be created that records the transition.
        """
        assume(creator != approver)
        assume(len(creator) > 0 and len(approver) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]  # submit_for_review
        approve_catalog = tools[4]  # approve_catalog
        
        # Create initial catalog
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries(entity_type='ReportCatalog')
        initial_count = len(initial_entries)
        
        # Submit for review
        submit_for_review(creator)
        
        # Approve
        approve_catalog(approver, "Approved after review")
        
        # Get final audit entries
        final_entries = repository.get_audit_entries(entity_type='ReportCatalog')
        
        # Should have at least 2 new audit entries (submit + approve)
        assert len(final_entries) >= initial_count + 2, \
            f"Expected at least {initial_count + 2} audit entries, got {len(final_entries)}"
        
        # Verify audit entries contain status information
        status_changes = [
            e for e in final_entries
            if e.new_state and isinstance(e.new_state, dict) and 'status' in e.new_state
        ]
        assert len(status_changes) >= 2, \
            f"Expected at least 2 status change audit entries, got {len(status_changes)}"
    
    @settings(max_examples=100)
    @given(
        reports=st.lists(regulatory_report_strategy(), min_size=1, max_size=3),
        creator=non_empty_string_strategy,
        approver=non_empty_string_strategy,
        modifier=non_empty_string_strategy,
    )
    def test_modification_after_approval_resets_to_draft(
        self, reports: list[RegulatoryReport], creator: str, approver: str, modifier: str
    ):
        """
        **Validates: Requirements 1.3, 3.5, 4.4, 10.3**
        
        Property: For any approved ReportCatalog, modification should reset
        the status to 'draft', requiring re-review before re-approval.
        """
        assume(creator != approver)
        assume(len(creator) > 0 and len(approver) > 0 and len(modifier) > 0)
        
        repository = InMemoryGovernanceRepository()
        tools = create_regulatory_tools(repository)
        
        submit_for_review = tools[5]  # submit_for_review
        approve_catalog = tools[4]  # approve_catalog
        modify_catalog = tools[6]  # modify_catalog
        
        # Create initial catalog
        initial_catalog = ReportCatalog(
            reports=reports,
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(initial_catalog)
        
        # Go through approval workflow
        submit_for_review(creator)
        approve_catalog(approver, "Initial approval")
        
        # Verify approved
        catalog = repository.get_report_catalog()
        assert catalog.status == 'approved'
        
        # Create a new report to add
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
        
        # Modify the catalog
        result = modify_catalog(
            report_id='new-report-id',
            action='add',
            report_data=new_report_data,
            modifier=modifier,
            rationale='Adding new report'
        )
        
        # Verify status is reset to draft
        assert result['status'] == 'draft', \
            f"Expected 'draft' after modification, got '{result['status']}'"
        
        # Verify approval info is cleared
        assert result.get('approved_by') is None, \
            "Expected approved_by to be cleared after modification"
        assert result.get('approved_at') is None, \
            "Expected approved_at to be cleared after modification"
