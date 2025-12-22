"""
Gateway configuration for AgentCore Data Governance.

This module defines the Gateway configuration for MCP-compatible tool access
with Policy Engine enforcement.

Requirements: 18.1, 18.2, 18.4
- Create a Gateway with Policy Engine enforcement
- Support Lambda functions and OpenAPI specifications as tool sources
- Expose regulatory scanner, lineage tool, and notification service through Gateway
"""

import os
from typing import Literal, Optional, Any
from pydantic import BaseModel, Field
from enum import Enum
from datetime import datetime


class GatewayTargetType(str, Enum):
    """Types of targets that can be added to the Gateway."""
    LAMBDA = "lambda"
    OPENAPI = "openapi"
    HTTP = "http"


class GatewayStatus(str, Enum):
    """Status of the Gateway."""
    CREATING = "creating"
    ACTIVE = "active"
    UPDATING = "updating"
    DELETING = "deleting"
    FAILED = "failed"


class GatewayTarget(BaseModel):
    """
    Configuration for a Gateway target.
    
    A target represents an external tool or service that can be accessed
    through the Gateway.
    """
    name: str = Field(..., description="Unique name for the target")
    type: GatewayTargetType = Field(..., description="Type of target")
    description: str = Field(..., description="Description of the target's purpose")
    
    # Lambda target configuration
    function_arn: Optional[str] = Field(
        None, 
        description="ARN of the Lambda function (for lambda type)"
    )
    
    # OpenAPI target configuration
    spec_url: Optional[str] = Field(
        None,
        description="URL to the OpenAPI specification (for openapi type)"
    )
    spec_content: Optional[str] = Field(
        None,
        description="Inline OpenAPI specification content (for openapi type)"
    )
    
    # HTTP target configuration
    endpoint_url: Optional[str] = Field(
        None,
        description="HTTP endpoint URL (for http type)"
    )
    
    # Common configuration
    timeout_seconds: int = Field(
        default=30,
        description="Timeout for target invocation in seconds"
    )
    enabled: bool = Field(
        default=True,
        description="Whether the target is enabled"
    )
    
    def validate_config(self) -> bool:
        """Validate that required fields are set based on target type."""
        if self.type == GatewayTargetType.LAMBDA:
            return self.function_arn is not None
        elif self.type == GatewayTargetType.OPENAPI:
            return self.spec_url is not None or self.spec_content is not None
        elif self.type == GatewayTargetType.HTTP:
            return self.endpoint_url is not None
        return False


class GatewayConfig(BaseModel):
    """
    Configuration for the AgentCore Gateway.
    
    The Gateway provides MCP-compatible tool access with Policy Engine
    enforcement for secure external system integration.
    
    Requirements: 18.1, 18.2, 18.4
    """
    name: str = Field(
        default="governance-gateway",
        description="Name of the Gateway"
    )
    description: str = Field(
        default="Gateway for AgentCore Data Governance external tool access",
        description="Description of the Gateway"
    )
    policy_engine_name: Optional[str] = Field(
        default="governance-policy-engine",
        description="Name of the Policy Engine for authorization"
    )
    policy_engine_arn: Optional[str] = Field(
        None,
        description="ARN of the Policy Engine"
    )
    targets: list[GatewayTarget] = Field(
        default_factory=list,
        description="List of Gateway targets"
    )
    region: str = Field(
        default="us-west-2",
        description="AWS region for the Gateway"
    )
    status: GatewayStatus = Field(
        default=GatewayStatus.CREATING,
        description="Current status of the Gateway"
    )
    gateway_arn: Optional[str] = Field(
        None,
        description="ARN of the Gateway (set after creation)"
    )
    created_at: Optional[datetime] = Field(
        None,
        description="Timestamp when the Gateway was created"
    )
    updated_at: Optional[datetime] = Field(
        None,
        description="Timestamp when the Gateway was last updated"
    )


# Default Gateway targets for governance tools
# Requirements: 18.5 - Expose regulatory scanner, lineage tool, and notification service

REGULATORY_SCANNER_TARGET = GatewayTarget(
    name="regulatory-scanner",
    type=GatewayTargetType.LAMBDA,
    description="Scan regulatory body websites for updates and changes",
    function_arn="${REGULATORY_SCANNER_LAMBDA_ARN}",
    timeout_seconds=60,
    enabled=True
)

LINEAGE_TOOL_TARGET = GatewayTarget(
    name="lineage-tool",
    type=GatewayTargetType.OPENAPI,
    description="Import and manage data lineage from external lineage tools",
    spec_url="${LINEAGE_TOOL_OPENAPI_URL}",
    timeout_seconds=30,
    enabled=True
)

