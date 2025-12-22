"""
Wrapper entrypoint for DataQualityRuleAgent deployment to AgentCore.
Uses lazy imports to minimize cold start time.
"""

import sys
import os

print(f"[DQ_RULE] Python version: {sys.version}", flush=True)
print(f"[DQ_RULE] Working directory: {os.getcwd()}", flush=True)

from bedrock_agentcore.runtime import BedrockAgentCoreApp
print("[DQ_RULE] Imported BedrockAgentCoreApp", flush=True)

app = BedrockAgentCoreApp()
print("[DQ_RULE] Created app instance", flush=True)


@app.entrypoint
def invoke(payload: dict) -> dict:
    """Handler for Data Quality Rule Agent invocation."""
    print(f"[DQ_RULE] invoke called", flush=True)
    
    # Lazy imports
    from datetime import datetime
    from strands import Agent
    from strands.models import BedrockModel
    from repository.in_memory import InMemoryGovernanceRepository
    from tools.dq_rule_tools import create_dq_rule_tools
    
    # Extract session info
    session_id = payload.get("session_id", f"dqrule_{datetime.now().strftime('%Y%m%d%H%M%S')}")
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
    tools = create_dq_rule_tools(repository)
    model = BedrockModel(
        model_id="anthropic.claude-3-5-sonnet-20241022-v2:0",
        region_name=os.environ.get("AWS_REGION", "us-west-2")
    )
    
    agent = Agent(
        model=model,
        system_prompt="""You are the Data Quality Rule Agent for a financial institution's 
data governance system. Your responsibilities include generating data quality rules for CDEs, 
executing validation rules, and tracking rule execution results.""",
        tools=tools
    )
    
    # Process request
    prompt = payload.get("prompt", "What data quality rules are defined?")
    result = agent(prompt)
    
    return {
        "result": result.message if hasattr(result, 'message') else str(result),
        "session_id": session_id,
        "actor_id": actor_id
    }


if __name__ == "__main__":
    print("[DQ_RULE] Starting app.run()", flush=True)
    app.run()
