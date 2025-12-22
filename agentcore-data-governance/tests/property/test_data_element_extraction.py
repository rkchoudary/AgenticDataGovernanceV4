"""
**Feature: agentcore-python-refactor, Property 5: Data Element Extraction Completeness**

For any regulatory template processed by the Data Requirements Agent, every data element
in the template must appear in the output with all required fields populated
(name, regulatory definition, data type, format, mandatory flag).

**Validates: Requirements 3.1**
"""

import pytest
import json
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.data_elements import DataElement, RequirementsDocument
from repository.in_memory import InMemoryGovernanceRepository
from tools.data_requirements_tools import create_data_requirements_tools
from tests.strategies.data_element_strategies import (
    json_template_content_strategy,
    text_template_content_strategy,
    template_element_strategy,
    non_empty_string_strategy,
)


# Valid data types after normalization
VALID_DATA_TYPES = {'string', 'number', 'date', 'boolean', 'decimal', 'integer'}


def has_all_required_fields(element: dict) -> bool:
    """
    Verify that a data element has all required fields populated.
    
    Required fields: id, name, regulatory_definition, data_type, format, mandatory
    
    Per Requirements 3.1, every data element must have all required fields populated.
    The format field must be non-empty (inferred from data type if not provided).
    """
    required_fields = ['id', 'name', 'regulatory_definition', 'data_type', 'format', 'mandatory']
    
    for field in required_fields:
        if field not in element:
            return False
        value = element[field]
        
        # Check non-null and non-empty for string fields
        if field in ['id', 'name', 'data_type', 'format']:
            if not isinstance(value, str) or len(value) == 0:
                return False
        
        # regulatory_definition can be empty string but must be string
        if field == 'regulatory_definition':
            if not isinstance(value, str):
                return False
        
        # mandatory must be boolean
        if field == 'mandatory':
            if not isinstance(value, bool):
                return False
    
    return True


def is_valid_data_type(data_type: str) -> bool:
    """Check if data type is a valid normalized value."""
    return data_type in VALID_DATA_TYPES


