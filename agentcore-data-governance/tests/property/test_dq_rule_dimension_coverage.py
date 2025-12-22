"""
**Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**

For any CDE added to inventory, rules must be generated for each applicable dimension
(completeness, accuracy, validity, consistency, timeliness, uniqueness, integrity).

**Validates: Requirements 5.1**
"""

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.data_quality import DQDimension
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


@st.composite
def custom_thresholds_strategy(draw):
    """Generate optional custom thresholds for dimensions."""
    # Randomly decide whether to include custom thresholds
    include_custom = draw(st.booleans())
    if not include_custom:
        return None
    
    # Generate thresholds for a random subset of dimensions
    dimensions_to_customize = draw(st.lists(
        st.sampled_from(list(ALL_DIMENSIONS)),
        min_size=0,
        max_size=len(ALL_DIMENSIONS),
        unique=True
    ))
    
    thresholds = {}
    for dim in dimensions_to_customize:
        thresholds[dim] = draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))
    
    return thresholds if thresholds else None


class TestDQRuleDimensionCoverage:
    """
    Property 11: DQ Rule Dimension Coverage
    
    Tests that rules are generated for all applicable dimensions when
    generating DQ rules for a CDE.
    """
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_all_dimensions_covered_by_default(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: For any CDE, when generating rules without specifying dimensions,
        rules must be generated for all 7 dimensions.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        # Get the generate_rules_for_cde tool
        generate_rules_for_cde = tools[0]
        
        # Generate rules for the CDE (no dimensions specified = all dimensions)
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Property: Must generate exactly 7 rules (one per dimension)
        assert len(rules) == 7, \
            f"Expected 7 rules (one per dimension), got {len(rules)}"
        
        # Property: Each dimension must be covered exactly once
        dimensions_covered = {rule['dimension'] for rule in rules}
        expected_dimensions = set(ALL_DIMENSIONS)
        
        assert dimensions_covered == expected_dimensions, \
            f"Missing dimensions: {expected_dimensions - dimensions_covered}, " \
            f"Extra dimensions: {dimensions_covered - expected_dimensions}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
        owner=owner_strategy,
    )
    def test_all_dimensions_covered_with_custom_owner(
        self, cde_id: str, cde_name: str, owner: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: For any CDE with a custom owner, rules must still be generated
        for all 7 dimensions.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name,
            owner=owner
        )
        
        # Property: Must generate exactly 7 rules
        assert len(rules) == 7, \
            f"Expected 7 rules, got {len(rules)}"
        
        # Property: All rules must have the specified owner
        for rule in rules:
            assert rule['owner'] == owner, \
                f"Rule owner mismatch: expected '{owner}', got '{rule['owner']}'"
        
        # Property: Each dimension must be covered
        dimensions_covered = {rule['dimension'] for rule in rules}
        assert dimensions_covered == set(ALL_DIMENSIONS), \
            f"Not all dimensions covered: {dimensions_covered}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
        custom_thresholds=custom_thresholds_strategy(),
    )
    def test_all_dimensions_covered_with_custom_thresholds(
        self, cde_id: str, cde_name: str, custom_thresholds: dict
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: For any CDE with custom thresholds, rules must still be generated
        for all 7 dimensions.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name,
            custom_thresholds=custom_thresholds
        )
        
        # Property: Must generate exactly 7 rules
        assert len(rules) == 7, \
            f"Expected 7 rules, got {len(rules)}"
        
        # Property: Each dimension must be covered
        dimensions_covered = {rule['dimension'] for rule in rules}
        assert dimensions_covered == set(ALL_DIMENSIONS), \
            f"Not all dimensions covered: {dimensions_covered}"
        
        # Property: Custom thresholds must be applied where specified
        if custom_thresholds:
            for rule in rules:
                dim = rule['dimension']
                if dim in custom_thresholds:
                    assert rule['threshold']['value'] == custom_thresholds[dim], \
                        f"Custom threshold not applied for {dim}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
        dimensions_subset=st.lists(
            st.sampled_from(list(ALL_DIMENSIONS)),
            min_size=1,
            max_size=len(ALL_DIMENSIONS),
            unique=True
        ),
    )
    def test_specified_dimensions_covered(
        self, cde_id: str, cde_name: str, dimensions_subset: list
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: When specific dimensions are requested, rules must be generated
        for exactly those dimensions.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name,
            dimensions=dimensions_subset
        )
        
        # Property: Must generate exactly len(dimensions_subset) rules
        assert len(rules) == len(dimensions_subset), \
            f"Expected {len(dimensions_subset)} rules, got {len(rules)}"
        
        # Property: Exactly the specified dimensions must be covered
        dimensions_covered = {rule['dimension'] for rule in rules}
        expected_dimensions = set(dimensions_subset)
        
        assert dimensions_covered == expected_dimensions, \
            f"Dimension mismatch: expected {expected_dimensions}, got {dimensions_covered}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_each_rule_has_correct_cde_id(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: All generated rules must reference the correct CDE ID.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Property: All rules must have the correct cde_id
        for rule in rules:
            assert rule['cde_id'] == cde_id, \
                f"Rule cde_id mismatch: expected '{cde_id}', got '{rule['cde_id']}'"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_rules_are_persisted_to_repository(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: All generated rules must be persisted to the repository.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        # Generate rules
        generated_rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Retrieve rules from repository
        stored_rules = repository.get_dq_rules(cde_id=cde_id)
        
        # Property: Number of stored rules must match generated rules
        assert len(stored_rules) == len(generated_rules), \
            f"Expected {len(generated_rules)} stored rules, got {len(stored_rules)}"
        
        # Property: All dimensions must be represented in stored rules
        stored_dimensions = {rule.dimension for rule in stored_rules}
        assert stored_dimensions == set(ALL_DIMENSIONS), \
            f"Not all dimensions stored: {stored_dimensions}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_rules_have_unique_ids(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: All generated rules must have unique IDs.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Property: All rule IDs must be unique
        rule_ids = [rule['id'] for rule in rules]
        assert len(rule_ids) == len(set(rule_ids)), \
            f"Duplicate rule IDs found: {rule_ids}"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_all_rules_are_enabled_by_default(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: All generated rules must be enabled by default.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        rules = generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Property: All rules must be enabled
        for rule in rules:
            assert rule['enabled'] is True, \
                f"Rule for dimension '{rule['dimension']}' is not enabled"
    
    @settings(max_examples=100)
    @given(
        cde_id=cde_id_strategy,
        cde_name=cde_name_strategy,
    )
    def test_audit_entry_created_for_rule_generation(
        self, cde_id: str, cde_name: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 11: DQ Rule Dimension Coverage**
        **Validates: Requirements 5.1**
        
        Property: An audit entry must be created when rules are generated.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_dq_rule_tools(repository)
        
        generate_rules_for_cde = tools[0]
        
        # Generate rules
        generate_rules_for_cde(
            cde_id=cde_id,
            cde_name=cde_name
        )
        
        # Property: Audit entry must exist for the rule generation
        audit_entries = repository.get_audit_entries(
            action='generate_rules_for_cde',
            entity_id=cde_id
        )
        
        assert len(audit_entries) >= 1, \
            "No audit entry created for rule generation"
        
        # Verify audit entry content
        entry = audit_entries[0]
        assert entry.actor == "DataQualityRuleAgent", \
            f"Unexpected actor: {entry.actor}"
        assert entry.actor_type == "agent", \
            f"Unexpected actor_type: {entry.actor_type}"
        assert entry.entity_type == "DQRule", \
            f"Unexpected entity_type: {entry.entity_type}"
