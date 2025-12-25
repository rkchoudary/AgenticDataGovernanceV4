# 🚀 AWS Deployment Guide - Agentic Data Governance V2

**Complete step-by-step guide to deploy the enterprise data governance platform on AWS**

## 📋 Prerequisites

### 1. AWS Account Setup
- **AWS Account** with administrative access
- **AWS CLI** installed and configured
- **Bedrock Access** enabled in your region
- **Sufficient Quotas** for Lambda, DynamoDB, and Bedrock

### 2. Local Development Environment
```bash
# Required tools
node --version    # v18+ required
npm --version     # v8+ required
python --version  # v3.12+ required
aws --version     # v2.0+ required
```

### 3. AWS Permissions Required
Your AWS user/role needs these permissions:
- **AdministratorAccess** (recommended for initial setup)
- Or specific permissions for: IAM, Lambda, DynamoDB, S3, CloudFront, Bedrock, AgentCore

## 🎯 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        AWS Cloud                           │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   CloudFront    │    │   S3 Bucket     │                │
│  │   (Frontend)    │────│   (Static Web)  │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │  API Gateway    │    │    Lambda       │                │
│  │   (REST API)    │────│   (Backend)     │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   DynamoDB      │    │    Cognito      │                │
│  │   (Database)    │    │    (Auth)       │                │
│  └─────────────────┘    └─────────────────┘                │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              AWS Bedrock AgentCore                      │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │ │
│  │  │Regulatory   │ │Data Quality │ │   Lineage   │       │ │
│  │  │Intelligence │ │    Rules    │ │   Mapping   │       │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │ │
│  │                                                         │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │ │
│  │  │     CDE     │ │Issue Mgmt   │ │Governance   │       │ │
│  │  │Identification│ │   Agent     │ │Orchestrator │       │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘       │ │
│  │                                                         │ │
│  │  ┌─────────────┐                                        │ │
│  │  │Documentation│                                        │ │
│  │  │    Agent    │                                        │ │
│  │  └─────────────┘                                        │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Step-by-Step Deployment

### Step 1: Clone and Setup Repository

```bash
# Clone the V2 repository
git clone https://github.com/rkchoudary/AgenticDataGovernanceV2.git
cd AgenticDataGovernanceV2

# Verify repository structure
ls -la
# Should see: frontend/, infrastructure/, agentcore-data-governance/
```

### Step 2: Configure AWS Environment

```bash
# Configure AWS CLI (if not already done)
aws configure
# Enter your Access Key ID, Secret Access Key, Region (us-west-2), Output format (json)

# Verify AWS access
aws sts get-caller-identity
# Should return your account ID and user/role info

# Check Bedrock access
aws bedrock list-foundation-models --region us-west-2
# Should return available models (Claude, etc.)
```

### Step 3: Set Environment Variables

Create environment configuration files:

```bash
# Create production environment file
cat > infrastructure/.env.prod << EOF
# AWS Configuration
AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=us-west-2

# Domain Configuration (optional - for custom domain)
PROD_DOMAIN=your-domain.com
CERTIFICATE_ARN=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID

# Budget Configuration
BUDGET_AMOUNT=2000

# Feature Flags
ENABLE_WAF=true
ENABLE_CROSS_REGION_REPLICATION=true
ENABLE_DEBUG_LOGGING=false
EOF

# Load environment variables
export $(cat infrastructure/.env.prod | grep -v '^#' | xargs)
```

### Step 4: Bootstrap AWS CDK

```bash
# Navigate to infrastructure directory
cd infrastructure

# Install dependencies
npm install

# Bootstrap CDK for your account/region
npm run bootstrap:prod

# This creates the CDK toolkit stack in your account
```

### Step 5: Deploy Infrastructure

```bash
# Deploy all infrastructure stacks
npm run deploy:prod

# This will deploy:
# - Cognito (Authentication)
# - DynamoDB (Database)
# - API Gateway (Backend API)
# - Lambda Functions (Business Logic)
# - S3 + CloudFront (Frontend Hosting)
# - Security Controls (WAF, KMS)
# - Monitoring (CloudWatch, X-Ray)

# Deployment takes 15-20 minutes
```

### Step 6: Deploy AWS Bedrock Agents

