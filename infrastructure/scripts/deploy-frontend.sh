#!/bin/bash
# Frontend build and upload script
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
SKIP_BUILD="${SKIP_BUILD:-false}"

echo -e "${GREEN}=== Agentic Data Governance Platform - Frontend Deploy ===${NC}"
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
    echo -e "${RED}Error: CDK outputs not found at $CDK_OUTPUTS${NC}"
    echo "Please run deploy.sh first to deploy the infrastructure"
    exit 1
fi

# Extract S3 bucket name and CloudFront distribution ID from CDK outputs
echo -e "\n${YELLOW}Reading CDK outputs...${NC}"

# Parse the outputs file to get bucket name and distribution ID
S3_BUCKET=$(cat "$CDK_OUTPUTS" | grep -o '"FrontendBucket[^"]*": "[^"]*"' | head -1 | cut -d'"' -f4)
CLOUDFRONT_ID=$(cat "$CDK_OUTPUTS" | grep -o '"DistributionId[^"]*": "[^"]*"' | head -1 | cut -d'"' -f4)

# Fallback: try to get from AWS directly if not in outputs
if [ -z "$S3_BUCKET" ]; then
    echo -e "${YELLOW}Bucket not found in outputs, querying AWS...${NC}"
    S3_BUCKET=$(aws cloudformation describe-stacks \
        --stack-name "GovernanceFrontend-$ENVIRONMENT" \
        --query "Stacks[0].Outputs[?contains(OutputKey, 'Bucket')].OutputValue" \
        --output text 2>/dev/null || echo "")
fi

if [ -z "$CLOUDFRONT_ID" ]; then
    echo -e "${YELLOW}Distribution ID not found in outputs, querying AWS...${NC}"
    CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
        --stack-name "GovernanceFrontend-$ENVIRONMENT" \
        --query "Stacks[0].Outputs[?contains(OutputKey, 'Distribution')].OutputValue" \
        --output text 2>/dev/null || echo "")
fi

if [ -z "$S3_BUCKET" ]; then
    echo -e "${RED}Error: Could not determine S3 bucket name${NC}"
    exit 1
fi

echo "S3 Bucket: $S3_BUCKET"
echo "CloudFront Distribution: ${CLOUDFRONT_ID:-Not configured}"

# Navigate to frontend directory
cd "$FRONTEND_DIR"

# Install dependencies
echo -e "\n${YELLOW}Installing frontend dependencies...${NC}"
npm ci

# Load environment-specific configuration
ENV_CONFIG="$FRONTEND_DIR/.env.$ENVIRONMENT"
if [ -f "$ENV_CONFIG" ]; then
    echo -e "${YELLOW}Loading environment config from $ENV_CONFIG${NC}"
    export $(cat "$ENV_CONFIG" | grep -v '^#' | xargs)
fi

# Build frontend
if [ "$SKIP_BUILD" != "true" ]; then
    echo -e "\n${YELLOW}Building frontend for $ENVIRONMENT...${NC}"
    npm run build
else
    echo -e "\n${YELLOW}Skipping build (SKIP_BUILD=true)${NC}"
fi

# Check if build directory exists
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Build directory 'dist' not found${NC}"
    exit 1
fi

# Upload to S3
echo -e "\n${BLUE}Uploading to S3...${NC}"

# Upload with appropriate cache headers
# HTML files - no cache
aws s3 sync dist/ "s3://$S3_BUCKET/" \
    --delete \
    --exclude "*" \
    --include "*.html" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --content-type "text/html"

# JS and CSS files - long cache (they have content hashes)
aws s3 sync dist/ "s3://$S3_BUCKET/" \
    --exclude "*.html" \
    --include "*.js" \
    --include "*.css" \
    --cache-control "public, max-age=31536000, immutable"

# Other assets - medium cache
aws s3 sync dist/ "s3://$S3_BUCKET/" \
    --exclude "*.html" \
    --exclude "*.js" \
    --exclude "*.css" \
    --cache-control "public, max-age=86400"

echo "✓ Files uploaded to S3"

# Invalidate CloudFront cache
if [ -n "$CLOUDFRONT_ID" ]; then
    echo -e "\n${YELLOW}Invalidating CloudFront cache...${NC}"
    INVALIDATION_ID=$(aws cloudfront create-invalidation \
        --distribution-id "$CLOUDFRONT_ID" \
        --paths "/*" \
        --query 'Invalidation.Id' \
        --output text)
    
    echo "Invalidation created: $INVALIDATION_ID"
    
    # Wait for invalidation to complete (optional)
    if [ "${WAIT_FOR_INVALIDATION:-false}" == "true" ]; then
        echo "Waiting for invalidation to complete..."
        aws cloudfront wait invalidation-completed \
            --distribution-id "$CLOUDFRONT_ID" \
            --id "$INVALIDATION_ID"
        echo "✓ Invalidation complete"
    fi
else
    echo -e "${YELLOW}Skipping CloudFront invalidation (no distribution ID)${NC}"
fi

echo -e "\n${GREEN}=== Frontend Deployment Complete ===${NC}"

# Display access URL
CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
    --stack-name "GovernanceFrontend-$ENVIRONMENT" \
    --query "Stacks[0].Outputs[?contains(OutputKey, 'Domain') || contains(OutputKey, 'Url')].OutputValue" \
    --output text 2>/dev/null || echo "")

if [ -n "$CLOUDFRONT_DOMAIN" ]; then
    echo "Access your application at: https://$CLOUDFRONT_DOMAIN"
fi
