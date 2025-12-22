"""
Dashboard Service for the Agentic Data Governance System.

Provides real-time monitoring and visualization for data governance.
Implements Requirements 11.1-11.6 for data governance dashboard and monitoring.
"""

from datetime import datetime
from typing import Optional

from models.dashboard import (
    CDEQualityScore,
    QualityTrend,
    IssueSummary,
    ControlStatusDisplay,
    CalendarEntry,
    Annotation,
    DateRange,
)
from models.issues import IssueFilters
from models.data_quality import RuleExecutionResult, DQRule
from models.cde import CDE
from models.lineage import LineageGraph
from repository.base import GovernanceRepository


class CDEDetail:
    """CDE detail information for drill-down."""
    
    def __init__(
        self,
        cde: CDE,
        lineage: Optional[LineageGraph] = None,
        rules: Optional[list[DQRule]] = None,
        quality_score: Optional[CDEQualityScore] = None,
    ):
        self.cde = cde
        self.lineage = lineage
        self.rules = rules or []
        self.quality_score = quality_score


class DashboardService:
    """
    Dashboard Service implementation.
    
    Provides methods for retrieving quality scores, trends, issue summaries,
    control status, and annotations for the governance dashboard.
    """
    
    def __init__(self, repository: GovernanceRepository):
        """
        Initialize the dashboard service.
        
        Args:
            repository: The governance repository for data access.
        """
        self.repository = repository
        self._annotations: dict[str, list[Annotation]] = {}
    
    def get_cde_quality_scores(self, report_id: str) -> list[CDEQualityScore]:
        """
        Get CDE quality scores for a report.
        
        Requirements: 11.1 - Show real-time completeness, accuracy, and timeliness scores
        
        Args:
            report_id: The report ID to get quality scores for.
            
        Returns:
            List of CDE quality scores.
        """
        inventory = self.repository.get_cde_inventory(report_id)
        if not inventory:
            return []
        
        scores: list[CDEQualityScore] = []
        
        for cde in inventory.cdes:
            # Get all rules for this CDE
            rules = self.repository.get_dq_rules(cde_id=cde.id)
            
            # Get execution results for each rule
            all_results: list[RuleExecutionResult] = []
            for rule in rules:
                results = self.repository.get_rule_execution_results(rule_id=rule.id)
                all_results.extend(results)
            
            # Calculate scores from most recent rule execution results
            completeness_results = [
                r for r in all_results 
                if self._get_rule_dimension(r.rule_id) == 'completeness'
            ]
            accuracy_results = [
                r for r in all_results 
                if self._get_rule_dimension(r.rule_id) == 'accuracy'
            ]
            timeliness_results = [
                r for r in all_results 
                if self._get_rule_dimension(r.rule_id) == 'timeliness'
            ]
            
            completeness = self._calculate_dimension_score(completeness_results)
            accuracy = self._calculate_dimension_score(accuracy_results)
            timeliness = self._calculate_dimension_score(timeliness_results)
            overall_score = (completeness + accuracy + timeliness) / 3
            
            # Check threshold breach
            threshold_breached = self._check_threshold_breach(
                completeness, accuracy, timeliness
            )
            
            last_updated = self._get_latest_execution_date(all_results)
            
            scores.append(CDEQualityScore(
                cde_id=cde.id,
                cde_name=cde.name,
                completeness=completeness,
                accuracy=accuracy,
                timeliness=timeliness,
                overall_score=overall_score,
                threshold_breached=threshold_breached,
                last_updated=last_updated,
            ))
        
        return scores
    
    def get_quality_trends(
        self, 
        report_id: str, 
        period: DateRange
    ) -> list[QualityTrend]:
        """
        Get quality trends over a time period.
        
        Requirements: 11.2 - Show historical data quality graphs
        
        Args:
            report_id: The report ID to get trends for.
            period: The date range for the trends.
            
        Returns:
            List of quality trend data points.
        """
        inventory = self.repository.get_cde_inventory(report_id)
        if not inventory:
            return []
        
        trends: list[QualityTrend] = []
        dimensions = [
            'completeness', 'accuracy', 'timeliness', 
            'validity', 'consistency', 'uniqueness'
        ]
        
        for cde in inventory.cdes:
            # Get all rules for this CDE
            rules = self.repository.get_dq_rules(cde_id=cde.id)
            
            # Get execution results for each rule within the period
            all_results: list[RuleExecutionResult] = []
            for rule in rules:
                results = self.repository.get_rule_execution_results(
                    rule_id=rule.id,
                    since=period.start
                )
                # Filter by end date
                results = [r for r in results if r.executed_at <= period.end]
                all_results.extend(results)
            
            # Group by date and dimension
            for dimension in dimensions:
                dimension_results = [
                    r for r in all_results 
                    if self._get_rule_dimension(r.rule_id) == dimension
                ]
                
                # Group by date (day granularity)
                by_date: dict[str, list[RuleExecutionResult]] = {}
                for result in dimension_results:
                    date_key = result.executed_at.strftime('%Y-%m-%d')
                    if date_key not in by_date:
                        by_date[date_key] = []
                    by_date[date_key].append(result)
                
                # Create trend entries
                for date_key, date_results in by_date.items():
                    score = self._calculate_dimension_score(date_results)
                    trends.append(QualityTrend(
                        date=datetime.strptime(date_key, '%Y-%m-%d'),
                        dimension=dimension,
                        score=score,
                    ))
        
        # Sort by date
        trends.sort(key=lambda t: t.date)
        return trends
    
    def get_issues_summary(self, filters: IssueFilters) -> IssueSummary:
        """
        Get issues summary.
        
        Requirements: 11.3 - Show open issues by severity, average resolution time
        
        Args:
            filters: Filters to apply to the issues.
            
        Returns:
            Issue summary with counts and metrics.
        """
        issues = self.repository.get_issues(filters)
        
        # Calculate open issues
        open_statuses = ['open', 'in_progress', 'pending_verification']
        open_issues = [i for i in issues if i.status in open_statuses]
        
        # Count by severity
        by_severity: dict[str, int] = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0,
        }
        for issue in open_issues:
            by_severity[issue.severity] = by_severity.get(issue.severity, 0) + 1
        
        # Calculate average resolution time
        resolved_issues = [
            i for i in issues 
            if i.status in ['resolved', 'closed']
        ]
        avg_resolution_time = 0.0
        if resolved_issues:
            total_time = 0.0
            for issue in resolved_issues:
                resolved_at = (
                    issue.resolution.implemented_at 
                    if issue.resolution 
                    else datetime.now()
                )
                total_time += (resolved_at - issue.created_at).total_seconds() * 1000
            avg_resolution_time = total_time / len(resolved_issues)
        
        # Get top priority items (critical and high severity open issues)
        severity_order = {'critical': 0, 'high': 1, 'medium': 2, 'low': 3}
        top_priority = sorted(
            [i for i in open_issues if i.severity in ['critical', 'high']],
            key=lambda i: severity_order.get(i.severity, 4)
        )[:10]
        top_priority_items = [i.id for i in top_priority]
        
        return IssueSummary(
            total_open=len(open_issues),
            by_severity=by_severity,
            avg_resolution_time=avg_resolution_time,
            top_priority_items=top_priority_items,
        )
    
    def get_control_status(self, report_id: str) -> list[ControlStatusDisplay]:
        """
        Get control status for a report.
        
        Requirements: 11.4 - Show pass/fail indicators for key controls
        
        Args:
            report_id: The report ID to get control status for.
            
        Returns:
            List of control status displays.
        """
        matrix = self.repository.get_control_matrix(report_id)
        if not matrix:
            return []
        
        statuses: list[ControlStatusDisplay] = []
        
        for control in matrix.controls:
            # Get the most recent evidence
            sorted_evidence = sorted(
                control.evidence,
                key=lambda e: e.execution_date,
                reverse=True
            )
            latest_evidence = sorted_evidence[0] if sorted_evidence else None
            
            # Map control type to display type
            display_type: str = 'validation'
            if control.type == 'process':
                display_type = 'approval'
            elif control.automation_status == 'fully_automated':
                display_type = 'reconciliation'
            
            # Determine status
            status: str = 'pending'
            if latest_evidence:
                if latest_evidence.outcome == 'pass':
                    status = 'pass'
                elif latest_evidence.outcome == 'fail':
                    status = 'fail'
            
            statuses.append(ControlStatusDisplay(
                control_id=control.id,
                control_name=control.name,
                type=display_type,  # type: ignore
                status=status,  # type: ignore
                last_executed=latest_evidence.execution_date if latest_evidence else datetime.now(),
                evidence=latest_evidence.details if latest_evidence else None,
            ))
        
        return statuses
    
    def get_regulatory_calendar(self, period: DateRange) -> list[CalendarEntry]:
        """
        Get regulatory calendar entries.
        
        Args:
            period: The date range for calendar entries.
            
        Returns:
            List of calendar entries.
        """
        catalog = self.repository.get_report_catalog()
        if not catalog:
            return []
        
        entries: list[CalendarEntry] = []
        cycles = self.repository.get_active_cycles()
        
        # Also get all cycles by iterating through reports
        all_cycles = []
        for report in catalog.reports:
            report_cycles = self.repository.get_active_cycles(report_id=report.id)
            all_cycles.extend(report_cycles)
        
        for report in catalog.reports:
            # Find cycles for this report within the period
            report_cycles = [
                c for c in all_cycles 
                if c.report_id == report.id
                and c.period_end >= period.start
                and c.period_end <= period.end
            ]
            
            for cycle in report_cycles:
                status: str = 'upcoming'
                
                if cycle.status == 'completed':
                    status = 'completed'
                elif cycle.status in ['active', 'paused']:
                    status = 'in_progress'
                elif cycle.period_end < datetime.now():
                    status = 'overdue'
                
                entries.append(CalendarEntry(
                    id=cycle.id,
                    report_id=report.id,
                    report_name=report.name,
                    due_date=cycle.period_end,
                    status=status,  # type: ignore
                ))
        
        # Sort by due date
        entries.sort(key=lambda e: e.due_date)
        return entries
    
    def add_annotation(
        self, 
        metric_id: str, 
        comment: str, 
        created_by: str
    ) -> Annotation:
        """
        Add annotation to a metric.
        
        Requirements: 11.6 - Allow comments and explanations with audit trail
        
        Args:
            metric_id: The metric ID to annotate.
            comment: The annotation comment.
            created_by: The user creating the annotation.
            
        Returns:
            The created annotation.
        """
        annotation = Annotation(
            metric_id=metric_id,
            comment=comment,
            created_by=created_by,
            created_at=datetime.now(),
        )
        
        if metric_id not in self._annotations:
            self._annotations[metric_id] = []
        self._annotations[metric_id].append(annotation)
        
        # Create audit entry
        from models.audit import CreateAuditEntryParams
        self.repository.create_audit_entry_from_params(CreateAuditEntryParams(
            actor=created_by,
            actor_type='human',
            action='add_annotation',
            entity_type='Annotation',
            entity_id=annotation.id,
            new_state=annotation.model_dump(),
            rationale=f'Added annotation to metric {metric_id}',
        ))
        
        return annotation
    
    def get_annotations(self, metric_id: str) -> list[Annotation]:
        """
        Get annotations for a metric.
        
        Args:
            metric_id: The metric ID to get annotations for.
            
        Returns:
            List of annotations for the metric.
        """
        return self._annotations.get(metric_id, [])
    
    def get_cde_detail(
        self, 
        report_id: str, 
        cde_id: str
    ) -> Optional[CDEDetail]:
        """
        Get CDE detail for drill-down.
        
        Requirements: 11.5 - Display definition, owner, lineage diagram, 
        and associated quality rules
        
        Args:
            report_id: The report ID.
            cde_id: The CDE ID to get details for.
            
        Returns:
            CDE detail information, or None if not found.
        """
        inventory = self.repository.get_cde_inventory(report_id)
        if not inventory:
            return None
        
        cde = next((c for c in inventory.cdes if c.id == cde_id), None)
        if not cde:
            return None
        
        # Get lineage
        lineage = self.repository.get_lineage_graph(report_id)
        
        # Get rules for this CDE
        rules = self.repository.get_dq_rules(cde_id=cde_id)
        
        # Get quality score
        scores = self.get_cde_quality_scores(report_id)
        quality_score = next((s for s in scores if s.cde_id == cde_id), None)
        
        return CDEDetail(
            cde=cde,
            lineage=lineage,
            rules=rules,
            quality_score=quality_score,
        )
    
    # Private helper methods
    
    def _get_rule_dimension(self, rule_id: str) -> Optional[str]:
        """Get the dimension for a rule."""
        rule = self.repository.get_dq_rule(rule_id)
        return rule.dimension if rule else None
    
    def _calculate_dimension_score(
        self, 
        results: list[RuleExecutionResult]
    ) -> float:
        """Calculate score from rule execution results."""
        if not results:
            return 100.0  # Default to 100% if no results
        
        # Get the most recent result for each rule
        latest_by_rule: dict[str, RuleExecutionResult] = {}
        for result in results:
            existing = latest_by_rule.get(result.rule_id)
            if not existing or result.executed_at > existing.executed_at:
                latest_by_rule[result.rule_id] = result
        
        # Calculate pass rate
        latest_results = list(latest_by_rule.values())
        passed_count = sum(1 for r in latest_results if r.passed)
        return (passed_count / len(latest_results)) * 100
    
    def _check_threshold_breach(
        self, 
        completeness: float, 
        accuracy: float, 
        timeliness: float,
        threshold: float = 85.0
    ) -> bool:
        """Check if any score breaches the threshold."""
        return (
            completeness < threshold or 
            accuracy < threshold or 
            timeliness < threshold
        )
    
    def _get_latest_execution_date(
        self, 
        results: list[RuleExecutionResult]
    ) -> datetime:
        """Get the latest execution date from results."""
        if not results:
            return datetime.now()
        
        return max(r.executed_at for r in results)


# Convenience functions for standalone use

def get_cde_quality_scores(
    repository: GovernanceRepository, 
    report_id: str
) -> list[CDEQualityScore]:
    """Get CDE quality scores for a report."""
    service = DashboardService(repository)
    return service.get_cde_quality_scores(report_id)


def get_quality_trends(
    repository: GovernanceRepository,
    report_id: str,
    period: DateRange
) -> list[QualityTrend]:
    """Get quality trends over a time period."""
    service = DashboardService(repository)
    return service.get_quality_trends(report_id, period)


def get_issues_summary(
    repository: GovernanceRepository,
    filters: IssueFilters
) -> IssueSummary:
    """Get issues summary."""
    service = DashboardService(repository)
    return service.get_issues_summary(filters)


def get_control_status(
    repository: GovernanceRepository,
    report_id: str
) -> list[ControlStatusDisplay]:
    """Get control status for a report."""
    service = DashboardService(repository)
    return service.get_control_status(report_id)


def add_annotation(
    repository: GovernanceRepository,
    metric_id: str,
    comment: str,
    created_by: str
) -> Annotation:
    """Add annotation to a metric."""
    service = DashboardService(repository)
    return service.add_annotation(metric_id, comment, created_by)
