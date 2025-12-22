#!/usr/bin/env python3
"""
Policy Engine Setup Script for AgentCore Data Governance.

This script creates and configures the AgentCore Policy Engine with
Cedar policies for governance operations.

Requirements: 15.1, 15.4
- Create policy engine with ENFORCE mode
- Add Cedar policies to engine
- Log policy evaluation results to CloudWatch for audit

Usage:
    python scripts/setup_policy_engine.py [--enforcement-mode ENFORCE|PERMISSIVE]
    
Environment Variables:
    AWS_REGION: AWS region for AgentCore (default: us-west-2)
    GOVERNANCE_GATEWAY_ARN: ARN of the governance gateway
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional


# Default configuration
DEFAULT_REGION = "us-west-2"
DEFAULT_ENGINE_NAME = "governance-policy-engine"
DEFAULT_ENFORCEMENT_MODE = "ENFORCE"
POLICY_FILE_NAME = "governance_policies.cedar"


def get_project_root() -> Path:
    """Get the project root directory."""
    return Path(__file__).parent.parent


def get_policy_file_path() -> Path:
    """Get the path to the Cedar policy file."""
    return get_project_root() / "policies" / POLICY_FILE_NAME


def run_agentcore_command(args: list[str], capture_output: bool = True) -> subprocess.CompletedProcess:
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


def create_policy_engine(
    engine_name: str,
    enforcement_mode: str,
    region: str
) -> Optional[str]:
    """
    Create a new AgentCore Policy Engine.
    
    Args:
        engine_name: Name for the policy engine
        enforcement_mode: ENFORCE or PERMISSIVE
        region: AWS region
        
    Returns:
        Policy engine ARN if successful, None otherwise
    """
    print(f"\n=== Creating Policy Engine: {engine_name} ===")
    print(f"Enforcement Mode: {enforcement_mode}")
    print(f"Region: {region}")
    
    result = run_agentcore_command([
        "policy", "create-engine",
        "--name", engine_name,
        "--enforcement-mode", enforcement_mode,
        "--region", region
    ])
    
    if result.returncode == 0:
        # Parse the output to get the ARN
        try:
            output = json.loads(result.stdout)
            engine_arn = output.get("policyEngineArn")
            print(f"✓ Policy Engine created: {engine_arn}")
            return engine_arn
        except json.JSONDecodeError:
            print(f"✓ Policy Engine created (output: {result.stdout})")
            return result.stdout.strip()
    else:
        # Check if engine already exists
        if "already exists" in result.stderr.lower():
            print(f"Policy Engine '{engine_name}' already exists. Retrieving ARN...")
            return get_policy_engine_arn(engine_name, region)
        return None


def get_policy_engine_arn(engine_name: str, region: str) -> Optional[str]:
    """
    Get the ARN of an existing policy engine.
    
    Args:
        engine_name: Name of the policy engine
        region: AWS region
        
    Returns:
        Policy engine ARN if found, None otherwise
    """
    result = run_agentcore_command([
        "policy", "get-engine",
        "--name", engine_name,
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            return output.get("policyEngineArn")
        except json.JSONDecodeError:
            return None
    return None


def add_policy_to_engine(
    engine_name: str,
    policy_file: Path,
    region: str
) -> bool:
    """
    Add Cedar policies to the policy engine.
    
    Args:
        engine_name: Name of the policy engine
        policy_file: Path to the Cedar policy file
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    print(f"\n=== Adding Policies to Engine ===")
    print(f"Policy File: {policy_file}")
    
    if not policy_file.exists():
        print(f"Error: Policy file not found: {policy_file}", file=sys.stderr)
        return False
    
    result = run_agentcore_command([
        "policy", "add-policy",
        "--engine", engine_name,
        "--policy-file", str(policy_file),
        "--region", region
    ])
    
    if result.returncode == 0:
        print("✓ Policies added successfully")
        return True
    else:
        # Check if policies already exist
        if "already exists" in result.stderr.lower():
            print("Policies already exist. Updating...")
            return update_policy_in_engine(engine_name, policy_file, region)
        return False


def update_policy_in_engine(
    engine_name: str,
    policy_file: Path,
    region: str
) -> bool:
    """
    Update Cedar policies in the policy engine.
    
    Args:
        engine_name: Name of the policy engine
        policy_file: Path to the Cedar policy file
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    print(f"\n=== Updating Policies in Engine ===")
    
    result = run_agentcore_command([
        "policy", "update-policy",
        "--engine", engine_name,
        "--policy-file", str(policy_file),
        "--region", region
    ])
    
    if result.returncode == 0:
        print("✓ Policies updated successfully")
        return True
    return False


def configure_cloudwatch_logging(
    engine_name: str,
    region: str,
    log_group: str = "/agentcore/policy-engine/governance"
) -> bool:
    """
    Configure CloudWatch logging for policy evaluation results.
    
    Args:
        engine_name: Name of the policy engine
        region: AWS region
        log_group: CloudWatch log group name
        
    Returns:
        True if successful, False otherwise
        
    Requirements: 15.5
    """
    print(f"\n=== Configuring CloudWatch Logging ===")
    print(f"Log Group: {log_group}")
    
    result = run_agentcore_command([
        "policy", "configure-logging",
        "--engine", engine_name,
        "--log-group", log_group,
        "--region", region
    ])
    
    if result.returncode == 0:
        print("✓ CloudWatch logging configured")
        return True
    else:
        print("Note: CloudWatch logging configuration may require manual setup")
        return False


def verify_policy_engine(engine_name: str, region: str) -> bool:
    """
    Verify the policy engine is properly configured.
    
    Args:
        engine_name: Name of the policy engine
        region: AWS region
        
    Returns:
        True if verification passes, False otherwise
    """
    print(f"\n=== Verifying Policy Engine ===")
    
    result = run_agentcore_command([
        "policy", "describe-engine",
        "--name", engine_name,
        "--region", region
    ])
    
    if result.returncode == 0:
        print("✓ Policy Engine verification passed")
        try:
            output = json.loads(result.stdout)
            print(f"  Name: {output.get('name', 'N/A')}")
            print(f"  Status: {output.get('status', 'N/A')}")
            print(f"  Enforcement Mode: {output.get('enforcementMode', 'N/A')}")
            print(f"  Policy Count: {output.get('policyCount', 'N/A')}")
        except json.JSONDecodeError:
            pass
        return True
    return False


def generate_env_file(engine_arn: str, gateway_arn: Optional[str] = None) -> None:
    """
    Generate environment variables file for the policy engine.
    
    Args:
        engine_arn: ARN of the policy engine
        gateway_arn: ARN of the governance gateway (optional)
    """
    env_file = get_project_root() / ".env.policy"
    
    env_content = f"""# AgentCore Policy Engine Configuration
