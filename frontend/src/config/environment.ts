/**
 * Frontend Environment Configuration
 * Requirements: 2.1, 3.5, 11.1
 * 
 * This module provides type-safe access to environment variables
 * and configuration settings for the frontend application.
 */

/**
 * Environment configuration interface
 */
export interface EnvironmentConfig {
  // API Configuration
  apiUrl: string;
  apiStage: string;
  
  // WebSocket Configuration
  wsUrl: string;
  
  // Cognito Configuration
  cognito: {
    userPoolId: string;
    clientId: string;
    domain: string;
    region: string;
  };
  
  // AWS Configuration
  awsRegion: string;
  
  // Application Settings
  appName: string;
  appVersion: string;
  
  // Feature Flags
  features: {
    enableDebug: boolean;
    enableAnalytics: boolean;
  };
  
  // Derived values
  isProduction: boolean;
  isDevelopment: boolean;
}

/**
 * Get environment variable with fallback
 */
function getEnvVar(key: string, fallback: string = ''): string {
  return import.meta.env[key] || fallback;
}

/**
 * Parse boolean environment variable
 */
function getBoolEnvVar(key: string, fallback: boolean = false): boolean {
  const value = import.meta.env[key];
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

/**
 * Build the environment configuration object
 */
function buildConfig(): EnvironmentConfig {
  const apiStage = getEnvVar('VITE_API_STAGE', 'dev');
  
  return {
    // API Configuration
    apiUrl: getEnvVar('VITE_API_URL', 'http://localhost:8000'),
    apiStage,
    
    // WebSocket Configuration
    wsUrl: getEnvVar('VITE_WS_URL', 'ws://localhost:8001'),
    
    // Cognito Configuration
    cognito: {
      userPoolId: getEnvVar('VITE_COGNITO_USER_POOL_ID'),
      clientId: getEnvVar('VITE_COGNITO_CLIENT_ID'),
      domain: getEnvVar('VITE_COGNITO_DOMAIN'),
      region: getEnvVar('VITE_AWS_REGION', 'us-west-2'),
    },
    
    // AWS Configuration
    awsRegion: getEnvVar('VITE_AWS_REGION', 'us-west-2'),
    
    // Application Settings
    appName: getEnvVar('VITE_APP_NAME', 'Agentic Data Governance'),
    appVersion: getEnvVar('VITE_APP_VERSION', '1.0.0'),
    
    // Feature Flags
    features: {
      enableDebug: getBoolEnvVar('VITE_ENABLE_DEBUG', false),
      enableAnalytics: getBoolEnvVar('VITE_ENABLE_ANALYTICS', false),
    },
    
    // Derived values
    isProduction: apiStage === 'prod',
    isDevelopment: apiStage === 'dev',
  };
}

/**
 * Singleton configuration instance
 */
export const config: EnvironmentConfig = buildConfig();

/**
 * Get the full API endpoint URL
 */
export function getApiEndpoint(path: string): string {
  const baseUrl = config.apiUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

/**
 * Get the WebSocket endpoint URL
 */
export function getWsEndpoint(path: string = ''): string {
  const baseUrl = config.wsUrl.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : path ? `/${path}` : '';
  return `${baseUrl}${cleanPath}`;
}

/**
 * Get Cognito OAuth URLs
 */
export function getCognitoUrls() {
  const { cognito } = config;
  const baseUrl = `https://${cognito.domain}`;
  
  return {
    authorize: `${baseUrl}/oauth2/authorize`,
    token: `${baseUrl}/oauth2/token`,
    logout: `${baseUrl}/logout`,
    userInfo: `${baseUrl}/oauth2/userInfo`,
  };
}

/**
 * Check if Cognito is configured
 */
export function isCognitoConfigured(): boolean {
  const { cognito } = config;
  return !!(cognito.userPoolId && cognito.clientId && cognito.domain);
}

/**
 * Log configuration (for debugging, excludes sensitive values)
 */
export function logConfig(): void {
  if (!config.features.enableDebug) return;
  
  console.log('Environment Configuration:', {
    apiUrl: config.apiUrl,
    apiStage: config.apiStage,
    wsUrl: config.wsUrl,
    awsRegion: config.awsRegion,
    appName: config.appName,
    appVersion: config.appVersion,
    isProduction: config.isProduction,
    isDevelopment: config.isDevelopment,
    cognitoConfigured: isCognitoConfigured(),
    features: config.features,
  });
}

export default config;
