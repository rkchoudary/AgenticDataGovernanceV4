"""
CDE Identification Agent for the Agentic Data Governance System.

This agent scores data elements for criticality, generates CDE inventories,
reconciles with existing inventories, and suggests data owners using AWS
Bedrock AgentCore.

Requirements: 6.1, 6.2
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
from tools.cde_tools import create_cde_tools


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the CDE Identification Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Scoring data elements for criticality based on multiple factors
2. Generating CDE (Critical Data Element) inventories from scored elements
3. Reconciling new CDEs with existing inventories
4. Suggesting appropriate data owners based on data domain analysis
5. Supporting the CDE approval workflow

Available tools:
- score_data_elements: Score data elements based on regulatory calculation usage, 
  cross-report usage, financial impact, and regulatory scrutiny
- generate_cde_inventory: Generate CDE inventory from elements above threshold
- reconcile_with_existing: Compare new CDEs against existing inventory
- suggest_data_owners: Suggest data owners based on domain analysis
- get_cde_inventory: Get the current CDE inventory for a report
- update_cde_owner: Update the data owner for a specific CDE
- approve_cde: Approve a CDE after review (requires owner assignment)

Scoring Factors:
- regulatory_calculation_usage: How often the element is used in regulatory calculations
- cross_report_usage: How many reports use this element
- financial_impact: The financial significance of the element
- regulatory_scrutiny: Level of regulatory attention on this element

Guidelines:
- Score all data elements objectively based on the four factors
- Use a threshold of 0.7 by default for CDE identification
- Always include rationale when generating CDE inventory
- Flag CDEs without owners as requiring assignment
- Ensure CDEs have owners before approval
- Maintain audit trail for all operations
- Provide clear explanations for scoring decisions
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> Agent:
    """
    Create a CDE Identification Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Strands Agent instance.
    """
    tools = create_cde_tools(repository)
    
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
    Handler for CDE Identification Agent invocation.
    
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
    prompt = payload.get("prompt", "What CDEs are in the inventory?")
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
