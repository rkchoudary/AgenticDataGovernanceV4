/**
 * **Feature: workflow-wizard-ui, Property 8: Artifact Lock Immutability**
 * 
 * For any workflow cycle that has been submitted (Attestation phase completed),
 * all associated artifacts shall be locked and reject any modification attempts.
 * 
 * **Validates: Requirements 11.5**
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ============================================================================
// Type Definitions (mirroring frontend types for testing)
// ============================================================================

type SubmissionStatus = 'draft' | 'pending_submission' | 'submitted' | 'confirmed' | 'failed';

interface ArtifactLock {
  artifactId: string;
  artifactName: string;
  lockedAt: string;
  lockedBy: string;
  submissionId: string;
  hash: string;
}

interface AttestationRecord {
  id: string;
  cycleId: string;
  attestorId: string;
  attestorName: string;
  attestorTitle: string;
  attestorEmail: string;
  attestationType: 'primary' | 'secondary' | 'witness';
  signatureData: string;
  signatureType: 'drawn' | 'typed';
  rationale: string;
  attestedAt: string;
  identityVerified: boolean;
  verificationMethod?: 'mfa' | 'sso' | 'password';
}

interface SubmissionReceipt {
  id: string;
  cycleId: string;
  reportName: string;
  submissionTimestamp: string;
  submittedBy: string;
  submittedByName: string;
  confirmationNumber: string;
  packageHash: string;
  artifactCount: number;
  totalPages: number;
  attestations: AttestationRecord[];
  regulatorReference?: string;
  status: SubmissionStatus;
  lockedAt: string;
}

interface Artifact {
  id: string;
  name: string;
  content: string;
  version: string;
  lastModifiedAt: string;
  lastModifiedBy: string;
}

interface WorkflowCycle {
  id: string;
  status: 'draft' | 'in_progress' | 'submitted' | 'confirmed';
  artifacts: Artifact[];
  lockedArtifacts: ArtifactLock[];
  submissionReceipt: SubmissionReceipt | null;
}

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Check if a workflow cycle has been submitted
 */
function isSubmitted(cycle: WorkflowCycle): boolean {
  return cycle.status === 'submitted' || cycle.status === 'confirmed';
}

/**
 * Check if an artifact is locked
 */
function isArtifactLocked(artifactId: string, lockedArtifacts: ArtifactLock[]): boolean {
  return lockedArtifacts.some(lock => lock.artifactId === artifactId);
}

/**
 * Check if all artifacts in a cycle are locked
 */
function areAllArtifactsLocked(cycle: WorkflowCycle): boolean {
  return cycle.artifacts.every(artifact => 
    isArtifactLocked(artifact.id, cycle.lockedArtifacts)
  );
}

/**
 * Attempt to modify an artifact
 * Property 8: Artifact Lock Immutability - should reject modifications for locked artifacts
 */
function attemptModifyArtifact(
  cycle: WorkflowCycle,
  artifactId: string,
  newContent: string
): { success: boolean; error?: string; artifact?: Artifact } {
  // Check if artifact exists
  const artifact = cycle.artifacts.find(a => a.id === artifactId);
  if (!artifact) {
    return { success: false, error: 'Artifact not found' };
  }

  // Check if artifact is locked
  if (isArtifactLocked(artifactId, cycle.lockedArtifacts)) {
    return { 
      success: false, 
      error: 'Cannot modify locked artifact. Submission has been finalized.' 
    };
  }

  // Modification allowed for unlocked artifacts
  const modifiedArtifact: Artifact = {
    ...artifact,
    content: newContent,
    lastModifiedAt: new Date().toISOString(),
    lastModifiedBy: 'current-user',
  };

  return { success: true, artifact: modifiedArtifact };
}

/**
 * Lock all artifacts in a cycle upon submission
 */
function lockArtifactsOnSubmission(
  cycle: WorkflowCycle,
  submissionId: string,
  submittedBy: string
): ArtifactLock[] {
  const now = new Date().toISOString();
  
  return cycle.artifacts.map(artifact => ({
    artifactId: artifact.id,
    artifactName: artifact.name,
    lockedAt: now,
    lockedBy: submittedBy,
    submissionId,
    hash: calculateHash(artifact.content),
  }));
}

