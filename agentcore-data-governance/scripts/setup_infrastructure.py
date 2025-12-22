#!/usr/bin/env python3
"""
Full Infrastructure Setup Script for AgentCore Data Governance.

This script orchestrates the complete setup of AgentCore infrastructure:
- Memory resources for all 8 agents
- Policy Engine with Cedar policies
- Identity Provider configuration
- Gateway with tool targets
- Agent Runtime deployment
- IAM role configuration

Requirements: 13.1, 14.1, 15.1, 16.1, 17.1, 18.1
- Combined script for Memory, Policy, Identity, Gateway, and Runtime setup
- Include IAM role configuration

Usage:
    python scripts/setup_infrastructure.py [options]
    
Environment Variables:
    AWS_REGION: AWS region for AgentCore (default: us-west-2)
    AWS_ACCOUNT_ID: AWS account ID for IAM role ARNs
"""

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# Default configuration
DEFAULT_REGION = "us-west-2"
DEFAULT_PROJECT_NAME = "governance"

# IAM role configurations
IAM_ROLES = [
    {
        "name": "AgentCoreExecutionRole",
        "description": "Execution role for AgentCore agents",
        "trust_policy": {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        },
        "managed_policies": [
            "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        ]
    },
    {
        "name": "AgentCoreMemoryRole",
        "description": "Role for AgentCore Memory access",
        "trust_policy": {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        },
        "managed_policies": []
    },
    {
        "name": "AgentCoreGatewayRole",
        "description": "Role for AgentCore Gateway tool invocations",
        "trust_policy": {
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "bedrock-agentcore.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        },
        "managed_policies": [
            "arn:aws:iam::aws:policy/AWSLambda_ReadOnlyAccess"
        ]
    }
]


@dataclass
class InfrastructureState:
    """Tracks the state of infrastructure setup."""
    memory_ids: dict = field(default_factory=dict)
    policy_engine_arn: Optional[str] = None
    identity_provider_arn: Optional[str] = None
    gateway_arn: Optional[str] = None
    agent_arns: dict = field(default_factory=dict)
    iam_role_arns: dict = field(default_factory=dict)
    errors: list = field(default_factory=list)


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def run_command(
    cmd: list[str],
    capture_output: bool = True,
    check: bool = False
) -> subprocess.CompletedProcess:
    """Run a shell command."""
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=capture_output, text=True)
    if result.returncode != 0 and check:
        raise RuntimeError(f"Command failed: {result.stderr}")
    return result


def run_agentcore_command(args: list[str]) -> subprocess.CompletedProcess:
    """Run an AgentCore CLI command."""
    return run_command(["agentcore"] + args)


def run_aws_command(args: list[str]) -> subprocess.CompletedProcess:
    """Run an AWS CLI command."""
    return run_command(["aws"] + args)


def check_prerequisites() -> dict[str, bool]:
    """Check that all required tools are available."""
    print("\n=== Checking Prerequisites ===")
    
    checks = {}
    
    # Check AgentCore CLI
    try:
        result = subprocess.run(
            ["agentcore", "--version"],
            capture_output=True, text=True
        )
        checks["agentcore_cli"] = result.returncode == 0
    except FileNotFoundError:
        checks["agentcore_cli"] = False
    
    # Check AWS CLI
    try:
        result = subprocess.run(
            ["aws", "--version"],
            capture_output=True, text=True
        )
        checks["aws_cli"] = result.returncode == 0
    except FileNotFoundError:
        checks["aws_cli"] = False
    
    # Check AWS credentials
    try:
        result = subprocess.run(
            ["aws", "sts", "get-caller-identity"],
            capture_output=True, text=True
        )
        checks["aws_credentials"] = result.returncode == 0
        if checks["aws_credentials"]:
            identity = json.loads(result.stdout)
            print(f"  AWS Account: {identity.get('Account', 'N/A')}")
    except (FileNotFoundError, json.JSONDecodeError):
        checks["aws_credentials"] = False
    
    for check, passed in checks.items():
        status = "✓" if passed else "✗"
        print(f"  {status} {check}")
    
    return checks


def setup_iam_roles(
    project_name: str,
    region: str,
    account_id: Optional[str] = None
) -> dict[str, str]:
    """
    Create IAM roles for AgentCore components.
    
    Args:
        project_name: Project name prefix for roles
        region: AWS region
        account_id: AWS account ID
        
    Returns:
        Dictionary of role names to ARNs
        
    Requirements: 13.1, 14.1
    """
    print("\n=== Setting Up IAM Roles ===")
    
    role_arns = {}
    
    for role_config in IAM_ROLES:
        role_name = f"{project_name}-{role_config['name']}"
        print(f"\nCreating role: {role_name}")
        
        # Create the role
        result = run_aws_command([
            "iam", "create-role",
            "--role-name", role_name,
            "--assume-role-policy-document", json.dumps(role_config["trust_policy"]),
            "--description", role_config["description"],
            "--region", region
        ])
        
        if result.returncode == 0:
            try:
                output = json.loads(result.stdout)
                role_arn = output.get("Role", {}).get("Arn")
                role_arns[role_config["name"]] = role_arn
                print(f"✓ Role created: {role_arn}")
            except json.JSONDecodeError:
                print(f"✓ Role created")
        elif "EntityAlreadyExists" in result.stderr:
            # Role already exists, get its ARN
            get_result = run_aws_command([
                "iam", "get-role",
                "--role-name", role_name
            ])
            if get_result.returncode == 0:
                output = json.loads(get_result.stdout)
                role_arn = output.get("Role", {}).get("Arn")
                role_arns[role_config["name"]] = role_arn
                print(f"✓ Role exists: {role_arn}")
        else:
            print(f"✗ Failed to create role: {result.stderr}")
        
        # Attach managed policies
        for policy_arn in role_config.get("managed_policies", []):
            attach_result = run_aws_command([
                "iam", "attach-role-policy",
                "--role-name", role_name,
                "--policy-arn", policy_arn
            ])
            if attach_result.returncode == 0:
                print(f"  ✓ Attached policy: {policy_arn}")
    
    return role_arns


def setup_memory(region: str, state: InfrastructureState) -> None:
    """
    Set up AgentCore Memory resources.
    
    Args:
        region: AWS region
        state: Infrastructure state to update
        
    Requirements: 13.1, 13.2
    """
    print("\n" + "=" * 60)
    print("PHASE 1: Setting Up AgentCore Memory")
    print("=" * 60)
    
    # Import and run the memory setup script
    setup_script = get_project_root() / "scripts" / "setup_memory.py"
    
    result = run_command([
        sys.executable, str(setup_script),
        "--region", region,
        "--output-format", "json"
    ])
    
    if result.returncode == 0:
        # Read the generated JSON config
        config_file = get_project_root() / ".memory_config.json"
        if config_file.exists():
            with open(config_file) as f:
                state.memory_ids = json.load(f)
            print(f"✓ Memory setup complete: {len(state.memory_ids)} resources")
        else:
            print("✗ Memory config file not generated")
            state.errors.append("Memory setup failed - no config file")
    else:
        print(f"✗ Memory setup failed: {result.stderr}")
        state.errors.append(f"Memory setup failed: {result.stderr}")


def setup_policy_engine(region: str, state: InfrastructureState) -> None:
    """
    Set up AgentCore Policy Engine.
    
    Args:
        region: AWS region
        state: Infrastructure state to update
        
    Requirements: 15.1
    """
    print("\n" + "=" * 60)
    print("PHASE 2: Setting Up AgentCore Policy Engine")
    print("=" * 60)
    
    setup_script = get_project_root() / "scripts" / "setup_policy_engine.py"
    
    result = run_command([
        sys.executable, str(setup_script),
        "--region", region,
        "--enforcement-mode", "ENFORCE"
    ])
    
    if result.returncode == 0:
        # Read the generated env file
        env_file = get_project_root() / ".env.policy"
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.startswith("POLICY_ENGINE_ARN="):
                        state.policy_engine_arn = line.split("=", 1)[1].strip()
                        break
            print(f"✓ Policy Engine setup complete: {state.policy_engine_arn}")
        else:
            print("✗ Policy env file not generated")
            state.errors.append("Policy setup failed - no env file")
    else:
        print(f"✗ Policy Engine setup failed: {result.stderr}")
        state.errors.append(f"Policy Engine setup failed: {result.stderr}")


def setup_identity_provider(region: str, state: InfrastructureState) -> None:
    """
    Set up AgentCore Identity Provider.
    
    Args:
        region: AWS region
        state: Infrastructure state to update
        
    Requirements: 16.1
    """
    print("\n" + "=" * 60)
    print("PHASE 3: Setting Up AgentCore Identity Provider")
    print("=" * 60)
    
    # Create OAuth2 Credential Provider
    result = run_agentcore_command([
        "identity", "create-provider",
        "--name", "governance-identity-provider",
        "--type", "OAUTH2",
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            state.identity_provider_arn = output.get("providerArn")
            print(f"✓ Identity Provider created: {state.identity_provider_arn}")
        except json.JSONDecodeError:
            print(f"✓ Identity Provider created")
    elif "already exists" in result.stderr.lower():
        # Get existing provider
        get_result = run_agentcore_command([
            "identity", "get-provider",
            "--name", "governance-identity-provider",
            "--region", region
        ])
        if get_result.returncode == 0:
            try:
                output = json.loads(get_result.stdout)
                state.identity_provider_arn = output.get("providerArn")
                print(f"✓ Identity Provider exists: {state.identity_provider_arn}")
            except json.JSONDecodeError:
                print("✓ Identity Provider exists")
    else:
        print(f"✗ Identity Provider setup failed: {result.stderr}")
        state.errors.append(f"Identity Provider setup failed: {result.stderr}")


def setup_gateway(region: str, state: InfrastructureState) -> None:
    """
    Set up AgentCore Gateway with tool targets.
    
    Args:
        region: AWS region
        state: Infrastructure state to update
        
    Requirements: 18.1
    """
    print("\n" + "=" * 60)
    print("PHASE 4: Setting Up AgentCore Gateway")
    print("=" * 60)
    
    setup_script = get_project_root() / "scripts" / "setup_gateway.py"
    
    # Pass policy engine ARN if available
    args = [sys.executable, str(setup_script), "--region", region]
    if state.policy_engine_arn:
        args.extend(["--policy-engine-arn", state.policy_engine_arn])
    
    result = run_command(args)
    
    if result.returncode == 0:
        # Read the generated env file
        env_file = get_project_root() / ".env.gateway"
        if env_file.exists():
            with open(env_file) as f:
                for line in f:
                    if line.startswith("GATEWAY_ARN="):
                        state.gateway_arn = line.split("=", 1)[1].strip()
                        break
            print(f"✓ Gateway setup complete: {state.gateway_arn}")
        else:
            print("✓ Gateway setup complete")
    else:
        print(f"✗ Gateway setup failed: {result.stderr}")
        state.errors.append(f"Gateway setup failed: {result.stderr}")


def deploy_agents(region: str, state: InfrastructureState) -> None:
    """
    Deploy all governance agents to AgentCore Runtime.
    
    Args:
        region: AWS region
        state: Infrastructure state to update
        
    Requirements: 14.1, 14.2
    """
    print("\n" + "=" * 60)
    print("PHASE 5: Deploying Agents to AgentCore Runtime")
    print("=" * 60)
    
    # Set memory IDs as environment variables
    env = os.environ.copy()
    env.update(state.memory_ids)
    
    deploy_script = get_project_root() / "scripts" / "deploy_agents.py"
    
    result = subprocess.run(
        [sys.executable, str(deploy_script), "--region", region],
        capture_output=True,
        text=True,
        env=env
    )
    
    if result.returncode == 0:
        # Read the deployment report
        report_file = get_project_root() / ".deployment_report.json"
        if report_file.exists():
            with open(report_file) as f:
                report = json.load(f)
                for agent in report.get("agents", []):
                    state.agent_arns[agent["name"]] = agent.get("arn", "")
            print(f"✓ Agent deployment complete: {len(state.agent_arns)} agents")
        else:
            print("✓ Agent deployment complete")
    else:
        print(f"✗ Agent deployment failed: {result.stderr}")
        state.errors.append(f"Agent deployment failed: {result.stderr}")


def setup_observability(region: str, state: InfrastructureState) -> None:
    """
    Configure observability settings.
    
    Args:
        region: AWS region
        state: Infrastructure state to update
        
    Requirements: 17.1
    """
    print("\n" + "=" * 60)
    print("PHASE 6: Configuring Observability")
    print("=" * 60)
    
    # Create CloudWatch log group for governance agents
    log_group_name = "/aws/agentcore/governance"
    
    result = run_aws_command([
        "logs", "create-log-group",
        "--log-group-name", log_group_name,
        "--region", region
    ])
    
    if result.returncode == 0:
        print(f"✓ Log group created: {log_group_name}")
    elif "ResourceAlreadyExistsException" in result.stderr:
        print(f"✓ Log group exists: {log_group_name}")
    else:
        print(f"Warning: Could not create log group: {result.stderr}")
    
    # Set retention policy
    run_aws_command([
        "logs", "put-retention-policy",
        "--log-group-name", log_group_name,
        "--retention-in-days", "365",
        "--region", region
    ])
    
    print("✓ Observability configuration complete")


def generate_state_file(state: InfrastructureState) -> Path:
    """
    Generate infrastructure state file.
    
    Args:
        state: Infrastructure state
        
    Returns:
        Path to the generated state file
    """
    state_file = get_project_root() / ".infrastructure_state.json"
    
    state_data = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "memory_ids": state.memory_ids,
        "policy_engine_arn": state.policy_engine_arn,
        "identity_provider_arn": state.identity_provider_arn,
        "gateway_arn": state.gateway_arn,
        "agent_arns": state.agent_arns,
        "iam_role_arns": state.iam_role_arns,
        "errors": state.errors
    }
    
    with open(state_file, "w") as f:
        json.dump(state_data, f, indent=2)
    
    print(f"\n✓ Infrastructure state saved: {state_file}")
    return state_file


def generate_env_file(state: InfrastructureState) -> Path:
    """
    Generate combined environment variables file.
    
    Args:
        state: Infrastructure state
        
    Returns:
        Path to the generated env file
    """
    env_file = get_project_root() / ".env.infrastructure"
    
    env_content = """# AgentCore Infrastructure Configuration
# Generated by setup_infrastructure.py
# Add these to your .env file or export them

"""
    
    # Memory IDs
    env_content += "# Memory IDs\n"
    for key, value in state.memory_ids.items():
        env_content += f"{key}={value}\n"
    env_content += "\n"
    
    # Policy Engine
    if state.policy_engine_arn:
        env_content += f"# Policy Engine\nPOLICY_ENGINE_ARN={state.policy_engine_arn}\n\n"
    
    # Identity Provider
    if state.identity_provider_arn:
        env_content += f"# Identity Provider\nIDENTITY_PROVIDER_ARN={state.identity_provider_arn}\n\n"
    
    # Gateway
    if state.gateway_arn:
        env_content += f"# Gateway\nGATEWAY_ARN={state.gateway_arn}\n\n"
    
    # IAM Roles
    if state.iam_role_arns:
        env_content += "# IAM Roles\n"
        for role_name, role_arn in state.iam_role_arns.items():
            env_name = role_name.upper().replace("-", "_") + "_ARN"
            env_content += f"{env_name}={role_arn}\n"
        env_content += "\n"
    
    with open(env_file, "w") as f:
        f.write(env_content)
    
    print(f"✓ Environment file generated: {env_file}")
    return env_file


def print_summary(state: InfrastructureState) -> None:
    """
    Print infrastructure setup summary.
    
    Args:
        state: Infrastructure state
    """
    print("\n" + "=" * 70)
    print("Infrastructure Setup Summary")
    print("=" * 70)
    
    # Memory
    print(f"\nMemory Resources: {len(state.memory_ids)}")
    for key, value in state.memory_ids.items():
        print(f"  ✓ {key}: {value[:30]}...")
    
    # Policy Engine
    print(f"\nPolicy Engine: {'✓ Configured' if state.policy_engine_arn else '✗ Not configured'}")
    if state.policy_engine_arn:
        print(f"  ARN: {state.policy_engine_arn}")
    
    # Identity Provider
    print(f"\nIdentity Provider: {'✓ Configured' if state.identity_provider_arn else '✗ Not configured'}")
    if state.identity_provider_arn:
        print(f"  ARN: {state.identity_provider_arn}")
    
    # Gateway
    print(f"\nGateway: {'✓ Configured' if state.gateway_arn else '✗ Not configured'}")
    if state.gateway_arn:
        print(f"  ARN: {state.gateway_arn}")
    
    # Agents
    print(f"\nDeployed Agents: {len(state.agent_arns)}")
    for name, arn in state.agent_arns.items():
        print(f"  ✓ {name}")
    
    # IAM Roles
    print(f"\nIAM Roles: {len(state.iam_role_arns)}")
    for name, arn in state.iam_role_arns.items():
        print(f"  ✓ {name}")
    
    # Errors
    if state.errors:
        print(f"\n⚠️  Errors ({len(state.errors)}):")
        for error in state.errors:
            print(f"  ✗ {error}")
    
    print("\n" + "=" * 70)


def print_manual_instructions() -> None:
    """Print manual setup instructions when prerequisites are not met."""
    print("""
=== Manual Setup Instructions ===

If the AgentCore CLI or AWS CLI is not available, you can set up
infrastructure using the AWS Console:

1. AgentCore Memory:
   - Navigate to Amazon Bedrock > AgentCore > Memory
   - Create 8 memory resources (one per agent)
   - Note the memory IDs for configuration

2. AgentCore Policy Engine:
   - Navigate to Amazon Bedrock > AgentCore > Policy
   - Create a policy engine with Cedar policies
   - Set enforcement mode to ENFORCE

3. AgentCore Identity:
   - Navigate to Amazon Bedrock > AgentCore > Identity
   - Create an OAuth2 credential provider
   - Configure user federation settings

4. AgentCore Gateway:
   - Navigate to Amazon Bedrock > AgentCore > Gateway
   - Create a gateway with tool targets
   - Associate with Policy Engine

5. AgentCore Runtime:
   - Navigate to Amazon Bedrock > AgentCore > Runtime
   - Deploy each agent with its entrypoint
   - Configure memory and timeout settings

6. IAM Roles:
   - Create execution roles for AgentCore
   - Attach required policies

For more information, see:
https://docs.aws.amazon.com/bedrock/latest/agentcore/
""")


def main():
    """Main entry point for the infrastructure setup script."""
    parser = argparse.ArgumentParser(
        description="Set up complete AgentCore infrastructure for Data Governance"
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", DEFAULT_REGION),
        help=f"AWS region (default: {DEFAULT_REGION})"
    )
    parser.add_argument(
        "--project-name",
        default=DEFAULT_PROJECT_NAME,
        help=f"Project name prefix (default: {DEFAULT_PROJECT_NAME})"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print commands without executing"
    )
    parser.add_argument(
        "--skip-prerequisites",
        action="store_true",
        help="Skip prerequisite checks"
    )
    parser.add_argument(
        "--skip-iam",
        action="store_true",
        help="Skip IAM role creation"
    )
    parser.add_argument(
        "--skip-memory",
        action="store_true",
        help="Skip Memory setup"
    )
    parser.add_argument(
        "--skip-policy",
        action="store_true",
        help="Skip Policy Engine setup"
    )
    parser.add_argument(
        "--skip-identity",
        action="store_true",
        help="Skip Identity Provider setup"
    )
    parser.add_argument(
        "--skip-gateway",
        action="store_true",
        help="Skip Gateway setup"
    )
    parser.add_argument(
        "--skip-agents",
        action="store_true",
        help="Skip agent deployment"
    )
    parser.add_argument(
        "--skip-observability",
        action="store_true",
        help="Skip observability configuration"
    )
    parser.add_argument(
        "--phase",
        choices=["iam", "memory", "policy", "identity", "gateway", "agents", "observability"],
        help="Run only a specific phase"
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("AgentCore Infrastructure Setup")
    print("=" * 70)
    print(f"Region: {args.region}")
    print(f"Project: {args.project_name}")
    print("=" * 70)
    
    # Check prerequisites
    if not args.skip_prerequisites and not args.dry_run:
        checks = check_prerequisites()
        if not all(checks.values()):
            print("\n⚠️  Some prerequisites are not met.")
            print_manual_instructions()
            if not checks.get("aws_credentials"):
                print("Error: AWS credentials are required")
                return 1
    
    # Dry run mode
    if args.dry_run:
        print("\n[DRY RUN MODE - Commands will be printed but not executed]")
        print("\nWould execute the following phases:")
        print("  1. IAM Role Creation")
        print("  2. Memory Setup (8 resources)")
        print("  3. Policy Engine Setup")
        print("  4. Identity Provider Setup")
        print("  5. Gateway Setup")
        print("  6. Agent Deployment (8 agents)")
        print("  7. Observability Configuration")
        return 0
    
    # Initialize state
    state = InfrastructureState()
    
    # Run specific phase if requested
    if args.phase:
        if args.phase == "iam":
            state.iam_role_arns = setup_iam_roles(args.project_name, args.region)
        elif args.phase == "memory":
            setup_memory(args.region, state)
        elif args.phase == "policy":
            setup_policy_engine(args.region, state)
        elif args.phase == "identity":
            setup_identity_provider(args.region, state)
        elif args.phase == "gateway":
            setup_gateway(args.region, state)
        elif args.phase == "agents":
            deploy_agents(args.region, state)
        elif args.phase == "observability":
            setup_observability(args.region, state)
        
        generate_state_file(state)
        return 0 if not state.errors else 1
    
    # Run all phases
    try:
        # Phase 0: IAM Roles
        if not args.skip_iam:
            state.iam_role_arns = setup_iam_roles(args.project_name, args.region)
        
        # Phase 1: Memory
        if not args.skip_memory:
            setup_memory(args.region, state)
        
        # Phase 2: Policy Engine
        if not args.skip_policy:
            setup_policy_engine(args.region, state)
        
        # Phase 3: Identity Provider
        if not args.skip_identity:
            setup_identity_provider(args.region, state)
        
        # Phase 4: Gateway
        if not args.skip_gateway:
            setup_gateway(args.region, state)
        
        # Phase 5: Agent Deployment
        if not args.skip_agents:
            deploy_agents(args.region, state)
        
        # Phase 6: Observability
        if not args.skip_observability:
            setup_observability(args.region, state)
        
    except Exception as e:
        print(f"\n✗ Error during setup: {e}")
        state.errors.append(str(e))
    
    # Generate output files
    generate_state_file(state)
    generate_env_file(state)
    
    # Print summary
    print_summary(state)
    
    # Print next steps
    print("\nNext steps:")
    print("1. Review the generated .env.infrastructure file")
    print("2. Copy environment variables to your .env file")
    print("3. Verify all agents are healthy with: python scripts/deploy_agents.py --health-check-only")
    print("4. Test agent invocations with sample prompts")
    print("5. Configure monitoring dashboards in CloudWatch")
    
    return 0 if not state.errors else 1


if __name__ == "__main__":
    sys.exit(main())
