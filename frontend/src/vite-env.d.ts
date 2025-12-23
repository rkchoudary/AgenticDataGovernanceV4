/// <reference types="vite/client" />

/**
 * Environment variables for the frontend application
 * Requirements: 2.1, 3.5, 11.1
 */
interface ImportMetaEnv {
  // API Configuration
  readonly VITE_API_URL: string;
  readonly VITE_API_STAGE: string;
  
  // WebSocket Configuration
  readonly VITE_WS_URL: string;
  
  // Cognito Configuration
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_COGNITO_DOMAIN: string;
  
  // AWS Configuration
  readonly VITE_AWS_REGION: string;
  
  // Application Settings
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  
  // Feature Flags
  readonly VITE_ENABLE_DEBUG: string;
  readonly VITE_ENABLE_ANALYTICS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
