"""
Abstract base class for governance data persistence.

This module defines the GovernanceRepository interface that all
repository implementations must follow.
"""
from abc import ABC, abstractmethod
from typing import Optional
from datetime import datetime

from models.regulatory import ReportCatalog, RegulatoryReport
from models.cde import CDEInventory, CDE
from models.data_quality import DQRule, RuleExecutionResult
from models.lineage import LineageGraph
from models.issues import Issue, IssueFilters
from models.controls import ControlMatrix, Control, ControlEvidence
from models.workflow import CycleInstance, HumanTask
from models.audit import AuditEntry, CreateAuditEntryParams
from models.data_elements import RequirementsDocument


class GovernanceRepository(ABC):
    """
    Abstract base class for governance data persistence.
    
    All repository implementations must implement these methods to provide
    consistent data access across different storage backends.
    """
    
    # ==================== Report Catalog ====================
    
    @abstractmethod
    def get_report_catalog(self) -> Optional[ReportCatalog]:
        """
        Get the current regulatory report catalog.
        
        Returns:
            The current report catalog, or None if not initialized.
        """
        ...
    
    @abstractmethod
    def set_report_catalog(self, catalog: ReportCatalog) -> None:
        """
        Set/update the regulatory report catalog.
        
        Args:
            catalog: The report catalog to store.
        """
        ...
    
    @abstractmethod
    def get_report(self, report_id: str) -> Optional[RegulatoryReport]:
        """
        Get a specific regulatory report by ID.
        
        Args:
            report_id: The unique identifier of the report.
            
        Returns:
            The report if found, None otherwise.
        """
        ...
    
    # ==================== CDE Inventory ====================
    
    @abstractmethod
    def get_cde_inventory(self, report_id: str) -> Optional[CDEInventory]:
        """
        Get the CDE inventory for a specific report.
        
        Args:
            report_id: The report ID to get inventory for.
            
        Returns:
            The CDE inventory if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def set_cde_inventory(self, report_id: str, inventory: CDEInventory) -> None:
        """
        Set/update the CDE inventory for a report.
        
        Args:
            report_id: The report ID to associate the inventory with.
            inventory: The CDE inventory to store.
        """
        ...
    
    @abstractmethod
    def get_cde(self, cde_id: str) -> Optional[CDE]:
        """
        Get a specific CDE by ID.
        
        Args:
            cde_id: The unique identifier of the CDE.
            
        Returns:
            The CDE if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def update_cde(self, cde: CDE) -> None:
        """
        Update an existing CDE.
        
        Args:
            cde: The CDE with updated values.
        """
        ...
    
    # ==================== DQ Rules ====================
    
    @abstractmethod
    def get_dq_rules(self, cde_id: Optional[str] = None) -> list[DQRule]:
        """
        Get DQ rules, optionally filtered by CDE ID.
        
        Args:
            cde_id: Optional CDE ID to filter rules by.
            
        Returns:
            List of DQ rules matching the filter.
        """
        ...
    
    @abstractmethod
    def add_dq_rule(self, rule: DQRule) -> None:
        """
        Add a new DQ rule.
        
        Args:
            rule: The DQ rule to add.
        """
        ...
    
    @abstractmethod
    def update_dq_rule(self, rule: DQRule) -> None:
        """
        Update an existing DQ rule.
        
        Args:
            rule: The DQ rule with updated values.
        """
        ...
    
    @abstractmethod
    def get_dq_rule(self, rule_id: str) -> Optional[DQRule]:
        """
        Get a specific DQ rule by ID.
        
        Args:
            rule_id: The unique identifier of the rule.
            
        Returns:
            The DQ rule if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def delete_dq_rule(self, rule_id: str) -> bool:
        """
        Delete a DQ rule by ID.
        
        Args:
            rule_id: The unique identifier of the rule to delete.
            
        Returns:
            True if deleted, False if not found.
        """
        ...
    
    @abstractmethod
    def store_rule_execution_result(self, result: RuleExecutionResult) -> None:
        """
        Store a DQ rule execution result.
        
        Args:
            result: The execution result to store.
        """
        ...
    
    @abstractmethod
    def get_rule_execution_results(
        self, 
        rule_id: Optional[str] = None,
        cde_id: Optional[str] = None,
        since: Optional[datetime] = None
    ) -> list[RuleExecutionResult]:
        """
        Get rule execution results with optional filters.
        
        Args:
            rule_id: Optional rule ID to filter by.
            cde_id: Optional CDE ID to filter by.
            since: Optional datetime to filter results after.
            
        Returns:
            List of execution results matching filters.
        """
        ...
    
    # ==================== Lineage ====================
    
    @abstractmethod
    def get_lineage_graph(self, report_id: str) -> Optional[LineageGraph]:
        """
        Get the lineage graph for a specific report.
        
        Args:
            report_id: The report ID to get lineage for.
            
        Returns:
            The lineage graph if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def set_lineage_graph(self, report_id: str, graph: LineageGraph) -> None:
        """
        Set/update the lineage graph for a report.
        
        Args:
            report_id: The report ID to associate the graph with.
            graph: The lineage graph to store.
        """
        ...
    
    # ==================== Issues ====================
    
    @abstractmethod
    def get_issues(self, filters: Optional[IssueFilters] = None) -> list[Issue]:
        """
        Get issues with optional filters.
        
        Args:
            filters: Optional filters to apply.
            
        Returns:
            List of issues matching the filters.
        """
        ...
    
    @abstractmethod
    def create_issue(self, issue: Issue) -> Issue:
        """
        Create a new issue.
        
        Args:
            issue: The issue to create.
            
        Returns:
            The created issue with any generated fields.
        """
        ...
    
    @abstractmethod
    def update_issue(self, issue: Issue) -> None:
        """
        Update an existing issue.
        
        Args:
            issue: The issue with updated values.
        """
        ...
    
    @abstractmethod
    def get_issue(self, issue_id: str) -> Optional[Issue]:
        """
        Get a specific issue by ID.
        
        Args:
            issue_id: The unique identifier of the issue.
            
        Returns:
            The issue if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def delete_issue(self, issue_id: str) -> bool:
        """
        Delete an issue by ID.
        
        Args:
            issue_id: The unique identifier of the issue to delete.
            
        Returns:
            True if deleted, False if not found.
        """
        ...
    
    # ==================== Controls ====================
    
    @abstractmethod
    def get_control_matrix(self, report_id: str) -> Optional[ControlMatrix]:
        """
        Get the control matrix for a specific report.
        
        Args:
            report_id: The report ID to get controls for.
            
        Returns:
            The control matrix if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def set_control_matrix(self, report_id: str, matrix: ControlMatrix) -> None:
        """
        Set/update the control matrix for a report.
        
        Args:
            report_id: The report ID to associate the matrix with.
            matrix: The control matrix to store.
        """
        ...
    
    @abstractmethod
    def get_control(self, control_id: str) -> Optional[Control]:
        """
        Get a specific control by ID.
        
        Args:
            control_id: The unique identifier of the control.
            
        Returns:
            The control if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def update_control(self, control: Control) -> None:
        """
        Update an existing control.
        
        Args:
            control: The control with updated values.
        """
        ...
    
    @abstractmethod
    def add_control_evidence(self, control_id: str, evidence: ControlEvidence) -> None:
        """
        Add evidence to a control.
        
        Args:
            control_id: The control ID to add evidence to.
            evidence: The evidence to add.
        """
        ...
    
    # ==================== Workflow ====================
    
    @abstractmethod
    def get_cycle_instance(self, cycle_id: str) -> Optional[CycleInstance]:
        """
        Get a specific cycle instance by ID.
        
        Args:
            cycle_id: The unique identifier of the cycle.
            
        Returns:
            The cycle instance if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def create_cycle_instance(self, cycle: CycleInstance) -> CycleInstance:
        """
        Create a new cycle instance.
        
        Args:
            cycle: The cycle instance to create.
            
        Returns:
            The created cycle instance.
        """
        ...
    
    @abstractmethod
    def update_cycle_instance(self, cycle: CycleInstance) -> None:
        """
        Update an existing cycle instance.
        
        Args:
            cycle: The cycle instance with updated values.
        """
        ...
    
    @abstractmethod
    def get_active_cycles(self, report_id: Optional[str] = None) -> list[CycleInstance]:
        """
        Get active cycle instances, optionally filtered by report.
        
        Args:
            report_id: Optional report ID to filter by.
            
        Returns:
            List of active cycle instances.
        """
        ...
    
    @abstractmethod
    def get_human_task(self, task_id: str) -> Optional[HumanTask]:
        """
        Get a specific human task by ID.
        
        Args:
            task_id: The unique identifier of the task.
            
        Returns:
            The human task if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def create_human_task(self, task: HumanTask) -> HumanTask:
        """
        Create a new human task.
        
        Args:
            task: The human task to create.
            
        Returns:
            The created human task.
        """
        ...
    
    @abstractmethod
    def update_human_task(self, task: HumanTask) -> None:
        """
        Update an existing human task.
        
        Args:
            task: The human task with updated values.
        """
        ...
    
    @abstractmethod
    def get_pending_tasks(
        self, 
        assigned_role: Optional[str] = None,
        cycle_id: Optional[str] = None
    ) -> list[HumanTask]:
        """
        Get pending human tasks with optional filters.
        
        Args:
            assigned_role: Optional role to filter by.
            cycle_id: Optional cycle ID to filter by.
            
        Returns:
            List of pending human tasks.
        """
        ...
    
    # ==================== Audit Trail ====================
    
    @abstractmethod
    def create_audit_entry(self, entry: AuditEntry) -> None:
        """
        Create a new audit entry.
        
        This method automatically captures timestamp if not provided.
        
        Args:
            entry: The audit entry to create.
        """
        ...
    
    @abstractmethod
    def create_audit_entry_from_params(self, params: CreateAuditEntryParams) -> AuditEntry:
        """
        Create an audit entry from parameters.
        
        This is a convenience method that creates an AuditEntry from
        the provided parameters and stores it. Timestamp is automatically
        set to the current time.
        
        Args:
            params: The parameters for creating the audit entry.
            
        Returns:
            The created audit entry.
        """
        ...
    
    @abstractmethod
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
        """
        Get audit entries with optional filters.
        
        Args:
            entity_type: Optional entity type to filter by.
            entity_id: Optional entity ID to filter by.
            actor: Optional actor to filter by.
            action: Optional action to filter by.
            since: Optional datetime to filter entries after.
            until: Optional datetime to filter entries before.
            limit: Optional maximum number of entries to return.
            
        Returns:
            List of audit entries matching the filters.
        """
        ...
    
    # ==================== Requirements Documents ====================
    
    @abstractmethod
    def get_requirements_document(self, report_id: str) -> Optional[RequirementsDocument]:
        """
        Get the requirements document for a specific report.
        
        Args:
            report_id: The report ID to get requirements for.
            
        Returns:
            The requirements document if found, None otherwise.
        """
        ...
    
    @abstractmethod
    def set_requirements_document(self, report_id: str, document: RequirementsDocument) -> None:
        """
        Set/update the requirements document for a report.
        
        Args:
            report_id: The report ID to associate the document with.
            document: The requirements document to store.
        """
        ...
