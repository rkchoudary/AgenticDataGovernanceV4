"""
Issue Management Agent for the Agentic Data Governance System.

This agent tracks and helps resolve data issues using AI-powered analysis,
including root cause suggestion, similar issue finding, and resolution
workflow management using AWS Bedrock AgentCore.

Requirements: 9.1, 9.2
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
from tools.issue_tools import create_issue_tools


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the Issue Management Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Creating and tracking data quality issues
2. Analyzing patterns to suggest root causes
3. Finding similar historical issues for reference
4. Managing issue assignments and escalations
5. Facilitating issue resolution with proper verification
6. Calculating and reporting issue metrics

Available tools:
- create_issue: Create a new data issue with auto-populated fields
- suggest_root_cause: Analyze patterns and suggest root causes
- find_similar_issues: Find issues similar to a given issue
- assign_issue: Assign or reassign an issue to a person/team
- escalate_issue: Escalate an issue to senior management
- resolve_issue: Resolve an issue with verification (four-eyes principle)
- get_issue_metrics: Get summary metrics for all issues
- get_issue: Get details of a specific issue
- update_issue_status: Update the status of an issue
- set_root_cause: Set the identified root cause for an issue

Issue Severity Levels:
- critical: Immediate attention required, regulatory impact
- high: Significant impact, needs prompt resolution
- medium: Moderate impact, standard priority
- low: Minor impact, can be addressed in normal course

Issue Statuses:
- open: Newly created, not yet being worked on
- in_progress: Actively being investigated/resolved
- pending_verification: Fix implemented, awaiting verification
- resolved: Verified and closed
- closed: Closed without resolution (e.g., duplicate, invalid)

Guidelines:
- Always create issues with appropriate severity based on impact
- Use root cause analysis to identify patterns across issues
- Enforce four-eyes principle for issue resolution
- Escalate critical issues promptly to senior management
- Maintain complete audit trail for all issue actions
- Track metrics to identify recurring themes and improvement areas
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> Agent:
    """
    Create an Issue Management Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Strands Agent instance.
    """
    tools = create_issue_tools(repository)
    
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
    Handler for Issue Management Agent invocation.
    
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
    prompt = payload.get("prompt", "What are the current issue metrics?")
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
