/**
 * Environment configuration exports
 * Requirements: 8.1, 8.2
 */

export * from './environment';
export { devConfig, devFeatureFlags } from './dev.config';
export { stagingConfig, stagingFeatureFlags } from './staging.config';
export { prodConfig, prodFeatureFlags } from './prod.config';

import { EnvironmentConfig } from './environment';
import { devConfig, devFeatureFlags } from './dev.config';
import { stagingConfig, stagingFeatureFlags } from './staging.config';
import { prodConfig, prodFeatureFlags } from './prod.config';

export type Environment = 'dev' | 'staging' | 'prod';

export interface FeatureFlags {
  enableDebugLogging: boolean;
  enableXRayTracing: boolean;
  lambdaMemorySize: number;
  lambdaTimeout: number;
  dynamoDbBillingMode: 'PAY_PER_REQUEST' | 'PROVISIONED';
  mfaConfiguration: 'OFF' | 'OPTIONAL' | 'ON';
  passwordMinLength: number;
  apiThrottlingRateLimit: number;
  apiThrottlingBurstLimit: number;
  logRetentionDays: number;
  apiErrorRateThreshold: number;
  lambdaErrorThreshold: number;
  latencyThresholdMs: number;
  backupRetentionDays?: number;
  enablePointInTimeRecovery?: boolean;
  replicaRegion?: string;
}

/**
 * Get environment configuration by name
 */
export function getConfig(environment: Environment): EnvironmentConfig {
  switch (environment) {
    case 'dev':
      return devConfig;
    case 'staging':
      return stagingConfig;
    case 'prod':
      return prodConfig;
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Get feature flags by environment
 */
export function getFeatureFlags(environment: Environment): FeatureFlags {
  switch (environment) {
    case 'dev':
      return devFeatureFlags;
    case 'staging':
      return stagingFeatureFlags;
    case 'prod':
      return prodFeatureFlags;
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
}

/**
 * Validate environment name
 */
export function isValidEnvironment(env: string): env is Environment {
  return ['dev', 'staging', 'prod'].includes(env);
}
