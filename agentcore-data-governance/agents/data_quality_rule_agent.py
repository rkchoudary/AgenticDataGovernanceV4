"""
Data Quality Rule Agent for the Agentic Data Governance System.

This agent generates DQ rules for CDEs, ingests existing rules, updates
thresholds, and executes rules against data using AWS Bedrock AgentCore.

Requirements: 7.1, 7.2
"""

import os
from datetime import datetime
from typing import Any, Optional

from strands import Agent
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager

from repository.agentcore_memory import AgentCoreMemoryRepository
from repository.in_memory import InMemoryGovernanceRepository
from tools.dq_rule_tools import create_dq_rule_tools


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the Data Quality Rule Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Generating DQ rules for Critical Data Elements (CDEs) across all 7 dimensions
2. Ingesting existing rules from legacy systems
3. Updating rule thresholds with proper justification
4. Executing rules against data and reporting results
5. Managing rule lifecycle (enable/disable)

Available tools:
- generate_rules_for_cde: Generate rules for all 7 DQ dimensions for a CDE
- ingest_existing_rules: Import rules from external sources
- update_rule_threshold: Update a rule's threshold (requires justification)
- execute_rules: Run rules against data and get pass/fail results
- get_rules_for_cde: Get all rules for a specific CDE
- get_rule: Get a specific rule by ID
- enable_rule: Enable a disabled rule
- disable_rule: Disable a rule (requires reason)
- get_execution_history: Get historical execution results

Data Quality Dimensions (all 7 must be covered):
1. Completeness - No null or empty values where required
2. Accuracy - Values match authoritative reference data
3. Validity - Values conform to expected format and range
4. Consistency - Values are consistent across related records
5. Timeliness - Data is current and within acceptable age
6. Uniqueness - Values are unique where required
7. Integrity - Referential integrity is maintained

Guidelines:
- Generate rules for ALL 7 dimensions when creating rules for a CDE
- Each rule must include: id, cde_id, dimension, name, description, logic, threshold, severity, owner, enabled
- Threshold updates require justification for audit compliance
- Maintain audit trail for all rule changes
- Report execution results with pass/fail status, actual vs expected values
- Consider severity levels: critical, high, medium, low
- Default thresholds vary by dimension (e.g., uniqueness=100%, completeness=95%)
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> Agent:
    """
    Create a Data Quality Rule Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Strands Agent instance.
    """
    tools = create_dq_rule_tools(repository)
    
    agent_kwargs = {
        "system_prompt": SYSTEM_PROMPT,
        "tools": tools,
    }
    
    if session_manager:
        agent_kwargs["session_manager"] = session_manager
    
    return Agent(**agent_kwargs)


@app.entrypoint
def invoke(payload: dict) -> dict:
    """
    Handler for Data Quality Rule Agent invocation.
    
    This is the main entry point when the agent is deployed to AgentCore Runtime.
    
    Args:
        payload: The invocation payload containing:
            - prompt: The user's request/question
            - session_id: Optional session ID for conversation continuity
            - actor_id: Optional actor ID for audit trail
        context: The AgentCore runtime context
        
    Returns:
        Response containing the agent's result and session info.
    """
    # Extract session info from payload
    session_id = payload.get(
        "session_id", 
        f"session_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )
    actor_id = payload.get("actor_id", "system")
    memory_id = os.environ.get("AGENTCORE_MEMORY_ID")
    
    # Initialize repository
    if memory_id:
        # Use AgentCore Memory for persistence
        repository = AgentCoreMemoryRepository(
            memory_id=memory_id,
            session_id=session_id,
            actor_id=actor_id
        )
        
        # Configure memory session manager
        memory_config = AgentCoreMemoryConfig(
            memory_id=memory_id,
            session_id=session_id,
            actor_id=actor_id
        )
        
        session_manager = AgentCoreMemorySessionManager(
            agentcore_memory_config=memory_config,
            region_name=os.environ.get("AWS_REGION", "us-west-2")
        )
    else:
        # Fall back to in-memory repository for local development
        repository = InMemoryGovernanceRepository()
        session_manager = None
    
    # Create agent with tools
    agent = create_agent(repository, session_manager)
    
    # Process request
    prompt = payload.get("prompt", "What DQ rules are available?")
    result = agent(prompt)
    
    return {
        "result": result.message if hasattr(result, 'message') else str(result),
        "session_id": session_id,
        "actor_id": actor_id
    }


def run_local(prompt: str, repository: Optional[Any] = None) -> str:
    """
    Run the agent locally for development and testing.
    
    Args:
        prompt: The user's request/question.
        repository: Optional repository instance. If not provided,
                   uses InMemoryGovernanceRepository.
        
    Returns:
        The agent's response as a string.
    """
    if repository is None:
        repository = InMemoryGovernanceRepository()
    
    agent = create_agent(repository)
    result = agent(prompt)
    
    return result.message if hasattr(result, 'message') else str(result)


if __name__ == "__main__":
    # Run the agent on AgentCore Runtime
    app.run()
