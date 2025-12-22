"""
**Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**

For any CDE with status 'approved', the data_owner field must be non-null.
CDEs without owners must have status 'pending_approval'.

**Validates: Requirements 4.5**
"""

import pytest
from datetime import datetime
from hypothesis import given, settings, assume
from hypothesis import strategies as st

from models.cde import CDE, CDEInventory, CDEStatus, ArtifactStatus
from repository.in_memory import InMemoryGovernanceRepository
from tools.cde_tools import create_cde_tools


# Strategy for generating valid CDE status
cde_status_strategy = st.sampled_from(['pending_approval', 'approved', 'rejected'])


# Non-empty string strategy for names and identifiers
non_empty_string_strategy = st.text(
    min_size=1, 
    max_size=100, 
    alphabet=st.characters(whitelist_categories=('L', 'N'))
).filter(lambda s: len(s.strip()) > 0)


# Email strategy
email_strategy = st.emails()


def setup_cde_in_repository(repository: InMemoryGovernanceRepository, cde: CDE, report_id: str) -> None:
    """
    Helper function to properly set up a CDE in the repository.
    
    CDEs are stored within inventories, so we need to create or update
    an inventory to contain the CDE.
    """
    existing_inventory = repository.get_cde_inventory(report_id)
    
    if existing_inventory:
        # Check if CDE already exists in inventory
        existing_ids = {c.id for c in existing_inventory.cdes}
        if cde.id not in existing_ids:
            existing_inventory.cdes.append(cde)
        else:
            # Update existing CDE
            for i, existing_cde in enumerate(existing_inventory.cdes):
                if existing_cde.id == cde.id:
                    existing_inventory.cdes[i] = cde
                    break
        existing_inventory.updated_at = datetime.now()
        repository.set_cde_inventory(report_id, existing_inventory)
    else:
        # Create new inventory with the CDE
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde],
            version=1,
            status='draft',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        repository.set_cde_inventory(report_id, inventory)


