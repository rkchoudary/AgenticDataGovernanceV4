#!/bin/bash
# Bootstrap script for initial AWS CDK setup
# Requirements: 8.1, 8.3

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"
AWS_REGION="${AWS_REGION:-us-west-2}"
AWS_ACCOUNT="${AWS_ACCOUNT:-}"

echo -e "${GREEN}=== Agentic Data Governance Platform - Bootstrap ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment. Must be dev, staging, or prod${NC}"
    exit 1
fi

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo -e "${RED}Error: AWS CLI is not installed${NC}"
    exit 1
fi
echo "✓ AWS CLI installed"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo "✓ Node.js installed ($NODE_VERSION)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi
echo "✓ npm installed"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    exit 1
fi
echo "✓ AWS credentials configured"

# Get AWS account ID if not provided
if [ -z "$AWS_ACCOUNT" ]; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
fi
echo "AWS Account: $AWS_ACCOUNT"

# Install dependencies
echo -e "\n${YELLOW}Installing infrastructure dependencies...${NC}"
cd "$(dirname "$0")/.."
npm ci

# Build TypeScript
echo -e "\n${YELLOW}Building TypeScript...${NC}"
npm run build

# Bootstrap CDK
echo -e "\n${YELLOW}Bootstrapping CDK for $ENVIRONMENT environment...${NC}"
npx cdk bootstrap aws://$AWS_ACCOUNT/$AWS_REGION \
    --context environment=$ENVIRONMENT \
    --tags Environment=$ENVIRONMENT \
    --tags Project=agentic-data-governance \
    --tags CostCenter=engineering

echo -e "\n${GREEN}=== Bootstrap Complete ===${NC}"
echo "You can now deploy the infrastructure using:"
echo "  ./scripts/deploy.sh $ENVIRONMENT"
