"""
Data Quality Rule Agent tools for the Agentic Data Governance System.

This module defines Strands tools for generating DQ rules, ingesting existing rules,
updating thresholds, and executing rules against data.

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
"""

from datetime import datetime
from typing import Any, Optional
from strands import tool

from models.data_quality import (
    DQRule,
    DQDimension,
    RuleLogic,
    Threshold,
    RuleExecutionResult,
    Severity,
)
from models.cde import CDE
from models.audit import AuditEntry
from repository.base import GovernanceRepository


# All 7 DQ dimensions as required by Requirements 7.2
ALL_DIMENSIONS: list[DQDimension] = [
    'completeness',
    'accuracy',
    'validity',
    'consistency',
    'timeliness',
    'uniqueness',
    'integrity'
]


# Default rule templates for each dimension
DIMENSION_RULE_TEMPLATES: dict[DQDimension, dict[str, Any]] = {
    'completeness': {
        'name_template': '{cde_name} Completeness Check',
        'description_template': 'Validates that {cde_name} has no null or empty values',
        'logic_type': 'null_check',
        'expression_template': 'value IS NOT NULL AND value != ""',
        'default_threshold': 0.95,
        'default_severity': 'high'
    },
    'accuracy': {
        'name_template': '{cde_name} Accuracy Check',
        'description_template': 'Validates that {cde_name} values are accurate against reference data',
        'logic_type': 'referential_check',
        'expression_template': 'value IN reference_values',
        'default_threshold': 0.98,
        'default_severity': 'critical'
    },
    'validity': {
        'name_template': '{cde_name} Validity Check',
        'description_template': 'Validates that {cde_name} values conform to expected format and range',
        'logic_type': 'format_check',
        'expression_template': 'value MATCHES expected_format',
        'default_threshold': 0.99,
        'default_severity': 'high'
    },
    'consistency': {
        'name_template': '{cde_name} Consistency Check',
        'description_template': 'Validates that {cde_name} values are consistent across related records',
        'logic_type': 'reconciliation',
        'expression_template': 'value == related_value',
        'default_threshold': 0.95,
        'default_severity': 'high'
    },
    'timeliness': {
        'name_template': '{cde_name} Timeliness Check',
        'description_template': 'Validates that {cde_name} data is current and within acceptable age',
        'logic_type': 'range_check',
        'expression_template': 'data_age <= max_age_days',
        'default_threshold': 0.90,
        'default_severity': 'medium'
    },
    'uniqueness': {
        'name_template': '{cde_name} Uniqueness Check',
        'description_template': 'Validates that {cde_name} values are unique where required',
        'logic_type': 'custom',
        'expression_template': 'COUNT(DISTINCT value) == COUNT(value)',
        'default_threshold': 1.0,
        'default_severity': 'critical'
    },
    'integrity': {
        'name_template': '{cde_name} Integrity Check',
        'description_template': 'Validates referential integrity for {cde_name}',
        'logic_type': 'referential_check',
        'expression_template': 'foreign_key EXISTS IN parent_table',
        'default_threshold': 1.0,
        'default_severity': 'critical'
    }
}


