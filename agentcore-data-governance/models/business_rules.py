"""
Business Rules Engine data models.

Provides configurable business rules for governance logic without code changes.
Supports condition-action pairs, rule priorities, rule groups, versioning, and testing.
"""

from datetime import datetime
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
from uuid import uuid4


# Type definitions
RuleStatus = Literal["active", "inactive", "draft", "archived"]
ConditionOperator = Literal[
    "equals", "not_equals", "greater_than", "less_than", 
    "greater_than_or_equals", "less_than_or_equals",
    "contains", "not_contains", "starts_with", "ends_with",
    "in", "not_in", "is_null", "is_not_null",
    "matches_regex", "between"
]
LogicalOperator = Literal["and", "or"]
ActionType = Literal[
    "set_value", "escalate", "notify", "create_issue",
    "update_status", "assign_owner", "trigger_workflow",
    "log_event", "block_action", "approve_auto"
]
RuleCategory = Literal[
    "cde_scoring", "escalation", "sla", "threshold",
    "validation", "routing", "notification", "approval"
]
SimulationStatus = Literal["pending", "running", "completed", "failed"]


class Condition(BaseModel):
    """A single condition in a business rule."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    field: str = Field(..., description="The field to evaluate")
    operator: ConditionOperator = Field(..., description="Comparison operator")
    value: Any = Field(..., description="Value to compare against")
    value_type: Literal["string", "number", "boolean", "date", "list"] = Field(
        default="string", description="Type of the value for proper comparison"
    )
    
    def evaluate(self, context: dict[str, Any]) -> bool:
        """Evaluate this condition against a context."""
        field_value = self._get_nested_value(context, self.field)
        return self._compare(field_value, self.operator, self.value)
    
    def _get_nested_value(self, obj: dict[str, Any], path: str) -> Any:
        """Get a nested value from a dict using dot notation."""
        keys = path.split(".")
        value = obj
        for key in keys:
            if isinstance(value, dict):
                value = value.get(key)
            else:
                return None
        return value
    
    def _compare(self, field_value: Any, operator: ConditionOperator, target: Any) -> bool:
        """Compare field value against target using operator."""
        if operator == "equals":
            return field_value == target
        elif operator == "not_equals":
            return field_value != target
        elif operator == "greater_than":
            return field_value is not None and field_value > target
        elif operator == "less_than":
            return field_value is not None and field_value < target
        elif operator == "greater_than_or_equals":
            return field_value is not None and field_value >= target
        elif operator == "less_than_or_equals":
            return field_value is not None and field_value <= target
        elif operator == "contains":
            return target in field_value if field_value else False
        elif operator == "not_contains":
            return target not in field_value if field_value else True
        elif operator == "starts_with":
            return str(field_value).startswith(str(target)) if field_value else False
        elif operator == "ends_with":
            return str(field_value).endswith(str(target)) if field_value else False
        elif operator == "in":
            return field_value in target if isinstance(target, list) else False
        elif operator == "not_in":
            return field_value not in target if isinstance(target, list) else True
        elif operator == "is_null":
            return field_value is None
        elif operator == "is_not_null":
            return field_value is not None
        elif operator == "matches_regex":
            import re
            return bool(re.match(str(target), str(field_value))) if field_value else False
        elif operator == "between":
            if isinstance(target, list) and len(target) == 2:
                return target[0] <= field_value <= target[1] if field_value is not None else False
            return False
        return False


class ConditionGroup(BaseModel):
    """A group of conditions combined with a logical operator."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    conditions: list[Condition] = Field(default_factory=list)
    nested_groups: list["ConditionGroup"] = Field(default_factory=list)
    logical_operator: LogicalOperator = Field(default="and")
    
    def evaluate(self, context: dict[str, Any]) -> bool:
        """Evaluate all conditions in this group."""
        results: list[bool] = []
        
        # Evaluate direct conditions
        for condition in self.conditions:
            results.append(condition.evaluate(context))
        
        # Evaluate nested groups
        for group in self.nested_groups:
            results.append(group.evaluate(context))
        
        if not results:
            return True  # Empty group evaluates to True
        
        if self.logical_operator == "and":
            return all(results)
        else:  # "or"
            return any(results)


