/**
 * Development environment configuration
 * Requirements: 8.1, 8.2
 */
import { EnvironmentConfig } from './environment';

export const devConfig: EnvironmentConfig = {
  // AWS Account and Region
  account: process.env.CDK_DEFAULT_ACCOUNT || '704845220642',
  region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  
  // Domain configuration (empty for dev - uses CloudFront default domain)
  domainName: '',
  
  // Security settings (relaxed for development)
  enableWaf: false,
  
  // Disaster recovery (disabled for dev to save costs)
  enableCrossRegionReplication: false,
  
  // Cost management
  budgetAmount: 100, // $100 monthly budget for dev
  
  // Resource tags
  tags: {
    Environment: 'dev',
    Project: 'agentic-data-governance',
    CostCenter: 'engineering',
    ManagedBy: 'cdk',
    Owner: 'platform-team',
  },
};

/**
 * Development-specific feature flags
 */
export const devFeatureFlags = {
  // Enable detailed logging for debugging
  enableDebugLogging: true,
  
  // Enable X-Ray tracing
  enableXRayTracing: true,
  
  // Lambda configuration
  lambdaMemorySize: 256,
  lambdaTimeout: 30,
  
  // DynamoDB configuration
  dynamoDbBillingMode: 'PAY_PER_REQUEST' as const,
  
  // Cognito configuration
  mfaConfiguration: 'OFF' as const,
  passwordMinLength: 8,
  
  // API Gateway configuration
  apiThrottlingRateLimit: 100,
  apiThrottlingBurstLimit: 50,
  
  // CloudWatch configuration
  logRetentionDays: 7,
  
  // Alarm thresholds (more lenient for dev)
  apiErrorRateThreshold: 10, // 10%
  lambdaErrorThreshold: 5,
  latencyThresholdMs: 5000,
};

export default devConfig;
