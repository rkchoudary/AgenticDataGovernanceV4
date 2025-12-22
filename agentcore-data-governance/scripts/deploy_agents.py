#!/usr/bin/env python3
"""
Agent Deployment Script for AgentCore Data Governance.

This script configures and deploys all 8 governance agents to AgentCore Runtime
with health check verification.

Requirements: 14.1, 14.2
- Create .bedrock_agentcore.yaml with entries for all 8 agents
- Use PYTHON_3_12 runtime
- Configure idle_timeout of 900 seconds and max_lifetime of 28800 seconds

Usage:
    python scripts/deploy_agents.py [options]
    
Environment Variables:
    AWS_REGION: AWS region for AgentCore (default: us-west-2)
    REGULATORY_AGENT_MEMORY_ID: Memory ID for Regulatory Intelligence Agent
    DATA_REQ_AGENT_MEMORY_ID: Memory ID for Data Requirements Agent
    CDE_AGENT_MEMORY_ID: Memory ID for CDE Identification Agent
    DQ_AGENT_MEMORY_ID: Memory ID for Data Quality Rule Agent
    LINEAGE_AGENT_MEMORY_ID: Memory ID for Lineage Mapping Agent
    ISSUE_AGENT_MEMORY_ID: Memory ID for Issue Management Agent
    DOC_AGENT_MEMORY_ID: Memory ID for Documentation Agent
    ORCHESTRATOR_MEMORY_ID: Memory ID for Governance Orchestrator
"""

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# Default configuration
DEFAULT_REGION = "us-west-2"
DEFAULT_RUNTIME = "PYTHON_3_12"
DEFAULT_IDLE_TIMEOUT = 900
DEFAULT_MAX_LIFETIME = 28800
DEFAULT_MEMORY_MODE = "STM_AND_LTM"
DEFAULT_EVENT_EXPIRY_DAYS = 365

# Agent configurations
AGENT_CONFIGS = [
    {
        "name": "RegulatoryIntelligenceAgent",
        "entrypoint": "agents/regulatory_intelligence_agent.py",
        "memory_env_var": "REGULATORY_AGENT_MEMORY_ID",
        "description": "Scans regulatory sources and maintains report catalog"
    },
    {
        "name": "DataRequirementsAgent",
        "entrypoint": "agents/data_requirements_agent.py",
        "memory_env_var": "DATA_REQ_AGENT_MEMORY_ID",
        "description": "Parses regulatory templates and maps data elements"
    },
    {
        "name": "CDEIdentificationAgent",
        "entrypoint": "agents/cde_identification_agent.py",
        "memory_env_var": "CDE_AGENT_MEMORY_ID",
        "description": "Scores and identifies critical data elements"
    },
    {
        "name": "DataQualityRuleAgent",
        "entrypoint": "agents/data_quality_rule_agent.py",
        "memory_env_var": "DQ_AGENT_MEMORY_ID",
        "description": "Generates and executes data quality validation rules"
    },
    {
        "name": "LineageMappingAgent",
        "entrypoint": "agents/lineage_mapping_agent.py",
        "memory_env_var": "LINEAGE_AGENT_MEMORY_ID",
        "description": "Captures and analyzes data lineage"
    },
    {
        "name": "IssueManagementAgent",
        "entrypoint": "agents/issue_management_agent.py",
        "memory_env_var": "ISSUE_AGENT_MEMORY_ID",
        "description": "Tracks and helps resolve data issues"
    },
    {
        "name": "DocumentationAgent",
        "entrypoint": "agents/documentation_agent.py",
        "memory_env_var": "DOC_AGENT_MEMORY_ID",
        "description": "Generates compliance documentation and artifacts"
    },
    {
        "name": "GovernanceOrchestrator",
        "entrypoint": "agents/governance_orchestrator.py",
        "memory_env_var": "ORCHESTRATOR_MEMORY_ID",
        "description": "Coordinates all agents through the governance workflow"
    },
]


@dataclass
class DeployedAgent:
    """Represents a deployed AgentCore agent."""
    name: str
    agent_id: str
    arn: str
    status: str
    endpoint: Optional[str] = None


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def run_agentcore_command(
    args: list[str],
    capture_output: bool = True
) -> subprocess.CompletedProcess:
    """
    Run an AgentCore CLI command.
    
    Args:
        args: Command arguments
        capture_output: Whether to capture stdout/stderr
        
    Returns:
        CompletedProcess result
    """
    cmd = ["agentcore"] + args
    print(f"Running: {' '.join(cmd)}")
    
    result = subprocess.run(
        cmd,
        capture_output=capture_output,
        text=True
    )
    
    if result.returncode != 0:
        print(f"Error: {result.stderr}", file=sys.stderr)
    
    return result


