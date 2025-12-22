"""
Governance Orchestrator tools for the Agentic Data Governance System.

This module defines Strands tools for coordinating all agents through the
regulatory reporting lifecycle with human checkpoints.

Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
Requirements: 16.2, 16.3 (Identity integration for human task completion)
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.workflow import (
    CycleInstance,
    CycleStatus,
    Phase,
    HumanTask,
    TaskType,
    TaskStatus,
    Decision,
    DecisionOutcome,
    Checkpoint,
    AgentType,
    AgentResult,
    AgentStatusInfo,
)
from models.audit import AuditEntry
from models.issues import IssueFilters
from repository.base import GovernanceRepository
from services.identity_config import (
    extract_user_for_audit,
)


# Phase dependencies - defines which phases must complete before others can start
PHASE_DEPENDENCIES: dict[Phase, list[Phase]] = {
    'data_gathering': [],
    'validation': ['data_gathering'],
    'review': ['validation'],
    'approval': ['review'],
    'submission': ['approval'],
}

# Agent to phase mapping
AGENT_PHASE_MAPPING: dict[AgentType, Phase] = {
    'regulatory_intelligence': 'data_gathering',
    'data_requirements': 'data_gathering',
    'cde_identification': 'data_gathering',
    'data_quality_rule': 'validation',
    'lineage_mapping': 'data_gathering',
    'issue_management': 'validation',
    'documentation': 'review',
}


def create_orchestrator_tools(repository: GovernanceRepository):
    """
    Factory function to create orchestrator tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the Governance Orchestrator.
    """
    
    @tool
    def start_report_cycle(
        report_id: str,
        period_end: str,
        initiator: str
    ) -> dict:
        """
        Start a new report cycle for a regulatory report.
        
        Creates a CycleInstance with status 'active' and generates a submission
        checklist with checkpoints for each phase.
        
        Args:
            report_id: The ID of the regulatory report.
            period_end: Period end date in ISO format (YYYY-MM-DD).
            initiator: The person or system starting the cycle.
            
        Returns:
            The created cycle instance with generated checklist.
        """
        # Verify report exists
        report = repository.get_report(report_id)
        if not report:
            raise ValueError(f"Report with ID '{report_id}' not found")
        
        # Check for existing active cycles
        active_cycles = repository.get_active_cycles(report_id)
        if active_cycles:
            raise ValueError(
                f"Report '{report_id}' already has an active cycle: {active_cycles[0].id}"
            )
        
        # Parse period end date
        try:
            period_end_date = datetime.fromisoformat(period_end)
        except ValueError:
            raise ValueError(f"Invalid period_end format: '{period_end}'. Use ISO format (YYYY-MM-DD)")
        
        # Generate checkpoints for each phase
        checkpoints = [
            Checkpoint(
                name="Data Gathering Complete",
                phase='data_gathering',
                required_approvals=['data_steward'],
            ),
            Checkpoint(
                name="Validation Complete",
                phase='validation',
                required_approvals=['data_steward', 'data_quality_lead'],
            ),
            Checkpoint(
                name="Review Complete",
                phase='review',
                required_approvals=['compliance_officer'],
            ),
            Checkpoint(
                name="Approval Complete",
                phase='approval',
                required_approvals=['compliance_officer', 'senior_manager'],
            ),
            Checkpoint(
                name="Submission Complete",
                phase='submission',
                required_approvals=['regulatory_reporting_manager'],
            ),
        ]
        
        # Create cycle instance
        cycle = CycleInstance(
            report_id=report_id,
            period_end=period_end_date,
            status='active',
            current_phase='data_gathering',
            checkpoints=checkpoints,
            started_at=datetime.now(),
        )
        
        # Store the cycle
        created_cycle = repository.create_cycle_instance(cycle)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=initiator,
            actor_type="human",
            action="start_report_cycle",
            entity_type="CycleInstance",
            entity_id=created_cycle.id,
            new_state=created_cycle.model_dump(),
            rationale=f"Started cycle for report {report_id}, period ending {period_end}"
        ))
        
        return created_cycle.model_dump()
    
    @tool
    def pause_cycle(
        cycle_id: str,
        reason: str,
        pauser: str
    ) -> dict:
        """
        Pause an active report cycle.
        
        Pauses the workflow, typically due to blocking issues or required
        human intervention.
        
        Args:
            cycle_id: The ID of the cycle to pause.
            reason: The reason for pausing the cycle.
            pauser: The person or system pausing the cycle.
            
        Returns:
            The updated cycle instance.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle with ID '{cycle_id}' not found")
        
        if cycle.status != 'active':
            raise ValueError(f"Cannot pause cycle with status '{cycle.status}'. Only active cycles can be paused.")
        
        previous_state = cycle.model_dump()
        
        cycle.status = 'paused'
        cycle.paused_at = datetime.now()
        cycle.pause_reason = reason
        
        repository.update_cycle_instance(cycle)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=pauser,
            actor_type="human",
            action="pause_cycle",
            entity_type="CycleInstance",
            entity_id=cycle_id,
            previous_state=previous_state,
            new_state=cycle.model_dump(),
            rationale=reason
        ))
        
        return cycle.model_dump()
    
    @tool
    def resume_cycle(
        cycle_id: str,
        resumer: str,
        rationale: Optional[str] = None
    ) -> dict:
        """
        Resume a paused report cycle.
        
        Args:
            cycle_id: The ID of the cycle to resume.
            resumer: The person or system resuming the cycle.
            rationale: Optional reason for resuming.
            
        Returns:
            The updated cycle instance.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle with ID '{cycle_id}' not found")
        
        if cycle.status != 'paused':
            raise ValueError(f"Cannot resume cycle with status '{cycle.status}'. Only paused cycles can be resumed.")
        
        # Check for blocking critical issues
        critical_issues = _get_blocking_issues(repository, cycle.report_id)
        if critical_issues:
            raise ValueError(
                f"Cannot resume cycle: {len(critical_issues)} critical issue(s) must be resolved first. "
                f"Issue IDs: {[i.id for i in critical_issues]}"
            )
        
        previous_state = cycle.model_dump()
        
        cycle.status = 'active'
        cycle.paused_at = None
        cycle.pause_reason = None
        
        repository.update_cycle_instance(cycle)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=resumer,
            actor_type="human",
            action="resume_cycle",
            entity_type="CycleInstance",
            entity_id=cycle_id,
            previous_state=previous_state,
            new_state=cycle.model_dump(),
            rationale=rationale or "Cycle resumed"
        ))
        
        return cycle.model_dump()
    
    @tool
    def trigger_agent(
        cycle_id: str,
        agent_type: str,
        parameters: Optional[dict] = None,
        triggerer: str = "GovernanceOrchestrator"
    ) -> dict:
        """
        Trigger a specific agent to execute within a cycle.
        
        Validates that workflow dependencies are met before allowing
        the agent to execute.
        
        Args:
            cycle_id: The ID of the cycle context.
            agent_type: The type of agent to trigger - one of:
                       'regulatory_intelligence', 'data_requirements',
                       'cde_identification', 'data_quality_rule',
                       'lineage_mapping', 'issue_management', 'documentation'.
            parameters: Optional parameters to pass to the agent.
            triggerer: The person or system triggering the agent.
            
        Returns:
            Agent trigger result with status.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle with ID '{cycle_id}' not found")
        
        if cycle.status != 'active':
            raise ValueError(f"Cannot trigger agent on cycle with status '{cycle.status}'")
        
        # Validate agent type
        valid_agents: list[AgentType] = [
            'regulatory_intelligence', 'data_requirements', 'cde_identification',
            'data_quality_rule', 'lineage_mapping', 'issue_management', 'documentation'
        ]
        if agent_type not in valid_agents:
            raise ValueError(f"Invalid agent_type '{agent_type}'. Must be one of: {valid_agents}")
        
        agent_type_typed: AgentType = agent_type  # type: ignore
        
        # Check phase dependencies
        agent_phase = AGENT_PHASE_MAPPING.get(agent_type_typed)
        if agent_phase:
            required_phases = PHASE_DEPENDENCIES.get(agent_phase, [])
            for req_phase in required_phases:
                checkpoint = _get_checkpoint_for_phase(cycle, req_phase)
                if checkpoint and checkpoint.status != 'completed':
                    raise ValueError(
                        f"Cannot trigger {agent_type} agent: prerequisite phase '{req_phase}' "
                        f"has not completed. Complete checkpoint '{checkpoint.name}' first."
                    )
        
        # Check for blocking critical issues
        critical_issues = _get_blocking_issues(repository, cycle.report_id)
        if critical_issues:
            raise ValueError(
                f"Cannot trigger agent: {len(critical_issues)} critical issue(s) blocking workflow. "
                f"Issue IDs: {[i.id for i in critical_issues]}"
            )
        
        # Create agent result (simulated - actual execution would invoke the agent)
        result = AgentResult(
            agent_type=agent_type_typed,
            success=True,
            output={"status": "triggered", "parameters": parameters},
            errors=[],
            executed_at=datetime.now(),
            duration=0.0
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=triggerer,
            actor_type="agent",
            action="trigger_agent",
            entity_type="AgentResult",
            entity_id=f"{cycle_id}_{agent_type}",
            new_state={
                "cycle_id": cycle_id,
                "agent_type": agent_type,
                "parameters": parameters,
                "result": result.model_dump()
            }
        ))
        
        return {
            "cycle_id": cycle_id,
            "agent_type": agent_type,
            "triggered": True,
            "result": result.model_dump()
        }
    
    @tool
    def create_human_task(
        cycle_id: str,
        task_type: str,
        title: str,
        description: str,
        assigned_to: str,
        assigned_role: str,
        due_date: str,
        creator: str = "GovernanceOrchestrator"
    ) -> dict:
        """
        Create a human task at a workflow checkpoint.
        
        Pauses the workflow until the task is completed.
        
        Args:
            cycle_id: The ID of the cycle this task belongs to.
            task_type: Type of task - 'catalog_review', 'requirements_validation',
                      'cde_approval', 'rule_review', 'lineage_validation',
                      'issue_resolution_confirmation', 'submission_approval', 'attestation'.
            title: The task title.
            description: Detailed description of what needs to be done.
            assigned_to: The person assigned to complete the task.
            assigned_role: The role required to complete the task.
            due_date: Due date in ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS).
            creator: The person or system creating the task.
            
        Returns:
            The created human task.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle with ID '{cycle_id}' not found")
        
        # Validate task type
        valid_types: list[TaskType] = [
            'catalog_review', 'requirements_validation', 'cde_approval',
            'rule_review', 'lineage_validation', 'issue_resolution_confirmation',
            'submission_approval', 'attestation'
        ]
        if task_type not in valid_types:
            raise ValueError(f"Invalid task_type '{task_type}'. Must be one of: {valid_types}")
        
        # Parse due date
        try:
            parsed_due_date = datetime.fromisoformat(due_date)
        except ValueError:
            raise ValueError(f"Invalid due_date format: '{due_date}'. Use ISO format.")
        
        # Create human task
        task = HumanTask(
            cycle_id=cycle_id,
            type=task_type,  # type: ignore
            title=title,
            description=description,
            assigned_to=assigned_to,
            assigned_role=assigned_role,
            due_date=parsed_due_date,
            status='pending',
            created_at=datetime.now(),
        )
        
        # Store the task
        created_task = repository.create_human_task(task)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=creator,
            actor_type="agent",
            action="create_human_task",
            entity_type="HumanTask",
            entity_id=created_task.id,
            new_state=created_task.model_dump(),
            rationale=f"Created {task_type} task for cycle {cycle_id}"
        ))
        
        return created_task.model_dump()
    
    @tool
    def complete_human_task(
        task_id: str,
        decision: str,
        rationale: str,
        completed_by: str,
        access_token: Optional[str] = None
    ) -> dict:
        """
        Complete a human task with decision and rationale.
        
        Requires a decision outcome and rationale (minimum 20 characters).
        Supports authentication via access_token for audit trail compliance.
        
        Args:
            task_id: The ID of the task to complete.
            decision: Decision outcome - 'approved', 'rejected', or 'approved_with_changes'.
            rationale: Reason for the decision (minimum 20 characters).
            completed_by: The person completing the task.
            access_token: JWT access token for authentication (optional).
            
        Returns:
            The updated task with decision logged.
            
        Requirements: 16.2, 16.3
        """
        task = repository.get_human_task(task_id)
        if not task:
            raise ValueError(f"Task with ID '{task_id}' not found")
        
        if task.status == 'completed':
            raise ValueError(f"Task '{task_id}' is already completed")
        
        # Validate decision
        valid_decisions: list[DecisionOutcome] = ['approved', 'rejected', 'approved_with_changes']
        if decision not in valid_decisions:
            raise ValueError(f"Invalid decision '{decision}'. Must be one of: {valid_decisions}")
        
        # Validate rationale length
        if len(rationale) < 20:
            raise ValueError("Rationale must be at least 20 characters")
        
        # Extract user identity from token if provided
        verified_completer = completed_by
        user_audit_info = None
        
        if access_token:
            try:
                user_audit_info = extract_user_for_audit(access_token)
                verified_completer = user_audit_info.get("user_id", completed_by)
            except Exception:
                pass
        
        previous_state = task.model_dump()
        
        # Update task
        task.decision = Decision(outcome=decision)  # type: ignore
        task.decision_rationale = rationale
        task.status = 'completed'
        task.completed_at = datetime.now()
        task.completed_by = verified_completer
        
        repository.update_human_task(task)
        
        # Update cycle checkpoint if applicable
        cycle = repository.get_cycle_instance(task.cycle_id)
        if cycle:
            _update_checkpoint_approval(cycle, task, verified_completer, repository)
        
        # Create audit entry with enhanced user information
        audit_new_state = task.model_dump()
        if user_audit_info:
            audit_new_state["_audit_user_info"] = user_audit_info
        
        repository.create_audit_entry(AuditEntry(
            actor=verified_completer,
            actor_type="human",
            action="complete_human_task",
            entity_type="HumanTask",
            entity_id=task_id,
            previous_state=previous_state,
            new_state=audit_new_state,
            rationale=rationale
        ))
        
        return task.model_dump()
    
    @tool
    def escalate_task(
        task_id: str,
        reason: str,
        escalator: str
    ) -> dict:
        """
        Escalate a human task that is overdue or blocked.
        
        Increments the escalation level and notifies appropriate personnel.
        
        Args:
            task_id: The ID of the task to escalate.
            reason: The reason for escalation.
            escalator: The person or system escalating the task.
            
        Returns:
            The updated task with incremented escalation level.
        """
        task = repository.get_human_task(task_id)
        if not task:
            raise ValueError(f"Task with ID '{task_id}' not found")
        
        if task.status == 'completed':
            raise ValueError(f"Cannot escalate completed task '{task_id}'")
        
        previous_state = task.model_dump()
        
        # Increment escalation level
        task.escalation_level += 1
        task.status = 'escalated'
        
        repository.update_human_task(task)
        
        # Create audit entry for escalation
        repository.create_audit_entry(AuditEntry(
            actor=escalator,
            actor_type="human",
            action="escalate_task",
            entity_type="HumanTask",
            entity_id=task_id,
            previous_state=previous_state,
            new_state=task.model_dump(),
            rationale=reason
        ))
        
        # Log notification to senior management
        repository.create_audit_entry(AuditEntry(
            actor="GovernanceOrchestrator",
            actor_type="agent",
            action="notify_escalation",
            entity_type="HumanTask",
            entity_id=task_id,
            new_state={
                "notification_type": "task_escalation",
                "escalation_level": task.escalation_level,
                "reason": reason,
                "task_type": task.type,
                "assigned_role": task.assigned_role
            }
        ))
        
        return task.model_dump()
    
    @tool
    def get_cycle_status(cycle_id: str) -> dict:
        """
        Get the current status of a report cycle.
        
        Returns detailed status including phase, checkpoints, pending tasks,
        and any blocking issues.
        
        Args:
            cycle_id: The ID of the cycle to check.
            
        Returns:
            Detailed cycle status information.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle with ID '{cycle_id}' not found")
        
        # Get pending tasks for this cycle
        pending_tasks = repository.get_pending_tasks(cycle_id=cycle_id)
        
        # Get blocking issues
        blocking_issues = _get_blocking_issues(repository, cycle.report_id)
        
        # Calculate progress
        completed_checkpoints = sum(1 for cp in cycle.checkpoints if cp.status == 'completed')
        total_checkpoints = len(cycle.checkpoints)
        progress_percentage = (completed_checkpoints / total_checkpoints * 100) if total_checkpoints > 0 else 0
        
        return {
            "cycle": cycle.model_dump(),
            "progress_percentage": round(progress_percentage, 1),
            "completed_checkpoints": completed_checkpoints,
            "total_checkpoints": total_checkpoints,
            "pending_tasks": [t.model_dump() for t in pending_tasks],
            "blocking_issues": [i.model_dump() for i in blocking_issues],
            "can_proceed": len(blocking_issues) == 0 and cycle.status == 'active'
        }
    
    @tool
    def advance_phase(
        cycle_id: str,
        advancer: str,
        rationale: Optional[str] = None
    ) -> dict:
        """
        Advance the cycle to the next phase.
        
        Validates that the current phase checkpoint is completed before
        advancing.
        
        Args:
            cycle_id: The ID of the cycle to advance.
            advancer: The person or system advancing the phase.
            rationale: Optional reason for advancing.
            
        Returns:
            The updated cycle with new phase.
        """
        cycle = repository.get_cycle_instance(cycle_id)
        if not cycle:
            raise ValueError(f"Cycle with ID '{cycle_id}' not found")
        
        if cycle.status != 'active':
            raise ValueError(f"Cannot advance cycle with status '{cycle.status}'")
        
        # Check current phase checkpoint is completed
        current_checkpoint = _get_checkpoint_for_phase(cycle, cycle.current_phase)
        if current_checkpoint and current_checkpoint.status != 'completed':
            raise ValueError(
                f"Cannot advance: current phase '{cycle.current_phase}' checkpoint "
                f"'{current_checkpoint.name}' is not completed"
            )
        
        # Determine next phase
        phase_order: list[Phase] = ['data_gathering', 'validation', 'review', 'approval', 'submission']
        current_index = phase_order.index(cycle.current_phase)
        
        if current_index >= len(phase_order) - 1:
            # Complete the cycle
            previous_state = cycle.model_dump()
            cycle.status = 'completed'
            cycle.completed_at = datetime.now()
            repository.update_cycle_instance(cycle)
            
            repository.create_audit_entry(AuditEntry(
                actor=advancer,
                actor_type="human",
                action="complete_cycle",
                entity_type="CycleInstance",
                entity_id=cycle_id,
                previous_state=previous_state,
                new_state=cycle.model_dump(),
                rationale=rationale or "All phases completed"
            ))
            
            return cycle.model_dump()
        
        # Advance to next phase
        previous_state = cycle.model_dump()
        next_phase = phase_order[current_index + 1]
        cycle.current_phase = next_phase
        
        repository.update_cycle_instance(cycle)
        
        repository.create_audit_entry(AuditEntry(
            actor=advancer,
            actor_type="human",
            action="advance_phase",
            entity_type="CycleInstance",
            entity_id=cycle_id,
            previous_state=previous_state,
            new_state=cycle.model_dump(),
            rationale=rationale or f"Advanced from {phase_order[current_index]} to {next_phase}"
        ))
        
        return cycle.model_dump()
    
    return [
        start_report_cycle,
        pause_cycle,
        resume_cycle,
        trigger_agent,
        create_human_task,
        complete_human_task,
        escalate_task,
        get_cycle_status,
        advance_phase,
    ]


