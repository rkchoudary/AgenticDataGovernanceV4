"""
Governance Orchestrator for the Agentic Data Governance System.

This orchestrator coordinates all specialized agents through the regulatory
reporting lifecycle with human checkpoints using AWS Bedrock AgentCore.

Requirements: 12.1, 12.2
"""

import os
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional

# Type hints only - not imported at runtime
if TYPE_CHECKING:
    from strands import Agent


SYSTEM_PROMPT = """You are the Governance Orchestrator for a financial institution's 
data governance system. You coordinate all specialized agents through the regulatory 
reporting lifecycle with human checkpoints.

Your responsibilities include:
1. Starting and managing report cycles
2. Sequencing agent activities with dependency handling
3. Creating and managing human checkpoint tasks
4. Enforcing workflow dependencies (tasks cannot proceed until prerequisites complete)
5. Blocking workflows when critical issues are detected
6. Supporting retrospective reviews after cycle completion

Agents you coordinate:
- Regulatory Intelligence Agent: Scans regulatory sources, maintains report catalog
- Data Requirements Agent: Parses templates, maps data elements
- CDE Identification Agent: Scores and identifies critical data elements
- Data Quality Rule Agent: Generates and executes validation rules
- Lineage Mapping Agent: Captures data lineage from source to report
- Issue Management Agent: Tracks and resolves data issues
- Documentation Agent: Generates compliance artifacts

Available tools:
- start_report_cycle: Start a new cycle for a regulatory report
- pause_cycle: Pause an active cycle (e.g., due to blocking issues)
- resume_cycle: Resume a paused cycle
- trigger_agent: Trigger a specific agent to execute within a cycle
- create_human_task: Create a human task at a workflow checkpoint
- complete_human_task: Complete a human task with decision and rationale
- escalate_task: Escalate an overdue or blocked task
- get_cycle_status: Get detailed status of a cycle
- advance_phase: Advance the cycle to the next phase

Workflow Phases (in order):
1. Data Gathering - Collect regulatory requirements, identify CDEs, map lineage
2. Validation - Execute DQ rules, identify and track issues
3. Review - Generate documentation, review artifacts
4. Approval - Obtain required approvals from stakeholders
5. Submission - Final attestation and regulatory submission

Guidelines:
- Always enforce human checkpoints at critical decision points
- Log all decisions with rationale for audit compliance
- Block workflow progression when critical issues are unresolved
- Ensure four-eyes principle for approvals (different person must approve than who submitted)
- Maintain complete audit trail for all orchestration actions
- Validate phase dependencies before allowing agent execution
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> "Agent":
    """
    Create a Governance Orchestrator with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Strands Agent instance.
    """
    # Lazy imports to reduce cold start time
    from strands import Agent
    from strands.models import BedrockModel
    from tools.orchestrator_tools import create_orchestrator_tools
    
    tools = create_orchestrator_tools(repository)
    
    # Use a specific model that's enabled in the account
    model = BedrockModel(
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        region_name=os.environ.get("AWS_REGION", "us-west-2")
    )
    
    agent_kwargs = {
        "model": model,
        "system_prompt": SYSTEM_PROMPT,
        "tools": tools,
    }
    
    if session_manager:
        agent_kwargs["session_manager"] = session_manager
    
    return Agent(**agent_kwargs)


def invoke(payload: dict) -> dict:
    """
    Handler for Governance Orchestrator invocation.
    
    This is the main entry point when the orchestrator is deployed to AgentCore Runtime.
    
    Args:
        payload: The invocation payload containing:
            - prompt: The user's request/question
            - session_id: Optional session ID for conversation continuity
            - actor_id: Optional actor ID for audit trail
        
    Returns:
        Response containing the orchestrator's result and session info.
    """
    # Lazy imports to reduce cold start time
    from bedrock_agentcore.memory.integrations.strands.config import AgentCoreMemoryConfig
    from bedrock_agentcore.memory.integrations.strands.session_manager import AgentCoreMemorySessionManager
    from repository.agentcore_memory import AgentCoreMemoryRepository
    from repository.in_memory import InMemoryGovernanceRepository
    
    # Extract session info from payload
    session_id = payload.get(
        "session_id", 
        f"orch_{datetime.now().strftime('%Y%m%d%H%M%S')}"
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
    
    # Create orchestrator with tools
    agent = create_agent(repository, session_manager)
    
    # Process request
    prompt = payload.get("prompt", "What is the current status?")
    result = agent(prompt)
    
    return {
        "result": result.message if hasattr(result, 'message') else str(result),
        "session_id": session_id,
        "actor_id": actor_id
    }


def run_local(prompt: str, repository: Optional[Any] = None) -> str:
    """
    Run the orchestrator locally for development and testing.
    
    Args:
        prompt: The user's request/question.
        repository: Optional repository instance. If not provided,
                   uses InMemoryGovernanceRepository.
        
    Returns:
        The orchestrator's response as a string.
    """
    # Lazy import
    from repository.in_memory import InMemoryGovernanceRepository
    
    if repository is None:
        repository = InMemoryGovernanceRepository()
    
    agent = create_agent(repository)
    result = agent(prompt)
    
    return result.message if hasattr(result, 'message') else str(result)


# Note: This module is imported by the wrapper entrypoint (governance_orchestrator.py)
# The app.run() is called from the wrapper, not here.
