"""
Regulatory Intelligence Agent for the Agentic Data Governance System.

This agent scans regulatory body sources, detects changes, and maintains
the regulatory report catalog using AWS Bedrock AgentCore.

Requirements: 4.1, 4.2, 17.1, 17.2, 17.3, 17.4
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
from tools.regulatory_tools import create_regulatory_tools

# Observability imports (Requirements: 17.1, 17.2, 17.3, 17.4)
from services.observability_config import (
    initialize_observability,
    GovernanceSpan,
    GovernanceSpanContext,
    set_current_governance_context,
    set_governance_baggage,
    trace_agent_invocation,
)


# Initialize the BedrockAgentCoreApp
app = BedrockAgentCoreApp()


SYSTEM_PROMPT = """You are the Regulatory Intelligence Agent for a financial institution's 
data governance system. Your responsibilities include:

1. Scanning regulatory body sources (OSFI, Federal Reserve, OCC, FDIC) for reporting requirements
2. Detecting new or updated regulatory reporting obligations
3. Maintaining the Regulatory Report Catalog with accurate metadata
4. Notifying compliance officers of changes
5. Supporting human review and approval workflows

Available tools:
- scan_regulatory_sources: Scan regulatory sources for a list of jurisdictions
- detect_changes: Detect changes since a given date
- update_report_catalog: Update the catalog with detected changes (sets status to pending_review)
- get_report_catalog: Get the current report catalog
- approve_catalog: Approve the catalog after human review
- submit_for_review: Submit the catalog for human review
- modify_catalog: Add, update, or remove reports from the catalog

Guidelines:
- Always ensure audit trail entries are created for all actions
- When changes are detected, set catalog status to 'pending_review' for human approval
- Provide clear explanations of detected changes and their implications
- Follow the four-eyes principle for approvals (different person must approve than who submitted)
- Log all notifications with recipient, subject, and message details
"""


class MockAgentResponse:
    """Mock response object that mimics Strands Agent response"""
    def __init__(self, message: str):
        self.message = message


class MockRegulatoryAgent:
    """
    Mock Regulatory Intelligence Agent for local development.
    
    This provides realistic responses without requiring AWS Bedrock access.
    """
    
    def __init__(self, repository: Any, tools: list):
        self.repository = repository
        self.tools = tools
        self.system_prompt = SYSTEM_PROMPT
    
    def __call__(self, prompt: str) -> MockAgentResponse:
        """Process a user prompt and return a mock response"""
        
        # Analyze the prompt to provide contextual responses
        prompt_lower = prompt.lower()
        
        if any(word in prompt_lower for word in ['hello', 'hi', 'help', 'what can you do']):
            response = """Hello! I'm the Regulatory Intelligence Agent for your data governance system. 

I can help you with:
• Scanning regulatory sources for new reporting requirements
• Detecting changes in regulatory obligations
• Managing the regulatory report catalog
• Supporting compliance workflows and approvals

What would you like to know about regulatory intelligence or data governance?"""
        
        elif any(word in prompt_lower for word in ['catalog', 'reports', 'regulatory reports']):
            # Get actual catalog data from repository
            catalog = self.repository.get_report_catalog()
            if catalog and catalog.reports:
                report_count = len(catalog.reports)
                status = catalog.status
                response = f"""Current Regulatory Report Catalog Status:

📊 **Catalog Overview:**
- Total Reports: {report_count}
- Status: {status}
- Version: {catalog.version}
- Last Updated: {catalog.last_updated}

The catalog contains regulatory reporting requirements from various jurisdictions including OSFI, Federal Reserve, OCC, and FDIC. Would you like me to scan for updates or show specific report details?"""
            else:
                response = """The regulatory report catalog is currently empty. 

I can help you:
• Scan regulatory sources to populate the catalog
• Add new reporting requirements manually
• Set up monitoring for regulatory changes

Would you like me to perform an initial scan of regulatory sources?"""
        
        elif any(word in prompt_lower for word in ['scan', 'update', 'changes', 'new requirements']):
            response = """I'll scan the regulatory sources for new and updated reporting requirements.

🔍 **Scanning Sources:**
- OSFI (Office of the Superintendent of Financial Institutions)
- Federal Reserve System
- OCC (Office of the Comptroller of the Currency)  
- FDIC (Federal Deposit Insurance Corporation)

*Note: In development mode, this would normally connect to live regulatory feeds. For now, I'm providing a simulated response.*

**Simulated Scan Results:**
✅ Found 3 potential updates to existing requirements
✅ Detected 1 new reporting obligation (OSFI Capital Adequacy)
⚠️  2 requirements flagged for review due to interpretation changes

Would you like me to update the catalog with these findings? This will set the status to 'pending_review' for human approval."""
        
        elif any(word in prompt_lower for word in ['approve', 'review', 'pending']):
            response = """**Catalog Review & Approval Process:**

Current items pending review:
• New OSFI Capital Adequacy requirements (detected today)
• Updated Federal Reserve stress testing guidelines
• Modified OCC liquidity reporting thresholds