/**
 * Calculate a simple hash for artifact content
 */
function calculateHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0').toUpperCase();
}

/**
 * Submit a workflow cycle
 */
function submitCycle(
  cycle: WorkflowCycle,
  attestations: AttestationRecord[]
): WorkflowCycle {
  if (cycle.status === 'submitted' || cycle.status === 'confirmed') {
    return cycle; // Already submitted
  }

  const submissionId = `sub-${Date.now()}`;
  const now = new Date().toISOString();
  
  // Lock all artifacts
  const lockedArtifacts = lockArtifactsOnSubmission(cycle, submissionId, 'current-user');
  
  // Create submission receipt
  const receipt: SubmissionReceipt = {
    id: submissionId,
    cycleId: cycle.id,
    reportName: 'Test Report',
    submissionTimestamp: now,
    submittedBy: 'current-user',
    submittedByName: 'Test User',
    confirmationNumber: `REG-${Date.now().toString(36).toUpperCase()}`,
    packageHash: calculateHash(cycle.artifacts.map(a => a.content).join(':')),
    artifactCount: cycle.artifacts.length,
    totalPages: 100,
    attestations,
    status: 'confirmed',
    lockedAt: now,
  };

  return {
    ...cycle,
    status: 'confirmed',
    lockedArtifacts,
    submissionReceipt: receipt,
  };
}

/**
 * Verify artifact integrity by comparing hash
 */
function verifyArtifactIntegrity(
  artifact: Artifact,
  lock: ArtifactLock
): boolean {
  const currentHash = calculateHash(artifact.content);
  return currentHash === lock.hash;
}

// ============================================================================
// Generators
// ============================================================================

const propertyConfig = {
  numRuns: 100,
  verbose: false
};

/**
 * Generator for artifact
 */
const artifactGenerator = (): fc.Arbitrary<Artifact> =>
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    content: fc.string({ minLength: 1, maxLength: 1000 }),
    version: fc.string({ minLength: 1, maxLength: 10 }),
    lastModifiedAt: fc.date().map(d => d.toISOString()),
    lastModifiedBy: fc.string({ minLength: 1, maxLength: 50 }),
  });

/**
 * Generator for attestation record
 */
const attestationGenerator = (): fc.Arbitrary<AttestationRecord> =>
  fc.record({
    id: fc.uuid(),
    cycleId: fc.uuid(),
    attestorId: fc.uuid(),
    attestorName: fc.string({ minLength: 1, maxLength: 50 }),
    attestorTitle: fc.string({ minLength: 1, maxLength: 50 }),
    attestorEmail: fc.emailAddress(),
    attestationType: fc.constantFrom('primary', 'secondary', 'witness') as fc.Arbitrary<'primary' | 'secondary' | 'witness'>,
    signatureData: fc.string({ minLength: 10, maxLength: 100 }),
    signatureType: fc.constantFrom('drawn', 'typed') as fc.Arbitrary<'drawn' | 'typed'>,
    rationale: fc.string({ minLength: 20, maxLength: 200 }),
    attestedAt: fc.date().map(d => d.toISOString()),
    identityVerified: fc.constant(true),
    verificationMethod: fc.constantFrom('mfa', 'sso', 'password') as fc.Arbitrary<'mfa' | 'sso' | 'password'>,
  });

/**
 * Generator for an unsubmitted workflow cycle
 */
const unsubmittedCycleGenerator = (): fc.Arbitrary<WorkflowCycle> =>
  fc.record({
    id: fc.uuid(),
    status: fc.constantFrom('draft', 'in_progress') as fc.Arbitrary<'draft' | 'in_progress'>,
    artifacts: fc.array(artifactGenerator(), { minLength: 1, maxLength: 10 }),
    lockedArtifacts: fc.constant([] as ArtifactLock[]),
    submissionReceipt: fc.constant(null),
  });

/**
 * Generator for a submitted workflow cycle with locked artifacts
 */