def _get_checkpoint_for_phase(cycle: CycleInstance, phase: Phase) -> Optional[Checkpoint]:
    """Get the checkpoint for a specific phase."""
    for checkpoint in cycle.checkpoints:
        if checkpoint.phase == phase:
            return checkpoint
    return None


def _get_blocking_issues(repository: GovernanceRepository, report_id: str):
    """Get critical issues that are blocking the workflow."""
    filters = IssueFilters(
        severity=['critical'],
        status=['open', 'in_progress']
    )
    all_issues = repository.get_issues(filters)
    # Filter to issues impacting this report
    return [i for i in all_issues if report_id in (i.impacted_reports or [])]


def _update_checkpoint_approval(
    cycle: CycleInstance,
    task: HumanTask,
    approver: str,
    repository: GovernanceRepository
) -> None:
    """Update checkpoint approval status based on completed task."""
    # Map task types to phases
    task_phase_mapping: dict[TaskType, Phase] = {
        'catalog_review': 'data_gathering',
        'requirements_validation': 'data_gathering',
        'cde_approval': 'data_gathering',
        'rule_review': 'validation',
        'lineage_validation': 'data_gathering',
        'issue_resolution_confirmation': 'validation',
        'submission_approval': 'approval',
        'attestation': 'submission',
    }
    
    phase = task_phase_mapping.get(task.type)
    if not phase:
        return
    
    checkpoint = _get_checkpoint_for_phase(cycle, phase)
    if not checkpoint:
        return
    
    # Add approval if not already present
    if approver not in checkpoint.completed_approvals:
        checkpoint.completed_approvals.append(approver)
    
    # Check if all required approvals are met
    if set(checkpoint.required_approvals).issubset(set(checkpoint.completed_approvals)):
        checkpoint.status = 'completed'
    
    repository.update_cycle_instance(cycle)
