"""
Unit tests for the Regulatory Intelligence Agent.

Tests scanning, change detection, and catalog updates.
Requirements: 4.1, 4.2, 4.3
"""
import pytest
from datetime import datetime, timedelta

from repository.in_memory import InMemoryGovernanceRepository
from tools.regulatory_tools import create_regulatory_tools
from models.regulatory import (
    ReportCatalog, RegulatoryReport, DueDateRule, RegulatoryChange
)


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def regulatory_tools(repository):
    """Create regulatory tools with the test repository."""
    return create_regulatory_tools(repository)


@pytest.fixture
def sample_report():
    """Create a sample regulatory report."""
    return RegulatoryReport(
        id='report-001',
        name='Call Report',
        jurisdiction='US',
        regulator='Federal Reserve',
        frequency='quarterly',
        due_date=DueDateRule(days_after_period_end=30),
        submission_format='XML',
        submission_platform='FRB Portal',
        description='Quarterly call report for bank holding companies',
        last_updated=datetime.now(),
        responsible_unit='Regulatory Reporting'
    )


@pytest.fixture
def sample_catalog(sample_report):
    """Create a sample report catalog."""
    return ReportCatalog(
        reports=[sample_report],
        version=1,
        last_scanned=datetime.now(),
        status='draft'
    )