const submittedCycleGenerator = (): fc.Arbitrary<WorkflowCycle> =>
  fc.array(artifactGenerator(), { minLength: 1, maxLength: 10 }).chain(artifacts => {
    const now = new Date().toISOString();
    const submissionId = `sub-${Date.now()}`;
    
    const lockedArtifacts: ArtifactLock[] = artifacts.map(artifact => ({
      artifactId: artifact.id,
      artifactName: artifact.name,
      lockedAt: now,
      lockedBy: 'test-user',
      submissionId,
      hash: calculateHash(artifact.content),
    }));

    return fc.record({
      id: fc.uuid(),
      status: fc.constantFrom('submitted', 'confirmed') as fc.Arbitrary<'submitted' | 'confirmed'>,
      artifacts: fc.constant(artifacts),
      lockedArtifacts: fc.constant(lockedArtifacts),
      submissionReceipt: attestationGenerator().map(attestation => ({
        id: submissionId,
        cycleId: 'cycle-1',
        reportName: 'Test Report',
        submissionTimestamp: now,
        submittedBy: 'test-user',
        submittedByName: 'Test User',
        confirmationNumber: `REG-${Date.now().toString(36).toUpperCase()}`,
        packageHash: calculateHash(artifacts.map(a => a.content).join(':')),
        artifactCount: artifacts.length,
        totalPages: 100,
        attestations: [attestation],
        status: 'confirmed' as SubmissionStatus,
        lockedAt: now,
      })),
    });
  });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 8: Artifact Lock Immutability', () => {

  it('should lock all artifacts when a cycle is submitted', async () => {
    await fc.assert(
      fc.property(
        unsubmittedCycleGenerator(),
        fc.array(attestationGenerator(), { minLength: 1, maxLength: 3 }),
        (cycle, attestations) => {
          // Before submission, no artifacts are locked
          expect(cycle.lockedArtifacts.length).toBe(0);
          expect(areAllArtifactsLocked(cycle)).toBe(false);
          
          // Submit the cycle
          const submittedCycle = submitCycle(cycle, attestations);
          
          // After submission, all artifacts should be locked
          expect(submittedCycle.status).toBe('confirmed');
          expect(submittedCycle.lockedArtifacts.length).toBe(cycle.artifacts.length);
          expect(areAllArtifactsLocked(submittedCycle)).toBe(true);
          
          // Each artifact should have a corresponding lock
          for (const artifact of submittedCycle.artifacts) {
            expect(isArtifactLocked(artifact.id, submittedCycle.lockedArtifacts)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should reject modification attempts on locked artifacts', async () => {
    await fc.assert(
      fc.property(
        submittedCycleGenerator(),
        fc.string({ minLength: 1, maxLength: 100 }),
        (cycle, newContent) => {
          // Cycle is submitted and all artifacts are locked
          expect(isSubmitted(cycle)).toBe(true);
          expect(areAllArtifactsLocked(cycle)).toBe(true);
          
          // Attempt to modify each artifact
          for (const artifact of cycle.artifacts) {
            const result = attemptModifyArtifact(cycle, artifact.id, newContent);
            
            // Modification should be rejected
            expect(result.success).toBe(false);
            expect(result.error).toContain('locked');
            expect(result.artifact).toBeUndefined();
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow modification of artifacts before submission', async () => {
    await fc.assert(
      fc.property(
        unsubmittedCycleGenerator(),
        fc.string({ minLength: 1, maxLength: 100 }),
        (cycle, newContent) => {
          // Cycle is not submitted
          expect(isSubmitted(cycle)).toBe(false);
          expect(cycle.lockedArtifacts.length).toBe(0);
          
          // Attempt to modify each artifact
          for (const artifact of cycle.artifacts) {
            const result = attemptModifyArtifact(cycle, artifact.id, newContent);
            
            // Modification should succeed
            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
            expect(result.artifact).toBeDefined();
            expect(result.artifact!.content).toBe(newContent);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should preserve artifact integrity through hash verification', async () => {
    await fc.assert(
      fc.property(
        submittedCycleGenerator(),
        (cycle) => {
          // For each locked artifact, verify integrity
          for (const artifact of cycle.artifacts) {
            const lock = cycle.lockedArtifacts.find(l => l.artifactId === artifact.id);
            expect(lock).toBeDefined();
            
            // Hash should match
            const isIntact = verifyArtifactIntegrity(artifact, lock!);
            expect(isIntact).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should detect tampering through hash mismatch', async () => {
    await fc.assert(
      fc.property(
        submittedCycleGenerator(),
        fc.string({ minLength: 1, maxLength: 100 }),
        (cycle, tamperedContent) => {
          // Tamper with an artifact's content (simulating unauthorized modification)
          if (cycle.artifacts.length > 0) {
            const tamperedArtifact: Artifact = {
              ...cycle.artifacts[0],
              content: tamperedContent,
            };
            
            const lock = cycle.lockedArtifacts.find(l => l.artifactId === tamperedArtifact.id);
            expect(lock).toBeDefined();
            
            // If content changed, hash should not match (unless by coincidence)
            if (tamperedContent !== cycle.artifacts[0].content) {
              const isIntact = verifyArtifactIntegrity(tamperedArtifact, lock!);
              // Hash collision is extremely unlikely
              expect(isIntact).toBe(false);
            }
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should generate submission receipt with all required fields', async () => {
    await fc.assert(
      fc.property(
        unsubmittedCycleGenerator(),
        fc.array(attestationGenerator(), { minLength: 1, maxLength: 3 }),
        (cycle, attestations) => {
          const submittedCycle = submitCycle(cycle, attestations);
          
          // Receipt should be generated
          expect(submittedCycle.submissionReceipt).not.toBeNull();
          
          const receipt = submittedCycle.submissionReceipt!;
          
          // All required fields should be present
          expect(receipt.id).toBeDefined();
          expect(receipt.cycleId).toBeDefined();
          expect(receipt.submissionTimestamp).toBeDefined();
          expect(receipt.confirmationNumber).toBeDefined();
          expect(receipt.packageHash).toBeDefined();
          expect(receipt.artifactCount).toBe(cycle.artifacts.length);
          expect(receipt.attestations.length).toBe(attestations.length);
          expect(receipt.status).toBe('confirmed');
          expect(receipt.lockedAt).toBeDefined();
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should not allow re-submission of already submitted cycle', async () => {
    await fc.assert(
      fc.property(
        submittedCycleGenerator(),
        fc.array(attestationGenerator(), { minLength: 1, maxLength: 3 }),
        (cycle, newAttestations) => {
          // Cycle is already submitted
          expect(isSubmitted(cycle)).toBe(true);
          
          // Attempt to submit again
          const resubmittedCycle = submitCycle(cycle, newAttestations);
          
          // Should return the same cycle unchanged
          expect(resubmittedCycle).toEqual(cycle);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should maintain lock count equal to artifact count after submission', async () => {
    await fc.assert(
      fc.property(
        unsubmittedCycleGenerator(),
        fc.array(attestationGenerator(), { minLength: 1, maxLength: 3 }),
        (cycle, attestations) => {
          const submittedCycle = submitCycle(cycle, attestations);
          
          // Lock count should equal artifact count
          expect(submittedCycle.lockedArtifacts.length).toBe(submittedCycle.artifacts.length);
          
          // Each artifact should have exactly one lock
          const lockIds = new Set(submittedCycle.lockedArtifacts.map(l => l.artifactId));
          const artifactIds = new Set(submittedCycle.artifacts.map(a => a.id));
          
          expect(lockIds.size).toBe(artifactIds.size);
          
          for (const artifactId of artifactIds) {
            expect(lockIds.has(artifactId)).toBe(true);
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should return error for non-existent artifact modification', async () => {
    await fc.assert(
      fc.property(
        submittedCycleGenerator(),
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 100 }),
        (cycle, nonExistentId, newContent) => {
          // Ensure the ID doesn't exist in the cycle
          const exists = cycle.artifacts.some(a => a.id === nonExistentId);
          
          if (!exists) {
            const result = attemptModifyArtifact(cycle, nonExistentId, newContent);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('not found');
          }
          
          return true;
        }
      ),
      propertyConfig
    );
  });

});
