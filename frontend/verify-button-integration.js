/**
 * WorkflowWizardButton Integration Verification Script
 * 
 * This script verifies that the WorkflowWizardButton component is properly
 * integrated and all requirements are met.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test results collector
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function test(name, condition, details = '') {
  const result = {
    name,
    passed: condition,
    details
  };
  
  results.tests.push(result);
  
  if (condition) {
    results.passed++;
    console.log(`✅ ${name}`);
  } else {
    results.failed++;
    console.log(`❌ ${name}`);
  }
  
  if (details) {
    console.log(`   ${details}`);
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(path.join(__dirname, filePath));
  } catch (error) {
    return false;
  }
}

function fileContains(filePath, searchString) {
  try {
    const content = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
    return content.includes(searchString);
  } catch (error) {
    return false;
  }
}

console.log('🧪 Running WorkflowWizardButton Integration Tests...\n');

// Test 1: Component file exists
test(
  'WorkflowWizardButton component exists',
  fileExists('src/components/WorkflowWizardButton.tsx'),
  'Component file should be at src/components/WorkflowWizardButton.tsx'
);

// Test 2: Component is properly exported
test(
  'WorkflowWizardButton is properly exported',
  fileContains('src/components/WorkflowWizardButton.tsx', 'export function WorkflowWizardButton'),
  'Component should export WorkflowWizardButton function'
);

// Test 3: Dashboard integration
test(
  'WorkflowWizardButton integrated in Dashboard',
  fileContains('src/pages/Dashboard.tsx', 'import { WorkflowWizardButton }') &&
  fileContains('src/pages/Dashboard.tsx', '<WorkflowWizardButton'),
  'Dashboard should import and use WorkflowWizardButton'
);

// Test 4: Route configuration
test(
  'Workflow wizard route configured',
  fileContains('src/App.tsx', '/cycles/:cycleId/wizard') &&
  fileContains('src/App.tsx', 'WorkflowWizardPage'),
  'App.tsx should have route for /cycles/:cycleId/wizard'
);

// Test 5: Target page exists
test(
  'WorkflowWizardPage exists',
  fileExists('src/pages/Cycles/WorkflowWizardPage.tsx'),
  'Target page should exist at src/pages/Cycles/WorkflowWizardPage.tsx'
);

// Test 6: Required dependencies
test(
  'useCycle hook exists',
  fileExists('src/hooks/useCycles.ts') &&
  fileContains('src/hooks/useCycles.ts', 'export function useCycle'),
  'useCycle hook should be available'
);

test(
  'useAuthStore exists',
  fileExists('src/stores/authStore.ts') &&
  fileExists('src/stores/index.ts') &&
  fileContains('src/stores/index.ts', 'useAuthStore'),
  'useAuthStore should be available from stores'
);

// Test 7: UI components exist
test(
  'Button component exists',
  fileExists('src/components/ui/button.tsx'),
  'Button UI component should be available'
);

test(
  'Tooltip component exists',
  fileExists('src/components/ui/tooltip.tsx'),
  'Tooltip UI component should be available'
);

// Test 8: Navigation implementation
test(
  'Navigation properly implemented',
  fileContains('src/components/WorkflowWizardButton.tsx', 'useNavigate') &&
  fileContains('src/components/WorkflowWizardButton.tsx', 'navigate(`/cycles/${cycleId}/wizard`)'),
  'Component should use useNavigate hook for navigation'
);

// Test 9: Accessibility features
test(
  'Keyboard accessibility implemented',
  fileContains('src/components/WorkflowWizardButton.tsx', 'onKeyDown') &&
  fileContains('src/components/WorkflowWizardButton.tsx', 'aria-label'),
  'Component should handle keyboard events and have ARIA labels'
);

// Test 10: Responsive design
test(
  'Responsive design implemented',
  fileContains('src/components/WorkflowWizardButton.tsx', 'w-full sm:w-auto') ||
  fileContains('src/pages/Dashboard.tsx', 'w-full md:w-auto'),
  'Component should have responsive width classes'
);

// Test 11: Error handling
test(
  'Error handling implemented',
  fileContains('src/components/WorkflowWizardButton.tsx', 'try') &&
  fileContains('src/components/WorkflowWizardButton.tsx', 'catch') &&
  fileContains('src/components/WorkflowWizardButton.tsx', 'console.error'),
  'Component should have try-catch error handling'
);

// Test 12: Permission checking
test(
  'Permission checking implemented',
  fileContains('src/components/WorkflowWizardButton.tsx', 'hasPermission') &&
  fileContains('src/components/WorkflowWizardButton.tsx', 'allowedRoles'),
  'Component should check user permissions'
);

console.log('\n📊 Test Summary:');
console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📈 Success Rate: ${Math.round((results.passed / (results.passed + results.failed)) * 100)}%`);

if (results.failed === 0) {
  console.log('\n🎉 All tests passed! WorkflowWizardButton is properly integrated.');
  console.log('🔗 Manual testing available at: http://localhost:3000');
  console.log('📋 Open the test report at: frontend/test-workflow-wizard-button.html');
} else {
  console.log('\n⚠️  Some tests failed. Please review the implementation.');
  process.exit(1);
}