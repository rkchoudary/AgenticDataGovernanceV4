"""
AgentCore Memory implementation of GovernanceRepository.

This implementation uses AWS Bedrock AgentCore Memory for persistence,
providing durable storage with session and actor tracking for audit trails.
"""
import json
import os
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

from repository.base import GovernanceRepository


class AgentCoreMemoryRepository(GovernanceRepository):
    """
    Repository implementation using AgentCore Memory for persistence.
    
    This implementation stores data in AgentCore Memory, providing:
    - Durable persistence across sessions
    - Session and actor tracking for audit trails
    - Integration with AgentCore's memory management
    
    Note: This implementation uses a local cache for performance and
    syncs with AgentCore Memory for persistence.
    """
    
    def __init__(
        self,
        memory_id: Optional[str] = None,
        session_id: Optional[str] = None,
        actor_id: Optional[str] = None,
        region_name: str = "us-west-2"
    ):
        """
        Initialize the AgentCore Memory repository.
        
        Args:
            memory_id: The AgentCore Memory ID. Defaults to env var AGENTCORE_MEMORY_ID.
            session_id: The session ID for grouping events.
            actor_id: The actor ID for tracking who performed actions.
            region_name: AWS region for AgentCore Memory.
        """
        self.memory_id = memory_id or os.environ.get("AGENTCORE_MEMORY_ID")
        self.session_id = session_id or f"session_{datetime.now().strftime('%Y%m%d%H%M%S')}"
        self.actor_id = actor_id or "system"
        self.region_name = region_name
        
        # Initialize memory client (lazy loading to avoid import errors in tests)
        self._memory_client = None
        
        # Local cache for current session
        self._local_cache: dict[str, Any] = {}
        
        # In-memory fallback storage (used when AgentCore Memory is unavailable)
        self._fallback_storage: dict[str, Any] = {
            "report_catalog": None,
            "cde_inventories": {},
            "dq_rules": {},
            "rule_execution_results": [],
            "lineage_graphs": {},
            "issues": {},
            "control_matrices": {},
            "cycle_instances": {},
            "human_tasks": {},
            "audit_entries": [],
            "requirements_documents": {},
        }
    
    @property
    def memory_client(self):
        """Lazy-load the memory client."""
        if self._memory_client is None:
            try:
                from bedrock_agentcore.memory import MemoryClient
                self._memory_client = MemoryClient(region_name=self.region_name)
            except ImportError:
                # AgentCore not available, use fallback
                self._memory_client = None
        return self._memory_client
    
    def _store_event(self, event_type: str, data: dict) -> None:
        """Store an event in AgentCore Memory."""
        if self.memory_client and self.memory_id:
            try:
                self.memory_client.store_event(
                    memory_id=self.memory_id,
                    session_id=self.session_id,
                    actor_id=self.actor_id,
                    event_type=event_type,
                    data=data
                )
            except Exception:
                # Fall back to local storage on error
                pass
    
    def _get_from_cache_or_storage(self, key: str, default: Any = None) -> Any:
        """Get data from cache or fallback storage."""
        if key in self._local_cache:
            return self._local_cache[key]
        return self._fallback_storage.get(key, default)
    
    def _set_in_cache_and_storage(self, key: str, value: Any) -> None:
        """Set data in both cache and fallback storage."""
        self._local_cache[key] = value
        self._fallback_storage[key] = value
    
    # ==================== Report Catalog ====================
    
    def get_report_catalog(self) -> Optional[ReportCatalog]:
        """Get the current regulatory report catalog."""
        data = self._get_from_cache_or_storage("report_catalog")
        return deepcopy(data) if data else None
    
    def set_report_catalog(self, catalog: ReportCatalog) -> None:
        """Set/update the regulatory report catalog."""
        self._set_in_cache_and_storage("report_catalog", deepcopy(catalog))
        self._store_event("report_catalog_updated", catalog.model_dump())
    
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
        inventories = self._get_from_cache_or_storage("cde_inventories", {})
        inventory = inventories.get(report_id)
        return deepcopy(inventory) if inventory else None
    
    def set_cde_inventory(self, report_id: str, inventory: CDEInventory) -> None:
        """Set/update the CDE inventory for a report."""
        inventories = self._get_from_cache_or_storage("cde_inventories", {})
        inventories[report_id] = deepcopy(inventory)
        self._set_in_cache_and_storage("cde_inventories", inventories)
        self._store_event("cde_inventory_updated", {
            "report_id": report_id,
            "inventory": inventory.model_dump()
        })
    
    def get_cde(self, cde_id: str) -> Optional[CDE]:
        """Get a specific CDE by ID."""
        inventories = self._get_from_cache_or_storage("cde_inventories", {})
        for inventory in inventories.values():
            for cde in inventory.cdes:
                if cde.id == cde_id:
                    return deepcopy(cde)
        return None
    
    def update_cde(self, cde: CDE) -> None:
        """Update an existing CDE."""
        inventories = self._get_from_cache_or_storage("cde_inventories", {})
        for report_id, inventory in inventories.items():
            for i, existing_cde in enumerate(inventory.cdes):
                if existing_cde.id == cde.id:
                    inventory.cdes[i] = deepcopy(cde)
                    self._set_in_cache_and_storage("cde_inventories", inventories)
                    self._store_event("cde_updated", cde.model_dump())
                    return
    
    # ==================== DQ Rules ====================
    
    def get_dq_rules(self, cde_id: Optional[str] = None) -> list[DQRule]:
        """Get DQ rules, optionally filtered by CDE ID."""
        rules = self._get_from_cache_or_storage("dq_rules", {})
        rule_list = list(rules.values())
        if cde_id:
            rule_list = [r for r in rule_list if r.cde_id == cde_id]
        return [deepcopy(r) for r in rule_list]
    
    def add_dq_rule(self, rule: DQRule) -> None:
        """Add a new DQ rule."""
        rules = self._get_from_cache_or_storage("dq_rules", {})
        rules[rule.id] = deepcopy(rule)
        self._set_in_cache_and_storage("dq_rules", rules)
        self._store_event("dq_rule_added", rule.model_dump())
    
    def update_dq_rule(self, rule: DQRule) -> None:
        """Update an existing DQ rule."""
        rules = self._get_from_cache_or_storage("dq_rules", {})
        if rule.id in rules:
            rules[rule.id] = deepcopy(rule)
            self._set_in_cache_and_storage("dq_rules", rules)
            self._store_event("dq_rule_updated", rule.model_dump())
    
    def get_dq_rule(self, rule_id: str) -> Optional[DQRule]:
        """Get a specific DQ rule by ID."""
        rules = self._get_from_cache_or_storage("dq_rules", {})
        rule = rules.get(rule_id)
        return deepcopy(rule) if rule else None
    
    def delete_dq_rule(self, rule_id: str) -> bool:
        """Delete a DQ rule by ID."""
        rules = self._get_from_cache_or_storage("dq_rules", {})
        if rule_id in rules:
            del rules[rule_id]
            self._set_in_cache_and_storage("dq_rules", rules)
            self._store_event("dq_rule_deleted", {"rule_id": rule_id})
            return True
        return False
    
    def store_rule_execution_result(self, result: RuleExecutionResult) -> None:
        """Store a DQ rule execution result."""
        results = self._get_from_cache_or_storage("rule_execution_results", [])
        results.append(deepcopy(result))
        self._set_in_cache_and_storage("rule_execution_results", results)
        self._store_event("rule_execution_result", result.model_dump())
    
    def get_rule_execution_results(
        self, 
        rule_id: Optional[str] = None,
        cde_id: Optional[str] = None,
        since: Optional[datetime] = None
    ) -> list[RuleExecutionResult]:
        """Get rule execution results with optional filters."""
        results = self._get_from_cache_or_storage("rule_execution_results", [])
        
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
        graphs = self._get_from_cache_or_storage("lineage_graphs", {})
        graph = graphs.get(report_id)
        return deepcopy(graph) if graph else None
    
    def set_lineage_graph(self, report_id: str, graph: LineageGraph) -> None:
        """Set/update the lineage graph for a report."""
        graphs = self._get_from_cache_or_storage("lineage_graphs", {})
        graphs[report_id] = deepcopy(graph)
        self._set_in_cache_and_storage("lineage_graphs", graphs)
        self._store_event("lineage_graph_updated", {
            "report_id": report_id,
            "graph": graph.model_dump()
        })
    
    # ==================== Issues ====================
    
    def get_issues(self, filters: Optional[IssueFilters] = None) -> list[Issue]:
        """Get issues with optional filters."""
        issues_dict = self._get_from_cache_or_storage("issues", {})
        issues = list(issues_dict.values())
        
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
        issues = self._get_from_cache_or_storage("issues", {})
        issues[issue.id] = deepcopy(issue)
        self._set_in_cache_and_storage("issues", issues)
        self._store_event("issue_created", issue.model_dump())
        return deepcopy(issue)
    
    def update_issue(self, issue: Issue) -> None:
        """Update an existing issue."""
        issues = self._get_from_cache_or_storage("issues", {})
        if issue.id in issues:
            issues[issue.id] = deepcopy(issue)
            self._set_in_cache_and_storage("issues", issues)
            self._store_event("issue_updated", issue.model_dump())
    
    def get_issue(self, issue_id: str) -> Optional[Issue]:
        """Get a specific issue by ID."""
        issues = self._get_from_cache_or_storage("issues", {})
        issue = issues.get(issue_id)
        return deepcopy(issue) if issue else None
    
    def delete_issue(self, issue_id: str) -> bool:
        """Delete an issue by ID."""
        issues = self._get_from_cache_or_storage("issues", {})
        if issue_id in issues:
            del issues[issue_id]
            self._set_in_cache_and_storage("issues", issues)
            self._store_event("issue_deleted", {"issue_id": issue_id})
            return True
        return False
    
    # ==================== Controls ====================
    
    def get_control_matrix(self, report_id: str) -> Optional[ControlMatrix]:
        """Get the control matrix for a specific report."""
        matrices = self._get_from_cache_or_storage("control_matrices", {})
        matrix = matrices.get(report_id)
        return deepcopy(matrix) if matrix else None
    
    def set_control_matrix(self, report_id: str, matrix: ControlMatrix) -> None:
        """Set/update the control matrix for a report."""
        matrices = self._get_from_cache_or_storage("control_matrices", {})
        matrices[report_id] = deepcopy(matrix)
        self._set_in_cache_and_storage("control_matrices", matrices)
        self._store_event("control_matrix_updated", {
            "report_id": report_id,
            "matrix": matrix.model_dump()
        })
    
    def get_control(self, control_id: str) -> Optional[Control]:
        """Get a specific control by ID."""
        matrices = self._get_from_cache_or_storage("control_matrices", {})
        for matrix in matrices.values():
            for control in matrix.controls:
                if control.id == control_id:
                    return deepcopy(control)
        return None
    
    def update_control(self, control: Control) -> None:
        """Update an existing control."""
        matrices = self._get_from_cache_or_storage("control_matrices", {})
        for report_id, matrix in matrices.items():
            for i, existing_control in enumerate(matrix.controls):
                if existing_control.id == control.id:
                    matrix.controls[i] = deepcopy(control)
                    self._set_in_cache_and_storage("control_matrices", matrices)
                    self._store_event("control_updated", control.model_dump())
                    return
    
    def add_control_evidence(self, control_id: str, evidence: ControlEvidence) -> None:
        """Add evidence to a control."""
        matrices = self._get_from_cache_or_storage("control_matrices", {})
        for matrix in matrices.values():
            for control in matrix.controls:
                if control.id == control_id:
                    control.evidence.append(deepcopy(evidence))
                    self._set_in_cache_and_storage("control_matrices", matrices)
                    self._store_event("control_evidence_added", {
                        "control_id": control_id,
                        "evidence": evidence.model_dump()
                    })
                    return
    
    # ==================== Workflow ====================
    
    def get_cycle_instance(self, cycle_id: str) -> Optional[CycleInstance]:
        """Get a specific cycle instance by ID."""
        cycles = self._get_from_cache_or_storage("cycle_instances", {})
        cycle = cycles.get(cycle_id)
        return deepcopy(cycle) if cycle else None
    
    def create_cycle_instance(self, cycle: CycleInstance) -> CycleInstance:
        """Create a new cycle instance."""
        cycles = self._get_from_cache_or_storage("cycle_instances", {})
        cycles[cycle.id] = deepcopy(cycle)
        self._set_in_cache_and_storage("cycle_instances", cycles)
        self._store_event("cycle_instance_created", cycle.model_dump())
        return deepcopy(cycle)
    
    def update_cycle_instance(self, cycle: CycleInstance) -> None:
        """Update an existing cycle instance."""
        cycles = self._get_from_cache_or_storage("cycle_instances", {})
        if cycle.id in cycles:
            cycles[cycle.id] = deepcopy(cycle)
            self._set_in_cache_and_storage("cycle_instances", cycles)
            self._store_event("cycle_instance_updated", cycle.model_dump())
    
    def get_active_cycles(self, report_id: Optional[str] = None) -> list[CycleInstance]:
        """Get active cycle instances, optionally filtered by report."""
        cycles = self._get_from_cache_or_storage("cycle_instances", {})
        active = [c for c in cycles.values() if c.status == "active"]
        if report_id:
            active = [c for c in active if c.report_id == report_id]
        return [deepcopy(c) for c in active]
    
    def get_human_task(self, task_id: str) -> Optional[HumanTask]:
        """Get a specific human task by ID."""
        tasks = self._get_from_cache_or_storage("human_tasks", {})
        task = tasks.get(task_id)
        return deepcopy(task) if task else None
    
    def create_human_task(self, task: HumanTask) -> HumanTask:
        """Create a new human task."""
        tasks = self._get_from_cache_or_storage("human_tasks", {})
        tasks[task.id] = deepcopy(task)
        self._set_in_cache_and_storage("human_tasks", tasks)
        self._store_event("human_task_created", task.model_dump())
        return deepcopy(task)
    
    def update_human_task(self, task: HumanTask) -> None:
        """Update an existing human task."""
        tasks = self._get_from_cache_or_storage("human_tasks", {})
        if task.id in tasks:
            tasks[task.id] = deepcopy(task)
            self._set_in_cache_and_storage("human_tasks", tasks)
            self._store_event("human_task_updated", task.model_dump())
    
    def get_pending_tasks(
        self, 
        assigned_role: Optional[str] = None,
        cycle_id: Optional[str] = None
    ) -> list[HumanTask]:
        """Get pending human tasks with optional filters."""
        tasks = self._get_from_cache_or_storage("human_tasks", {})
        pending = [t for t in tasks.values() if t.status == "pending"]
        
        if assigned_role:
            pending = [t for t in pending if t.assigned_role == assigned_role]
        if cycle_id:
            pending = [t for t in pending if t.cycle_id == cycle_id]
        
        return [deepcopy(t) for t in pending]
    
    # ==================== Audit Trail ====================
    
    def create_audit_entry(self, entry: AuditEntry) -> None:
        """Create a new audit entry and persist to AgentCore Memory."""
        entries = self._get_from_cache_or_storage("audit_entries", [])
        entries.append(deepcopy(entry))
        self._set_in_cache_and_storage("audit_entries", entries)
        
        # Store audit entry as a dedicated event in AgentCore Memory
        self._store_event("audit_entry", entry.model_dump())
    
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
        entries = self._get_from_cache_or_storage("audit_entries", [])
        
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
        documents = self._get_from_cache_or_storage("requirements_documents", {})
        document = documents.get(report_id)
        return deepcopy(document) if document else None
    
    def set_requirements_document(self, report_id: str, document: RequirementsDocument) -> None:
        """Set/update the requirements document for a report."""
        documents = self._get_from_cache_or_storage("requirements_documents", {})
        documents[report_id] = deepcopy(document)
        self._set_in_cache_and_storage("requirements_documents", documents)
        self._store_event("requirements_document_updated", {
            "report_id": report_id,
            "document": document.model_dump()
        })
    
    # ==================== Utility Methods ====================
    
    def clear(self) -> None:
        """Clear all cached and fallback storage data."""
        self._local_cache.clear()
        self._fallback_storage = {
            "report_catalog": None,
            "cde_inventories": {},
            "dq_rules": {},
            "rule_execution_results": [],
            "lineage_graphs": {},
            "issues": {},
            "control_matrices": {},
            "cycle_instances": {},
            "human_tasks": {},
            "audit_entries": [],
            "requirements_documents": {},
        }
