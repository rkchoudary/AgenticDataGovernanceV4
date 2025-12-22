"""
Unit tests for the Dashboard Service.

Tests the dashboard service functions per Requirements 11.1, 11.2.
"""

import pytest
from datetime import datetime, timedelta
from uuid import uuid4

from models.cde import CDE, CDEInventory
from models.data_quality import DQRule, RuleExecutionResult, RuleLogic, Threshold
from models.issues import Issue, IssueFilters, Resolution
from models.controls import Control, ControlMatrix, ControlEvidence
from models.dashboard import DateRange, CDEQualityScore, QualityTrend, IssueSummary
from repository.in_memory import InMemoryGovernanceRepository
from services.dashboard import (
    DashboardService,
    get_cde_quality_scores,
    get_quality_trends,
    get_issues_summary,
    get_control_status,
    add_annotation,
)


@pytest.fixture
def repository():
    """Create a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def service(repository):
    """Create a Dashboard Service instance."""
    return DashboardService(repository)


@pytest.fixture
def sample_cde():
    """Create a sample CDE for testing."""
    return CDE(
        id=str(uuid4()),
        element_id=str(uuid4()),
        name="Test CDE",
        business_definition="A test CDE for unit testing",
        criticality_rationale="High regulatory impact",
        data_owner="test_owner",
        status="approved"
    )


@pytest.fixture
def sample_inventory(repository, sample_cde):
    """Create a sample CDE inventory."""
    report_id = "report-1"
    inventory = CDEInventory(
        report_id=report_id,
        cdes=[sample_cde],
        version=1,
        status="approved",
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    repository.set_cde_inventory(report_id, inventory)
    return inventory


def create_dq_rule(cde_id: str, dimension: str) -> DQRule:
    """Helper to create a DQ rule."""
    return DQRule(
        id=str(uuid4()),
        cde_id=cde_id,
        dimension=dimension,
        name=f"{dimension}_rule",
        description=f"Rule for {dimension}",
        logic=RuleLogic(type="null_check", expression="value IS NOT NULL"),
        threshold=Threshold(type="percentage", value=95.0),
        severity="high",
        owner="test_owner",
        enabled=True
    )


def create_execution_result(rule_id: str, passed: bool, executed_at: datetime = None) -> RuleExecutionResult:
    """Helper to create a rule execution result."""
    return RuleExecutionResult(
        rule_id=rule_id,
        passed=passed,
        actual_value=100.0 if passed else 50.0,
        expected_value=100.0,
        failed_records=0 if passed else 500,
        total_records=1000,
        executed_at=executed_at or datetime.now()
    )


class TestGetCDEQualityScores:
    """Tests for the get_cde_quality_scores function - Requirement 11.1."""
    
    def test_returns_empty_list_when_no_inventory(self, service):
        """Test that empty list is returned when no inventory exists."""
        scores = service.get_cde_quality_scores("nonexistent-report")
        assert scores == []
    
    def test_returns_empty_list_for_empty_inventory(self, service, repository):
        """Test that empty list is returned for empty inventory."""
        inventory = CDEInventory(
            report_id="report-1",
            cdes=[],
            version=1,
            status="approved",
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory("report-1", inventory)
        
        scores = service.get_cde_quality_scores("report-1")
        assert scores == []
    
    def test_returns_default_scores_when_no_rules(self, service, sample_inventory, sample_cde):
        """Test that default 100% scores are returned when CDE has no rules."""
        scores = service.get_cde_quality_scores("report-1")
        
        assert len(scores) == 1
        score = scores[0]
        assert score.cde_id == sample_cde.id
        assert score.completeness == 100.0
        assert score.accuracy == 100.0
        assert score.timeliness == 100.0
        assert score.overall_score == 100.0
        assert score.threshold_breached == False
    
    def test_calculates_scores_from_rule_results(self, service, repository, sample_inventory, sample_cde):
        """Test that scores are calculated from rule execution results."""
        # Create rules for each dimension
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        accuracy_rule = create_dq_rule(sample_cde.id, "accuracy")
        timeliness_rule = create_dq_rule(sample_cde.id, "timeliness")
        
        repository.add_dq_rule(completeness_rule)
        repository.add_dq_rule(accuracy_rule)
        repository.add_dq_rule(timeliness_rule)
        
        # Create execution results - all passing
        repository.store_rule_execution_result(create_execution_result(completeness_rule.id, True))
        repository.store_rule_execution_result(create_execution_result(accuracy_rule.id, True))
        repository.store_rule_execution_result(create_execution_result(timeliness_rule.id, True))
        
        scores = service.get_cde_quality_scores("report-1")
        
        assert len(scores) == 1
        score = scores[0]
        assert score.completeness == 100.0
        assert score.accuracy == 100.0
        assert score.timeliness == 100.0
        assert score.overall_score == 100.0
        assert score.threshold_breached == False
    
    def test_threshold_breached_when_score_below_85(self, service, repository, sample_inventory, sample_cde):
        """Test that threshold_breached is True when any score is below 85%."""
        # Create a rule with failing result
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        repository.add_dq_rule(completeness_rule)
        repository.store_rule_execution_result(create_execution_result(completeness_rule.id, False))
        
        scores = service.get_cde_quality_scores("report-1")
        
        assert len(scores) == 1
        score = scores[0]
        assert score.completeness == 0.0  # Failed rule = 0% pass rate
        assert score.threshold_breached == True
    
    def test_overall_score_is_average_of_dimensions(self, service, repository, sample_inventory, sample_cde):
        """Test that overall_score is the average of completeness, accuracy, timeliness."""
        # Create rules with mixed results
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        accuracy_rule = create_dq_rule(sample_cde.id, "accuracy")
        timeliness_rule = create_dq_rule(sample_cde.id, "timeliness")
        
        repository.add_dq_rule(completeness_rule)
        repository.add_dq_rule(accuracy_rule)
        repository.add_dq_rule(timeliness_rule)
        
        # Completeness passes, accuracy fails, timeliness passes
        repository.store_rule_execution_result(create_execution_result(completeness_rule.id, True))
        repository.store_rule_execution_result(create_execution_result(accuracy_rule.id, False))
        repository.store_rule_execution_result(create_execution_result(timeliness_rule.id, True))
        
        scores = service.get_cde_quality_scores("report-1")
        
        assert len(scores) == 1
        score = scores[0]
        expected_overall = (100.0 + 0.0 + 100.0) / 3
        assert abs(score.overall_score - expected_overall) < 0.01
    
    def test_uses_most_recent_execution_result(self, service, repository, sample_inventory, sample_cde):
        """Test that only the most recent execution result is used for scoring."""
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        repository.add_dq_rule(completeness_rule)
        
        # Old result: failed
        old_result = create_execution_result(
            completeness_rule.id, 
            False, 
            executed_at=datetime.now() - timedelta(days=7)
        )
        repository.store_rule_execution_result(old_result)
        
        # Recent result: passed
        recent_result = create_execution_result(
            completeness_rule.id, 
            True, 
            executed_at=datetime.now()
        )
        repository.store_rule_execution_result(recent_result)
        
        scores = service.get_cde_quality_scores("report-1")
        
        assert len(scores) == 1
        score = scores[0]
        # Should use the recent passing result
        assert score.completeness == 100.0


class TestGetQualityTrends:
    """Tests for the get_quality_trends function - Requirement 11.2."""
    
    def test_returns_empty_list_when_no_inventory(self, service):
        """Test that empty list is returned when no inventory exists."""
        period = DateRange(
            start=datetime.now() - timedelta(days=30),
            end=datetime.now()
        )
        trends = service.get_quality_trends("nonexistent-report", period)
        assert trends == []
    
    def test_returns_trends_for_period(self, service, repository, sample_inventory, sample_cde):
        """Test that trends are returned for the specified period."""
        # Create a rule
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        repository.add_dq_rule(completeness_rule)
        
        # Create execution results over multiple days
        for days_ago in [7, 5, 3, 1]:
            result = create_execution_result(
                completeness_rule.id,
                True,
                executed_at=datetime.now() - timedelta(days=days_ago)
            )
            repository.store_rule_execution_result(result)
        
        period = DateRange(
            start=datetime.now() - timedelta(days=10),
            end=datetime.now()
        )
        trends = service.get_quality_trends("report-1", period)
        
        # Should have trend entries for completeness dimension
        completeness_trends = [t for t in trends if t.dimension == "completeness"]
        assert len(completeness_trends) >= 1
    
    def test_trends_sorted_by_date(self, service, repository, sample_inventory, sample_cde):
        """Test that trends are sorted by date."""
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        repository.add_dq_rule(completeness_rule)
        
        # Create results in non-chronological order
        for days_ago in [1, 7, 3, 5]:
            result = create_execution_result(
                completeness_rule.id,
                True,
                executed_at=datetime.now() - timedelta(days=days_ago)
            )
            repository.store_rule_execution_result(result)
        
        period = DateRange(
            start=datetime.now() - timedelta(days=10),
            end=datetime.now()
        )
        trends = service.get_quality_trends("report-1", period)
        
        # Verify sorted by date
        dates = [t.date for t in trends]
        assert dates == sorted(dates)
    
    def test_filters_by_date_range(self, service, repository, sample_inventory, sample_cde):
        """Test that trends are filtered by the date range."""
        completeness_rule = create_dq_rule(sample_cde.id, "completeness")
        repository.add_dq_rule(completeness_rule)
        
        # Create results: one inside range, one outside
        inside_result = create_execution_result(
            completeness_rule.id,
            True,
            executed_at=datetime.now() - timedelta(days=5)
        )
        outside_result = create_execution_result(
            completeness_rule.id,
            True,
            executed_at=datetime.now() - timedelta(days=20)
        )
        repository.store_rule_execution_result(inside_result)
        repository.store_rule_execution_result(outside_result)
        
        period = DateRange(
            start=datetime.now() - timedelta(days=10),
            end=datetime.now()
        )
        trends = service.get_quality_trends("report-1", period)
        
        # Should only include the result within the period
        for trend in trends:
            assert trend.date >= period.start
            assert trend.date <= period.end


class TestGetIssuesSummary:
    """Tests for the get_issues_summary function - Requirement 11.3."""
    
    def test_returns_zero_counts_when_no_issues(self, service):
        """Test that zero counts are returned when no issues exist."""
        filters = IssueFilters()
        summary = service.get_issues_summary(filters)
        
        assert summary.total_open == 0
        assert summary.avg_resolution_time == 0.0
        assert summary.top_priority_items == []
    
    def test_counts_open_issues(self, service, repository):
        """Test that open issues are counted correctly."""
        # Create open issues
        for i in range(3):
            issue = Issue(
                id=str(uuid4()),
                title=f"Open Issue {i}",
                description="Test issue",
                source="test",
                severity="high",
                status="open",
                assignee="test_user",
                created_at=datetime.now()
            )
            repository.create_issue(issue)
        
        # Create a closed issue
        closed_issue = Issue(
            id=str(uuid4()),
            title="Closed Issue",
            description="Test issue",
            source="test",
            severity="high",
            status="closed",
            assignee="test_user",
            created_at=datetime.now()
        )
        repository.create_issue(closed_issue)
        
        filters = IssueFilters()
        summary = service.get_issues_summary(filters)
        
        assert summary.total_open == 3
    
    def test_counts_by_severity(self, service, repository):
        """Test that issues are counted by severity."""
        severities = ["critical", "high", "medium", "low"]
        for severity in severities:
            issue = Issue(
                id=str(uuid4()),
                title=f"{severity} Issue",
                description="Test issue",
                source="test",
                severity=severity,
                status="open",
                assignee="test_user",
                created_at=datetime.now()
            )
            repository.create_issue(issue)
        
        filters = IssueFilters()
        summary = service.get_issues_summary(filters)
        
        assert summary.by_severity["critical"] == 1
        assert summary.by_severity["high"] == 1
        assert summary.by_severity["medium"] == 1
        assert summary.by_severity["low"] == 1
    
    def test_calculates_avg_resolution_time(self, service, repository):
        """Test that average resolution time is calculated correctly."""
        # Create a resolved issue
        created_at = datetime.now() - timedelta(hours=24)
        resolved_at = datetime.now()
        
        issue = Issue(
            id=str(uuid4()),
            title="Resolved Issue",
            description="Test issue",
            source="test",
            severity="high",
            status="resolved",
            assignee="test_user",
            created_at=created_at,
            resolution=Resolution(
                type="data_correction",
                description="Fixed the data",
                implemented_by="fixer",
                implemented_at=resolved_at
            )
        )
        repository.create_issue(issue)
        
        filters = IssueFilters()
        summary = service.get_issues_summary(filters)
        
        # Resolution time should be approximately 24 hours in milliseconds
        expected_time_ms = 24 * 60 * 60 * 1000
        assert abs(summary.avg_resolution_time - expected_time_ms) < 1000  # Allow 1 second tolerance
    
    def test_top_priority_items_contains_critical_and_high(self, service, repository):
        """Test that top priority items include critical and high severity issues."""
        # Create critical issue
        critical_issue = Issue(
            id="critical-1",
            title="Critical Issue",
            description="Test issue",
            source="test",
            severity="critical",
            status="open",
            assignee="test_user",
            created_at=datetime.now()
        )
        repository.create_issue(critical_issue)
        
        # Create high severity issue
        high_issue = Issue(
            id="high-1",
            title="High Issue",
            description="Test issue",
            source="test",
            severity="high",
            status="open",
            assignee="test_user",
            created_at=datetime.now()
        )
        repository.create_issue(high_issue)
        
        # Create low severity issue (should not be in top priority)
        low_issue = Issue(
            id="low-1",
            title="Low Issue",
            description="Test issue",
            source="test",
            severity="low",
            status="open",
            assignee="test_user",
            created_at=datetime.now()
        )
        repository.create_issue(low_issue)
        
        filters = IssueFilters()
        summary = service.get_issues_summary(filters)
        
        assert "critical-1" in summary.top_priority_items
        assert "high-1" in summary.top_priority_items
        assert "low-1" not in summary.top_priority_items


class TestGetControlStatus:
    """Tests for the get_control_status function - Requirement 11.4."""
    
    def test_returns_empty_list_when_no_matrix(self, service):
        """Test that empty list is returned when no control matrix exists."""
        statuses = service.get_control_status("nonexistent-report")
        assert statuses == []
    
    def test_returns_control_statuses(self, service, repository):
        """Test that control statuses are returned correctly."""
        control = Control(
            id="control-1",
            name="Test Control",
            description="A test control",
            type="process",
            category="preventive",
            owner="test_owner",
            frequency="monthly",
            status="active",
            evidence=[
                ControlEvidence(
                    control_id="control-1",
                    execution_date=datetime.now(),
                    outcome="pass",
                    details="Control executed successfully",
                    executed_by="auditor"
                )
            ]
        )
        
        matrix = ControlMatrix(
            id="matrix-1",
            report_id="report-1",
            controls=[control],
            version=1,
            last_reviewed=datetime.now(),
            reviewed_by="reviewer"
        )
        repository.set_control_matrix("report-1", matrix)
        
        statuses = service.get_control_status("report-1")
        
        assert len(statuses) == 1
        status = statuses[0]
        assert status.control_id == "control-1"
        assert status.control_name == "Test Control"
        assert status.status == "pass"
    
    def test_uses_most_recent_evidence(self, service, repository):
        """Test that the most recent evidence is used for status."""
        old_evidence = ControlEvidence(
            control_id="control-1",
            execution_date=datetime.now() - timedelta(days=7),
            outcome="fail",
            details="Control failed",
            executed_by="auditor"
        )
        recent_evidence = ControlEvidence(
            control_id="control-1",
            execution_date=datetime.now(),
            outcome="pass",
            details="Control passed",
            executed_by="auditor"
        )
        
        control = Control(
            id="control-1",
            name="Test Control",
            description="A test control",
            type="process",
            category="preventive",
            owner="test_owner",
            frequency="monthly",
            status="active",
            evidence=[old_evidence, recent_evidence]
        )
        
        matrix = ControlMatrix(
            id="matrix-1",
            report_id="report-1",
            controls=[control],
            version=1,
            last_reviewed=datetime.now(),
            reviewed_by="reviewer"
        )
        repository.set_control_matrix("report-1", matrix)
        
        statuses = service.get_control_status("report-1")
        
        assert len(statuses) == 1
        assert statuses[0].status == "pass"  # Should use recent evidence
    
    def test_pending_status_when_no_evidence(self, service, repository):
        """Test that status is 'pending' when no evidence exists."""
        control = Control(
            id="control-1",
            name="Test Control",
            description="A test control",
            type="process",
            category="preventive",
            owner="test_owner",
            frequency="monthly",
            status="active",
            evidence=[]
        )
        
        matrix = ControlMatrix(
            id="matrix-1",
            report_id="report-1",
            controls=[control],
            version=1,
            last_reviewed=datetime.now(),
            reviewed_by="reviewer"
        )
        repository.set_control_matrix("report-1", matrix)
        
        statuses = service.get_control_status("report-1")
        
        assert len(statuses) == 1
        assert statuses[0].status == "pending"


class TestAddAnnotation:
    """Tests for the add_annotation function - Requirement 11.6."""
    
    def test_creates_annotation(self, service):
        """Test that an annotation is created successfully."""
        annotation = service.add_annotation(
            metric_id="metric-1",
            comment="This is a test annotation",
            created_by="test_user"
        )
        
        assert annotation.metric_id == "metric-1"
        assert annotation.comment == "This is a test annotation"
        assert annotation.created_by == "test_user"
        assert annotation.id is not None
    
    def test_annotation_retrievable(self, service):
        """Test that created annotations can be retrieved."""
        service.add_annotation(
            metric_id="metric-1",
            comment="First annotation",
            created_by="user1"
        )
        service.add_annotation(
            metric_id="metric-1",
            comment="Second annotation",
            created_by="user2"
        )
        
        annotations = service.get_annotations("metric-1")
        
        assert len(annotations) == 2
        comments = [a.comment for a in annotations]
        assert "First annotation" in comments
        assert "Second annotation" in comments
    
    def test_annotations_isolated_by_metric(self, service):
        """Test that annotations are isolated by metric ID."""
        service.add_annotation("metric-1", "Annotation for metric 1", "user")
        service.add_annotation("metric-2", "Annotation for metric 2", "user")
        
        metric1_annotations = service.get_annotations("metric-1")
        metric2_annotations = service.get_annotations("metric-2")
        
        assert len(metric1_annotations) == 1
        assert len(metric2_annotations) == 1
        assert metric1_annotations[0].comment == "Annotation for metric 1"
        assert metric2_annotations[0].comment == "Annotation for metric 2"
    
    def test_creates_audit_entry(self, service, repository):
        """Test that adding an annotation creates an audit entry."""
        service.add_annotation(
            metric_id="metric-1",
            comment="Test annotation",
            created_by="test_user"
        )
        
        entries = repository.get_audit_entries(
            entity_type="Annotation",
            action="add_annotation"
        )
        
        assert len(entries) == 1
        assert entries[0].actor == "test_user"


class TestGetCDEDetail:
    """Tests for the get_cde_detail function - Requirement 11.5."""
    
    def test_returns_none_when_no_inventory(self, service):
        """Test that None is returned when no inventory exists."""
        detail = service.get_cde_detail("nonexistent-report", "cde-1")
        assert detail is None
    
    def test_returns_none_when_cde_not_found(self, service, sample_inventory):
        """Test that None is returned when CDE is not found."""
        detail = service.get_cde_detail("report-1", "nonexistent-cde")
        assert detail is None
    
    def test_returns_cde_detail(self, service, sample_inventory, sample_cde):
        """Test that CDE detail is returned correctly."""
        detail = service.get_cde_detail("report-1", sample_cde.id)
        
        assert detail is not None
        assert detail.cde.id == sample_cde.id
        assert detail.cde.name == sample_cde.name
    
    def test_includes_rules(self, service, repository, sample_inventory, sample_cde):
        """Test that CDE detail includes associated rules."""
        rule = create_dq_rule(sample_cde.id, "completeness")
        repository.add_dq_rule(rule)
        
        detail = service.get_cde_detail("report-1", sample_cde.id)
        
        assert detail is not None
        assert len(detail.rules) == 1
        assert detail.rules[0].id == rule.id


class TestConvenienceFunctions:
    """Tests for the module-level convenience functions."""
    
    def test_get_cde_quality_scores_function(self, repository, sample_inventory):
        """Test the get_cde_quality_scores convenience function."""
        scores = get_cde_quality_scores(repository, "report-1")
        assert len(scores) == 1
    
    def test_get_quality_trends_function(self, repository, sample_inventory):
        """Test the get_quality_trends convenience function."""
        period = DateRange(
            start=datetime.now() - timedelta(days=30),
            end=datetime.now()
        )
        trends = get_quality_trends(repository, "report-1", period)
        assert isinstance(trends, list)
    
    def test_get_issues_summary_function(self, repository):
        """Test the get_issues_summary convenience function."""
        filters = IssueFilters()
        summary = get_issues_summary(repository, filters)
        assert isinstance(summary, IssueSummary)
    
    def test_get_control_status_function(self, repository):
        """Test the get_control_status convenience function."""
        statuses = get_control_status(repository, "report-1")
        assert isinstance(statuses, list)
    
    def test_add_annotation_function(self, repository):
        """Test the add_annotation convenience function."""
        annotation = add_annotation(
            repository,
            "metric-1",
            "Test comment",
            "test_user"
        )
        assert annotation.metric_id == "metric-1"
