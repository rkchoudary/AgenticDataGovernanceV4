#!/usr/bin/env python3
"""
Gateway Setup Script for AgentCore Data Governance.

This script creates and configures the AgentCore Gateway with targets
for regulatory scanner, lineage tool, and notification service.

Requirements: 18.2, 18.5
- Create gateway and add targets
- Configure Lambda and OpenAPI targets
- Associate with Policy Engine

Usage:
    python scripts/setup_gateway.py [options]
    
Environment Variables:
    AWS_REGION: AWS region for AgentCore (default: us-west-2)
    POLICY_ENGINE_NAME: Name of the Policy Engine to associate
    REGULATORY_SCANNER_LAMBDA_ARN: ARN of the regulatory scanner Lambda
    LINEAGE_TOOL_OPENAPI_URL: URL of the lineage tool OpenAPI spec
    NOTIFICATION_LAMBDA_ARN: ARN of the notification service Lambda
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
DEFAULT_GATEWAY_NAME = "governance-gateway"
DEFAULT_POLICY_ENGINE_NAME = "governance-policy-engine"


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


def create_gateway(
    gateway_name: str,
    policy_engine_name: Optional[str],
    region: str
) -> Optional[str]:
    """
    Create a new AgentCore Gateway.
    
    Args:
        gateway_name: Name for the Gateway
        policy_engine_name: Name of the Policy Engine to associate
        region: AWS region
        
    Returns:
        Gateway ARN if successful, None otherwise
        
    Requirements: 18.1, 18.2
    """
    print(f"\n=== Creating Gateway: {gateway_name} ===")
    print(f"Region: {region}")
    if policy_engine_name:
        print(f"Policy Engine: {policy_engine_name}")
    
    args = [
        "gateway", "create",
        "--name", gateway_name,
        "--region", region
    ]
    
    if policy_engine_name:
        args.extend(["--policy-engine", policy_engine_name])
    
    result = run_agentcore_command(args)
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            gateway_arn = output.get("gatewayArn")
            print(f"✓ Gateway created: {gateway_arn}")
            return gateway_arn
        except json.JSONDecodeError:
            print(f"✓ Gateway created (output: {result.stdout})")
            return result.stdout.strip()
    else:
        # Check if gateway already exists
        if "already exists" in result.stderr.lower():
            print(f"Gateway '{gateway_name}' already exists. Retrieving ARN...")
            return get_gateway_arn(gateway_name, region)
        return None


def get_gateway_arn(gateway_name: str, region: str) -> Optional[str]:
    """
    Get the ARN of an existing Gateway.
    
    Args:
        gateway_name: Name of the Gateway
        region: AWS region
        
    Returns:
        Gateway ARN if found, None otherwise
    """
    result = run_agentcore_command([
        "gateway", "get",
        "--name", gateway_name,
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            return output.get("gatewayArn")
        except json.JSONDecodeError:
            return None
    return None


def add_lambda_target(
    gateway_name: str,
    target_name: str,
    function_arn: str,
    region: str,
    description: Optional[str] = None
) -> bool:
    """
    Add a Lambda function target to the Gateway.
    
    Args:
        gateway_name: Name of the Gateway
        target_name: Name for the target
        function_arn: ARN of the Lambda function
        region: AWS region
        description: Optional description
        
    Returns:
        True if successful, False otherwise
        
    Requirements: 18.2, 18.5
    """
    print(f"\n=== Adding Lambda Target: {target_name} ===")
    print(f"Function ARN: {function_arn}")
    
    args = [
        "gateway", "add-target",
        "--gateway", gateway_name,
        "--name", target_name,
        "--type", "lambda",
        "--function-arn", function_arn,
        "--region", region
    ]
    
    if description:
        args.extend(["--description", description])
    
    result = run_agentcore_command(args)
    
    if result.returncode == 0:
        print(f"✓ Lambda target '{target_name}' added successfully")
        return True
    else:
        if "already exists" in result.stderr.lower():
            print(f"Target '{target_name}' already exists. Updating...")
            return update_target(gateway_name, target_name, function_arn, region)
        return False


def add_openapi_target(
    gateway_name: str,
    target_name: str,
    spec_url: str,
    region: str,
    description: Optional[str] = None
) -> bool:
    """
    Add an OpenAPI specification target to the Gateway.
    
    Args:
        gateway_name: Name of the Gateway
        target_name: Name for the target
        spec_url: URL to the OpenAPI specification
        region: AWS region
        description: Optional description
        
    Returns:
        True if successful, False otherwise
        
    Requirements: 18.2, 18.5
    """
    print(f"\n=== Adding OpenAPI Target: {target_name} ===")
    print(f"Spec URL: {spec_url}")
    
    args = [
        "gateway", "add-target",
        "--gateway", gateway_name,
        "--name", target_name,
        "--type", "openapi",
        "--spec-url", spec_url,
        "--region", region
    ]
    
    if description:
        args.extend(["--description", description])
    
    result = run_agentcore_command(args)
    
    if result.returncode == 0:
        print(f"✓ OpenAPI target '{target_name}' added successfully")
        return True
    else:
        if "already exists" in result.stderr.lower():
            print(f"Target '{target_name}' already exists.")
            return True
        return False


def update_target(
    gateway_name: str,
    target_name: str,
    function_arn: str,
    region: str
) -> bool:
    """
    Update an existing Gateway target.
    
    Args:
        gateway_name: Name of the Gateway
        target_name: Name of the target
        function_arn: New function ARN
        region: AWS region
        
    Returns:
        True if successful, False otherwise
    """
    print(f"\n=== Updating Target: {target_name} ===")
    
    result = run_agentcore_command([
        "gateway", "update-target",
        "--gateway", gateway_name,
        "--name", target_name,
        "--function-arn", function_arn,
        "--region", region
    ])
    
    if result.returncode == 0:
        print(f"✓ Target '{target_name}' updated successfully")
        return True
    return False


def list_gateway_tools(gateway_name: str, region: str) -> list[str]:
    """
    List all tools available through the Gateway.
    
    Args:
        gateway_name: Name of the Gateway
        region: AWS region
        
    Returns:
        List of tool names
    """
    print(f"\n=== Listing Gateway Tools ===")
    
    result = run_agentcore_command([
        "gateway", "list-tools",
        "--gateway", gateway_name,
        "--region", region
    ])
    
    if result.returncode == 0:
        try:
            output = json.loads(result.stdout)
            tools = output.get("tools", [])
            print(f"✓ Found {len(tools)} tools")
            for tool in tools:
                print(f"  - {tool.get('name', 'unknown')}")
            return [t.get("name") for t in tools]
        except json.JSONDecodeError:
            print(result.stdout)
            return []
    return []


def verify_gateway(gateway_name: str, region: str) -> bool:
    """
    Verify the Gateway is properly configured.
    
    Args:
        gateway_name: Name of the Gateway
        region: AWS region
        
    Returns:
        True if verification passes, False otherwise
    """
    print(f"\n=== Verifying Gateway ===")
    
    result = run_agentcore_command([
        "gateway", "describe",
        "--name", gateway_name,
        "--region", region
    ])
    
    if result.returncode == 0:
        print("✓ Gateway verification passed")
        try:
            output = json.loads(result.stdout)
            print(f"  Name: {output.get('name', 'N/A')}")
            print(f"  Status: {output.get('status', 'N/A')}")
            print(f"  Policy Engine: {output.get('policyEngine', 'N/A')}")
            print(f"  Target Count: {output.get('targetCount', 'N/A')}")
        except json.JSONDecodeError:
            pass
        return True
    return False


def generate_env_file(
    gateway_arn: str,
    gateway_name: str,
    targets: dict[str, str]
) -> None:
    """
    Generate environment variables file for the Gateway.
    
    Args:
        gateway_arn: ARN of the Gateway
        gateway_name: Name of the Gateway
        targets: Dictionary of target names to ARNs/URLs
    """
    env_file = get_project_root() / ".env.gateway"
    
    env_content = f"""# AgentCore Gateway Configuration
