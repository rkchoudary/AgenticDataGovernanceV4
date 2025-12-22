"""
**Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**

For any CDE displayed on the dashboard, the quality scores (completeness, accuracy, 
timeliness) must match the most recent rule execution results for that CDE, and 
thresholdBreached must be true if and only if any score is below the configured threshold.

**Validates: Requirements 11.1**
"""

import pytest
from datetime import datetime, timedelta
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.cde import CDE, CDEInventory
from models.data_quality import DQRule, RuleExecutionResult, RuleLogic, Threshold
from repository.in_memory import InMemoryGovernanceRepository
from services.dashboard import DashboardService


# Strategies for generating test data
uuid_strategy = st.uuids().map(str)

non_empty_string_strategy = st.text(
    min_size=1,
    max_size=50,
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)

# DQ dimensions for quality scoring
quality_dimensions = ['completeness', 'accuracy', 'timeliness']
all_dimensions = ['completeness', 'accuracy', 'validity', 'consistency', 'timeliness', 'uniqueness', 'integrity']


@st.composite
def cde_strategy(draw):
    """Generate a CDE."""
    return CDE(
        id=draw(uuid_strategy),
        element_id=draw(uuid_strategy),
        name=draw(non_empty_string_strategy),
        business_definition=draw(st.text(min_size=10, max_size=100)),
        criticality_rationale=draw(st.text(min_size=10, max_size=100)),
        data_owner=draw(non_empty_string_strategy),
        status='approved'
    )


@st.composite
def dq_rule_strategy(draw, cde_id: str, dimension: str):
    """Generate a DQ rule for a specific CDE and dimension."""
    return DQRule(
        id=draw(uuid_strategy),
        cde_id=cde_id,
        dimension=dimension,
        name=f"{dimension}_rule_{draw(st.integers(min_value=1, max_value=1000))}",
        description=f"Rule for {dimension}",
        logic=RuleLogic(
            type='null_check',
            expression='value IS NOT NULL'
        ),
        threshold=Threshold(
            type='percentage',
            value=draw(st.floats(min_value=80.0, max_value=100.0))
        ),
        severity='high',
        owner=draw(non_empty_string_strategy),
        enabled=True
    )


