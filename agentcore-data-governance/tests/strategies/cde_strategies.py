"""
Hypothesis strategies for CDE (Critical Data Element) models.

Contains test data generators for CDE-related Pydantic models.

**Feature: agentcore-python-refactor, Property 8-10: CDE Scoring and Ownership**
**Validates: Requirements 4.1, 4.2, 4.5**
"""

from datetime import datetime
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.cde import (
    CDE,
    CDEScore,
    CDEScoringFactors,
    CDEInventory,
    OwnerSuggestion,
    ScoringContext,
    CDEStatus,
    ArtifactStatus,
)


# Basic strategies
cde_status_strategy = st.sampled_from(['pending_approval', 'approved', 'rejected'])
artifact_status_strategy = st.sampled_from(['draft', 'pending_review', 'approved', 'rejected'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Email strategy
email_strategy = st.from_regex(r'[a-z]{3,10}@[a-z]{3,10}\.[a-z]{2,4}', fullmatch=True)


@composite
def cde_scoring_factors_strategy(draw):
    """Generate CDEScoringFactors with valid scores between 0 and 1."""
    return CDEScoringFactors(
        regulatory_calculation_usage=draw(st.floats(min_value=0.0, max_value=1.0)),
        cross_report_usage=draw(st.floats(min_value=0.0, max_value=1.0)),
        financial_impact=draw(st.floats(min_value=0.0, max_value=1.0)),
        regulatory_scrutiny=draw(st.floats(min_value=0.0, max_value=1.0))
    )


@composite
def cde_score_strategy(draw, element_id: str = None):
    """Generate a CDEScore."""
    factors = draw(cde_scoring_factors_strategy())
    # Calculate overall score as weighted average
    overall = (
        factors.regulatory_calculation_usage * 0.3 +
        factors.cross_report_usage * 0.2 +
        factors.financial_impact * 0.25 +
        factors.regulatory_scrutiny * 0.25
    )
    
    return CDEScore(
        element_id=element_id or draw(st.uuids().map(str)),
        overall_score=overall,
        factors=factors,
        rationale=draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
    )


@composite
def cde_strategy(draw, with_owner: bool = None):
    """
    Generate a CDE.
    
    Args:
        with_owner: If True, always include owner. If False, never include.
                   If None, randomly decide.
    """
    has_owner = with_owner if with_owner is not None else draw(st.booleans())
    status = draw(cde_status_strategy)
    
    cde = CDE(
        id=draw(st.uuids().map(str)),
        element_id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        business_definition=draw(st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        criticality_rationale=draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        status=status
    )
    
    if has_owner:
        cde.data_owner = draw(non_empty_string_strategy)
        cde.data_owner_email = draw(email_strategy)
    
    if status == 'approved':
        cde.approved_by = draw(non_empty_string_strategy)
        cde.approved_at = draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        ))
    
    return cde


@composite
def cde_inventory_strategy(draw, status: ArtifactStatus = None, min_cdes: int = 0, max_cdes: int = 10):
    """
    Generate a CDEInventory.
    
    Args:
        status: Optional specific status. If None, generates random status.
        min_cdes: Minimum number of CDEs.
        max_cdes: Maximum number of CDEs.
    """
    actual_status = status if status else draw(artifact_status_strategy)
    now = draw(st.datetimes(min_value=datetime(2020, 1, 1), max_value=datetime(2030, 12, 31)))
    
    return CDEInventory(
        id=draw(st.uuids().map(str)),
        report_id=draw(st.uuids().map(str)),
        cdes=draw(st.lists(cde_strategy(), min_size=min_cdes, max_size=max_cdes)),
        version=draw(st.integers(min_value=0, max_value=100)),
        status=actual_status,
        created_at=now,
        updated_at=now
    )


@composite
def owner_suggestion_strategy(draw):
    """Generate an OwnerSuggestion."""
    return OwnerSuggestion(
        cde_id=draw(st.uuids().map(str)),
        suggested_owner=draw(non_empty_string_strategy),
        suggested_owner_email=draw(email_strategy),
        confidence=draw(st.floats(min_value=0.0, max_value=1.0)),
        rationale=draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
    )


@composite
def scoring_context_strategy(draw, threshold: float = None):
    """
    Generate a ScoringContext.
    
    Args:
        threshold: Optional specific threshold. If None, generates random.
    """
    return ScoringContext(
        report_id=draw(st.uuids().map(str)),
        existing_cdes=draw(st.lists(cde_strategy(), min_size=0, max_size=5)),
        threshold=threshold if threshold is not None else draw(st.floats(min_value=0.0, max_value=1.0))
    )
