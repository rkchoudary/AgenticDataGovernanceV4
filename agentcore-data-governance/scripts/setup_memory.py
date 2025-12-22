#!/usr/bin/env python3
"""
Memory Setup Script for AgentCore Data Governance.

This script creates all 8 AgentCore Memory resources for the governance agents
and outputs memory IDs for configuration.

Requirements: 13.1, 13.2
- Create AgentCore Memory resources for each agent with appropriate retention policies
- Use session_id for conversation grouping and actor_id for user identification

Usage:
    python scripts/setup_memory.py [options]
    
Environment Variables:
    AWS_REGION: AWS region for AgentCore (default: us-west-2)
    MEMORY_RETENTION_DAYS: Event retention period in days (default: 365)
"""

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


# Default configuration
DEFAULT_REGION = "us-west-2"
DEFAULT_RETENTION_DAYS = 365
DEFAULT_MEMORY_MODE = "STM_AND_LTM"

# Agent memory configurations
AGENT_MEMORY_CONFIGS = [
    {
        "name": "regulatory-intelligence-memory",
        "agent": "RegulatoryIntelligenceAgent",
        "env_var": "REGULATORY_AGENT_MEMORY_ID",
        "description": "Memory for Regulatory Intelligence Agent - stores regulatory scan results and catalog changes"
    },
    {
        "name": "data-requirements-memory",
        "agent": "DataRequirementsAgent",
        "env_var": "DATA_REQ_AGENT_MEMORY_ID",
        "description": "Memory for Data Requirements Agent - stores template parsing and data mapping results"
    },
    {
        "name": "cde-identification-memory",
        "agent": "CDEIdentificationAgent",
        "env_var": "CDE_AGENT_MEMORY_ID",
        "description": "Memory for CDE Identification Agent - stores CDE scoring and inventory data"
    },
    {
        "name": "data-quality-rule-memory",
        "agent": "DataQualityRuleAgent",
        "env_var": "DQ_AGENT_MEMORY_ID",
        "description": "Memory for Data Quality Rule Agent - stores DQ rules and execution results"
    },
    {
        "name": "lineage-mapping-memory",
        "agent": "LineageMappingAgent",
        "env_var": "LINEAGE_AGENT_MEMORY_ID",
        "description": "Memory for Lineage Mapping Agent - stores lineage graphs and impact analysis"
    },
    {
        "name": "issue-management-memory",
        "agent": "IssueManagementAgent",
        "env_var": "ISSUE_AGENT_MEMORY_ID",
        "description": "Memory for Issue Management Agent - stores issues and resolution history"
    },
    {
        "name": "documentation-memory",
        "agent": "DocumentationAgent",
        "env_var": "DOC_AGENT_MEMORY_ID",
        "description": "Memory for Documentation Agent - stores generated documents and compliance packages"
    },
    {
        "name": "governance-orchestrator-memory",
        "agent": "GovernanceOrchestrator",
        "env_var": "ORCHESTRATOR_MEMORY_ID",
        "description": "Memory for Governance Orchestrator - stores workflow state and human task history"
    },
]


@dataclass
class MemoryResource:
    """Represents a created AgentCore Memory resource."""
    name: str
    memory_id: str
    arn: str
    agent: str
    env_var: str


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


def create_memory_resource(
    name: str,
    region: str,
    retention_days: int,
    memory_mode: str,
    description: Optional[str] = None
) -> Optional[dict]:
    """
    Create a new AgentCore Memory resource.
    
    Args:
        name: Name for the memory resource
        region: AWS region
        retention_days: Event retention period in days
        memory_mode: Memory mode (STM_AND_LTM, STM_ONLY, LTM_ONLY)
        description: Optional description
        
    Returns:
        Dictionary with memory_id and arn if successful, None otherwise
        
    Requirements: 13.1
    """
    print(f"\n=== Creating Memory Resource: {name} ===")
    print(f"Region: {region}")
    print(f"Retention: {retention_days} days")
    print(f"Mode: {memory_mode}")
    
    args = [
        "memory", "create",
        "--name", name,
        "--region", region,
        "--mode", memory_mode,
        "--event-expiry-days", str(retention_days)
    ]
    
    if description:
        args.extend(["--description", description])
    
    result = run_agentcore_command(args)
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            memory_id = output.get("memoryId")
            arn = output.get("memoryArn")
            print(f"✓ Memory created: {memory_id}")
            return {"memory_id": memory_id, "arn": arn}
        except json.JSONDecodeError:
            # Try to extract memory ID from plain text output
            print(f"✓ Memory created (output: {result.stdout})")
            return {"memory_id": result.stdout.strip(), "arn": ""}
    else:
        # Check if memory already exists
        if "already exists" in result.stderr.lower():
            print(f"Memory '{name}' already exists. Retrieving ID...")
            return get_memory_resource(name, region)
        return None


