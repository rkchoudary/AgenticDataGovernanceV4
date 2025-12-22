"""
Controls Management Service for the Agentic Data Governance System.

This module provides functions for managing controls, evidence logging,
and audit scheduling.

Requirements: 11.1, 11.2, 11.3, 11.4
"""

from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4

from models.controls import (
    Control,
    ControlMatrix,
    ControlEvidence,
    ControlType,
    ControlCategory,
    ControlStatus,
    ControlEvidenceOutcome,
    ControlFrequency,
)
from models.audit import AuditEntry, ActorType
from repository.base import GovernanceRepository


# Valid control types per Requirement 11.2
VALID_CONTROL_TYPES: list[ControlType] = [
    'organizational', 
    'process', 
    'access', 
    'change_management'
]

VALID_CONTROL_CATEGORIES: list[ControlCategory] = ['preventive', 'detective']
VALID_CONTROL_STATUSES: list[ControlStatus] = ['active', 'inactive', 'compensating']


class ControlsManagementService:
    """
    Service for managing controls, evidence, and effectiveness reviews.
    
    Implements Requirements 11.1, 11.2, 11.3, 11.4.
    """
    
    def __init__(self, repository: GovernanceRepository):
        """
        Initialize the Controls Management Service.
        
        Args:
            repository: The governance repository for data persistence.
        """
        self.repository = repository
    
    def categorize_control(
        self,
        control: Control,
        control_type: ControlType,
        category: ControlCategory,
        actor: str = "system",
        actor_type: ActorType = "system"
    ) -> Control:
        """
        Categorize a control by setting its type and category.
        
        Validates that the type is one of: organizational, process, access, change_management.
        
        Args:
            control: The control to categorize.
            control_type: The type of control.
            category: The category of control (preventive/detective).
            actor: The actor performing the categorization.
            actor_type: The type of actor.
            
        Returns:
            The updated control with categorization applied.
            
        Raises:
            ValueError: If the control type or category is invalid.
            
        Requirements: 11.1, 11.2
        """
        # Validate control type per Requirement 11.2
        if control_type not in VALID_CONTROL_TYPES:
            raise ValueError(
                f"Invalid control type: {control_type}. "
                f"Must be one of: {', '.join(VALID_CONTROL_TYPES)}"
            )
        
        if category not in VALID_CONTROL_CATEGORIES:
            raise ValueError(
                f"Invalid control category: {category}. "
                f"Must be one of: {', '.join(VALID_CONTROL_CATEGORIES)}"
            )
        
        previous_state = control.model_dump()
        
        # Update control categorization
        control.type = control_type
        control.category = category
        
        # Create audit entry
        self._create_audit_entry(
            actor=actor,
            actor_type=actor_type,
            action="categorize_control",
            entity_type="Control",
            entity_id=control.id,
            previous_state=previous_state,
            new_state=control.model_dump(),
            rationale=f"Control categorized as {control_type}/{category}"
        )
        
        return control
    
    def activate_control(
        self,
        control_id: str,
        report_id: str,
        actor: str = "system",
        actor_type: ActorType = "system"
    ) -> Control:
        """
        Activate a control and log activation evidence.
        
        Args:
            control_id: The ID of the control to activate.
            report_id: The ID of the report the control belongs to.
            actor: The actor performing the activation.
            actor_type: The type of actor.
            
        Returns:
            The activated control.
            
        Raises:
            ValueError: If the control matrix or control is not found.
            
        Requirements: 11.1
        """
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            raise ValueError(f"Control matrix not found for report: {report_id}")
        
        control = self._find_control_in_matrix(matrix, control_id)
        if not control:
            raise ValueError(f"Control not found: {control_id}")
        
        previous_state = control.model_dump()
        
        # Log activation evidence per Requirement 11.4
        evidence = ControlEvidence(
            id=str(uuid4()),
            control_id=control_id,
            execution_date=datetime.now(),
            outcome='pass',
            details='Control activated',
            executed_by=actor
        )
        
        control.status = 'active'
        control.evidence.append(evidence)
        
        # Update the control matrix
        self.repository.set_control_matrix(report_id, matrix)
        
        # Create audit entry
        self._create_audit_entry(
            actor=actor,
            actor_type=actor_type,
            action="activate_control",
            entity_type="Control",
            entity_id=control_id,
            previous_state=previous_state,
            new_state=control.model_dump(),
            rationale="Control activated"
        )
        
        return control
    
    def log_evidence(
        self,
        control_id: str,
        report_id: str,
        execution_date: datetime,
        outcome: ControlEvidenceOutcome,
        details: str,
        executed_by: str,
        actor: str = "system",
        actor_type: ActorType = "system"
    ) -> ControlEvidence:
        """
        Log evidence for a control execution.
        
        Captures: execution_date, outcome, details, executed_by per Requirement 11.4.
        
        Args:
            control_id: The ID of the control.
            report_id: The ID of the report the control belongs to.
            execution_date: When the control was executed.
            outcome: The outcome of the execution (pass/fail/exception).
            details: Details about the execution.
            executed_by: Who executed the control.
            actor: The actor logging the evidence.
            actor_type: The type of actor.
            
        Returns:
            The created evidence record.
            
        Raises:
            ValueError: If the control matrix or control is not found.
            
        Requirements: 11.1, 11.4
        """
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            raise ValueError(f"Control matrix not found for report: {report_id}")
        
        control = self._find_control_in_matrix(matrix, control_id)
        if not control:
            raise ValueError(f"Control not found: {control_id}")
        
        # Create evidence per Requirement 11.4
        evidence = ControlEvidence(
            id=str(uuid4()),
            control_id=control_id,
            execution_date=execution_date,
            outcome=outcome,
            details=details,
            executed_by=executed_by
        )
        
        control.evidence.append(evidence)
        
        # Update the control matrix
        self.repository.set_control_matrix(report_id, matrix)
        
        # Create audit entry
        self._create_audit_entry(
            actor=actor,
            actor_type=actor_type,
            action="log_evidence",
            entity_type="ControlEvidence",
            entity_id=evidence.id,
            previous_state=None,
            new_state=evidence.model_dump(),
            rationale=f"Evidence logged for control {control_id}: {outcome}"
        )
        
        return evidence
    
    def track_compensating_control(
        self,
        report_id: str,
        linked_issue_id: str,
        expiration_date: datetime,
        name: str,
        description: str,
        control_type: ControlType,
        category: ControlCategory,
        owner: str,
        frequency: ControlFrequency = 'monthly',
        linked_cdes: Optional[list[str]] = None,
        linked_processes: Optional[list[str]] = None,
        actor: str = "system",
        actor_type: ActorType = "system"
    ) -> Control:
        """
        Create and track a compensating control.
        
        Requires expiration_date and linked issue per Requirement 11.3.
        
        Args:
            report_id: The ID of the report.
            linked_issue_id: The ID of the linked issue (required).
            expiration_date: When the compensating control expires (required).
            name: Name of the control.
            description: Description of the control.
            control_type: Type of control.
            category: Category of control.
            owner: Owner of the control.
            frequency: How often the control is executed.
            linked_cdes: List of linked CDE IDs.
            linked_processes: List of linked process IDs.
            actor: The actor creating the control.
            actor_type: The type of actor.
            
        Returns:
            The created compensating control.
            
        Raises:
            ValueError: If required fields are missing or invalid.
            
        Requirements: 11.1, 11.3
        """
        # Validate required fields per Requirement 11.3
        if not linked_issue_id:
            raise ValueError("Compensating controls must have a linked_issue_id")
        
        if not expiration_date:
            raise ValueError("Compensating controls must have an expiration_date")
        
        # Validate control type per Requirement 11.2
        if control_type not in VALID_CONTROL_TYPES:
            raise ValueError(
                f"Invalid control type: {control_type}. "
                f"Must be one of: {', '.join(VALID_CONTROL_TYPES)}"
            )
        
        if category not in VALID_CONTROL_CATEGORIES:
            raise ValueError(
                f"Invalid control category: {category}. "
                f"Must be one of: {', '.join(VALID_CONTROL_CATEGORIES)}"
            )
        
        # Verify the issue exists
        issue = self.repository.get_issue(linked_issue_id)
        if not issue:
            raise ValueError(f"Issue not found: {linked_issue_id}")
        
        # Get or create control matrix
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            matrix = ControlMatrix(
                id=str(uuid4()),
                report_id=report_id,
                controls=[],
                version=1,
                last_reviewed=datetime.now(),
                reviewed_by=actor
            )
        
        # Create the compensating control
        control = Control(
            id=str(uuid4()),
            name=name,
            description=description,
            type=control_type,
            category=category,
            owner=owner,
            frequency=frequency,
            linked_cdes=linked_cdes or [],
            linked_processes=linked_processes or [],
            automation_status='manual',
            status='compensating',
            expiration_date=expiration_date,
            linked_issue_id=linked_issue_id,
            evidence=[]
        )
        
        # Log creation evidence per Requirement 11.4
        evidence = ControlEvidence(
            id=str(uuid4()),
            control_id=control.id,
            execution_date=datetime.now(),
            outcome='pass',
            details=f"Compensating control created for issue: {linked_issue_id}",
            executed_by=actor
        )
        control.evidence.append(evidence)
        
        # Add to matrix
        matrix.controls.append(control)
        matrix.version += 1
        
        # Save the matrix
        self.repository.set_control_matrix(report_id, matrix)
        
        # Create audit entry
        self._create_audit_entry(
            actor=actor,
            actor_type=actor_type,
            action="track_compensating_control",
            entity_type="Control",
            entity_id=control.id,
            previous_state=None,
            new_state=control.model_dump(),
            rationale=f"Compensating control created for issue {linked_issue_id}"
        )
        
        return control
    
    def schedule_effectiveness_review(
        self,
        control_id: str,
        report_id: str,
        review_date: datetime,
        reviewer: Optional[str] = None,
        actor: str = "system",
        actor_type: ActorType = "system"
    ) -> ControlEvidence:
        """
        Schedule an effectiveness review for a control.
        
        Args:
            control_id: The ID of the control.
            report_id: The ID of the report the control belongs to.
            review_date: When the review should occur.
            reviewer: Who should perform the review.
            actor: The actor scheduling the review.
            actor_type: The type of actor.
            
        Returns:
            The evidence record for the scheduled review.
            
        Raises:
            ValueError: If the control matrix or control is not found.
            
        Requirements: 11.1
        """
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            raise ValueError(f"Control matrix not found for report: {report_id}")
        
        control = self._find_control_in_matrix(matrix, control_id)
        if not control:
            raise ValueError(f"Control not found: {control_id}")
        
        # Log the scheduled review as evidence
        reviewer_info = f" by {reviewer}" if reviewer else ""
        evidence = ControlEvidence(
            id=str(uuid4()),
            control_id=control_id,
            execution_date=datetime.now(),
            outcome='pass',
            details=f"Effectiveness review scheduled for: {review_date.isoformat()}{reviewer_info}",
            executed_by=actor
        )
        
        control.evidence.append(evidence)
        
        # Update the control matrix
        self.repository.set_control_matrix(report_id, matrix)
        
        # Create audit entry
        self._create_audit_entry(
            actor=actor,
            actor_type=actor_type,
            action="schedule_effectiveness_review",
            entity_type="Control",
            entity_id=control_id,
            previous_state=None,
            new_state={"review_date": review_date.isoformat(), "reviewer": reviewer},
            rationale=f"Effectiveness review scheduled for {review_date.isoformat()}"
        )
        
        return evidence
    
    def get_controls_for_review(
        self,
        report_id: str,
        as_of_date: Optional[datetime] = None
    ) -> list[Control]:
        """
        Get controls that need effectiveness review based on their frequency.
        
        Args:
            report_id: The ID of the report.
            as_of_date: The date to check against (defaults to now).
            
        Returns:
            List of controls needing review.
        """
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            return []
        
        check_date = as_of_date or datetime.now()
        controls_for_review = []
        
        for control in matrix.controls:
            if control.status != 'active':
                continue
            
            if self._needs_review(control, check_date):
                controls_for_review.append(control)
        
        return controls_for_review
    
    def get_expiring_compensating_controls(
        self,
        report_id: str,
        within_days: int = 30
    ) -> list[Control]:
        """
        Get compensating controls that are expiring within the specified days.
        
        Args:
            report_id: The ID of the report.
            within_days: Number of days to look ahead.
            
        Returns:
            List of expiring compensating controls.
        """
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            return []
        
        cutoff_date = datetime.now() + timedelta(days=within_days)
        
        return [
            control for control in matrix.controls
            if control.status == 'compensating'
            and control.expiration_date
            and control.expiration_date <= cutoff_date
        ]
    
    def validate_control(self, control: Control) -> list[str]:
        """
        Validate a control's configuration.
        
        Args:
            control: The control to validate.
            
        Returns:
            List of validation errors (empty if valid).
        """
        errors = []
        
        if control.type not in VALID_CONTROL_TYPES:
            errors.append(
                f"Invalid control type: {control.type}. "
                f"Must be one of: {', '.join(VALID_CONTROL_TYPES)}"
            )
        
        if control.category not in VALID_CONTROL_CATEGORIES:
            errors.append(
                f"Invalid control category: {control.category}. "
                f"Must be one of: {', '.join(VALID_CONTROL_CATEGORIES)}"
            )
        
        if control.status not in VALID_CONTROL_STATUSES:
            errors.append(
                f"Invalid control status: {control.status}. "
                f"Must be one of: {', '.join(VALID_CONTROL_STATUSES)}"
            )
        
        # Validate compensating control requirements per Requirement 11.3
        if control.status == 'compensating':
            if not control.linked_issue_id:
                errors.append("Compensating controls must have a linked_issue_id")
            if not control.expiration_date:
                errors.append("Compensating controls must have an expiration_date")
        
        return errors
    
    def _find_control_in_matrix(
        self, 
        matrix: ControlMatrix, 
        control_id: str
    ) -> Optional[Control]:
        """Find a control in a control matrix by ID."""
        for control in matrix.controls:
            if control.id == control_id:
                return control
        return None
    
    def _needs_review(self, control: Control, check_date: datetime) -> bool:
        """Check if a control needs review based on its frequency."""
        # Find the last review evidence
        review_evidence = [
            e for e in control.evidence
            if 'review' in e.details.lower() or 'Review' in e.details
        ]
        
        if not review_evidence:
            return True  # Never reviewed
        
        last_review = max(review_evidence, key=lambda e: e.execution_date)
        days_since_review = (check_date - last_review.execution_date).days
        
        frequency_days = {
            'daily': 1,
            'weekly': 7,
            'monthly': 30,
            'quarterly': 90,
            'annual': 365,
            'continuous': float('inf')  # Continuous controls don't need scheduled reviews
        }
        
        threshold = frequency_days.get(control.frequency, 30)
        return days_since_review >= threshold
    
    def _create_audit_entry(
        self,
        actor: str,
        actor_type: ActorType,
        action: str,
        entity_type: str,
        entity_id: str,
        previous_state: Optional[dict],
        new_state: Optional[dict],
        rationale: str
    ) -> None:
        """Create an audit entry for a controls management action."""
        entry = AuditEntry(
            id=str(uuid4()),
            timestamp=datetime.now(),
            actor=actor,
            actor_type=actor_type,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            previous_state=previous_state,
            new_state=new_state,
            rationale=rationale
        )
        self.repository.create_audit_entry(entry)