```bash
# Navigate to agent directory
cd ../agentcore-data-governance

# Install Python dependencies
pip install -r requirements.txt

# Deploy all agents to Bedrock AgentCore
python scripts/deploy_agents.py --environment prod

# This deploys 7 specialized agents:
# - RegulatoryIntelligenceAgent
# - DataRequirementsAgent  
# - CDEIdentificationAgent
# - DataQualityRuleAgent
# - LineageMappingAgent
# - IssueManagementAgent
# - DocumentationAgent
# - GovernanceOrchestrator
```

### Step 7: Configure Agent Memory

```bash
# Setup AgentCore Memory for conversation persistence
python scripts/setup_memory.py --environment prod

# This creates memory instances for each agent
# Enables conversation continuity and context retention
```

### Step 8: Deploy Frontend

```bash
# Navigate back to infrastructure
cd ../infrastructure

# Deploy frontend to S3 and CloudFront
npm run deploy:frontend:prod

# This:
# - Builds the React frontend
# - Uploads to S3 bucket
# - Invalidates CloudFront cache
# - Configures environment-specific settings
```

### Step 9: Configure Domain (Optional)

If you want a custom domain:

```bash
# Update domain configuration
export PROD_DOMAIN=your-domain.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID

# Redeploy frontend stack with domain
npm run deploy:frontend:prod -- --domain $PROD_DOMAIN
```

### Step 10: Verify Deployment

```bash
# Get deployment outputs
cat cdk-outputs-prod.json

# Test API endpoints
API_URL=$(cat cdk-outputs-prod.json | jq -r '.GovernanceApi.ApiUrl')
curl $API_URL/health

# Test frontend
FRONTEND_URL=$(cat cdk-outputs-prod.json | jq -r '.GovernanceFrontend.FrontendUrl')
echo "Frontend available at: $FRONTEND_URL"
```

## 🔧 Configuration

### Environment-Specific Settings

**Development:**
```bash
npm run deploy:dev    # Minimal resources, lower costs
```

**Staging:**
```bash
npm run deploy:staging    # Production-like, with testing features
```

**Production:**
```bash
npm run deploy:prod    # Full security, monitoring, backups
```

### Agent Configuration

Edit `agentcore-data-governance/.bedrock_agentcore.yaml`:

```yaml
agents:
  RegulatoryIntelligenceAgent:
    aws:
      account: 'YOUR_ACCOUNT_ID'
      region: 'us-west-2'
      execution_role: 'arn:aws:iam::ACCOUNT:role/governance-AgentCoreExecutionRole'
    memory:
      mode: STM_AND_LTM
      event_expiry_days: 365
    observability:
      enabled: true
```

### Frontend Configuration

Edit `frontend/.env.prod`:

```bash
# API Configuration
VITE_API_BASE_URL=https://api.your-domain.com
VITE_WS_URL=wss://api.your-domain.com

# Authentication
VITE_COGNITO_USER_POOL_ID=us-west-2_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX

# Features
VITE_ENABLE_CHAT=true
VITE_ENABLE_WORKFLOW_WIZARD=true
VITE_ENABLE_ANALYTICS=true
```

## 🔒 Security Configuration

### 1. IAM Roles and Policies

The deployment creates these roles:
- **AgentCoreExecutionRole**: For Bedrock agents
- **LambdaExecutionRole**: For Lambda functions
- **FrontendDeploymentRole**: For CI/CD

### 2. Network Security

```bash
# Enable WAF (Web Application Firewall)
export ENABLE_WAF=true

# Configure IP allowlists (optional)
export ALLOWED_IPS="203.0.113.0/24,198.51.100.0/24"
```

### 3. Data Encryption

All data is encrypted:
- **At Rest**: DynamoDB, S3 (KMS encryption)
- **In Transit**: HTTPS/TLS everywhere
- **Agent Memory**: Encrypted with customer-managed KMS keys

## 📊 Monitoring and Observability

### CloudWatch Dashboards

Access monitoring at:
```
https://console.aws.amazon.com/cloudwatch/home?region=us-west-2#dashboards:name=GovernancePlatform-prod
```

### Key Metrics Monitored:
- **API Response Times**: < 1 second average
- **Agent Execution Times**: < 5 seconds average  
- **Error Rates**: < 1% target
- **Frontend Load Times**: < 2 seconds
- **Database Performance**: Read/write latency
- **Cost Tracking**: Daily spend alerts

### X-Ray Tracing

