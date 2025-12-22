/**
 * **Feature: agentic-data-governance, Property 14: Compensating Control Tracking**
 * 
 * For any control with status 'compensating', the expirationDate field must be 
 * non-null and the control must be linked to an open issue that it compensates for.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { 
  compensatingControlGenerator,
  invalidCompensatingControlGenerator,
  validControlGenerator
} from '../generators/control.generator.js';
import { issueGenerator } from '../generators/common.generator.js';
import { ControlsManagementServiceImpl } from '../../services/controls-management-service.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { Control } from '../../types/controls.js';
import { Issue } from '../../types/issues.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 14: Compensating Control Tracking', () => {
  it('should accept compensating controls with valid linkedIssueId and expirationDate', () => {
    fc.assert(
      fc.asyncProperty(
        compensatingControlGenerator(),
        issueGenerator(),
        fc.uuid(), // reportId
        async (control, issueData, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Add the issue to the repository first
          const issue = repository.createIssue(issueData);
          
          // Update control to link to the existing issue
          const linkedControl: Control = {
            ...control,
            linkedIssueId: issue.id
          };

          // This should not throw for valid compensating controls
          const matrix = await service.createControlMatrix(reportId, [linkedControl]);
          
          const addedControl = matrix.controls[0];
          return addedControl.status === 'compensating' &&
                 addedControl.linkedIssueId === issue.id &&
                 addedControl.expirationDate !== undefined &&
                 addedControl.expirationDate !== null;
        }
      ),
      propertyConfig
    );
  });

  it('should reject compensating controls without linkedIssueId', () => {
    fc.assert(
      fc.asyncProperty(
        validControlGenerator(),
        fc.uuid(), // reportId
        async (baseControl, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Create compensating control without linkedIssueId
          const invalidControl: Control = {
            ...baseControl,
            status: 'compensating',
            linkedIssueId: undefined,
            expirationDate: new Date()
          };

          // This should throw an error
          try {
            await service.createControlMatrix(reportId, [invalidControl]);
            return false; // Should not reach here
          } catch (error) {
            const errorMessage = (error as Error).message;
            return errorMessage.includes('Compensating controls must have a linkedIssueId');
          }
        }
      ),
      propertyConfig
    );
  });

  it('should reject compensating controls without expirationDate', () => {
    fc.assert(
      fc.asyncProperty(
        validControlGenerator(),
        issueGenerator(),
        fc.uuid(), // reportId
        async (baseControl, issueData, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Add the issue to the repository first
          const issue = repository.createIssue(issueData);

          // Create compensating control without expirationDate
          const invalidControl: Control = {
            ...baseControl,
            status: 'compensating',
            linkedIssueId: issue.id,
            expirationDate: undefined
          };

          // This should throw an error
          try {
            await service.createControlMatrix(reportId, [invalidControl]);
            return false; // Should not reach here
          } catch (error) {
            const errorMessage = (error as Error).message;
            return errorMessage.includes('Compensating controls must have an expirationDate');
          }
        }
      ),
      propertyConfig
    );
  });

  it('should reject compensating controls linked to non-existent issues', () => {
    fc.assert(
      fc.asyncProperty(
        compensatingControlGenerator(),
        fc.uuid(), // reportId
        async (control, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Create an empty control matrix first (required for createCompensatingControl)
          await service.createControlMatrix(reportId, []);

          // Don't add the issue to the repository, so it doesn't exist
          // The control has a linkedIssueId but the issue doesn't exist

          // This should throw an error when creating compensating control
          try {
            await service.createCompensatingControl(
              reportId,
              control.linkedIssueId!,
              {
                name: control.name,
                description: control.description,
                type: control.type,
                category: control.category,
                owner: control.owner,
                frequency: control.frequency,
                linkedCDEs: control.linkedCDEs,
                linkedProcesses: control.linkedProcesses,
                automationStatus: control.automationStatus,
                ruleId: control.ruleId,
                expirationDate: control.expirationDate
              }
            );
            return false; // Should not reach here
          } catch (error) {
            const errorMessage = (error as Error).message;
            return errorMessage.includes('Issue not found');
          }
        }
      ),
      propertyConfig
    );
  });

  it('should track expiring compensating controls correctly', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(compensatingControlGenerator(), { minLength: 1, maxLength: 10 }),
        issueGenerator(),
        fc.uuid(), // reportId
        fc.integer({ min: 1, max: 30 }), // withinDays
        async (controls, issueData, reportId, withinDays) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Add the issue to the repository
          const issue = repository.createIssue(issueData);

          // Set up controls with different expiration dates
          const now = new Date();
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() + withinDays);

          const controlsWithExpiration = controls.map((control, index) => {
            const expirationDate = new Date();
            // Some controls expire within the window, some don't
            if (index % 2 === 0) {
              // Expires within the window
              expirationDate.setDate(now.getDate() + Math.floor(withinDays / 2));
            } else {
              // Expires after the window
              expirationDate.setDate(now.getDate() + withinDays + 10);
            }

            return {
              ...control,
              linkedIssueId: issue.id,
              expirationDate
            };
          });

          // Create the control matrix
          await service.createControlMatrix(reportId, controlsWithExpiration);

          // Get expiring controls
          const expiringControls = await service.getExpiringCompensatingControls(reportId, withinDays);

          // Verify that only controls expiring within the window are returned
          const expectedExpiringCount = controlsWithExpiration.filter(control => 
            control.expirationDate! <= cutoffDate
          ).length;

          return expiringControls.length === expectedExpiringCount &&
                 expiringControls.every(control => 
                   control.status === 'compensating' &&
                   control.expirationDate! <= cutoffDate &&
                   control.linkedIssueId === issue.id
                 );
        }
      ),
      propertyConfig
    );
  });

  it('should properly expire compensating controls', () => {
    fc.assert(
      fc.asyncProperty(
        compensatingControlGenerator(),
        issueGenerator(),
        fc.uuid(), // reportId
        async (control, issueData, reportId) => {
          const repository = new InMemoryGovernanceRepository();
          const service = new ControlsManagementServiceImpl(repository);

          // Add the issue to the repository
          const issue = repository.createIssue(issueData);

          // Create control linked to the issue
          const linkedControl: Control = {
            ...control,
            linkedIssueId: issue.id
          };

          // Create the control matrix
          const matrix = await service.createControlMatrix(reportId, [linkedControl]);
          const controlId = matrix.controls[0].id;

          // Expire the compensating control
          await service.expireCompensatingControl(controlId, reportId);

          // Verify the control was removed from the matrix
          const updatedMatrix = await service.getControlMatrix(reportId);
          const controlExists = updatedMatrix?.controls.some(c => c.id === controlId);

          return !controlExists; // Control should be removed
        }
      ),
      propertyConfig
    );
  });
});