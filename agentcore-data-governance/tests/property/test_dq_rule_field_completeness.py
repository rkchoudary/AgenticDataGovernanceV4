"""
**Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**

For any generated DQ rule, all required fields must be populated:
id, cde_id, dimension, name, description, logic, threshold, severity, owner, enabled.

**Validates: Requirements 5.3**
"""

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.data_quality import (
    DQRule,
    DQDimension,
    RuleLogic,
    Threshold,
    Severity,
)
from repository.in_memory import InMemoryGovernanceRepository
from tools.dq_rule_tools import create_dq_rule_tools, ALL_DIMENSIONS


# Strategy for generating valid CDE IDs
cde_id_strategy = st.uuids().map(str)

# Strategy for generating valid CDE names
cde_name_strategy = st.text(
    min_size=1, 
    max_size=100, 
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)

# Strategy for generating owner names
owner_strategy = st.text(
    min_size=1, 
    max_size=50, 
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Strategy for generating dimension subsets
dimension_subset_strategy = st.lists(
    st.sampled_from(list(ALL_DIMENSIONS)),
    min_size=1,
    max_size=len(ALL_DIMENSIONS),
    unique=True
)


class TestDQRuleFieldCompleteness:
    """
    Property 12: DQ Rule Field Completeness
    
    Tests that all generated DQ rules have all required fields populated.
    Required fields: id, cde_id, dimension, name, description, logic, threshold, severity, owner, enabled
    """
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_all_required_fields_populated(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule, all required fields must be populated.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Property: Each rule must have all required fields populated
        for rule in rules:
            # Check id is populated and non-empty
            assert 'id' in rule, "Rule missing 'id' field"
            assert rule['id'] is not None, "Rule 'id' is None"
            assert len(str(rule['id'])) > 0, "Rule 'id' is empty"
            
            # Check cde_id is populated and matches input
            assert 'cde_id' in rule, "Rule missing 'cde_id' field"
            assert rule['cde_id'] is not None, "Rule 'cde_id' is None"
            assert rule['cde_id'] == cde_id, f"Rule 'cde_id' mismatch: expected '{cde_id}', got '{rule['cde_id']}'"
            
            # Check dimension is populated and valid
            assert 'dimension' in rule, "Rule missing 'dimension' field"
            assert rule['dimension'] is not None, "Rule 'dimension' is None"
            assert rule['dimension'] in ALL_DIMENSIONS, f"Invalid dimension: {rule['dimension']}"
            
            # Check name is populated and non-empty
            assert 'name' in rule, "Rule missing 'name' field"
            assert rule['name'] is not None, "Rule 'name' is None"
            assert len(str(rule['name'])) > 0, "Rule 'name' is empty"
            
            # Check description is populated and non-empty
            assert 'description' in rule, "Rule missing 'description' field"
            assert rule['description'] is not None, "Rule 'description' is None"
            assert len(str(rule['description'])) > 0, "Rule 'description' is empty"
            
            # Check logic is populated with required sub-fields
            assert 'logic' in rule, "Rule missing 'logic' field"
            assert rule['logic'] is not None, "Rule 'logic' is None"
            assert 'type' in rule['logic'], "Rule logic missing 'type' field"
            assert 'expression' in rule['logic'], "Rule logic missing 'expression' field"
            
            # Check threshold is populated with required sub-fields
            assert 'threshold' in rule, "Rule missing 'threshold' field"
            assert rule['threshold'] is not None, "Rule 'threshold' is None"
            assert 'type' in rule['threshold'], "Rule threshold missing 'type' field"
            assert 'value' in rule['threshold'], "Rule threshold missing 'value' field"
            
            # Check severity is populated and valid
            assert 'severity' in rule, "Rule missing 'severity' field"
            assert rule['severity'] is not None, "Rule 'severity' is None"
            assert rule['severity'] in ['critical', 'high', 'medium', 'low'], \
                f"Invalid severity: {rule['severity']}"
            
            # Check owner is populated and non-empty
            assert 'owner' in rule, "Rule missing 'owner' field"
            assert rule['owner'] is not None, "Rule 'owner' is None"
            assert len(str(rule['owner'])) > 0, "Rule 'owner' is empty"
            
            # Check enabled is populated and is boolean
            assert 'enabled' in rule, "Rule missing 'enabled' field"
            assert rule['enabled'] is not None, "Rule 'enabled' is None"
            assert isinstance(rule['enabled'], bool), f"Rule 'enabled' is not boolean: {type(rule['enabled'])}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
        owner=owner_strategy,
    )
    def test_custom_owner_field_populated(
        self, cde_id: str, cde_name: str, owner: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule with custom owner, the owner field
        must be populated with the specified value.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name,
            owner=owner
        )
        
        # Property: All rules must have the specified owner
        for rule in rules:
            assert 'owner' in rule, "Rule missing 'owner' field"
            assert rule['owner'] == owner, \
                f"Owner mismatch: expected '{owner}', got '{rule['owner']}'"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
        dimensions=dimension_subset_strategy,
    )
    def test_specified_dimensions_have_complete_fields(
        self, cde_id: str, cde_name: str, dimensions: list
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: When specific dimensions are requested, each generated rule
        must still have all required fields populated.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name,
            dimensions=dimensions
        )
        
        # Property: Each rule must have all required fields
        required_fields = ['id', 'cde_id', 'dimension', 'name', 'description', 
                          'logic', 'threshold', 'severity', 'owner', 'enabled']
        
        for rule in rules:
            for field in required_fields:
                assert field in rule, f"Rule missing required field: {field}"
                assert rule[field] is not None, f"Rule field '{field}' is None"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_logic_field_has_valid_structure(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule, the logic field must have a valid
        structure with type and expression.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        valid_logic_types = ['null_check', 'range_check', 'format_check', 
                           'referential_check', 'reconciliation', 'custom']
        
        for rule in rules:
            logic = rule['logic']
            
            # Check logic type is valid
            assert logic['type'] in valid_logic_types, \
                f"Invalid logic type: {logic['type']}"
            
            # Check expression is non-empty
            assert len(str(logic['expression'])) > 0, \
                "Logic expression is empty"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_threshold_field_has_valid_structure(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule, the threshold field must have a valid
        structure with type and value.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        valid_threshold_types = ['percentage', 'absolute', 'range']
        
        for rule in rules:
            threshold = rule['threshold']
            
            # Check threshold type is valid
            assert threshold['type'] in valid_threshold_types, \
                f"Invalid threshold type: {threshold['type']}"
            
            # Check value is a number between 0 and 1 for percentage type
            if threshold['type'] == 'percentage':
                assert isinstance(threshold['value'], (int, float)), \
                    f"Threshold value is not a number: {type(threshold['value'])}"
                assert 0.0 <= threshold['value'] <= 1.0, \
                    f"Percentage threshold out of range: {threshold['value']}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_name_contains_cde_name(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule, the name field should contain
        the CDE name for traceability.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        for rule in rules:
            # Property: Rule name should contain the CDE name
            assert cde_name in rule['name'], \
                f"Rule name '{rule['name']}' does not contain CDE name '{cde_name}'"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_description_contains_cde_name(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule, the description field should contain
        the CDE name for context.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        for rule in rules:
            # Property: Rule description should contain the CDE name
            assert cde_name in rule['description'], \
                f"Rule description does not contain CDE name '{cde_name}'"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_stored_rules_have_complete_fields(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 12: DQ Rule Field Completeness**
        **Validates: Requirements 5.3**
        
        Property: For any generated DQ rule stored in the repository, all required
        fields must be populated.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        # Generate rules
        generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Retrieve stored rules
        stored_rules = repository.get_dq_rules(cde_id=cde_id)
        
        # Property: Each stored rule must have all required fields
        for rule in stored_rules:
            # Check all required fields on the Pydantic model
            assert rule.id is not None and len(rule.id) > 0, "Stored rule 'id' is empty"
            assert rule.cde_id == cde_id, f"Stored rule 'cde_id' mismatch"
            assert rule.dimension in ALL_DIMENSIONS, f"Invalid stored dimension: {rule.dimension}"
            assert rule.name is not None and len(rule.name) > 0, "Stored rule 'name' is empty"
            assert rule.description is not None and len(rule.description) > 0, "Stored rule 'description' is empty"
            assert rule.logic is not None, "Stored rule 'logic' is None"
            assert rule.logic.type is not None, "Stored rule logic 'type' is None"
            assert rule.logic.expression is not None, "Stored rule logic 'expression' is None"
            assert rule.threshold is not None, "Stored rule 'threshold' is None"
            assert rule.threshold.type is not None, "Stored rule threshold 'type' is None"
            assert rule.threshold.value is not None, "Stored rule threshold 'value' is None"
            assert rule.severity in ['critical', 'high', 'medium', 'low'], \
                f"Invalid stored severity: {rule.severity}"
            assert rule.owner is not None and len(rule.owner) > 0, "Stored rule 'owner' is empty"
            assert isinstance(rule.enabled, bool), "Stored rule 'enabled' is not boolean"

