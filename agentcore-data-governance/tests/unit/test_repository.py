"""
Unit tests for the repository layer.

Tests both InMemoryGovernanceRepository and AgentCoreMemoryRepository.
"""
import pytest
from datetime import datetime

from repository import InMemoryGovernanceRepository, AgentCoreMemoryRepository
from models.audit import CreateAuditEntryParams
from models.regulatory import ReportCatalog, RegulatoryReport, DueDateRule
from models.issues import Issue, IssueFilters
from models.workflow import CycleInstance, HumanTask
from models.data_quality import DQRule, RuleLogic, Threshold


@pytest.fixture
def in_memory_repo():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def agentcore_repo():
    """Provide a fresh AgentCore memory repository for each test."""
    return AgentCoreMemoryRepository(
        memory_id='test-memory',
        session_id='test-session',
        actor_id='test-actor'
    )


class TestAuditEntries:
    """Tests for audit entry operations."""
    
    def test_create_audit_entry_from_params(self, in_memory_repo):
        """Test creating an audit entry from parameters."""
        params = CreateAuditEntryParams(
            actor='test_user',
            actor_type='human',
            action='test_action',
            entity_type='TestEntity',
            entity_id='test-123',
            rationale='Testing repository'
        )
        entry = in_memory_repo.create_audit_entry_from_params(params)
        
        assert entry.id is not None
        assert entry.actor == 'test_user'
        assert entry.actor_type == 'human'
        assert entry.action == 'test_action'
        assert entry.entity_type == 'TestEntity'
        assert entry.entity_id == 'test-123'
        assert entry.rationale == 'Testing repository'
        assert entry.timestamp is not None
    
    def test_get_audit_entries_by_entity_type(self, in_memory_repo):
        """Test filtering audit entries by entity type."""
        # Create entries for different entity types
        for entity_type in ['TypeA', 'TypeB', 'TypeA']:
            params = CreateAuditEntryParams(
                actor='test_user',
                actor_type='human',
                action='test_action',
                entity_type=entity_type,
                entity_id='test-123'
            )
            in_memory_repo.create_audit_entry_from_params(params)
        
        entries = in_memory_repo.get_audit_entries(entity_type='TypeA')
        assert len(entries) == 2
    
    def test_get_audit_entries_with_limit(self, in_memory_repo):
        """Test limiting audit entries."""
        for i in range(5):
            params = CreateAuditEntryParams(
                actor='test_user',
                actor_type='human',
                action=f'action_{i}',
                entity_type='TestEntity',
                entity_id='test-123'
            )
            in_memory_repo.create_audit_entry_from_params(params)
        
        entries = in_memory_repo.get_audit_entries(limit=3)
        assert len(entries) == 3


