"""
Unit tests for the Data Requirements Agent.

Tests parsing, mapping, gap identification, and document generation.
Requirements: 5.1, 5.2, 5.3
"""
import pytest
import json
from datetime import datetime

from repository.in_memory import InMemoryGovernanceRepository
from tools.data_requirements_tools import create_data_requirements_tools
from models.data_elements import (
    DataElement,
    DataMapping,
    DataGap,
    RequirementsDocument,
)


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def data_requirements_tools(repository):
    """Create data requirements tools with the test repository."""
    return create_data_requirements_tools(repository)


@pytest.fixture
def sample_json_template():
    """Create a sample JSON template with data elements."""
    return json.dumps([
        {
            "name": "Total Assets",
            "definition": "Sum of all assets held by the institution",
            "data_type": "decimal",
            "format": "#,##0.00",
            "calculation_logic": "SUM(asset_categories)",
            "mandatory": True
        },
        {
            "name": "Report Date",
            "definition": "The reporting period end date",
            "data_type": "date",
            "format": "YYYY-MM-DD",
            "mandatory": True
        },
        {
            "name": "Institution Name",
            "definition": "Legal name of the reporting institution",
            "data_type": "string",
            "format": "text",
            "mandatory": False
        }
    ])


@pytest.fixture
def sample_requirements_doc(repository):
    """Create a sample requirements document in the repository."""
    elements = [
        DataElement(
            id="elem-001",
            name="Total Assets",
            regulatory_definition="Sum of all assets",
            data_type="decimal",
            format="#,##0.00",
            mandatory=True
        ),
        DataElement(
            id="elem-002",
            name="Report Date",
            regulatory_definition="Period end date",
            data_type="date",
            format="YYYY-MM-DD",
            mandatory=True
        )
    ]
    doc = RequirementsDocument(
        report_id="report-001",
        elements=elements,
        mappings=[],
        gaps=[],
        version=1,
        status='draft',
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    repository.set_requirements_document("report-001", doc)
    return doc


class TestParseRegulatoryTemplate:
    """Tests for parse_regulatory_template tool."""
    
    def test_parse_json_template_extracts_elements(self, data_requirements_tools, repository, sample_json_template):
        """Test parsing JSON template extracts all data elements."""
        parse_tool = data_requirements_tools[0]  # parse_regulatory_template
        
        result = parse_tool("report-001", sample_json_template, "json")
        
        assert len(result) == 3
        assert result[0]['name'] == "Total Assets"
        assert result[1]['name'] == "Report Date"
        assert result[2]['name'] == "Institution Name"
    
    def test_parse_extracts_data_type(self, data_requirements_tools, sample_json_template):
        """Test that parsing extracts correct data types."""
        parse_tool = data_requirements_tools[0]
        
        result = parse_tool("report-001", sample_json_template, "json")
        
        assert result[0]['data_type'] == "decimal"
        assert result[1]['data_type'] == "date"
        assert result[2]['data_type'] == "string"
    
    def test_parse_extracts_format(self, data_requirements_tools, sample_json_template):
        """Test that parsing extracts format information."""
        parse_tool = data_requirements_tools[0]
        
        result = parse_tool("report-001", sample_json_template, "json")
        
        assert result[0]['format'] == "#,##0.00"
        assert result[1]['format'] == "YYYY-MM-DD"
        assert result[2]['format'] == "text"
    
    def test_parse_extracts_calculation_logic(self, data_requirements_tools, sample_json_template):
        """Test that parsing extracts calculation logic when present."""
        parse_tool = data_requirements_tools[0]
        
        result = parse_tool("report-001", sample_json_template, "json")
        
        assert result[0]['calculation_logic'] == "SUM(asset_categories)"
        assert result[1]['calculation_logic'] is None
    
    def test_parse_extracts_mandatory_flag(self, data_requirements_tools, sample_json_template):
        """Test that parsing extracts mandatory flag."""
        parse_tool = data_requirements_tools[0]
        
        result = parse_tool("report-001", sample_json_template, "json")
        
        assert result[0]['mandatory'] is True
        assert result[1]['mandatory'] is True
        assert result[2]['mandatory'] is False
    
    def test_parse_creates_requirements_document(self, data_requirements_tools, repository, sample_json_template):
        """Test that parsing creates a requirements document."""
        parse_tool = data_requirements_tools[0]
        
        parse_tool("report-001", sample_json_template, "json")
        
        doc = repository.get_requirements_document("report-001")
        assert doc is not None
        assert doc.report_id == "report-001"
        assert len(doc.elements) == 3
        assert doc.status == 'draft'
    
    def test_parse_text_template(self, data_requirements_tools, repository):
        """Test parsing text format template."""
        parse_tool = data_requirements_tools[0]
        
        text_template = "Total Assets\nReport Date\nInstitution Name"
        result = parse_tool("report-002", text_template, "text")
        
        assert len(result) == 3
        # Text parsing creates placeholder elements
        assert result[0]['name'] == "Element_1"
        assert result[0]['regulatory_definition'] == "Total Assets"
    
    def test_parse_creates_audit_entry(self, data_requirements_tools, repository, sample_json_template):
        """Test that parsing creates an audit entry."""
        parse_tool = data_requirements_tools[0]
        
        parse_tool("report-001", sample_json_template, "json")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "parse_regulatory_template"
        assert audit_entries[0].actor == "DataRequirementsAgent"
    
    def test_parse_normalizes_data_types(self, data_requirements_tools, repository):
        """Test that parsing normalizes various data type names."""
        template = json.dumps([
            {"name": "Field1", "definition": "Test", "data_type": "varchar", "mandatory": True},
            {"name": "Field2", "definition": "Test", "data_type": "int", "mandatory": True},
            {"name": "Field3", "definition": "Test", "data_type": "money", "mandatory": True},
            {"name": "Field4", "definition": "Test", "data_type": "datetime", "mandatory": True},
            {"name": "Field5", "definition": "Test", "data_type": "bool", "mandatory": True},
        ])
        parse_tool = data_requirements_tools[0]
        
        result = parse_tool("report-003", template, "json")
        
        assert result[0]['data_type'] == "string"  # varchar -> string
        assert result[1]['data_type'] == "integer"  # int -> integer
        assert result[2]['data_type'] == "decimal"  # money -> decimal
        assert result[3]['data_type'] == "date"  # datetime -> date
        assert result[4]['data_type'] == "boolean"  # bool -> boolean


class TestMapToInternalSources:
    """Tests for map_to_internal_sources tool."""
    
    def test_map_creates_mappings_for_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that mapping creates DataMapping objects for elements."""
        map_tool = data_requirements_tools[1]  # map_to_internal_sources
        
        result = map_tool("report-001")
        
        assert len(result) == 2
        assert all('element_id' in m for m in result)
        assert all('source_system' in m for m in result)
        assert all('source_table' in m for m in result)
        assert all('source_field' in m for m in result)
    
    def test_map_includes_confidence_scores(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that mappings include confidence scores."""
        map_tool = data_requirements_tools[1]
        
        result = map_tool("report-001")
        
        assert all('confidence' in m for m in result)
        assert all(0 <= m['confidence'] <= 1 for m in result)
    
    def test_map_updates_requirements_document(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that mapping updates the requirements document."""
        map_tool = data_requirements_tools[1]
        
        map_tool("report-001")
        
        doc = repository.get_requirements_document("report-001")
        assert len(doc.mappings) == 2
    
    def test_map_specific_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test mapping specific elements by ID."""
        map_tool = data_requirements_tools[1]
        
        result = map_tool("report-001", element_ids=["elem-001"])
        
        assert len(result) == 1
        assert result[0]['element_id'] == "elem-001"
    
    def test_map_fails_without_document(self, data_requirements_tools):
        """Test that mapping fails when no document exists."""
        map_tool = data_requirements_tools[1]
        
        with pytest.raises(ValueError, match="No requirements document found"):
            map_tool("nonexistent-report")
    
    def test_map_creates_audit_entry(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that mapping creates an audit entry."""
        map_tool = data_requirements_tools[1]
        
        map_tool("report-001")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "map_to_internal_sources"
    
    def test_map_skips_already_mapped_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that already mapped elements are skipped."""
        # Add a mapping for elem-001
        doc = repository.get_requirements_document("report-001")
        doc.mappings.append(DataMapping(
            element_id="elem-001",
            source_system="existing_system",
            source_table="existing_table",
            source_field="existing_field",
            confidence=0.9
        ))
        repository.set_requirements_document("report-001", doc)
        
        map_tool = data_requirements_tools[1]
        result = map_tool("report-001")
        
        # Only elem-002 should be mapped
        assert len(result) == 1
        assert result[0]['element_id'] == "elem-002"


class TestIdentifyDataGaps:
    """Tests for identify_data_gaps tool."""
    
    def test_identify_gaps_for_unmapped_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that unmapped elements are identified as gaps."""
        gap_tool = data_requirements_tools[2]  # identify_data_gaps
        
        result = gap_tool("report-001")
        
        # All elements are unmapped, so all should be gaps
        assert len(result) == 2
        assert all(g['reason'] == 'no_source' for g in result)
    
    def test_identify_gaps_with_low_confidence_mapping(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that low confidence mappings are flagged as partial_source."""
        # Add a low confidence mapping
        doc = repository.get_requirements_document("report-001")
        doc.mappings.append(DataMapping(
            element_id="elem-001",
            source_system="system",
            source_table="table",
            source_field="field",
            confidence=0.3  # Low confidence
        ))
        repository.set_requirements_document("report-001", doc)
        
        gap_tool = data_requirements_tools[2]
        result = gap_tool("report-001")
        
        elem_001_gap = next((g for g in result if g['element_id'] == "elem-001"), None)
        assert elem_001_gap is not None
        assert elem_001_gap['reason'] == 'partial_source'
    
    def test_identify_gaps_with_missing_calculation(self, data_requirements_tools, repository):
        """Test that elements needing calculation are flagged."""
        # Create element with calculation logic but no transformation
        elements = [
            DataElement(
                id="elem-calc",
                name="Calculated Field",
                regulatory_definition="Needs calculation",
                data_type="decimal",
                format="#,##0.00",
                calculation_logic="SUM(values)",
                mandatory=True
            )
        ]
        doc = RequirementsDocument(
            report_id="report-calc",
            elements=elements,
            mappings=[DataMapping(
                element_id="elem-calc",
                source_system="system",
                source_table="table",
                source_field="field",
                transformation_logic=None,  # No transformation
                confidence=0.9
            )],
            gaps=[],
            version=1,
            status='draft',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_requirements_document("report-calc", doc)
        
        gap_tool = data_requirements_tools[2]
        result = gap_tool("report-calc")
        
        assert len(result) == 1
        assert result[0]['reason'] == 'calculation_needed'
    
    def test_identify_gaps_includes_suggested_resolution(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that gaps include suggested resolutions."""
        gap_tool = data_requirements_tools[2]
        
        result = gap_tool("report-001")
        
        assert all('suggested_resolution' in g for g in result)
        assert all(g['suggested_resolution'] is not None for g in result)
    
    def test_identify_gaps_updates_document(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that gap identification updates the document."""
        gap_tool = data_requirements_tools[2]
        
        gap_tool("report-001")
        
        doc = repository.get_requirements_document("report-001")
        assert len(doc.gaps) == 2
    
    def test_identify_gaps_fails_without_document(self, data_requirements_tools):
        """Test that gap identification fails when no document exists."""
        gap_tool = data_requirements_tools[2]
        
        with pytest.raises(ValueError, match="No requirements document found"):
            gap_tool("nonexistent-report")
    
    def test_identify_gaps_creates_audit_entry(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that gap identification creates an audit entry."""
        gap_tool = data_requirements_tools[2]
        
        gap_tool("report-001")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "identify_data_gaps"


class TestGenerateRequirementsDocument:
    """Tests for generate_requirements_document tool."""
    
    def test_generate_returns_complete_document(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that generation returns complete document."""
        generate_tool = data_requirements_tools[3]  # generate_requirements_document
        
        result = generate_tool("report-001")
        
        assert 'id' in result
        assert 'report_id' in result
        assert 'elements' in result
        assert 'mappings' in result
        assert 'gaps' in result
        assert result['report_id'] == "report-001"
    
    def test_generate_excludes_mappings_when_requested(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that mappings can be excluded."""
        # Add some mappings first
        doc = repository.get_requirements_document("report-001")
        doc.mappings.append(DataMapping(
            element_id="elem-001",
            source_system="system",
            source_table="table",
            source_field="field",
            confidence=0.9
        ))
        repository.set_requirements_document("report-001", doc)
        
        generate_tool = data_requirements_tools[3]
        result = generate_tool("report-001", include_mappings=False)
        
        assert result['mappings'] == []
    
    def test_generate_excludes_gaps_when_requested(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that gaps can be excluded."""
        # Add some gaps first
        doc = repository.get_requirements_document("report-001")
        doc.gaps.append(DataGap(
            element_id="elem-001",
            element_name="Total Assets",
            reason='no_source'
        ))
        repository.set_requirements_document("report-001", doc)
        
        generate_tool = data_requirements_tools[3]
        result = generate_tool("report-001", include_gaps=False)
        
        assert result['gaps'] == []
    
    def test_generate_fails_without_document(self, data_requirements_tools):
        """Test that generation fails when no document exists."""
        generate_tool = data_requirements_tools[3]
        
        with pytest.raises(ValueError, match="No requirements document found"):
            generate_tool("nonexistent-report")
    
    def test_generate_creates_audit_entry(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that generation creates an audit entry."""
        generate_tool = data_requirements_tools[3]
        
        generate_tool("report-001")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "generate_requirements_document"


class TestIngestExistingDocument:
    """Tests for ingest_existing_document tool."""
    
    def test_ingest_creates_new_document(self, data_requirements_tools, repository):
        """Test ingesting when no document exists creates new one."""
        ingest_tool = data_requirements_tools[4]  # ingest_existing_document
        
        existing_elements = [
            {
                "name": "New Element",
                "regulatory_definition": "Definition",
                "data_type": "string",
                "format": "text",
                "mandatory": True
            }
        ]
        
        result = ingest_tool("new-report", existing_elements)
        
        assert result['added_count'] == 1
        assert result['matched_count'] == 0
        
        doc = repository.get_requirements_document("new-report")
        assert doc is not None
        assert len(doc.elements) == 1
    
    def test_ingest_reconciles_matched_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that matching elements are identified."""
        ingest_tool = data_requirements_tools[4]
        
        existing_elements = [
            {
                "name": "Total Assets",  # Matches existing
                "regulatory_definition": "Sum of all assets",
                "data_type": "decimal",
                "format": "#,##0.00",
                "mandatory": True
            }
        ]
        
        result = ingest_tool("report-001", existing_elements)
        
        assert result['matched_count'] == 1
    
    def test_ingest_identifies_added_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that new elements are identified as added."""
        ingest_tool = data_requirements_tools[4]
        
        existing_elements = [
            {
                "name": "Total Assets",  # Matches existing
                "regulatory_definition": "Sum of all assets",
                "data_type": "decimal",
                "format": "#,##0.00",
                "mandatory": True
            },
            {
                "name": "New Field",  # New element
                "regulatory_definition": "New definition",
                "data_type": "string",
                "format": "text",
                "mandatory": False
            }
        ]
        
        result = ingest_tool("report-001", existing_elements)
        
        assert result['added_count'] == 1
    
    def test_ingest_identifies_removed_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that missing elements are identified as removed."""
        ingest_tool = data_requirements_tools[4]
        
        # Only include one of the two existing elements
        existing_elements = [
            {
                "name": "Total Assets",
                "regulatory_definition": "Sum of all assets",
                "data_type": "decimal",
                "format": "#,##0.00",
                "mandatory": True
            }
        ]
        
        result = ingest_tool("report-001", existing_elements)
        
        assert result['removed_count'] == 1  # Report Date was removed
    
    def test_ingest_identifies_modified_elements(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that changed elements are identified as modified."""
        ingest_tool = data_requirements_tools[4]
        
        existing_elements = [
            {
                "name": "Total Assets",
                "regulatory_definition": "UPDATED definition",  # Changed
                "data_type": "decimal",
                "format": "#,##0.00",
                "mandatory": True
            }
        ]
        
        result = ingest_tool("report-001", existing_elements)
        
        assert result['modified_count'] == 1
        
        # Check that differences are tracked
        modified_item = next(
            (i for i in result['items'] if i['status'] == 'modified'),
            None
        )
        assert modified_item is not None
        assert 'regulatory_definition' in modified_item['differences']
    
    def test_ingest_without_reconciliation(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test ingesting without reconciliation."""
        ingest_tool = data_requirements_tools[4]
        
        existing_elements = [
            {
                "name": "New Element",
                "regulatory_definition": "Definition",
                "data_type": "string",
                "format": "text",
                "mandatory": True
            }
        ]
        
        result = ingest_tool("report-001", existing_elements, reconcile=False)
        
        # Without reconciliation, all items are treated as added
        assert result['added_count'] == 1
        assert result['matched_count'] == 0
    
    def test_ingest_updates_document_version(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that ingestion increments document version."""
        ingest_tool = data_requirements_tools[4]
        
        existing_elements = [
            {
                "name": "Total Assets",
                "regulatory_definition": "Sum of all assets",
                "data_type": "decimal",
                "format": "#,##0.00",
                "mandatory": True
            }
        ]
        
        ingest_tool("report-001", existing_elements)
        
        doc = repository.get_requirements_document("report-001")
        assert doc.version == 2
    
    def test_ingest_creates_audit_entry(self, data_requirements_tools, repository, sample_requirements_doc):
        """Test that ingestion creates an audit entry."""
        ingest_tool = data_requirements_tools[4]
        
        existing_elements = [
            {
                "name": "Element",
                "regulatory_definition": "Def",
                "data_type": "string",
                "format": "text",
                "mandatory": True
            }
        ]
        
        ingest_tool("report-001", existing_elements)
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "ingest_existing_document"