class Action(BaseModel):
    """An action to execute when rule conditions are met."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    action_type: ActionType = Field(..., description="Type of action to perform")
    target_field: Optional[str] = Field(None, description="Field to modify (for set_value)")
    value: Optional[Any] = Field(None, description="Value to set or parameters for action")
    parameters: dict[str, Any] = Field(default_factory=dict, description="Additional parameters")
    
    def execute(self, context: dict[str, Any]) -> dict[str, Any]:
        """Execute this action and return the result."""
        result = {
            "action_id": self.id,
            "action_type": self.action_type,
            "executed": True,
            "changes": {}
        }
        
        if self.action_type == "set_value" and self.target_field:
            result["changes"][self.target_field] = self.value
        elif self.action_type == "escalate":
            result["escalation"] = {
                "level": self.parameters.get("level", 1),
                "reason": self.parameters.get("reason", "Rule triggered escalation")
            }
        elif self.action_type == "notify":
            result["notification"] = {
                "recipients": self.parameters.get("recipients", []),
                "message": self.parameters.get("message", ""),
                "channel": self.parameters.get("channel", "email")
            }
        elif self.action_type == "create_issue":
            result["issue"] = {
                "title": self.parameters.get("title", "Auto-created issue"),
                "severity": self.parameters.get("severity", "medium"),
                "description": self.parameters.get("description", "")
            }
        elif self.action_type == "update_status":
            result["status_update"] = {
                "new_status": self.value,
                "entity_type": self.parameters.get("entity_type"),
                "entity_id": self.parameters.get("entity_id")
            }
        elif self.action_type == "block_action":
            result["blocked"] = True
            result["block_reason"] = self.parameters.get("reason", "Action blocked by rule")
        elif self.action_type == "approve_auto":
            result["auto_approved"] = True
            result["approval_reason"] = self.parameters.get("reason", "Auto-approved by rule")
        
        return result


class BusinessRule(BaseModel):
    """A business rule with conditions and actions."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(..., description="Human-readable rule name")
    description: Optional[str] = Field(None, description="Detailed description")
    category: RuleCategory = Field(..., description="Rule category for grouping")
    priority: int = Field(default=100, ge=1, le=1000, description="Priority (1=highest)")
    status: RuleStatus = Field(default="draft")
    
    # Conditions
    condition_group: ConditionGroup = Field(
        default_factory=ConditionGroup,
        description="Root condition group for this rule"
    )
    
    # Actions
    actions: list[Action] = Field(default_factory=list, description="Actions to execute")
    stop_processing: bool = Field(
        default=False, 
        description="If True, stop processing lower priority rules after this one matches"
    )
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    
    # Versioning
    version: int = Field(default=1)
    effective_from: Optional[datetime] = None
    effective_until: Optional[datetime] = None
    
    # Tenant isolation
    tenant_id: Optional[str] = None
    
    def is_active(self, at_time: Optional[datetime] = None) -> bool:
        """Check if rule is active at the given time."""
        if self.status != "active":
            return False
        
        check_time = at_time or datetime.now()
        
        if self.effective_from and check_time < self.effective_from:
            return False
        if self.effective_until and check_time > self.effective_until:
            return False
        
        return True
    
    def evaluate(self, context: dict[str, Any]) -> bool:
        """Evaluate if this rule's conditions are met."""
        return self.condition_group.evaluate(context)
    
    def execute_actions(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        """Execute all actions for this rule."""
        return [action.execute(context) for action in self.actions]


class RuleGroup(BaseModel):
    """A group of related business rules."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(..., description="Group name")
    description: Optional[str] = None
    category: RuleCategory = Field(..., description="Category for all rules in group")
    rules: list[str] = Field(default_factory=list, description="Rule IDs in this group")
    enabled: bool = Field(default=True)
    tenant_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class RuleVersion(BaseModel):
    """A historical version of a business rule."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    rule_id: str = Field(..., description="ID of the original rule")
    version: int = Field(..., description="Version number")
    rule_snapshot: dict[str, Any] = Field(..., description="Complete rule state at this version")
    created_at: datetime = Field(default_factory=datetime.now)
    created_by: Optional[str] = None
    change_reason: Optional[str] = None
    
    # Effective dates for this version
    effective_from: datetime = Field(default_factory=datetime.now)
    effective_until: Optional[datetime] = None


class RuleTestCase(BaseModel):
    """A test case for validating a business rule."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    rule_id: str = Field(..., description="Rule being tested")
    name: str = Field(..., description="Test case name")
    description: Optional[str] = None
    
    # Test input
    input_context: dict[str, Any] = Field(..., description="Context to evaluate rule against")
    
    # Expected outcomes
    expected_match: bool = Field(..., description="Whether rule should match")
    expected_actions: list[str] = Field(
        default_factory=list, 
        description="Expected action types to execute"
    )
    
    # Test metadata
    created_at: datetime = Field(default_factory=datetime.now)
    last_run: Optional[datetime] = None
    last_result: Optional[bool] = None


class RuleSimulation(BaseModel):
    """A simulation run for testing rules against sample data."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(..., description="Simulation name")
    description: Optional[str] = None
    
    # Rules to simulate
    rule_ids: list[str] = Field(..., description="Rules to include in simulation")
    
    # Sample data
    sample_contexts: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Sample contexts to evaluate"
    )
    
    # Simulation status
    status: SimulationStatus = Field(default="pending")
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Results
    results: list["SimulationResult"] = Field(default_factory=list)
    
    # Metadata
    created_at: datetime = Field(default_factory=datetime.now)
    created_by: Optional[str] = None
    tenant_id: Optional[str] = None


