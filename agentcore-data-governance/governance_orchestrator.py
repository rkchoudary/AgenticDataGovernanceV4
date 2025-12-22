"""
Wrapper entrypoint for GovernanceOrchestrator deployment to AgentCore.

This file serves as the root-level entrypoint that imports and runs
the actual agent from the agents/ directory.

Uses lazy imports to minimize cold start time.
"""

import sys
import os

print(f"[ORCHESTRATOR] Python version: {sys.version}", flush=True)
print(f"[ORCHESTRATOR] Working directory: {os.getcwd()}", flush=True)

from bedrock_agentcore.runtime import BedrockAgentCoreApp
print("[ORCHESTRATOR] Imported BedrockAgentCoreApp", flush=True)

app = BedrockAgentCoreApp()
print("[ORCHESTRATOR] Created app instance", flush=True)


@app.entrypoint
def invoke(payload: dict) -> dict:
    """
    Handler for Governance Orchestrator invocation.
    Imports are done lazily inside the function to reduce cold start time.
    """
    print(f"[ORCHESTRATOR] invoke called with payload keys: {list(payload.keys())}", flush=True)
    
    # Lazy import the actual invoke function
    from agents.governance_orchestrator import invoke as agent_invoke
    print("[ORCHESTRATOR] Imported agent_invoke", flush=True)
    
    return agent_invoke(payload)


if __name__ == "__main__":
    print("[ORCHESTRATOR] Starting app.run()", flush=True)
    app.run()