class TestScanRegulatorySources:
    """Tests for scan_regulatory_sources tool."""
    
    def test_scan_empty_catalog(self, regulatory_tools, repository):
        """Test scanning when no catalog exists."""
        scan_tool = regulatory_tools[0]  # scan_regulatory_sources
        
        results = scan_tool(['US', 'CA'])
        
        assert len(results) == 2
        assert results[0]['jurisdiction'] == 'US'
        assert results[1]['jurisdiction'] == 'CA'
        assert results[0]['reports_found'] == 0
        assert results[1]['reports_found'] == 0
        
        # Verify audit entry was created
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'scan_regulatory_sources'
        assert audit_entries[0].actor == 'RegulatoryIntelligenceAgent'
    
    def test_scan_with_existing_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test scanning with existing catalog."""
        repository.set_report_catalog(sample_catalog)
        scan_tool = regulatory_tools[0]
        
        results = scan_tool(['US'])
        
        assert len(results) == 1
        assert results[0]['jurisdiction'] == 'US'
        assert results[0]['reports_found'] == 1
    
    def test_scan_filters_invalid_jurisdictions(self, regulatory_tools):
        """Test that invalid jurisdictions are filtered out."""
        scan_tool = regulatory_tools[0]
        
        results = scan_tool(['US', 'INVALID', 'CA'])
        
        # Only valid jurisdictions should be in results
        assert len(results) == 2
        jurisdictions = [r['jurisdiction'] for r in results]
        assert 'US' in jurisdictions
        assert 'CA' in jurisdictions
        assert 'INVALID' not in jurisdictions
    
    def test_scan_counts_reports_by_jurisdiction(self, regulatory_tools, repository):
        """Test that scan counts reports per jurisdiction correctly."""
        # Create catalog with reports in different jurisdictions
        us_report = RegulatoryReport(
            name='US Report',
            jurisdiction='US',
            regulator='Fed',
            frequency='monthly',
            due_date=DueDateRule(days_after_period_end=15),
            submission_format='XML',
            submission_platform='Portal',
            description='US report',
            last_updated=datetime.now(),
            responsible_unit='Unit'
        )
        ca_report = RegulatoryReport(
            name='CA Report',
            jurisdiction='CA',
            regulator='OSFI',
            frequency='monthly',
            due_date=DueDateRule(days_after_period_end=15),
            submission_format='XML',
            submission_platform='Portal',
            description='CA report',
            last_updated=datetime.now(),
            responsible_unit='Unit'
        )
        catalog = ReportCatalog(
            reports=[us_report, ca_report],
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(catalog)
        
        scan_tool = regulatory_tools[0]
        results = scan_tool(['US', 'CA'])
        
        us_result = next(r for r in results if r['jurisdiction'] == 'US')
        ca_result = next(r for r in results if r['jurisdiction'] == 'CA')
        
        assert us_result['reports_found'] == 1
        assert ca_result['reports_found'] == 1


class TestDetectChanges:
    """Tests for detect_changes tool."""
    
    def test_detect_no_changes_empty_catalog(self, regulatory_tools):
        """Test change detection with no catalog."""
        detect_tool = regulatory_tools[1]  # detect_changes
        
        since = (datetime.now() - timedelta(days=7)).isoformat()
        changes = detect_tool(since)
        
        assert len(changes) == 0
    
    def test_detect_changes_finds_updated_reports(self, regulatory_tools, repository):
        """Test that updated reports are detected as changes."""
        # Create a report updated recently
        recent_report = RegulatoryReport(
            name='Recent Report',
            jurisdiction='US',
            regulator='Fed',
            frequency='monthly',
            due_date=DueDateRule(days_after_period_end=15),
            submission_format='XML',
            submission_platform='Portal',
            description='Recently updated',
            last_updated=datetime.now(),
            responsible_unit='Unit'
        )
        catalog = ReportCatalog(
            reports=[recent_report],
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(catalog)
        
        detect_tool = regulatory_tools[1]
        since = (datetime.now() - timedelta(days=7)).isoformat()
        changes = detect_tool(since)
        
        assert len(changes) == 1
        assert changes[0]['change_type'] == 'updated'
        assert recent_report.name in changes[0]['description']
    
    def test_detect_changes_ignores_old_reports(self, regulatory_tools, repository):
        """Test that old reports are not detected as changes."""
        # Create a report updated long ago
        old_report = RegulatoryReport(
            name='Old Report',
            jurisdiction='US',
            regulator='Fed',
            frequency='monthly',
            due_date=DueDateRule(days_after_period_end=15),
            submission_format='XML',
            submission_platform='Portal',
            description='Old report',
            last_updated=datetime.now() - timedelta(days=30),
            responsible_unit='Unit'
        )
        catalog = ReportCatalog(
            reports=[old_report],
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        repository.set_report_catalog(catalog)
        
        detect_tool = regulatory_tools[1]
        since = (datetime.now() - timedelta(days=7)).isoformat()
        changes = detect_tool(since)
        
        assert len(changes) == 0
    
    def test_detect_changes_creates_audit_entry(self, regulatory_tools, repository):
        """Test that change detection creates an audit entry."""
        detect_tool = regulatory_tools[1]
        
        since = datetime.now().isoformat()
        detect_tool(since)
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'detect_changes'


class TestUpdateReportCatalog:
    """Tests for update_report_catalog tool."""
    
    def test_update_creates_new_catalog(self, regulatory_tools, repository):
        """Test updating when no catalog exists."""
        update_tool = regulatory_tools[2]  # update_report_catalog
        
        changes = [
            RegulatoryChange(
                report_id='new-report-1',
                change_type='new',
                description='New report added',
                effective_date=datetime.now(),
                detected_at=datetime.now(),
                source='Fed'
            ).model_dump()
        ]
        
        result = update_tool(changes)
        
        assert result['version'] == 1
        assert 'new-report-1' in result['added_reports']
        
        # Verify catalog was created
        catalog = repository.get_report_catalog()
        assert catalog is not None
        assert catalog.status == 'pending_review'
    
    def test_update_increments_version(self, regulatory_tools, repository, sample_catalog):
        """Test that update increments catalog version."""
        repository.set_report_catalog(sample_catalog)
        update_tool = regulatory_tools[2]
        
        changes = [
            RegulatoryChange(
                report_id='report-001',
                change_type='updated',
                description='Report updated',
                effective_date=datetime.now(),
                detected_at=datetime.now(),
                source='Fed'
            ).model_dump()
        ]
        
        result = update_tool(changes)
        
        assert result['version'] == 2
        assert 'report-001' in result['updated_reports']
    
    def test_update_sets_pending_review_status(self, regulatory_tools, repository, sample_catalog):
        """Test that update sets status to pending_review."""
        sample_catalog.status = 'approved'
        repository.set_report_catalog(sample_catalog)
        update_tool = regulatory_tools[2]
        
        result = update_tool([])
        
        catalog = repository.get_report_catalog()
        assert catalog.status == 'pending_review'
    
    def test_update_tracks_removed_reports(self, regulatory_tools, repository, sample_catalog):
        """Test that removed reports are tracked."""
        repository.set_report_catalog(sample_catalog)
        update_tool = regulatory_tools[2]
        
        changes = [
            RegulatoryChange(
                report_id='report-001',
                change_type='removed',
                description='Report removed',
                effective_date=datetime.now(),
                detected_at=datetime.now(),
                source='Fed'
            ).model_dump()
        ]
        
        result = update_tool(changes)
        
        assert 'report-001' in result['removed_reports']
    
    def test_update_creates_audit_entry(self, regulatory_tools, repository):
        """Test that update creates an audit entry."""
        update_tool = regulatory_tools[2]
        
        update_tool([])
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'update_report_catalog'


class TestGetReportCatalog:
    """Tests for get_report_catalog tool."""
    
    def test_get_empty_catalog(self, regulatory_tools):
        """Test getting catalog when none exists."""
        get_tool = regulatory_tools[3]  # get_report_catalog
        
        result = get_tool()
        
        assert result['version'] == 0
        assert result['reports'] == []
        assert result['status'] == 'draft'
    
    def test_get_existing_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test getting existing catalog."""
        repository.set_report_catalog(sample_catalog)
        get_tool = regulatory_tools[3]
        
        result = get_tool()
        
        assert result['version'] == 1
        assert len(result['reports']) == 1
        assert result['reports'][0]['name'] == 'Call Report'