class SimulationResult(BaseModel):
    """Result of evaluating a single context in a simulation."""
    context_index: int = Field(..., description="Index of the context in sample_contexts")
    matched_rules: list[str] = Field(default_factory=list, description="IDs of rules that matched")
    executed_actions: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Actions that would be executed"
    )
    evaluation_time_ms: float = Field(default=0.0, description="Time to evaluate in milliseconds")


class RuleEvaluationResult(BaseModel):
    """Result of evaluating rules against a context."""
    context_id: Optional[str] = None
    evaluated_at: datetime = Field(default_factory=datetime.now)
    rules_evaluated: int = Field(default=0)
    rules_matched: int = Field(default=0)
    matched_rule_ids: list[str] = Field(default_factory=list)
    actions_executed: list[dict[str, Any]] = Field(default_factory=list)
    processing_stopped: bool = Field(default=False, description="Whether processing was stopped early")
    stopped_by_rule: Optional[str] = Field(None, description="Rule that stopped processing")
    evaluation_time_ms: float = Field(default=0.0)
    errors: list[str] = Field(default_factory=list)


class RuleImpactAnalysis(BaseModel):
    """Analysis of potential impact of rule changes."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    rule_id: str = Field(..., description="Rule being analyzed")
    analysis_type: Literal["add", "modify", "delete", "activate", "deactivate"] = Field(
        ..., description="Type of change being analyzed"
    )
    
    # Sample data used for analysis
    sample_size: int = Field(default=0)
    
    # Impact metrics
    affected_entities: int = Field(default=0, description="Number of entities affected")
    current_matches: int = Field(default=0, description="Current rule matches")
    projected_matches: int = Field(default=0, description="Projected matches after change")
    
    # Detailed breakdown
    new_matches: list[str] = Field(default_factory=list, description="Entity IDs newly matched")
    removed_matches: list[str] = Field(default_factory=list, description="Entity IDs no longer matched")
    
    # Analysis metadata
    analyzed_at: datetime = Field(default_factory=datetime.now)
    analyzed_by: Optional[str] = None


# Threshold configuration models for common use cases
class CDEScoringThreshold(BaseModel):
    """Threshold configuration for CDE scoring rules."""
    min_score: float = Field(default=0.0, ge=0.0, le=1.0)
    max_score: float = Field(default=1.0, ge=0.0, le=1.0)
    classification: str = Field(..., description="Classification when score is in range")
    auto_approve: bool = Field(default=False)


class EscalationThreshold(BaseModel):
    """Threshold configuration for escalation rules."""
    trigger_field: str = Field(..., description="Field to monitor")
    threshold_value: Any = Field(..., description="Value that triggers escalation")
    escalation_level: int = Field(default=1, ge=1, le=5)
    notify_roles: list[str] = Field(default_factory=list)
    sla_hours: Optional[int] = None


class SLADefinition(BaseModel):
    """SLA definition for time-based rules."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str = Field(..., description="SLA name")
    entity_type: str = Field(..., description="Type of entity this SLA applies to")
    
    # Time thresholds
    warning_hours: int = Field(..., description="Hours before warning")
    critical_hours: int = Field(..., description="Hours before critical")
    breach_hours: int = Field(..., description="Hours before breach")
    
    # Actions at each threshold
    warning_actions: list[str] = Field(default_factory=list)
    critical_actions: list[str] = Field(default_factory=list)
    breach_actions: list[str] = Field(default_factory=list)
    
    # Conditions for SLA to apply
    applies_when: Optional[ConditionGroup] = None
    
    # Business hours configuration
    business_hours_only: bool = Field(default=False)
    timezone: str = Field(default="UTC")


# Update forward references
ConditionGroup.model_rebuild()
RuleSimulation.model_rebuild()
