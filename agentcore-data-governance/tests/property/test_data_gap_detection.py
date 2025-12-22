"""
**Feature: agentcore-python-refactor, Property 6: Data Gap Detection Accuracy**

For any data element with no matching catalog entry (no mapping), the element must be
flagged as a data gap in the identify_data_gaps output.

**Validates: Requirements 3.3**
"""

import pytest
import json
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.data_elements import (
    DataElement,
    DataMapping,
    DataGap,
    RequirementsDocument,
    DataGapReason,
)
from repository.in_memory import InMemoryGovernanceRepository
from tools.data_requirements_tools import create_data_requirements_tools
from tests.strategies.data_element_strategies import (
    data_element_strategy,
    non_empty_string_strategy,
)


@st.composite
def requirements_document_with_elements_strategy(draw, min_elements: int = 1, max_elements: int = 10):
    """
    Generate a RequirementsDocument with data elements.
    
    Returns:
        A tuple of (report_id, RequirementsDocument)
    """
    report_id = draw(st.uuids().map(str))
    elements = draw(st.lists(
        data_element_strategy(),
        min_size=min_elements,
        max_size=max_elements,
        unique_by=lambda e: e.id  # Ensure unique element IDs
    ))
    
    doc = RequirementsDocument(
        report_id=report_id,
        elements=elements,
        mappings=[],
        gaps=[],
        version=1,
        status='draft',
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    
    return report_id, doc


@st.composite
def mapping_for_element_strategy(draw, element: DataElement, confidence: float = None):
    """
    Generate a DataMapping for a given element.
    
    Args:
        element: The DataElement to create a mapping for.
        confidence: Optional fixed confidence score. If None, generates random.
    """
    if confidence is None:
        confidence = draw(st.floats(min_value=0.0, max_value=1.0))
    
    return DataMapping(
        element_id=element.id,
        source_system=draw(non_empty_string_strategy),
        source_table=draw(non_empty_string_strategy),
        source_field=draw(non_empty_string_strategy),
        transformation_logic=draw(st.none() | non_empty_string_strategy),
        confidence=confidence
    )


class TestDataGapDetectionAccuracy:
    """
    Property 6: Data Gap Detection Accuracy
    
    Tests that every data element with no matching catalog entry (no mapping)
    is flagged as a data gap.
    """
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_unmapped_elements_flagged_as_no_source_gaps(self, doc_data: tuple[str, RequirementsDocument]):
        """
        **Validates: Requirements 3.3**
        
        Property: For any data element with no mapping, the element must be
        flagged as a data gap with reason 'no_source'.
        """
        report_id, doc = doc_data
        
        # Setup: Create repository with document that has elements but no mappings
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]  # identify_data_gaps is the 3rd tool
        
        # Execute: Identify data gaps
        gaps = identify_gaps(report_id=report_id)
        
        # Property: Every unmapped element must be flagged as a gap
        unmapped_element_ids = {e.id for e in doc.elements}
        gap_element_ids = {g['element_id'] for g in gaps}
        
        # All unmapped elements should have gaps
        assert unmapped_element_ids == gap_element_ids, \
            f"Not all unmapped elements flagged. Expected: {unmapped_element_ids}, Got: {gap_element_ids}"
        
        # All gaps for unmapped elements should have 'no_source' reason
        for gap in gaps:
            assert gap['reason'] == 'no_source', \
                f"Expected 'no_source' reason for unmapped element, got '{gap['reason']}'"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=2, max_elements=10),
        mapped_indices=st.data(),
    )
    def test_partially_mapped_elements_correctly_identified(
        self, 
        doc_data: tuple[str, RequirementsDocument],
        mapped_indices: st.DataObject
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any set of elements where some have mappings and some don't,
        only the unmapped elements must be flagged as 'no_source' gaps.
        """
        report_id, doc = doc_data
        assume(len(doc.elements) >= 2)
        
        # Randomly select which elements to map (at least 1 mapped, at least 1 unmapped)
        num_elements = len(doc.elements)
        num_to_map = mapped_indices.draw(st.integers(min_value=1, max_value=num_elements - 1))
        indices_to_map = mapped_indices.draw(
            st.lists(
                st.integers(min_value=0, max_value=num_elements - 1),
                min_size=num_to_map,
                max_size=num_to_map,
                unique=True
            )
        )
        
        # Create high-confidence mappings for selected elements
        mappings = []
        for idx in indices_to_map:
            element = doc.elements[idx]
            mapping = DataMapping(
                element_id=element.id,
                source_system="test_system",
                source_table="test_table",
                source_field=element.name.lower().replace(" ", "_"),
                transformation_logic=element.calculation_logic,  # Include transformation if calc logic exists
                confidence=0.9  # High confidence to avoid partial_source gaps
            )
            mappings.append(mapping)
        
        doc.mappings = mappings
        
        # Setup repository
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Calculate expected unmapped elements
        mapped_element_ids = {m.element_id for m in mappings}
        expected_unmapped_ids = {e.id for e in doc.elements if e.id not in mapped_element_ids}
        
        # Property: Only unmapped elements should have 'no_source' gaps
        no_source_gaps = [g for g in gaps if g['reason'] == 'no_source']
        no_source_gap_ids = {g['element_id'] for g in no_source_gaps}
        
        assert expected_unmapped_ids == no_source_gap_ids, \
            f"Mismatch in no_source gaps. Expected: {expected_unmapped_ids}, Got: {no_source_gap_ids}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_low_confidence_mappings_flagged_as_partial_source(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any data element with a mapping that has confidence < 0.5,
        the element must be flagged as a data gap with reason 'partial_source'.
        """
        report_id, doc = doc_data
        
        # Create low-confidence mappings for all elements
        mappings = []
        for element in doc.elements:
            mapping = DataMapping(
                element_id=element.id,
                source_system="test_system",
                source_table="test_table",
                source_field=element.name.lower().replace(" ", "_"),
                transformation_logic=element.calculation_logic,
                confidence=0.3  # Low confidence
            )
            mappings.append(mapping)
        
        doc.mappings = mappings
        
        # Setup repository
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Property: All elements should have 'partial_source' gaps
        partial_source_gaps = [g for g in gaps if g['reason'] == 'partial_source']
        partial_source_ids = {g['element_id'] for g in partial_source_gaps}
        element_ids = {e.id for e in doc.elements}
        
        assert element_ids == partial_source_ids, \
            f"Not all low-confidence mappings flagged as partial_source. Expected: {element_ids}, Got: {partial_source_ids}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_calculation_needed_when_logic_missing(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any data element with calculation_logic but mapping without
        transformation_logic, the element must be flagged with 'calculation_needed'.
        """
        report_id, doc = doc_data
        
        # Ensure all elements have calculation_logic
        for element in doc.elements:
            element.calculation_logic = "SUM(field_a, field_b)"
        
        # Create high-confidence mappings WITHOUT transformation_logic
        mappings = []
        for element in doc.elements:
            mapping = DataMapping(
                element_id=element.id,
                source_system="test_system",
                source_table="test_table",
                source_field=element.name.lower().replace(" ", "_"),
                transformation_logic=None,  # No transformation logic
                confidence=0.9  # High confidence
            )
            mappings.append(mapping)
        
        doc.mappings = mappings
        
        # Setup repository
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Property: All elements should have 'calculation_needed' gaps
        calc_needed_gaps = [g for g in gaps if g['reason'] == 'calculation_needed']
        calc_needed_ids = {g['element_id'] for g in calc_needed_gaps}
        element_ids = {e.id for e in doc.elements}
        
        assert element_ids == calc_needed_ids, \
            f"Not all elements with missing transformation flagged. Expected: {element_ids}, Got: {calc_needed_ids}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_fully_mapped_elements_not_flagged(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any data element with a high-confidence mapping and
        matching transformation logic, the element must NOT be flagged as a gap.
        """
        report_id, doc = doc_data
        
        # Remove calculation_logic from all elements (so no transformation needed)
        for element in doc.elements:
            element.calculation_logic = None
        
        # Create high-confidence mappings for all elements
        mappings = []
        for element in doc.elements:
            mapping = DataMapping(
                element_id=element.id,
                source_system="test_system",
                source_table="test_table",
                source_field=element.name.lower().replace(" ", "_"),
                transformation_logic=None,
                confidence=0.9  # High confidence
            )
            mappings.append(mapping)
        
        doc.mappings = mappings
        
        # Setup repository
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Property: No gaps should be identified
        assert len(gaps) == 0, \
            f"Expected no gaps for fully mapped elements, got {len(gaps)}: {gaps}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_gaps_include_element_name(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any identified data gap, the element_name field must match
        the name of the corresponding data element.
        """
        report_id, doc = doc_data
        
        # Setup: No mappings, so all elements should be gaps
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Build element lookup
        element_names = {e.id: e.name for e in doc.elements}
        
        # Property: Each gap's element_name must match the element's name
        for gap in gaps:
            element_id = gap['element_id']
            expected_name = element_names.get(element_id)
            assert expected_name is not None, \
                f"Gap references unknown element_id: {element_id}"
            assert gap['element_name'] == expected_name, \
                f"Element name mismatch. Expected: {expected_name}, Got: {gap['element_name']}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_gaps_include_suggested_resolution(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any identified data gap, a suggested_resolution must be provided.
        """
        report_id, doc = doc_data
        
        # Setup: No mappings, so all elements should be gaps
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Property: Each gap must have a non-empty suggested_resolution
        for gap in gaps:
            assert gap.get('suggested_resolution') is not None, \
                f"Gap for element '{gap['element_name']}' has no suggested_resolution"
            assert len(gap['suggested_resolution']) > 0, \
                f"Gap for element '{gap['element_name']}' has empty suggested_resolution"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
    )
    def test_gaps_stored_in_repository(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any gap identification, the gaps must be stored in the
        RequirementsDocument in the repository.
        """
        report_id, doc = doc_data
        
        # Setup
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        gaps = identify_gaps(report_id=report_id)
        
        # Property: Gaps must be stored in repository
        updated_doc = repository.get_requirements_document(report_id)
        assert updated_doc is not None, "Document not found in repository"
        assert len(updated_doc.gaps) == len(gaps), \
            f"Gap count mismatch. Returned: {len(gaps)}, Stored: {len(updated_doc.gaps)}"
        
        # Verify gap IDs match
        returned_ids = {g['element_id'] for g in gaps}
        stored_ids = {g.element_id for g in updated_doc.gaps}
        assert returned_ids == stored_ids, \
            f"Gap element IDs mismatch. Returned: {returned_ids}, Stored: {stored_ids}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
    )
    def test_gap_identification_creates_audit_entry(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.3**
        
        Property: For any gap identification, an audit entry must be created.
        """
        report_id, doc = doc_data
        
        # Setup
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries(entity_type='RequirementsDocument')
        initial_count = len(initial_entries)
        
        tools = create_data_requirements_tools(repository)
        identify_gaps = tools[2]
        
        # Execute
        identify_gaps(report_id=report_id)
        
        # Property: Audit entry must be created
        final_entries = repository.get_audit_entries(entity_type='RequirementsDocument')
        assert len(final_entries) > initial_count, \
            f"Expected audit entry to be created. Initial: {initial_count}, Final: {len(final_entries)}"
        
        # Verify audit entry action
        latest_entry = final_entries[-1]
        assert latest_entry.action == 'identify_data_gaps', \
            f"Expected action 'identify_data_gaps', got '{latest_entry.action}'"
