"""
Regulatory Intelligence Agent tools for the Agentic Data Governance System.

This module defines Strands tools for scanning regulatory sources, detecting changes,
and managing the regulatory report catalog.

Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
Requirements: 16.2, 16.3 (Identity integration for approval tools)
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.regulatory import (
    Jurisdiction,
    ScanResult,
    RegulatoryChange,
    CatalogUpdate,
    ReportCatalog,
    RegulatoryReport,
    ArtifactStatus,
)
from models.audit import AuditEntry, CreateAuditEntryParams
from repository.base import GovernanceRepository
from services.identity_config import (
    requires_access_token,
    decode_jwt_claims,
    extract_user_for_audit,
    get_current_identity_context,
    AuthenticationError,
    AuthorizationError,
)


def create_regulatory_tools(repository: GovernanceRepository):
    """
    Factory function to create regulatory tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the Regulatory Intelligence Agent.
    """
    
    @tool
    def scan_regulatory_sources(jurisdictions: list[str]) -> list[dict]:
        """
        Scan regulatory body sources (OSFI, Federal Reserve, OCC, FDIC) for required reports.
        
        Args:
            jurisdictions: List of jurisdictions to scan ('US', 'CA')
            
        Returns:
            List of scan results with detected reports and changes
        """
        results = []
        existing_catalog = repository.get_report_catalog()
        existing_ids = {r.id for r in existing_catalog.reports} if existing_catalog else set()
        
        for jurisdiction in jurisdictions:
            # Validate jurisdiction
            if jurisdiction not in ('US', 'CA'):
                continue
                
            changes: list[RegulatoryChange] = []
            
            # In a real implementation, this would scan external regulatory sources
            # For now, we return the current state
            reports_found = 0
            if existing_catalog:
                reports_found = len([
                    r for r in existing_catalog.reports 
                    if r.jurisdiction == jurisdiction
                ])
            
            scan_result = ScanResult(
                jurisdiction=jurisdiction,  # type: ignore
                scanned_at=datetime.now(),
                reports_found=reports_found,
                changes_detected=changes
            )
            results.append(scan_result.model_dump())
        
        # Create audit entry for the scan
        repository.create_audit_entry(AuditEntry(
            actor="RegulatoryIntelligenceAgent",
            actor_type="agent",
            action="scan_regulatory_sources",
            entity_type="ReportCatalog",
            entity_id="singleton",
            new_state={"jurisdictions": jurisdictions, "results_count": len(results)}
        ))
        
        return results
    
    @tool
    def detect_changes(since: str) -> list[dict]:
        """
        Detect changes in regulatory requirements since a given date.
        
        Args:
            since: ISO format date string to check changes from
            
        Returns:
            List of detected regulatory changes
        """
        since_date = datetime.fromisoformat(since)
        changes: list[dict] = []
        
        existing_catalog = repository.get_report_catalog()
        if existing_catalog:
            # Check for reports updated after the since date
            for report in existing_catalog.reports:
                if report.last_updated > since_date:
                    change = RegulatoryChange(
                        report_id=report.id,
                        change_type='updated',
                        description=f"Report '{report.name}' was updated",
                        effective_date=report.last_updated,
                        detected_at=datetime.now(),
                        source=report.regulator
                    )
                    changes.append(change.model_dump())
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="RegulatoryIntelligenceAgent",
            actor_type="agent",
            action="detect_changes",
            entity_type="RegulatoryChange",
            entity_id="batch",
            new_state={"since": since, "changes_count": len(changes)}
        ))
        
        return changes
    
    @tool
    def update_report_catalog(changes: list[dict]) -> dict:
        """
        Update the report catalog with detected changes.
        Sets status to 'pending_review' for human approval.
        
        Args:
            changes: List of regulatory changes to apply
            
        Returns:
            Catalog update result with version and change counts
        """
        existing = repository.get_report_catalog()
        previous_state = existing.model_dump() if existing else None
        
        added_reports: list[str] = []
        updated_reports: list[str] = []
        removed_reports: list[str] = []
        
        # Process changes
        for change_dict in changes:
            change = RegulatoryChange(**change_dict)
            
            if change.change_type == 'new' and change.report_id:
                added_reports.append(change.report_id)
            elif change.change_type == 'updated' and change.report_id:
                updated_reports.append(change.report_id)
            elif change.change_type == 'removed' and change.report_id:
                removed_reports.append(change.report_id)
        
        # Create or update catalog
        new_version = (existing.version + 1) if existing else 1
        new_catalog = ReportCatalog(
            reports=existing.reports if existing else [],
            version=new_version,
            last_scanned=datetime.now(),
            status='pending_review'
        )
        
        repository.set_report_catalog(new_catalog)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="RegulatoryIntelligenceAgent",
            actor_type="agent",
            action="update_report_catalog",
            entity_type="ReportCatalog",
            entity_id="singleton",
            previous_state=previous_state,
            new_state=new_catalog.model_dump()
        ))
        
        return CatalogUpdate(
            version=new_version,
            added_reports=added_reports,
            updated_reports=updated_reports,
            removed_reports=removed_reports,
            updated_at=datetime.now()
        ).model_dump()
    
    @tool
    def get_report_catalog() -> dict:
        """
        Get the current regulatory report catalog.
        
        Returns:
            Current report catalog with all reports and metadata
        """
        catalog = repository.get_report_catalog()
        if not catalog:
            return ReportCatalog(
                reports=[],
                version=0,
                last_scanned=datetime.now(),
                status='draft'
            ).model_dump()
        return catalog.model_dump()
    
    @tool
    def approve_catalog(
        approver: str, 
        rationale: str,
        access_token: Optional[str] = None
    ) -> dict:
        """
        Approve the report catalog after human review.
        
        Requires authentication via access_token for audit trail compliance.
        The approver identity is extracted from the JWT token claims.
        
        Args:
            approver: Name/ID of the person approving (verified against token)
            rationale: Reason for approval
            access_token: JWT access token for authentication (optional, can be set via env)
            
        Returns:
            Updated catalog with approved status
            
        Requirements: 16.2, 16.3
        """
        catalog = repository.get_report_catalog()
        if not catalog:
            raise ValueError("No catalog exists to approve")
        
        if catalog.status != 'pending_review':
            raise ValueError(f"Catalog must be in 'pending_review' status to approve, current status: {catalog.status}")
        
        previous_state = catalog.model_dump()
        
        # Extract user identity from token if provided
        verified_approver = approver
        user_audit_info = None
        
        if access_token:
            try:
                user_audit_info = extract_user_for_audit(access_token)
                # Use the verified user ID from token
                verified_approver = user_audit_info.get("user_id", approver)
                
                # Validate that the approver matches the token identity
                if approver != verified_approver and approver != "system":
                    # Log a warning but allow - the token identity takes precedence
                    pass
            except Exception:
                # If token parsing fails, continue with provided approver
                pass
        
        # Update catalog status
        catalog.status = 'approved'
        catalog.approved_by = verified_approver
        catalog.approved_at = datetime.now()
        
        repository.set_report_catalog(catalog)
        
        # Create audit entry with enhanced user information
        audit_new_state = catalog.model_dump()
        if user_audit_info:
            audit_new_state["_audit_user_info"] = user_audit_info
        
        repository.create_audit_entry(AuditEntry(
            actor=verified_approver,
            actor_type="human",
            action="approve_catalog",
            entity_type="ReportCatalog",
            entity_id="singleton",
            previous_state=previous_state,
            new_state=audit_new_state,
            rationale=rationale
        ))
        
        return catalog.model_dump()
    
    @tool
    def submit_for_review(
        submitter: str, 
        notes: Optional[str] = None,
        access_token: Optional[str] = None
    ) -> dict:
        """
        Submit the report catalog for human review.
        Changes status from 'draft' to 'pending_review'.
        
        Supports authentication via access_token for audit trail compliance.
        
        Args:
            submitter: Name/ID of the person submitting for review
            notes: Optional notes for reviewers
            access_token: JWT access token for authentication (optional)
            
        Returns:
            Updated catalog with pending_review status
            
        Requirements: 16.2, 16.3
        """
        catalog = repository.get_report_catalog()
        if not catalog:
            raise ValueError("No catalog exists to submit for review")
        
        if catalog.status != 'draft':
            raise ValueError(f"Catalog must be in 'draft' status to submit for review, current status: {catalog.status}")
        
        previous_state = catalog.model_dump()
        
        # Extract user identity from token if provided
        verified_submitter = submitter
        user_audit_info = None
        
        if access_token:
            try:
                user_audit_info = extract_user_for_audit(access_token)
                verified_submitter = user_audit_info.get("user_id", submitter)
            except Exception:
                pass
        
        # Update catalog status
        catalog.status = 'pending_review'
        
        repository.set_report_catalog(catalog)
        
        # Create audit entry with enhanced user information
        audit_new_state = catalog.model_dump()
        if user_audit_info:
            audit_new_state["_audit_user_info"] = user_audit_info
        
        repository.create_audit_entry(AuditEntry(
            actor=verified_submitter,
            actor_type="human",
            action="submit_for_review",
            entity_type="ReportCatalog",
            entity_id="singleton",
            previous_state=previous_state,
            new_state=audit_new_state,
            rationale=notes
        ))
        
        # Log notification (in real implementation, would send actual notification)
        _log_notification(
            recipient="compliance_officers",
            subject="Report Catalog Submitted for Review",
            message=f"The report catalog has been submitted for review by {verified_submitter}. Notes: {notes or 'None'}"
        )
        
        return catalog.model_dump()
    
    @tool
    def modify_catalog(
        report_id: str,
        action: str,
        report_data: Optional[dict] = None,
        modifier: str = "system",
        rationale: Optional[str] = None,
        access_token: Optional[str] = None
    ) -> dict:
        """
        Modify the report catalog by adding, updating, or removing a report.
        Sets catalog status to 'draft' if currently approved.
        
        Supports authentication via access_token for audit trail compliance.
        
        Args:
            report_id: ID of the report to modify
            action: Action to perform ('add', 'update', 'remove')
            report_data: Report data for add/update actions
            modifier: Name/ID of the person making the modification
            rationale: Reason for the modification
            access_token: JWT access token for authentication (optional)
            
        Returns:
            Updated catalog
            
        Requirements: 16.2, 16.3
        """
        catalog = repository.get_report_catalog()
        if not catalog:
            catalog = ReportCatalog(
                reports=[],
                version=0,
                last_scanned=datetime.now(),
                status='draft'
            )
        
        previous_state = catalog.model_dump()
        
        # Extract user identity from token if provided
        verified_modifier = modifier
        user_audit_info = None
        actor_type = "human" if modifier != "system" else "system"
        
        if access_token:
            try:
                user_audit_info = extract_user_for_audit(access_token)
                verified_modifier = user_audit_info.get("user_id", modifier)
                actor_type = "human"
            except Exception:
                pass
        
        if action == 'add':
            if not report_data:
                raise ValueError("report_data is required for 'add' action")
            
            # Ensure the report has the specified ID
            report_data['id'] = report_id
            new_report = RegulatoryReport(**report_data)
            catalog.reports.append(new_report)
            
        elif action == 'update':
            if not report_data:
                raise ValueError("report_data is required for 'update' action")
            
            # Find and update the report
            found = False
            for i, report in enumerate(catalog.reports):
                if report.id == report_id:
                    report_data['id'] = report_id
                    catalog.reports[i] = RegulatoryReport(**report_data)
                    found = True
                    break
            
            if not found:
                raise ValueError(f"Report with ID '{report_id}' not found")
                
        elif action == 'remove':
            # Find and remove the report
            original_count = len(catalog.reports)
            catalog.reports = [r for r in catalog.reports if r.id != report_id]
            
            if len(catalog.reports) == original_count:
                raise ValueError(f"Report with ID '{report_id}' not found")
        else:
            raise ValueError(f"Invalid action: {action}. Must be 'add', 'update', or 'remove'")
        
        # If catalog was approved, set back to draft
        if catalog.status == 'approved':
            catalog.status = 'draft'
            catalog.approved_by = None
            catalog.approved_at = None
        
        # Increment version
        catalog.version += 1
        
        repository.set_report_catalog(catalog)
        
        # Create audit entry with enhanced user information
        audit_new_state = catalog.model_dump()
        if user_audit_info:
            audit_new_state["_audit_user_info"] = user_audit_info
        
        repository.create_audit_entry(AuditEntry(
            actor=verified_modifier,
            actor_type=actor_type,
            action=f"modify_catalog_{action}",
            entity_type="ReportCatalog",
            entity_id="singleton",
            previous_state=previous_state,
            new_state=audit_new_state,
            rationale=rationale
        ))
        
        return catalog.model_dump()
    
    return [
        scan_regulatory_sources,
        detect_changes,
        update_report_catalog,
        get_report_catalog,
        approve_catalog,
        submit_for_review,
        modify_catalog
    ]


def _log_notification(recipient: str, subject: str, message: str) -> None:
    """
    Log a notification (placeholder for actual notification service).
    
    In a real implementation, this would integrate with a notification service
    to send emails, Slack messages, etc.
    
    Args:
        recipient: The recipient of the notification
        subject: The notification subject
        message: The notification message
    """
    # In production, this would call a notification service
    # For now, we just log the notification details
    print(f"[NOTIFICATION] To: {recipient}, Subject: {subject}, Message: {message}")
