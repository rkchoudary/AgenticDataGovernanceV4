/**
 * Staging environment configuration
 * Requirements: 8.1, 8.2
 */
import { EnvironmentConfig } from './environment';

export const stagingConfig: EnvironmentConfig = {
  // AWS Account and Region
  account: process.env.CDK_DEFAULT_ACCOUNT || '704845220642',
  region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  
  // Domain configuration (optional for staging)
  domainName: process.env.STAGING_DOMAIN || '',
  
  // Security settings (WAF enabled for staging)
  enableWaf: true,
  
  // Disaster recovery (disabled for staging to save costs)
  enableCrossRegionReplication: false,
  
  // Cost management
  budgetAmount: 500, // $500 monthly budget for staging
  
  // Resource tags
  tags: {
    Environment: 'staging',
    Project: 'agentic-data-governance',
    CostCenter: 'engineering',
    ManagedBy: 'cdk',
    Owner: 'platform-team',
  },
};

/**
 * Staging-specific feature flags
 */
export const stagingFeatureFlags = {
  // Enable detailed logging for debugging
  enableDebugLogging: true,
  
  // Enable X-Ray tracing
  enableXRayTracing: true,
  
  // Lambda configuration
  lambdaMemorySize: 512,
  lambdaTimeout: 60,
  
  // DynamoDB configuration
  dynamoDbBillingMode: 'PAY_PER_REQUEST' as const,
  
  // Cognito configuration
  mfaConfiguration: 'OPTIONAL' as const,
  passwordMinLength: 12,
  
  // API Gateway configuration
  apiThrottlingRateLimit: 500,
  apiThrottlingBurstLimit: 250,
  
  // CloudWatch configuration
  logRetentionDays: 30,
  
  // Alarm thresholds (moderate for staging)
  apiErrorRateThreshold: 5, // 5%
  lambdaErrorThreshold: 3,
  latencyThresholdMs: 3000,
};

export default stagingConfig;