# Convenience functions for direct use without service instantiation

def categorize_control(
    repository: GovernanceRepository,
    control: Control,
    control_type: ControlType,
    category: ControlCategory,
    actor: str = "system",
    actor_type: ActorType = "system"
) -> Control:
    """
    Categorize a control by setting its type and category.
    
    See ControlsManagementService.categorize_control for details.
    """
    service = ControlsManagementService(repository)
    return service.categorize_control(control, control_type, category, actor, actor_type)


def activate_control(
    repository: GovernanceRepository,
    control_id: str,
    report_id: str,
    actor: str = "system",
    actor_type: ActorType = "system"
) -> Control:
    """
    Activate a control and log activation evidence.
    
    See ControlsManagementService.activate_control for details.
    """
    service = ControlsManagementService(repository)
    return service.activate_control(control_id, report_id, actor, actor_type)


def log_evidence(
    repository: GovernanceRepository,
    control_id: str,
    report_id: str,
    execution_date: datetime,
    outcome: ControlEvidenceOutcome,
    details: str,
    executed_by: str,
    actor: str = "system",
    actor_type: ActorType = "system"
) -> ControlEvidence:
    """
    Log evidence for a control execution.
    
    See ControlsManagementService.log_evidence for details.
    """
    service = ControlsManagementService(repository)
    return service.log_evidence(
        control_id, report_id, execution_date, outcome, details, executed_by, actor, actor_type
    )