def check_agentcore_cli() -> bool:
    """Check if AgentCore CLI is installed and available."""
    try:
        result = subprocess.run(
            ["agentcore", "--version"],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except FileNotFoundError:
        return False


def validate_environment() -> dict[str, str]:
    """
    Validate that all required environment variables are set.
    
    Returns:
        Dictionary of environment variable names to values
    """
    print("\n=== Validating Environment ===")
    
    env_vars = {}
    missing = []
    
    for config in AGENT_CONFIGS:
        env_var = config["memory_env_var"]
        value = os.environ.get(env_var)
        
        if value:
            env_vars[env_var] = value
            print(f"✓ {env_var}: {value[:20]}...")
        else:
            missing.append(env_var)
            print(f"✗ {env_var}: NOT SET")
    
    if missing:
        print(f"\nWarning: {len(missing)} memory IDs not set")
        print("Run setup_memory.py first or set environment variables")
    
    return env_vars


def deploy_agent(
    name: str,
    entrypoint: str,
    memory_id: Optional[str],
    region: str,
    runtime: str = DEFAULT_RUNTIME,
    idle_timeout: int = DEFAULT_IDLE_TIMEOUT,
    max_lifetime: int = DEFAULT_MAX_LIFETIME
) -> Optional[DeployedAgent]:
    """
    Deploy a single agent to AgentCore Runtime.
    
    Args:
        name: Agent name
        entrypoint: Path to agent entrypoint file
        memory_id: AgentCore Memory ID
        region: AWS region
        runtime: Runtime environment
        idle_timeout: Idle timeout in seconds
        max_lifetime: Maximum lifetime in seconds
        
    Returns:
        DeployedAgent if successful, None otherwise
        
    Requirements: 14.1, 14.2
    """
    print(f"\n=== Deploying Agent: {name} ===")
    print(f"Entrypoint: {entrypoint}")
    print(f"Runtime: {runtime}")
    print(f"Memory ID: {memory_id or 'NOT SET'}")
    
    args = [
        "agent", "deploy",
        "--name", name,
        "--entrypoint", entrypoint,
        "--runtime", runtime,
        "--idle-timeout", str(idle_timeout),
        "--max-lifetime", str(max_lifetime),
        "--region", region
    ]
    
    if memory_id:
        args.extend(["--memory-id", memory_id])
        args.extend(["--memory-mode", DEFAULT_MEMORY_MODE])
    
    result = run_agentcore_command(args)
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            agent = DeployedAgent(
                name=name,
                agent_id=output.get("agentId", ""),
                arn=output.get("agentArn", ""),
                status=output.get("status", "DEPLOYING"),
                endpoint=output.get("endpoint")
            )
            print(f"✓ Agent deployed: {agent.agent_id}")
            return agent
        except json.JSONDecodeError:
            print(f"✓ Agent deployed (output: {result.stdout})")
            return DeployedAgent(
                name=name,
                agent_id=result.stdout.strip(),
                arn="",
                status="DEPLOYING"
            )
    else:
        # Check if agent already exists
        if "already exists" in result.stderr.lower():
            print(f"Agent '{name}' already exists. Updating...")
            return update_agent(name, entrypoint, memory_id, region, runtime)
        return None


def update_agent(
    name: str,
    entrypoint: str,
    memory_id: Optional[str],
    region: str,
    runtime: str = DEFAULT_RUNTIME
) -> Optional[DeployedAgent]:
    """
    Update an existing agent deployment.
    
    Args:
        name: Agent name
        entrypoint: Path to agent entrypoint file
        memory_id: AgentCore Memory ID
        region: AWS region
        runtime: Runtime environment
        
    Returns:
        DeployedAgent if successful, None otherwise
    """
    print(f"\n=== Updating Agent: {name} ===")
    
    args = [
        "agent", "update",
        "--name", name,
        "--entrypoint", entrypoint,
        "--runtime", runtime,
        "--region", region
    ]
    
    if memory_id:
        args.extend(["--memory-id", memory_id])
    
    result = run_agentcore_command(args)
    
    if result.returncode == 0:
        print(f"✓ Agent updated: {name}")
        return get_agent_status(name, region)
    return None


def get_agent_status(name: str, region: str) -> Optional[DeployedAgent]:
    """
    Get the status of a deployed agent.
    
    Args:
        name: Agent name
        region: AWS region
        
    Returns:
        DeployedAgent if found, None otherwise
    """
    result = run_agentcore_command([
        "agent", "describe",
        "--name", name,
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            return DeployedAgent(
                name=name,
                agent_id=output.get("agentId", ""),
                arn=output.get("agentArn", ""),
                status=output.get("status", "UNKNOWN"),
                endpoint=output.get("endpoint")
            )
        except json.JSONDecodeError:
            return None
    return None


def wait_for_agent_ready(
    name: str,
    region: str,
    timeout: int = 300,
    poll_interval: int = 10
) -> bool:
    """
    Wait for an agent to become ready.
    
    Args:
        name: Agent name
        region: AWS region
        timeout: Maximum wait time in seconds
        poll_interval: Time between status checks
        
    Returns:
        True if agent is ready, False if timeout
    """
    print(f"\n=== Waiting for Agent: {name} ===")
    
    start_time = time.time()
    
    while time.time() - start_time < timeout:
        agent = get_agent_status(name, region)
        
        if agent:
            print(f"  Status: {agent.status}")
            
            if agent.status in ["ACTIVE", "READY", "RUNNING"]:
                print(f"✓ Agent '{name}' is ready")
                return True
            elif agent.status in ["FAILED", "ERROR"]:
                print(f"✗ Agent '{name}' failed to deploy")
                return False
        
        time.sleep(poll_interval)
    
    print(f"✗ Timeout waiting for agent '{name}'")
    return False


def health_check_agent(name: str, region: str) -> bool:
    """
    Perform a health check on a deployed agent.
    
    Args:
        name: Agent name
        region: AWS region
        
    Returns:
        True if health check passes, False otherwise
        
    Requirements: 14.2
    """
    print(f"\n=== Health Check: {name} ===")
    
    # First check agent status
    agent = get_agent_status(name, region)
    
    if not agent:
        print(f"✗ Agent '{name}' not found")
        return False
    
    if agent.status not in ["ACTIVE", "READY", "RUNNING"]:
        print(f"✗ Agent '{name}' is not active (status: {agent.status})")
        return False
    
    # Try to invoke the agent with a simple health check prompt
    result = run_agentcore_command([
        "agent", "invoke",
        "--name", name,
        "--region", region,
        "--payload", json.dumps({
            "prompt": "Health check - respond with OK",
            "session_id": "health-check",
            "actor_id": "system"
        })
    ])
    
    if result.returncode == 0:
        print(f"✓ Health check passed for '{name}'")
        return True
    else:
        print(f"✗ Health check failed for '{name}'")
        return False


def list_agents(region: str) -> list[dict]:
    """
    List all deployed agents.
    
    Args:
        region: AWS region
        
    Returns:
        List of agent dictionaries
    """
    print(f"\n=== Listing Deployed Agents ===")
    
    result = run_agentcore_command([
        "agent", "list",
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            agents = output.get("agents", [])
            print(f"✓ Found {len(agents)} agents")
            return agents
        except json.JSONDecodeError:
            return []
    return []


def delete_agent(name: str, region: str) -> bool:
    """
    Delete a deployed agent.
    
    Args:
        name: Agent name
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    print(f"\n=== Deleting Agent: {name} ===")
    
    result = run_agentcore_command([
        "agent", "delete",
        "--name", name,
        "--region", region,
        "--force"
    ])
    
    if result.returncode == 0:
        print(f"✓ Agent '{name}' deleted")
        return True
    return False


def generate_deployment_report(agents: list[DeployedAgent]) -> Path:
    """
    Generate a deployment report.
    
    Args:
        agents: List of deployed agents
        
    Returns:
        Path to the generated report file
    """
    report_file = get_project_root() / ".deployment_report.json"
    
    report = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "agents": [
            {
                "name": agent.name,
                "agent_id": agent.agent_id,
                "arn": agent.arn,
                "status": agent.status,
                "endpoint": agent.endpoint
            }
            for agent in agents
        ],
        "summary": {
            "total": len(agents),
            "active": sum(1 for a in agents if a.status in ["ACTIVE", "READY", "RUNNING"]),
            "failed": sum(1 for a in agents if a.status in ["FAILED", "ERROR"])
        }
    }
    
    with open(report_file, "w") as f:
        json.dump(report, f, indent=2)
    
    print(f"\n✓ Deployment report generated: {report_file}")
    return report_file


def generate_env_file(agents: list[DeployedAgent]) -> Path:
    """
    Generate environment variables file with agent endpoints.
    
    Args:
        agents: List of deployed agents
        
    Returns:
        Path to the generated env file
    """
    env_file = get_project_root() / ".env.agents"
    
    env_content = """# AgentCore Agent Configuration
# Generated by deploy_agents.py

"""
    
    for agent in agents:
        env_name = agent.name.upper().replace("-", "_")
        env_content += f"# {agent.name}\n"
        env_content += f"{env_name}_ID={agent.agent_id}\n"
        if agent.endpoint:
            env_content += f"{env_name}_ENDPOINT={agent.endpoint}\n"
        env_content += "\n"
    
    with open(env_file, "w") as f:
        f.write(env_content)
    
    print(f"✓ Environment file generated: {env_file}")
    return env_file


def print_summary(agents: list[DeployedAgent]) -> None:
    """
    Print a deployment summary.
    
    Args:
        agents: List of deployed agents
    """
    print("\n" + "=" * 70)
    print("Deployment Summary")
    print("=" * 70)
    print(f"\n{'Agent':<35} {'Status':<15} {'Agent ID':<20}")
    print("-" * 70)
    
    for agent in agents:
        status_icon = "✓" if agent.status in ["ACTIVE", "READY", "RUNNING"] else "✗"
        print(f"{status_icon} {agent.name:<33} {agent.status:<15} {agent.agent_id[:18]:<20}")
    
    active = sum(1 for a in agents if a.status in ["ACTIVE", "READY", "RUNNING"])
    print(f"\nTotal: {len(agents)} | Active: {active} | Failed: {len(agents) - active}")
    print("=" * 70)


def print_manual_instructions() -> None:
    """Print manual setup instructions when CLI is not available."""
    print("""
=== Manual Deployment Instructions ===

If the AgentCore CLI is not available, you can deploy agents using
the AWS Console or AWS CLI:

1. Deploy Agent:
   aws bedrock-agentcore-control deploy-agent \\
     --name <agent-name> \\
     --entrypoint <path-to-entrypoint> \\
     --runtime PYTHON_3_12 \\
     --memory-id <memory-id> \\
     --idle-timeout 900 \\
     --max-lifetime 28800

2. List Agents:
   aws bedrock-agentcore-control list-agents

3. Get Agent Status:
   aws bedrock-agentcore-control describe-agent \\
     --name <agent-name>

4. Invoke Agent:
   aws bedrock-agentcore-control invoke-agent \\
     --name <agent-name> \\
     --payload '{"prompt": "test"}'

Required Agents:
""")
    
    for config in AGENT_CONFIGS:
        print(f"  - {config['name']}: {config['description']}")
    
    print("""
For more information, see:
https://docs.aws.amazon.com/bedrock/latest/agentcore/runtime.html
""")


def deploy_all_agents(
    region: str,
    env_vars: dict[str, str],
    skip_health_check: bool = False,
    wait_for_ready: bool = True
) -> list[DeployedAgent]:
    """
    Deploy all 8 governance agents.
    
    Args:
        region: AWS region
        env_vars: Dictionary of environment variables
        skip_health_check: Skip health check verification
        wait_for_ready: Wait for agents to become ready
        
    Returns:
        List of DeployedAgent objects
        
    Requirements: 14.1, 14.2
    """
    deployed_agents = []
    
    for config in AGENT_CONFIGS:
        memory_id = env_vars.get(config["memory_env_var"])
        
        agent = deploy_agent(
            name=config["name"],
            entrypoint=config["entrypoint"],
            memory_id=memory_id,
            region=region
        )
        
        if agent:
            deployed_agents.append(agent)
            
            # Wait for agent to be ready
            if wait_for_ready:
                if wait_for_agent_ready(config["name"], region):
                    # Update status
                    updated = get_agent_status(config["name"], region)
                    if updated:
                        agent.status = updated.status
                        agent.endpoint = updated.endpoint
            
            # Perform health check
            if not skip_health_check:
                health_check_agent(config["name"], region)
        else:
            print(f"✗ Failed to deploy {config['name']}")
    
    return deployed_agents


def main():
    """Main entry point for the deployment script."""
    parser = argparse.ArgumentParser(
        description="Deploy AgentCore agents for Data Governance"
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", DEFAULT_REGION),
        help=f"AWS region (default: {DEFAULT_REGION})"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing"
    )
    parser.add_argument(
        "--skip-cli-check",
        action="store_true",
        help="Skip AgentCore CLI availability check"
    )
    parser.add_argument(
        "--skip-health-check",
        action="store_true",
        help="Skip health check verification"
    )
    parser.add_argument(
        "--no-wait",
        action="store_true",
        help="Don't wait for agents to become ready"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List deployed agents"
    )
    parser.add_argument(
        "--delete-all",
        action="store_true",
        help="Delete all governance agents"
    )
    parser.add_argument(
        "--agent",
        help="Deploy a specific agent only"
    )
    parser.add_argument(
        "--health-check-only",
        action="store_true",
        help="Only run health checks on existing agents"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("AgentCore Agent Deployment")
    print("=" * 60)
    print(f"Region: {args.region}")
    print(f"Agents: {len(AGENT_CONFIGS)}")
    print("=" * 60)
    
    # Check for AgentCore CLI
    if not args.skip_cli_check and not args.dry_run:
        if not check_agentcore_cli():
            print("\nWarning: AgentCore CLI not found.")
            print_manual_instructions()
            return 1
    
    # Handle list command
    if args.list:
        agents = list_agents(args.region)
        for agent in agents:
            print(f"  - {agent.get('name', 'N/A')}: {agent.get('status', 'N/A')}")
        return 0
    
    # Handle delete command
    if args.delete_all:
        print("\n⚠️  WARNING: This will delete all governance agents!")
        confirm = input("Type 'DELETE' to confirm: ")
        if confirm != "DELETE":
            print("Aborted.")
            return 1
        
        for config in AGENT_CONFIGS:
            delete_agent(config["name"], args.region)
        return 0
    
    # Handle health check only
    if args.health_check_only:
        print("\n=== Running Health Checks ===")
        all_healthy = True
        for config in AGENT_CONFIGS:
            if not health_check_agent(config["name"], args.region):
                all_healthy = False
        return 0 if all_healthy else 1
    
    # Validate environment
    env_vars = validate_environment()
    
    # Dry run mode
    if args.dry_run:
        print("\n[DRY RUN MODE - Commands will be printed but not executed]")
        for config in AGENT_CONFIGS:
            memory_id = env_vars.get(config["memory_env_var"], "NOT_SET")
            print(f"\nWould deploy: {config['name']}")
            print(f"  Entrypoint: {config['entrypoint']}")
            print(f"  Memory ID: {memory_id}")
            print(f"  Runtime: {DEFAULT_RUNTIME}")
        return 0
    
    # Deploy specific agent
    if args.agent:
        config = next(
            (c for c in AGENT_CONFIGS if c["name"] == args.agent),
            None
        )
        if not config:
            print(f"Error: Agent '{args.agent}' not found")
            return 1
        
        memory_id = env_vars.get(config["memory_env_var"])
        agent = deploy_agent(
            name=config["name"],
            entrypoint=config["entrypoint"],
            memory_id=memory_id,
            region=args.region
        )
        
        if agent and not args.skip_health_check:
            wait_for_agent_ready(config["name"], args.region)
            health_check_agent(config["name"], args.region)
        
        return 0 if agent else 1
    
    # Deploy all agents
    agents = deploy_all_agents(
        region=args.region,
        env_vars=env_vars,
        skip_health_check=args.skip_health_check,
        wait_for_ready=not args.no_wait
    )
    
    if not agents:
        print("\nError: No agents were deployed", file=sys.stderr)
        return 1
    
    # Generate output files
    generate_deployment_report(agents)
    generate_env_file(agents)
    
    # Print summary
    print_summary(agents)
    
    print("\nNext steps:")
    print("1. Verify all agents are active and healthy")
    print("2. Configure Gateway to route tool calls")
    print("3. Test agent invocations with sample prompts")
    print("4. Set up monitoring and alerting")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
