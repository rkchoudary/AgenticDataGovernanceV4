"""
**Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**

For any data element with identical characteristics (regulatory_calculation_usage,
cross_report_usage, financial_impact, regulatory_scrutiny), the CDE Identification
Agent must produce identical overall criticality scores.

**Validates: Requirements 4.1**
"""

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.cde import CDEScoringFactors, CDEScore
from repository.in_memory import InMemoryGovernanceRepository
from tools.cde_tools import create_cde_tools


# Strategy for generating valid scoring factors (0.0 to 1.0)
scoring_factor_strategy = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)


@st.composite
def scoring_factors_strategy(draw):
    """Generate a set of CDE scoring factors."""
    return {
        "regulatory_calculation_usage": draw(scoring_factor_strategy),
        "cross_report_usage": draw(scoring_factor_strategy),
        "financial_impact": draw(scoring_factor_strategy),
        "regulatory_scrutiny": draw(scoring_factor_strategy)
    }


@st.composite
def data_element_with_factors_strategy(draw, factors: dict = None):
    """
    Generate a data element dict with scoring factors.
    
    Args:
        factors: Optional fixed factors to use. If None, generates random factors.
    """
    if factors is None:
        factors = draw(scoring_factors_strategy())
    
    return {
        "id": draw(st.uuids().map(str)),
        "name": draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('L', 'N')))),
        "regulatory_calculation_usage": factors["regulatory_calculation_usage"],
        "cross_report_usage": factors["cross_report_usage"],
        "financial_impact": factors["financial_impact"],
        "regulatory_scrutiny": factors["regulatory_scrutiny"]
    }


@st.composite
def scoring_weights_strategy(draw):
    """Generate valid scoring weights that sum to 1.0."""
    # Generate 4 random positive values
    w1 = draw(st.floats(min_value=0.1, max_value=0.4, allow_nan=False, allow_infinity=False))
    w2 = draw(st.floats(min_value=0.1, max_value=0.4, allow_nan=False, allow_infinity=False))
    w3 = draw(st.floats(min_value=0.1, max_value=0.4, allow_nan=False, allow_infinity=False))
    w4 = 1.0 - w1 - w2 - w3
    
    # Ensure w4 is positive
    assume(w4 > 0.05)
    
    return {
        "regulatory_calculation_usage": w1,
        "cross_report_usage": w2,
        "financial_impact": w3,
        "regulatory_scrutiny": w4
    }