def create_dq_rule_tools(repository: GovernanceRepository):
    """
    Factory function to create DQ rule tools with repository injection.
    
    Args:
        repository: The governance repository for data persistence.
        
    Returns:
        List of tool functions for the Data Quality Rule Agent.
    """
    
    @tool
    def generate_rules_for_cde(
        cde_id: str,
        cde_name: str,
        dimensions: Optional[list[str]] = None,
        owner: str = "Data Quality Team",
        custom_thresholds: Optional[dict[str, float]] = None
    ) -> list[dict]:
        """
        Generate DQ rules for a CDE across all 7 dimensions.
        
        Creates rules for: completeness, accuracy, validity, consistency,
        timeliness, uniqueness, and integrity.
        
        Args:
            cde_id: The ID of the CDE to generate rules for.
            cde_name: The name of the CDE for rule naming.
            dimensions: Optional list of specific dimensions to generate rules for.
                       If not provided, generates rules for all 7 dimensions.
            owner: The owner of the generated rules.
            custom_thresholds: Optional custom threshold values by dimension.
            
        Returns:
            List of generated DQ rules.
        """
        # Use all dimensions if not specified
        target_dimensions = dimensions or list(ALL_DIMENSIONS)
        
        # Validate dimensions
        for dim in target_dimensions:
            if dim not in ALL_DIMENSIONS:
                raise ValueError(f"Invalid dimension: {dim}. Must be one of {ALL_DIMENSIONS}")
        
        custom_thresholds = custom_thresholds or {}
        generated_rules: list[DQRule] = []
        
        for dimension in target_dimensions:
            template = DIMENSION_RULE_TEMPLATES[dimension]
            
            # Get threshold (custom or default)
            threshold_value = custom_thresholds.get(dimension, template['default_threshold'])
            
            # Create rule logic
            logic = RuleLogic(
                type=template['logic_type'],
                expression=template['expression_template'],
                parameters={"cde_id": cde_id, "cde_name": cde_name}
            )
            
            # Create threshold
            threshold = Threshold(
                type='percentage',
                value=threshold_value
            )
            
            # Create the rule
            rule = DQRule(
                cde_id=cde_id,
                dimension=dimension,
                name=template['name_template'].format(cde_name=cde_name),
                description=template['description_template'].format(cde_name=cde_name),
                logic=logic,
                threshold=threshold,
                severity=template['default_severity'],
                owner=owner,
                enabled=True
            )
            
            # Store the rule
            repository.add_dq_rule(rule)
            generated_rules.append(rule)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataQualityRuleAgent",
            actor_type="agent",
            action="generate_rules_for_cde",
            entity_type="DQRule",
            entity_id=cde_id,
            new_state={
                "cde_id": cde_id,
                "cde_name": cde_name,
                "dimensions": target_dimensions,
                "rules_generated": len(generated_rules)
            }
        ))
        
        return [r.model_dump() for r in generated_rules]
    
    @tool
    def ingest_existing_rules(
        rules: list[dict],
        validate: bool = True
    ) -> dict:
        """
        Ingest existing DQ rules into the system.
        
        Validates and stores rules from external sources or legacy systems.
        
        Args:
            rules: List of rule dictionaries to ingest. Each rule must contain:
                - cde_id: The CDE this rule applies to
                - dimension: One of the 7 DQ dimensions
                - name: Rule name
                - description: Rule description
                - logic: Rule logic with type and expression
                - threshold: Threshold configuration
                - severity: Rule severity
                - owner: Rule owner
            validate: Whether to validate rules before ingestion.
            
        Returns:
            Ingestion result with counts and any validation errors.
        """
        ingested_count = 0
        skipped_count = 0
        errors: list[dict] = []
        ingested_rules: list[DQRule] = []
        
        for i, rule_dict in enumerate(rules):
            try:
                # Validate required fields
                if validate:
                    required_fields = ['cde_id', 'dimension', 'name', 'description', 
                                      'logic', 'threshold', 'severity', 'owner']
                    missing_fields = [f for f in required_fields if f not in rule_dict]
                    if missing_fields:
                        errors.append({
                            "index": i,
                            "error": f"Missing required fields: {missing_fields}",
                            "rule": rule_dict
                        })
                        skipped_count += 1
                        continue
                    
                    # Validate dimension
                    if rule_dict['dimension'] not in ALL_DIMENSIONS:
                        errors.append({
                            "index": i,
                            "error": f"Invalid dimension: {rule_dict['dimension']}",
                            "rule": rule_dict
                        })
                        skipped_count += 1
                        continue
                
                # Parse logic if it's a dict
                logic_data = rule_dict['logic']
                if isinstance(logic_data, dict):
                    logic = RuleLogic(**logic_data)
                else:
                    logic = logic_data
                
                # Parse threshold if it's a dict
                threshold_data = rule_dict['threshold']
                if isinstance(threshold_data, dict):
                    threshold = Threshold(**threshold_data)
                else:
                    threshold = threshold_data
                
                # Create the rule - only pass id if provided
                rule_kwargs = {
                    "cde_id": rule_dict['cde_id'],
                    "dimension": rule_dict['dimension'],
                    "name": rule_dict['name'],
                    "description": rule_dict['description'],
                    "logic": logic,
                    "threshold": threshold,
                    "severity": rule_dict['severity'],
                    "owner": rule_dict['owner'],
                    "enabled": rule_dict.get('enabled', True)
                }
                if 'id' in rule_dict and rule_dict['id'] is not None:
                    rule_kwargs['id'] = rule_dict['id']
                
                rule = DQRule(**rule_kwargs)
                
                # Store the rule
                repository.add_dq_rule(rule)
                ingested_rules.append(rule)
                ingested_count += 1
                
            except Exception as e:
                errors.append({
                    "index": i,
                    "error": str(e),
                    "rule": rule_dict
                })
                skipped_count += 1
        
        result = {
            "ingested_count": ingested_count,
            "skipped_count": skipped_count,
            "total_submitted": len(rules),
            "errors": errors,
            "ingested_rule_ids": [r.id for r in ingested_rules]
        }
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataQualityRuleAgent",
            actor_type="agent",
            action="ingest_existing_rules",
            entity_type="DQRule",
            entity_id="batch_ingest",
            new_state=result
        ))
        
        return result
    
    @tool
    def update_rule_threshold(
        rule_id: str,
        new_threshold: float,
        updater: str,
        justification: str
    ) -> dict:
        """
        Update the threshold for a DQ rule.
        
        Requires justification for audit trail compliance.
        
        Args:
            rule_id: The ID of the rule to update.
            new_threshold: The new threshold value (0.0 to 1.0 for percentage).
            updater: The person making the update.
            justification: The reason for the threshold change (required).
            
        Returns:
            The updated rule.
        """
        if not justification or len(justification.strip()) < 10:
            raise ValueError("Justification must be at least 10 characters")
        
        if not 0.0 <= new_threshold <= 1.0:
            raise ValueError("Threshold must be between 0.0 and 1.0")
        
        rule = repository.get_dq_rule(rule_id)
        if not rule:
            raise ValueError(f"Rule with ID '{rule_id}' not found")
        
        previous_state = rule.model_dump()
        previous_threshold = rule.threshold.value
        
        # Update threshold
        rule.threshold.value = new_threshold
        
        repository.update_dq_rule(rule)
        
        # Create audit entry with justification
        repository.create_audit_entry(AuditEntry(
            actor=updater,
            actor_type="human",
            action="update_rule_threshold",
            entity_type="DQRule",
            entity_id=rule_id,
            previous_state=previous_state,
            new_state=rule.model_dump(),
            rationale=justification
        ))
        
        return {
            "rule_id": rule_id,
            "previous_threshold": previous_threshold,
            "new_threshold": new_threshold,
            "updated_by": updater,
            "justification": justification,
            "rule": rule.model_dump()
        }
    
    @tool
    def execute_rules(
        cde_id: str,
        data: Optional[list[Any]] = None,
        rule_ids: Optional[list[str]] = None
    ) -> list[dict]:
        """
        Execute DQ rules against data for a CDE.
        
        Runs all enabled rules for the CDE and returns execution results.
        
        Args:
            cde_id: The ID of the CDE to execute rules for.
            data: Optional data to validate. If not provided, uses sample data.
            rule_ids: Optional list of specific rule IDs to execute.
                     If not provided, executes all enabled rules for the CDE.
            
        Returns:
            List of rule execution results with pass/fail status.
        """
        # Get rules for the CDE
        all_rules = repository.get_dq_rules(cde_id=cde_id)
        
        if rule_ids:
            rules_to_execute = [r for r in all_rules if r.id in rule_ids]
        else:
            rules_to_execute = [r for r in all_rules if r.enabled]
        
        if not rules_to_execute:
            return []
        
        # Use provided data or generate sample data
        test_data = data or []
        total_records = len(test_data) if test_data else 100  # Default sample size
        
        results: list[RuleExecutionResult] = []
        
        for rule in rules_to_execute:
            # Execute rule logic (simplified simulation)
            # In production, this would execute actual SQL/validation logic
            execution_result = _execute_rule_logic(rule, test_data, total_records)
            
            result = RuleExecutionResult(
                rule_id=rule.id,
                passed=execution_result['passed'],
                actual_value=execution_result['actual_value'],
                expected_value=rule.threshold.value,
                failed_records=execution_result.get('failed_records'),
                total_records=total_records,
                executed_at=datetime.now()
            )
            
            # Store execution result
            repository.store_rule_execution_result(result)
            results.append(result)
        
        # Create audit entry
        repository.create_audit_entry(AuditEntry(
            actor="DataQualityRuleAgent",
            actor_type="agent",
            action="execute_rules",
            entity_type="RuleExecutionResult",
            entity_id=cde_id,
            new_state={
                "cde_id": cde_id,
                "rules_executed": len(results),
                "passed_count": sum(1 for r in results if r.passed),
                "failed_count": sum(1 for r in results if not r.passed)
            }
        ))
        
        return [r.model_dump() for r in results]
    
    @tool
    def get_rules_for_cde(cde_id: str) -> list[dict]:
        """
        Get all DQ rules for a specific CDE.
        
        Args:
            cde_id: The ID of the CDE to get rules for.
            
        Returns:
            List of DQ rules for the CDE.
        """
        rules = repository.get_dq_rules(cde_id=cde_id)
        return [r.model_dump() for r in rules]
    
    @tool
    def get_rule(rule_id: str) -> dict:
        """
        Get a specific DQ rule by ID.
        
        Args:
            rule_id: The ID of the rule to retrieve.
            
        Returns:
            The DQ rule if found.
        """
        rule = repository.get_dq_rule(rule_id)
        if not rule:
            raise ValueError(f"Rule with ID '{rule_id}' not found")
        return rule.model_dump()
    
    @tool
    def enable_rule(rule_id: str, updater: str) -> dict:
        """
        Enable a DQ rule.
        
        Args:
            rule_id: The ID of the rule to enable.
            updater: The person enabling the rule.
            
        Returns:
            The updated rule.
        """
        rule = repository.get_dq_rule(rule_id)
        if not rule:
            raise ValueError(f"Rule with ID '{rule_id}' not found")
        
        previous_state = rule.model_dump()
        rule.enabled = True
        
        repository.update_dq_rule(rule)
        
        repository.create_audit_entry(AuditEntry(
            actor=updater,
            actor_type="human",
            action="enable_rule",
            entity_type="DQRule",
            entity_id=rule_id,
            previous_state=previous_state,
            new_state=rule.model_dump()
        ))
        
        return rule.model_dump()
    
    @tool
    def disable_rule(rule_id: str, updater: str, reason: str) -> dict:
        """
        Disable a DQ rule.
        
        Args:
            rule_id: The ID of the rule to disable.
            updater: The person disabling the rule.
            reason: The reason for disabling the rule.
            
        Returns:
            The updated rule.
        """
        rule = repository.get_dq_rule(rule_id)
        if not rule:
            raise ValueError(f"Rule with ID '{rule_id}' not found")
        
        previous_state = rule.model_dump()
        rule.enabled = False
        
        repository.update_dq_rule(rule)
        
        repository.create_audit_entry(AuditEntry(
            actor=updater,
            actor_type="human",
            action="disable_rule",
            entity_type="DQRule",
            entity_id=rule_id,
            previous_state=previous_state,
            new_state=rule.model_dump(),
            rationale=reason
        ))
        
        return rule.model_dump()
    
    @tool
    def get_execution_history(
        cde_id: Optional[str] = None,
        rule_id: Optional[str] = None,
        since: Optional[str] = None
    ) -> list[dict]:
        """
        Get rule execution history with optional filters.
        
        Args:
            cde_id: Optional CDE ID to filter by.
            rule_id: Optional rule ID to filter by.
            since: Optional ISO date string to filter results after.
            
        Returns:
            List of execution results matching the filters.
        """
        since_dt = datetime.fromisoformat(since) if since else None
        
        results = repository.get_rule_execution_results(
            rule_id=rule_id,
            cde_id=cde_id,
            since=since_dt
        )
        
        return [r.model_dump() for r in results]
    
    return [
        generate_rules_for_cde,
        ingest_existing_rules,
        update_rule_threshold,
        execute_rules,
        get_rules_for_cde,
        get_rule,
        enable_rule,
        disable_rule,
        get_execution_history
    ]


