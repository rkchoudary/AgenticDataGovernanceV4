"""
Documentation Agent for the Agentic Data Governance System.

This agent generates compliance artifacts and audit evidence including
data dictionaries, lineage documentation, quality assurance reports,
control effectiveness reports, and BCBS 239 compliance mappings using
AWS Bedrock AgentCore.

Requirements: 10.1, 10.2
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
from tools.documentation_tools import create_documentation_tools
from models.documentation import DocumentationConfig


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the Documentation Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Generating comprehensive data dictionaries for regulatory reports
2. Creating lineage documentation showing data flows
3. Producing quality assurance reports for reporting cycles
4. Generating control effectiveness reports
5. Creating BCBS 239 compliance mappings with all 14 principles
6. Compiling complete compliance packages for regulatory submissions

Available tools:
- generate_data_dictionary: Create a data dictionary for a report
- generate_lineage_documentation: Document data lineage for a report
- generate_quality_assurance_report: Generate QA report for a cycle
- generate_control_effectiveness_report: Assess control effectiveness
- generate_bcbs239_compliance_mapping: Map compliance to BCBS 239 principles
- compile_compliance_package: Aggregate all artifacts for a cycle

Document Types:
- data_dictionary: Comprehensive definitions of all CDEs
- lineage_documentation: Data flow from source to report
- quality_assurance_report: DQ assessment for a cycle
- control_effectiveness_report: Control assessment and metrics
- bcbs239_compliance_mapping: BCBS 239 principle compliance
- compliance_package: Aggregated package of all documents

BCBS 239 Principles (all 14):
1. Governance
2. Data Architecture and IT Infrastructure
3. Accuracy and Integrity
4. Completeness
5. Timeliness
6. Adaptability
7. Accuracy (Reporting)
8. Comprehensiveness
9. Clarity and Usefulness
10. Frequency
11. Distribution
12. Review
13. Remedial Actions and Supervisory Measures
14. Home/Host Cooperation

Guidelines:
- Generate documents with complete and accurate information
- Include timestamps and organization details in all documents
- Reference evidence links for compliance assessments
- Create audit entries for all document generation actions
- Ensure BCBS 239 mappings cover all 14 principles
- Compile packages with all available artifacts
"""


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None,
    config: Optional[DocumentationConfig] = None
) -> Agent:
    """
    Create a Documentation Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        config: Optional configuration for document generation.
        
    Returns:
        Configured Strands Agent instance.
    """
    tools = create_documentation_tools(repository, config)
    
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
    Handler for Documentation Agent invocation.
    
    This is the main entry point when the agent is deployed to AgentCore Runtime.
    
    Args:
        payload: The invocation payload containing:
            - prompt: The user's request/question
            - session_id: Optional session ID for conversation continuity
            - actor_id: Optional actor ID for audit trail
            - organization_name: Optional organization name for documents
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
    
    # Create documentation config from payload
    config = DocumentationConfig(
        organization_name=payload.get("organization_name", "Financial Institution"),
        include_timestamps=payload.get("include_timestamps", True),
        default_format=payload.get("default_format", "markdown")
    )
    
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
    agent = create_agent(repository, session_manager, config)
    
    # Process request
    prompt = payload.get("prompt", "What documents can you generate?")
    result = agent(prompt)
    
    return {
        "result": result.message if hasattr(result, 'message') else str(result),
        "session_id": session_id,
        "actor_id": actor_id
    }


def run_local(
    prompt: str, 
    repository: Optional[Any] = None,
    config: Optional[DocumentationConfig] = None
) -> str:
    """
    Run the agent locally for development and testing.
    
    Args:
        prompt: The user's request/question.
        repository: Optional repository instance. If not provided,
                   uses InMemoryGovernanceRepository.
        config: Optional configuration for document generation.
        
    Returns:
        The agent's response as a string.
    """
    if repository is None:
        repository = InMemoryGovernanceRepository()
    
    agent = create_agent(repository, config=config)
    result = agent(prompt)
    
    return result.message if hasattr(result, 'message') else str(result)


if __name__ == "__main__":
    # Run the agent on AgentCore Runtime
    app.run()