class TestCDEScoringDeterminism:
    """
    Property 8: CDE Scoring Determinism
    
    Tests that identical scoring factors always produce identical criticality scores.
    """
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_identical_factors_produce_identical_scores(
        self, factors: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: For any data element with identical characteristics, scoring
        the element multiple times must produce identical overall scores.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        # Get the score_data_elements tool
        score_data_elements = tools[0]
        
        # Create two elements with identical factors but different IDs
        element1 = {
            "id": "element-1",
            "name": "Test Element 1",
            **factors
        }
        element2 = {
            "id": "element-2",
            "name": "Test Element 2",
            **factors
        }
        
        # Score both elements
        scores = score_data_elements(
            report_id=report_id,
            elements=[element1, element2]
        )
        
        # Property: Identical factors must produce identical overall scores
        assert len(scores) == 2, f"Expected 2 scores, got {len(scores)}"
        assert scores[0]["overall_score"] == scores[1]["overall_score"], \
            f"Identical factors produced different scores: {scores[0]['overall_score']} vs {scores[1]['overall_score']}"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_scoring_is_idempotent(
        self, factors: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: Scoring the same element multiple times must produce
        identical results each time.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        element = {
            "id": "test-element",
            "name": "Test Element",
            **factors
        }
        
        # Score the element twice
        scores1 = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        scores2 = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Property: Repeated scoring must be idempotent
        assert scores1[0]["overall_score"] == scores2[0]["overall_score"], \
            f"Repeated scoring produced different results: {scores1[0]['overall_score']} vs {scores2[0]['overall_score']}"
        
        # Also verify factors are preserved
        assert scores1[0]["factors"] == scores2[0]["factors"], \
            f"Factors changed between scorings"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        weights=scoring_weights_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_identical_factors_with_same_weights_produce_identical_scores(
        self, factors: dict, weights: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: For any data element with identical characteristics and
        identical weights, the scores must be identical.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        element1 = {
            "id": "element-1",
            "name": "Element One",
            **factors
        }
        element2 = {
            "id": "element-2", 
            "name": "Element Two",
            **factors
        }
        
        # Score with same weights
        scores = score_data_elements(
            report_id=report_id,
            elements=[element1, element2],
            scoring_weights=weights
        )
        
        # Property: Same factors + same weights = same scores
        assert scores[0]["overall_score"] == scores[1]["overall_score"], \
            f"Same factors with same weights produced different scores"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_score_calculation_is_correct(
        self, factors: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: The overall score must equal the weighted sum of factors
        using default weights (0.25 each).
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        element = {
            "id": "test-element",
            "name": "Test Element",
            **factors
        }
        
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Calculate expected score with default weights (0.25 each)
        expected_score = (
            factors["regulatory_calculation_usage"] * 0.25 +
            factors["cross_report_usage"] * 0.25 +
            factors["financial_impact"] * 0.25 +
            factors["regulatory_scrutiny"] * 0.25
        )
        
        # Property: Calculated score must match expected weighted sum
        actual_score = scores[0]["overall_score"]
        assert abs(actual_score - expected_score) < 1e-10, \
            f"Score calculation incorrect. Expected: {expected_score}, Got: {actual_score}"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        weights=scoring_weights_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_score_calculation_with_custom_weights_is_correct(
        self, factors: dict, weights: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: The overall score must equal the weighted sum of factors
        using the provided custom weights.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        element = {
            "id": "test-element",
            "name": "Test Element",
            **factors
        }
        
        scores = score_data_elements(
            report_id=report_id,
            elements=[element],
            scoring_weights=weights
        )
        
        # Calculate expected score with custom weights
        expected_score = (
            factors["regulatory_calculation_usage"] * weights["regulatory_calculation_usage"] +
            factors["cross_report_usage"] * weights["cross_report_usage"] +
            factors["financial_impact"] * weights["financial_impact"] +
            factors["regulatory_scrutiny"] * weights["regulatory_scrutiny"]
        )
        
        # Property: Calculated score must match expected weighted sum
        actual_score = scores[0]["overall_score"]
        assert abs(actual_score - expected_score) < 1e-10, \
            f"Score calculation with custom weights incorrect. Expected: {expected_score}, Got: {actual_score}"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_factors_are_preserved_in_score(
        self, factors: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: The scoring factors in the output must match the input factors.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        element = {
            "id": "test-element",
            "name": "Test Element",
            **factors
        }
        
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Property: Output factors must match input factors
        output_factors = scores[0]["factors"]
        assert output_factors["regulatory_calculation_usage"] == factors["regulatory_calculation_usage"], \
            "regulatory_calculation_usage not preserved"
        assert output_factors["cross_report_usage"] == factors["cross_report_usage"], \
            "cross_report_usage not preserved"
        assert output_factors["financial_impact"] == factors["financial_impact"], \
            "financial_impact not preserved"
        assert output_factors["regulatory_scrutiny"] == factors["regulatory_scrutiny"], \
            "regulatory_scrutiny not preserved"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        report_id=st.uuids().map(str),
        num_elements=st.integers(min_value=2, max_value=10),
    )
    def test_batch_scoring_produces_consistent_results(
        self, factors: dict, report_id: str, num_elements: int
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: When scoring multiple elements with identical factors in a batch,
        all elements must receive identical scores.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        # Create multiple elements with identical factors
        elements = [
            {
                "id": f"element-{i}",
                "name": f"Test Element {i}",
                **factors
            }
            for i in range(num_elements)
        ]
        
        scores = score_data_elements(
            report_id=report_id,
            elements=elements
        )
        
        # Property: All elements with identical factors must have identical scores
        assert len(scores) == num_elements, f"Expected {num_elements} scores"
        
        first_score = scores[0]["overall_score"]
        for i, score in enumerate(scores[1:], start=1):
            assert score["overall_score"] == first_score, \
                f"Element {i} has different score: {score['overall_score']} vs {first_score}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
    )
    def test_score_bounds(self, report_id: str):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: The overall score must be bounded between 0.0 and 1.0
        when all factors are within [0.0, 1.0].
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        # Test minimum score (all factors = 0)
        min_element = {
            "id": "min-element",
            "name": "Min Element",
            "regulatory_calculation_usage": 0.0,
            "cross_report_usage": 0.0,
            "financial_impact": 0.0,
            "regulatory_scrutiny": 0.0
        }
        
        # Test maximum score (all factors = 1)
        max_element = {
            "id": "max-element",
            "name": "Max Element",
            "regulatory_calculation_usage": 1.0,
            "cross_report_usage": 1.0,
            "financial_impact": 1.0,
            "regulatory_scrutiny": 1.0
        }
        
        scores = score_data_elements(
            report_id=report_id,
            elements=[min_element, max_element]
        )
        
        # Property: Minimum factors produce score of 0.0
        assert scores[0]["overall_score"] == 0.0, \
            f"Expected min score 0.0, got {scores[0]['overall_score']}"
        
        # Property: Maximum factors produce score of 1.0
        assert scores[1]["overall_score"] == 1.0, \
            f"Expected max score 1.0, got {scores[1]['overall_score']}"
    
    @settings(max_examples=100)
    @given(
        factors=scoring_factors_strategy(),
        report_id=st.uuids().map(str),
    )
    def test_score_within_bounds(
        self, factors: dict, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 8: CDE Scoring Determinism**
        **Validates: Requirements 4.1**
        
        Property: For any valid factors in [0.0, 1.0], the overall score
        must also be in [0.0, 1.0].
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        
        element = {
            "id": "test-element",
            "name": "Test Element",
            **factors
        }
        
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Property: Score must be within valid bounds
        score = scores[0]["overall_score"]
        assert 0.0 <= score <= 1.0, \
            f"Score {score} is outside valid bounds [0.0, 1.0]"
