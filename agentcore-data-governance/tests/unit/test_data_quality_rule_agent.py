"""
Unit tests for the Data Quality Rule Agent.

Tests rule generation, ingestion, threshold updates, and rule execution.
Requirements: 7.1, 7.2, 7.3
"""
import pytest
from datetime import datetime

from repository.in_memory import InMemoryGovernanceRepository
from tools.dq_rule_tools import create_dq_rule_tools, ALL_DIMENSIONS
from models.data_quality import DQRule, RuleLogic, Threshold


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def dq_tools(repository):
    """Create DQ rule tools with the test repository."""
    return create_dq_rule_tools(repository)


@pytest.fixture
def sample_rule(repository):
    """Create a sample DQ rule in the repository."""
    rule = DQRule(
        id="rule-001",
        cde_id="cde-001",
        dimension="completeness",
        name="Test Completeness Rule",
        description="Test rule for completeness",
        logic=RuleLogic(
            type="null_check",
            expression="value IS NOT NULL",
            parameters={}
        ),
        threshold=Threshold(type="percentage", value=0.95),
        severity="high",
        owner="Data Quality Team",
        enabled=True
    )
    repository.add_dq_rule(rule)
    return rule


class TestGenerateRulesForCDE:
    """Tests for generate_rules_for_cde tool."""
    
    def test_generates_rules_for_all_dimensions(self, dq_tools, repository):
        """Test that rules are generated for all 7 dimensions."""
        generate_tool = dq_tools[0]  # generate_rules_for_cde
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets"
        )
        
        assert len(result) == 7
        dimensions = {r['dimension'] for r in result}
        assert dimensions == set(ALL_DIMENSIONS)
    
    def test_generates_rules_for_specific_dimensions(self, dq_tools, repository):
        """Test generating rules for specific dimensions only."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets",
            dimensions=["completeness", "accuracy"]
        )
        
        assert len(result) == 2
        dimensions = {r['dimension'] for r in result}
        assert dimensions == {"completeness", "accuracy"}
    
    def test_rule_includes_required_fields(self, dq_tools, repository):
        """Test that each rule includes all required fields."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets",
            dimensions=["completeness"]
        )
        
        rule = result[0]
        required_fields = [
            'id', 'cde_id', 'dimension', 'name', 'description',
            'logic', 'threshold', 'severity', 'owner', 'enabled'
        ]
        for field in required_fields:
            assert field in rule, f"Missing required field: {field}"
    
    def test_rule_name_includes_cde_name(self, dq_tools, repository):
        """Test that rule name includes the CDE name."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets",
            dimensions=["completeness"]
        )
        
        assert "Total Assets" in result[0]['name']
    
    def test_rule_description_includes_cde_name(self, dq_tools, repository):
        """Test that rule description includes the CDE name."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets",
            dimensions=["completeness"]
        )
        
        assert "Total Assets" in result[0]['description']
    
    def test_custom_thresholds_applied(self, dq_tools, repository):
        """Test that custom thresholds are applied."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets",
            dimensions=["completeness"],
            custom_thresholds={"completeness": 0.99}
        )
        
        assert result[0]['threshold']['value'] == 0.99
    
    def test_custom_owner_applied(self, dq_tools, repository):
        """Test that custom owner is applied."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets",
            dimensions=["completeness"],
            owner="Risk Team"
        )
        
        assert result[0]['owner'] == "Risk Team"
    
    def test_rules_persisted_to_repository(self, dq_tools, repository):
        """Test that generated rules are persisted."""
        generate_tool = dq_tools[0]
        
        generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets"
        )
        
        rules = repository.get_dq_rules(cde_id="cde-001")
        assert len(rules) == 7
    
    def test_creates_audit_entry(self, dq_tools, repository):
        """Test that rule generation creates an audit entry."""
        generate_tool = dq_tools[0]
        
        generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets"
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "generate_rules_for_cde"
        assert audit_entries[0].actor == "DataQualityRuleAgent"
    
    def test_invalid_dimension_raises_error(self, dq_tools, repository):
        """Test that invalid dimension raises an error."""
        generate_tool = dq_tools[0]
        
        with pytest.raises(ValueError, match="Invalid dimension"):
            generate_tool(
                cde_id="cde-001",
                cde_name="Total Assets",
                dimensions=["invalid_dimension"]
            )
    
    def test_rules_enabled_by_default(self, dq_tools, repository):
        """Test that generated rules are enabled by default."""
        generate_tool = dq_tools[0]
        
        result = generate_tool(
            cde_id="cde-001",
            cde_name="Total Assets"
        )
        
        for rule in result:
            assert rule['enabled'] is True


