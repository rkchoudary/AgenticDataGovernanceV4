"""
CDE Identification Agent tools for the Agentic Data Governance System.

This module defines Strands tools for scoring data elements, generating CDE
inventories, reconciling with existing inventories, and suggesting data owners.

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.cde import (
    CDE,
    CDEInventory,
    CDEScore,
    CDEScoringFactors,
    OwnerSuggestion,
    ScoringContext,
    ArtifactStatus,
)
from models.data_elements import DataElement
from models.audit import AuditEntry
from repository.base import GovernanceRepository


def create_cde_tools(repository: GovernanceRepository):
    """
    Factory function to create CDE tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the CDE Identification Agent.
    """
    
    @tool
    def score_data_elements(
        report_id: str,
        elements: list[dict],
        scoring_weights: Optional[dict] = None
    ) -> list[dict]:
        """
        Score data elements for CDE criticality based on multiple factors.
        
        Calculates scores based on: regulatory_calculation_usage, cross_report_usage,
        financial_impact, and regulatory_scrutiny.
        
        Args:
            report_id: The ID of the regulatory report.
            elements: List of data elements to score, each containing:
                - id: Element ID
                - name: Element name
                - regulatory_calculation_usage: Score 0-1 for regulatory calculation usage
                - cross_report_usage: Score 0-1 for cross-report usage
                - financial_impact: Score 0-1 for financial impact
                - regulatory_scrutiny: Score 0-1 for regulatory scrutiny
            scoring_weights: Optional custom weights for scoring factors.
                Defaults to equal weights (0.25 each).
                
        Returns:
            List of CDE scores with overall score and rationale.
        """
        # Default weights - equal weighting for all factors
        weights = scoring_weights or {
            "regulatory_calculation_usage": 0.25,
            "cross_report_usage": 0.25,
            "financial_impact": 0.25,
            "regulatory_scrutiny": 0.25
        }
        
        scores: list[CDEScore] = []
        
        for element in elements:
            element_id = element.get("id", "")
            
            # Extract scoring factors with defaults
            factors = CDEScoringFactors(
                regulatory_calculation_usage=float(element.get("regulatory_calculation_usage", 0.0)),
                cross_report_usage=float(element.get("cross_report_usage", 0.0)),
                financial_impact=float(element.get("financial_impact", 0.0)),
                regulatory_scrutiny=float(element.get("regulatory_scrutiny", 0.0))
            )
            
            # Calculate weighted overall score
            overall_score = (
                factors.regulatory_calculation_usage * weights["regulatory_calculation_usage"] +
                factors.cross_report_usage * weights["cross_report_usage"] +
                factors.financial_impact * weights["financial_impact"] +
                factors.regulatory_scrutiny * weights["regulatory_scrutiny"]
            )
            
            # Generate rationale based on highest contributing factors
            rationale_parts = []
            if factors.regulatory_calculation_usage >= 0.7:
                rationale_parts.append("high regulatory calculation usage")
            if factors.cross_report_usage >= 0.7:
                rationale_parts.append("used across multiple reports")
            if factors.financial_impact >= 0.7:
                rationale_parts.append("significant financial impact")
            if factors.regulatory_scrutiny >= 0.7:
                rationale_parts.append("high regulatory scrutiny")
            
            if not rationale_parts:
                if overall_score >= 0.5:
                    rationale_parts.append("moderate criticality across multiple factors")
                else:
                    rationale_parts.append("low criticality based on scoring factors")
            
            rationale = f"Element scored {overall_score:.2f} due to: {', '.join(rationale_parts)}"
            
            score = CDEScore(
                element_id=element_id,
                overall_score=overall_score,
                factors=factors,
                rationale=rationale
            )
            scores.append(score)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="CDEIdentificationAgent",
            actor_type="agent",
            action="score_data_elements",
            entity_type="CDEScore",
            entity_id=report_id,
            new_state={
                "report_id": report_id,
                "elements_scored": len(scores),
                "weights": weights
            }
        ))
        
        return [s.model_dump() for s in scores]
    
    @tool
    def generate_cde_inventory(
        report_id: str,
        scores: list[dict],
        threshold: float = 0.7,
        include_rationale: bool = True
    ) -> dict:
        """
        Generate a CDE inventory from scored elements above the threshold.
        
        Elements with scores at or above the threshold are included in the
        inventory with their rationale.
        
        Args:
            report_id: The ID of the regulatory report.
            scores: List of CDE scores from score_data_elements.
            threshold: Minimum score to be considered a CDE (default 0.7).
            include_rationale: Whether to include rationale in CDE records.
            
        Returns:
            The generated CDE inventory.
        """
        cdes: list[CDE] = []
        
        # Get requirements document for element details
        req_doc = repository.get_requirements_document(report_id)
        element_lookup = {}
        if req_doc:
            element_lookup = {e.id: e for e in req_doc.elements}
        
        for score_dict in scores:
            score = CDEScore(**score_dict)
            
            # Only include elements at or above threshold
            if score.overall_score >= threshold:
                # Get element details if available
                element = element_lookup.get(score.element_id)
                element_name = element.name if element else f"Element_{score.element_id}"
                element_definition = element.regulatory_definition if element else ""
                
                # Create CDE with rationale
                rationale = score.rationale if include_rationale else ""
                
                cde = CDE(
                    element_id=score.element_id,
                    name=element_name,
                    business_definition=element_definition,
                    criticality_rationale=rationale,
                    status='pending_approval'  # New CDEs require approval
                )
                cdes.append(cde)
        
        # Create or update inventory
        existing_inventory = repository.get_cde_inventory(report_id)
        
        if existing_inventory:
            # Merge with existing inventory
            existing_element_ids = {c.element_id for c in existing_inventory.cdes}
            for cde in cdes:
                if cde.element_id not in existing_element_ids:
                    existing_inventory.cdes.append(cde)
            existing_inventory.version += 1
            existing_inventory.updated_at = datetime.now()
            existing_inventory.status = 'draft'
            inventory = existing_inventory
        else:
            inventory = CDEInventory(
                report_id=report_id,
                cdes=cdes,
                version=1,
                status='draft',
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
        
        repository.set_cde_inventory(report_id, inventory)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="CDEIdentificationAgent",
            actor_type="agent",
            action="generate_cde_inventory",
            entity_type="CDEInventory",
            entity_id=inventory.id,
            new_state={
                "report_id": report_id,
                "cdes_count": len(cdes),
                "threshold": threshold,
                "total_scored": len(scores)
            }
        ))
        
        return inventory.model_dump()
    
    @tool
    def reconcile_with_existing(
        report_id: str,
        new_cdes: list[dict]
    ) -> dict:
        """
        Reconcile new CDEs with existing inventory.
        
        Compares new CDEs against existing inventory and categorizes as:
        matched, added, removed, or modified.
        
        Args:
            report_id: The ID of the regulatory report.
            new_cdes: List of new CDE dictionaries to reconcile.
            
        Returns:
            Reconciliation result with counts and details.
        """
        existing_inventory = repository.get_cde_inventory(report_id)
        
        reconciliation_items = []
        matched_count = 0
        added_count = 0
        removed_count = 0
        modified_count = 0
        
        # Build lookup for existing CDEs by element_id
        existing_by_element_id = {}
        if existing_inventory:
            existing_by_element_id = {c.element_id: c for c in existing_inventory.cdes}
        
        # Build lookup for new CDEs
        new_by_element_id = {}
        for cde_dict in new_cdes:
            element_id = cde_dict.get("element_id", "")
            new_by_element_id[element_id] = cde_dict
        
        # Check new CDEs against existing
        for element_id, new_cde_dict in new_by_element_id.items():
            if element_id in existing_by_element_id:
                existing_cde = existing_by_element_id[element_id]
                
                # Check for modifications
                differences = []
                if existing_cde.name != new_cde_dict.get("name"):
                    differences.append("name")
                if existing_cde.business_definition != new_cde_dict.get("business_definition"):
                    differences.append("business_definition")
                if existing_cde.criticality_rationale != new_cde_dict.get("criticality_rationale"):
                    differences.append("criticality_rationale")
                
                if differences:
                    modified_count += 1
                    reconciliation_items.append({
                        "element_id": element_id,
                        "status": "modified",
                        "differences": differences,
                        "existing": existing_cde.model_dump(),
                        "new": new_cde_dict
                    })
                else:
                    matched_count += 1
                    reconciliation_items.append({
                        "element_id": element_id,
                        "status": "matched"
                    })
            else:
                added_count += 1
                reconciliation_items.append({
                    "element_id": element_id,
                    "status": "added",
                    "new": new_cde_dict
                })
        
        # Check for removed CDEs
        for element_id, existing_cde in existing_by_element_id.items():
            if element_id not in new_by_element_id:
                removed_count += 1
                reconciliation_items.append({
                    "element_id": element_id,
                    "status": "removed",
                    "existing": existing_cde.model_dump()
                })
        
        result = {
            "report_id": report_id,
            "items": reconciliation_items,
            "matched_count": matched_count,
            "added_count": added_count,
            "removed_count": removed_count,
            "modified_count": modified_count,
            "total_existing": len(existing_by_element_id),
            "total_new": len(new_by_element_id)
        }
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="CDEIdentificationAgent",
            actor_type="agent",
            action="reconcile_with_existing",
            entity_type="CDEInventory",
            entity_id=report_id,
            new_state=result
        ))
        
        return result
    
    @tool
    def suggest_data_owners(
        report_id: str,
        cde_ids: Optional[list[str]] = None
    ) -> list[dict]:
        """
        Suggest data owners for CDEs based on data domain analysis.
        
        Analyzes CDE characteristics and suggests appropriate data owners
        with confidence scores.
        
        Args:
            report_id: The ID of the regulatory report.
            cde_ids: Optional list of specific CDE IDs to suggest owners for.
                    If not provided, suggests for all CDEs without owners.
                    
        Returns:
            List of owner suggestions with confidence scores.
        """
        inventory = repository.get_cde_inventory(report_id)
        if not inventory:
            raise ValueError(f"No CDE inventory found for report {report_id}")
        
        suggestions: list[OwnerSuggestion] = []
        
        # Domain to owner mapping (in production, this would be from a data catalog)
        domain_owners = {
            "finance": {"name": "Finance Data Team", "email": "finance-data@example.com"},
            "risk": {"name": "Risk Analytics Team", "email": "risk-analytics@example.com"},
            "regulatory": {"name": "Regulatory Reporting Team", "email": "reg-reporting@example.com"},
            "customer": {"name": "Customer Data Team", "email": "customer-data@example.com"},
            "trading": {"name": "Trading Systems Team", "email": "trading-systems@example.com"},
            "default": {"name": "Data Governance Team", "email": "data-governance@example.com"}
        }
        
        # Keywords for domain classification
        domain_keywords = {
            "finance": ["balance", "amount", "revenue", "cost", "profit", "loss", "asset", "liability"],
            "risk": ["risk", "exposure", "var", "credit", "market", "operational"],
            "regulatory": ["regulatory", "compliance", "report", "filing", "submission"],
            "customer": ["customer", "client", "account", "party", "counterparty"],
            "trading": ["trade", "position", "instrument", "security", "derivative"]
        }
        
        cdes_to_process = inventory.cdes
        if cde_ids:
            cdes_to_process = [c for c in inventory.cdes if c.id in cde_ids]
        
        for cde in cdes_to_process:
            # Skip CDEs that already have owners (unless explicitly requested)
            if cde.data_owner and not cde_ids:
                continue
            
            # Analyze CDE name and definition for domain classification
            text_to_analyze = f"{cde.name} {cde.business_definition}".lower()
            
            # Score each domain based on keyword matches
            domain_scores = {}
            for domain, keywords in domain_keywords.items():
                score = sum(1 for kw in keywords if kw in text_to_analyze)
                if score > 0:
                    domain_scores[domain] = score
            
            # Select best matching domain
            if domain_scores:
                best_domain = max(domain_scores, key=domain_scores.get)
                confidence = min(0.95, 0.5 + (domain_scores[best_domain] * 0.15))
            else:
                best_domain = "default"
                confidence = 0.5
            
            owner_info = domain_owners[best_domain]
            
            # Generate rationale
            if best_domain != "default":
                rationale = f"CDE '{cde.name}' classified as {best_domain} domain based on content analysis"
            else:
                rationale = f"CDE '{cde.name}' assigned to default governance team - manual review recommended"
            
            suggestion = OwnerSuggestion(
                cde_id=cde.id,
                suggested_owner=owner_info["name"],
                suggested_owner_email=owner_info["email"],
                confidence=confidence,
                rationale=rationale
            )
            suggestions.append(suggestion)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="CDEIdentificationAgent",
            actor_type="agent",
            action="suggest_data_owners",
            entity_type="OwnerSuggestion",
            entity_id=report_id,
            new_state={
                "report_id": report_id,
                "suggestions_count": len(suggestions),
                "cde_ids": cde_ids
            }
        ))
        
        return [s.model_dump() for s in suggestions]
    
    @tool
    def get_cde_inventory(report_id: str) -> dict:
        """
        Get the current CDE inventory for a report.
        
        Args:
            report_id: The ID of the regulatory report.
            
        Returns:
            The CDE inventory or empty inventory if not found.
        """
        inventory = repository.get_cde_inventory(report_id)
        if not inventory:
            return CDEInventory(
                report_id=report_id,
                cdes=[],
                version=0,
                status='draft',
                created_at=datetime.now(),
                updated_at=datetime.now()
            ).model_dump()
        return inventory.model_dump()
    
    @tool
    def update_cde_owner(
        cde_id: str,
        owner_name: str,
        owner_email: str,
        updater: str,
        rationale: Optional[str] = None
    ) -> dict:
        """
        Update the data owner for a specific CDE.
        
        Args:
            cde_id: The ID of the CDE to update.
            owner_name: The name of the data owner.
            owner_email: The email of the data owner.
            updater: The person making the update.
            rationale: Optional rationale for the owner assignment.
            
        Returns:
            The updated CDE.
        """
        cde = repository.get_cde(cde_id)
        if not cde:
            raise ValueError(f"CDE with ID '{cde_id}' not found")
        
        previous_state = cde.model_dump()
        
        cde.data_owner = owner_name
        cde.data_owner_email = owner_email
        
        repository.update_cde(cde)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=updater,
            actor_type="human",
            action="update_cde_owner",
            entity_type="CDE",
            entity_id=cde_id,
            previous_state=previous_state,
            new_state=cde.model_dump(),
            rationale=rationale
        ))
        
        return cde.model_dump()
    
    @tool
    def approve_cde(
        cde_id: str,
        approver: str,
        rationale: str
    ) -> dict:
        """
        Approve a CDE after review.
        
        Validates that the CDE has a data owner before approval.
        
        Args:
            cde_id: The ID of the CDE to approve.
            approver: The person approving the CDE.
            rationale: The reason for approval.
            
        Returns:
            The approved CDE.
        """
        cde = repository.get_cde(cde_id)
        if not cde:
            raise ValueError(f"CDE with ID '{cde_id}' not found")
        
        if cde.status != 'pending_approval':
            raise ValueError(f"CDE must be in 'pending_approval' status to approve, current status: {cde.status}")
        
        # Validate ownership requirement
        if not cde.data_owner:
            raise ValueError("CDE must have a data owner assigned before approval")
        
        previous_state = cde.model_dump()
        
        cde.status = 'approved'
        cde.approved_by = approver
        cde.approved_at = datetime.now()
        
        repository.update_cde(cde)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=approver,
            actor_type="human",
            action="approve_cde",
            entity_type="CDE",
            entity_id=cde_id,
            previous_state=previous_state,
            new_state=cde.model_dump(),
            rationale=rationale
        ))
        
        return cde.model_dump()
    
    return [
        score_data_elements,
        generate_cde_inventory,
        reconcile_with_existing,
        suggest_data_owners,
        get_cde_inventory,
        update_cde_owner,
        approve_cde
    ]
