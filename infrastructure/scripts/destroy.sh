#!/bin/bash
# Destroy script for tearing down CDK infrastructure
# Use with caution - this will delete all resources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="${1:-dev}"

echo -e "${RED}=== Agentic Data Governance Platform - DESTROY ===${NC}"
echo "Environment: $ENVIRONMENT"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    echo -e "${RED}Error: Invalid environment. Must be dev, staging, or prod${NC}"
    exit 1
fi

# Safety confirmation
echo -e "\n${RED}WARNING: This will PERMANENTLY DELETE all resources in the $ENVIRONMENT environment${NC}"
echo "This includes:"
echo "  - S3 buckets and all stored data"
echo "  - DynamoDB tables and all data"
echo "  - Cognito User Pool and all users"
echo "  - All Lambda functions"
echo "  - All API Gateway endpoints"
echo ""

read -p "Type the environment name to confirm deletion ($ENVIRONMENT): " confirm
if [ "$confirm" != "$ENVIRONMENT" ]; then
    echo "Confirmation failed. Aborting."
    exit 0
fi

# Extra confirmation for production
if [ "$ENVIRONMENT" == "prod" ]; then
    echo -e "\n${RED}PRODUCTION ENVIRONMENT DETECTED${NC}"
    read -p "Type 'DELETE PRODUCTION' to confirm: " prod_confirm
    if [ "$prod_confirm" != "DELETE PRODUCTION" ]; then
        echo "Production deletion cancelled."
        exit 0
    fi
fi

# Navigate to infrastructure directory
cd "$(dirname "$0")/.."

# Build if needed
if [ ! -d "dist" ]; then
    echo -e "\n${YELLOW}Building TypeScript...${NC}"
    npm run build
fi

# Empty S3 buckets first (CDK can't delete non-empty buckets)
echo -e "\n${YELLOW}Emptying S3 buckets...${NC}"

# Get bucket names from stack outputs
BUCKETS=$(aws cloudformation describe-stacks \
    --query "Stacks[?contains(StackName, '$ENVIRONMENT')].Outputs[?contains(OutputKey, 'Bucket')].OutputValue" \
    --output text 2>/dev/null || echo "")

for bucket in $BUCKETS; do
    if [ -n "$bucket" ]; then
        echo "Emptying bucket: $bucket"
        aws s3 rm "s3://$bucket" --recursive 2>/dev/null || true
        # Also delete versions if versioning is enabled
        aws s3api delete-objects \
            --bucket "$bucket" \
            --delete "$(aws s3api list-object-versions \
                --bucket "$bucket" \
                --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
                --output json 2>/dev/null)" 2>/dev/null || true
    fi
done

# Destroy stacks
echo -e "\n${YELLOW}Destroying CDK stacks...${NC}"
npx cdk destroy --all \
    --context environment=$ENVIRONMENT \
    --force

echo -e "\n${GREEN}=== Destroy Complete ===${NC}"
echo "All resources for $ENVIRONMENT have been deleted."