class TestIngestExistingRules:
    """Tests for ingest_existing_rules tool."""
    
    def test_ingests_valid_rules(self, dq_tools, repository):
        """Test that valid rules are ingested."""
        ingest_tool = dq_tools[1]  # ingest_existing_rules
        
        rules = [
            {
                "cde_id": "cde-001",
                "dimension": "completeness",
                "name": "External Rule",
                "description": "Imported rule",
                "logic": {"type": "null_check", "expression": "value IS NOT NULL"},
                "threshold": {"type": "percentage", "value": 0.95},
                "severity": "high",
                "owner": "External Team"
            }
        ]
        
        result = ingest_tool(rules)
        
        assert result['ingested_count'] == 1
        assert result['skipped_count'] == 0
    
    def test_skips_invalid_rules(self, dq_tools, repository):
        """Test that invalid rules are skipped."""
        ingest_tool = dq_tools[1]
        
        rules = [
            {
                "cde_id": "cde-001",
                # Missing required fields
            }
        ]
        
        result = ingest_tool(rules)
        
        assert result['ingested_count'] == 0
        assert result['skipped_count'] == 1
        assert len(result['errors']) == 1
    
    def test_validates_dimension(self, dq_tools, repository):
        """Test that dimension is validated."""
        ingest_tool = dq_tools[1]
        
        rules = [
            {
                "cde_id": "cde-001",
                "dimension": "invalid_dimension",
                "name": "Invalid Rule",
                "description": "Rule with invalid dimension",
                "logic": {"type": "null_check", "expression": "value IS NOT NULL"},
                "threshold": {"type": "percentage", "value": 0.95},
                "severity": "high",
                "owner": "Team"
            }
        ]
        
        result = ingest_tool(rules)
        
        assert result['skipped_count'] == 1
        assert "Invalid dimension" in result['errors'][0]['error']
    
    def test_persists_ingested_rules(self, dq_tools, repository):
        """Test that ingested rules are persisted."""
        ingest_tool = dq_tools[1]
        
        rules = [
            {
                "cde_id": "cde-001",
                "dimension": "completeness",
                "name": "External Rule",
                "description": "Imported rule",
                "logic": {"type": "null_check", "expression": "value IS NOT NULL"},
                "threshold": {"type": "percentage", "value": 0.95},
                "severity": "high",
                "owner": "External Team"
            }
        ]
        
        ingest_tool(rules)
        
        stored_rules = repository.get_dq_rules(cde_id="cde-001")
        assert len(stored_rules) == 1
    
    def test_creates_audit_entry(self, dq_tools, repository):
        """Test that ingestion creates an audit entry."""
        ingest_tool = dq_tools[1]
        
        rules = [
            {
                "cde_id": "cde-001",
                "dimension": "completeness",
                "name": "External Rule",
                "description": "Imported rule",
                "logic": {"type": "null_check", "expression": "value IS NOT NULL"},
                "threshold": {"type": "percentage", "value": 0.95},
                "severity": "high",
                "owner": "External Team"
            }
        ]
        
        ingest_tool(rules)
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "ingest_existing_rules"
    
    def test_uses_provided_rule_id(self, dq_tools, repository):
        """Test that provided rule ID is used."""
        ingest_tool = dq_tools[1]
        
        rules = [
            {
                "id": "custom-rule-id",
                "cde_id": "cde-001",
                "dimension": "completeness",
                "name": "External Rule",
                "description": "Imported rule",
                "logic": {"type": "null_check", "expression": "value IS NOT NULL"},
                "threshold": {"type": "percentage", "value": 0.95},
                "severity": "high",
                "owner": "External Team"
            }
        ]
        
        result = ingest_tool(rules)
        
        assert "custom-rule-id" in result['ingested_rule_ids']
    
    def test_batch_ingestion(self, dq_tools, repository):
        """Test ingesting multiple rules at once."""
        ingest_tool = dq_tools[1]
        
        rules = [
            {
                "cde_id": "cde-001",
                "dimension": "completeness",
                "name": "Rule 1",
                "description": "First rule",
                "logic": {"type": "null_check", "expression": "value IS NOT NULL"},
                "threshold": {"type": "percentage", "value": 0.95},
                "severity": "high",
                "owner": "Team"
            },
            {
                "cde_id": "cde-001",
                "dimension": "accuracy",
                "name": "Rule 2",
                "description": "Second rule",
                "logic": {"type": "referential_check", "expression": "value IN ref"},
                "threshold": {"type": "percentage", "value": 0.98},
                "severity": "critical",
                "owner": "Team"
            }
        ]
        
        result = ingest_tool(rules)
        
        assert result['ingested_count'] == 2
        assert result['total_submitted'] == 2