@st.composite
def cde_strategy(draw, with_owner: bool = None, status: str = None):
    """
    Generate a CDE with configurable owner and status.
    
    Args:
        with_owner: If True, always include owner. If False, never include owner.
                   If None, randomly decide.
        status: If provided, use this status. Otherwise, randomly select.
    """
    has_owner = draw(st.booleans()) if with_owner is None else with_owner
    cde_status = status if status else draw(cde_status_strategy)
    
    owner_name = draw(non_empty_string_strategy) if has_owner else None
    owner_email = draw(email_strategy) if has_owner else None
    
    return CDE(
        id=draw(st.uuids().map(str)),
        element_id=draw(st.uuids().map(str)),
        name=draw(non_empty_string_strategy),
        business_definition=draw(st.text(
            min_size=10, 
            max_size=200, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        criticality_rationale=draw(st.text(
            min_size=10, 
            max_size=200, 
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        )),
        data_owner=owner_name,
        data_owner_email=owner_email,
        status=cde_status
    )


class TestCDEOwnershipValidation:
    """
    Property 10: CDE Ownership Validation
    
    Tests that approved CDEs must have owners, and CDEs without owners
    must be in pending_approval status.
    """
    
    @settings(max_examples=100)
    @given(
        cde_id=st.uuids().map(str),
        owner_name=non_empty_string_strategy,
        owner_email=email_strategy,
        approver=non_empty_string_strategy,
        rationale=st.text(min_size=20, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))),
        report_id=st.uuids().map(str),
    )
    def test_approve_cde_requires_owner(
        self, cde_id: str, owner_name: str, owner_email: str, 
        approver: str, rationale: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: A CDE can only be approved if it has a data owner assigned.
        Attempting to approve a CDE without an owner must raise an error.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        # Get the approve_cde tool
        approve_cde = tools[6]  # approve_cde is the 7th tool (index 6)
        update_cde_owner = tools[5]  # update_cde_owner is the 6th tool (index 5)
        
        # Create a CDE without an owner
        cde_without_owner = CDE(
            id=cde_id,
            element_id=f"elem-{cde_id}",
            name="Test CDE",
            business_definition="A test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner=None,
            data_owner_email=None,
            status='pending_approval'
        )
        
        # Store the CDE in repository using helper function
        setup_cde_in_repository(repository, cde_without_owner, report_id)
        
        # Property: Attempting to approve CDE without owner must fail
        with pytest.raises(ValueError) as exc_info:
            approve_cde(
                cde_id=cde_id,
                approver=approver,
                rationale=rationale
            )
        
        assert "data owner" in str(exc_info.value).lower(), \
            f"Expected error about data owner, got: {exc_info.value}"
        
        # Now assign an owner
        update_cde_owner(
            cde_id=cde_id,
            owner_name=owner_name,
            owner_email=owner_email,
            updater=approver,
            rationale="Assigning owner for approval"
        )
        
        # Property: After assigning owner, approval should succeed
        result = approve_cde(
            cde_id=cde_id,
            approver=approver,
            rationale=rationale
        )
        
        assert result["status"] == "approved", \
            f"Expected status 'approved', got '{result['status']}'"
        assert result["data_owner"] == owner_name, \
            f"Expected owner '{owner_name}', got '{result['data_owner']}'"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        threshold=st.floats(min_value=0.3, max_value=0.7, allow_nan=False, allow_infinity=False),
    )
    def test_generated_cdes_have_pending_approval_status(
        self, report_id: str, threshold: float
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: Newly generated CDEs must have status 'pending_approval'
        since they don't have owners assigned yet.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        score_data_elements = tools[0]
        generate_cde_inventory = tools[1]
        
        # Create element above threshold
        high_score = min(threshold + 0.2, 1.0)
        element = {
            "id": "test-element",
            "name": "Test Element",
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
            threshold=threshold
        )
        
        # Property: All newly generated CDEs must have pending_approval status
        for cde in inventory["cdes"]:
            assert cde["status"] == "pending_approval", \
                f"Expected status 'pending_approval', got '{cde['status']}'"
            
            # Property: Newly generated CDEs should not have owners
            assert cde["data_owner"] is None, \
                f"Newly generated CDE should not have owner, got '{cde['data_owner']}'"
    
    @settings(max_examples=100)
    @given(
        cde_id=st.uuids().map(str),
        owner_name=non_empty_string_strategy,
        owner_email=email_strategy,
        approver=non_empty_string_strategy,
        rationale=st.text(min_size=20, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))),
        report_id=st.uuids().map(str),
    )
    def test_approved_cde_has_non_null_owner(
        self, cde_id: str, owner_name: str, owner_email: str,
        approver: str, rationale: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: For any CDE with status 'approved', the data_owner field
        must be non-null and non-empty.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        approve_cde = tools[6]
        update_cde_owner = tools[5]
        
        # Create a CDE with owner and pending_approval status
        cde = CDE(
            id=cde_id,
            element_id=f"elem-{cde_id}",
            name="Test CDE",
            business_definition="A test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner=owner_name,
            data_owner_email=owner_email,
            status='pending_approval'
        )
        
        # Store the CDE in repository using helper function
        setup_cde_in_repository(repository, cde, report_id)
        
        # Approve the CDE
        result = approve_cde(
            cde_id=cde_id,
            approver=approver,
            rationale=rationale
        )
        
        # Property: Approved CDE must have non-null owner
        assert result["status"] == "approved"
        assert result["data_owner"] is not None, \
            "Approved CDE must have non-null data_owner"
        assert len(result["data_owner"].strip()) > 0, \
            "Approved CDE must have non-empty data_owner"
    
    @settings(max_examples=100)
    @given(
        cde_id=st.uuids().map(str),
        approver=non_empty_string_strategy,
        rationale=st.text(min_size=20, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))),
        report_id=st.uuids().map(str),
    )
    def test_cde_without_owner_cannot_be_approved(
        self, cde_id: str, approver: str, rationale: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: A CDE without a data owner cannot transition to 'approved' status.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        approve_cde = tools[6]
        
        # Create a CDE without owner
        cde = CDE(
            id=cde_id,
            element_id=f"elem-{cde_id}",
            name="Test CDE Without Owner",
            business_definition="A test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner=None,
            data_owner_email=None,
            status='pending_approval'
        )
        
        # Store the CDE in repository using helper function
        setup_cde_in_repository(repository, cde, report_id)
        
        # Property: Approval must fail for CDE without owner
        with pytest.raises(ValueError) as exc_info:
            approve_cde(
                cde_id=cde_id,
                approver=approver,
                rationale=rationale
            )
        
        assert "owner" in str(exc_info.value).lower(), \
            f"Expected error about owner, got: {exc_info.value}"
        
        # Verify CDE status unchanged by retrieving from repository
        stored_cde = repository.get_cde(cde_id)
        assert stored_cde.status == 'pending_approval', \
            f"CDE status should remain 'pending_approval', got '{stored_cde.status}'"
    
    @settings(max_examples=100)
    @given(
        cde_id=st.uuids().map(str),
        owner_name=non_empty_string_strategy,
        owner_email=email_strategy,
        updater=non_empty_string_strategy,
        report_id=st.uuids().map(str),
    )
    def test_owner_assignment_preserves_pending_status(
        self, cde_id: str, owner_name: str, owner_email: str, updater: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: Assigning an owner to a CDE does not automatically change
        its status - it remains in pending_approval until explicitly approved.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        update_cde_owner = tools[5]
        
        # Create a CDE without owner
        cde = CDE(
            id=cde_id,
            element_id=f"elem-{cde_id}",
            name="Test CDE",
            business_definition="A test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner=None,
            data_owner_email=None,
            status='pending_approval'
        )
        
        # Store the CDE in repository using helper function
        setup_cde_in_repository(repository, cde, report_id)
        
        # Assign owner
        result = update_cde_owner(
            cde_id=cde_id,
            owner_name=owner_name,
            owner_email=owner_email,
            updater=updater,
            rationale="Assigning data owner"
        )
        
        # Property: Status should remain pending_approval after owner assignment
        assert result["status"] == "pending_approval", \
            f"Expected status 'pending_approval' after owner assignment, got '{result['status']}'"
        
        # Property: Owner should be assigned
        assert result["data_owner"] == owner_name, \
            f"Expected owner '{owner_name}', got '{result['data_owner']}'"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        num_cdes=st.integers(min_value=1, max_value=5),
    )
    def test_suggest_owners_for_cdes_without_owners(
        self, report_id: str, num_cdes: int
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: The suggest_data_owners tool should suggest owners for
        CDEs that don't have owners assigned.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        suggest_data_owners = tools[3]
        
        # Create CDEs without owners
        cdes = []
        for i in range(num_cdes):
            cde = CDE(
                element_id=f"elem-{i}",
                name=f"Test CDE {i}",
                business_definition=f"A test critical data element {i}",
                criticality_rationale="High regulatory impact",
                data_owner=None,
                data_owner_email=None,
                status='pending_approval'
            )
            cdes.append(cde)
        
        # Create inventory with CDEs
        from datetime import datetime
        inventory = CDEInventory(
            report_id=report_id,
            cdes=cdes,
            version=1,
            status='draft',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        repository.set_cde_inventory(report_id, inventory)
        
        # Get owner suggestions
        suggestions = suggest_data_owners(report_id=report_id)
        
        # Property: Should get suggestions for all CDEs without owners
        assert len(suggestions) == num_cdes, \
            f"Expected {num_cdes} suggestions, got {len(suggestions)}"
        
        # Property: Each suggestion should have required fields
        for suggestion in suggestions:
            assert suggestion["suggested_owner"], \
                "Suggestion must have suggested_owner"
            assert suggestion["suggested_owner_email"], \
                "Suggestion must have suggested_owner_email"
            assert 0.0 <= suggestion["confidence"] <= 1.0, \
                f"Confidence must be between 0 and 1, got {suggestion['confidence']}"
    
    @settings(max_examples=100)
    @given(
        report_id=st.uuids().map(str),
        owner_name=non_empty_string_strategy,
        owner_email=email_strategy,
    )
    def test_cdes_with_owners_not_suggested_by_default(
        self, report_id: str, owner_name: str, owner_email: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: CDEs that already have owners should not receive owner
        suggestions by default (unless explicitly requested).
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        suggest_data_owners = tools[3]
        
        # Create CDE with owner
        cde_with_owner = CDE(
            element_id="elem-with-owner",
            name="CDE With Owner",
            business_definition="A test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner=owner_name,
            data_owner_email=owner_email,
            status='pending_approval'
        )
        
        # Create CDE without owner
        cde_without_owner = CDE(
            element_id="elem-without-owner",
            name="CDE Without Owner",
            business_definition="Another test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner=None,
            data_owner_email=None,
            status='pending_approval'
        )
        
        # Create inventory
        from datetime import datetime
        inventory = CDEInventory(
            report_id=report_id,
            cdes=[cde_with_owner, cde_without_owner],
            version=1,
            status='draft',
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        
        repository.set_cde_inventory(report_id, inventory)
        
        # Get owner suggestions (default behavior)
        suggestions = suggest_data_owners(report_id=report_id)
        
        # Property: Only CDE without owner should get suggestion
        assert len(suggestions) == 1, \
            f"Expected 1 suggestion (for CDE without owner), got {len(suggestions)}"
        
        suggested_cde_ids = {s["cde_id"] for s in suggestions}
        assert cde_without_owner.id in suggested_cde_ids, \
            "CDE without owner should receive suggestion"
        assert cde_with_owner.id not in suggested_cde_ids, \
            "CDE with owner should not receive suggestion by default"
    
    @settings(max_examples=100)
    @given(
        cde_id=st.uuids().map(str),
        approver=non_empty_string_strategy,
        rationale=st.text(min_size=20, max_size=200, alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))),
        report_id=st.uuids().map(str),
    )
    def test_only_pending_approval_cdes_can_be_approved(
        self, cde_id: str, approver: str, rationale: str, report_id: str
    ):
        """
        **Feature: agentcore-python-refactor, Property 10: CDE Ownership Validation**
        **Validates: Requirements 4.5**
        
        Property: Only CDEs with status 'pending_approval' can be approved.
        CDEs with other statuses should raise an error.
        """
        repository = InMemoryGovernanceRepository()
        tools = create_cde_tools(repository)
        
        approve_cde = tools[6]
        
        # Create an already approved CDE
        cde = CDE(
            id=cde_id,
            element_id=f"elem-{cde_id}",
            name="Already Approved CDE",
            business_definition="A test critical data element",
            criticality_rationale="High regulatory impact",
            data_owner="Existing Owner",
            data_owner_email="owner@example.com",
            status='approved'
        )
        
        # Store the CDE in repository using helper function
        setup_cde_in_repository(repository, cde, report_id)
        
        # Property: Attempting to approve already approved CDE must fail
        with pytest.raises(ValueError) as exc_info:
            approve_cde(
                cde_id=cde_id,
                approver=approver,
                rationale=rationale
            )
        
        assert "pending_approval" in str(exc_info.value).lower(), \
            f"Expected error about pending_approval status, got: {exc_info.value}"