Distributed tracing enabled for:
- API Gateway requests
- Lambda function execution
- Agent invocations
- Database queries

### Alarms and Notifications

Automatic alerts for:
- High error rates (> 1%)
- Slow response times (> 5 seconds)
- Budget overruns (> $2000/month)
- Security events (failed logins, etc.)

## 💰 Cost Management

### Expected Monthly Costs (Production):

| Service | Estimated Cost |
|---------|---------------|
| **Bedrock Agents** | $800-1200 |
| **Lambda Functions** | $200-400 |
| **DynamoDB** | $100-300 |
| **CloudFront + S3** | $50-100 |
| **API Gateway** | $50-150 |
| **Other Services** | $100-200 |
| **Total** | **$1300-2350** |

### Cost Optimization:

```bash
# Enable cost optimization features
export ENABLE_COST_OPTIMIZATION=true

# Set budget alerts
export BUDGET_AMOUNT=2000
export BUDGET_EMAIL=admin@your-company.com
```

## 🔄 CI/CD Pipeline

### GitHub Actions Setup

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to AWS
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-west-2
          
      - name: Deploy Infrastructure
        run: |
          cd infrastructure
          npm ci
          npm run deploy:prod
          
      - name: Deploy Agents
        run: |
          cd agentcore-data-governance
          pip install -r requirements.txt
          python scripts/deploy_agents.py --environment prod
          
      - name: Deploy Frontend
        run: |
          cd infrastructure
          npm run deploy:frontend:prod
```

## 🧪 Testing Deployment

### 1. Health Checks

```bash
# Test API health
curl https://api.your-domain.com/health

# Test agent connectivity
curl -X POST https://api.your-domain.com/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, test the regulatory intelligence agent"}'
```

### 2. Frontend Testing

```bash
# Test frontend loading
curl -I https://your-domain.com

# Test chat functionality
# Open browser to https://your-domain.com
# Click AI Assistant button (or press Cmd/Ctrl + K)
# Send test message: "What regulatory reports are in the catalog?"
```

### 3. End-to-End Testing

```bash
# Run integration tests
cd agentcore-data-governance
python -m pytest tests/integration/ -v

# Run property-based tests
python -m pytest tests/property/ -v
```

## 🚨 Troubleshooting

### Common Issues:

**1. Bedrock Access Denied**
```bash
# Check Bedrock service availability in your region
aws bedrock list-foundation-models --region us-west-2

# Request access to Claude models if needed
# Go to AWS Console > Bedrock > Model Access
```

**2. CDK Bootstrap Failed**
```bash
# Ensure you have admin permissions
aws sts get-caller-identity

# Try manual bootstrap
npx cdk bootstrap aws://ACCOUNT/REGION
```

**3. Agent Deployment Failed**
```bash
# Check execution role exists
aws iam get-role --role-name governance-AgentCoreExecutionRole

# Verify AgentCore is available in your region
aws bedrock-agentcore list-agents --region us-west-2
```

**4. Frontend Not Loading**
```bash
# Check S3 bucket exists
aws s3 ls | grep governance-frontend

# Check CloudFront distribution
aws cloudfront list-distributions
```

### Getting Help:

- **AWS Support**: For AWS service issues
- **GitHub Issues**: For application bugs
- **Documentation**: Check README_V2.md for detailed info

## 🔄 Updates and Maintenance

### Regular Updates:

```bash
# Update infrastructure
cd infrastructure
npm run deploy:prod

# Update agents
cd ../agentcore-data-governance
python scripts/deploy_agents.py --environment prod

# Update frontend
cd ../infrastructure
npm run deploy:frontend:prod
```

### Backup and Recovery:

- **DynamoDB**: Point-in-time recovery enabled
- **S3**: Versioning and cross-region replication
- **Agent Memory**: Automatic backups to S3
- **Code**: Git repository with tags

## 🎯 Next Steps

After successful deployment:

1. **Configure Users**: Set up Cognito user pools
2. **Load Data**: Import initial governance data
3. **Train Agents**: Provide domain-specific knowledge
4. **Set Alerts**: Configure monitoring thresholds
5. **Document Processes**: Create user guides
6. **Scale Testing**: Test with production load

---

**🎉 Congratulations! Your Agentic Data Governance platform is now running on AWS!**

Access your platform at: `https://your-domain.com`

For support, create an issue at: https://github.com/rkchoudary/AgenticDataGovernanceV2/issues