# Generated by setup_gateway.py

GOVERNANCE_GATEWAY_ARN={gateway_arn}
GOVERNANCE_GATEWAY_NAME={gateway_name}
"""
    
    for name, value in targets.items():
        env_content += f"{name}={value}\n"
    
    with open(env_file, "w") as f:
        f.write(env_content)
    
    print(f"\n✓ Environment file generated: {env_file}")


def print_manual_instructions() -> None:
    """Print manual setup instructions when CLI is not available."""
    print("""
=== Manual Setup Instructions ===

If the AgentCore CLI is not available, you can set up the Gateway
using the AWS Console or AWS CLI:

1. Create Gateway:
   aws bedrock-agentcore-control create-gateway \\
     --name governance-gateway \\
     --policy-engine-name governance-policy-engine

2. Add Lambda Target (Regulatory Scanner):
   aws bedrock-agentcore-control add-gateway-target \\
     --gateway-name governance-gateway \\
     --target-name regulatory-scanner \\
     --target-type LAMBDA \\
     --lambda-config functionArn=${REGULATORY_SCANNER_LAMBDA_ARN}

3. Add OpenAPI Target (Lineage Tool):
   aws bedrock-agentcore-control add-gateway-target \\
     --gateway-name governance-gateway \\
     --target-name lineage-tool \\
     --target-type OPENAPI \\
     --openapi-config specUrl=${LINEAGE_TOOL_OPENAPI_URL}

