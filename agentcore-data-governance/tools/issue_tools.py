"""
Issue Management Agent tools for the Agentic Data Governance System.

This module defines Strands tools for creating, tracking, and resolving
data issues with AI-powered root cause analysis.

Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
Requirements: 16.2, 16.3 (Identity integration for issue resolution)
"""

from datetime import datetime
from typing import Optional
from strands import tool

from models.issues import (
    Issue,
    IssueFilters,
    IssueMetrics,
    Resolution,
    RootCauseSuggestion,
    RecurringTheme,
    Severity,
    IssueStatus,
)
from models.audit import AuditEntry
from repository.base import GovernanceRepository
from services.identity_config import (
    extract_user_for_audit,
)


def create_issue_tools(repository: GovernanceRepository):
    """
    Factory function to create issue management tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the Issue Management Agent.
    """
    
    @tool
    def create_issue(
        title: str,
        description: str,
        source: str,
        severity: str,
        assignee: str,
        impacted_reports: Optional[list[str]] = None,
        impacted_cdes: Optional[list[str]] = None,
        due_date: Optional[str] = None
    ) -> dict:
        """
        Create a new data issue with auto-populated fields.
        
        Auto-populates: id, status (open), created_at, escalation_level (0).
        
        Args:
            title: The issue title.
            description: Detailed description of the issue.
            source: The source that identified the issue (e.g., DQ rule, manual).
            severity: Issue severity - 'critical', 'high', 'medium', or 'low'.
            assignee: The person or team assigned to resolve the issue.
            impacted_reports: Optional list of impacted report IDs.
            impacted_cdes: Optional list of impacted CDE IDs.
            due_date: Optional due date in ISO format.
            
        Returns:
            The created issue with all fields populated.
        """
        # Validate severity
        valid_severities = ['critical', 'high', 'medium', 'low']
        if severity not in valid_severities:
            raise ValueError(f"Invalid severity '{severity}'. Must be one of: {valid_severities}")
        
        # Parse due date if provided
        parsed_due_date = None
        if due_date:
            parsed_due_date = datetime.fromisoformat(due_date)
        
        # Create issue with auto-populated fields
        issue = Issue(
            title=title,
            description=description,
            source=source,
            severity=severity,  # type: ignore
            assignee=assignee,
            impacted_reports=impacted_reports or [],
            impacted_cdes=impacted_cdes or [],
            status='open',
            created_at=datetime.now(),
            due_date=parsed_due_date,
            escalation_level=0
        )
        
        # Store the issue
        created_issue = repository.create_issue(issue)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="IssueManagementAgent",
            actor_type="agent",
            action="create_issue",
            entity_type="Issue",
            entity_id=created_issue.id,
            new_state=created_issue.model_dump()
        ))
        
        return created_issue.model_dump()
    
    @tool
    def suggest_root_cause(issue_id: str) -> dict:
        """
        Analyze patterns from historical issues and suggest root causes.
        
        Returns ranked suggestions based on similarity to past issues
        and their resolutions.
        
        Args:
            issue_id: The ID of the issue to analyze.
            
        Returns:
            Root cause suggestion with confidence score and similar issues.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        # Get all resolved issues for pattern analysis
        resolved_filters = IssueFilters(status=['resolved', 'closed'])
        historical_issues = repository.get_issues(resolved_filters)
        
        # Find similar issues based on:
        # 1. Same impacted CDEs
        # 2. Same impacted reports
        # 3. Similar severity
        # 4. Similar source
        similar_issues: list[tuple[Issue, float]] = []
        
        for hist_issue in historical_issues:
            if hist_issue.id == issue_id:
                continue
                
            similarity_score = 0.0
            
            # Check CDE overlap
            if issue.impacted_cdes and hist_issue.impacted_cdes:
                cde_overlap = len(set(issue.impacted_cdes) & set(hist_issue.impacted_cdes))
                if cde_overlap > 0:
                    similarity_score += 0.3 * (cde_overlap / max(len(issue.impacted_cdes), 1))
            
            # Check report overlap
            if issue.impacted_reports and hist_issue.impacted_reports:
                report_overlap = len(set(issue.impacted_reports) & set(hist_issue.impacted_reports))
                if report_overlap > 0:
                    similarity_score += 0.3 * (report_overlap / max(len(issue.impacted_reports), 1))
            
            # Check same source
            if issue.source == hist_issue.source:
                similarity_score += 0.2
            
            # Check same severity
            if issue.severity == hist_issue.severity:
                similarity_score += 0.1
            
            # Check title/description similarity (simple keyword matching)
            issue_words = set(issue.title.lower().split() + issue.description.lower().split())
            hist_words = set(hist_issue.title.lower().split() + hist_issue.description.lower().split())
            word_overlap = len(issue_words & hist_words)
            if word_overlap > 0:
                similarity_score += 0.1 * min(1.0, word_overlap / 10)
            
            if similarity_score > 0.2:
                similar_issues.append((hist_issue, similarity_score))
        
        # Sort by similarity score
        similar_issues.sort(key=lambda x: x[1], reverse=True)
        top_similar = similar_issues[:5]
        
        # Generate root cause suggestion based on similar issues
        if top_similar:
            # Analyze root causes from similar issues
            root_causes = [i[0].root_cause for i in top_similar if i[0].root_cause]
            
            if root_causes:
                # Use most common root cause pattern
                suggested_cause = root_causes[0]
                confidence = top_similar[0][1]
            else:
                # Generate generic suggestion based on source
                suggested_cause = _generate_generic_root_cause(issue)
                confidence = 0.3
        else:
            suggested_cause = _generate_generic_root_cause(issue)
            confidence = 0.2
        
        suggestion = RootCauseSuggestion(
            issue_id=issue_id,
            suggested_cause=suggested_cause,
            confidence=min(0.95, confidence),
            similar_issue_ids=[i[0].id for i in top_similar]
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="IssueManagementAgent",
            actor_type="agent",
            action="suggest_root_cause",
            entity_type="Issue",
            entity_id=issue_id,
            new_state=suggestion.model_dump()
        ))
        
        return suggestion.model_dump()
    
    @tool
    def find_similar_issues(issue_id: str, limit: int = 5) -> list[dict]:
        """
        Find issues similar to the specified issue.
        
        Analyzes impacted CDEs, reports, source, and content to find
        related issues that may have common causes or solutions.
        
        Args:
            issue_id: The ID of the issue to find similar issues for.
            limit: Maximum number of similar issues to return (default 5).
            
        Returns:
            List of similar issues with similarity scores.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        # Get all issues
        all_issues = repository.get_issues()
        
        similar_issues: list[dict] = []
        
        for other_issue in all_issues:
            if other_issue.id == issue_id:
                continue
            
            similarity_score = 0.0
            reasons = []
            
            # Check CDE overlap
            if issue.impacted_cdes and other_issue.impacted_cdes:
                cde_overlap = set(issue.impacted_cdes) & set(other_issue.impacted_cdes)
                if cde_overlap:
                    similarity_score += 0.35
                    reasons.append(f"Shares {len(cde_overlap)} impacted CDE(s)")
            
            # Check report overlap
            if issue.impacted_reports and other_issue.impacted_reports:
                report_overlap = set(issue.impacted_reports) & set(other_issue.impacted_reports)
                if report_overlap:
                    similarity_score += 0.25
                    reasons.append(f"Shares {len(report_overlap)} impacted report(s)")
            
            # Check same source
            if issue.source == other_issue.source:
                similarity_score += 0.2
                reasons.append(f"Same source: {issue.source}")
            
            # Check same severity
            if issue.severity == other_issue.severity:
                similarity_score += 0.1
                reasons.append(f"Same severity: {issue.severity}")
            
            # Check title similarity
            issue_title_words = set(issue.title.lower().split())
            other_title_words = set(other_issue.title.lower().split())
            title_overlap = issue_title_words & other_title_words
            if len(title_overlap) >= 2:
                similarity_score += 0.1
                reasons.append("Similar title keywords")
            
            if similarity_score > 0.15:
                similar_issues.append({
                    "issue": other_issue.model_dump(),
                    "similarity_score": round(similarity_score, 2),
                    "reasons": reasons
                })
        
        # Sort by similarity and limit
        similar_issues.sort(key=lambda x: x["similarity_score"], reverse=True)
        result = similar_issues[:limit]
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="IssueManagementAgent",
            actor_type="agent",
            action="find_similar_issues",
            entity_type="Issue",
            entity_id=issue_id,
            new_state={"similar_count": len(result), "limit": limit}
        ))
        
        return result
    
    @tool
    def assign_issue(
        issue_id: str,
        assignee: str,
        assigner: str,
        rationale: Optional[str] = None
    ) -> dict:
        """
        Assign or reassign an issue to a person or team.
        
        Args:
            issue_id: The ID of the issue to assign.
            assignee: The person or team to assign the issue to.
            assigner: The person making the assignment.
            rationale: Optional reason for the assignment.
            
        Returns:
            The updated issue.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        previous_state = issue.model_dump()
        previous_assignee = issue.assignee
        
        issue.assignee = assignee
        
        repository.update_issue(issue)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=assigner,
            actor_type="human",
            action="assign_issue",
            entity_type="Issue",
            entity_id=issue_id,
            previous_state={"assignee": previous_assignee},
            new_state={"assignee": assignee},
            rationale=rationale or f"Assigned from {previous_assignee} to {assignee}"
        ))
        
        return issue.model_dump()
    
    @tool
    def escalate_issue(
        issue_id: str,
        escalator: str,
        reason: str
    ) -> dict:
        """
        Escalate an issue to senior management.
        
        Increments the escalation level and notifies senior management
        for critical issues.
        
        Args:
            issue_id: The ID of the issue to escalate.
            escalator: The person escalating the issue.
            reason: The reason for escalation.
            
        Returns:
            The updated issue with incremented escalation level.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        previous_state = issue.model_dump()
        
        # Increment escalation level
        issue.escalation_level += 1
        issue.escalated_at = datetime.now()
        
        repository.update_issue(issue)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=escalator,
            actor_type="human",
            action="escalate_issue",
            entity_type="Issue",
            entity_id=issue_id,
            previous_state=previous_state,
            new_state=issue.model_dump(),
            rationale=reason
        ))
        
        # For critical issues, log notification to senior management
        if issue.severity == 'critical':
            repository.create_audit_entry(AuditEntry(
                actor="IssueManagementAgent",
                actor_type="agent",
                action="notify_senior_management",
                entity_type="Issue",
                entity_id=issue_id,
                new_state={
                    "notification_type": "critical_issue_escalation",
                    "escalation_level": issue.escalation_level,
                    "reason": reason
                }
            ))
        
        return issue.model_dump()
    
    @tool
    def resolve_issue(
        issue_id: str,
        resolution_type: str,
        resolution_description: str,
        implemented_by: str,
        verified_by: str,
        access_token: Optional[str] = None
    ) -> dict:
        """
        Resolve an issue with human confirmation.
        
        Requires verified_by to be different from implemented_by to ensure
        four-eyes principle compliance.
        
        Supports authentication via access_token for audit trail compliance.
        
        Args:
            issue_id: The ID of the issue to resolve.
            resolution_type: Type of resolution - 'data_correction', 'process_change',
                           'system_fix', or 'exception_approved'.
            resolution_description: Description of how the issue was resolved.
            implemented_by: The person who implemented the fix.
            verified_by: The person who verified the fix (must be different from implemented_by).
            access_token: JWT access token for authentication (optional).
            
        Returns:
            The resolved issue.
            
        Requirements: 16.2, 16.3
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        # Extract user identity from token if provided
        verified_verifier = verified_by
        user_audit_info = None
        
        if access_token:
            try:
                user_audit_info = extract_user_for_audit(access_token)
                verified_verifier = user_audit_info.get("user_id", verified_by)
            except Exception:
                pass
        
        # Enforce four-eyes principle
        if implemented_by == verified_verifier:
            raise ValueError(
                "Four-eyes principle violation: verified_by must be different from implemented_by"
            )
        
        # Validate resolution type
        valid_types = ['data_correction', 'process_change', 'system_fix', 'exception_approved']
        if resolution_type not in valid_types:
            raise ValueError(f"Invalid resolution_type '{resolution_type}'. Must be one of: {valid_types}")
        
        previous_state = issue.model_dump()
        
        # Create resolution
        resolution = Resolution(
            type=resolution_type,  # type: ignore
            description=resolution_description,
            implemented_by=implemented_by,
            implemented_at=datetime.now(),
            verified_by=verified_verifier,
            verified_at=datetime.now()
        )
        
        issue.resolution = resolution
        issue.status = 'resolved'
        
        repository.update_issue(issue)
        
        # Create audit entry with enhanced user information
        audit_new_state = issue.model_dump()
        if user_audit_info:
            audit_new_state["_audit_user_info"] = user_audit_info
        
        repository.create_audit_entry(AuditEntry(
            actor=verified_verifier,
            actor_type="human",
            action="resolve_issue",
            entity_type="Issue",
            entity_id=issue_id,
            previous_state=previous_state,
            new_state=audit_new_state,
            rationale=f"Resolved via {resolution_type}: {resolution_description}"
        ))
        
        return issue.model_dump()
    
    @tool
    def get_issue_metrics() -> dict:
        """
        Calculate and return issue metrics.
        
        Returns metrics including: open_count, open_by_severity,
        avg_resolution_time, and recurring_themes.
        
        Returns:
            Issue metrics summary.
        """
        all_issues = repository.get_issues()
        
        # Calculate open count
        open_issues = [i for i in all_issues if i.status in ['open', 'in_progress', 'pending_verification']]
        open_count = len(open_issues)
        
        # Calculate open by severity
        open_by_severity: dict[str, int] = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0
        }
        for issue in open_issues:
            open_by_severity[issue.severity] += 1
        
        # Calculate average resolution time
        resolved_issues = [i for i in all_issues if i.status in ['resolved', 'closed'] and i.resolution]
        
        if resolved_issues:
            total_resolution_time = 0.0
            count = 0
            for issue in resolved_issues:
                if issue.resolution and issue.resolution.verified_at:
                    resolution_time = (issue.resolution.verified_at - issue.created_at).total_seconds()
                    total_resolution_time += resolution_time
                    count += 1
            
            avg_resolution_time = (total_resolution_time / count / 3600) if count > 0 else 0.0  # Convert to hours
        else:
            avg_resolution_time = 0.0
        
        # Identify recurring themes from issue titles and descriptions
        word_counts: dict[str, int] = {}
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
                      'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
                      'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
                      'below', 'between', 'under', 'again', 'further', 'then', 'once', 'and',
                      'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not',
                      'only', 'own', 'same', 'than', 'too', 'very', 'just', 'data', 'issue'}
        
        for issue in all_issues:
            words = (issue.title + " " + issue.description).lower().split()
            for word in words:
                # Clean word
                word = ''.join(c for c in word if c.isalnum())
                if len(word) > 3 and word not in stop_words:
                    word_counts[word] = word_counts.get(word, 0) + 1
        
        # Get top recurring themes
        sorted_themes = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        recurring_themes = [
            RecurringTheme(theme=theme, count=count)
            for theme, count in sorted_themes[:10]
            if count >= 2
        ]
        
        metrics = IssueMetrics(
            open_count=open_count,
            open_by_severity=open_by_severity,
            avg_resolution_time=round(avg_resolution_time, 2),
            recurring_themes=recurring_themes
        )
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="IssueManagementAgent",
            actor_type="agent",
            action="get_issue_metrics",
            entity_type="IssueMetrics",
            entity_id="summary",
            new_state=metrics.model_dump()
        ))
        
        return metrics.model_dump()
    
    @tool
    def get_issue(issue_id: str) -> dict:
        """
        Get a specific issue by ID.
        
        Args:
            issue_id: The ID of the issue to retrieve.
            
        Returns:
            The issue if found.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        return issue.model_dump()
    
    @tool
    def update_issue_status(
        issue_id: str,
        status: str,
        updater: str,
        rationale: Optional[str] = None
    ) -> dict:
        """
        Update the status of an issue.
        
        Args:
            issue_id: The ID of the issue to update.
            status: New status - 'open', 'in_progress', 'pending_verification', 'resolved', 'closed'.
            updater: The person updating the status.
            rationale: Optional reason for the status change.
            
        Returns:
            The updated issue.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        valid_statuses = ['open', 'in_progress', 'pending_verification', 'resolved', 'closed']
        if status not in valid_statuses:
            raise ValueError(f"Invalid status '{status}'. Must be one of: {valid_statuses}")
        
        previous_state = issue.model_dump()
        previous_status = issue.status
        
        issue.status = status  # type: ignore
        
        repository.update_issue(issue)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=updater,
            actor_type="human",
            action="update_issue_status",
            entity_type="Issue",
            entity_id=issue_id,
            previous_state={"status": previous_status},
            new_state={"status": status},
            rationale=rationale or f"Status changed from {previous_status} to {status}"
        ))
        
        return issue.model_dump()
    
    @tool
    def set_root_cause(
        issue_id: str,
        root_cause: str,
        updater: str
    ) -> dict:
        """
        Set the root cause for an issue.
        
        Args:
            issue_id: The ID of the issue.
            root_cause: The identified root cause.
            updater: The person setting the root cause.
            
        Returns:
            The updated issue.
        """
        issue = repository.get_issue(issue_id)
        if not issue:
            raise ValueError(f"Issue with ID '{issue_id}' not found")
        
        previous_state = issue.model_dump()
        
        issue.root_cause = root_cause
        
        repository.update_issue(issue)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor=updater,
            actor_type="human",
            action="set_root_cause",
            entity_type="Issue",
            entity_id=issue_id,
            previous_state=previous_state,
            new_state=issue.model_dump(),
            rationale=f"Root cause identified: {root_cause}"
        ))
        
        return issue.model_dump()
    
    return [
        create_issue,
        suggest_root_cause,
        find_similar_issues,
        assign_issue,
        escalate_issue,
        resolve_issue,
        get_issue_metrics,
        get_issue,
        update_issue_status,
        set_root_cause
    ]


def _generate_generic_root_cause(issue: Issue) -> str:
    """
    Generate a generic root cause suggestion based on issue characteristics.
    
    Args:
        issue: The issue to generate a suggestion for.
        
    Returns:
        A generic root cause suggestion string.
    """
    source_suggestions = {
        "dq_rule": "Data quality rule failure - likely caused by upstream data issues or schema changes",
        "manual": "Manually identified issue - requires investigation of data source and transformation logic",
        "reconciliation": "Reconciliation discrepancy - check for timing differences or calculation logic errors",
        "audit": "Audit finding - review process controls and data handling procedures",
        "system": "System-generated alert - investigate system logs and recent deployments"
    }
    
    # Check if source matches known patterns
    source_lower = issue.source.lower()
    for key, suggestion in source_suggestions.items():
        if key in source_lower:
            return suggestion
    
    # Default suggestion based on severity
    if issue.severity == 'critical':
        return "Critical issue requires immediate investigation of data pipeline and source systems"
    elif issue.severity == 'high':
        return "High priority issue - recommend reviewing recent changes to data sources and transformations"
    else:
        return "Issue requires analysis of data flow and validation rules to identify root cause"
