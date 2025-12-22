"""
Unit tests for the Business Rules Engine.

Tests rule definition, evaluation, versioning, and simulation functionality.
"""

import pytest
from datetime import datetime, timedelta

from models.business_rules import (
    Condition,
    ConditionGroup,
    Action,
    BusinessRule,
    RuleGroup,
    RuleTestCase,
    RuleSimulation,
)
from services.business_rules_engine import BusinessRulesEngine
from repository.in_memory import InMemoryGovernanceRepository


@pytest.fixture
def repository():
    """Create an in-memory repository for testing."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def engine(repository):
    """Create a business rules engine for testing."""
    return BusinessRulesEngine(repository, tenant_id="test-tenant")


@pytest.fixture
def sample_rule():
    """Create a sample business rule."""
    return BusinessRule(
        name="High Severity Escalation",
        description="Escalate issues with high severity",
        category="escalation",
        priority=10,
        status="active",
        condition_group=ConditionGroup(
            conditions=[
                Condition(
                    field="severity",
                    operator="equals",
                    value="critical"
                )
            ]
        ),
        actions=[
            Action(
                action_type="escalate",
                parameters={"level": 2, "reason": "Critical severity detected"}
            ),
            Action(
                action_type="notify",
                parameters={
                    "recipients": ["manager@example.com"],
                    "message": "Critical issue requires attention"
                }
            )
        ]
    )


class TestConditionEvaluation:
    """Tests for condition evaluation logic."""
    
    def test_equals_operator(self):
        """Test equals operator."""
        condition = Condition(field="status", operator="equals", value="active")
        assert condition.evaluate({"status": "active"}) is True
        assert condition.evaluate({"status": "inactive"}) is False
    
    def test_not_equals_operator(self):
        """Test not_equals operator."""
        condition = Condition(field="status", operator="not_equals", value="active")
        assert condition.evaluate({"status": "inactive"}) is True
        assert condition.evaluate({"status": "active"}) is False
    
    def test_greater_than_operator(self):
        """Test greater_than operator."""
        condition = Condition(field="score", operator="greater_than", value=0.5)
        assert condition.evaluate({"score": 0.8}) is True
        assert condition.evaluate({"score": 0.3}) is False
    
    def test_less_than_operator(self):
        """Test less_than operator."""
        condition = Condition(field="score", operator="less_than", value=0.5)
        assert condition.evaluate({"score": 0.3}) is True
        assert condition.evaluate({"score": 0.8}) is False
    
    def test_contains_operator(self):
        """Test contains operator."""
        condition = Condition(field="tags", operator="contains", value="urgent")
        assert condition.evaluate({"tags": ["urgent", "review"]}) is True
        assert condition.evaluate({"tags": ["normal"]}) is False
    
    def test_in_operator(self):
        """Test in operator."""
        condition = Condition(field="status", operator="in", value=["active", "pending"])
        assert condition.evaluate({"status": "active"}) is True
        assert condition.evaluate({"status": "closed"}) is False
    
    def test_is_null_operator(self):
        """Test is_null operator."""
        condition = Condition(field="owner", operator="is_null", value=None)
        assert condition.evaluate({"owner": None}) is True
        assert condition.evaluate({"owner": "john"}) is False
    
    def test_nested_field_access(self):
        """Test accessing nested fields with dot notation."""
        condition = Condition(field="issue.severity", operator="equals", value="high")
        assert condition.evaluate({"issue": {"severity": "high"}}) is True
        assert condition.evaluate({"issue": {"severity": "low"}}) is False
    
    def test_between_operator(self):
        """Test between operator."""
        condition = Condition(field="score", operator="between", value=[0.3, 0.7])
        assert condition.evaluate({"score": 0.5}) is True
        assert condition.evaluate({"score": 0.1}) is False
        assert condition.evaluate({"score": 0.9}) is False


class TestConditionGroupEvaluation:
    """Tests for condition group evaluation."""
    
    def test_and_group_all_true(self):
        """Test AND group with all conditions true."""
        group = ConditionGroup(
            conditions=[
                Condition(field="status", operator="equals", value="active"),
                Condition(field="score", operator="greater_than", value=0.5)
            ],
            logical_operator="and"
        )
        assert group.evaluate({"status": "active", "score": 0.8}) is True
    
    def test_and_group_one_false(self):
        """Test AND group with one condition false."""
        group = ConditionGroup(
            conditions=[
                Condition(field="status", operator="equals", value="active"),
                Condition(field="score", operator="greater_than", value=0.5)
            ],
            logical_operator="and"
        )
        assert group.evaluate({"status": "active", "score": 0.3}) is False
    
    def test_or_group_one_true(self):
        """Test OR group with one condition true."""
        group = ConditionGroup(
            conditions=[
                Condition(field="status", operator="equals", value="active"),
                Condition(field="score", operator="greater_than", value=0.9)
            ],
            logical_operator="or"
        )
        assert group.evaluate({"status": "active", "score": 0.3}) is True
    
    def test_or_group_all_false(self):
        """Test OR group with all conditions false."""
        group = ConditionGroup(
            conditions=[
                Condition(field="status", operator="equals", value="active"),
                Condition(field="score", operator="greater_than", value=0.9)
            ],
            logical_operator="or"
        )
        assert group.evaluate({"status": "inactive", "score": 0.3}) is False
    
    def test_nested_groups(self):
        """Test nested condition groups."""
        inner_group = ConditionGroup(
            conditions=[
                Condition(field="priority", operator="equals", value="high")
            ],
            logical_operator="and"
        )
        outer_group = ConditionGroup(
            conditions=[
                Condition(field="status", operator="equals", value="active")
            ],
            nested_groups=[inner_group],
            logical_operator="and"
        )
        assert outer_group.evaluate({"status": "active", "priority": "high"}) is True
        assert outer_group.evaluate({"status": "active", "priority": "low"}) is False


class TestActionExecution:
    """Tests for action execution."""
    
    def test_set_value_action(self):
        """Test set_value action."""
        action = Action(
            action_type="set_value",
            target_field="status",
            value="escalated"
        )
        result = action.execute({})
        assert result["changes"]["status"] == "escalated"
    
    def test_escalate_action(self):
        """Test escalate action."""
        action = Action(
            action_type="escalate",
            parameters={"level": 2, "reason": "Critical issue"}
        )
        result = action.execute({})
        assert result["escalation"]["level"] == 2
        assert result["escalation"]["reason"] == "Critical issue"
    
    def test_notify_action(self):
        """Test notify action."""
        action = Action(
            action_type="notify",
            parameters={
                "recipients": ["user@example.com"],
                "message": "Test notification",
                "channel": "email"
            }
        )
        result = action.execute({})
        assert result["notification"]["recipients"] == ["user@example.com"]
        assert result["notification"]["message"] == "Test notification"
    
    def test_block_action(self):
        """Test block_action action."""
        action = Action(
            action_type="block_action",
            parameters={"reason": "Policy violation"}
        )
        result = action.execute({})
        assert result["blocked"] is True
        assert result["block_reason"] == "Policy violation"


class TestBusinessRuleEvaluation:
    """Tests for business rule evaluation."""
    
    def test_rule_matches(self, sample_rule):
        """Test rule matching."""
        context = {"severity": "critical"}
        assert sample_rule.evaluate(context) is True
    
    def test_rule_does_not_match(self, sample_rule):
        """Test rule not matching."""
        context = {"severity": "low"}
        assert sample_rule.evaluate(context) is False
    
    def test_rule_is_active(self, sample_rule):
        """Test rule active status."""
        assert sample_rule.is_active() is True
        
        sample_rule.status = "inactive"
        assert sample_rule.is_active() is False
    
    def test_rule_effective_dates(self, sample_rule):
        """Test rule effective date checking."""
        sample_rule.effective_from = datetime.now() - timedelta(days=1)
        sample_rule.effective_until = datetime.now() + timedelta(days=1)
        assert sample_rule.is_active() is True
        
        # Future effective date
        sample_rule.effective_from = datetime.now() + timedelta(days=1)
        assert sample_rule.is_active() is False
    
    def test_execute_actions(self, sample_rule):
        """Test executing rule actions."""
        context = {"severity": "critical"}
        results = sample_rule.execute_actions(context)
        assert len(results) == 2
        assert results[0]["action_type"] == "escalate"
        assert results[1]["action_type"] == "notify"


class TestBusinessRulesEngine:
    """Tests for the business rules engine."""
    
    def test_add_rule(self, engine, sample_rule):
        """Test adding a rule."""
        added_rule = engine.add_rule(sample_rule, created_by="test-user")
        assert added_rule.id == sample_rule.id
        assert added_rule.tenant_id == "test-tenant"
        assert added_rule.version == 1
    
    def test_get_rule(self, engine, sample_rule):
        """Test getting a rule."""
        engine.add_rule(sample_rule)
        retrieved = engine.get_rule(sample_rule.id)
        assert retrieved is not None
        assert retrieved.name == sample_rule.name
    
    def test_update_rule(self, engine, sample_rule):
        """Test updating a rule."""
        engine.add_rule(sample_rule)
        updated = engine.update_rule(
            sample_rule.id,
            {"name": "Updated Rule Name"},
            updated_by="test-user",
            change_reason="Testing update"
        )
        assert updated.name == "Updated Rule Name"
        assert updated.version == 2
    
    def test_delete_rule(self, engine, sample_rule):
        """Test deleting (archiving) a rule."""
        engine.add_rule(sample_rule)
        result = engine.delete_rule(sample_rule.id, deleted_by="test-user")
        assert result is True
        
        rule = engine.get_rule(sample_rule.id)
        assert rule.status == "archived"
    
    def test_get_rules_by_category(self, engine, sample_rule):
        """Test filtering rules by category."""
        engine.add_rule(sample_rule)
        
        rules = engine.get_rules(category="escalation")
        assert len(rules) == 1
        
        rules = engine.get_rules(category="validation")
        assert len(rules) == 0
    
    def test_evaluate_rules(self, engine, sample_rule):
        """Test evaluating rules against context."""
        sample_rule.status = "active"
        engine.add_rule(sample_rule)
        
        result = engine.evaluate({"severity": "critical"})
        assert result.rules_evaluated == 1
        assert result.rules_matched == 1
        assert sample_rule.id in result.matched_rule_ids
    
    def test_evaluate_priority_order(self, engine):
        """Test rules are evaluated in priority order."""
        rule1 = BusinessRule(
            name="Low Priority Rule",
            category="escalation",
            priority=100,
            status="active",
            condition_group=ConditionGroup(
                conditions=[Condition(field="type", operator="equals", value="test")]
            ),
            actions=[Action(action_type="set_value", target_field="matched", value="rule1")]
        )
        rule2 = BusinessRule(
            name="High Priority Rule",
            category="escalation",
            priority=10,
            status="active",
            condition_group=ConditionGroup(
                conditions=[Condition(field="type", operator="equals", value="test")]
            ),
            actions=[Action(action_type="set_value", target_field="matched", value="rule2")],
            stop_processing=True
        )
        
        engine.add_rule(rule1)
        engine.add_rule(rule2)
        
        result = engine.evaluate({"type": "test"})
        
        # High priority rule should match first and stop processing
        assert result.rules_matched == 1
        assert result.processing_stopped is True
        assert result.stopped_by_rule == rule2.id
    
    def test_short_circuit_evaluation(self, engine):
        """Test short-circuit evaluation stops processing."""
        rule1 = BusinessRule(
            name="First Rule",
            category="validation",
            priority=1,
            status="active",
            condition_group=ConditionGroup(
                conditions=[Condition(field="check", operator="equals", value=True)]
            ),
            actions=[Action(action_type="log_event", parameters={})],
            stop_processing=True
        )
        rule2 = BusinessRule(
            name="Second Rule",
            category="validation",
            priority=2,
            status="active",
            condition_group=ConditionGroup(
                conditions=[Condition(field="check", operator="equals", value=True)]
            ),
            actions=[Action(action_type="log_event", parameters={})]
        )
        
        engine.add_rule(rule1)
        engine.add_rule(rule2)
        
        result = engine.evaluate({"check": True})
        
        # Only first rule should match due to stop_processing
        assert result.rules_matched == 1
        assert result.processing_stopped is True


class TestRuleVersioning:
    """Tests for rule versioning functionality."""
    
    def test_version_created_on_add(self, engine, sample_rule):
        """Test version is created when rule is added."""
        engine.add_rule(sample_rule)
        versions = engine.get_rule_versions(sample_rule.id)
        assert len(versions) == 1
        assert versions[0].version == 1
    
    def test_version_created_on_update(self, engine, sample_rule):
        """Test version is created when rule is updated."""
        engine.add_rule(sample_rule)
        engine.update_rule(sample_rule.id, {"name": "Updated"})
        
        versions = engine.get_rule_versions(sample_rule.id)
        assert len(versions) == 2
        assert versions[1].version == 2
    
    def test_rollback_rule(self, engine, sample_rule):
        """Test rolling back a rule to previous version."""
        engine.add_rule(sample_rule)
        original_name = sample_rule.name
        
        engine.update_rule(sample_rule.id, {"name": "Changed Name"})
        
        rolled_back = engine.rollback_rule(sample_rule.id, 1, rolled_back_by="test-user")
        assert rolled_back.name == original_name
        assert rolled_back.version == 3  # New version created for rollback
    
    def test_get_rule_at_time(self, engine, sample_rule):
        """Test getting rule state at a specific time."""
        engine.add_rule(sample_rule)
        original_name = sample_rule.name
        
        # Record time before update
        before_update = datetime.now()
        
        engine.update_rule(sample_rule.id, {"name": "Changed Name"})
        
        # Get rule state before update
        historical_state = engine.get_rule_at_time(sample_rule.id, before_update)
        assert historical_state is not None
        assert historical_state["name"] == original_name


class TestRuleTesting:
    """Tests for rule testing functionality."""
    
    def test_run_test_case_pass(self, engine, sample_rule):
        """Test running a passing test case."""
        engine.add_rule(sample_rule)
        
        test_case = RuleTestCase(
            rule_id=sample_rule.id,
            name="Test critical severity",
            input_context={"severity": "critical"},
            expected_match=True,
            expected_actions=["escalate", "notify"]
        )
        
        passed, details = engine.run_test_case(test_case)
        assert passed is True
        assert details["match_correct"] is True
    
    def test_run_test_case_fail(self, engine, sample_rule):
        """Test running a failing test case."""
        engine.add_rule(sample_rule)
        
        test_case = RuleTestCase(
            rule_id=sample_rule.id,
            name="Test wrong expectation",
            input_context={"severity": "low"},
            expected_match=True,  # Wrong expectation
            expected_actions=[]
        )
        
        passed, details = engine.run_test_case(test_case)
        assert passed is False
        assert details["match_correct"] is False


class TestRuleSimulation:
    """Tests for rule simulation functionality."""
    
    def test_run_simulation(self, engine, sample_rule):
        """Test running a simulation."""
        sample_rule.status = "active"
        engine.add_rule(sample_rule)
        
        simulation = RuleSimulation(
            name="Test Simulation",
            rule_ids=[sample_rule.id],
            sample_contexts=[
                {"id": "1", "severity": "critical"},
                {"id": "2", "severity": "low"},
                {"id": "3", "severity": "critical"}
            ]
        )
        
        result = engine.run_simulation(simulation)
        
        assert result.status == "completed"
        assert len(result.results) == 3
        
        # First and third contexts should match
        assert len(result.results[0].matched_rules) == 1
        assert len(result.results[1].matched_rules) == 0
        assert len(result.results[2].matched_rules) == 1
    
    def test_analyze_impact(self, engine, sample_rule):
        """Test impact analysis."""
        sample_rule.status = "active"
        engine.add_rule(sample_rule)
        
        sample_contexts = [
            {"id": "1", "severity": "critical"},
            {"id": "2", "severity": "low"},
            {"id": "3", "severity": "high"}
        ]
        
        analysis = engine.analyze_impact(
            rule_id=sample_rule.id,
            analysis_type="deactivate",
            sample_contexts=sample_contexts
        )
        
        assert analysis.current_matches == 1  # Only "critical" matches
        assert analysis.projected_matches == 0  # After deactivation, no matches


class TestRuleGroups:
    """Tests for rule group functionality."""
    
    def test_create_group(self, engine):
        """Test creating a rule group."""
        group = RuleGroup(
            name="Escalation Rules",
            category="escalation"
        )
        created = engine.create_group(group)
        assert created.tenant_id == "test-tenant"
    
    def test_add_rule_to_group(self, engine, sample_rule):
        """Test adding a rule to a group."""
        engine.add_rule(sample_rule)
        
        group = RuleGroup(name="Test Group", category="escalation")
        engine.create_group(group)
        
        updated_group = engine.add_rule_to_group(group.id, sample_rule.id)
        assert sample_rule.id in updated_group.rules
    
    def test_evaluate_group(self, engine, sample_rule):
        """Test evaluating all rules in a group."""
        sample_rule.status = "active"
        engine.add_rule(sample_rule)
        
        group = RuleGroup(name="Test Group", category="escalation")
        engine.create_group(group)
        engine.add_rule_to_group(group.id, sample_rule.id)
        
        result = engine.evaluate_group(group.id, {"severity": "critical"})
        assert result.rules_matched == 1


class TestUtilityMethods:
    """Tests for utility methods."""
    
    def test_activate_rule(self, engine, sample_rule):
        """Test activating a rule."""
        sample_rule.status = "draft"
        engine.add_rule(sample_rule)
        
        activated = engine.activate_rule(sample_rule.id)
        assert activated.status == "active"
    
    def test_deactivate_rule(self, engine, sample_rule):
        """Test deactivating a rule."""
        sample_rule.status = "active"
        engine.add_rule(sample_rule)
        
        deactivated = engine.deactivate_rule(sample_rule.id)
        assert deactivated.status == "inactive"
    
    def test_clone_rule(self, engine, sample_rule):
        """Test cloning a rule."""
        engine.add_rule(sample_rule)
        
        cloned = engine.clone_rule(sample_rule.id, "Cloned Rule")
        assert cloned.id != sample_rule.id
        assert cloned.name == "Cloned Rule"
        assert cloned.status == "draft"
        assert cloned.category == sample_rule.category
