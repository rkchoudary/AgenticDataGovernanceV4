"""
In-memory implementation of GovernanceRepository.

This implementation is suitable for local development and testing.
All data is stored in memory and lost when the process terminates.
"""
from datetime import datetime
from typing import Optional
from copy import deepcopy

from models.regulatory import ReportCatalog, RegulatoryReport
from models.cde import CDEInventory, CDE
from models.data_quality import DQRule, RuleExecutionResult
from models.lineage import LineageGraph
from models.issues import Issue, IssueFilters, IssueStatus
from models.controls import ControlMatrix, Control, ControlEvidence
from models.workflow import CycleInstance, HumanTask, TaskStatus
from models.audit import AuditEntry, CreateAuditEntryParams
from models.data_elements import RequirementsDocument

from repository.base import GovernanceRepository


class InMemoryGovernanceRepository(GovernanceRepository):
    """
    In-memory implementation of GovernanceRepository.
    
    Stores all data in dictionaries. Useful for testing and development.
    """
    
    def __init__(self):
        """Initialize empty storage containers."""
        self._report_catalog: Optional[ReportCatalog] = None
        self._cde_inventories: dict[str, CDEInventory] = {}  # report_id -> inventory
        self._dq_rules: dict[str, DQRule] = {}  # rule_id -> rule
        self._rule_execution_results: list[RuleExecutionResult] = []
        self._lineage_graphs: dict[str, LineageGraph] = {}  # report_id -> graph
        self._issues: dict[str, Issue] = {}  # issue_id -> issue
        self._control_matrices: dict[str, ControlMatrix] = {}  # report_id -> matrix
        self._cycle_instances: dict[str, CycleInstance] = {}  # cycle_id -> cycle
        self._human_tasks: dict[str, HumanTask] = {}  # task_id -> task
        self._audit_entries: list[AuditEntry] = []
        self._requirements_documents: dict[str, RequirementsDocument] = {}  # report_id -> document
    
    # ==================== Report Catalog ====================
    
    def get_report_catalog(self) -> Optional[ReportCatalog]:
        """Get the current regulatory report catalog."""
        return deepcopy(self._report_catalog) if self._report_catalog else None
    
    def set_report_catalog(self, catalog: ReportCatalog) -> None:
        """Set/update the regulatory report catalog."""
        self._report_catalog = deepcopy(catalog)
    
    def get_report(self, report_id: str) -> Optional[RegulatoryReport]:
        """Get a specific regulatory report by ID."""
        if not self._report_catalog:
            return None
        for report in self._report_catalog.reports:
            if report.id == report_id:
                return deepcopy(report)
        return None
    
    # ==================== CDE Inventory ====================
    
    def get_cde_inventory(self, report_id: str) -> Optional[CDEInventory]:
        """Get the CDE inventory for a specific report."""
        inventory = self._cde_inventories.get(report_id)
        return deepcopy(inventory) if inventory else None
    
    def set_cde_inventory(self, report_id: str, inventory: CDEInventory) -> None:
        """Set/update the CDE inventory for a report."""
        self._cde_inventories[report_id] = deepcopy(inventory)
    
    def get_cde(self, cde_id: str) -> Optional[CDE]:
        """Get a specific CDE by ID."""
        for inventory in self._cde_inventories.values():
            for cde in inventory.cdes:
                if cde.id == cde_id:
                    return deepcopy(cde)
        return None
    
    def update_cde(self, cde: CDE) -> None:
        """Update an existing CDE."""
        for report_id, inventory in self._cde_inventories.items():
            for i, existing_cde in enumerate(inventory.cdes):
                if existing_cde.id == cde.id:
                    inventory.cdes[i] = deepcopy(cde)
                    return
    
    # ==================== DQ Rules ====================
    
    def get_dq_rules(self, cde_id: Optional[str] = None) -> list[DQRule]:
        """Get DQ rules, optionally filtered by CDE ID."""
        rules = list(self._dq_rules.values())
        if cde_id:
            rules = [r for r in rules if r.cde_id == cde_id]
        return [deepcopy(r) for r in rules]
    
    def add_dq_rule(self, rule: DQRule) -> None:
        """Add a new DQ rule."""
        self._dq_rules[rule.id] = deepcopy(rule)
    
    def update_dq_rule(self, rule: DQRule) -> None:
        """Update an existing DQ rule."""
        if rule.id in self._dq_rules:
            self._dq_rules[rule.id] = deepcopy(rule)
    
    def get_dq_rule(self, rule_id: str) -> Optional[DQRule]:
        """Get a specific DQ rule by ID."""
        rule = self._dq_rules.get(rule_id)
        return deepcopy(rule) if rule else None
    
    def delete_dq_rule(self, rule_id: str) -> bool:
        """Delete a DQ rule by ID."""
        if rule_id in self._dq_rules:
            del self._dq_rules[rule_id]
            return True
        return False
    
    def store_rule_execution_result(self, result: RuleExecutionResult) -> None:
        """Store a DQ rule execution result."""
        self._rule_execution_results.append(deepcopy(result))
    
    def get_rule_execution_results(
        self, 
        rule_id: Optional[str] = None,
        cde_id: Optional[str] = None,
        since: Optional[datetime] = None
    ) -> list[RuleExecutionResult]:
        """Get rule execution results with optional filters."""
        results = self._rule_execution_results
        
        if rule_id:
            results = [r for r in results if r.rule_id == rule_id]
        
        if cde_id:
            results = [r for r in results if r.cde_id == cde_id]
        
        if since:
            results = [r for r in results if r.executed_at >= since]
        
        return [deepcopy(r) for r in results]
    
    # ==================== Lineage ====================
    
    def get_lineage_graph(self, report_id: str) -> Optional[LineageGraph]:
        """Get the lineage graph for a specific report."""
        graph = self._lineage_graphs.get(report_id)
        return deepcopy(graph) if graph else None
    
    def set_lineage_graph(self, report_id: str, graph: LineageGraph) -> None:
        """Set/update the lineage graph for a report."""
        self._lineage_graphs[report_id] = deepcopy(graph)
    
    # ==================== Issues ====================
    
    def get_issues(self, filters: Optional[IssueFilters] = None) -> list[Issue]:
        """Get issues with optional filters."""
        issues = list(self._issues.values())
        
        if filters:
            if filters.status:
                issues = [i for i in issues if i.status in filters.status]
            if filters.severity:
                issues = [i for i in issues if i.severity in filters.severity]
            if filters.assignee:
                issues = [i for i in issues if i.assignee == filters.assignee]
            if filters.report_id:
                issues = [i for i in issues if filters.report_id in i.impacted_reports]
            if filters.cde_id:
                issues = [i for i in issues if filters.cde_id in i.impacted_cdes]
            if filters.from_date:
                issues = [i for i in issues if i.created_at >= filters.from_date]
            if filters.to_date:
                issues = [i for i in issues if i.created_at <= filters.to_date]
        
        return [deepcopy(i) for i in issues]
    
    def create_issue(self, issue: Issue) -> Issue:
        """Create a new issue."""
        self._issues[issue.id] = deepcopy(issue)
        return deepcopy(issue)
    
    def update_issue(self, issue: Issue) -> None:
        """Update an existing issue."""
        if issue.id in self._issues:
            self._issues[issue.id] = deepcopy(issue)
    
    def get_issue(self, issue_id: str) -> Optional[Issue]:
        """Get a specific issue by ID."""
        issue = self._issues.get(issue_id)
        return deepcopy(issue) if issue else None
    
    def delete_issue(self, issue_id: str) -> bool:
        """Delete an issue by ID."""
        if issue_id in self._issues:
            del self._issues[issue_id]
            return True
        return False
    
    # ==================== Controls ====================
    
    def get_control_matrix(self, report_id: str) -> Optional[ControlMatrix]:
        """Get the control matrix for a specific report."""
        matrix = self._control_matrices.get(report_id)
        return deepcopy(matrix) if matrix else None
    
    def set_control_matrix(self, report_id: str, matrix: ControlMatrix) -> None:
        """Set/update the control matrix for a report."""
        self._control_matrices[report_id] = deepcopy(matrix)
    
    def get_control(self, control_id: str) -> Optional[Control]:
        """Get a specific control by ID."""
        for matrix in self._control_matrices.values():
            for control in matrix.controls:
                if control.id == control_id:
                    return deepcopy(control)
        return None
    
    def update_control(self, control: Control) -> None:
        """Update an existing control."""
        for report_id, matrix in self._control_matrices.items():
            for i, existing_control in enumerate(matrix.controls):
                if existing_control.id == control.id:
                    matrix.controls[i] = deepcopy(control)
                    return
    
    def add_control_evidence(self, control_id: str, evidence: ControlEvidence) -> None:
        """Add evidence to a control."""
        for matrix in self._control_matrices.values():
            for control in matrix.controls:
                if control.id == control_id:
                    control.evidence.append(deepcopy(evidence))
                    return
    
    # ==================== Workflow ====================
    
    def get_cycle_instance(self, cycle_id: str) -> Optional[CycleInstance]:
        """Get a specific cycle instance by ID."""
        cycle = self._cycle_instances.get(cycle_id)
        return deepcopy(cycle) if cycle else None
    
    def create_cycle_instance(self, cycle: CycleInstance) -> CycleInstance:
        """Create a new cycle instance."""
        self._cycle_instances[cycle.id] = deepcopy(cycle)
        return deepcopy(cycle)
    
    def update_cycle_instance(self, cycle: CycleInstance) -> None:
        """Update an existing cycle instance."""
        if cycle.id in self._cycle_instances:
            self._cycle_instances[cycle.id] = deepcopy(cycle)
    
    def get_active_cycles(self, report_id: Optional[str] = None) -> list[CycleInstance]:
        """Get active cycle instances, optionally filtered by report."""
        cycles = [c for c in self._cycle_instances.values() if c.status == "active"]
        if report_id:
            cycles = [c for c in cycles if c.report_id == report_id]
        return [deepcopy(c) for c in cycles]
    
    def get_human_task(self, task_id: str) -> Optional[HumanTask]:
        """Get a specific human task by ID."""
        task = self._human_tasks.get(task_id)
        return deepcopy(task) if task else None
    
    def create_human_task(self, task: HumanTask) -> HumanTask:
        """Create a new human task."""
        self._human_tasks[task.id] = deepcopy(task)
        return deepcopy(task)
    
    def update_human_task(self, task: HumanTask) -> None:
        """Update an existing human task."""
        if task.id in self._human_tasks:
            self._human_tasks[task.id] = deepcopy(task)
    
    def get_pending_tasks(
        self, 
        assigned_role: Optional[str] = None,
        cycle_id: Optional[str] = None
    ) -> list[HumanTask]:
        """Get pending human tasks with optional filters."""
        tasks = [t for t in self._human_tasks.values() if t.status == "pending"]
        
        if assigned_role:
            tasks = [t for t in tasks if t.assigned_role == assigned_role]
        
        if cycle_id:
            tasks = [t for t in tasks if t.cycle_id == cycle_id]
        
        return [deepcopy(t) for t in tasks]
    
    # ==================== Audit Trail ====================
    
    def create_audit_entry(self, entry: AuditEntry) -> None:
        """Create a new audit entry."""
        self._audit_entries.append(deepcopy(entry))
    
    def create_audit_entry_from_params(self, params: CreateAuditEntryParams) -> AuditEntry:
        """Create an audit entry from parameters."""
        entry = AuditEntry(
            timestamp=datetime.now(),
            actor=params.actor,
            actor_type=params.actor_type,
            action=params.action,
            entity_type=params.entity_type,
            entity_id=params.entity_id,
            previous_state=params.previous_state,
            new_state=params.new_state,
            rationale=params.rationale,
        )
        self.create_audit_entry(entry)
        return entry
    
    def get_audit_entries(
        self,
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        actor: Optional[str] = None,
        action: Optional[str] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        limit: Optional[int] = None
    ) -> list[AuditEntry]:
        """Get audit entries with optional filters."""
        entries = self._audit_entries
        
        if entity_type:
            entries = [e for e in entries if e.entity_type == entity_type]
        
        if entity_id:
            entries = [e for e in entries if e.entity_id == entity_id]
        
        if actor:
            entries = [e for e in entries if e.actor == actor]
        
        if action:
            entries = [e for e in entries if e.action == action]
        
        if since:
            entries = [e for e in entries if e.timestamp >= since]
        
        if until:
            entries = [e for e in entries if e.timestamp <= until]
        
        # Sort by timestamp descending (most recent first)
        entries = sorted(entries, key=lambda e: e.timestamp, reverse=True)
        
        if limit:
            entries = entries[:limit]
        
        return [deepcopy(e) for e in entries]
    
    # ==================== Requirements Documents ====================
    
    def get_requirements_document(self, report_id: str) -> Optional[RequirementsDocument]:
        """Get the requirements document for a specific report."""
        document = self._requirements_documents.get(report_id)
        return deepcopy(document) if document else None
    
    def set_requirements_document(self, report_id: str, document: RequirementsDocument) -> None:
        """Set/update the requirements document for a report."""
        self._requirements_documents[report_id] = deepcopy(document)
    
    # ==================== Utility Methods ====================
    
    def clear(self) -> None:
        """Clear all stored data. Useful for testing."""
        self._report_catalog = None
        self._cde_inventories.clear()
        self._dq_rules.clear()
        self._rule_execution_results.clear()
        self._lineage_graphs.clear()
        self._issues.clear()
        self._control_matrices.clear()
        self._cycle_instances.clear()
        self._human_tasks.clear()
        self._audit_entries.clear()
        self._requirements_documents.clear()