4. Add Lambda Target (Notification Service):
   aws bedrock-agentcore-control add-gateway-target \\
     --gateway-name governance-gateway \\
     --target-name notification-service \\
     --target-type LAMBDA \\
     --lambda-config functionArn=${NOTIFICATION_LAMBDA_ARN}

5. List Available Tools:
   aws bedrock-agentcore-control list-gateway-tools \\
     --gateway-name governance-gateway

For more information, see:
https://docs.aws.amazon.com/bedrock/latest/agentcore/gateway.html
""")


def setup_default_targets(
    gateway_name: str,
    region: str,
    regulatory_scanner_arn: Optional[str] = None,
    lineage_tool_url: Optional[str] = None,
    notification_arn: Optional[str] = None
) -> dict[str, bool]:
    """
    Set up the default Gateway targets for governance tools.
    
    Args:
        gateway_name: Name of the Gateway
        region: AWS region
        regulatory_scanner_arn: ARN of the regulatory scanner Lambda
        lineage_tool_url: URL of the lineage tool OpenAPI spec
        notification_arn: ARN of the notification service Lambda
        
    Returns:
        Dictionary of target names to success status
        
    Requirements: 18.5
    """
    results = {}
    
    # Add regulatory scanner target
    if regulatory_scanner_arn:
        results["regulatory-scanner"] = add_lambda_target(
            gateway_name=gateway_name,
            target_name="regulatory-scanner",
            function_arn=regulatory_scanner_arn,
            region=region,
            description="Scan regulatory body websites for updates and changes"
        )
    else:
        print("\nSkipping regulatory-scanner target (no ARN provided)")
        results["regulatory-scanner"] = False
    
    # Add lineage tool target
    if lineage_tool_url:
        results["lineage-tool"] = add_openapi_target(
            gateway_name=gateway_name,
            target_name="lineage-tool",
            spec_url=lineage_tool_url,
            region=region,
            description="Import and manage data lineage from external lineage tools"
        )
    else:
        print("\nSkipping lineage-tool target (no URL provided)")
        results["lineage-tool"] = False
    
    # Add notification service target
    if notification_arn:
        results["notification-service"] = add_lambda_target(
            gateway_name=gateway_name,
            target_name="notification-service",
            function_arn=notification_arn,
            region=region,
            description="Send notifications to stakeholders via email, Slack, etc."
        )
    else:
        print("\nSkipping notification-service target (no ARN provided)")
        results["notification-service"] = False
    
    return results


def main():
    """Main entry point for the setup script."""
    parser = argparse.ArgumentParser(
        description="Set up AgentCore Gateway for Data Governance"
    )
    parser.add_argument(
        "--gateway-name",
        default=DEFAULT_GATEWAY_NAME,
        help=f"Gateway name (default: {DEFAULT_GATEWAY_NAME})"
    )
    parser.add_argument(
        "--policy-engine",
        default=os.environ.get("POLICY_ENGINE_NAME", DEFAULT_POLICY_ENGINE_NAME),
        help=f"Policy Engine name (default: {DEFAULT_POLICY_ENGINE_NAME})"
    )
    parser.add_argument(
        "--region",
        default=os.environ.get("AWS_REGION", DEFAULT_REGION),
        help=f"AWS region (default: {DEFAULT_REGION})"
    )
    parser.add_argument(
        "--regulatory-scanner-arn",
        default=os.environ.get("REGULATORY_SCANNER_LAMBDA_ARN"),
        help="ARN of the regulatory scanner Lambda"
    )
    parser.add_argument(
        "--lineage-tool-url",
        default=os.environ.get("LINEAGE_TOOL_OPENAPI_URL"),
        help="URL of the lineage tool OpenAPI spec"
    )
    parser.add_argument(
        "--notification-arn",
        default=os.environ.get("NOTIFICATION_LAMBDA_ARN"),
        help="ARN of the notification service Lambda"
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
        "--skip-targets",
        action="store_true",
        help="Skip adding targets (create gateway only)"
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("AgentCore Gateway Setup")
    print("=" * 60)
    print(f"Gateway Name: {args.gateway_name}")
    print(f"Policy Engine: {args.policy_engine}")
    print(f"Region: {args.region}")
    print("=" * 60)
    
    # Check for AgentCore CLI
    if not args.skip_cli_check and not args.dry_run:
        if not check_agentcore_cli():
            print("\nWarning: AgentCore CLI not found.")
            print_manual_instructions()
            return 1
    
    if args.dry_run:
        print("\n[DRY RUN MODE - Commands will be printed but not executed]")
        print(f"\nWould create gateway: {args.gateway_name}")
        print(f"Would associate with policy engine: {args.policy_engine}")
        if not args.skip_targets:
            if args.regulatory_scanner_arn:
                print(f"Would add regulatory-scanner target: {args.regulatory_scanner_arn}")
            if args.lineage_tool_url:
                print(f"Would add lineage-tool target: {args.lineage_tool_url}")
            if args.notification_arn:
                print(f"Would add notification-service target: {args.notification_arn}")
        return 0
    
    # Create gateway
    gateway_arn = create_gateway(
        args.gateway_name,
        args.policy_engine,
        args.region
    )
    
    if not gateway_arn:
        print("\nError: Failed to create gateway", file=sys.stderr)
        return 1
    
    # Add targets
    target_results = {}
    if not args.skip_targets:
        target_results = setup_default_targets(
            gateway_name=args.gateway_name,
            region=args.region,
            regulatory_scanner_arn=args.regulatory_scanner_arn,
            lineage_tool_url=args.lineage_tool_url,
            notification_arn=args.notification_arn
        )
    
    # List available tools
    list_gateway_tools(args.gateway_name, args.region)
    
    # Verify setup
    verify_gateway(args.gateway_name, args.region)
    
    # Generate environment file
    targets_env = {}
    if args.regulatory_scanner_arn:
        targets_env["REGULATORY_SCANNER_LAMBDA_ARN"] = args.regulatory_scanner_arn
    if args.lineage_tool_url:
        targets_env["LINEAGE_TOOL_OPENAPI_URL"] = args.lineage_tool_url
    if args.notification_arn:
        targets_env["NOTIFICATION_LAMBDA_ARN"] = args.notification_arn
    
    generate_env_file(gateway_arn, args.gateway_name, targets_env)
    
    # Print summary
    print("\n" + "=" * 60)
    print("Gateway Setup Complete!")
    print("=" * 60)
    print(f"\nGateway ARN: {gateway_arn}")
    
    if target_results:
        print("\nTarget Status:")
        for target, success in target_results.items():
            status = "✓" if success else "✗"
            print(f"  {status} {target}")
    
    print("\nNext steps:")
    print("1. Ensure Lambda functions are deployed and accessible")
    print("2. Verify OpenAPI specifications are available at the configured URLs")
    print("3. Test tool invocation through the Gateway")
    print("4. Configure agents to use the Gateway for external tool access")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
