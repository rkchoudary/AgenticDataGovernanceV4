#!/bin/bash
# Deploy script for CDK infrastructure deployment
# Requirements: 1.3, 10.2

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
STACKS="${2:-all}"
REQUIRE_APPROVAL="${REQUIRE_APPROVAL:-broadening}"

echo -e "${GREEN}=== Agentic Data Governance Platform - Deploy ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Stacks: $STACKS"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment. Must be dev, staging, or prod${NC}"
    exit 1
fi

# Production safety check
if [ "$ENVIRONMENT" == "prod" ]; then
    echo -e "${YELLOW}WARNING: You are deploying to PRODUCTION${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment cancelled"
        exit 0
    fi
    REQUIRE_APPROVAL="never"
fi

# Navigate to infrastructure directory
cd "$(dirname "$0")/.."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm ci
fi

# Build TypeScript
echo -e "\n${YELLOW}Building TypeScript...${NC}"
npm run build

# Run tests before deployment
echo -e "\n${YELLOW}Running tests...${NC}"
npm run test || {
    echo -e "${RED}Tests failed. Aborting deployment.${NC}"
    exit 1
}

# Synthesize CloudFormation templates
echo -e "\n${YELLOW}Synthesizing CloudFormation templates...${NC}"
npx cdk synth --context environment=$ENVIRONMENT

# Show diff before deployment
echo -e "\n${YELLOW}Showing changes...${NC}"
npx cdk diff --context environment=$ENVIRONMENT || true

# Deploy stacks
echo -e "\n${BLUE}Deploying stacks...${NC}"

if [ "$STACKS" == "all" ]; then
    npx cdk deploy --all \
        --context environment=$ENVIRONMENT \
        --require-approval $REQUIRE_APPROVAL \
        --outputs-file cdk-outputs-$ENVIRONMENT.json
else
    npx cdk deploy "$STACKS" \
        --context environment=$ENVIRONMENT \
        --require-approval $REQUIRE_APPROVAL \
        --outputs-file cdk-outputs-$ENVIRONMENT.json
fi

echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo "Stack outputs saved to: cdk-outputs-$ENVIRONMENT.json"

# Display important outputs
if [ -f "cdk-outputs-$ENVIRONMENT.json" ]; then
    echo -e "\n${YELLOW}Important Outputs:${NC}"
    cat cdk-outputs-$ENVIRONMENT.json | grep -E "(Url|Endpoint|Domain|Arn)" || true
fi
