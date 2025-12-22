"""
Unit tests for the CDE Identification Agent.

Tests scoring, inventory generation, reconciliation, and owner suggestions.
Requirements: 6.1, 6.2, 6.3
"""
import pytest
from datetime import datetime

from repository.in_memory import InMemoryGovernanceRepository
from tools.cde_tools import create_cde_tools
from models.cde import (
    CDE,
    CDEInventory,
    CDEScore,
    CDEScoringFactors,
)
from models.data_elements import (
    DataElement,
    RequirementsDocument,
)


@pytest.fixture
def repository():
    """Provide a fresh in-memory repository for each test."""
    return InMemoryGovernanceRepository()


@pytest.fixture
def cde_tools(repository):
    """Create CDE tools with the test repository."""
    return create_cde_tools(repository)


@pytest.fixture
def sample_elements():
    """Create sample data elements for scoring."""
    return [
        {
            "id": "elem-001",
            "name": "Total Assets",
            "regulatory_calculation_usage": 0.9,
            "cross_report_usage": 0.8,
            "financial_impact": 0.85,
            "regulatory_scrutiny": 0.95
        },
        {
            "id": "elem-002",
            "name": "Report Date",
            "regulatory_calculation_usage": 0.2,
            "cross_report_usage": 0.9,
            "financial_impact": 0.1,
            "regulatory_scrutiny": 0.3
        },
        {
            "id": "elem-003",
            "name": "Institution Name",
            "regulatory_calculation_usage": 0.1,
            "cross_report_usage": 0.3,
            "financial_impact": 0.05,
            "regulatory_scrutiny": 0.1
        }
    ]


