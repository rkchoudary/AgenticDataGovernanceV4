"""
Hypothesis strategies for Control models.

Contains test data generators for control-related Pydantic models.

**Feature: agentcore-python-refactor, Property 13-14: Control Categorization and Tracking**
**Validates: Requirements 6.1, 6.4**
"""

from datetime import datetime, timedelta
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.controls import (
    Control,
    ControlEvidence,
    ControlMatrix,
    ControlType,
    ControlCategory,
    ControlStatus,
    AutomationStatus,
    ControlEvidenceOutcome,
    ControlFrequency,
)


# Basic strategies - control types and categories
control_type_strategy = st.sampled_from(['organizational', 'process', 'access', 'change_management'])
control_category_strategy = st.sampled_from(['preventive', 'detective'])
control_status_strategy = st.sampled_from(['active', 'inactive', 'compensating'])
automation_status_strategy = st.sampled_from(['manual', 'semi_automated', 'fully_automated'])
evidence_outcome_strategy = st.sampled_from(['pass', 'fail', 'exception'])
control_frequency_strategy = st.sampled_from(['daily', 'weekly', 'monthly', 'quarterly', 'annual', 'continuous'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)


@composite
def control_evidence_strategy(draw, control_id: str = None, outcome: ControlEvidenceOutcome = None):
    """
    Generate a ControlEvidence.
    
    Args:
        control_id: Optional specific control ID.
        outcome: Optional specific outcome.
    """
    return ControlEvidence(
        id=draw(st.uuids().map(str)),
        control_id=control_id or draw(st.uuids().map(str)),
        execution_date=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        outcome=outcome or draw(evidence_outcome_strategy),
        details=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        executed_by=draw(non_empty_string_strategy)
    )


@composite
def control_strategy(
    draw,
    control_type: ControlType = None,
    category: ControlCategory = None,
    status: ControlStatus = None,
    with_evidence: bool = None,
    is_compensating: bool = False
):
    """
    Generate a Control.
    
    Args:
        control_type: Optional specific control type.
        category: Optional specific category.
        status: Optional specific status.
        with_evidence: If True, include evidence. If False, exclude.
        is_compensating: If True, set as compensating control with required fields.
    """
    actual_type = control_type or draw(control_type_strategy)
    actual_category = category or draw(control_category_strategy)
    actual_status = 'compensating' if is_compensating else (status or draw(control_status_strategy))
    
    control_id = draw(st.uuids().map(str))
    
    control = Control(
        id=control_id,
        name=draw(non_empty_string_strategy),
        description=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        type=actual_type,
        category=actual_category,
        owner=draw(non_empty_string_strategy),
        frequency=draw(control_frequency_strategy),
        linked_cdes=draw(st.lists(st.uuids().map(str), min_size=0, max_size=5)),
        linked_processes=draw(st.lists(non_empty_string_strategy, min_size=0, max_size=3)),
        automation_status=draw(automation_status_strategy),
        rule_id=draw(st.none() | st.uuids().map(str)),
        status=actual_status
    )
    
    # Compensating controls require expiration_date and linked_issue_id
    if is_compensating or actual_status == 'compensating':
        control.expiration_date = draw(st.datetimes(
            min_value=datetime(2024, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
        control.linked_issue_id = draw(st.uuids().map(str))
    
    # Add evidence if requested
    has_evidence = with_evidence if with_evidence is not None else draw(st.booleans())
    if has_evidence:
        control.evidence = draw(st.lists(
            control_evidence_strategy(control_id=control_id),
            min_size=1,
            max_size=5
        ))
    
    return control


@composite
def control_matrix_strategy(draw, min_controls: int = 0, max_controls: int = 20):
    """
    Generate a ControlMatrix.
    
    Args:
        min_controls: Minimum number of controls.
        max_controls: Maximum number of controls.
    """
    return ControlMatrix(
        id=draw(st.uuids().map(str)),
        report_id=draw(st.uuids().map(str)),
        controls=draw(st.lists(control_strategy(), min_size=min_controls, max_size=max_controls)),
        version=draw(st.integers(min_value=0, max_value=100)),
        last_reviewed=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        reviewed_by=draw(non_empty_string_strategy)
    )


@composite
def compensating_control_strategy(draw):
    """
    Generate a compensating control with required fields.
    
    Convenience strategy for testing compensating control tracking.
    """
    return draw(control_strategy(
        status='compensating',
        is_compensating=True
    ))


@composite
def active_control_strategy(draw, with_evidence: bool = True):
    """
    Generate an active control.
    
    Args:
        with_evidence: If True, include evidence records.
    """
    return draw(control_strategy(
        status='active',
        with_evidence=with_evidence
    ))


@composite
def control_with_type_strategy(draw, control_type: ControlType):
    """
    Generate a control with a specific type.
    
    Args:
        control_type: The control type to use.
    """
    return draw(control_strategy(control_type=control_type))
