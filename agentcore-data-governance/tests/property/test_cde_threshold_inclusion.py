"""
**Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**

For any data element with a criticality score at or above the configured threshold,
the element must be included in the CDE Inventory with a non-empty rationale field.

**Validates: Requirements 4.2**
"""

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.cde import CDEScore, CDEScoringFactors, CDEInventory
from repository.in_memory import InMemoryGovernanceRepository
from tools.cde_tools import create_cde_tools


# Strategy for generating valid scoring factors (0.0 to 1.0)
scoring_factor_strategy = st.floats(
    min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False
)


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
def cde_score_strategy(draw, min_score: float = 0.0, max_score: float = 1.0):
    """
    Generate a CDEScore dict with a score in the specified range.
    
    Args:
        min_score: Minimum overall score.
        max_score: Maximum overall score.
    """
    factors = draw(scoring_factors_strategy())
    
    # Calculate the actual score based on factors (default weights 0.25 each)
    overall_score = (
        factors["regulatory_calculation_usage"] * 0.25 +
        factors["cross_report_usage"] * 0.25 +
        factors["financial_impact"] * 0.25 +
        factors["regulatory_scrutiny"] * 0.25
    )
    
    # Filter to ensure score is in desired range
    assume(min_score <= overall_score <= max_score)
    
    element_id = draw(st.uuids().map(str))
    
    return {
        "element_id": element_id,
        "overall_score": overall_score,
        "factors": factors,
        "rationale": f"Element scored {overall_score:.2f} based on scoring factors"
    }


@st.composite
def threshold_strategy(draw):
    """Generate a valid threshold value between 0.0 and 1.0."""
    return draw(st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False))


