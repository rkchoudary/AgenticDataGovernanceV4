"""
Unit tests for Pydantic data models.

Tests model validation, defaults, and serialization.
"""
import pytest
from datetime import datetime
from uuid import UUID

from models.regulatory import (
    DueDateRule, RegulatoryReport, ReportCatalog, 
    RegulatoryChange, ScanResult, CatalogUpdate
)
from models.data_elements import (
    DataElement, DataMapping, DataGap, RequirementsDocument,
    ReconciliationItem, ReconciliationResult
)
from models.cde import CDE, CDEScore, CDEInventory, OwnerSuggestion, CDEScoringFactors
from models.data_quality import (
    DQRule, RuleLogic, Threshold, RuleExecutionResult,
    DataSnapshot, DataProfile
)
from models.lineage import (
    LineageNode, LineageEdge, LineageGraph, ImpactAnalysis
)
from models.issues import Issue, Resolution, RootCauseSuggestion, IssueMetrics
from models.controls import Control, ControlEvidence, ControlMatrix
from models.workflow import (
    CycleInstance, HumanTask, Checkpoint, Decision
)
from models.audit import AuditEntry, CreateAuditEntryParams


class TestRegulatoryModels:
    """Tests for regulatory models."""
    
    def test_due_date_rule_defaults(self):
        """Test DueDateRule default values."""
        rule = DueDateRule(days_after_period_end=15)
        assert rule.business_days_only is False
    
    def test_regulatory_report_id_generation(self):
        """Test that RegulatoryReport generates a UUID for id."""
        report = RegulatoryReport(
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
        # Verify ID is a valid UUID string
        UUID(report.id)
    
    def test_report_catalog_defaults(self):
        """Test ReportCatalog default values."""
        catalog = ReportCatalog(
            reports=[],
            version=1,
            last_scanned=datetime.now()
        )
        assert catalog.status == 'draft'
        assert catalog.approved_by is None
    
    def test_regulatory_change_types(self):
        """Test RegulatoryChange change types."""
        for change_type in ['new', 'updated', 'removed']:
            change = RegulatoryChange(
                change_type=change_type,
                description='Test change',
                effective_date=datetime.now(),
                detected_at=datetime.now(),
                source='Test source'
            )
            assert change.change_type == change_type


class TestDataElementModels:
    """Tests for data element models."""
    
    def test_data_element_id_generation(self):
        """Test that DataElement generates a UUID for id."""
        element = DataElement(
            name='Test Element',
            regulatory_definition='Test definition',
            data_type='string',
            format='text',
            mandatory=True
        )
        UUID(element.id)
    
    def test_data_mapping_confidence_range(self):
        """Test DataMapping confidence score."""
        mapping = DataMapping(
            element_id='elem-1',
            source_system='System A',
            source_table='table_a',
            source_field='column_a',
            confidence=0.95
        )
        assert 0 <= mapping.confidence <= 1
    
    def test_data_gap_reasons(self):
        """Test DataGap reason types."""
        for reason in ['no_source', 'partial_source', 'calculation_needed']:
            gap = DataGap(
                element_id='elem-1',
                element_name='Test Element',
                reason=reason
            )
            assert gap.reason == reason


class TestCDEModels:
    """Tests for CDE models."""
    
    def test_cde_score_factors(self):
        """Test CDEScore with all factors."""
        factors = CDEScoringFactors(
            regulatory_calculation_usage=0.8,
            cross_report_usage=0.6,
            financial_impact=0.9,
            regulatory_scrutiny=0.7
        )
        score = CDEScore(
            element_id='elem-1',
            overall_score=0.75,
            factors=factors,
            rationale='Test rationale'
        )
        assert score.overall_score == 0.75
    
    def test_cde_defaults(self):
        """Test CDE default values."""
        cde = CDE(
            element_id='elem-1',
            name='Test CDE',
            business_definition='Test definition',
            criticality_rationale='Test rationale'
        )
        assert cde.status == 'pending_approval'
        assert cde.data_owner is None
    
    def test_cde_inventory_defaults(self):
        """Test CDEInventory default values."""
        inventory = CDEInventory(
            report_id='report-1',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        assert inventory.cdes == []
        assert inventory.version == 0


class TestDataQualityModels:
    """Tests for data quality models."""
    
    def test_dq_dimensions(self):
        """Test all 7 DQ dimensions."""
        dimensions = [
            'completeness', 'accuracy', 'validity', 
            'consistency', 'timeliness', 'uniqueness', 'integrity'
        ]
        for dim in dimensions:
            rule = DQRule(
                cde_id='cde-1',
                dimension=dim,
                name=f'{dim} Rule',
                description='Test',
                logic=RuleLogic(type='null_check', expression='test'),
                threshold=Threshold(type='percentage', value=95.0),
                severity='high',
                owner='test_owner'
            )
            assert rule.dimension == dim
    
    def test_rule_logic_types(self):
        """Test RuleLogic types."""
        types = ['null_check', 'range_check', 'format_check', 
                 'referential_check', 'reconciliation', 'custom']
        for logic_type in types:
            logic = RuleLogic(type=logic_type, expression='test')
            assert logic.type == logic_type
    
    def test_threshold_types(self):
        """Test Threshold types."""
        for threshold_type in ['percentage', 'absolute', 'range']:
            threshold = Threshold(type=threshold_type, value=95.0)
            assert threshold.type == threshold_type
    
    def test_rule_execution_result(self):
        """Test RuleExecutionResult."""
        result = RuleExecutionResult(
            rule_id='rule-1',
            passed=True,
            actual_value=98.5,
            expected_value=95.0,
            total_records=1000,
            executed_at=datetime.now()
        )
        assert result.passed is True
        assert result.failed_records is None


class TestLineageModels:
    """Tests for lineage models."""
    
    def test_lineage_node_types(self):
        """Test LineageNode types."""
        types = ['source_table', 'transformation', 'staging_table', 'report_field']
        for node_type in types:
            node = LineageNode(
                name='Test Node',
                type=node_type,
                system='Test System'
            )
            assert node.type == node_type
    
    def test_lineage_graph_defaults(self):
        """Test LineageGraph default values."""
        graph = LineageGraph(
            report_id='report-1',
            captured_at=datetime.now()
        )
        assert graph.nodes == []
        assert graph.edges == []
    
    def test_impact_analysis(self):
        """Test ImpactAnalysis."""
        analysis = ImpactAnalysis(
            changed_source='source-1',
            impacted_cdes=['cde-1', 'cde-2'],
            impacted_reports=['report-1'],
            analyzed_at=datetime.now()
        )
        assert len(analysis.impacted_cdes) == 2


class TestIssueModels:
    """Tests for issue models."""
    
    def test_issue_severity_levels(self):
        """Test Issue severity levels."""
        for severity in ['critical', 'high', 'medium', 'low']:
            issue = Issue(
                title='Test Issue',
                description='Test',
                source='test',
                severity=severity,
                assignee='test_user',
                created_at=datetime.now()
            )
            assert issue.severity == severity
    
    def test_issue_status_transitions(self):
        """Test Issue status values."""
        statuses = ['open', 'in_progress', 'pending_verification', 'resolved', 'closed']
        for status in statuses:
            issue = Issue(
                title='Test Issue',
                description='Test',
                source='test',
                severity='high',
                status=status,
                assignee='test_user',
                created_at=datetime.now()
            )
            assert issue.status == status
    
    def test_resolution_types(self):
        """Test Resolution types."""
        types = ['data_correction', 'process_change', 'system_fix', 'exception_approved']
        for res_type in types:
            resolution = Resolution(
                type=res_type,
                description='Test resolution',
                implemented_by='test_user',
                implemented_at=datetime.now()
            )
            assert resolution.type == res_type
    
    def test_issue_metrics_defaults(self):
        """Test IssueMetrics default values."""
        metrics = IssueMetrics()
        assert metrics.open_count == 0
        assert metrics.avg_resolution_time == 0.0


class TestControlModels:
    """Tests for control models."""
    
    def test_control_types(self):
        """Test Control types."""
        types = ['organizational', 'process', 'access', 'change_management']
        for control_type in types:
            control = Control(
                name='Test Control',
                description='Test',
                type=control_type,
                category='preventive',
                owner='test_owner',
                frequency='monthly'
            )
            assert control.type == control_type
    
    def test_control_categories(self):
        """Test Control categories."""
        categories = ['preventive', 'detective']
        for category in categories:
            control = Control(
                name='Test Control',
                description='Test',
                type='process',
                category=category,
                owner='test_owner',
                frequency='monthly'
            )
            assert control.category == category
    
    def test_control_evidence_outcomes(self):
        """Test ControlEvidence outcomes."""
        outcomes = ['pass', 'fail', 'exception']
        for outcome in outcomes:
            evidence = ControlEvidence(
                control_id='control-1',
                execution_date=datetime.now(),
                outcome=outcome,
                details='Test details',
                executed_by='test_user'
            )
            assert evidence.outcome == outcome


class TestWorkflowModels:
    """Tests for workflow models."""
    
    def test_cycle_status_values(self):
        """Test CycleInstance status values."""
        statuses = ['active', 'paused', 'completed', 'failed']
        for status in statuses:
            cycle = CycleInstance(
                report_id='report-1',
                period_end=datetime.now(),
                status=status,
                started_at=datetime.now()
            )
            assert cycle.status == status
    
    def test_phase_values(self):
        """Test Phase values."""
        phases = ['data_gathering', 'validation', 'review', 'approval', 'submission']
        for phase in phases:
            cycle = CycleInstance(
                report_id='report-1',
                period_end=datetime.now(),
                current_phase=phase,
                started_at=datetime.now()
            )
            assert cycle.current_phase == phase
    
    def test_human_task_types(self):
        """Test HumanTask types."""
        types = [
            'catalog_review', 'requirements_validation', 'cde_approval',
            'rule_review', 'lineage_validation', 'issue_resolution_confirmation',
            'submission_approval', 'attestation'
        ]
        for task_type in types:
            task = HumanTask(
                cycle_id='cycle-1',
                type=task_type,
                title='Test Task',
                description='Test',
                assigned_to='user@example.com',
                assigned_role='compliance_officer',
                due_date=datetime.now(),
                created_at=datetime.now()
            )
            assert task.type == task_type
    
    def test_decision_outcomes(self):
        """Test Decision outcomes."""
        outcomes = ['approved', 'rejected', 'approved_with_changes']
        for outcome in outcomes:
            decision = Decision(outcome=outcome)
            assert decision.outcome == outcome


class TestAuditModels:
    """Tests for audit models."""
    
    def test_audit_entry_id_generation(self):
        """Test that AuditEntry generates a UUID for id."""
        entry = AuditEntry(
            actor='test_user',
            actor_type='human',
            action='test_action',
            entity_type='TestEntity',
            entity_id='test-123'
        )
        UUID(entry.id)
    
    def test_audit_entry_timestamp_default(self):
        """Test that AuditEntry generates timestamp by default."""
        entry = AuditEntry(
            actor='test_user',
            actor_type='human',
            action='test_action',
            entity_type='TestEntity',
            entity_id='test-123'
        )
        assert entry.timestamp is not None
    
    def test_actor_types(self):
        """Test ActorType values."""
        for actor_type in ['agent', 'human', 'system']:
            entry = AuditEntry(
                actor='test_actor',
                actor_type=actor_type,
                action='test_action',
                entity_type='TestEntity',
                entity_id='test-123'
            )
            assert entry.actor_type == actor_type


class TestModelSerialization:
    """Tests for model serialization."""
    
    def test_regulatory_report_serialization(self):
        """Test RegulatoryReport serialization round-trip."""
        report = RegulatoryReport(
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
        
        # Serialize and deserialize
        data = report.model_dump()
        restored = RegulatoryReport.model_validate(data)
        
        assert restored.name == report.name
        assert restored.id == report.id
    
    def test_issue_serialization(self):
        """Test Issue serialization round-trip."""
        issue = Issue(
            title='Test Issue',
            description='Test description',
            source='test',
            severity='high',
            status='open',
            assignee='test_user',
            created_at=datetime.now()
        )
        
        data = issue.model_dump()
        restored = Issue.model_validate(data)
        
        assert restored.title == issue.title
        assert restored.id == issue.id
    
    def test_dq_rule_serialization(self):
        """Test DQRule serialization round-trip."""
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
        
        data = rule.model_dump()
        restored = DQRule.model_validate(data)
        
        assert restored.name == rule.name
        assert restored.logic.type == rule.logic.type