class TestUpdateRuleThreshold:
    """Tests for update_rule_threshold tool."""
    
    def test_updates_threshold(self, dq_tools, repository, sample_rule):
        """Test that threshold is updated."""
        update_tool = dq_tools[2]  # update_rule_threshold
        
        result = update_tool(
            rule_id="rule-001",
            new_threshold=0.99,
            updater="admin",
            justification="Increased threshold for stricter validation"
        )
        
        assert result['new_threshold'] == 0.99
        assert result['previous_threshold'] == 0.95
    
    def test_requires_justification(self, dq_tools, repository, sample_rule):
        """Test that justification is required."""
        update_tool = dq_tools[2]
        
        with pytest.raises(ValueError, match="Justification must be at least"):
            update_tool(
                rule_id="rule-001",
                new_threshold=0.99,
                updater="admin",
                justification="short"
            )
    
    def test_validates_threshold_range(self, dq_tools, repository, sample_rule):
        """Test that threshold must be between 0 and 1."""
        update_tool = dq_tools[2]
        
        with pytest.raises(ValueError, match="between 0.0 and 1.0"):
            update_tool(
                rule_id="rule-001",
                new_threshold=1.5,
                updater="admin",
                justification="Invalid threshold value"
            )
    
    def test_fails_for_nonexistent_rule(self, dq_tools, repository):
        """Test that update fails for nonexistent rule."""
        update_tool = dq_tools[2]
        
        with pytest.raises(ValueError, match="not found"):
            update_tool(
                rule_id="nonexistent",
                new_threshold=0.99,
                updater="admin",
                justification="This rule does not exist"
            )
    
    def test_persists_changes(self, dq_tools, repository, sample_rule):
        """Test that threshold changes are persisted."""
        update_tool = dq_tools[2]
        
        update_tool(
            rule_id="rule-001",
            new_threshold=0.99,
            updater="admin",
            justification="Increased threshold for stricter validation"
        )
        
        rule = repository.get_dq_rule("rule-001")
        assert rule.threshold.value == 0.99
    
    def test_creates_audit_entry(self, dq_tools, repository, sample_rule):
        """Test that update creates an audit entry."""
        update_tool = dq_tools[2]
        
        update_tool(
            rule_id="rule-001",
            new_threshold=0.99,
            updater="admin",
            justification="Increased threshold for stricter validation"
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "update_rule_threshold"
        assert audit_entries[0].actor == "admin"
        assert audit_entries[0].rationale == "Increased threshold for stricter validation"


class TestExecuteRules:
    """Tests for execute_rules tool."""
    
    def test_executes_rules_for_cde(self, dq_tools, repository, sample_rule):
        """Test that rules are executed for a CDE."""
        execute_tool = dq_tools[3]  # execute_rules
        
        result = execute_tool(cde_id="cde-001")
        
        assert len(result) == 1
        assert result[0]['rule_id'] == "rule-001"
    
    def test_returns_pass_fail_status(self, dq_tools, repository, sample_rule):
        """Test that execution returns pass/fail status."""
        execute_tool = dq_tools[3]
        
        result = execute_tool(cde_id="cde-001")
        
        assert 'passed' in result[0]
        assert isinstance(result[0]['passed'], bool)
    
    def test_returns_actual_and_expected_values(self, dq_tools, repository, sample_rule):
        """Test that execution returns actual and expected values."""
        execute_tool = dq_tools[3]
        
        result = execute_tool(cde_id="cde-001")
        
        assert 'actual_value' in result[0]
        assert 'expected_value' in result[0]
    
    def test_executes_specific_rules(self, dq_tools, repository):
        """Test executing specific rules by ID."""
        # Create multiple rules
        generate_tool = dq_tools[0]
        generate_tool(cde_id="cde-001", cde_name="Test CDE")
        
        rules = repository.get_dq_rules(cde_id="cde-001")
        rule_ids = [rules[0].id, rules[1].id]
        
        execute_tool = dq_tools[3]
        result = execute_tool(cde_id="cde-001", rule_ids=rule_ids)
        
        assert len(result) == 2
    
    def test_only_executes_enabled_rules(self, dq_tools, repository, sample_rule):
        """Test that only enabled rules are executed."""
        # Disable the rule
        sample_rule.enabled = False
        repository.update_dq_rule(sample_rule)
        
        execute_tool = dq_tools[3]
        result = execute_tool(cde_id="cde-001")
        
        assert len(result) == 0
    
    def test_stores_execution_results(self, dq_tools, repository, sample_rule):
        """Test that execution results are stored."""
        execute_tool = dq_tools[3]
        
        execute_tool(cde_id="cde-001")
        
        results = repository.get_rule_execution_results(rule_id="rule-001")
        assert len(results) == 1
    
    def test_creates_audit_entry(self, dq_tools, repository, sample_rule):
        """Test that execution creates an audit entry."""
        execute_tool = dq_tools[3]
        
        execute_tool(cde_id="cde-001")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "execute_rules"
    
    def test_returns_empty_for_no_rules(self, dq_tools, repository):
        """Test that empty list is returned when no rules exist."""
        execute_tool = dq_tools[3]
        
        result = execute_tool(cde_id="nonexistent-cde")
        
        assert result == []


class TestGetRulesForCDE:
    """Tests for get_rules_for_cde tool."""
    
    def test_returns_rules_for_cde(self, dq_tools, repository, sample_rule):
        """Test that rules are returned for a CDE."""
        get_tool = dq_tools[4]  # get_rules_for_cde
        
        result = get_tool(cde_id="cde-001")
        
        assert len(result) == 1
        assert result[0]['id'] == "rule-001"
    
    def test_returns_empty_for_no_rules(self, dq_tools, repository):
        """Test that empty list is returned when no rules exist."""
        get_tool = dq_tools[4]
        
        result = get_tool(cde_id="nonexistent-cde")
        
        assert result == []


class TestGetRule:
    """Tests for get_rule tool."""
    
    def test_returns_rule_by_id(self, dq_tools, repository, sample_rule):
        """Test that rule is returned by ID."""
        get_tool = dq_tools[5]  # get_rule
        
        result = get_tool(rule_id="rule-001")
        
        assert result['id'] == "rule-001"
        assert result['name'] == "Test Completeness Rule"
    
    def test_fails_for_nonexistent_rule(self, dq_tools, repository):
        """Test that error is raised for nonexistent rule."""
        get_tool = dq_tools[5]
        
        with pytest.raises(ValueError, match="not found"):
            get_tool(rule_id="nonexistent")


class TestEnableRule:
    """Tests for enable_rule tool."""
    
    def test_enables_disabled_rule(self, dq_tools, repository, sample_rule):
        """Test that a disabled rule can be enabled."""
        # First disable the rule
        sample_rule.enabled = False
        repository.update_dq_rule(sample_rule)
        
        enable_tool = dq_tools[6]  # enable_rule
        result = enable_tool(rule_id="rule-001", updater="admin")
        
        assert result['enabled'] is True
    
    def test_persists_enabled_state(self, dq_tools, repository, sample_rule):
        """Test that enabled state is persisted."""
        sample_rule.enabled = False
        repository.update_dq_rule(sample_rule)
        
        enable_tool = dq_tools[6]
        enable_tool(rule_id="rule-001", updater="admin")
        
        rule = repository.get_dq_rule("rule-001")
        assert rule.enabled is True
    
    def test_creates_audit_entry(self, dq_tools, repository, sample_rule):
        """Test that enabling creates an audit entry."""
        sample_rule.enabled = False
        repository.update_dq_rule(sample_rule)
        
        enable_tool = dq_tools[6]
        enable_tool(rule_id="rule-001", updater="admin")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "enable_rule"


class TestDisableRule:
    """Tests for disable_rule tool."""
    
    def test_disables_enabled_rule(self, dq_tools, repository, sample_rule):
        """Test that an enabled rule can be disabled."""
        disable_tool = dq_tools[7]  # disable_rule
        
        result = disable_tool(
            rule_id="rule-001",
            updater="admin",
            reason="Temporarily disabled for maintenance"
        )
        
        assert result['enabled'] is False
    
    def test_persists_disabled_state(self, dq_tools, repository, sample_rule):
        """Test that disabled state is persisted."""
        disable_tool = dq_tools[7]
        
        disable_tool(
            rule_id="rule-001",
            updater="admin",
            reason="Temporarily disabled for maintenance"
        )
        
        rule = repository.get_dq_rule("rule-001")
        assert rule.enabled is False
    
    def test_creates_audit_entry_with_reason(self, dq_tools, repository, sample_rule):
        """Test that disabling creates an audit entry with reason."""
        disable_tool = dq_tools[7]
        
        disable_tool(
            rule_id="rule-001",
            updater="admin",
            reason="Temporarily disabled for maintenance"
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "disable_rule"
        assert audit_entries[0].rationale == "Temporarily disabled for maintenance"


class TestGetExecutionHistory:
    """Tests for get_execution_history tool."""
    
    def test_returns_execution_history(self, dq_tools, repository, sample_rule):
        """Test that execution history is returned."""
        # First execute some rules
        execute_tool = dq_tools[3]
        execute_tool(cde_id="cde-001")
        
        history_tool = dq_tools[8]  # get_execution_history
        result = history_tool(rule_id="rule-001")
        
        assert len(result) == 1
    
    def test_filters_by_rule_id(self, dq_tools, repository, sample_rule):
        """Test filtering history by rule ID."""
        execute_tool = dq_tools[3]
        execute_tool(cde_id="cde-001")
        
        history_tool = dq_tools[8]
        result = history_tool(rule_id="rule-001")
        
        assert len(result) >= 1
    
    def test_returns_empty_for_no_history(self, dq_tools, repository):
        """Test that empty list is returned when no history exists."""
        history_tool = dq_tools[8]
        
        result = history_tool(rule_id="nonexistent")
        
        assert result == []
