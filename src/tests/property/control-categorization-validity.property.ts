/**
 * **Feature: agentic-data-governance, Property 13: Control Categorization Validity**
 * 
 * For any control in the Control Matrix, the type field must be one of the valid 
 * categories: 'organizational', 'process', 'access', or 'change_management'.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { 
  validControlGenerator,
  controlMatrixGenerator,
  invalidControlTypeGenerator,
  invalidControlCategoryGenerator
} from '../generators/control.generator.js';
import { ControlsManagementServiceImpl } from '../../services/controls-management-service.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { Control, ControlType, ControlCategory } from '../../types/controls.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 13: Control Categorization Validity', () => {
  it('should accept controls with valid type and category values', () => {
    fc.assert(
      fc.asyncProperty(
        validControlGenerator(),
        fc.uuid(), // reportId
        async (control, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // This should not throw an error for valid controls
          const matrix = await service.createControlMatrix(reportId, [control]);
          
          // Verify the control was added with valid categorization
          const validTypes: ControlType[] = ['organizational', 'process', 'access', 'change_management'];
          const validCategories: ControlCategory[] = ['preventive', 'detective'];
          
          const addedControl = matrix.controls[0];
          return validTypes.includes(addedControl.type) && 
                 validCategories.includes(addedControl.category);
        }
      ),
      propertyConfig
    );
  });

  it('should reject controls with invalid type values', () => {
    fc.assert(
      fc.asyncProperty(
        validControlGenerator(),
        invalidControlTypeGenerator(),
        fc.uuid(), // reportId
        async (baseControl, invalidType, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Create control with invalid type
          const invalidControl: Control = {
            ...baseControl,
            type: invalidType as any
          };

          // This should throw an error for invalid control type
          let errorThrown = false;
          try {
            await service.createControlMatrix(reportId, [invalidControl]);
          } catch (error) {
            errorThrown = true;
            const errorMessage = (error as Error).message;
            return errorMessage.includes('Invalid control type') && 
                   errorMessage.includes(invalidType);
          }
          
          return errorThrown;
        }
      ),
      propertyConfig
    );
  });

  it('should reject controls with invalid category values', () => {
    fc.assert(
      fc.asyncProperty(
        validControlGenerator(),
        invalidControlCategoryGenerator(),
        fc.uuid(), // reportId
        async (baseControl, invalidCategory, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Create control with invalid category
          const invalidControl: Control = {
            ...baseControl,
            category: invalidCategory as any
          };

          // This should throw an error for invalid control category
          let errorThrown = false;
          try {
            await service.createControlMatrix(reportId, [invalidControl]);
          } catch (error) {
            errorThrown = true;
            const errorMessage = (error as Error).message;
            return errorMessage.includes('Invalid control category') && 
                   errorMessage.includes(invalidCategory);
          }
          
          return errorThrown;
        }
      ),
      propertyConfig
    );
  });

  it('should validate all controls in a control matrix', () => {
    fc.assert(
      fc.asyncProperty(
        controlMatrixGenerator(),
        async (matrix) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Create any issues that compensating controls might reference
          for (const control of matrix.controls) {
            if (control.status === 'compensating' && control.linkedIssueId) {
              const issueData = {
                title: 'Test Issue',
                description: 'A test issue',
                source: 'test-source',
                impactedReports: [matrix.reportId],
                impactedCDEs: [],
                severity: 'high' as const,
                status: 'open' as const,
                createdAt: new Date()
              };
              const issue = repository.createIssue(issueData);
              // Update the control to reference the actual created issue
              control.linkedIssueId = issue.id;
            }
          }

          // All controls in the matrix should have valid categorization
          const validTypes: ControlType[] = ['organizational', 'process', 'access', 'change_management'];
          const validCategories: ControlCategory[] = ['preventive', 'detective'];

          // Check if all controls have valid categorization first
          const allControlsValid = matrix.controls.every(control => {
            // Check basic categorization
            if (!validTypes.includes(control.type) || !validCategories.includes(control.category)) {
              return false;
            }
            
            // Check compensating control requirements
            if (control.status === 'compensating') {
              return control.linkedIssueId !== null && 
                     control.linkedIssueId !== undefined &&
                     control.expirationDate !== null && 
                     control.expirationDate !== undefined;
            }
            
            return true;
          });
          
          try {
            // This should not throw for valid controls
            await service.updateControlMatrix(matrix.reportId, matrix);
            
            // If the service accepts the matrix, all controls should be valid
            return allControlsValid;
          } catch (error) {
            // If validation fails, the controls should be invalid
            return !allControlsValid;
          }
        }
      ),
      propertyConfig
    );
  });
});