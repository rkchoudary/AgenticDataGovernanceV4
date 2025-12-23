#!/bin/bash
# Update frontend environment configuration from CDK outputs
# Requirements: 2.1, 3.5, 11.1

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"

echo -e "${GREEN}=== Update Frontend Configuration ===${NC}"
echo "Environment: $ENVIRONMENT"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment. Must be dev, staging, or prod${NC}"
    exit 1
fi

# Get script directory and project root
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
INFRA_DIR="$PROJECT_ROOT/infrastructure"

# Check if CDK outputs exist
CDK_OUTPUTS="$INFRA_DIR/cdk-outputs-$ENVIRONMENT.json"
if [ ! -f "$CDK_OUTPUTS" ]; then
    echo -e "${YELLOW}CDK outputs not found at $CDK_OUTPUTS${NC}"
    echo "Attempting to fetch from CloudFormation..."
    
    # Try to get outputs from CloudFormation
    mkdir -p "$(dirname "$CDK_OUTPUTS")"
    
    # Get all stack outputs for this environment
    STACKS=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query "StackSummaries[?contains(StackName, '$ENVIRONMENT')].StackName" \
        --output text)
    
    echo "{" > "$CDK_OUTPUTS"
    first=true
    for stack in $STACKS; do
        if [ "$first" = true ]; then
            first=false
        else
            echo "," >> "$CDK_OUTPUTS"
        fi
        
        outputs=$(aws cloudformation describe-stacks \
            --stack-name "$stack" \
            --query "Stacks[0].Outputs" \
            --output json 2>/dev/null || echo "[]")
        
        echo "  \"$stack\": {" >> "$CDK_OUTPUTS"
        echo "$outputs" | jq -r 'to_entries | map("    \"\(.value.OutputKey)\": \"\(.value.OutputValue)\"") | join(",\n")' >> "$CDK_OUTPUTS"
        echo "  }" >> "$CDK_OUTPUTS"
    done
    echo "}" >> "$CDK_OUTPUTS"
fi

# Parse CDK outputs
echo -e "\n${YELLOW}Parsing CDK outputs...${NC}"

# Extract values from CDK outputs
API_URL=$(cat "$CDK_OUTPUTS" | jq -r '.. | .ApiUrl? // .HttpApiUrl? // empty' | head -1)
WS_URL=$(cat "$CDK_OUTPUTS" | jq -r '.. | .WebSocketUrl? // .WsApiUrl? // empty' | head -1)
USER_POOL_ID=$(cat "$CDK_OUTPUTS" | jq -r '.. | .UserPoolId? // empty' | head -1)
CLIENT_ID=$(cat "$CDK_OUTPUTS" | jq -r '.. | .UserPoolClientId? // .ClientId? // empty' | head -1)
COGNITO_DOMAIN=$(cat "$CDK_OUTPUTS" | jq -r '.. | .CognitoDomain? // .UserPoolDomain? // empty' | head -1)

# Display found values
echo "API URL: ${API_URL:-Not found}"
echo "WebSocket URL: ${WS_URL:-Not found}"
echo "User Pool ID: ${USER_POOL_ID:-Not found}"
echo "Client ID: ${CLIENT_ID:-Not found}"
echo "Cognito Domain: ${COGNITO_DOMAIN:-Not found}"

# Update frontend .env file
ENV_FILE="$FRONTEND_DIR/.env.$ENVIRONMENT"

echo -e "\n${YELLOW}Updating $ENV_FILE...${NC}"

# Create backup
if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.backup"
fi

# Update values in the env file
if [ -n "$API_URL" ]; then
    sed -i.tmp "s|^VITE_API_URL=.*|VITE_API_URL=$API_URL|" "$ENV_FILE"
fi

if [ -n "$WS_URL" ]; then
    sed -i.tmp "s|^VITE_WS_URL=.*|VITE_WS_URL=$WS_URL|" "$ENV_FILE"
fi

if [ -n "$USER_POOL_ID" ]; then
    sed -i.tmp "s|^VITE_COGNITO_USER_POOL_ID=.*|VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID|" "$ENV_FILE"
fi

if [ -n "$CLIENT_ID" ]; then
    sed -i.tmp "s|^VITE_COGNITO_CLIENT_ID=.*|VITE_COGNITO_CLIENT_ID=$CLIENT_ID|" "$ENV_FILE"
fi

if [ -n "$COGNITO_DOMAIN" ]; then
    sed -i.tmp "s|^VITE_COGNITO_DOMAIN=.*|VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN|" "$ENV_FILE"
fi

# Clean up temp files
rm -f "$ENV_FILE.tmp"

echo -e "\n${GREEN}=== Configuration Updated ===${NC}"
echo "Frontend environment file updated: $ENV_FILE"
echo ""
echo "To rebuild the frontend with new configuration:"
echo "  cd frontend && npm run build"
