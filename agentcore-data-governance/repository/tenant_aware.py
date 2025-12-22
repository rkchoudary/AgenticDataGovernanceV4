"""
Tenant-aware repository implementation for multi-tenant SaaS.

This module provides a tenant-scoped repository that automatically
filters and prefixes all data operations by tenant_id.

Requirements: 20.3, 20.4
"""
from datetime import datetime
from typing import Optional, Any
from copy import deepcopy

from models.regulatory import ReportCatalog, RegulatoryReport
from models.cde import CDEInventory, CDE
from models.data_quality import DQRule, RuleExecutionResult
from models.lineage import LineageGraph
from models.issues import Issue, IssueFilters
from models.controls import ControlMatrix, Control, ControlEvidence
from models.workflow import CycleInstance, HumanTask
from models.audit import AuditEntry, CreateAuditEntryParams
from models.data_elements import RequirementsDocument
from models.tenant import Tenant, TenantUsage

from repository.base import GovernanceRepository
from services.tenant_context import (
    get_current_tenant_id,
    create_tenant_scoped_key,
)


class TenantAwareRepository(GovernanceRepository):
    """
    Tenant-aware repository that automatically scopes all operations by tenant.
    
    This repository wraps storage operations to ensure complete tenant isolation.
    All keys are prefixed with tenant_id and all queries are filtered by tenant.
    
    Validates: Requirements 20.3, 20.4
    """
    
    def __init__(self, tenant_id: Optional[str] = None):
        """
        Initialize the tenant-aware repository.
        
        Args:
            tenant_id: Optional explicit tenant ID. If not provided,
                      uses the current tenant context.
        """
        self._explicit_tenant_id = tenant_id
        
        # Tenant-scoped storage containers
        # Keys are in format: "tenant:{tenant_id}:{entity_type}:{entity_id}"
        self._report_catalogs: dict[str, ReportCatalog] = {}
        self._cde_inventories: dict[str, CDEInventory] = {}
        self._dq_rules: dict[str, DQRule] = {}
        self._rule_execution_results: dict[str, list[RuleExecutionResult]] = {}
        self._lineage_graphs: dict[str, LineageGraph] = {}
        self._issues: dict[str, Issue] = {}
        self._control_matrices: dict[str, ControlMatrix] = {}
        self._cycle_instances: dict[str, CycleInstance] = {}
        self._human_tasks: dict[str, HumanTask] = {}
        self._audit_entries: dict[str, list[AuditEntry]] = {}
        self._requirements_documents: dict[str, RequirementsDocument] = {}
        
        # Tenant management
        self._tenants: dict[str, Tenant] = {}
        self._tenant_usage: dict[str, list[TenantUsage]] = {}
    
    @property
    def tenant_id(self) -> str:
        """
        Get the current tenant ID.
        
        Returns:
            The tenant ID from explicit setting or context.
            
        Raises:
            RuntimeError: If no tenant ID is available.
        """
        tenant_id = self._explicit_tenant_id or get_current_tenant_id()
        if not tenant_id:
            raise RuntimeError("No tenant context available")
        return tenant_id
    
    def _scoped_key(self, *parts: str) -> str:
        """Create a tenant-scoped storage key."""
        return create_tenant_scoped_key(":".join(parts), self.tenant_id)
    
    def _set_tenant_id_on_model(self, model: Any) -> Any:
        """Set tenant_id on a model if it has the attribute."""
        if hasattr(model, 'tenant_id'):
            model_copy = deepcopy(model)
            model_copy.tenant_id = self.tenant_id
            return model_copy
        return deepcopy(model)
    
    # ==================== Report Catalog ====================
    
    def get_report_catalog(self) -> Optional[ReportCatalog]:
        """Get the current regulatory report catalog for this tenant."""
        key = self._scoped_key("catalog", "singleton")
        catalog = self._report_catalogs.get(key)
        return deepcopy(catalog) if catalog else None
    
    def set_report_catalog(self, catalog: ReportCatalog) -> None:
        """Set/update the regulatory report catalog for this tenant."""
        key = self._scoped_key("catalog", "singleton")
        catalog_copy = self._set_tenant_id_on_model(catalog)
        self._report_catalogs[key] = catalog_copy
    
    def get_report(self, report_id: str) -> Optional[RegulatoryReport]:
        """Get a specific regulatory report by ID."""
        catalog = self.get_report_catalog()
        if not catalog:
            return None
        for report in catalog.reports:
            if report.id == report_id:
                return deepcopy(report)
        return None
    
    # ==================== CDE Inventory ====================
    
    def get_cde_inventory(self, report_id: str) -> Optional[CDEInventory]:
        """Get the CDE inventory for a specific report."""
        key = self._scoped_key("cde_inventory", report_id)
        inventory = self._cde_inventories.get(key)
        return deepcopy(inventory) if inventory else None
    
    def set_cde_inventory(self, report_id: str, inventory: CDEInventory) -> None:
        """Set/update the CDE inventory for a report."""
        key = self._scoped_key("cde_inventory", report_id)
        inventory_copy = self._set_tenant_id_on_model(inventory)
        self._cde_inventories[key] = inventory_copy
    
    def get_cde(self, cde_id: str) -> Optional[CDE]:
        """Get a specific CDE by ID."""
        # Search through all inventories for this tenant
        prefix = f"tenant:{self.tenant_id}:cde_inventory:"
        for key, inventory in self._cde_inventories.items():
            if key.startswith(prefix):
                for cde in inventory.cdes:
                    if cde.id == cde_id:
                        return deepcopy(cde)
        return None
    
    def update_cde(self, cde: CDE) -> None:
        """Update an existing CDE."""
        prefix = f"tenant:{self.tenant_id}:cde_inventory:"
        for key, inventory in self._cde_inventories.items():
            if key.startswith(prefix):
                for i, existing_cde in enumerate(inventory.cdes):
                    if existing_cde.id == cde.id:
                        cde_copy = self._set_tenant_id_on_model(cde)
                        inventory.cdes[i] = cde_copy
                        return
    
    # ==================== DQ Rules ====================
    
    def get_dq_rules(self, cde_id: Optional[str] = None) -> list[DQRule]:
        """Get DQ rules, optionally filtered by CDE ID."""
        prefix = f"tenant:{self.tenant_id}:dq_rule:"
        rules = [
            deepcopy(rule) for key, rule in self._dq_rules.items()
            if key.startswith(prefix)
        ]
        if cde_id:
            rules = [r for r in rules if r.cde_id == cde_id]
        return rules
    
    def add_dq_rule(self, rule: DQRule) -> None:
        """Add a new DQ rule."""
        key = self._scoped_key("dq_rule", rule.id)
        rule_copy = self._set_tenant_id_on_model(rule)
        self._dq_rules[key] = rule_copy
    
    def update_dq_rule(self, rule: DQRule) -> None:
        """Update an existing DQ rule."""
        key = self._scoped_key("dq_rule", rule.id)
        if key in self._dq_rules:
            rule_copy = self._set_tenant_id_on_model(rule)
            self._dq_rules[key] = rule_copy
    
    def get_dq_rule(self, rule_id: str) -> Optional[DQRule]:
        """Get a specific DQ rule by ID."""
        key = self._scoped_key("dq_rule", rule_id)
        rule = self._dq_rules.get(key)
        return deepcopy(rule) if rule else None
    
    def delete_dq_rule(self, rule_id: str) -> bool:
        """Delete a DQ rule by ID."""
        key = self._scoped_key("dq_rule", rule_id)
        if key in self._dq_rules:
            del self._dq_rules[key]
            return True
        return False
    
    def store_rule_execution_result(self, result: RuleExecutionResult) -> None:
        """Store a DQ rule execution result."""
        key = self._scoped_key("rule_results", "all")
        if key not in self._rule_execution_results:
            self._rule_execution_results[key] = []
        self._rule_execution_results[key].append(deepcopy(result))
    
    def get_rule_execution_results(
        self, 
        rule_id: Optional[str] = None,
        cde_id: Optional[str] = None,
        since: Optional[datetime] = None
    ) -> list[RuleExecutionResult]:
        """Get rule execution results with optional filters."""
        key = self._scoped_key("rule_results", "all")
        results = self._rule_execution_results.get(key, [])
        
        if rule_id:
            results = [r for r in results if r.rule_id == rule_id]
        if since:
            results = [r for r in results if r.executed_at >= since]
        
        return [deepcopy(r) for r in results]
    
    # ==================== Lineage ====================
    
    def get_lineage_graph(self, report_id: str) -> Optional[LineageGraph]:
        """Get the lineage graph for a specific report."""
        key = self._scoped_key("lineage", report_id)
        graph = self._lineage_graphs.get(key)
        return deepcopy(graph) if graph else None
    
    def set_lineage_graph(self, report_id: str, graph: LineageGraph) -> None:
        """Set/update the lineage graph for a report."""
        key = self._scoped_key("lineage", report_id)
        graph_copy = self._set_tenant_id_on_model(graph)
        self._lineage_graphs[key] = graph_copy
    
    # ==================== Issues ====================
    
    def get_issues(self, filters: Optional[IssueFilters] = None) -> list[Issue]:
        """Get issues with optional filters."""
        prefix = f"tenant:{self.tenant_id}:issue:"
        issues = [
            deepcopy(issue) for key, issue in self._issues.items()
            if key.startswith(prefix)
        ]
        
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
        
        return issues
    
    def create_issue(self, issue: Issue) -> Issue:
        """Create a new issue."""
        key = self._scoped_key("issue", issue.id)
        issue_copy = self._set_tenant_id_on_model(issue)
        self._issues[key] = issue_copy
        return deepcopy(issue_copy)
    
    def update_issue(self, issue: Issue) -> None:
        """Update an existing issue."""
        key = self._scoped_key("issue", issue.id)
        if key in self._issues:
            issue_copy = self._set_tenant_id_on_model(issue)
            self._issues[key] = issue_copy
    
    def get_issue(self, issue_id: str) -> Optional[Issue]:
        """Get a specific issue by ID."""
        key = self._scoped_key("issue", issue_id)
        issue = self._issues.get(key)
        return deepcopy(issue) if issue else None
    
    def delete_issue(self, issue_id: str) -> bool:
        """Delete an issue by ID."""
        key = self._scoped_key("issue", issue_id)
        if key in self._issues:
            del self._issues[key]
            return True
        return False
    
    # ==================== Controls ====================
    
    def get_control_matrix(self, report_id: str) -> Optional[ControlMatrix]:
        """Get the control matrix for a specific report."""
        key = self._scoped_key("control_matrix", report_id)
        matrix = self._control_matrices.get(key)
        return deepcopy(matrix) if matrix else None
    
    def set_control_matrix(self, report_id: str, matrix: ControlMatrix) -> None:
        """Set/update the control matrix for a report."""
        key = self._scoped_key("control_matrix", report_id)
        matrix_copy = self._set_tenant_id_on_model(matrix)
        self._control_matrices[key] = matrix_copy
    
    def get_control(self, control_id: str) -> Optional[Control]:
        """Get a specific control by ID."""
        prefix = f"tenant:{self.tenant_id}:control_matrix:"
        for key, matrix in self._control_matrices.items():
            if key.startswith(prefix):
                for control in matrix.controls:
                    if control.id == control_id:
                        return deepcopy(control)
        return None
    
    def update_control(self, control: Control) -> None:
        """Update an existing control."""
        prefix = f"tenant:{self.tenant_id}:control_matrix:"
        for key, matrix in self._control_matrices.items():
            if key.startswith(prefix):
                for i, existing_control in enumerate(matrix.controls):
                    if existing_control.id == control.id:
                        control_copy = self._set_tenant_id_on_model(control)
                        matrix.controls[i] = control_copy
                        return
    
    def add_control_evidence(self, control_id: str, evidence: ControlEvidence) -> None:
        """Add evidence to a control."""
        prefix = f"tenant:{self.tenant_id}:control_matrix:"
        for key, matrix in self._control_matrices.items():
            if key.startswith(prefix):
                for control in matrix.controls:
                    if control.id == control_id:
                        control.evidence.append(deepcopy(evidence))
                        return
    
    # ==================== Workflow ====================
    
    def get_cycle_instance(self, cycle_id: str) -> Optional[CycleInstance]:
        """Get a specific cycle instance by ID."""
        key = self._scoped_key("cycle", cycle_id)
        cycle = self._cycle_instances.get(key)
        return deepcopy(cycle) if cycle else None
    
    def create_cycle_instance(self, cycle: CycleInstance) -> CycleInstance:
        """Create a new cycle instance."""
        key = self._scoped_key("cycle", cycle.id)
        cycle_copy = self._set_tenant_id_on_model(cycle)
        self._cycle_instances[key] = cycle_copy
        return deepcopy(cycle_copy)
    
    def update_cycle_instance(self, cycle: CycleInstance) -> None:
        """Update an existing cycle instance."""
        key = self._scoped_key("cycle", cycle.id)
        if key in self._cycle_instances:
            cycle_copy = self._set_tenant_id_on_model(cycle)
            self._cycle_instances[key] = cycle_copy
    
    def get_active_cycles(self, report_id: Optional[str] = None) -> list[CycleInstance]:
        """Get active cycle instances, optionally filtered by report."""
        prefix = f"tenant:{self.tenant_id}:cycle:"
        cycles = [
            deepcopy(c) for key, c in self._cycle_instances.items()
            if key.startswith(prefix) and c.status == "active"
        ]
        if report_id:
            cycles = [c for c in cycles if c.report_id == report_id]
        return cycles
    
    def get_human_task(self, task_id: str) -> Optional[HumanTask]:
        """Get a specific human task by ID."""
        key = self._scoped_key("task", task_id)
        task = self._human_tasks.get(key)
        return deepcopy(task) if task else None
    
    def create_human_task(self, task: HumanTask) -> HumanTask:
        """Create a new human task."""
        key = self._scoped_key("task", task.id)
        task_copy = self._set_tenant_id_on_model(task)
        self._human_tasks[key] = task_copy
        return deepcopy(task_copy)
    
    def update_human_task(self, task: HumanTask) -> None:
        """Update an existing human task."""
        key = self._scoped_key("task", task.id)
        if key in self._human_tasks:
            task_copy = self._set_tenant_id_on_model(task)
            self._human_tasks[key] = task_copy
    
    def get_pending_tasks(
        self, 
        assigned_role: Optional[str] = None,
        cycle_id: Optional[str] = None
    ) -> list[HumanTask]:
        """Get pending human tasks with optional filters."""
        prefix = f"tenant:{self.tenant_id}:task:"
        tasks = [
            deepcopy(t) for key, t in self._human_tasks.items()
            if key.startswith(prefix) and t.status == "pending"
        ]
        
        if assigned_role:
            tasks = [t for t in tasks if t.assigned_role == assigned_role]
        if cycle_id:
            tasks = [t for t in tasks if t.cycle_id == cycle_id]
        
        return tasks
    
    # ==================== Audit Trail ====================
    
    def create_audit_entry(self, entry: AuditEntry) -> None:
        """Create a new audit entry."""
        key = self._scoped_key("audit", "all")
        if key not in self._audit_entries:
            self._audit_entries[key] = []
        entry_copy = self._set_tenant_id_on_model(entry)
        self._audit_entries[key].append(entry_copy)
    
    def create_audit_entry_from_params(self, params: CreateAuditEntryParams) -> AuditEntry:
        """Create an audit entry from parameters."""
        entry = AuditEntry(
            tenant_id=self.tenant_id,
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
        key = self._scoped_key("audit", "all")
        entries = self._audit_entries.get(key, [])
        
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
        
        # Sort by timestamp descending
        entries = sorted(entries, key=lambda e: e.timestamp, reverse=True)
        
        if limit:
            entries = entries[:limit]
        
        return [deepcopy(e) for e in entries]
    
    # ==================== Requirements Documents ====================
    
    def get_requirements_document(self, report_id: str) -> Optional[RequirementsDocument]:
        """Get the requirements document for a specific report."""
        key = self._scoped_key("requirements", report_id)
        document = self._requirements_documents.get(key)
        return deepcopy(document) if document else None
    
    def set_requirements_document(self, report_id: str, document: RequirementsDocument) -> None:
        """Set/update the requirements document for a report."""
        key = self._scoped_key("requirements", report_id)
        self._requirements_documents[key] = deepcopy(document)
    
    # ==================== Tenant Management ====================
    
    def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        """Get a tenant by ID."""
        return deepcopy(self._tenants.get(tenant_id))
    
    def create_tenant(self, tenant: Tenant) -> Tenant:
        """Create a new tenant."""
        self._tenants[tenant.id] = deepcopy(tenant)
        return deepcopy(tenant)
    
    def update_tenant(self, tenant: Tenant) -> None:
        """Update an existing tenant."""
        if tenant.id in self._tenants:
            self._tenants[tenant.id] = deepcopy(tenant)
    
    def delete_tenant(self, tenant_id: str) -> bool:
        """Delete a tenant and all associated data."""
        if tenant_id not in self._tenants:
            return False
        
        # Delete tenant record
        del self._tenants[tenant_id]
        
        # Delete all tenant-scoped data
        prefix = f"tenant:{tenant_id}:"
        
        for storage in [
            self._report_catalogs,
            self._cde_inventories,
            self._dq_rules,
            self._rule_execution_results,
            self._lineage_graphs,
            self._issues,
            self._control_matrices,
            self._cycle_instances,
            self._human_tasks,
            self._audit_entries,
            self._requirements_documents,
        ]:
            keys_to_delete = [k for k in storage.keys() if k.startswith(prefix)]
            for key in keys_to_delete:
                del storage[key]
        
        return True
    
    def list_tenants(self) -> list[Tenant]:
        """List all tenants."""
        return [deepcopy(t) for t in self._tenants.values()]
    
    def record_tenant_usage(self, usage: TenantUsage) -> None:
        """Record usage metrics for a tenant."""
        if usage.tenant_id not in self._tenant_usage:
            self._tenant_usage[usage.tenant_id] = []
        self._tenant_usage[usage.tenant_id].append(deepcopy(usage))
    
    def get_tenant_usage(
        self,
        tenant_id: str,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None
    ) -> list[TenantUsage]:
        """Get usage metrics for a tenant."""
        usage_list = self._tenant_usage.get(tenant_id, [])
        
        if since:
            usage_list = [u for u in usage_list if u.period_start >= since]
        if until:
            usage_list = [u for u in usage_list if u.period_end <= until]
        
        return [deepcopy(u) for u in usage_list]
    
    # ==================== Utility Methods ====================
    
    def clear_tenant_data(self) -> None:
        """Clear all data for the current tenant."""
        prefix = f"tenant:{self.tenant_id}:"
        
        for storage in [
            self._report_catalogs,
            self._cde_inventories,
            self._dq_rules,
            self._rule_execution_results,
            self._lineage_graphs,
            self._issues,
            self._control_matrices,
            self._cycle_instances,
            self._human_tasks,
            self._audit_entries,
            self._requirements_documents,
        ]:
            keys_to_delete = [k for k in storage.keys() if k.startswith(prefix)]
            for key in keys_to_delete:
                del storage[key]
    
    def clear_all(self) -> None:
        """Clear all stored data across all tenants. Use with caution."""
        self._report_catalogs.clear()
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
        self._tenants.clear()
        self._tenant_usage.clear()