class TestDataElementExtractionCompleteness:
    """
    Property 5: Data Element Extraction Completeness
    
    Tests that every data element in a regulatory template appears in the output
    with all required fields populated.
    """
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_extracts_all_elements_with_required_fields(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, every data element must appear
        in the output with all required fields populated.
        """
        template_content, expected_count = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        # Get the parse_regulatory_template tool
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: Number of extracted elements equals number of template elements
        assert len(elements) == expected_count, \
            f"Expected {expected_count} elements, got {len(elements)}"
        
        # Property: Every element has all required fields populated
        for i, element in enumerate(elements):
            assert has_all_required_fields(element), \
                f"Element {i} missing required fields: {element}"
    
    @settings(max_examples=100)
    @given(
        template_data=text_template_content_strategy(min_lines=1, max_lines=10),
        report_id=st.uuids().map(str),
    )
    def test_text_template_extracts_all_elements_with_required_fields(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any text regulatory template, every non-empty line must
        result in a data element with all required fields populated.
        """
        template_content, expected_count = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="text"
        )
        
        # Property: Number of extracted elements equals number of non-empty lines
        assert len(elements) == expected_count, \
            f"Expected {expected_count} elements, got {len(elements)}"
        
        # Property: Every element has all required fields populated
        for i, element in enumerate(elements):
            assert has_all_required_fields(element), \
                f"Element {i} missing required fields: {element}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_preserves_element_names(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, every element name from the
        template must appear in the output.
        """
        template_content, _ = template_data
        
        # Parse the original template to get expected names
        original_elements = json.loads(template_content)
        expected_names = {elem['name'] for elem in original_elements}
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: Every template element name appears in output
        output_names = {elem['name'] for elem in elements}
        assert expected_names == output_names, \
            f"Name mismatch. Expected: {expected_names}, Got: {output_names}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_preserves_regulatory_definitions(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, every regulatory definition
        from the template must appear in the output.
        """
        template_content, _ = template_data
        
        # Parse the original template to get expected definitions
        original_elements = json.loads(template_content)
        expected_definitions = {elem['definition'] for elem in original_elements}
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: Every template definition appears as regulatory_definition
        output_definitions = {elem['regulatory_definition'] for elem in elements}
        assert expected_definitions == output_definitions, \
            f"Definition mismatch. Expected: {expected_definitions}, Got: {output_definitions}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_normalizes_data_types(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, all data types in the output
        must be valid normalized enum values.
        """
        template_content, _ = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: All data types are valid enum values
        for element in elements:
            assert is_valid_data_type(element['data_type']), \
                f"Invalid data type '{element['data_type']}' for element '{element['name']}'"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_preserves_mandatory_flag(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, the mandatory flag must be
        preserved from template to output.
        """
        template_content, _ = template_data
        
        # Parse the original template to get expected mandatory flags
        original_elements = json.loads(template_content)
        expected_mandatory = {elem['name']: elem['mandatory'] for elem in original_elements}
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: Mandatory flags match between template and output
        for element in elements:
            name = element['name']
            assert name in expected_mandatory, \
                f"Element '{name}' not found in original template"
            assert element['mandatory'] == expected_mandatory[name], \
                f"Mandatory flag mismatch for '{name}'. Expected: {expected_mandatory[name]}, Got: {element['mandatory']}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=2, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_generates_unique_ids(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, all extracted elements must
        have unique IDs.
        """
        template_content, _ = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: All element IDs are unique
        ids = [elem['id'] for elem in elements]
        unique_ids = set(ids)
        assert len(unique_ids) == len(ids), \
            f"Duplicate IDs found. Total: {len(ids)}, Unique: {len(unique_ids)}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_provides_format_for_all_elements(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, all extracted elements must
        have a non-empty format field.
        """
        template_content, _ = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: All elements have non-empty format
        for element in elements:
            assert element['format'] is not None, \
                f"Element '{element['name']}' has None format"
            assert len(element['format']) > 0, \
                f"Element '{element['name']}' has empty format"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_preserves_calculation_logic(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, calculation logic must be
        preserved when present in the template.
        """
        template_content, _ = template_data
        
        # Parse the original template to get expected calculation logic
        original_elements = json.loads(template_content)
        expected_logic = {
            elem['name']: elem.get('calculation_logic') 
            for elem in original_elements
        }
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: Calculation logic is preserved when present
        for element in elements:
            name = element['name']
            if expected_logic.get(name):
                assert element.get('calculation_logic') == expected_logic[name], \
                    f"Calculation logic mismatch for '{name}'. Expected: {expected_logic[name]}, Got: {element.get('calculation_logic')}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=10),
        report_id=st.uuids().map(str),
    )
    def test_json_template_stores_in_repository(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template, the parsed elements must be
        stored in the repository as a RequirementsDocument.
        """
        template_content, expected_count = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Parse the template
        elements = parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: RequirementsDocument is stored in repository
        doc = repository.get_requirements_document(report_id)
        assert doc is not None, \
            f"RequirementsDocument not found for report_id '{report_id}'"
        
        # Property: Stored document contains all parsed elements
        assert len(doc.elements) == expected_count, \
            f"Expected {expected_count} elements in document, got {len(doc.elements)}"
    
    @settings(max_examples=100)
    @given(
        template_data=json_template_content_strategy(min_elements=1, max_elements=5),
        report_id=st.uuids().map(str),
    )
    def test_json_template_creates_audit_entry(
        self, template_data: tuple[str, int], report_id: str
    ):
        """
        **Validates: Requirements 3.1**
        
        Property: For any JSON regulatory template parsing, an audit entry must
        be created recording the action.
        """
        template_content, _ = template_data
        
        repository = InMemoryGovernanceRepository()
        tools = create_data_requirements_tools(repository)
        
        parse_template = tools[0]
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries(entity_type='RequirementsDocument')
        initial_count = len(initial_entries)
        
        # Parse the template
        parse_template(
            report_id=report_id,
            template_content=template_content,
            template_format="json"
        )
        
        # Property: Audit entry is created
        final_entries = repository.get_audit_entries(entity_type='RequirementsDocument')
        assert len(final_entries) > initial_count, \
            f"Expected audit entry to be created. Initial: {initial_count}, Final: {len(final_entries)}"
        
        # Property: Audit entry has correct action
        latest_entry = final_entries[-1]
        assert latest_entry.action == 'parse_regulatory_template', \
            f"Expected action 'parse_regulatory_template', got '{latest_entry.action}'"
