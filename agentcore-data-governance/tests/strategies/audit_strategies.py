"""
Hypothesis strategies for Audit models.

Contains test data generators for audit-related Pydantic models.

**Feature: agentcore-python-refactor, Property 2: Audit Trail Completeness**
**Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3**
"""

from datetime import datetime
from typing import Any
from hypothesis import strategies as st
from hypothesis.strategies import composite

from models.audit import (
    AuditEntry,
    CreateAuditEntryParams,
    ActorType,
)


# Basic strategies
actor_type_strategy = st.sampled_from(['agent', 'human', 'system'])

# Non-empty string strategy
non_empty_string_strategy = st.text(
    min_size=1,
    max_size=100,
    alphabet=st.characters(whitelist_categories=('L', 'N', 'Z'))
).filter(lambda s: len(s.strip()) > 0)

# Entity type strategy
entity_type_strategy = st.sampled_from([
    'ReportCatalog', 'RegulatoryReport', 'CDE', 'CDEInventory',
    'DQRule', 'LineageGraph', 'Issue', 'Control', 'ControlMatrix',
    'CycleInstance', 'HumanTask', 'Document'
])

# Action strategy
action_strategy = st.sampled_from([
    'create', 'update', 'delete', 'approve', 'reject',
    'submit_for_review', 'escalate', 'resolve', 'assign',
    'scan', 'execute', 'generate', 'import', 'export'
])

# Agent names
agent_name_strategy = st.sampled_from([
    'RegulatoryIntelligenceAgent',
    'DataRequirementsAgent',
    'CDEIdentificationAgent',
    'DataQualityRuleAgent',
    'LineageMappingAgent',
    'IssueManagementAgent',
    'DocumentationAgent',
    'GovernanceOrchestrator'
])


@composite
def state_strategy(draw):
    """Generate a state object for audit entries."""
    return draw(st.none() | st.fixed_dictionaries({
        'id': st.uuids().map(str),
        'status': st.sampled_from(['draft', 'pending_review', 'approved', 'rejected']),
        'version': st.integers(min_value=0, max_value=100)
    }))


@composite
def audit_entry_strategy(
    draw,
    actor_type: ActorType = None,
    action: str = None,
    entity_type: str = None,
    with_state_change: bool = None
):
    """
    Generate an AuditEntry.
    
    Args:
        actor_type: Optional specific actor type.
        action: Optional specific action.
        entity_type: Optional specific entity type.
        with_state_change: If True, include previous and new state.
    """
    actual_actor_type = actor_type or draw(actor_type_strategy)
    
    # Generate appropriate actor based on type
    if actual_actor_type == 'agent':
        actor = draw(agent_name_strategy)
    elif actual_actor_type == 'human':
        actor = draw(non_empty_string_strategy)
    else:
        actor = 'system'
    
    has_state_change = with_state_change if with_state_change is not None else draw(st.booleans())
    
    entry = AuditEntry(
        id=draw(st.uuids().map(str)),
        timestamp=draw(st.datetimes(
            min_value=datetime(2020, 1, 1),
            max_value=datetime(2030, 12, 31)
        )),
        actor=actor,
        actor_type=actual_actor_type,
        action=action or draw(action_strategy),
        entity_type=entity_type or draw(entity_type_strategy),
        entity_id=draw(st.uuids().map(str)),
        rationale=draw(st.none() | st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
    )
    
    if has_state_change:
        entry.previous_state = draw(state_strategy())
        entry.new_state = draw(state_strategy())
    
    return entry


@composite
def create_audit_entry_params_strategy(
    draw,
    actor_type: ActorType = None,
    action: str = None
):
    """
    Generate CreateAuditEntryParams.
    
    Args:
        actor_type: Optional specific actor type.
        action: Optional specific action.
    """
    actual_actor_type = actor_type or draw(actor_type_strategy)
    
    # Generate appropriate actor based on type
    if actual_actor_type == 'agent':
        actor = draw(agent_name_strategy)
    elif actual_actor_type == 'human':
        actor = draw(non_empty_string_strategy)
    else:
        actor = 'system'
    
    return CreateAuditEntryParams(
        actor=actor,
        actor_type=actual_actor_type,
        action=action or draw(action_strategy),
        entity_type=draw(entity_type_strategy),
        entity_id=draw(st.uuids().map(str)),
        previous_state=draw(state_strategy()),
        new_state=draw(state_strategy()),
        rationale=draw(st.none() | st.text(
            min_size=10,
            max_size=300,
            alphabet=st.characters(whitelist_categories=('L', 'N', 'P', 'Z'))
        ))
    )


@composite
def agent_audit_entry_strategy(draw, agent_name: str = None, action: str = None):
    """
    Generate an audit entry from an agent.
    
    Args:
        agent_name: Optional specific agent name.
        action: Optional specific action.
    """
    return draw(audit_entry_strategy(
        actor_type='agent',
        action=action
    ))


@composite
def human_audit_entry_strategy(draw, action: str = None):
    """
    Generate an audit entry from a human.
    
    Args:
        action: Optional specific action.
    """
    return draw(audit_entry_strategy(
        actor_type='human',
        action=action
    ))


@composite
def approval_audit_entry_strategy(draw):
    """
    Generate an audit entry for an approval action.
    
    Convenience strategy for testing approval workflows.
    """
    return draw(audit_entry_strategy(
        actor_type='human',
        action='approve',
        with_state_change=True
    ))


@composite
def audit_trail_strategy(draw, min_entries: int = 1, max_entries: int = 20):
    """
    Generate a list of audit entries representing an audit trail.
    
    Args:
        min_entries: Minimum number of entries.
        max_entries: Maximum number of entries.
    """
    return draw(st.lists(
        audit_entry_strategy(),
        min_size=min_entries,
        max_size=max_entries
    ))