def _execute_rule_logic(
    rule: DQRule, 
    data: list[Any], 
    total_records: int
) -> dict:
    """
    Execute rule logic against data (simplified simulation).
    
    In production, this would execute actual SQL queries or validation logic
    against the data warehouse.
    
    Args:
        rule: The DQ rule to execute.
        data: The data to validate.
        total_records: Total number of records.
        
    Returns:
        Execution result with pass/fail status and metrics.
    """
    # Simplified simulation based on dimension
    # In production, this would execute actual validation logic
    
    if not data:
        # Simulate results when no data provided
        # Use threshold as baseline with some variance
        base_pass_rate = rule.threshold.value
        # Add small random variance for simulation
        import random
        variance = random.uniform(-0.05, 0.05)
        actual_rate = max(0.0, min(1.0, base_pass_rate + variance))
        
        passed = actual_rate >= rule.threshold.value
        failed_records = int(total_records * (1 - actual_rate))
        
        return {
            'passed': passed,
            'actual_value': actual_rate,
            'failed_records': failed_records
        }
    
    # Execute based on dimension type
    if rule.dimension == 'completeness':
        # Check for null/empty values
        non_null_count = sum(1 for v in data if v is not None and v != "")
        actual_rate = non_null_count / len(data) if data else 0.0
        
    elif rule.dimension == 'uniqueness':
        # Check for unique values
        unique_count = len(set(data))
        actual_rate = unique_count / len(data) if data else 0.0
        
    elif rule.dimension == 'validity':
        # Simplified validity check - assume all non-null values are valid
        valid_count = sum(1 for v in data if v is not None)
        actual_rate = valid_count / len(data) if data else 0.0
        
    else:
        # Default: assume high pass rate for other dimensions
        actual_rate = 0.95
    
    passed = actual_rate >= rule.threshold.value
    failed_records = int(len(data) * (1 - actual_rate)) if data else 0
    
    return {
        'passed': passed,
        'actual_value': actual_rate,
        'failed_records': failed_records
    }