NOTIFICATION_SERVICE_TARGET = GatewayTarget(
    name="notification-service",
    type=GatewayTargetType.LAMBDA,
    description="Send notifications to stakeholders via email, Slack, etc.",
    function_arn="${NOTIFICATION_LAMBDA_ARN}",
    timeout_seconds=15,
    enabled=True
)

# Additional targets for extended functionality
DATA_CATALOG_TARGET = GatewayTarget(
    name="data-catalog",
    type=GatewayTargetType.OPENAPI,
    description="Access enterprise data catalog for metadata enrichment",
    spec_url="${DATA_CATALOG_OPENAPI_URL}",
    timeout_seconds=30,
    enabled=True
)

QUALITY_EXECUTION_TARGET = GatewayTarget(
    name="quality-execution",
    type=GatewayTargetType.LAMBDA,
    description="Execute data quality rules against data sources",
    function_arn="${QUALITY_EXECUTION_LAMBDA_ARN}",
    timeout_seconds=120,
    enabled=True
)


# Default targets list
DEFAULT_GATEWAY_TARGETS = [
    REGULATORY_SCANNER_TARGET,
    LINEAGE_TOOL_TARGET,
    NOTIFICATION_SERVICE_TARGET,
]


def create_default_gateway_config(
    name: str = "governance-gateway",
    policy_engine_name: str = "governance-policy-engine",
    region: Optional[str] = None,
    include_extended_targets: bool = False
) -> GatewayConfig:
    """
    Create a default Gateway configuration for governance tools.
    
    Args:
        name: Name for the Gateway
        policy_engine_name: Name of the Policy Engine to associate
        region: AWS region (defaults to AWS_REGION env var or us-west-2)
        include_extended_targets: Whether to include extended targets
        
    Returns:
        GatewayConfig with default targets configured
        
    Requirements: 18.1, 18.2, 18.4, 18.5
    """
    targets = list(DEFAULT_GATEWAY_TARGETS)
    
    if include_extended_targets:
        targets.extend([DATA_CATALOG_TARGET, QUALITY_EXECUTION_TARGET])
    
    return GatewayConfig(
        name=name,
        description="Gateway for AgentCore Data Governance external tool access",
        policy_engine_name=policy_engine_name,
        targets=targets,
        region=region or os.environ.get("AWS_REGION", "us-west-2"),
        status=GatewayStatus.CREATING,
        created_at=datetime.now()
    )


def resolve_target_arns(
    config: GatewayConfig,
    env_vars: Optional[dict[str, str]] = None
) -> GatewayConfig:
    """
    Resolve placeholder ARNs in target configurations from environment variables.
    
    Args:
        config: Gateway configuration with placeholder ARNs
        env_vars: Optional dictionary of environment variables (defaults to os.environ)
        
    Returns:
        GatewayConfig with resolved ARNs
    """
    env = env_vars or dict(os.environ)
    
    resolved_targets = []
    for target in config.targets:
        resolved_target = target.model_copy()
        
        # Resolve Lambda ARN
        if resolved_target.function_arn and resolved_target.function_arn.startswith("${"):
            var_name = resolved_target.function_arn[2:-1]  # Extract variable name
            resolved_target.function_arn = env.get(var_name, resolved_target.function_arn)
        
        # Resolve OpenAPI URL
        if resolved_target.spec_url and resolved_target.spec_url.startswith("${"):
            var_name = resolved_target.spec_url[2:-1]
            resolved_target.spec_url = env.get(var_name, resolved_target.spec_url)
        
        # Resolve HTTP endpoint
        if resolved_target.endpoint_url and resolved_target.endpoint_url.startswith("${"):
            var_name = resolved_target.endpoint_url[2:-1]
            resolved_target.endpoint_url = env.get(var_name, resolved_target.endpoint_url)
        
        resolved_targets.append(resolved_target)
    
    resolved_config = config.model_copy()
    resolved_config.targets = resolved_targets
    
    # Resolve Policy Engine ARN
    if config.policy_engine_arn and config.policy_engine_arn.startswith("${"):
        var_name = config.policy_engine_arn[2:-1]
        resolved_config.policy_engine_arn = env.get(var_name, config.policy_engine_arn)
    
    return resolved_config


class GatewayToolCall(BaseModel):
    """
    Represents a tool call routed through the Gateway.
    
    Requirements: 18.3 - Convert tool calls to MCP-compatible format
    """
    tool_name: str = Field(..., description="Name of the tool being called")
    target_name: str = Field(..., description="Name of the Gateway target")
    parameters: dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters for the tool call"
    )
    session_id: Optional[str] = Field(
        None,
        description="Session ID for correlation"
    )
    actor_id: Optional[str] = Field(
        None,
        description="Actor ID for audit"
    )
    timestamp: datetime = Field(
        default_factory=datetime.now,
        description="Timestamp of the tool call"
    )


