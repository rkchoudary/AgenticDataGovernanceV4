/**
 * **Feature: agentic-data-governance, Property 21: Issue Resolution Confirmation Gate**
 * 
 * For any issue transitioning from 'pending_verification' to 'closed' status, the resolution.verifiedBy 
 * field must be non-null and different from the resolution.implementedBy field (four-eyes principle).
 */

import fc from 'fast-check';
import { describe, it, beforeEach, expect } from 'vitest';
import { IssueManagementAgent } from '../../agents/issue-management-agent.js';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { issueGenerator, resolutionGenerator } from '../generators/index.js';
import { Issue, Resolution } from '../../types/index.js';

const propertyConfig = {
  numRuns: 100,
  verbose: true
};

describe('Property 21: Issue Resolution Confirmation Gate', () => {
  let repository: InMemoryGovernanceRepository;
  let agent: IssueManagementAgent;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    agent = new IssueManagementAgent(repository);
  });

  it('should enforce four-eyes principle when resolving issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        issueGenerator(),
        resolutionGenerator(),
        fc.tuple(fc.emailAddress(), fc.emailAddress()).filter(([impl, verif]) => impl !== verif),
        async (issue: Issue, resolution: Resolution, [implementer, verifier]: [string, string]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Create issue in repository
          const storedIssue = repository.createIssue({
            ...issue,
            status: 'in_progress'
          });
          
          // Create resolution with different implementer and verifier
          const validResolution: Resolution = {
            ...resolution,
            implementedBy: implementer,
            verifiedBy: verifier,
            verifiedAt: new Date()
          };
          
          // Resolve the issue
          await agent.resolveIssue(storedIssue.id, validResolution, verifier);
          
          // Get the updated issue
          const updatedIssue = repository.getIssue(storedIssue.id);
          
          // Verify four-eyes principle is enforced
          return (
            updatedIssue !== undefined &&
            updatedIssue.resolution !== undefined &&
            updatedIssue.resolution.implementedBy === implementer &&
            updatedIssue.resolution.verifiedBy === verifier &&
            updatedIssue.resolution.implementedBy !== updatedIssue.resolution.verifiedBy &&
            updatedIssue.status === 'closed'
          );
        }
      ),
      propertyConfig
    );
  });

  it('should reject resolution when implementer and verifier are the same', async () => {
    await fc.assert(
      fc.asyncProperty(
        issueGenerator(),
        resolutionGenerator(),
        fc.emailAddress(),
        async (issue: Issue, resolution: Resolution, sameUser: string) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Create issue in repository
          const storedIssue = repository.createIssue({
            ...issue,
            status: 'in_progress'
          });
          
          // Create resolution with same implementer and verifier
          const invalidResolution: Resolution = {
            ...resolution,
            implementedBy: sameUser,
            verifiedBy: sameUser
          };
          
          // Attempt to resolve the issue should throw an error
          let errorThrown = false;
          try {
            await agent.resolveIssue(storedIssue.id, invalidResolution, sameUser);
          } catch (error) {
            errorThrown = true;
          }
          
          // Should throw error due to four-eyes principle violation
          return errorThrown;
        }
      ),
      propertyConfig
    );
  });

  it('should set status to pending_verification when no verifier is provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        issueGenerator(),
        resolutionGenerator(),
        fc.tuple(fc.emailAddress(), fc.emailAddress()).filter(([impl, conf]) => impl !== conf),
        async (issue: Issue, resolution: Resolution, [implementer, confirmer]: [string, string]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Create issue in repository
          const storedIssue = repository.createIssue({
            ...issue,
            status: 'in_progress'
          });
          
          // Create resolution without verifier
          const resolutionWithoutVerifier: Resolution = {
            ...resolution,
            implementedBy: implementer,
            verifiedBy: undefined
          };
          
          // Resolve the issue - confirmer becomes the verifier
          await agent.resolveIssue(storedIssue.id, resolutionWithoutVerifier, confirmer);
          
          // Get the updated issue
          const updatedIssue = repository.getIssue(storedIssue.id);
          
          // When no verifier is provided, the confirmer becomes the verifier
          // and status should be pending_verification (since verifiedBy was undefined in input)
          return (
            updatedIssue !== undefined &&
            updatedIssue.resolution !== undefined &&
            updatedIssue.resolution.implementedBy === implementer &&
            updatedIssue.resolution.verifiedBy === confirmer &&
            updatedIssue.status === 'pending_verification'
          );
        }
      ),
      propertyConfig
    );
  });

  it('should properly handle resolution with pre-set verifier different from implementer', async () => {
    await fc.assert(
      fc.asyncProperty(
        issueGenerator(),
        resolutionGenerator(),
        fc.tuple(fc.emailAddress(), fc.emailAddress()).filter(([impl, verif]) => impl !== verif),
        async (issue: Issue, resolution: Resolution, [implementer, verifier]: [string, string]) => {
          // Reset repository for each test
          repository = new InMemoryGovernanceRepository();
          agent = new IssueManagementAgent(repository);
          
          // Create issue in repository
          const storedIssue = repository.createIssue({
            ...issue,
            status: 'in_progress'
          });
          
          // Create resolution with pre-set verifier (different from implementer)
          const resolutionWithVerifier: Resolution = {
            ...resolution,
            implementedBy: implementer,
            verifiedBy: verifier,
            verifiedAt: new Date()
          };
          
          // Resolve the issue
          await agent.resolveIssue(storedIssue.id, resolutionWithVerifier, verifier);
          
          // Get the updated issue
          const updatedIssue = repository.getIssue(storedIssue.id);
          
          // Should be closed with proper verification
          return (
            updatedIssue !== undefined &&
            updatedIssue.status === 'closed' &&
            updatedIssue.resolution !== undefined &&
            updatedIssue.resolution.implementedBy === implementer &&
            updatedIssue.resolution.verifiedBy === verifier &&
            updatedIssue.resolution.verifiedAt instanceof Date
          );
        }
      ),
      propertyConfig
    );
  });
});
