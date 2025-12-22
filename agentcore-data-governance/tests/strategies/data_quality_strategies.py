"""
Hypothesis strategies for Data Quality models.

Contains test data generators for DQ rule-related Pydantic models.

**Feature: agentcore-python-refactor, Property 11-12: DQ Rule Coverage and Completeness**
**Validates: Requirements 5.1, 5.3**
"""

from datetime import datetime
from typing import Any
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.data_quality import (
    DQRule,
    DQDimension,
    RuleLogic,
    Threshold,
    RuleExecutionResult,
    DataSnapshot,
    DataProfile,
    DQRuleRepository,
    DQDimensionDefinition,
    DQThreshold,
    DataQualityStandards,
    Severity,
    RuleLogicType,
    ThresholdType,
)


# Basic strategies - all 7 dimensions
dq_dimension_strategy = st.sampled_from([
    'completeness',
    'accuracy',
    'validity',
    'consistency',
    'timeliness',
    'uniqueness',
    'integrity'
])

severity_strategy = st.sampled_from(['critical', 'high', 'medium', 'low'])
rule_logic_type_strategy = st.sampled_from([
    'null_check',
    'range_check',
    'format_check',
    'referential_check',
    'reconciliation',
    'custom'
])
threshold_type_strategy = st.sampled_from(['percentage', 'absolute', 'range'])
cde_category_strategy = st.sampled_from(['all', 'critical', 'high', 'medium'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)


@composite
def threshold_strategy(draw):
    """Generate a Threshold."""
    threshold_type = draw(threshold_type_strategy)
    
    threshold = Threshold(
        type=threshold_type,
        value=draw(st.floats(min_value=0.0, max_value=100.0))
    )
    
    if threshold_type == 'range':
        min_val = draw(st.floats(min_value=0.0, max_value=50.0))
        max_val = draw(st.floats(min_value=50.0, max_value=100.0))
        threshold.min_value = min_val
        threshold.max_value = max_val
    
    return threshold


@composite
def rule_logic_strategy(draw):
    """Generate a RuleLogic."""
    logic_type = draw(rule_logic_type_strategy)
    
    # Generate appropriate expression based on type
    expressions = {
        'null_check': 'field IS NOT NULL',
        'range_check': 'field BETWEEN 0 AND 100',
        'format_check': "field MATCHES '^[A-Z]{3}$'",
        'referential_check': 'field IN (SELECT id FROM ref_table)',
        'reconciliation': 'SUM(field_a) = SUM(field_b)',
        'custom': 'custom_validation(field)'
    }
    
    return RuleLogic(
        type=logic_type,
        expression=expressions.get(logic_type, 'field IS NOT NULL'),
        parameters=draw(st.none() | st.fixed_dictionaries({
            'table': st.just('test_table'),
            'column': st.just('test_column')
        }))
    )


@composite
def dq_rule_strategy(draw, cde_id: str = None, dimension: DQDimension = None):
    """
    Generate a DQRule.
    
    Args:
        cde_id: Optional specific CDE ID. If None, generates random.
        dimension: Optional specific dimension. If None, generates random.
    """
    return DQRule(
        id=draw(st.uuids().map(str)),
        cde_id=cde_id or draw(st.uuids().map(str)),
        dimension=dimension or draw(dq_dimension_strategy),
        name=draw(non_empty_string_strategy),
        description=draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        logic=draw(rule_logic_strategy()),
        threshold=draw(threshold_strategy()),
        severity=draw(severity_strategy),
        owner=draw(non_empty_string_strategy),
        enabled=draw(st.booleans())
    )


@composite
def rule_execution_result_strategy(draw, rule_id: str = None, passed: bool = None):
    """
    Generate a RuleExecutionResult.
    
    Args:
        rule_id: Optional specific rule ID.
        passed: Optional specific pass/fail status.
    """
    total = draw(st.integers(min_value=1, max_value=10000))
    did_pass = passed if passed is not None else draw(st.booleans())
    failed = 0 if did_pass else draw(st.integers(min_value=1, max_value=total))
    
    return RuleExecutionResult(
        rule_id=rule_id or draw(st.uuids().map(str)),
        passed=did_pass,
        actual_value=draw(st.floats(min_value=0.0, max_value=100.0)),
        expected_value=draw(st.floats(min_value=0.0, max_value=100.0)),
        failed_records=failed if not did_pass else None,
        total_records=total,
        executed_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def data_snapshot_strategy(draw):
    """Generate a DataSnapshot."""
    return DataSnapshot(
        id=draw(st.uuids().map(str)),
        cde_id=draw(st.uuids().map(str)),
        data=draw(st.lists(
            st.one_of(st.integers(), st.floats(allow_nan=False), st.text(max_size=50)),
            min_size=0,
            max_size=100
        )),
        captured_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def data_profile_strategy(draw):
    """Generate a DataProfile."""
    return DataProfile(
        cde_id=draw(st.uuids().map(str)),
        sample_size=draw(st.integers(min_value=1, max_value=100000)),
        null_percentage=draw(st.floats(min_value=0.0, max_value=100.0)),
        unique_percentage=draw(st.floats(min_value=0.0, max_value=100.0)),
        min_value=draw(st.none() | st.floats(min_value=-1e6, max_value=0.0)),
        max_value=draw(st.none() | st.floats(min_value=0.0, max_value=1e6)),
        avg_value=draw(st.none() | st.floats(min_value=-1e6, max_value=1e6)),
        std_dev=draw(st.none() | st.floats(min_value=0.0, max_value=1e6)),
        patterns=draw(st.lists(st.text(min_size=1, max_size=50), min_size=0, max_size=5)),
        captured_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def dq_rule_repository_strategy(draw, min_rules: int = 0, max_rules: int = 20):
    """Generate a DQRuleRepository."""
    return DQRuleRepository(
        report_id=draw(st.uuids().map(str)),
        rules=draw(st.lists(dq_rule_strategy(), min_size=min_rules, max_size=max_rules)),
        version=draw(st.integers(min_value=0, max_value=100)),
        last_updated=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )


@composite
def dq_dimension_definition_strategy(draw):
    """Generate a DQDimensionDefinition."""
    return DQDimensionDefinition(
        dimension=draw(dq_dimension_strategy),
        definition=draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        measurement_method=draw(st.text(
            min_size=5,
            max_size=100,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        examples=draw(st.lists(st.text(min_size=5, max_size=100), min_size=0, max_size=3))
    )


@composite
def dq_threshold_strategy(draw):
    """Generate a DQThreshold."""
    return DQThreshold(
        dimension=draw(dq_dimension_strategy),
        cde_category=draw(cde_category_strategy),
        minimum_score=draw(st.floats(min_value=0.0, max_value=0.5)),
        target_score=draw(st.floats(min_value=0.5, max_value=1.0))
    )


@composite
def data_quality_standards_strategy(draw):
    """Generate DataQualityStandards."""
    return DataQualityStandards(
        dimensions=draw(st.lists(dq_dimension_definition_strategy(), min_size=0, max_size=7)),
        thresholds=draw(st.lists(dq_threshold_strategy(), min_size=0, max_size=10)),
        version=draw(st.integers(min_value=0, max_value=100)),
        approved_by=draw(non_empty_string_strategy),
        approved_at=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    )
