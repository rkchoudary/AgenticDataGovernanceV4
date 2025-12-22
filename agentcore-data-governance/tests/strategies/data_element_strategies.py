"""
Hypothesis strategies for data element models.

Contains test data generators for data element-related Pydantic models.

**Feature: agentcore-python-refactor, Property 5: Data Element Extraction Completeness**
**Validates: Requirements 3.1**
"""

from datetime import datetime
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.data_elements import (
    DataElement,
    DataMapping,
    DataGap,
    RequirementsDocument,
    DataType,
    DataGapReason,
    ArtifactStatus,
)


# Basic strategies
data_type_strategy = st.sampled_from(['string', 'number', 'date', 'boolean', 'decimal', 'integer'])
data_gap_reason_strategy = st.sampled_from(['no_source', 'partial_source', 'calculation_needed'])
artifact_status_strategy = st.sampled_from(['draft', 'pending_review', 'approved', 'rejected'])


# Non-empty string strategy for names and identifiers
non_empty_string_strategy = st.text(
    min_size=1, 
    max_size=100, 
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)


# Format strategy based on data type
format_strategy = st.sampled_from([
    'text',
    'YYYY-MM-DD',
    'YYYY-MM-DDTHH:mm:ss',
    '#,##0.00',
    '#,##0',
    'true/false',
    'ISO-8601',
    'currency',
])


@composite
def data_element_strategy(draw):
    """Generate a DataElement with all required fields populated."""
    return DataElement(
        id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        regulatory_definition=draw(st.text(
            min_size=10, 
            max_size=500, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        data_type=draw(data_type_strategy),
        format=draw(format_strategy),
        calculation_logic=draw(st.none() | st.text(
            min_size=5, 
            max_size=200, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        unit=draw(st.none() | st.sampled_from(['USD', 'CAD', 'EUR', '%', 'bps', 'units'])),
        mandatory=draw(st.booleans())
    )


@composite
def template_element_strategy(draw):
    """
    Generate a template element dict that simulates input from a regulatory template.
    
    This represents the raw input format before parsing into DataElement.
    """
    # Generate raw data type that may need normalization
    raw_data_type = draw(st.sampled_from([
        'string', 'text', 'varchar', 'char',
        'number', 'numeric', 'float', 'double',
        'decimal', 'money', 'currency',
        'integer', 'int', 'bigint', 'smallint',
        'date', 'datetime', 'timestamp',
        'boolean', 'bool', 'bit'
    ]))
    
    return {
        'name': draw(non_empty_string_strategy),
        'definition': draw(st.text(
            min_size=10, 
            max_size=500, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        'data_type': raw_data_type,
        'format': draw(st.none() | format_strategy),
        'calculation_logic': draw(st.none() | st.text(
            min_size=5, 
            max_size=200, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        'unit': draw(st.none() | st.sampled_from(['USD', 'CAD', 'EUR', '%', 'bps', 'units'])),
        'mandatory': draw(st.booleans())
    }


@composite
def json_template_content_strategy(draw, min_elements: int = 1, max_elements: int = 20):
    """
    Generate JSON template content with guaranteed non-empty elements and unique names.
    
    Args:
        min_elements: Minimum number of elements to generate.
        max_elements: Maximum number of elements to generate.
    
    Returns:
        A tuple of (json_string, expected_element_count)
    """
    import json
    
    elements = draw(st.lists(
        template_element_strategy(), 
        min_size=min_elements, 
        max_size=max_elements
    ))
    
    # Ensure unique names by appending index to duplicates
    seen_names: dict[str, int] = {}
    unique_elements = []
    for elem in elements:
        name = elem['name']
        count = seen_names.get(name, 0)
        seen_names[name] = count + 1
        if count > 0:
            elem = elem.copy()
            elem['name'] = f"{name}_{count}"
        unique_elements.append(elem)
    
    return json.dumps(unique_elements), len(unique_elements)


@composite
def text_template_content_strategy(draw, min_lines: int = 1, max_lines: int = 20):
    """
    Generate text template content with non-empty lines.
    
    Args:
        min_lines: Minimum number of lines to generate.
        max_lines: Maximum number of lines to generate.
    
    Returns:
        A tuple of (text_content, expected_element_count)
    """
    lines = draw(st.lists(
        st.text(
            min_size=5, 
            max_size=200, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ).filter(lambda s: len(s.strip()) > 0),
        min_size=min_lines, 
        max_size=max_lines
    ))
    
    return '\n'.join(lines), len(lines)
