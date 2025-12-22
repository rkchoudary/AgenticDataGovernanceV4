#!/bin/bash
#
# Gateway Setup Script for AgentCore Data Governance
#
# This script creates and configures the AgentCore Gateway with targets
# for regulatory scanner, lineage tool, and notification service.
#
# Requirements: 18.2, 18.5
# - Create gateway and add targets
# - Configure Lambda and OpenAPI targets
# - Associate with Policy Engine
#
# Usage:
#   ./scripts/setup_gateway.sh
#
# Environment Variables:
#   AWS_REGION: AWS region for AgentCore (default: us-west-2)
#   POLICY_ENGINE_NAME: Name of the Policy Engine to associate
#   REGULATORY_SCANNER_LAMBDA_ARN: ARN of the regulatory scanner Lambda
#   LINEAGE_TOOL_OPENAPI_URL: URL of the lineage tool OpenAPI spec
#   NOTIFICATION_LAMBDA_ARN: ARN of the notification service Lambda

set -e

# Default configuration
REGION="${AWS_REGION:-us-west-2}"
GATEWAY_NAME="${GOVERNANCE_GATEWAY_NAME:-governance-gateway}"
POLICY_ENGINE_NAME="${POLICY_ENGINE_NAME:-governance-policy-engine}"

echo "=============================================="
echo "AgentCore Gateway Setup"
echo "=============================================="
echo "Gateway Name: $GATEWAY_NAME"
echo "Policy Engine: $POLICY_ENGINE_NAME"
echo "Region: $REGION"
echo "=============================================="

# Check if agentcore CLI is available
if ! command -v agentcore &> /dev/null; then
    echo "Warning: AgentCore CLI not found."
    echo ""
    echo "You can install it with:"
    echo "  pip install bedrock-agentcore-cli"
    echo ""
    echo "Or use the AWS CLI directly:"
    echo ""
    echo "1. Create Gateway:"
    echo "   aws bedrock-agentcore-control create-gateway \\"
    echo "     --name $GATEWAY_NAME \\"
    echo "     --policy-engine-name $POLICY_ENGINE_NAME"
    echo ""
    echo "2. Add Lambda Target (Regulatory Scanner):"
    echo "   aws bedrock-agentcore-control add-gateway-target \\"
    echo "     --gateway-name $GATEWAY_NAME \\"
    echo "     --target-name regulatory-scanner \\"
    echo "     --target-type LAMBDA \\"
    echo "     --lambda-config functionArn=\${REGULATORY_SCANNER_LAMBDA_ARN}"
    echo ""
    echo "3. Add OpenAPI Target (Lineage Tool):"
    echo "   aws bedrock-agentcore-control add-gateway-target \\"
    echo "     --gateway-name $GATEWAY_NAME \\"
    echo "     --target-name lineage-tool \\"
    echo "     --target-type OPENAPI \\"
    echo "     --openapi-config specUrl=\${LINEAGE_TOOL_OPENAPI_URL}"
    echo ""
    echo "4. Add Lambda Target (Notification Service):"
    echo "   aws bedrock-agentcore-control add-gateway-target \\"
    echo "     --gateway-name $GATEWAY_NAME \\"
    echo "     --target-name notification-service \\"
    echo "     --target-type LAMBDA \\"
    echo "     --lambda-config functionArn=\${NOTIFICATION_LAMBDA_ARN}"
    exit 1
fi

# Create Gateway
echo ""
echo "=== Creating Gateway: $GATEWAY_NAME ==="
agentcore gateway create \
    --name "$GATEWAY_NAME" \
    --policy-engine "$POLICY_ENGINE_NAME" \
    --region "$REGION" || {
    echo "Gateway may already exist, continuing..."
}

# Add regulatory scanner target (Lambda)
if [ -n "$REGULATORY_SCANNER_LAMBDA_ARN" ]; then
    echo ""
    echo "=== Adding Lambda Target: regulatory-scanner ==="
    agentcore gateway add-target \
        --gateway "$GATEWAY_NAME" \
        --name regulatory-scanner \
        --type lambda \
        --function-arn "$REGULATORY_SCANNER_LAMBDA_ARN" \
        --region "$REGION" || {
        echo "Target may already exist, continuing..."
    }
else
    echo ""
    echo "Skipping regulatory-scanner target (REGULATORY_SCANNER_LAMBDA_ARN not set)"
fi

# Add lineage tool target (OpenAPI)
if [ -n "$LINEAGE_TOOL_OPENAPI_URL" ]; then
    echo ""
    echo "=== Adding OpenAPI Target: lineage-tool ==="
    agentcore gateway add-target \
        --gateway "$GATEWAY_NAME" \
        --name lineage-tool \
        --type openapi \
        --spec-url "$LINEAGE_TOOL_OPENAPI_URL" \
        --region "$REGION" || {
        echo "Target may already exist, continuing..."
    }
else
    echo ""
    echo "Skipping lineage-tool target (LINEAGE_TOOL_OPENAPI_URL not set)"
fi

# Add notification service target (Lambda)
if [ -n "$NOTIFICATION_LAMBDA_ARN" ]; then
    echo ""
    echo "=== Adding Lambda Target: notification-service ==="
    agentcore gateway add-target \
        --gateway "$GATEWAY_NAME" \
        --name notification-service \
        --type lambda \
        --function-arn "$NOTIFICATION_LAMBDA_ARN" \
        --region "$REGION" || {
        echo "Target may already exist, continuing..."
    }
else
    echo ""
    echo "Skipping notification-service target (NOTIFICATION_LAMBDA_ARN not set)"
fi

# List available tools
echo ""
echo "=== Listing Gateway Tools ==="
agentcore gateway list-tools --gateway "$GATEWAY_NAME" --region "$REGION" || true

# Verify setup
echo ""
echo "=== Verifying Gateway ==="
agentcore gateway describe --name "$GATEWAY_NAME" --region "$REGION" || true

echo ""
echo "=============================================="
echo "Gateway Setup Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo "1. Ensure Lambda functions are deployed and accessible"
echo "2. Verify OpenAPI specifications are available at the configured URLs"
echo "3. Test tool invocation through the Gateway"
echo "4. Configure agents to use the Gateway for external tool access"