# Generated by setup_policy_engine.py

POLICY_ENGINE_ARN={engine_arn}
POLICY_ENGINE_NAME={DEFAULT_ENGINE_NAME}
"""
    
    if gateway_arn:
        env_content += f"GOVERNANCE_GATEWAY_ARN={gateway_arn}\n"
    
    with open(env_file, "w") as f:
        f.write(env_content)
    
    print(f"\n✓ Environment file generated: {env_file}")


def print_manual_instructions() -> None:
    """Print manual setup instructions when CLI is not available."""
    print("""
=== Manual Setup Instructions ===

If the AgentCore CLI is not available, you can set up the Policy Engine
using the AWS Console or AWS CLI:

1. Create Policy Engine:
   aws bedrock-agentcore-control create-policy-engine \\
     --name governance-policy-engine \\
     --enforcement-mode ENFORCE

2. Add Cedar Policies:
   aws bedrock-agentcore-control add-policy \\
     --policy-engine-name governance-policy-engine \\
     --policy-file file://policies/governance_policies.cedar

3. Configure CloudWatch Logging:
   aws bedrock-agentcore-control configure-policy-logging \\
     --policy-engine-name governance-policy-engine \\
     --log-group /agentcore/policy-engine/governance

4. Associate with Gateway:
   aws bedrock-agentcore-control update-gateway \\
     --gateway-name governance-gateway \\
     --policy-engine-name governance-policy-engine

For more information, see:
https://docs.aws.amazon.com/bedrock/latest/agentcore/policy-engine.html
""")


def main():
    """Main entry point for the setup script."""
    parser = argparse.ArgumentParser(
        description="Set up AgentCore Policy Engine for Data Governance"
    )
    parser.add_argument(
        "--enforcement-mode",
        choices=["ENFORCE", "PERMISSIVE"],
        default=DEFAULT_ENFORCEMENT_MODE,
        help="Policy enforcement mode (default: ENFORCE)"
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", DEFAULT_REGION),
        help=f"AWS region (default: {DEFAULT_REGION})"
    )
    parser.add_argument(
        "--engine-name",
        default=DEFAULT_ENGINE_NAME,
        help=f"Policy engine name (default: {DEFAULT_ENGINE_NAME})"
    )
    parser.add_argument(
        "--gateway-arn",
        default=os.environ.get("GOVERNANCE_GATEWAY_ARN"),
        help="ARN of the governance gateway"
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
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("AgentCore Policy Engine Setup")
    print("=" * 60)
    print(f"Engine Name: {args.engine_name}")
    print(f"Enforcement Mode: {args.enforcement_mode}")
    print(f"Region: {args.region}")
    print("=" * 60)
    
    # Check for AgentCore CLI
    if not args.skip_cli_check and not args.dry_run:
        if not check_agentcore_cli():
            print("\nWarning: AgentCore CLI not found.")
            print_manual_instructions()
            
            # Still generate the policy file location info
            policy_file = get_policy_file_path()
            print(f"\nCedar policy file location: {policy_file}")
            
            if policy_file.exists():
                print("✓ Policy file exists and is ready for deployment")
            else:
                print("✗ Policy file not found - please ensure it exists")
            
            return 1
    
    if args.dry_run:
        print("\n[DRY RUN MODE - Commands will be printed but not executed]")
        print(f"\nWould create policy engine: {args.engine_name}")
        print(f"Would add policies from: {get_policy_file_path()}")
        print(f"Would configure CloudWatch logging")
        return 0
    
    # Create policy engine
    engine_arn = create_policy_engine(
        args.engine_name,
        args.enforcement_mode,
        args.region
    )
    
    if not engine_arn:
        print("\nError: Failed to create policy engine", file=sys.stderr)
        return 1
    
    # Add policies
    policy_file = get_policy_file_path()
    if not add_policy_to_engine(args.engine_name, policy_file, args.region):
        print("\nWarning: Failed to add policies to engine", file=sys.stderr)
    
    # Configure CloudWatch logging
    configure_cloudwatch_logging(args.engine_name, args.region)
    
    # Verify setup
    verify_policy_engine(args.engine_name, args.region)
    
    # Generate environment file
    generate_env_file(engine_arn, args.gateway_arn)
    
    print("\n" + "=" * 60)
    print("Policy Engine Setup Complete!")
    print("=" * 60)
    print(f"\nPolicy Engine ARN: {engine_arn}")
    print("\nNext steps:")
    print("1. Associate the policy engine with your Gateway")
    print("2. Configure identity provider for user authentication")
    print("3. Test policy evaluation with sample requests")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
