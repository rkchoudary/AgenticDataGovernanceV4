/**
 * Environment configuration interface for CDK deployments
 */
export interface EnvironmentConfig {
  account: string;
  region: string;
  domainName: string;
  enableWaf: boolean;
  enableCrossRegionReplication: boolean;
  budgetAmount: number;
  tags: ResourceTags;
}

/**
 * Required resource tags for all AWS resources
 * Validates: Requirements 8.3, 15.2
 */
export interface ResourceTags {
  Environment: string;
  Project: string;
  CostCenter: string;
  [key: string]: string;
}

/**
 * AgentCore agent ARN mapping
 */
export interface AgentArns {
  regulatory: string;
  dataRequirements: string;
  cdeIdentification: string;
  dataQuality: string;
  lineageMapping: string;
  issueManagement: string;
  documentation: string;
  orchestrator: string;
}

/**
 * Validates that all required tags are present
 */
export function validateRequiredTags(tags: ResourceTags): boolean {
  const requiredTags = ['Environment', 'Project', 'CostCenter'];
  return requiredTags.every(tag => 
    tag in tags && 
    typeof tags[tag] === 'string' && 
    tags[tag].length > 0
  );
}

/**
 * Gets environment configuration from CDK context
 */
export function getEnvironmentConfig(
  app: { node: { tryGetContext: (key: string) => unknown } },
  environment: string
): EnvironmentConfig {
  const environments = app.node.tryGetContext('environments') as Record<string, EnvironmentConfig>;
  
  if (!environments || !environments[environment]) {
    throw new Error(`Environment configuration not found for: ${environment}`);
  }
  
  return environments[environment];
}
