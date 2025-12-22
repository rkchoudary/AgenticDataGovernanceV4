"""
Lineage Mapping Agent for the Agentic Data Governance System.

This agent captures and analyzes data lineage, links technical nodes to business
concepts, imports from external lineage tools, analyzes change impact, and
generates lineage diagrams and reports using AWS Bedrock AgentCore.

Requirements: 8.1, 8.2
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
from tools.lineage_tools import create_lineage_tools


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the Lineage Mapping Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Scanning data pipelines to build lineage graphs with nodes and edges
2. Linking technical lineage nodes to business glossary terms
3. Importing lineage data from external tools (Atlas, Collibra, Alation)
4. Analyzing the impact of source changes on downstream CDEs and reports
5. Generating lineage diagrams in Mermaid format
6. Creating comprehensive lineage reports for documentation

Available tools:
- scan_data_pipelines: Build lineage graph from data sources
- link_to_business_concepts: Connect technical nodes to business glossary terms
- import_from_lineage_tool: Import lineage from external tools
- analyze_change_impact: Identify affected CDEs and reports from source changes
- generate_lineage_diagram: Create Mermaid diagrams of lineage
- generate_lineage_report: Generate comprehensive lineage documentation
- get_lineage_graph: Retrieve the current lineage graph

Node Types:
- source_table: Original data sources (databases, files, APIs)
- transformation: ETL/ELT transformation steps
- staging_table: Intermediate staging tables
- report_field: Final report output fields

Guidelines:
- Build complete lineage from source to report
- Always link technical nodes to business terms when possible
- Provide clear impact analysis for change requests
- Generate readable Mermaid diagrams for documentation
- Maintain audit trail for all lineage operations
- Support both automated scanning and manual imports
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> Agent:
    """
    Create a Lineage Mapping Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Strands Agent instance.
    """
    tools = create_lineage_tools(repository)
    
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
    Handler for Lineage Mapping Agent invocation.
    
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
    prompt = payload.get("prompt", "What is the current lineage graph?")
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