class TestApproveCatalog:
    """Tests for approve_catalog tool."""
    
    def test_approve_pending_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test approving a catalog in pending_review status."""
        sample_catalog.status = 'pending_review'
        repository.set_report_catalog(sample_catalog)
        approve_tool = regulatory_tools[4]  # approve_catalog
        
        result = approve_tool('compliance_officer', 'Reviewed and approved')
        
        assert result['status'] == 'approved'
        assert result['approved_by'] == 'compliance_officer'
        assert result['approved_at'] is not None
    
    def test_approve_creates_audit_entry(self, regulatory_tools, repository, sample_catalog):
        """Test that approval creates an audit entry."""
        sample_catalog.status = 'pending_review'
        repository.set_report_catalog(sample_catalog)
        approve_tool = regulatory_tools[4]
        
        approve_tool('compliance_officer', 'Approved after review')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'approve_catalog'
        assert audit_entries[0].actor == 'compliance_officer'
        assert audit_entries[0].actor_type == 'human'
        assert audit_entries[0].rationale == 'Approved after review'
    
    def test_approve_fails_without_catalog(self, regulatory_tools):
        """Test that approval fails when no catalog exists."""
        approve_tool = regulatory_tools[4]
        
        with pytest.raises(ValueError, match="No catalog exists"):
            approve_tool('approver', 'rationale')
    
    def test_approve_fails_for_non_pending_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test that approval fails for non-pending_review catalog."""
        sample_catalog.status = 'draft'
        repository.set_report_catalog(sample_catalog)
        approve_tool = regulatory_tools[4]
        
        with pytest.raises(ValueError, match="pending_review"):
            approve_tool('approver', 'rationale')


class TestSubmitForReview:
    """Tests for submit_for_review tool."""
    
    def test_submit_draft_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test submitting a draft catalog for review."""
        sample_catalog.status = 'draft'
        repository.set_report_catalog(sample_catalog)
        submit_tool = regulatory_tools[5]  # submit_for_review
        
        result = submit_tool('data_steward', 'Ready for compliance review')
        
        assert result['status'] == 'pending_review'
    
    def test_submit_creates_audit_entry(self, regulatory_tools, repository, sample_catalog):
        """Test that submission creates an audit entry."""
        sample_catalog.status = 'draft'
        repository.set_report_catalog(sample_catalog)
        submit_tool = regulatory_tools[5]
        
        submit_tool('data_steward', 'Review notes')
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'submit_for_review'
        assert audit_entries[0].rationale == 'Review notes'
    
    def test_submit_fails_for_non_draft_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test that submission fails for non-draft catalog."""
        sample_catalog.status = 'pending_review'
        repository.set_report_catalog(sample_catalog)
        submit_tool = regulatory_tools[5]
        
        with pytest.raises(ValueError, match="draft"):
            submit_tool('submitter', 'notes')