class GatewayToolResult(BaseModel):
    """
    Result of a tool call through the Gateway.
    """
    tool_name: str = Field(..., description="Name of the tool that was called")
    target_name: str = Field(..., description="Name of the Gateway target")
    success: bool = Field(..., description="Whether the call succeeded")
    result: Optional[Any] = Field(
        None,
        description="Result data from the tool"
    )
    error: Optional[str] = Field(
        None,
        description="Error message if the call failed"
    )
    duration_ms: int = Field(
        default=0,
        description="Duration of the call in milliseconds"
    )
    policy_decision: Optional[str] = Field(
        None,
        description="Policy evaluation decision (allow/deny)"
    )
    timestamp: datetime = Field(
        default_factory=datetime.now,
        description="Timestamp of the result"
    )


class Gateway:
    """
    Gateway client for routing tool calls to external services.
    
    This class provides a programmatic interface for the AgentCore Gateway
    that mirrors the actual Gateway behavior for local development and testing.
    
    Requirements: 18.1, 18.2, 18.3, 18.4
    """
    
    def __init__(
        self,
        config: GatewayConfig,
        policy_engine: Optional[Any] = None
    ):
        """
        Initialize the Gateway.
        
        Args:
            config: Gateway configuration
            policy_engine: Optional PolicyEngine for authorization
        """
        self.config = config
        self.policy_engine = policy_engine
        self._targets: dict[str, GatewayTarget] = {
            t.name: t for t in config.targets
        }
        self._call_log: list[tuple[GatewayToolCall, GatewayToolResult]] = []
    
    def add_target(self, target: GatewayTarget) -> None:
        """
        Add a target to the Gateway.
        
        Args:
            target: Target configuration to add
        """
        if not target.validate_config():
            raise ValueError(f"Invalid target configuration for {target.name}")
        
        self._targets[target.name] = target
        self.config.targets.append(target)
        self.config.updated_at = datetime.now()
    
    def remove_target(self, target_name: str) -> bool:
        """
        Remove a target from the Gateway.
        
        Args:
            target_name: Name of the target to remove
            
        Returns:
            True if target was removed, False if not found
        """
        if target_name in self._targets:
            del self._targets[target_name]
            self.config.targets = [
                t for t in self.config.targets if t.name != target_name
            ]
            self.config.updated_at = datetime.now()
            return True
        return False
    
    def get_target(self, target_name: str) -> Optional[GatewayTarget]:
        """
        Get a target by name.
        
        Args:
            target_name: Name of the target
            
        Returns:
            GatewayTarget if found, None otherwise
        """
        return self._targets.get(target_name)
    
    def list_targets(self) -> list[GatewayTarget]:
        """
        List all targets in the Gateway.
        
        Returns:
            List of all Gateway targets
        """
        return list(self._targets.values())
    
    def list_tools(self) -> list[str]:
        """
        List all available tools through the Gateway.
        
        Returns:
            List of tool names (target names)
        """
        return [t.name for t in self._targets.values() if t.enabled]
    
    def invoke_tool(
        self,
        tool_call: GatewayToolCall,
        principal_role: Optional[str] = None
    ) -> GatewayToolResult:
        """
        Invoke a tool through the Gateway.
        
        This method:
        1. Validates the target exists and is enabled
        2. Evaluates policy if Policy Engine is configured
        3. Routes the call to the appropriate target
        4. Returns the result
        
        Args:
            tool_call: The tool call to execute
            principal_role: Role of the principal for policy evaluation
            
        Returns:
            GatewayToolResult with the outcome
            
        Requirements: 18.3, 18.4
        """
        start_time = datetime.now()
        
        # Check if target exists
        target = self._targets.get(tool_call.target_name)
        if not target:
            result = GatewayToolResult(
                tool_name=tool_call.tool_name,
                target_name=tool_call.target_name,
                success=False,
                error=f"Target '{tool_call.target_name}' not found",
                timestamp=datetime.now()
            )
            self._call_log.append((tool_call, result))
            return result
        
        # Check if target is enabled
        if not target.enabled:
            result = GatewayToolResult(
                tool_name=tool_call.tool_name,
                target_name=tool_call.target_name,
                success=False,
                error=f"Target '{tool_call.target_name}' is disabled",
                timestamp=datetime.now()
            )
            self._call_log.append((tool_call, result))
            return result
        
        # Evaluate policy if Policy Engine is configured
        policy_decision = "allow"
        if self.policy_engine and principal_role:
            # Use tool_name directly as the action for policy evaluation
            # Tool names should follow the format: ToolCategory__action_name
            # (e.g., IssueTools__escalate_issue, RegulatoryTools__approve_catalog)
            action = tool_call.tool_name
            eval_result = self.policy_engine.evaluate(
                principal_role=principal_role,
                action=action,
                resource=self.config.gateway_arn
            )
            policy_decision = eval_result.decision.value
            
            if policy_decision == "deny":
                result = GatewayToolResult(
                    tool_name=tool_call.tool_name,
                    target_name=tool_call.target_name,
                    success=False,
                    error=f"Policy denied: {eval_result.reason}",
                    policy_decision=policy_decision,
                    timestamp=datetime.now()
                )
                self._call_log.append((tool_call, result))
                return result
        
        # Route to target (simulated for local development)
        # In production, this would invoke the actual Lambda/HTTP/OpenAPI target
        try:
            # Simulate successful invocation
            result_data = self._simulate_target_invocation(target, tool_call)
            
            end_time = datetime.now()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            result = GatewayToolResult(
                tool_name=tool_call.tool_name,
                target_name=tool_call.target_name,
                success=True,
                result=result_data,
                duration_ms=duration_ms,
                policy_decision=policy_decision,
                timestamp=end_time
            )
        except Exception as e:
            end_time = datetime.now()
            duration_ms = int((end_time - start_time).total_seconds() * 1000)
            
            result = GatewayToolResult(
                tool_name=tool_call.tool_name,
                target_name=tool_call.target_name,
                success=False,
                error=str(e),
                duration_ms=duration_ms,
                policy_decision=policy_decision,
                timestamp=end_time
            )
        
        self._call_log.append((tool_call, result))
        return result
    
    def _simulate_target_invocation(
        self,
        target: GatewayTarget,
        tool_call: GatewayToolCall
    ) -> dict[str, Any]:
        """
        Simulate target invocation for local development.
        
        In production, this would be replaced with actual AWS SDK calls.
        
        Args:
            target: The target to invoke
            tool_call: The tool call parameters
            
        Returns:
            Simulated result data
        """
        return {
            "status": "success",
            "target": target.name,
            "type": target.type.value,
            "parameters_received": tool_call.parameters,
            "simulated": True
        }
    
    def get_call_log(self) -> list[tuple[GatewayToolCall, GatewayToolResult]]:
        """Get the log of all tool calls for audit purposes."""
        return self._call_log.copy()
    
    def clear_call_log(self) -> None:
        """Clear the call log."""
        self._call_log.clear()


