"""
AWS Policy Engine provider implementation.

This module implements the PolicyEngineProvider protocol using
AWS Bedrock AgentCore Policy Engine with Cedar policies.

Requirements: 21.2
"""

from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from cloud.base import (
    PolicyEngineProvider,
    PolicyConfig,
    PolicyEngineResult,
)


class AWSPolicyEngineProvider:
    """
    AWS implementation of PolicyEngineProvider using AgentCore Policy Engine.
    
    This provider manages Cedar-based policies for authorization
    and access control in the governance system.
    
    Requirements: 21.2
    """
    
    def __init__(self, region: str = "us-west-2"):
        """
        Initialize the AWS Policy Engine provider.
        
        Args:
            region: AWS region for policy services
        """
        self.region = region
        self._client = None
        
        # In-memory storage for local development/testing
        self._engines: dict[str, PolicyEngineResult] = {}
        self._policies: dict[str, dict[str, str]] = {}  # engine_id -> {policy_id: policy}
    
    @property
    def client(self):
        """Lazy-load the AgentCore Policy client."""
        if self._client is None:
            try:
                from bedrock_agentcore.policy import PolicyClient
                self._client = PolicyClient(region_name=self.region)
            except ImportError:
                self._client = None
        return self._client
    
    def setup_engine(self, config: PolicyConfig) -> PolicyEngineResult:
        """
        Set up the policy engine.
        
        Args:
            config: Policy engine configuration
            
        Returns:
            Setup result with engine details
        """
        engine_id = f"policy-{uuid4().hex[:12]}"
        
        if self.client:
            try:
                response = self.client.create_policy_engine(
                    engine_name=config.name,
                    mode=config.mode,
                    policy_language=config.policy_language,
                    default_decision=config.default_decision,
                    tags=config.tags,
                )
                engine_id = response.get("engine_id", engine_id)
                endpoint_url = response.get("endpoint_url")
                status = "active"
            except Exception:
                endpoint_url = f"https://policy.{self.region}.amazonaws.com/{engine_id}"
                status = "active"
        else:
            # Local development mode
            endpoint_url = f"http://localhost:8083/policy/{engine_id}"
            status = "active"
        
        result = PolicyEngineResult(
            engine_id=engine_id,
            engine_name=config.name,
            endpoint_url=endpoint_url,
            status=status,
            provider="aws",
            metadata={
                "mode": config.mode,
                "policy_language": config.policy_language,
                "default_decision": config.default_decision,
                "region": self.region,
            },
        )
        
        self._engines[engine_id] = result
        self._policies[engine_id] = {}
        
        # Add initial policies
        for policy in config.policies:
            self.add_policy(engine_id, policy)
        
        return result
    
    def add_policy(self, engine_id: str, policy: str) -> str:
        """
        Add a policy to the engine.
        
        Args:
            engine_id: Policy engine identifier
            policy: Policy definition (Cedar syntax)
            
        Returns:
            Policy identifier
        """
        policy_id = f"pol-{uuid4().hex[:12]}"
        
        if self.client:
            try:
                response = self.client.add_policy(
                    engine_id=engine_id,
                    policy=policy,
                )
                policy_id = response.get("policy_id", policy_id)
            except Exception:
                pass
        
        # Store locally
        if engine_id not in self._policies:
            self._policies[engine_id] = {}
        self._policies[engine_id][policy_id] = policy
        
        return policy_id
    
    def evaluate(
        self,
        engine_id: str,
        principal: dict[str, Any],
        action: str,
        resource: dict[str, Any],
        context: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """
        Evaluate a policy decision.
        
        Args:
            engine_id: Policy engine identifier
            principal: The entity making the request
            action: The action being requested
            resource: The resource being accessed
            context: Optional additional context
            
        Returns:
            Evaluation result with decision and reasons
        """
        if self.client:
            try:
                response = self.client.evaluate(
                    engine_id=engine_id,
                    principal=principal,
                    action=action,
                    resource=resource,
                    context=context or {},
                )
                return response
            except Exception:
                pass
        
        # Local evaluation (simplified)
        return self._local_evaluate(engine_id, principal, action, resource, context)
    
    def _local_evaluate(
        self,
        engine_id: str,
        principal: dict[str, Any],
        action: str,
        resource: dict[str, Any],
        context: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """
        Perform local policy evaluation (simplified).
        
        This is a basic implementation for local development.
        Production should use AgentCore Policy Engine.
        """
        engine = self._engines.get(engine_id)
        if not engine:
            return {
                "decision": "DENY",
                "reasons": ["Policy engine not found"],
            }
        
        default_decision = engine.metadata.get("default_decision", "DENY")
        policies = self._policies.get(engine_id, {})
        
        # Simple role-based evaluation
        principal_roles = principal.get("roles", [])
        principal_type = principal.get("type", "User")
        
        # Check for explicit permits
        for policy_id, policy_text in policies.items():
            # Very simplified Cedar parsing
            if "permit" in policy_text.lower():
                # Check if action matches
                if action.lower() in policy_text.lower():
                    # Check if principal type matches
                    if principal_type.lower() in policy_text.lower():
                        return {
                            "decision": "ALLOW",
                            "reasons": [f"Permitted by policy {policy_id}"],
                            "policy_id": policy_id,
                        }
                    # Check if any role matches
                    for role in principal_roles:
                        if role.lower() in policy_text.lower():
                            return {
                                "decision": "ALLOW",
                                "reasons": [f"Permitted by policy {policy_id} for role {role}"],
                                "policy_id": policy_id,
                            }
        
        # Check for explicit forbids
        for policy_id, policy_text in policies.items():
            if "forbid" in policy_text.lower():
                if action.lower() in policy_text.lower():
                    return {
                        "decision": "DENY",
                        "reasons": [f"Forbidden by policy {policy_id}"],
                        "policy_id": policy_id,
                    }
        
        return {
            "decision": default_decision,
            "reasons": ["No matching policy found, using default decision"],
        }
    
    def delete_policy(self, engine_id: str, policy_id: str) -> bool:
        """
        Delete a policy from the engine.
        
        Args:
            engine_id: Policy engine identifier
            policy_id: Policy identifier
            
        Returns:
            True if deleted successfully
        """
        if self.client:
            try:
                self.client.delete_policy(
                    engine_id=engine_id,
                    policy_id=policy_id,
                )
            except Exception:
                pass
        
        # Remove from local storage
        if engine_id in self._policies and policy_id in self._policies[engine_id]:
            del self._policies[engine_id][policy_id]
            return True
        
        return False
    
    def list_policies(self, engine_id: str) -> list[dict[str, Any]]:
        """
        List policies in the engine.
        
        Args:
            engine_id: Policy engine identifier
            
        Returns:
            List of policies
        """
        if self.client:
            try:
                response = self.client.list_policies(engine_id=engine_id)
                return response.get("policies", [])
            except Exception:
                pass
        
        # Return from local storage
        policies = self._policies.get(engine_id, {})
        return [
            {"policy_id": pid, "policy": policy}
            for pid, policy in policies.items()
        ]
