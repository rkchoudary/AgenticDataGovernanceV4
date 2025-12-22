"""
**Feature: agentcore-python-refactor, Property 7: Reconciliation Consistency**

For any existing artifact ingested, reconciliation must correctly categorize items
as matched, added, removed, or modified.

**Validates: Requirements 3.4, 4.3, 5.4, 6.3**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.data_elements import (
    DataElement,
    RequirementsDocument,
    ReconciliationItem,
    ReconciliationResult,
)
from repository.in_memory import InMemoryGovernanceRepository
from tools.data_requirements_tools import create_data_requirements_tools
from tests.strategies.data_element_strategies import (
    data_element_strategy,
    non_empty_string_strategy,
)


@st.composite
def data_element_dict_strategy(draw):
    """Generate a data element as a dictionary (simulating ingested input)."""
    return {
        "id": draw(st.uuids().map(str)),
        "name": draw(non_empty_string_strategy),
        "regulatory_definition": draw(st.text(
            min_size=10,
            max_size=200,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        "data_type": draw(st.sampled_from(['string', 'number', 'date', 'boolean', 'decimal', 'integer'])),
        "format": draw(st.sampled_from(['text', 'YYYY-MM-DD', '#,##0.00', '#,##0', 'true/false'])),
        "calculation_logic": draw(st.none() | st.text(
            min_size=5,
            max_size=100,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        "unit": draw(st.none() | st.sampled_from(['USD', 'CAD', 'EUR', '%', 'bps'])),
        "mandatory": draw(st.booleans())
    }


@st.composite
def requirements_document_with_elements_strategy(draw, min_elements: int = 1, max_elements: int = 10):
    """Generate a RequirementsDocument with data elements."""
    report_id = draw(st.uuids().map(str))
    elements = draw(st.lists(
        data_element_strategy(),
        min_size=min_elements,
        max_size=max_elements,
        unique_by=lambda e: e.name  # Ensure unique names for reconciliation
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


class TestReconciliationConsistency:
    """
    Property 7: Reconciliation Consistency
    
    Tests that reconciliation correctly categorizes items as matched, added,
    removed, or modified when ingesting existing artifacts.
    """
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=10),
    )
    def test_identical_elements_categorized_as_matched(self, doc_data: tuple[str, RequirementsDocument]):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: For any existing document, ingesting identical elements must
        categorize all items as 'matched'.
        """
        report_id, doc = doc_data
        
        # Setup: Create repository with existing document
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]  # ingest_existing_document is the 5th tool
        
        # Create identical elements as dicts for ingestion
        existing_elements = [e.model_dump() for e in doc.elements]
        
        # Execute: Ingest the same elements
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=existing_elements,
            reconcile=True
        )
        
        # Property: All items should be categorized as 'matched'
        assert result['matched_count'] == len(doc.elements), \
            f"Expected {len(doc.elements)} matched, got {result['matched_count']}"
        assert result['added_count'] == 0, \
            f"Expected 0 added, got {result['added_count']}"
        assert result['removed_count'] == 0, \
            f"Expected 0 removed, got {result['removed_count']}"
        assert result['modified_count'] == 0, \
            f"Expected 0 modified, got {result['modified_count']}"
        
        # Verify each item status
        for item in result['items']:
            assert item['status'] == 'matched', \
                f"Expected 'matched' status, got '{item['status']}'"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
        new_elements=st.lists(
            data_element_dict_strategy(),
            min_size=1,
            max_size=5,
            unique_by=lambda e: e['name']
        )
    )
    def test_new_elements_categorized_as_added(
        self, 
        doc_data: tuple[str, RequirementsDocument],
        new_elements: list[dict]
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: For any new elements not in the existing document,
        reconciliation must categorize them as 'added'.
        """
        report_id, doc = doc_data
        
        # Ensure new elements have unique names not in existing doc
        existing_names = {e.name for e in doc.elements}
        unique_new_elements = []
        for elem in new_elements:
            if elem['name'] not in existing_names:
                unique_new_elements.append(elem)
                existing_names.add(elem['name'])
        
        assume(len(unique_new_elements) > 0)
        
        # Setup: Create repository with existing document
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Combine existing elements with new elements
        existing_elements = [e.model_dump() for e in doc.elements]
        all_elements = existing_elements + unique_new_elements
        
        # Execute: Ingest combined elements
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=all_elements,
            reconcile=True
        )
        
        # Property: New elements should be categorized as 'added'
        assert result['added_count'] == len(unique_new_elements), \
            f"Expected {len(unique_new_elements)} added, got {result['added_count']}"
        
        # Verify added items
        added_items = [i for i in result['items'] if i['status'] == 'added']
        added_names = {i['new_value']['name'] for i in added_items}
        expected_added_names = {e['name'] for e in unique_new_elements}
        
        assert added_names == expected_added_names, \
            f"Added names mismatch. Expected: {expected_added_names}, Got: {added_names}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=2, max_elements=10),
        remove_indices=st.data()
    )
    def test_missing_elements_categorized_as_removed(
        self, 
        doc_data: tuple[str, RequirementsDocument],
        remove_indices: st.DataObject
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: For any elements in the existing document but not in the
        ingested elements, reconciliation must categorize them as 'removed'.
        """
        report_id, doc = doc_data
        assume(len(doc.elements) >= 2)
        
        # Randomly select elements to remove (keep at least 1)
        num_elements = len(doc.elements)
        num_to_remove = remove_indices.draw(st.integers(min_value=1, max_value=num_elements - 1))
        indices_to_remove = remove_indices.draw(
            st.lists(
                st.integers(min_value=0, max_value=num_elements - 1),
                min_size=num_to_remove,
                max_size=num_to_remove,
                unique=True
            )
        )
        
        # Setup: Create repository with existing document
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Create elements list without the removed ones
        kept_elements = [
            doc.elements[i].model_dump() 
            for i in range(num_elements) 
            if i not in indices_to_remove
        ]
        removed_elements = [
            doc.elements[i] 
            for i in indices_to_remove
        ]
        
        # Execute: Ingest partial elements
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=kept_elements,
            reconcile=True
        )
        
        # Property: Missing elements should be categorized as 'removed'
        assert result['removed_count'] == len(removed_elements), \
            f"Expected {len(removed_elements)} removed, got {result['removed_count']}"
        
        # Verify removed items
        removed_items = [i for i in result['items'] if i['status'] == 'removed']
        removed_names = {i['existing_value']['name'] for i in removed_items}
        expected_removed_names = {e.name for e in removed_elements}
        
        assert removed_names == expected_removed_names, \
            f"Removed names mismatch. Expected: {expected_removed_names}, Got: {removed_names}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
        modification_field=st.sampled_from([
            'regulatory_definition', 'data_type', 'format', 'calculation_logic', 'mandatory'
        ])
    )
    def test_modified_elements_categorized_as_modified(
        self, 
        doc_data: tuple[str, RequirementsDocument],
        modification_field: str
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: For any elements with changed field values,
        reconciliation must categorize them as 'modified' and list differences.
        """
        report_id, doc = doc_data
        
        # Setup: Create repository with existing document
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Create modified elements
        modified_elements = []
        for elem in doc.elements:
            elem_dict = elem.model_dump()
            
            # Modify the specified field
            if modification_field == 'regulatory_definition':
                elem_dict['regulatory_definition'] = elem_dict['regulatory_definition'] + " MODIFIED"
            elif modification_field == 'data_type':
                # Change to a different data type
                current_type = elem_dict['data_type']
                new_type = 'string' if current_type != 'string' else 'number'
                elem_dict['data_type'] = new_type
            elif modification_field == 'format':
                elem_dict['format'] = elem_dict['format'] + "_modified"
            elif modification_field == 'calculation_logic':
                elem_dict['calculation_logic'] = "MODIFIED_CALC(x)"
            elif modification_field == 'mandatory':
                elem_dict['mandatory'] = not elem_dict['mandatory']
            
            modified_elements.append(elem_dict)
        
        # Execute: Ingest modified elements
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=modified_elements,
            reconcile=True
        )
        
        # Property: All elements should be categorized as 'modified'
        assert result['modified_count'] == len(doc.elements), \
            f"Expected {len(doc.elements)} modified, got {result['modified_count']}"
        
        # Verify modified items include the changed field in differences
        for item in result['items']:
            if item['status'] == 'modified':
                assert modification_field in item['differences'], \
                    f"Expected '{modification_field}' in differences, got {item['differences']}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        new_elements=st.lists(
            data_element_dict_strategy(),
            min_size=1,
            max_size=5,
            unique_by=lambda e: e['name']
        )
    )
    def test_no_existing_document_all_added(
        self, 
        report_id: str,
        new_elements: list[dict]
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: When no existing document exists, all ingested elements
        must be categorized as 'added'.
        """
        # Setup: Create empty repository (no existing document)
        repository = InMemoryGovernanceRepository()
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Execute: Ingest elements with no existing document
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=new_elements,
            reconcile=True
        )
        
        # Property: All elements should be categorized as 'added'
        assert result['added_count'] == len(new_elements), \
            f"Expected {len(new_elements)} added, got {result['added_count']}"
        assert result['matched_count'] == 0, \
            f"Expected 0 matched, got {result['matched_count']}"
        assert result['removed_count'] == 0, \
            f"Expected 0 removed, got {result['removed_count']}"
        assert result['modified_count'] == 0, \
            f"Expected 0 modified, got {result['modified_count']}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=3, max_elements=8),
        scenario_data=st.data()
    )
    def test_mixed_reconciliation_counts_are_accurate(
        self, 
        doc_data: tuple[str, RequirementsDocument],
        scenario_data: st.DataObject
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: For any mixed reconciliation scenario (some matched, some added,
        some removed, some modified), the counts must accurately reflect the items.
        """
        report_id, doc = doc_data
        assume(len(doc.elements) >= 3)
        
        # Setup: Create repository with existing document
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        num_elements = len(doc.elements)
        
        # Decide how many to keep unchanged, modify, and remove
        num_to_keep = scenario_data.draw(st.integers(min_value=1, max_value=max(1, num_elements // 3)))
        num_to_modify = scenario_data.draw(st.integers(min_value=0, max_value=max(0, (num_elements - num_to_keep) // 2)))
        num_to_remove = num_elements - num_to_keep - num_to_modify
        
        # Generate new elements to add
        num_to_add = scenario_data.draw(st.integers(min_value=0, max_value=3))
        
        # Build the ingested elements list
        ingested_elements = []
        existing_names = {e.name for e in doc.elements}
        
        # Keep some unchanged
        for i in range(num_to_keep):
            ingested_elements.append(doc.elements[i].model_dump())
        
        # Modify some
        for i in range(num_to_keep, num_to_keep + num_to_modify):
            elem_dict = doc.elements[i].model_dump()
            elem_dict['regulatory_definition'] = elem_dict['regulatory_definition'] + " MODIFIED"
            ingested_elements.append(elem_dict)
        
        # Skip the rest (they will be 'removed')
        
        # Add new elements with unique names
        added_count = 0
        for _ in range(num_to_add):
            new_elem = scenario_data.draw(data_element_dict_strategy())
            if new_elem['name'] not in existing_names:
                ingested_elements.append(new_elem)
                existing_names.add(new_elem['name'])
                added_count += 1
        
        # Execute: Ingest mixed elements
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=ingested_elements,
            reconcile=True
        )
        
        # Property: Counts must match actual item statuses
        actual_matched = len([i for i in result['items'] if i['status'] == 'matched'])
        actual_added = len([i for i in result['items'] if i['status'] == 'added'])
        actual_removed = len([i for i in result['items'] if i['status'] == 'removed'])
        actual_modified = len([i for i in result['items'] if i['status'] == 'modified'])
        
        assert result['matched_count'] == actual_matched, \
            f"matched_count ({result['matched_count']}) != actual matched items ({actual_matched})"
        assert result['added_count'] == actual_added, \
            f"added_count ({result['added_count']}) != actual added items ({actual_added})"
        assert result['removed_count'] == actual_removed, \
            f"removed_count ({result['removed_count']}) != actual removed items ({actual_removed})"
        assert result['modified_count'] == actual_modified, \
            f"modified_count ({result['modified_count']}) != actual modified items ({actual_modified})"
        
        # Total items should equal sum of all categories
        total_items = len(result['items'])
        total_counts = result['matched_count'] + result['added_count'] + result['removed_count'] + result['modified_count']
        assert total_items == total_counts, \
            f"Total items ({total_items}) != sum of counts ({total_counts})"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
    )
    def test_reconciliation_creates_audit_entry(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: For any reconciliation operation, an audit entry must be created.
        """
        report_id, doc = doc_data
        
        # Setup
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        # Get initial audit count
        initial_entries = repository.get_audit_entries(entity_type='RequirementsDocument')
        initial_count = len(initial_entries)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Execute
        existing_elements = [e.model_dump() for e in doc.elements]
        ingest_existing_document(
            report_id=report_id,
            existing_elements=existing_elements,
            reconcile=True
        )
        
        # Property: Audit entry must be created
        final_entries = repository.get_audit_entries(entity_type='RequirementsDocument')
        assert len(final_entries) > initial_count, \
            f"Expected audit entry to be created. Initial: {initial_count}, Final: {len(final_entries)}"
        
        # Verify audit entry action
        latest_entry = final_entries[-1]
        assert latest_entry.action == 'ingest_existing_document', \
            f"Expected action 'ingest_existing_document', got '{latest_entry.action}'"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
    )
    def test_reconciliation_updates_document_in_repository(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: After reconciliation, the document in the repository must
        reflect the merged state.
        """
        report_id, doc = doc_data
        
        # Setup
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Add a new element
        new_element = {
            "id": "new-element-id",
            "name": "New Element For Test",
            "regulatory_definition": "A new element added during reconciliation",
            "data_type": "string",
            "format": "text",
            "calculation_logic": None,
            "unit": None,
            "mandatory": True
        }
        
        existing_elements = [e.model_dump() for e in doc.elements] + [new_element]
        
        # Execute
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=existing_elements,
            reconcile=True
        )
        
        # Property: Document in repository should have the new element
        updated_doc = repository.get_requirements_document(report_id)
        assert updated_doc is not None, "Document not found in repository"
        
        element_names = {e.name for e in updated_doc.elements}
        assert "New Element For Test" in element_names, \
            f"New element not found in updated document. Elements: {element_names}"
        
        # Version should be incremented
        assert updated_doc.version > doc.version, \
            f"Version not incremented. Original: {doc.version}, Updated: {updated_doc.version}"
    
    @settings(max_examples=100)
    @given(
        doc_data=requirements_document_with_elements_strategy(min_elements=1, max_elements=5),
    )
    def test_reconciliation_item_has_correct_structure(
        self, 
        doc_data: tuple[str, RequirementsDocument]
    ):
        """
        **Validates: Requirements 3.4, 4.3, 5.4, 6.3**
        
        Property: Each reconciliation item must have the correct structure
        with item_id, item_type, status, and appropriate value fields.
        """
        report_id, doc = doc_data
        
        # Setup
        repository = InMemoryGovernanceRepository()
        repository.set_requirements_document(report_id, doc)
        
        tools = create_data_requirements_tools(repository)
        ingest_existing_document = tools[4]
        
        # Execute
        existing_elements = [e.model_dump() for e in doc.elements]
        result = ingest_existing_document(
            report_id=report_id,
            existing_elements=existing_elements,
            reconcile=True
        )
        
        # Property: Each item must have required fields
        for item in result['items']:
            assert 'item_id' in item, "Missing 'item_id' in reconciliation item"
            assert 'item_type' in item, "Missing 'item_type' in reconciliation item"
            assert 'status' in item, "Missing 'status' in reconciliation item"
            assert item['item_type'] == 'DataElement', \
                f"Expected item_type 'DataElement', got '{item['item_type']}'"
            assert item['status'] in ('matched', 'added', 'removed', 'modified'), \
                f"Invalid status '{item['status']}'"
            
            # Matched and modified items should have both existing and new values
            if item['status'] in ('matched', 'modified'):
                assert item.get('existing_value') is not None, \
                    f"Matched/modified item missing existing_value"
                assert item.get('new_value') is not None, \
                    f"Matched/modified item missing new_value"
            
            # Added items should have new_value
            if item['status'] == 'added':
                assert item.get('new_value') is not None, \
                    f"Added item missing new_value"
            
            # Removed items should have existing_value
            if item['status'] == 'removed':
                assert item.get('existing_value') is not None, \
                    f"Removed item missing existing_value"