def track_compensating_control(
    repository: GovernanceRepository,
    report_id: str,
    linked_issue_id: str,
    expiration_date: datetime,
    name: str,
    description: str,
    control_type: ControlType,
    category: ControlCategory,
    owner: str,
    frequency: ControlFrequency = 'monthly',
    linked_cdes: Optional[list[str]] = None,
    linked_processes: Optional[list[str]] = None,
    actor: str = "system",
    actor_type: ActorType = "system"
) -> Control:
    """
    Create and track a compensating control.
    
    See ControlsManagementService.track_compensating_control for details.
    """
    service = ControlsManagementService(repository)
    return service.track_compensating_control(
        report_id, linked_issue_id, expiration_date, name, description,
        control_type, category, owner, frequency, linked_cdes, linked_processes,
        actor, actor_type
    )


def schedule_effectiveness_review(
    repository: GovernanceRepository,
    control_id: str,
    report_id: str,
    review_date: datetime,
    reviewer: Optional[str] = None,
    actor: str = "system",
    actor_type: ActorType = "system"
) -> ControlEvidence:
    """
    Schedule an effectiveness review for a control.
    
    See ControlsManagementService.schedule_effectiveness_review for details.
    """
    service = ControlsManagementService(repository)
    return service.schedule_effectiveness_review(
        control_id, report_id, review_date, reviewer, actor, actor_type
    )
