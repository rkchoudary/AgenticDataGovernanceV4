"""
Wrapper entrypoint for CDEIdentificationAgent deployment to AgentCore.
Uses lazy imports to minimize cold start time.
"""

import sys
import os

print(f"[CDE] Python version: {sys.version}", flush=True)
print(f"[CDE] Working directory: {os.getcwd()}", flush=True)

from bedrock_agentcore.runtime import BedrockAgentCoreApp
print("[CDE] Imported BedrockAgentCoreApp", flush=True)

app = BedrockAgentCoreApp()
print("[CDE] Created app instance", flush=True)


@app.entrypoint
def invoke(payload: dict) -> dict:
    """Handler for CDE Identification Agent invocation."""
    print(f"[CDE] invoke called", flush=True)
    
    # Lazy imports
    from datetime import datetime
    from strands import Agent
    from strands.models import BedrockModel
    from repository.in_memory import InMemoryGovernanceRepository
    from tools.cde_tools import create_cde_tools
    
    # Extract session info
    session_id = payload.get("session_id", f"cde_{datetime.now().strftime('%Y%m%d%H%M%S')}")
    actor_id = payload.get("actor_id", "system")
    memory_id = os.environ.get("AGENTCORE_MEMORY_ID")
    
    # Initialize repository
    if memory_id:
        from repository.agentcore_memory import AgentCoreMemoryRepository
        repository = AgentCoreMemoryRepository(
            memory_id=memory_id,
            session_id=session_id,
            actor_id=actor_id
        )
    else:
        repository = InMemoryGovernanceRepository()
    
    # Create tools and agent
    tools = create_cde_tools(repository)
    model = BedrockModel(
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        region_name=os.environ.get("AWS_REGION", "us-west-2")
    )
    
    agent = Agent(
        model=model,
        system_prompt="""You are the CDE Identification Agent for a financial institution's 
data governance system. Your responsibilities include scoring data elements for criticality, 
identifying Critical Data Elements (CDEs), and managing the CDE inventory.""",
        tools=tools
    )
    
    # Process request
    prompt = payload.get("prompt", "What CDEs are in the inventory?")
    result = agent(prompt)
    
    return {
        "result": result.message if hasattr(result, 'message') else str(result),
        "session_id": session_id,
        "actor_id": actor_id
    }


if __name__ == "__main__":
    print("[CDE] Starting app.run()", flush=True)
    app.run()
