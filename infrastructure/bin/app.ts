#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BaseStack } from '../lib/stacks/base-stack.js';
import { FrontendHostingStack } from '../lib/stacks/frontend-hosting-stack.js';
import { CognitoStack } from '../lib/stacks/cognito-stack.js';

const app = new cdk.App();

// Get environment from context
const environment = app.node.tryGetContext('environment') || 'dev';
const environments = app.node.tryGetContext('environments');
const envConfig = environments[environment];

if (!envConfig) {
  throw new Error(`Unknown environment: ${environment}. Valid environments: dev, staging, prod`);
}

// Create base stack with shared resources
new BaseStack(app, `GovernanceBase-${environment}`, {
  env: {
    account: envConfig.account,
    region: envConfig.region,
  },
  environment,
  tags: envConfig.tags,
});

// Create frontend hosting stack
const frontendStack = new FrontendHostingStack(app, `GovernanceFrontend-${environment}`, {
  env: {
    account: envConfig.account,
    region: envConfig.region,
  },
  environment,
  tags: envConfig.tags,
  enableWaf: envConfig.enableWaf,
  domainName: envConfig.domainName || undefined,
});

// Create Cognito stack for authentication
new CognitoStack(app, `GovernanceCognito-${environment}`, {
  env: {
    account: envConfig.account,
    region: envConfig.region,
  },
  environment,
  tags: envConfig.tags,
  cloudFrontDomain: frontendStack.distribution.distributionDomainName,
  domainName: envConfig.domainName || undefined,
  adminEmail: envConfig.adminEmail || 'admin@example.com',
});

app.synth();