**Next Steps:**
1. Review each change for accuracy and completeness
2. Validate business impact and implementation timeline  
3. Obtain stakeholder approval (four-eyes principle)
4. Update catalog status to 'approved'

Would you like me to prepare a detailed review package for these changes?"""
        
        elif any(word in prompt_lower for word in ['audit', 'trail', 'history', 'log']):
            # Get actual audit entries
            audit_entries = self.repository.get_audit_entries()
            entry_count = len(audit_entries) if audit_entries else 0
            
            response = f"""**Audit Trail Summary:**

📋 Total Audit Entries: {entry_count}

Recent activities tracked:
• Catalog updates and modifications
• Approval workflows and decisions
• System access and user actions
• Data quality checks and validations

All regulatory intelligence activities are automatically logged with:
- Timestamp and actor identification
- Action details and affected entities
- Before/after states for changes
- Compliance with four-eyes principle

Would you like to see specific audit details or export the audit trail?"""
        
        else:
            # Generic helpful response
            response = f"""I understand you're asking about: "{prompt}"

As your Regulatory Intelligence Agent, I'm here to help with:

🏛️ **Regulatory Monitoring:**
- Scanning OSFI, Fed, OCC, FDIC sources
- Detecting new and changed requirements
- Impact analysis and notifications

📊 **Catalog Management:**
- Maintaining regulatory report inventory
- Version control and approval workflows
- Compliance tracking and reporting

🔍 **Analysis & Insights:**
- Change impact assessment
- Gap analysis and recommendations
- Audit trail and compliance evidence

Could you provide more specific details about what you'd like me to help you with?"""
        
        return MockAgentResponse(response)


def create_agent(
    repository: Any,
    session_manager: Optional[Any] = None
) -> Any:
    """
    Create a Regulatory Intelligence Agent with the given repository.
    
    Args:
        repository: The governance repository for data persistence.
        session_manager: Optional session manager for memory persistence.
        
    Returns:
        Configured Agent instance (real or mock based on environment).
    """
    tools = create_regulatory_tools(repository)
    
    # Check if we're in development mode (default to false since Bedrock is configured)
    development_mode = os.environ.get("DEVELOPMENT_MODE", "false").lower() == "true"
    
    if development_mode:
        print("[DEV MODE] Using Mock Regulatory Intelligence Agent")
        return MockRegulatoryAgent(repository, tools)
    else:
        # Production mode - use real Strands Agent with Bedrock
        print("[PRODUCTION MODE] Using Real Strands Agent with AWS Bedrock")
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
    Handler for Regulatory Intelligence Agent invocation.
    
    This is the main entry point when the agent is deployed to AgentCore Runtime.
    Includes OpenTelemetry instrumentation for observability.
    
    Args:
        payload: The invocation payload containing:
            - prompt: The user's request/question
            - session_id: Optional session ID for conversation continuity
            - actor_id: Optional actor ID for audit trail
            - report_id: Optional report ID for tracing context
            - cycle_id: Optional cycle ID for tracing context
        context: The AgentCore runtime context
        
    Returns:
        Response containing the agent's result and session info.
        
    Requirements: 17.1, 17.2, 17.3, 17.4
    """
    # Extract session info from payload
    session_id = payload.get(
        "session_id", 
        f"session_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    )
    actor_id = payload.get("actor_id", "system")
    memory_id = os.environ.get("AGENTCORE_MEMORY_ID")
    
    # Extract governance context for tracing (Requirements: 17.3, 17.4)
    report_id = payload.get("report_id")
    cycle_id = payload.get("cycle_id")
    phase = payload.get("phase")
    tenant_id = payload.get("tenant_id")
    
    # Initialize observability (Requirements: 17.1, 17.2)
    initialize_observability(
        service_name="regulatory-intelligence-agent",
        service_version="0.1.0",
    )
    
    # Set governance context for span attributes (Requirements: 17.3)
    gov_context = GovernanceSpanContext(
        report_id=report_id,
        cycle_id=cycle_id,
        phase=phase,
        actor=actor_id,
        actor_type="human" if actor_id != "system" else "system",
        session_id=session_id,
        memory_id=memory_id,
        tenant_id=tenant_id,
    )
    set_current_governance_context(gov_context)
    
    # Set baggage for cross-agent correlation (Requirements: 17.4)
    set_governance_baggage(
        report_id=report_id,
        cycle_id=cycle_id,
        phase=phase,
        actor=actor_id,
        actor_type="human" if actor_id != "system" else "system",
        session_id=session_id,
        tenant_id=tenant_id,
    )
    
    # Create span for agent invocation with governance attributes
    with GovernanceSpan(
        "regulatory_intelligence_agent.invoke",
        report_id=report_id,
        cycle_id=cycle_id,
        phase=phase,
        actor=actor_id,
        actor_type="human" if actor_id != "system" else "system",
        session_id=session_id,
        tenant_id=tenant_id,
    ) as span:
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
        prompt = payload.get("prompt", "What regulatory reports are in the catalog?")
        span.add_event("Processing prompt", {"prompt_length": len(prompt)})
        
        result = agent(prompt)
        
        span.add_event("Agent response generated")
        
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