def get_memory_resource(name: str, region: str) -> Optional[dict]:
    """
    Get an existing AgentCore Memory resource.
    
    Args:
        name: Name of the memory resource
        region: AWS region
        
    Returns:
        Dictionary with memory_id and arn if found, None otherwise
    """
    result = run_agentcore_command([
        "memory", "get",
        "--name", name,
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            return {
                "memory_id": output.get("memoryId"),
                "arn": output.get("memoryArn")
            }
        except json.JSONDecodeError:
            return None
    return None


def delete_memory_resource(name: str, region: str) -> bool:
    """
    Delete an AgentCore Memory resource.
    
    Args:
        name: Name of the memory resource
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    print(f"\n=== Deleting Memory Resource: {name} ===")
    
    result = run_agentcore_command([
        "memory", "delete",
        "--name", name,
        "--region", region,
        "--force"
    ])
    
    if result.returncode == 0:
        print(f"✓ Memory '{name}' deleted")
        return True
    return False


def list_memory_resources(region: str) -> list[dict]:
    """
    List all AgentCore Memory resources.
    
    Args:
        region: AWS region
        
    Returns:
        List of memory resource dictionaries
    """
    print(f"\n=== Listing Memory Resources ===")
    
    result = run_agentcore_command([
        "memory", "list",
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            memories = output.get("memories", [])
            print(f"✓ Found {len(memories)} memory resources")
            return memories
        except json.JSONDecodeError:
            return []
    return []


def verify_memory_resource(name: str, region: str) -> bool:
    """
    Verify a memory resource is properly configured.
    
    Args:
        name: Name of the memory resource
        region: AWS region
        
    Returns:
        True if verification passes, False otherwise
    """
    result = run_agentcore_command([
        "memory", "describe",
        "--name", name,
        "--region", region
    ])
    
    if result.returncode == 0:
        print(f"✓ Memory '{name}' verification passed")
        try:
            output = json.loads(result.stdout)
            print(f"  Status: {output.get('status', 'N/A')}")
            print(f"  Mode: {output.get('mode', 'N/A')}")
            print(f"  Retention: {output.get('eventExpiryDays', 'N/A')} days")
        except json.JSONDecodeError:
            pass
        return True
    return False


def generate_env_file(memories: list[MemoryResource]) -> Path:
    """
    Generate environment variables file with memory IDs.
    
    Args:
        memories: List of created memory resources
        
    Returns:
        Path to the generated env file
    """
    env_file = get_project_root() / ".env.memory"
    
    env_content = """# AgentCore Memory Configuration
# Generated by setup_memory.py
# Add these to your .env file or export them before running agents

"""
    
    for memory in memories:
        env_content += f"# {memory.agent}\n"
        env_content += f"{memory.env_var}={memory.memory_id}\n\n"
    
    with open(env_file, "w") as f:
        f.write(env_content)
    
    print(f"\n✓ Environment file generated: {env_file}")
    return env_file


def generate_yaml_config(memories: list[MemoryResource]) -> Path:
    """
    Generate YAML configuration snippet for .bedrock_agentcore.yaml.
    
    Args:
        memories: List of created memory resources
        
    Returns:
        Path to the generated config file
    """
    config_file = get_project_root() / ".memory_config.yaml"
    
    yaml_content = """# Memory Configuration for .bedrock_agentcore.yaml
# Copy the memory_id values to your agent configurations

"""
    
    for memory in memories:
        yaml_content += f"""# {memory.agent}
# memory_id: {memory.memory_id}
# arn: {memory.arn}

"""
    
    with open(config_file, "w") as f:
        f.write(yaml_content)
    
    print(f"✓ YAML config generated: {config_file}")
    return config_file


def print_summary(memories: list[MemoryResource]) -> None:
    """
    Print a summary of created memory resources.
    
    Args:
        memories: List of created memory resources
    """
    print("\n" + "=" * 70)
    print("Memory Setup Summary")
    print("=" * 70)
    print(f"\n{'Agent':<35} {'Memory ID':<40}")
    print("-" * 70)
    
    for memory in memories:
        print(f"{memory.agent:<35} {memory.memory_id:<40}")
    
    print("\n" + "=" * 70)


def print_manual_instructions() -> None:
    """Print manual setup instructions when CLI is not available."""
    print("""
=== Manual Setup Instructions ===

If the AgentCore CLI is not available, you can set up Memory resources
using the AWS Console or AWS CLI:

1. Create Memory Resource:
   aws bedrock-agentcore-control create-memory \\
     --name <memory-name> \\
     --mode STM_AND_LTM \\
     --event-expiry-days 365

2. List Memory Resources:
   aws bedrock-agentcore-control list-memories

3. Get Memory Details:
   aws bedrock-agentcore-control get-memory \\
     --name <memory-name>

Required Memory Resources:
""")
    
    for config in AGENT_MEMORY_CONFIGS:
        print(f"  - {config['name']}: {config['description']}")
    
    print("""
For more information, see:
https://docs.aws.amazon.com/bedrock/latest/agentcore/memory.html
""")


def setup_all_memories(
    region: str,
    retention_days: int,
    memory_mode: str
) -> list[MemoryResource]:
    """
    Create all 8 AgentCore Memory resources.
    
    Args:
        region: AWS region
        retention_days: Event retention period in days
        memory_mode: Memory mode
        
    Returns:
        List of created MemoryResource objects
        
    Requirements: 13.1, 13.2
    """
    created_memories = []
    
    for config in AGENT_MEMORY_CONFIGS:
        result = create_memory_resource(
            name=config["name"],
            region=region,
            retention_days=retention_days,
            memory_mode=memory_mode,
            description=config["description"]
        )
        
        if result:
            memory = MemoryResource(
                name=config["name"],
                memory_id=result["memory_id"],
                arn=result.get("arn", ""),
                agent=config["agent"],
                env_var=config["env_var"]
            )
            created_memories.append(memory)
            
            # Verify the memory resource
            verify_memory_resource(config["name"], region)
        else:
            print(f"✗ Failed to create memory for {config['agent']}")
    
    return created_memories


def main():
    """Main entry point for the setup script."""
    parser = argparse.ArgumentParser(
        description="Set up AgentCore Memory resources for Data Governance agents"
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", DEFAULT_REGION),
        help=f"AWS region (default: {DEFAULT_REGION})"
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=int(os.environ.get("MEMORY_RETENTION_DAYS", DEFAULT_RETENTION_DAYS)),
        help=f"Event retention period in days (default: {DEFAULT_RETENTION_DAYS})"
    )
    parser.add_argument(
        "--memory-mode",
        choices=["STM_AND_LTM", "STM_ONLY", "LTM_ONLY"],
        default=DEFAULT_MEMORY_MODE,
        help=f"Memory mode (default: {DEFAULT_MEMORY_MODE})"
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
        "--list",
        action="store_true",
        help="List existing memory resources"
    )
    parser.add_argument(
        "--delete-all",
        action="store_true",
        help="Delete all governance memory resources"
    )
    parser.add_argument(
        "--output-format",
        choices=["env", "yaml", "json", "all"],
        default="all",
        help="Output format for memory IDs (default: all)"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("AgentCore Memory Setup")
    print("=" * 60)
    print(f"Region: {args.region}")
    print(f"Retention: {args.retention_days} days")
    print(f"Memory Mode: {args.memory_mode}")
    print(f"Agents: {len(AGENT_MEMORY_CONFIGS)}")
    print("=" * 60)
    
    # Check for AgentCore CLI
    if not args.skip_cli_check and not args.dry_run:
        if not check_agentcore_cli():
            print("\nWarning: AgentCore CLI not found.")
            print_manual_instructions()
            return 1
    
    # Handle list command
    if args.list:
        memories = list_memory_resources(args.region)
        for mem in memories:
            print(f"  - {mem.get('name', 'N/A')}: {mem.get('memoryId', 'N/A')}")
        return 0
    
    # Handle delete command
    if args.delete_all:
        print("\n⚠️  WARNING: This will delete all governance memory resources!")
        confirm = input("Type 'DELETE' to confirm: ")
        if confirm != "DELETE":
            print("Aborted.")
            return 1
        
        for config in AGENT_MEMORY_CONFIGS:
            delete_memory_resource(config["name"], args.region)
        return 0
    
    # Dry run mode
    if args.dry_run:
        print("\n[DRY RUN MODE - Commands will be printed but not executed]")
        for config in AGENT_MEMORY_CONFIGS:
            print(f"\nWould create memory: {config['name']}")
            print(f"  Agent: {config['agent']}")
            print(f"  Env Var: {config['env_var']}")
            print(f"  Description: {config['description']}")
        return 0
    
    # Create all memory resources
    memories = setup_all_memories(
        region=args.region,
        retention_days=args.retention_days,
        memory_mode=args.memory_mode
    )
    
    if not memories:
        print("\nError: No memory resources were created", file=sys.stderr)
        return 1
    
    # Generate output files
    if args.output_format in ["env", "all"]:
        generate_env_file(memories)
    
    if args.output_format in ["yaml", "all"]:
        generate_yaml_config(memories)
    
    if args.output_format in ["json", "all"]:
        json_file = get_project_root() / ".memory_config.json"
        with open(json_file, "w") as f:
            json.dump(
                {m.env_var: m.memory_id for m in memories},
                f,
                indent=2
            )
        print(f"✓ JSON config generated: {json_file}")
    
    # Print summary
    print_summary(memories)
    
    print("\nNext steps:")
    print("1. Copy the memory IDs to your .env file or export them")
    print("2. Update .bedrock_agentcore.yaml with the memory IDs")
    print("3. Deploy agents with the configured memory resources")
    print("4. Verify memory persistence by running test conversations")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
