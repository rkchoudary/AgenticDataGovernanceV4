"""
Business Rules Engine service.

Provides rule evaluation with priority-ordered processing and short-circuit evaluation.
Supports rule versioning, testing, and simulation.
"""

import time
from datetime import datetime
from typing import Any, Optional
from copy import deepcopy

from models.business_rules import (
    BusinessRule,
    RuleGroup,
    RuleVersion,
    RuleTestCase,
    RuleSimulation,
    SimulationResult,
    RuleEvaluationResult,
    RuleImpactAnalysis,
    RuleStatus,
    SimulationStatus,
)
from models.audit import AuditEntry, ActorType
from repository.base import GovernanceRepository


class BusinessRulesEngine:
    """
    Engine for evaluating and managing business rules.
    
    Features:
    - Priority-ordered rule processing (lower priority number = higher priority)
    - Short-circuit evaluation (stop processing when stop_processing flag is set)
    - Rule versioning with rollback capability
    - Simulation mode for testing rule changes
    - Impact analysis for rule modifications
    """
    
    def __init__(self, repository: GovernanceRepository, tenant_id: Optional[str] = None):
        self.repository = repository
        self.tenant_id = tenant_id
        self._rules_cache: dict[str, BusinessRule] = {}
        self._groups_cache: dict[str, RuleGroup] = {}
        self._versions_cache: dict[str, list[RuleVersion]] = {}
    
    # ==================== Rule Management ====================
    
    def add_rule(self, rule: BusinessRule, created_by: Optional[str] = None) -> BusinessRule:
        """Add a new business rule."""
        rule.tenant_id = self.tenant_id
        rule.created_by = created_by
        rule.created_at = datetime.now()
        rule.updated_at = datetime.now()
        rule.version = 1
        
        self._rules_cache[rule.id] = rule
        
        # Create initial version
        self._create_version(rule, created_by, "Initial creation")
        
        # Audit
        self._create_audit_entry(
            actor=created_by or "system",
            action="create_rule",
            entity_type="BusinessRule",
            entity_id=rule.id,
            new_state=rule.model_dump()
        )
        
        return rule
    
    def update_rule(
        self, 
        rule_id: str, 
        updates: dict[str, Any],
        updated_by: Optional[str] = None,
        change_reason: Optional[str] = None
    ) -> BusinessRule:
        """Update an existing rule and create a new version."""
        rule = self.get_rule(rule_id)
        if not rule:
            raise ValueError(f"Rule {rule_id} not found")
        
        previous_state = rule.model_dump()
        
        # Apply updates
        for key, value in updates.items():
            if hasattr(rule, key):
                setattr(rule, key, value)
        
        rule.updated_at = datetime.now()
        rule.updated_by = updated_by
        rule.version += 1
        
        self._rules_cache[rule_id] = rule
        
        # Create new version
        self._create_version(rule, updated_by, change_reason)
        
        # Audit
        self._create_audit_entry(
            actor=updated_by or "system",
            action="update_rule",
            entity_type="BusinessRule",
            entity_id=rule_id,
            previous_state=previous_state,
            new_state=rule.model_dump(),
            rationale=change_reason
        )
        
        return rule
    
    def delete_rule(self, rule_id: str, deleted_by: Optional[str] = None) -> bool:
        """Delete (archive) a rule."""
        rule = self.get_rule(rule_id)
        if not rule:
            return False
        
        previous_state = rule.model_dump()
        rule.status = "archived"
        rule.updated_at = datetime.now()
        rule.updated_by = deleted_by
        
        self._rules_cache[rule_id] = rule
        
        self._create_audit_entry(
            actor=deleted_by or "system",
            action="delete_rule",
            entity_type="BusinessRule",
            entity_id=rule_id,
            previous_state=previous_state,
            new_state=rule.model_dump()
        )
        
        return True
    
    def get_rule(self, rule_id: str) -> Optional[BusinessRule]:
        """Get a rule by ID."""
        return self._rules_cache.get(rule_id)
    
    def get_rules(
        self,
        category: Optional[str] = None,
        status: Optional[RuleStatus] = None,
        active_only: bool = False
    ) -> list[BusinessRule]:
        """Get rules with optional filtering."""
        rules = list(self._rules_cache.values())
        
        # Filter by tenant
        if self.tenant_id:
            rules = [r for r in rules if r.tenant_id == self.tenant_id]
        
        # Filter by category
        if category:
            rules = [r for r in rules if r.category == category]
        
        # Filter by status
        if status:
            rules = [r for r in rules if r.status == status]
        
        # Filter active only
        if active_only:
            rules = [r for r in rules if r.is_active()]
        
        return rules

    
    # ==================== Rule Evaluation ====================
    
    def evaluate(
        self,
        context: dict[str, Any],
        category: Optional[str] = None,
        rule_ids: Optional[list[str]] = None,
        simulation_mode: bool = False
    ) -> RuleEvaluationResult:
        """
        Evaluate rules against a context.
        
        Rules are processed in priority order (lower number = higher priority).
        Processing stops when a matching rule has stop_processing=True.
        
        Args:
            context: The data context to evaluate rules against
            category: Optional category to filter rules
            rule_ids: Optional specific rule IDs to evaluate
            simulation_mode: If True, don't execute actions, just evaluate
            
        Returns:
            RuleEvaluationResult with matched rules and executed actions
        """
        start_time = time.time()
        result = RuleEvaluationResult(
            context_id=context.get("id"),
            evaluated_at=datetime.now()
        )
        
        # Get applicable rules
        if rule_ids:
            rules = [self.get_rule(rid) for rid in rule_ids if self.get_rule(rid)]
        else:
            rules = self.get_rules(category=category, active_only=True)
        
        # Sort by priority (lower number = higher priority)
        rules = sorted(rules, key=lambda r: r.priority)
        
        result.rules_evaluated = len(rules)
        
        # Evaluate each rule in priority order
        for rule in rules:
            try:
                if rule.evaluate(context):
                    result.rules_matched += 1
                    result.matched_rule_ids.append(rule.id)
                    
                    # Execute actions (unless in simulation mode)
                    if not simulation_mode:
                        action_results = rule.execute_actions(context)
                        result.actions_executed.extend(action_results)
                    else:
                        # In simulation mode, record what would happen
                        for action in rule.actions:
                            result.actions_executed.append({
                                "action_id": action.id,
                                "action_type": action.action_type,
                                "simulated": True,
                                "rule_id": rule.id
                            })
                    
                    # Short-circuit: stop processing if rule says so
                    if rule.stop_processing:
                        result.processing_stopped = True
                        result.stopped_by_rule = rule.id
                        break
                        
            except Exception as e:
                result.errors.append(f"Error evaluating rule {rule.id}: {str(e)}")
        
        result.evaluation_time_ms = (time.time() - start_time) * 1000
        
        # Audit the evaluation (unless in simulation mode)
        if not simulation_mode and result.rules_matched > 0:
            self._create_audit_entry(
                actor="BusinessRulesEngine",
                actor_type="system",
                action="evaluate_rules",
                entity_type="RuleEvaluation",
                entity_id=result.context_id or "unknown",
                new_state={
                    "rules_evaluated": result.rules_evaluated,
                    "rules_matched": result.rules_matched,
                    "matched_rule_ids": result.matched_rule_ids,
                    "processing_stopped": result.processing_stopped
                }
            )
        
        return result
    
    def evaluate_single_rule(
        self,
        rule_id: str,
        context: dict[str, Any]
    ) -> tuple[bool, list[dict[str, Any]]]:
        """
        Evaluate a single rule against a context.
        
        Returns:
            Tuple of (matched: bool, action_results: list)
        """
        rule = self.get_rule(rule_id)
        if not rule:
            raise ValueError(f"Rule {rule_id} not found")
        
        matched = rule.evaluate(context)
        action_results = []
        
        if matched:
            action_results = rule.execute_actions(context)
        
        return matched, action_results
    
    # ==================== Rule Groups ====================
    
    def create_group(self, group: RuleGroup, created_by: Optional[str] = None) -> RuleGroup:
        """Create a new rule group."""
        group.tenant_id = self.tenant_id
        group.created_at = datetime.now()
        group.updated_at = datetime.now()
        
        self._groups_cache[group.id] = group
        
        self._create_audit_entry(
            actor=created_by or "system",
            action="create_rule_group",
            entity_type="RuleGroup",
            entity_id=group.id,
            new_state=group.model_dump()
        )
        
        return group
    
    def add_rule_to_group(self, group_id: str, rule_id: str) -> RuleGroup:
        """Add a rule to a group."""
        group = self._groups_cache.get(group_id)
        if not group:
            raise ValueError(f"Group {group_id} not found")
        
        if rule_id not in group.rules:
            group.rules.append(rule_id)
            group.updated_at = datetime.now()
        
        return group
    
    def remove_rule_from_group(self, group_id: str, rule_id: str) -> RuleGroup:
        """Remove a rule from a group."""
        group = self._groups_cache.get(group_id)
        if not group:
            raise ValueError(f"Group {group_id} not found")
        
        if rule_id in group.rules:
            group.rules.remove(rule_id)
            group.updated_at = datetime.now()
        
        return group
    
    def get_group(self, group_id: str) -> Optional[RuleGroup]:
        """Get a rule group by ID."""
        return self._groups_cache.get(group_id)
    
    def evaluate_group(
        self,
        group_id: str,
        context: dict[str, Any],
        simulation_mode: bool = False
    ) -> RuleEvaluationResult:
        """Evaluate all rules in a group."""
        group = self.get_group(group_id)
        if not group:
            raise ValueError(f"Group {group_id} not found")
        
        if not group.enabled:
            return RuleEvaluationResult(
                context_id=context.get("id"),
                errors=["Group is disabled"]
            )
        
        return self.evaluate(
            context=context,
            rule_ids=group.rules,
            simulation_mode=simulation_mode
        )

    
    # ==================== Versioning ====================
    
    def _create_version(
        self,
        rule: BusinessRule,
        created_by: Optional[str] = None,
        change_reason: Optional[str] = None
    ) -> RuleVersion:
        """Create a new version snapshot of a rule."""
        version = RuleVersion(
            rule_id=rule.id,
            version=rule.version,
            rule_snapshot=rule.model_dump(),
            created_at=datetime.now(),
            created_by=created_by,
            change_reason=change_reason,
            effective_from=datetime.now()
        )
        
        # Mark previous version as ended
        if rule.id in self._versions_cache and self._versions_cache[rule.id]:
            prev_version = self._versions_cache[rule.id][-1]
            prev_version.effective_until = datetime.now()
        
        # Store version
        if rule.id not in self._versions_cache:
            self._versions_cache[rule.id] = []
        self._versions_cache[rule.id].append(version)
        
        return version
    
    def get_rule_versions(self, rule_id: str) -> list[RuleVersion]:
        """Get all versions of a rule."""
        return self._versions_cache.get(rule_id, [])
    
    def get_rule_version(self, rule_id: str, version: int) -> Optional[RuleVersion]:
        """Get a specific version of a rule."""
        versions = self._versions_cache.get(rule_id, [])
        for v in versions:
            if v.version == version:
                return v
        return None
    
    def rollback_rule(
        self,
        rule_id: str,
        target_version: int,
        rolled_back_by: Optional[str] = None
    ) -> BusinessRule:
        """
        Rollback a rule to a previous version.
        
        Creates a new version with the old state.
        """
        version = self.get_rule_version(rule_id, target_version)
        if not version:
            raise ValueError(f"Version {target_version} not found for rule {rule_id}")
        
        current_rule = self.get_rule(rule_id)
        if not current_rule:
            raise ValueError(f"Rule {rule_id} not found")
        
        previous_state = current_rule.model_dump()
        
        # Restore from snapshot (but keep current metadata)
        snapshot = version.rule_snapshot
        restored_rule = BusinessRule(**snapshot)
        restored_rule.version = current_rule.version + 1
        restored_rule.updated_at = datetime.now()
        restored_rule.updated_by = rolled_back_by
        
        self._rules_cache[rule_id] = restored_rule
        
        # Create new version
        self._create_version(
            restored_rule,
            rolled_back_by,
            f"Rollback to version {target_version}"
        )
        
        # Audit
        self._create_audit_entry(
            actor=rolled_back_by or "system",
            action="rollback_rule",
            entity_type="BusinessRule",
            entity_id=rule_id,
            previous_state=previous_state,
            new_state=restored_rule.model_dump(),
            rationale=f"Rolled back to version {target_version}"
        )
        
        return restored_rule
    
    def get_rule_at_time(
        self,
        rule_id: str,
        at_time: datetime
    ) -> Optional[dict[str, Any]]:
        """Get the rule state at a specific point in time."""
        versions = self._versions_cache.get(rule_id, [])
        
        for version in reversed(versions):
            if version.effective_from <= at_time:
                if version.effective_until is None or version.effective_until > at_time:
                    return version.rule_snapshot
        
        return None
    
    # ==================== Testing ====================
    
    def create_test_case(self, test_case: RuleTestCase) -> RuleTestCase:
        """Create a test case for a rule."""
        # Verify rule exists
        if not self.get_rule(test_case.rule_id):
            raise ValueError(f"Rule {test_case.rule_id} not found")
        
        test_case.created_at = datetime.now()
        return test_case
    
    def run_test_case(self, test_case: RuleTestCase) -> tuple[bool, dict[str, Any]]:
        """
        Run a test case and return whether it passed.
        
        Returns:
            Tuple of (passed: bool, details: dict)
        """
        rule = self.get_rule(test_case.rule_id)
        if not rule:
            return False, {"error": f"Rule {test_case.rule_id} not found"}
        
        # Evaluate rule
        matched = rule.evaluate(test_case.input_context)
        
        # Check if match expectation is correct
        match_correct = matched == test_case.expected_match
        
        # Check actions if rule matched
        actions_correct = True
        executed_action_types = []
        
        if matched:
            action_results = rule.execute_actions(test_case.input_context)
            executed_action_types = [a.action_type for a in rule.actions]
            
            if test_case.expected_actions:
                actions_correct = set(executed_action_types) == set(test_case.expected_actions)
        
        passed = match_correct and actions_correct
        
        # Update test case
        test_case.last_run = datetime.now()
        test_case.last_result = passed
        
        return passed, {
            "matched": matched,
            "expected_match": test_case.expected_match,
            "match_correct": match_correct,
            "executed_actions": executed_action_types,
            "expected_actions": test_case.expected_actions,
            "actions_correct": actions_correct
        }
    
    def run_all_tests_for_rule(self, rule_id: str, test_cases: list[RuleTestCase]) -> dict[str, Any]:
        """Run all test cases for a rule."""
        results = {
            "rule_id": rule_id,
            "total_tests": len(test_cases),
            "passed": 0,
            "failed": 0,
            "test_results": []
        }
        
        for test_case in test_cases:
            if test_case.rule_id != rule_id:
                continue
            
            passed, details = self.run_test_case(test_case)
            
            if passed:
                results["passed"] += 1
            else:
                results["failed"] += 1
            
            results["test_results"].append({
                "test_id": test_case.id,
                "test_name": test_case.name,
                "passed": passed,
                "details": details
            })
        
        return results
    
    # ==================== Simulation ====================
    
    def run_simulation(self, simulation: RuleSimulation) -> RuleSimulation:
        """
        Run a simulation to test rules against sample data.
        
        Does not execute actions, only evaluates matches.
        """
        simulation.status = "running"
        simulation.started_at = datetime.now()
        simulation.results = []
        
        for idx, context in enumerate(simulation.sample_contexts):
            start_time = time.time()
            
            result = self.evaluate(
                context=context,
                rule_ids=simulation.rule_ids,
                simulation_mode=True
            )
            
            sim_result = SimulationResult(
                context_index=idx,
                matched_rules=result.matched_rule_ids,
                executed_actions=result.actions_executed,
                evaluation_time_ms=(time.time() - start_time) * 1000
            )
            
            simulation.results.append(sim_result)
        
        simulation.status = "completed"
        simulation.completed_at = datetime.now()
        
        return simulation
    
    def analyze_impact(
        self,
        rule_id: str,
        analysis_type: str,
        sample_contexts: list[dict[str, Any]],
        proposed_changes: Optional[dict[str, Any]] = None,
        analyzed_by: Optional[str] = None
    ) -> RuleImpactAnalysis:
        """
        Analyze the impact of a rule change.
        
        Args:
            rule_id: Rule to analyze
            analysis_type: Type of change (add, modify, delete, activate, deactivate)
            sample_contexts: Sample data to test against
            proposed_changes: For 'modify', the proposed changes to apply
            analyzed_by: User performing analysis
        """
        analysis = RuleImpactAnalysis(
            rule_id=rule_id,
            analysis_type=analysis_type,
            sample_size=len(sample_contexts),
            analyzed_at=datetime.now(),
            analyzed_by=analyzed_by
        )
        
        rule = self.get_rule(rule_id)
        
        # Calculate current matches
        current_matches = []
        if rule and rule.is_active():
            for ctx in sample_contexts:
                if rule.evaluate(ctx):
                    current_matches.append(ctx.get("id", str(len(current_matches))))
        
        analysis.current_matches = len(current_matches)
        
        # Calculate projected matches based on change type
        projected_matches = []
        
        if analysis_type == "delete" or analysis_type == "deactivate":
            # No matches after deletion/deactivation
            projected_matches = []
        elif analysis_type == "activate":
            # Same as current if rule exists
            if rule:
                for ctx in sample_contexts:
                    if rule.evaluate(ctx):
                        projected_matches.append(ctx.get("id", str(len(projected_matches))))
        elif analysis_type == "modify" and proposed_changes and rule:
            # Create temporary modified rule
            temp_rule = deepcopy(rule)
            for key, value in proposed_changes.items():
                if hasattr(temp_rule, key):
                    setattr(temp_rule, key, value)
            
            for ctx in sample_contexts:
                if temp_rule.evaluate(ctx):
                    projected_matches.append(ctx.get("id", str(len(projected_matches))))
        elif analysis_type == "add" and proposed_changes:
            # Create temporary new rule
            temp_rule = BusinessRule(**proposed_changes)
            for ctx in sample_contexts:
                if temp_rule.evaluate(ctx):
                    projected_matches.append(ctx.get("id", str(len(projected_matches))))
        
        analysis.projected_matches = len(projected_matches)
        analysis.affected_entities = len(sample_contexts)
        
        # Calculate differences
        current_set = set(current_matches)
        projected_set = set(projected_matches)
        
        analysis.new_matches = list(projected_set - current_set)
        analysis.removed_matches = list(current_set - projected_set)
        
        return analysis
    
    # ==================== Utility Methods ====================
    
    def _create_audit_entry(
        self,
        actor: str,
        action: str,
        entity_type: str,
        entity_id: str,
        actor_type: ActorType = "system",
        previous_state: Optional[dict] = None,
        new_state: Optional[dict] = None,
        rationale: Optional[str] = None
    ) -> None:
        """Create an audit entry for rule operations."""
        entry = AuditEntry(
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
    
    def activate_rule(self, rule_id: str, activated_by: Optional[str] = None) -> BusinessRule:
        """Activate a rule."""
        return self.update_rule(
            rule_id,
            {"status": "active"},
            updated_by=activated_by,
            change_reason="Rule activated"
        )
    
    def deactivate_rule(self, rule_id: str, deactivated_by: Optional[str] = None) -> BusinessRule:
        """Deactivate a rule."""
        return self.update_rule(
            rule_id,
            {"status": "inactive"},
            updated_by=deactivated_by,
            change_reason="Rule deactivated"
        )
    
    def clone_rule(
        self,
        rule_id: str,
        new_name: str,
        created_by: Optional[str] = None
    ) -> BusinessRule:
        """Clone an existing rule with a new name."""
        original = self.get_rule(rule_id)
        if not original:
            raise ValueError(f"Rule {rule_id} not found")
        
        # Create a copy with new ID and name
        cloned_data = original.model_dump()
        cloned_data["id"] = str(__import__("uuid").uuid4())
        cloned_data["name"] = new_name
        cloned_data["status"] = "draft"
        cloned_data["version"] = 1
        
        cloned_rule = BusinessRule(**cloned_data)
        return self.add_rule(cloned_rule, created_by)