class TestCDEThresholdInclusion:
    """
    Property 9: CDE Threshold Inclusion
    
    Tests that elements with scores at or above threshold are included in
    the CDE inventory with non-empty rationale.
    """
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.1, max_value=0.9, allow_nan=False, allow_infinity=False),
    )
    def test_elements_at_threshold_are_included(
        self, report_id: str, threshold: float
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: An element with score exactly at the threshold must be
        included in the CDE inventory.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Create an element that will score exactly at threshold
        # With equal weights (0.25 each), we need all factors to equal threshold
        element = {
            "id": "threshold-element",
            "name": "Threshold Element",
            "regulatory_calculation_usage": threshold,
            "cross_report_usage": threshold,
            "financial_impact": threshold,
            "regulatory_scrutiny": threshold
        }
        
        # Score the element
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Verify the score is at threshold
        assert abs(scores[0]["overall_score"] - threshold) < 1e-10, \
            f"Expected score {threshold}, got {scores[0]['overall_score']}"
        
        # Generate inventory with this threshold
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=threshold
        )
        
        # Property: Element at threshold must be included
        assert len(inventory["cdes"]) == 1, \
            f"Expected 1 CDE at threshold, got {len(inventory['cdes'])}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.1, max_value=0.8, allow_nan=False, allow_infinity=False),
        score_above=st.floats(min_value=0.01, max_value=0.2, allow_nan=False, allow_infinity=False),
    )
    def test_elements_above_threshold_are_included(
        self, report_id: str, threshold: float, score_above: float
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: An element with score above the threshold must be
        included in the CDE inventory.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Calculate target score above threshold (capped at 1.0)
        target_score = min(threshold + score_above, 1.0)
        assume(target_score > threshold)  # Ensure we're actually above threshold
        
        # Create element with factors that produce target score
        element = {
            "id": "above-threshold-element",
            "name": "Above Threshold Element",
            "regulatory_calculation_usage": target_score,
            "cross_report_usage": target_score,
            "financial_impact": target_score,
            "regulatory_scrutiny": target_score
        }
        
        # Score the element
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Verify score is above threshold
        assert scores[0]["overall_score"] > threshold, \
            f"Score {scores[0]['overall_score']} should be above threshold {threshold}"
        
        # Generate inventory
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=threshold
        )
        
        # Property: Element above threshold must be included
        assert len(inventory["cdes"]) == 1, \
            f"Expected 1 CDE above threshold, got {len(inventory['cdes'])}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.2, max_value=0.9, allow_nan=False, allow_infinity=False),
        score_below=st.floats(min_value=0.01, max_value=0.19, allow_nan=False, allow_infinity=False),
    )
    def test_elements_below_threshold_are_excluded(
        self, report_id: str, threshold: float, score_below: float
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: An element with score below the threshold must NOT be
        included in the CDE inventory.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Calculate target score below threshold (minimum 0.0)
        target_score = max(threshold - score_below, 0.0)
        assume(target_score < threshold)  # Ensure we're actually below threshold
        
        # Create element with factors that produce target score
        element = {
            "id": "below-threshold-element",
            "name": "Below Threshold Element",
            "regulatory_calculation_usage": target_score,
            "cross_report_usage": target_score,
            "financial_impact": target_score,
            "regulatory_scrutiny": target_score
        }
        
        # Score the element
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        # Verify score is below threshold
        assert scores[0]["overall_score"] < threshold, \
            f"Score {scores[0]['overall_score']} should be below threshold {threshold}"
        
        # Generate inventory
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=threshold
        )
        
        # Property: Element below threshold must NOT be included
        assert len(inventory["cdes"]) == 0, \
            f"Expected 0 CDEs below threshold, got {len(inventory['cdes'])}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.3, max_value=0.7, allow_nan=False, allow_infinity=False),
    )
    def test_included_elements_have_non_empty_rationale(
        self, report_id: str, threshold: float
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: Every element included in the CDE inventory must have
        a non-empty criticality_rationale field.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Create element above threshold
        high_score = min(threshold + 0.2, 1.0)
        element = {
            "id": "high-score-element",
            "name": "High Score Element",
            "regulatory_calculation_usage": high_score,
            "cross_report_usage": high_score,
            "financial_impact": high_score,
            "regulatory_scrutiny": high_score
        }
        
        # Score and generate inventory
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=threshold,
            include_rationale=True
        )
        
        # Property: All included CDEs must have non-empty rationale
        for cde in inventory["cdes"]:
            assert cde["criticality_rationale"], \
                f"CDE {cde['element_id']} has empty criticality_rationale"
            assert len(cde["criticality_rationale"].strip()) > 0, \
                f"CDE {cde['element_id']} has whitespace-only criticality_rationale"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.3, max_value=0.7, allow_nan=False, allow_infinity=False),
        num_above=st.integers(min_value=1, max_value=5),
        num_below=st.integers(min_value=1, max_value=5),
    )
    def test_mixed_scores_correct_inclusion(
        self, report_id: str, threshold: float, num_above: int, num_below: int
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: When scoring multiple elements, exactly those at or above
        threshold must be included in the inventory.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        elements = []
        expected_included_ids = set()
        
        # Create elements above threshold
        high_score = min(threshold + 0.2, 1.0)
        for i in range(num_above):
            elem_id = f"above-{i}"
            elements.append({
                "id": elem_id,
                "name": f"Above Element {i}",
                "regulatory_calculation_usage": high_score,
                "cross_report_usage": high_score,
                "financial_impact": high_score,
                "regulatory_scrutiny": high_score
            })
            expected_included_ids.add(elem_id)
        
        # Create elements below threshold
        low_score = max(threshold - 0.2, 0.0)
        assume(low_score < threshold)  # Ensure we're actually below
        for i in range(num_below):
            elements.append({
                "id": f"below-{i}",
                "name": f"Below Element {i}",
                "regulatory_calculation_usage": low_score,
                "cross_report_usage": low_score,
                "financial_impact": low_score,
                "regulatory_scrutiny": low_score
            })
        
        # Score all elements
        scores = score_data_elements(
            report_id=report_id,
            elements=elements
        )
        
        # Generate inventory
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=threshold
        )
        
        # Property: Exactly the elements above threshold should be included
        included_ids = {cde["element_id"] for cde in inventory["cdes"]}
        
        assert included_ids == expected_included_ids, \
            f"Expected CDEs {expected_included_ids}, got {included_ids}"
        
        # Property: All included CDEs must have rationale
        for cde in inventory["cdes"]:
            assert cde["criticality_rationale"], \
                f"CDE {cde['element_id']} missing rationale"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
    )
    def test_zero_threshold_includes_all_non_zero_scores(
        self, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: With threshold of 0.0, all elements with any positive score
        should be included.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Create elements with various scores
        elements = [
            {
                "id": "zero-score",
                "name": "Zero Score Element",
                "regulatory_calculation_usage": 0.0,
                "cross_report_usage": 0.0,
                "financial_impact": 0.0,
                "regulatory_scrutiny": 0.0
            },
            {
                "id": "low-score",
                "name": "Low Score Element",
                "regulatory_calculation_usage": 0.1,
                "cross_report_usage": 0.1,
                "financial_impact": 0.1,
                "regulatory_scrutiny": 0.1
            },
            {
                "id": "high-score",
                "name": "High Score Element",
                "regulatory_calculation_usage": 0.9,
                "cross_report_usage": 0.9,
                "financial_impact": 0.9,
                "regulatory_scrutiny": 0.9
            }
        ]
        
        scores = score_data_elements(
            report_id=report_id,
            elements=elements
        )
        
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=0.0
        )
        
        # Property: All elements (including zero score) should be included at threshold 0.0
        assert len(inventory["cdes"]) == 3, \
            f"Expected 3 CDEs at threshold 0.0, got {len(inventory['cdes'])}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
    )
    def test_one_threshold_includes_only_perfect_scores(
        self, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: With threshold of 1.0, only elements with perfect score
        should be included.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Create elements with various scores
        elements = [
            {
                "id": "almost-perfect",
                "name": "Almost Perfect Element",
                "regulatory_calculation_usage": 0.99,
                "cross_report_usage": 0.99,
                "financial_impact": 0.99,
                "regulatory_scrutiny": 0.99
            },
            {
                "id": "perfect",
                "name": "Perfect Score Element",
                "regulatory_calculation_usage": 1.0,
                "cross_report_usage": 1.0,
                "financial_impact": 1.0,
                "regulatory_scrutiny": 1.0
            }
        ]
        
        scores = score_data_elements(
            report_id=report_id,
            elements=elements
        )
        
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=1.0
        )
        
        # Property: Only perfect score element should be included
        assert len(inventory["cdes"]) == 1, \
            f"Expected 1 CDE at threshold 1.0, got {len(inventory['cdes'])}"
        assert inventory["cdes"][0]["element_id"] == "perfect", \
            f"Expected 'perfect' element, got {inventory['cdes'][0]['element_id']}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.3, max_value=0.7, allow_nan=False, allow_infinity=False),
    )
    def test_inventory_preserves_element_ids(
        self, report_id: str, threshold: float
    ):
        """
        **Feature: agentcore-python-refactor, Property 9: CDE Threshold Inclusion**
        **Validates: Requirements 4.2**
        
        Property: The element_id in the CDE inventory must match the
        element_id from the original score.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Create element above threshold
        high_score = min(threshold + 0.2, 1.0)
        original_id = "original-element-id-12345"
        element = {
            "id": original_id,
            "name": "Test Element",
            "regulatory_calculation_usage": high_score,
            "cross_report_usage": high_score,
            "financial_impact": high_score,
            "regulatory_scrutiny": high_score
        }
        
        scores = score_data_elements(
            report_id=report_id,
            elements=[element]
        )
        
        inventory = generate_cde_inventory(
            report_id=report_id,
            scores=scores,
            threshold=threshold
        )
        
        # Property: Element ID must be preserved
        assert len(inventory["cdes"]) == 1
        assert inventory["cdes"][0]["element_id"] == original_id, \
            f"Expected element_id '{original_id}', got '{inventory['cdes'][0]['element_id']}'"