def create_gateway(
    config: Optional[GatewayConfig] = None,
    policy_engine: Optional[Any] = None
) -> Gateway:
    """
    Create a Gateway instance with default or custom configuration.
    
    Args:
        config: Optional custom configuration
        policy_engine: Optional PolicyEngine for authorization
        
    Returns:
        Configured Gateway instance
    """
    if config is None:
        config = create_default_gateway_config()
    
    return Gateway(config=config, policy_engine=policy_engine)


# Environment variable names for Gateway configuration
GATEWAY_ENV_VARS = {
    "GOVERNANCE_GATEWAY_ARN": "ARN of the governance Gateway",
    "GOVERNANCE_GATEWAY_NAME": "Name of the governance Gateway",
    "POLICY_ENGINE_ARN": "ARN of the Policy Engine",
    "REGULATORY_SCANNER_LAMBDA_ARN": "ARN of the regulatory scanner Lambda",
    "LINEAGE_TOOL_OPENAPI_URL": "URL of the lineage tool OpenAPI spec",
    "NOTIFICATION_LAMBDA_ARN": "ARN of the notification service Lambda",
    "DATA_CATALOG_OPENAPI_URL": "URL of the data catalog OpenAPI spec",
    "QUALITY_EXECUTION_LAMBDA_ARN": "ARN of the quality execution Lambda",
}


def get_gateway_env_vars() -> dict[str, str]:
    """
    Get Gateway-related environment variables.
    
    Returns:
        Dictionary of environment variable names and their current values
    """
    return {
        name: os.environ.get(name, "")
        for name in GATEWAY_ENV_VARS.keys()
    }


def print_gateway_config(config: GatewayConfig) -> None:
    """
    Print Gateway configuration for debugging.
    
    Args:
        config: Gateway configuration to print
    """
    print(f"Gateway Configuration: {config.name}")
    print(f"  Description: {config.description}")
    print(f"  Region: {config.region}")
    print(f"  Policy Engine: {config.policy_engine_name}")
    print(f"  Status: {config.status.value}")
    print(f"  Targets ({len(config.targets)}):")
    for target in config.targets:
        status = "enabled" if target.enabled else "disabled"
        print(f"    - {target.name} ({target.type.value}) [{status}]")
        print(f"      {target.description}")