@st.composite
def rule_execution_result_strategy(draw, rule_id: str, passed: bool = None):
    """Generate a rule execution result."""
    if passed is None:
        passed = draw(st.booleans())
    
    total_records = draw(st.integers(min_value=100, max_value=10000))
    if passed:
        failed_records = 0
        actual_value = 100.0
    else:
        failed_records = draw(st.integers(min_value=1, max_value=total_records // 2))
        actual_value = ((total_records - failed_records) / total_records) * 100
    
    return RuleExecutionResult(
        rule_id=rule_id,
        passed=passed,
        actual_value=actual_value,
        expected_value=100.0,
        failed_records=failed_records,
        total_records=total_records,
        executed_at=datetime.now() - timedelta(hours=draw(st.integers(min_value=0, max_value=24)))
    )


@st.composite
def cde_with_rules_and_results_strategy(draw, num_rules_per_dimension: int = 1):
    """Generate a CDE with DQ rules and execution results for quality dimensions."""
    cde = draw(cde_strategy())
    rules = []
    results = []
    
    for dimension in quality_dimensions:
        for _ in range(num_rules_per_dimension):
            rule = draw(dq_rule_strategy(cde.id, dimension))
            rules.append(rule)
            
            # Generate at least one execution result for each rule
            result = draw(rule_execution_result_strategy(rule.id))
            results.append(result)
    
    return cde, rules, results


class TestDashboardQualityScoreConsistency:
    """
    Property 23: Dashboard Quality Score Consistency
    
    Tests that CDE quality scores on the dashboard match the most recent
    rule execution results.
    """
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_quality_scores_match_rule_execution_results(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: For any CDE, the quality scores (completeness, accuracy, timeliness)
        must be calculated from the most recent rule execution results for that CDE.
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        # Generate CDE with rules and results
        cde, rules, results = data.draw(cde_with_rules_and_results_strategy())
        
        # Create CDE inventory
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Add rules and results to repository
        for rule in rules:
            repository.add_dq_rule(rule)
        for result in results:
            repository.store_rule_execution_result(result)
        
        # Get quality scores from dashboard service
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 1, f"Expected 1 CDE score, got {len(scores)}"
        cde_score = scores[0]
        
        # Calculate expected scores manually
        for dimension in quality_dimensions:
            dimension_rules = [r for r in rules if r.dimension == dimension]
            dimension_results = []
            for rule in dimension_rules:
                rule_results = [res for res in results if res.rule_id == rule.id]
                if rule_results:
                    # Get most recent result
                    latest = max(rule_results, key=lambda r: r.executed_at)
                    dimension_results.append(latest)
            
            if dimension_results:
                # Calculate pass rate
                passed_count = sum(1 for r in dimension_results if r.passed)
                expected_score = (passed_count / len(dimension_results)) * 100
            else:
                expected_score = 100.0  # Default when no results
            
            actual_score = getattr(cde_score, dimension)
            assert abs(actual_score - expected_score) < 0.01, \
                f"{dimension} score mismatch: expected {expected_score:.2f}, got {actual_score:.2f}"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_threshold_breached_when_score_below_threshold(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: thresholdBreached must be true if and only if any quality score
        (completeness, accuracy, timeliness) is below the configured threshold (85.0).
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        cde = data.draw(cde_strategy())
        
        # Create CDE inventory
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create rules for each dimension with specific pass/fail results
        rules = []
        results = []
        
        # Randomly decide which dimensions should fail (score < 85%)
        failing_dimensions = data.draw(st.lists(
            st.sampled_from(quality_dimensions),
            min_size=0,
            max_size=3,
            unique=True
        ))
        
        for dimension in quality_dimensions:
            rule = data.draw(dq_rule_strategy(cde.id, dimension))
            rules.append(rule)
            
            # If dimension should fail, create a failing result
            should_fail = dimension in failing_dimensions
            result = data.draw(rule_execution_result_strategy(rule.id, passed=not should_fail))
            results.append(result)
        
        # Add rules and results to repository
        for rule in rules:
            repository.add_dq_rule(rule)
        for result in results:
            repository.store_rule_execution_result(result)
        
        # Get quality scores from dashboard service
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 1
        cde_score = scores[0]
        
        # Check threshold breach logic
        threshold = 85.0
        any_below_threshold = (
            cde_score.completeness < threshold or
            cde_score.accuracy < threshold or
            cde_score.timeliness < threshold
        )
        
        assert cde_score.threshold_breached == any_below_threshold, \
            f"threshold_breached should be {any_below_threshold}, got {cde_score.threshold_breached}. " \
            f"Scores: completeness={cde_score.completeness:.2f}, accuracy={cde_score.accuracy:.2f}, " \
            f"timeliness={cde_score.timeliness:.2f}"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_most_recent_results_used_for_scoring(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: When multiple execution results exist for a rule, only the most
        recent result should be used for score calculation.
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        cde = data.draw(cde_strategy())
        
        # Create CDE inventory
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Create a rule for completeness
        rule = data.draw(dq_rule_strategy(cde.id, 'completeness'))
        repository.add_dq_rule(rule)
        
        # Create multiple results with different timestamps
        # Old result: failed
        old_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=False,
            actual_value=50.0,
            expected_value=100.0,
            failed_records=500,
            total_records=1000,
            executed_at=datetime.now() - timedelta(days=7)
        )
        repository.store_rule_execution_result(old_result)
        
        # Recent result: passed
        recent_passed = data.draw(st.booleans())
        recent_result = RuleExecutionResult(
            rule_id=rule.id,
            passed=recent_passed,
            actual_value=100.0 if recent_passed else 0.0,
            expected_value=100.0,
            failed_records=0 if recent_passed else 1000,
            total_records=1000,
            executed_at=datetime.now() - timedelta(hours=1)
        )
        repository.store_rule_execution_result(recent_result)
        
        # Get quality scores
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 1
        cde_score = scores[0]
        
        # Completeness should reflect the most recent result
        expected_completeness = 100.0 if recent_passed else 0.0
        assert cde_score.completeness == expected_completeness, \
            f"Completeness should be {expected_completeness} (from most recent result), " \
            f"got {cde_score.completeness}"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_overall_score_is_average_of_dimensions(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: The overall_score must be the average of completeness, accuracy,
        and timeliness scores.
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        # Generate CDE with rules and results
        cde, rules, results = data.draw(cde_with_rules_and_results_strategy())
        
        # Create CDE inventory
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Add rules and results to repository
        for rule in rules:
            repository.add_dq_rule(rule)
        for result in results:
            repository.store_rule_execution_result(result)
        
        # Get quality scores
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 1
        cde_score = scores[0]
        
        # Verify overall score is average of the three dimensions
        expected_overall = (cde_score.completeness + cde_score.accuracy + cde_score.timeliness) / 3
        assert abs(cde_score.overall_score - expected_overall) < 0.01, \
            f"overall_score should be {expected_overall:.2f}, got {cde_score.overall_score:.2f}"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_empty_inventory_returns_empty_scores(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: For an empty CDE inventory, the dashboard should return no scores.
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        # Create empty CDE inventory
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Get quality scores
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 0, f"Expected 0 scores for empty inventory, got {len(scores)}"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_cde_without_rules_has_default_scores(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: For a CDE with no DQ rules, the quality scores should default to 100%.
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        cde = data.draw(cde_strategy())
        
        # Create CDE inventory with no rules
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Get quality scores (no rules added)
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 1
        cde_score = scores[0]
        
        # All scores should default to 100%
        assert cde_score.completeness == 100.0, \
            f"Completeness should default to 100.0, got {cde_score.completeness}"
        assert cde_score.accuracy == 100.0, \
            f"Accuracy should default to 100.0, got {cde_score.accuracy}"
        assert cde_score.timeliness == 100.0, \
            f"Timeliness should default to 100.0, got {cde_score.timeliness}"
        assert cde_score.threshold_breached == False, \
            "threshold_breached should be False when all scores are 100%"
    
    @settings(max_examples=100)
    @given(data=st.data())
    def test_multiple_cdes_scored_independently(self, data):
        """
        **Feature: agentcore-python-refactor, Property 23: Dashboard Quality Score Consistency**
        **Validates: Requirements 11.1**
        
        Property: When multiple CDEs exist, each CDE's quality scores must be
        calculated independently from its own rules and results.
        """
        repository = InMemoryGovernanceRepository()
        report_id = data.draw(uuid_strategy)
        
        # Generate two CDEs with different rules and results
        cde1, rules1, results1 = data.draw(cde_with_rules_and_results_strategy())
        cde2, rules2, results2 = data.draw(cde_with_rules_and_results_strategy())
        
        # Ensure CDEs have different IDs
        assume(cde1.id != cde2.id)
        
        # Create CDE inventory with both CDEs
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde1, cde2],
            version=1,
            status='approved',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)
        
        # Add rules and results for both CDEs
        for rule in rules1 + rules2:
            repository.add_dq_rule(rule)
        for result in results1 + results2:
            repository.store_rule_execution_result(result)
        
        # Get quality scores
        service = DashboardService(repository)
        scores = service.get_cde_quality_scores(report_id)
        
        assert len(scores) == 2, f"Expected 2 CDE scores, got {len(scores)}"
        
        # Verify each CDE has its own score entry
        cde_ids = {s.cde_id for s in scores}
        assert cde1.id in cde_ids, f"CDE1 ({cde1.id}) should have a score"
        assert cde2.id in cde_ids, f"CDE2 ({cde2.id}) should have a score"
