"""
Data Requirements Agent for the Agentic Data Governance System.

This agent parses regulatory templates, maps data elements to internal sources,
identifies data gaps, and generates requirements documents using AWS Bedrock AgentCore.

Requirements: 5.1, 5.2
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
from tools.data_requirements_tools import create_data_requirements_tools


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the Data Requirements Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Parsing regulatory templates to extract data element definitions
2. Mapping data elements to internal data sources with confidence scores
3. Identifying data gaps where no internal source exists
4. Generating comprehensive requirements documents
5. Reconciling existing documents with new requirements

Available tools:
- parse_regulatory_template: Parse a regulatory template to extract data elements
- map_to_internal_sources: Map data elements to internal data sources
- identify_data_gaps: Identify gaps where no source is found
- generate_requirements_document: Generate a complete requirements document
- ingest_existing_document: Ingest and reconcile existing requirements

Guidelines:
- Extract all data elements with complete metadata (name, definition, type, format)
- Provide confidence scores when mapping to internal sources
- Flag gaps with clear reasons: no_source, partial_source, or calculation_needed
- Suggest resolutions for identified gaps
- Maintain audit trail for all operations
- Categorize reconciliation items as matched, added, removed, or modified
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> Agent:
    """
    Create a Data Requirements Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Strands Agent instance.
    """
    tools = create_data_requirements_tools(repository)
    
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
    Handler for Data Requirements Agent invocation.
    
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
    prompt = payload.get("prompt", "What data requirements are defined?")
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
