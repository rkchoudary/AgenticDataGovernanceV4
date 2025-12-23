/**
 * Production environment configuration
 * Requirements: 8.1, 8.2
 */
import { EnvironmentConfig } from './environment';

export const prodConfig: EnvironmentConfig = {
  // AWS Account and Region
  account: process.env.CDK_DEFAULT_ACCOUNT || '704845220642',
  region: process.env.CDK_DEFAULT_REGION || 'us-west-2',
  
  // Domain configuration (required for production)
  domainName: process.env.PROD_DOMAIN || '',
  
  // Security settings (all security features enabled)
  enableWaf: true,
  
  // Disaster recovery (enabled for production)
  enableCrossRegionReplication: true,
  
  // Cost management
  budgetAmount: 2000, // $2000 monthly budget for production
  
  // Resource tags
  tags: {
    Environment: 'prod',
    Project: 'agentic-data-governance',
    CostCenter: 'operations',
    ManagedBy: 'cdk',
    Owner: 'platform-team',
    Compliance: 'required',
  },
};

/**
 * Production-specific feature flags
 */
export const prodFeatureFlags = {
  // Disable debug logging in production
  enableDebugLogging: false,
  
  // Enable X-Ray tracing for observability
  enableXRayTracing: true,
  
  // Lambda configuration (optimized for performance)
  lambdaMemorySize: 1024,
  lambdaTimeout: 60,
  
  // DynamoDB configuration
  dynamoDbBillingMode: 'PAY_PER_REQUEST' as const,
  
  // Cognito configuration (strict security)
  mfaConfiguration: 'OPTIONAL' as const,
  passwordMinLength: 12,
  
  // API Gateway configuration (higher limits for production)
  apiThrottlingRateLimit: 2000,
  apiThrottlingBurstLimit: 1000,
  
  // CloudWatch configuration (longer retention for compliance)
  logRetentionDays: 365,
  
  // Alarm thresholds (strict for production)
  apiErrorRateThreshold: 1, // 1%
  lambdaErrorThreshold: 1,
  latencyThresholdMs: 1000,
  
  // Backup configuration
  backupRetentionDays: 35,
  enablePointInTimeRecovery: true,
  
  // Cross-region replication
  replicaRegion: 'us-east-1',
};

export default prodConfig;