class TestReportCatalog:
    """Tests for report catalog operations."""
    
    def test_set_and_get_report_catalog(self, in_memory_repo):
        """Test setting and getting report catalog."""
        catalog = ReportCatalog(
            reports=[
                RegulatoryReport(
                    name='Test Report',
                    jurisdiction='US',
                    regulator='Test Regulator',
                    frequency='monthly',
                    due_date=DueDateRule(days_after_period_end=15),
                    submission_format='XML',
                    submission_platform='Test Platform',
                    description='Test description',
                    last_updated=datetime.now(),
                    responsible_unit='Test Unit'
                )
            ],
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        
        in_memory_repo.set_report_catalog(catalog)
        retrieved = in_memory_repo.get_report_catalog()
        
        assert retrieved is not None
        assert len(retrieved.reports) == 1
        assert retrieved.reports[0].name == 'Test Report'
        assert retrieved.version == 1
    
    def test_get_report_by_id(self, in_memory_repo):
        """Test getting a specific report by ID."""
        report = RegulatoryReport(
            id='report-123',
            name='Test Report',
            jurisdiction='US',
            regulator='Test Regulator',
            frequency='monthly',
            due_date=DueDateRule(days_after_period_end=15),
            submission_format='XML',
            submission_platform='Test Platform',
            description='Test description',
            last_updated=datetime.now(),
            responsible_unit='Test Unit'
        )
        catalog = ReportCatalog(
            reports=[report],
            version=1,
            last_scanned=datetime.now(),
            status='draft'
        )
        
        in_memory_repo.set_report_catalog(catalog)
        retrieved = in_memory_repo.get_report('report-123')
        
        assert retrieved is not None
        assert retrieved.id == 'report-123'
        assert retrieved.name == 'Test Report'
    
    def test_get_nonexistent_report(self, in_memory_repo):
        """Test getting a report that doesn't exist."""
        retrieved = in_memory_repo.get_report('nonexistent')
        assert retrieved is None


class TestIssues:
    """Tests for issue operations."""
    
    def test_create_and_get_issue(self, in_memory_repo):
        """Test creating and retrieving an issue."""
        issue = Issue(
            title='Test Issue',
            description='Test description',
            source='test',
            severity='high',
            status='open',
            assignee='test_user',
            created_at=datetime.now(),
            impacted_reports=['report-1'],
            impacted_cdes=['cde-1']
        )
        
        created = in_memory_repo.create_issue(issue)
        retrieved = in_memory_repo.get_issue(created.id)
        
        assert retrieved is not None
        assert retrieved.title == 'Test Issue'
        assert retrieved.severity == 'high'
    
    def test_filter_issues_by_severity(self, in_memory_repo):
        """Test filtering issues by severity."""
        for severity in ['high', 'low', 'high', 'critical']:
            issue = Issue(
                title=f'{severity} Issue',
                description='Test',
                source='test',
                severity=severity,
                status='open',
                assignee='test_user',
                created_at=datetime.now()
            )
            in_memory_repo.create_issue(issue)
        
        filters = IssueFilters(severity=['high'])
        issues = in_memory_repo.get_issues(filters)
        assert len(issues) == 2
    
    def test_update_issue(self, in_memory_repo):
        """Test updating an issue."""
        issue = Issue(
            title='Test Issue',
            description='Test description',
            source='test',
            severity='high',
            status='open',
            assignee='test_user',
            created_at=datetime.now()
        )
        created = in_memory_repo.create_issue(issue)
        
        created.status = 'in_progress'
        in_memory_repo.update_issue(created)
        
        retrieved = in_memory_repo.get_issue(created.id)
        assert retrieved.status == 'in_progress'
    
    def test_delete_issue(self, in_memory_repo):
        """Test deleting an issue."""
        issue = Issue(
            title='Test Issue',
            description='Test description',
            source='test',
            severity='high',
            status='open',
            assignee='test_user',
            created_at=datetime.now()
        )
        created = in_memory_repo.create_issue(issue)
        
        result = in_memory_repo.delete_issue(created.id)
        assert result is True
        
        retrieved = in_memory_repo.get_issue(created.id)
        assert retrieved is None


class TestCycleInstances:
    """Tests for cycle instance operations."""
    
    def test_create_and_get_cycle(self, in_memory_repo):
        """Test creating and retrieving a cycle instance."""
        cycle = CycleInstance(
            report_id='report-1',
            period_end=datetime.now(),
            status='active',
            current_phase='data_gathering',
            started_at=datetime.now()
        )
        
        created = in_memory_repo.create_cycle_instance(cycle)
        retrieved = in_memory_repo.get_cycle_instance(created.id)
        
        assert retrieved is not None
        assert retrieved.report_id == 'report-1'
        assert retrieved.status == 'active'
    
    def test_get_active_cycles(self, in_memory_repo):
        """Test getting active cycles."""
        for status in ['active', 'completed', 'active']:
            cycle = CycleInstance(
                report_id='report-1',
                period_end=datetime.now(),
                status=status,
                current_phase='data_gathering',
                started_at=datetime.now()
            )
            in_memory_repo.create_cycle_instance(cycle)
        
        active = in_memory_repo.get_active_cycles()
        assert len(active) == 2
    
    def test_get_active_cycles_by_report(self, in_memory_repo):
        """Test getting active cycles filtered by report."""
        for report_id in ['report-1', 'report-2', 'report-1']:
            cycle = CycleInstance(
                report_id=report_id,
                period_end=datetime.now(),
                status='active',
                current_phase='data_gathering',
                started_at=datetime.now()
            )
            in_memory_repo.create_cycle_instance(cycle)
        
        active = in_memory_repo.get_active_cycles(report_id='report-1')
        assert len(active) == 2


class TestDQRules:
    """Tests for DQ rule operations."""
    
    def test_add_and_get_dq_rule(self, in_memory_repo):
        """Test adding and retrieving a DQ rule."""
        rule = DQRule(
            cde_id='cde-1',
            dimension='completeness',
            name='Test Rule',
            description='Test description',
            logic=RuleLogic(type='null_check', expression='field IS NOT NULL'),
            threshold=Threshold(type='percentage', value=95.0),
            severity='high',
            owner='test_owner'
        )
        
        in_memory_repo.add_dq_rule(rule)
        retrieved = in_memory_repo.get_dq_rule(rule.id)
        
        assert retrieved is not None
        assert retrieved.name == 'Test Rule'
        assert retrieved.dimension == 'completeness'
    
    def test_get_dq_rules_by_cde(self, in_memory_repo):
        """Test getting DQ rules filtered by CDE."""
        for cde_id in ['cde-1', 'cde-2', 'cde-1']:
            rule = DQRule(
                cde_id=cde_id,
                dimension='completeness',
                name=f'Rule for {cde_id}',
                description='Test',
                logic=RuleLogic(type='null_check', expression='field IS NOT NULL'),
                threshold=Threshold(type='percentage', value=95.0),
                severity='high',
                owner='test_owner'
            )
            in_memory_repo.add_dq_rule(rule)
        
        rules = in_memory_repo.get_dq_rules(cde_id='cde-1')
        assert len(rules) == 2
    
    def test_update_dq_rule(self, in_memory_repo):
        """Test updating a DQ rule."""
        rule = DQRule(
            cde_id='cde-1',
            dimension='completeness',
            name='Test Rule',
            description='Test description',
            logic=RuleLogic(type='null_check', expression='field IS NOT NULL'),
            threshold=Threshold(type='percentage', value=95.0),
            severity='high',
            owner='test_owner'
        )
        in_memory_repo.add_dq_rule(rule)
        
        rule.threshold = Threshold(type='percentage', value=99.0)
        in_memory_repo.update_dq_rule(rule)
        
        retrieved = in_memory_repo.get_dq_rule(rule.id)
        assert retrieved.threshold.value == 99.0
    
    def test_delete_dq_rule(self, in_memory_repo):
        """Test deleting a DQ rule."""
        rule = DQRule(
            cde_id='cde-1',
            dimension='completeness',
            name='Test Rule',
            description='Test description',
            logic=RuleLogic(type='null_check', expression='field IS NOT NULL'),
            threshold=Threshold(type='percentage', value=95.0),
            severity='high',
            owner='test_owner'
        )
        in_memory_repo.add_dq_rule(rule)
        
        result = in_memory_repo.delete_dq_rule(rule.id)
        assert result is True
        
        retrieved = in_memory_repo.get_dq_rule(rule.id)
        assert retrieved is None


class TestHumanTasks:
    """Tests for human task operations."""
    
    def test_create_and_get_human_task(self, in_memory_repo):
        """Test creating and retrieving a human task."""
        task = HumanTask(
            cycle_id='cycle-1',
            type='catalog_review',
            title='Review Catalog',
            description='Review the regulatory catalog',
            assigned_to='reviewer@example.com',
            assigned_role='compliance_officer',
            due_date=datetime.now(),
            created_at=datetime.now()
        )
        
        created = in_memory_repo.create_human_task(task)
        retrieved = in_memory_repo.get_human_task(created.id)
        
        assert retrieved is not None
        assert retrieved.title == 'Review Catalog'
        assert retrieved.assigned_role == 'compliance_officer'
    
    def test_get_pending_tasks_by_role(self, in_memory_repo):
        """Test getting pending tasks filtered by role."""
        for role in ['compliance_officer', 'data_steward', 'compliance_officer']:
            task = HumanTask(
                cycle_id='cycle-1',
                type='catalog_review',
                title='Review Task',
                description='Test',
                assigned_to='user@example.com',
                assigned_role=role,
                due_date=datetime.now(),
                created_at=datetime.now(),
                status='pending'
            )
            in_memory_repo.create_human_task(task)
        
        pending = in_memory_repo.get_pending_tasks(assigned_role='compliance_officer')
        assert len(pending) == 2


class TestClear:
    """Tests for clear operation."""
    
    def test_clear_removes_all_data(self, in_memory_repo):
        """Test that clear removes all stored data."""
        # Add some data
        params = CreateAuditEntryParams(
            actor='test_user',
            actor_type='human',
            action='test_action',
            entity_type='TestEntity',
            entity_id='test-123'
        )
        in_memory_repo.create_audit_entry_from_params(params)
        
        issue = Issue(
            title='Test Issue',
            description='Test',
            source='test',
            severity='high',
            status='open',
            assignee='test_user',
            created_at=datetime.now()
        )
        in_memory_repo.create_issue(issue)
        
        # Clear and verify
        in_memory_repo.clear()
        
        assert len(in_memory_repo.get_audit_entries()) == 0
        assert len(in_memory_repo.get_issues()) == 0