class TestModifyCatalog:
    """Tests for modify_catalog tool."""
    
    def test_add_report_to_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test adding a report to the catalog."""
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]  # modify_catalog
        
        new_report_data = {
            'name': 'New Report',
            'jurisdiction': 'CA',
            'regulator': 'OSFI',
            'frequency': 'monthly',
            'due_date': {'days_after_period_end': 20},
            'submission_format': 'XML',
            'submission_platform': 'OSFI Portal',
            'description': 'New Canadian report',
            'last_updated': datetime.now().isoformat(),
            'responsible_unit': 'Regulatory'
        }
        
        result = modify_tool(
            report_id='new-report-001',
            action='add',
            report_data=new_report_data,
            modifier='data_steward',
            rationale='Adding new regulatory requirement'
        )
        
        assert len(result['reports']) == 2
        assert result['version'] == 2
    
    def test_update_report_in_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test updating a report in the catalog."""
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]
        
        updated_data = {
            'name': 'Updated Call Report',
            'jurisdiction': 'US',
            'regulator': 'Federal Reserve',
            'frequency': 'quarterly',
            'due_date': {'days_after_period_end': 45},
            'submission_format': 'XML',
            'submission_platform': 'FRB Portal',
            'description': 'Updated description',
            'last_updated': datetime.now().isoformat(),
            'responsible_unit': 'Regulatory Reporting'
        }
        
        result = modify_tool(
            report_id='report-001',
            action='update',
            report_data=updated_data,
            modifier='data_steward'
        )
        
        assert result['reports'][0]['name'] == 'Updated Call Report'
        assert result['reports'][0]['due_date']['days_after_period_end'] == 45
    
    def test_remove_report_from_catalog(self, regulatory_tools, repository, sample_catalog):
        """Test removing a report from the catalog."""
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]
        
        result = modify_tool(
            report_id='report-001',
            action='remove',
            modifier='data_steward',
            rationale='Report no longer required'
        )
        
        assert len(result['reports']) == 0
        assert result['version'] == 2
    
    def test_modify_resets_approved_status(self, regulatory_tools, repository, sample_catalog):
        """Test that modifying an approved catalog resets to draft."""
        sample_catalog.status = 'approved'
        sample_catalog.approved_by = 'approver'
        sample_catalog.approved_at = datetime.now()
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]
        
        result = modify_tool(
            report_id='report-001',
            action='remove',
            modifier='data_steward'
        )
        
        assert result['status'] == 'draft'
        assert result['approved_by'] is None
        assert result['approved_at'] is None
    
    def test_modify_fails_for_invalid_action(self, regulatory_tools, repository, sample_catalog):
        """Test that invalid action raises error."""
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]
        
        with pytest.raises(ValueError, match="Invalid action"):
            modify_tool(
                report_id='report-001',
                action='invalid',
                modifier='data_steward'
            )
    
    def test_modify_fails_for_nonexistent_report(self, regulatory_tools, repository, sample_catalog):
        """Test that updating nonexistent report raises error."""
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]
        
        with pytest.raises(ValueError, match="not found"):
            modify_tool(
                report_id='nonexistent',
                action='update',
                report_data={'name': 'Test'},
                modifier='data_steward'
            )
    
    def test_modify_creates_audit_entry(self, regulatory_tools, repository, sample_catalog):
        """Test that modification creates an audit entry."""
        repository.set_report_catalog(sample_catalog)
        modify_tool = regulatory_tools[6]
        
        modify_tool(
            report_id='report-001',
            action='remove',
            modifier='data_steward',
            rationale='Removing obsolete report'
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == 'modify_catalog_remove'
        assert audit_entries[0].rationale == 'Removing obsolete report'