@pytest.fixture
def sample_requirements_doc(repository):
    """Create a sample requirements document in the repository."""
    elements = [
        DataElement(
            id="elem-001",
            name="Total Assets",
            regulatory_definition="Sum of all assets held by the institution",
            data_type="decimal",
            format="#,##0.00",
            mandatory=True
        ),
        DataElement(
            id="elem-002",
            name="Report Date",
            regulatory_definition="The reporting period end date",
            data_type="date",
            format="YYYY-MM-DD",
            mandatory=True
        ),
        DataElement(
            id="elem-003",
            name="Institution Name",
            regulatory_definition="Legal name of the reporting institution",
            data_type="string",
            format="text",
            mandatory=False
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


@pytest.fixture
def sample_cde_inventory(repository):
    """Create a sample CDE inventory in the repository."""
    cdes = [
        CDE(
            id="cde-001",
            element_id="elem-001",
            name="Total Assets",
            business_definition="Sum of all assets",
            criticality_rationale="High regulatory usage",
            status='pending_approval'
        ),
        CDE(
            id="cde-002",
            element_id="elem-002",
            name="Report Date",
            business_definition="Period end date",
            criticality_rationale="Cross-report usage",
            status='approved',
            data_owner="Finance Team",
            data_owner_email="finance@example.com"
        )
    ]
    inventory = CDEInventory(
        id="inv-001",
        report_id="report-001",
        cdes=cdes,
        version=1,
        status='draft',
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    repository.set_cde_inventory("report-001", inventory)
    return inventory


class TestScoreDataElements:
    """Tests for score_data_elements tool."""
    
    def test_score_calculates_weighted_average(self, cde_tools, repository, sample_elements):
        """Test that scoring calculates weighted average of factors."""
        score_tool = cde_tools[0]  # score_data_elements
        
        result = score_tool("report-001", sample_elements)
        
        assert len(result) == 3
        # First element: (0.9 + 0.8 + 0.85 + 0.95) * 0.25 = 0.875
        assert abs(result[0]['overall_score'] - 0.875) < 0.01
    
    def test_score_includes_all_factors(self, cde_tools, repository, sample_elements):
        """Test that scoring includes all four factors."""
        score_tool = cde_tools[0]
        
        result = score_tool("report-001", sample_elements)
        
        for score in result:
            assert 'factors' in score
            factors = score['factors']
            assert 'regulatory_calculation_usage' in factors
            assert 'cross_report_usage' in factors
            assert 'financial_impact' in factors
            assert 'regulatory_scrutiny' in factors
    
    def test_score_generates_rationale(self, cde_tools, repository, sample_elements):
        """Test that scoring generates rationale for each element."""
        score_tool = cde_tools[0]
        
        result = score_tool("report-001", sample_elements)
        
        for score in result:
            assert 'rationale' in score
            assert len(score['rationale']) > 0
    
    def test_score_with_custom_weights(self, cde_tools, repository, sample_elements):
        """Test scoring with custom weights."""
        score_tool = cde_tools[0]
        
        custom_weights = {
            "regulatory_calculation_usage": 0.5,
            "cross_report_usage": 0.2,
            "financial_impact": 0.2,
            "regulatory_scrutiny": 0.1
        }
        
        result = score_tool("report-001", sample_elements, scoring_weights=custom_weights)
        
        # First element: 0.9*0.5 + 0.8*0.2 + 0.85*0.2 + 0.95*0.1 = 0.875
        expected = 0.9*0.5 + 0.8*0.2 + 0.85*0.2 + 0.95*0.1
        assert abs(result[0]['overall_score'] - expected) < 0.01
    
    def test_score_handles_missing_factors(self, cde_tools, repository):
        """Test scoring handles elements with missing factors."""
        score_tool = cde_tools[0]
        
        elements = [
            {
                "id": "elem-partial",
                "name": "Partial Element",
                "regulatory_calculation_usage": 0.5
                # Missing other factors - should default to 0
            }
        ]
        
        result = score_tool("report-001", elements)
        
        assert len(result) == 1
        # Only regulatory_calculation_usage contributes: 0.5 * 0.25 = 0.125
        assert abs(result[0]['overall_score'] - 0.125) < 0.01
    
    def test_score_creates_audit_entry(self, cde_tools, repository, sample_elements):
        """Test that scoring creates an audit entry."""
        score_tool = cde_tools[0]
        
        score_tool("report-001", sample_elements)
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "score_data_elements"
        assert audit_entries[0].actor == "CDEIdentificationAgent"
    
    def test_score_rationale_mentions_high_factors(self, cde_tools, repository):
        """Test that rationale mentions high-scoring factors."""
        score_tool = cde_tools[0]
        
        elements = [
            {
                "id": "elem-high",
                "name": "High Regulatory",
                "regulatory_calculation_usage": 0.9,
                "cross_report_usage": 0.3,
                "financial_impact": 0.3,
                "regulatory_scrutiny": 0.3
            }
        ]
        
        result = score_tool("report-001", elements)
        
        assert "regulatory calculation usage" in result[0]['rationale'].lower()


@pytest.fixture
def valid_factors():
    """Create valid scoring factors for tests."""
    return {
        "regulatory_calculation_usage": 0.8,
        "cross_report_usage": 0.7,
        "financial_impact": 0.9,
        "regulatory_scrutiny": 0.85
    }


class TestGenerateCDEInventory:
    """Tests for generate_cde_inventory tool."""
    
    def test_generate_includes_elements_above_threshold(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that inventory includes elements at or above threshold."""
        generate_tool = cde_tools[1]  # generate_cde_inventory
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.85, "factors": valid_factors, "rationale": "High score"},
            {"element_id": "elem-002", "overall_score": 0.7, "factors": valid_factors, "rationale": "At threshold"},
            {"element_id": "elem-003", "overall_score": 0.5, "factors": valid_factors, "rationale": "Below threshold"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7)
        
        assert len(result['cdes']) == 2
        element_ids = [cde['element_id'] for cde in result['cdes']]
        assert "elem-001" in element_ids
        assert "elem-002" in element_ids
        assert "elem-003" not in element_ids
    
    def test_generate_excludes_elements_below_threshold(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that inventory excludes elements below threshold."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.5, "factors": valid_factors, "rationale": "Low score"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7)
        
        assert len(result['cdes']) == 0
    
    def test_generate_includes_rationale(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that generated CDEs include rationale."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.85, "factors": valid_factors, "rationale": "Test rationale"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7, include_rationale=True)
        
        assert len(result['cdes']) == 1
        assert result['cdes'][0]['criticality_rationale'] == "Test rationale"
    
    def test_generate_can_exclude_rationale(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that rationale can be excluded."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.85, "factors": valid_factors, "rationale": "Test rationale"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7, include_rationale=False)
        
        assert result['cdes'][0]['criticality_rationale'] == ""
    
    def test_generate_sets_pending_approval_status(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that new CDEs have pending_approval status."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.85, "factors": valid_factors, "rationale": "High score"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7)
        
        assert result['cdes'][0]['status'] == 'pending_approval'
    
    def test_generate_persists_inventory(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that inventory is persisted to repository."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.85, "factors": valid_factors, "rationale": "High score"}
        ]
        
        generate_tool("report-001", scores, threshold=0.7)
        
        inventory = repository.get_cde_inventory("report-001")
        assert inventory is not None
        assert len(inventory.cdes) == 1
    
    def test_generate_merges_with_existing_inventory(self, cde_tools, repository, sample_requirements_doc, sample_cde_inventory, valid_factors):
        """Test that new CDEs are merged with existing inventory."""
        generate_tool = cde_tools[1]
        
        # Add a new element that's not in existing inventory
        scores = [
            {"element_id": "elem-003", "overall_score": 0.85, "factors": valid_factors, "rationale": "New CDE"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7)
        
        # Should have existing 2 + new 1 = 3 CDEs
        assert len(result['cdes']) == 3
    
    def test_generate_increments_version(self, cde_tools, repository, sample_requirements_doc, sample_cde_inventory, valid_factors):
        """Test that version is incremented on update."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-003", "overall_score": 0.85, "factors": valid_factors, "rationale": "New CDE"}
        ]
        
        result = generate_tool("report-001", scores, threshold=0.7)
        
        assert result['version'] == 2
    
    def test_generate_creates_audit_entry(self, cde_tools, repository, sample_requirements_doc, valid_factors):
        """Test that generation creates an audit entry."""
        generate_tool = cde_tools[1]
        
        scores = [
            {"element_id": "elem-001", "overall_score": 0.85, "factors": valid_factors, "rationale": "High score"}
        ]
        
        generate_tool("report-001", scores, threshold=0.7)
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "generate_cde_inventory"


class TestReconcileWithExisting:
    """Tests for reconcile_with_existing tool."""
    
    def test_reconcile_identifies_matched_elements(self, cde_tools, repository, sample_cde_inventory):
        """Test that matching CDEs are identified."""
        reconcile_tool = cde_tools[2]  # reconcile_with_existing
        
        new_cdes = [
            {
                "element_id": "elem-001",
                "name": "Total Assets",
                "business_definition": "Sum of all assets",
                "criticality_rationale": "High regulatory usage"
            }
        ]
        
        result = reconcile_tool("report-001", new_cdes)
        
        assert result['matched_count'] == 1
    
    def test_reconcile_identifies_added_elements(self, cde_tools, repository, sample_cde_inventory):
        """Test that new CDEs are identified as added."""
        reconcile_tool = cde_tools[2]
        
        new_cdes = [
            {
                "element_id": "elem-new",
                "name": "New Element",
                "business_definition": "New definition",
                "criticality_rationale": "New rationale"
            }
        ]
        
        result = reconcile_tool("report-001", new_cdes)
        
        assert result['added_count'] == 1
    
    def test_reconcile_identifies_removed_elements(self, cde_tools, repository, sample_cde_inventory):
        """Test that missing CDEs are identified as removed."""
        reconcile_tool = cde_tools[2]
        
        # Only include one of the two existing CDEs
        new_cdes = [
            {
                "element_id": "elem-001",
                "name": "Total Assets",
                "business_definition": "Sum of all assets",
                "criticality_rationale": "High regulatory usage"
            }
        ]
        
        result = reconcile_tool("report-001", new_cdes)
        
        assert result['removed_count'] == 1
    
    def test_reconcile_identifies_modified_elements(self, cde_tools, repository, sample_cde_inventory):
        """Test that changed CDEs are identified as modified."""
        reconcile_tool = cde_tools[2]
        
        new_cdes = [
            {
                "element_id": "elem-001",
                "name": "Total Assets UPDATED",  # Changed name
                "business_definition": "Sum of all assets",
                "criticality_rationale": "High regulatory usage"
            }
        ]
        
        result = reconcile_tool("report-001", new_cdes)
        
        assert result['modified_count'] == 1
        
        # Check that differences are tracked
        modified_item = next(
            (i for i in result['items'] if i['status'] == 'modified'),
            None
        )
        assert modified_item is not None
        assert 'name' in modified_item['differences']
    
    def test_reconcile_handles_empty_existing(self, cde_tools, repository):
        """Test reconciliation when no existing inventory."""
        reconcile_tool = cde_tools[2]
        
        new_cdes = [
            {
                "element_id": "elem-001",
                "name": "New Element",
                "business_definition": "Definition",
                "criticality_rationale": "Rationale"
            }
        ]
        
        result = reconcile_tool("report-new", new_cdes)
        
        assert result['added_count'] == 1
        assert result['total_existing'] == 0
    
    def test_reconcile_creates_audit_entry(self, cde_tools, repository, sample_cde_inventory):
        """Test that reconciliation creates an audit entry."""
        reconcile_tool = cde_tools[2]
        
        new_cdes = [
            {
                "element_id": "elem-001",
                "name": "Total Assets",
                "business_definition": "Sum of all assets",
                "criticality_rationale": "High regulatory usage"
            }
        ]
        
        reconcile_tool("report-001", new_cdes)
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "reconcile_with_existing"


class TestSuggestDataOwners:
    """Tests for suggest_data_owners tool."""
    
    def test_suggest_returns_suggestions_for_cdes(self, cde_tools, repository, sample_cde_inventory):
        """Test that suggestions are returned for CDEs without owners."""
        suggest_tool = cde_tools[3]  # suggest_data_owners
        
        result = suggest_tool("report-001")
        
        # Only elem-001 lacks an owner
        assert len(result) == 1
        assert result[0]['cde_id'] == "cde-001"
    
    def test_suggest_includes_confidence_score(self, cde_tools, repository, sample_cde_inventory):
        """Test that suggestions include confidence scores."""
        suggest_tool = cde_tools[3]
        
        result = suggest_tool("report-001")
        
        assert 'confidence' in result[0]
        assert 0 <= result[0]['confidence'] <= 1
    
    def test_suggest_includes_rationale(self, cde_tools, repository, sample_cde_inventory):
        """Test that suggestions include rationale."""
        suggest_tool = cde_tools[3]
        
        result = suggest_tool("report-001")
        
        assert 'rationale' in result[0]
        assert len(result[0]['rationale']) > 0
    
    def test_suggest_for_specific_cdes(self, cde_tools, repository, sample_cde_inventory):
        """Test suggesting owners for specific CDEs."""
        suggest_tool = cde_tools[3]
        
        # Request suggestion for CDE that already has owner
        result = suggest_tool("report-001", cde_ids=["cde-002"])
        
        assert len(result) == 1
        assert result[0]['cde_id'] == "cde-002"
    
    def test_suggest_fails_without_inventory(self, cde_tools, repository):
        """Test that suggestion fails when no inventory exists."""
        suggest_tool = cde_tools[3]
        
        with pytest.raises(ValueError, match="No CDE inventory found"):
            suggest_tool("nonexistent-report")
    
    def test_suggest_creates_audit_entry(self, cde_tools, repository, sample_cde_inventory):
        """Test that suggestion creates an audit entry."""
        suggest_tool = cde_tools[3]
        
        suggest_tool("report-001")
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "suggest_data_owners"


class TestGetCDEInventory:
    """Tests for get_cde_inventory tool."""
    
    def test_get_returns_existing_inventory(self, cde_tools, repository, sample_cde_inventory):
        """Test that existing inventory is returned."""
        get_tool = cde_tools[4]  # get_cde_inventory
        
        result = get_tool("report-001")
        
        assert result['report_id'] == "report-001"
        assert len(result['cdes']) == 2
    
    def test_get_returns_empty_inventory_when_none_exists(self, cde_tools, repository):
        """Test that empty inventory is returned when none exists."""
        get_tool = cde_tools[4]
        
        result = get_tool("nonexistent-report")
        
        assert result['report_id'] == "nonexistent-report"
        assert len(result['cdes']) == 0
        assert result['version'] == 0


class TestUpdateCDEOwner:
    """Tests for update_cde_owner tool."""
    
    def test_update_sets_owner(self, cde_tools, repository, sample_cde_inventory):
        """Test that owner is updated."""
        update_tool = cde_tools[5]  # update_cde_owner
        
        result = update_tool(
            cde_id="cde-001",
            owner_name="Risk Team",
            owner_email="risk@example.com",
            updater="admin"
        )
        
        assert result['data_owner'] == "Risk Team"
        assert result['data_owner_email'] == "risk@example.com"
    
    def test_update_persists_changes(self, cde_tools, repository, sample_cde_inventory):
        """Test that owner changes are persisted."""
        update_tool = cde_tools[5]
        
        update_tool(
            cde_id="cde-001",
            owner_name="Risk Team",
            owner_email="risk@example.com",
            updater="admin"
        )
        
        cde = repository.get_cde("cde-001")
        assert cde.data_owner == "Risk Team"
    
    def test_update_fails_for_nonexistent_cde(self, cde_tools, repository):
        """Test that update fails for nonexistent CDE."""
        update_tool = cde_tools[5]
        
        with pytest.raises(ValueError, match="not found"):
            update_tool(
                cde_id="nonexistent",
                owner_name="Team",
                owner_email="team@example.com",
                updater="admin"
            )
    
    def test_update_creates_audit_entry(self, cde_tools, repository, sample_cde_inventory):
        """Test that update creates an audit entry."""
        update_tool = cde_tools[5]
        
        update_tool(
            cde_id="cde-001",
            owner_name="Risk Team",
            owner_email="risk@example.com",
            updater="admin",
            rationale="Assigned based on domain"
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "update_cde_owner"
        assert audit_entries[0].actor == "admin"
        assert audit_entries[0].rationale == "Assigned based on domain"


class TestApproveCDE:
    """Tests for approve_cde tool."""
    
    def test_approve_sets_approved_status(self, cde_tools, repository, sample_cde_inventory):
        """Test that approval sets approved status."""
        # First assign an owner
        update_tool = cde_tools[5]
        update_tool(
            cde_id="cde-001",
            owner_name="Risk Team",
            owner_email="risk@example.com",
            updater="admin"
        )
        
        approve_tool = cde_tools[6]  # approve_cde
        result = approve_tool(
            cde_id="cde-001",
            approver="compliance_officer",
            rationale="Meets all criteria"
        )
        
        assert result['status'] == 'approved'
        assert result['approved_by'] == "compliance_officer"
    
    def test_approve_fails_without_owner(self, cde_tools, repository, sample_cde_inventory):
        """Test that approval fails when CDE has no owner."""
        approve_tool = cde_tools[6]
        
        with pytest.raises(ValueError, match="must have a data owner"):
            approve_tool(
                cde_id="cde-001",
                approver="compliance_officer",
                rationale="Meets all criteria"
            )
    
    def test_approve_fails_for_wrong_status(self, cde_tools, repository, sample_cde_inventory):
        """Test that approval fails when CDE is not pending_approval."""
        approve_tool = cde_tools[6]
        
        # cde-002 is already approved
        with pytest.raises(ValueError, match="pending_approval"):
            approve_tool(
                cde_id="cde-002",
                approver="compliance_officer",
                rationale="Re-approval"
            )
    
    def test_approve_creates_audit_entry(self, cde_tools, repository, sample_cde_inventory):
        """Test that approval creates an audit entry."""
        # First assign an owner
        update_tool = cde_tools[5]
        update_tool(
            cde_id="cde-001",
            owner_name="Risk Team",
            owner_email="risk@example.com",
            updater="admin"
        )
        
        # Clear audit entries from owner update
        repository._audit_entries.clear()
        
        approve_tool = cde_tools[6]
        approve_tool(
            cde_id="cde-001",
            approver="compliance_officer",
            rationale="Meets all criteria"
        )
        
        audit_entries = repository.get_audit_entries()
        assert len(audit_entries) == 1
        assert audit_entries[0].action == "approve_cde"
        assert audit_entries[0].actor == "compliance_officer"
        assert audit_entries[0].actor_type == "human"
