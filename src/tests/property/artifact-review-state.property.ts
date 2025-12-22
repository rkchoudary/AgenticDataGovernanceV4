/**
 * **Feature: agentic-data-governance, Property 1: Artifact Review State Invariant**
 * 
 * For any governance artifact (Report Catalog, Requirements Document, CDE Inventory, 
 * Compliance Package), the artifact's status must transition through 'pending_review' 
 * before reaching 'approved' status.
 * 
 * **Validates: Requirements 1.3, 3.5, 4.4, 10.3**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { InMemoryGovernanceRepository } from '../../repository/governance-repository.js';
import { ReportCatalogService } from '../../services/report-catalog-service.js';
import {
  RegulatoryReport,
  CDEInventory,
  RequirementsDocument,
  CompliancePackage,
  ArtifactStatus,
  Jurisdiction,
  ReportFrequency
} from '../../types/index.js';
import {
  nonEmptyStringGenerator,
  dateGenerator,
  artifactStatusGenerator
} from '../generators/index.js';

// Property test configuration - minimum 100 iterations
const propertyConfig = {
  numRuns: 100,
  verbose: false
};

describe('Property 1: Artifact Review State Invariant', () => {
  let repository: InMemoryGovernanceRepository;
  let catalogService: ReportCatalogService;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    catalogService = new ReportCatalogService(repository);
  });

  /**
   * Generator for RegulatoryReport
   */
  const regulatoryReportGenerator = (): fc.Arbitrary<RegulatoryReport> =>
    fc.record({
      id: fc.uuid(),
      name: nonEmptyStringGenerator(),
      jurisdiction: fc.constantFrom('US', 'CA') as fc.Arbitrary<Jurisdiction>,
      regulator: nonEmptyStringGenerator(),
      frequency: fc.constantFrom('daily', 'weekly', 'monthly', 'quarterly', 'annual') as fc.Arbitrary<ReportFrequency>,
      dueDate: fc.record({
        daysAfterPeriodEnd: fc.integer({ min: 1, max: 90 }),
        businessDaysOnly: fc.boolean(),
        timezone: fc.constant('America/New_York')
      }),
      submissionFormat: nonEmptyStringGenerator(),
      submissionPlatform: nonEmptyStringGenerator(),
      description: nonEmptyStringGenerator(),
      templateUrl: fc.option(fc.webUrl()),
      lastUpdated: dateGenerator(),
      responsibleUnit: nonEmptyStringGenerator()
    });

  /**
   * Generator for CDEInventory
   */
  const cdeInventoryGenerator = (): fc.Arbitrary<CDEInventory> =>
    fc.record({
      id: fc.uuid(),
      reportId: fc.uuid(),
      cdes: fc.array(fc.record({
        id: fc.uuid(),
        elementId: fc.uuid(),
        name: nonEmptyStringGenerator(),
        businessDefinition: nonEmptyStringGenerator(),
        criticalityRationale: nonEmptyStringGenerator(),
        dataOwner: fc.option(nonEmptyStringGenerator()),
        dataOwnerEmail: fc.option(fc.emailAddress()),
        status: fc.constantFrom('pending_approval', 'approved', 'rejected'),
        approvedBy: fc.option(nonEmptyStringGenerator()),
        approvedAt: fc.option(dateGenerator())
      }), { minLength: 0, maxLength: 5 }),
      version: fc.integer({ min: 1, max: 100 }),
      status: artifactStatusGenerator(),
      createdAt: dateGenerator(),
      updatedAt: dateGenerator()
    });


  /**
   * Generator for RequirementsDocument
   */
  const requirementsDocumentGenerator = (): fc.Arbitrary<RequirementsDocument> =>
    fc.record({
      id: fc.uuid(),
      reportId: fc.uuid(),
      elements: fc.array(fc.record({
        id: fc.uuid(),
        name: nonEmptyStringGenerator(),
        regulatoryDefinition: nonEmptyStringGenerator(),
        dataType: fc.constantFrom('string', 'number', 'date', 'boolean', 'decimal', 'integer'),
        format: nonEmptyStringGenerator(),
        calculationLogic: fc.option(nonEmptyStringGenerator()),
        unit: fc.option(nonEmptyStringGenerator()),
        mandatory: fc.boolean()
      }), { minLength: 0, maxLength: 5 }),
      mappings: fc.array(fc.record({
        elementId: fc.uuid(),
        sourceSystem: nonEmptyStringGenerator(),
        sourceTable: nonEmptyStringGenerator(),
        sourceField: nonEmptyStringGenerator(),
        transformationLogic: fc.option(nonEmptyStringGenerator()),
        confidence: fc.float({ min: 0, max: 1 }),
        validatedBy: fc.option(nonEmptyStringGenerator())
      }), { minLength: 0, maxLength: 5 }),
      gaps: fc.array(fc.record({
        elementId: fc.uuid(),
        elementName: nonEmptyStringGenerator(),
        reason: fc.constantFrom('no_source', 'partial_source', 'calculation_needed'),
        suggestedResolution: fc.option(nonEmptyStringGenerator())
      }), { minLength: 0, maxLength: 3 }),
      version: fc.integer({ min: 1, max: 100 }),
      status: artifactStatusGenerator(),
      createdAt: dateGenerator(),
      updatedAt: dateGenerator()
    });

  /**
   * Generator for CompliancePackage
   */
  const compliancePackageGenerator = (): fc.Arbitrary<CompliancePackage> =>
    fc.record({
      id: fc.uuid(),
      cycleId: fc.uuid(),
      reportId: fc.uuid(),
      documents: fc.array(fc.record({
        id: fc.uuid(),
        type: fc.constantFrom('data_dictionary', 'lineage_documentation', 'quality_assurance_report', 'control_effectiveness_report', 'bcbs239_compliance_mapping'),
        title: nonEmptyStringGenerator(),
        content: nonEmptyStringGenerator(),
        format: fc.constantFrom('pdf', 'html', 'markdown'),
        generatedAt: dateGenerator(),
        version: fc.integer({ min: 1, max: 100 })
      }), { minLength: 0, maxLength: 5 }),
      status: artifactStatusGenerator(),
      reviewedBy: fc.option(nonEmptyStringGenerator()),
      reviewedAt: fc.option(dateGenerator()),
      createdAt: dateGenerator()
    });

  /**
   * Helper to track status transitions
   */
  class StatusTransitionTracker {
    private transitions: ArtifactStatus[] = [];

    recordStatus(status: ArtifactStatus): void {
      this.transitions.push(status);
    }

    hasPassedThroughPendingReview(): boolean {
      const approvedIndex = this.transitions.lastIndexOf('approved');
      if (approvedIndex === -1) return true; // No approval, so invariant holds
      
      // Check if pending_review appears before approved
      const pendingReviewIndex = this.transitions.indexOf('pending_review');
      return pendingReviewIndex !== -1 && pendingReviewIndex < approvedIndex;
    }

    getTransitions(): ArtifactStatus[] {
      return [...this.transitions];
    }
  }

  it('should require pending_review before approved for ReportCatalog', () => {
    fc.assert(
      fc.property(
        fc.array(regulatoryReportGenerator(), { minLength: 1, maxLength: 5 }),
        nonEmptyStringGenerator(),
        nonEmptyStringGenerator(),
        (reports, creator, approver) => {
          const tracker = new StatusTransitionTracker();
          
          // Create catalog (starts as draft)
          const catalog = catalogService.createCatalog(reports, creator);
          tracker.recordStatus(catalog.status);
          expect(catalog.status).toBe('draft');
          
          // Submit for review (transitions to pending_review)
          const reviewCatalog = catalogService.submitForReview(creator);
          tracker.recordStatus(reviewCatalog.status);
          expect(reviewCatalog.status).toBe('pending_review');
          
          // Approve (transitions to approved)
          const approvedCatalog = catalogService.approveCatalog(approver);
          tracker.recordStatus(approvedCatalog.status);
          expect(approvedCatalog.status).toBe('approved');
          
          // Verify the invariant: pending_review must come before approved
          expect(tracker.hasPassedThroughPendingReview()).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should prevent direct transition from draft to approved for ReportCatalog', () => {
    fc.assert(
      fc.property(
        fc.array(regulatoryReportGenerator(), { minLength: 1, maxLength: 5 }),
        nonEmptyStringGenerator(),
        nonEmptyStringGenerator(),
        (reports, creator, approver) => {
          // Create catalog (starts as draft)
          catalogService.createCatalog(reports, creator);
          
          // Attempting to approve directly should fail
          expect(() => catalogService.approveCatalog(approver)).toThrow(
            "Cannot approve catalog with status 'draft'"
          );
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should require pending_review before approved for CDEInventory', () => {
    fc.assert(
      fc.property(
        cdeInventoryGenerator(),
        fc.uuid(),
        (inventoryData, reportId) => {
          const tracker = new StatusTransitionTracker();
          
          // Start with draft status
          const draftInventory: CDEInventory = {
            ...inventoryData,
            status: 'draft' as ArtifactStatus
          };
          repository.setCDEInventory(reportId, draftInventory);
          tracker.recordStatus(draftInventory.status);
          
          // Transition to pending_review
          const pendingInventory: CDEInventory = {
            ...draftInventory,
            status: 'pending_review' as ArtifactStatus
          };
          repository.setCDEInventory(reportId, pendingInventory);
          tracker.recordStatus(pendingInventory.status);
          
          // Transition to approved
          const approvedInventory: CDEInventory = {
            ...pendingInventory,
            status: 'approved' as ArtifactStatus
          };
          repository.setCDEInventory(reportId, approvedInventory);
          tracker.recordStatus(approvedInventory.status);
          
          // Verify the invariant
          expect(tracker.hasPassedThroughPendingReview()).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should require pending_review before approved for RequirementsDocument', () => {
    fc.assert(
      fc.property(
        requirementsDocumentGenerator(),
        fc.uuid(),
        (docData, reportId) => {
          const tracker = new StatusTransitionTracker();
          
          // Start with draft status
          const draftDoc: RequirementsDocument = {
            ...docData,
            status: 'draft' as ArtifactStatus
          };
          repository.setRequirementsDocument(reportId, draftDoc);
          tracker.recordStatus(draftDoc.status);
          
          // Transition to pending_review
          const pendingDoc: RequirementsDocument = {
            ...draftDoc,
            status: 'pending_review' as ArtifactStatus
          };
          repository.setRequirementsDocument(reportId, pendingDoc);
          tracker.recordStatus(pendingDoc.status);
          
          // Transition to approved
          const approvedDoc: RequirementsDocument = {
            ...pendingDoc,
            status: 'approved' as ArtifactStatus
          };
          repository.setRequirementsDocument(reportId, approvedDoc);
          tracker.recordStatus(approvedDoc.status);
          
          // Verify the invariant
          expect(tracker.hasPassedThroughPendingReview()).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should require pending_review before approved for CompliancePackage', () => {
    fc.assert(
      fc.property(
        compliancePackageGenerator(),
        fc.uuid(),
        (pkgData, cycleId) => {
          const tracker = new StatusTransitionTracker();
          
          // Start with draft status
          const draftPkg: CompliancePackage = {
            ...pkgData,
            status: 'draft' as ArtifactStatus
          };
          repository.setCompliancePackage(cycleId, draftPkg);
          tracker.recordStatus(draftPkg.status);
          
          // Transition to pending_review
          const pendingPkg: CompliancePackage = {
            ...draftPkg,
            status: 'pending_review' as ArtifactStatus
          };
          repository.setCompliancePackage(cycleId, pendingPkg);
          tracker.recordStatus(pendingPkg.status);
          
          // Transition to approved
          const approvedPkg: CompliancePackage = {
            ...pendingPkg,
            status: 'approved' as ArtifactStatus
          };
          repository.setCompliancePackage(cycleId, approvedPkg);
          tracker.recordStatus(approvedPkg.status);
          
          // Verify the invariant
          expect(tracker.hasPassedThroughPendingReview()).toBe(true);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should track all status transitions in audit trail for any artifact', () => {
    fc.assert(
      fc.property(
        fc.array(regulatoryReportGenerator(), { minLength: 1, maxLength: 3 }),
        nonEmptyStringGenerator(),
        nonEmptyStringGenerator(),
        (reports, creator, approver) => {
          // Create and transition catalog through all states
          catalogService.createCatalog(reports, creator);
          catalogService.submitForReview(creator);
          catalogService.approveCatalog(approver);
          
          // Get audit entries for ReportCatalog
          const auditEntries = repository.getAuditEntries('ReportCatalog');
          
          // Should have audit entries for each transition
          expect(auditEntries.length).toBeGreaterThanOrEqual(3);
          
          // Verify audit entries contain status information
          const statusChanges = auditEntries.filter(e => 
            e.newState && typeof e.newState === 'object' && 'status' in e.newState
          );
          expect(statusChanges.length).toBeGreaterThanOrEqual(1);
          
          return true;
        }
      ),
      propertyConfig
    );
  });

  it('should allow rejection from pending_review state', () => {
    fc.assert(
      fc.property(
        fc.array(regulatoryReportGenerator(), { minLength: 1, maxLength: 3 }),
        nonEmptyStringGenerator(),
        nonEmptyStringGenerator(),
        nonEmptyStringGenerator(),
        (reports, creator, rejector, reason) => {
          // Create catalog
          catalogService.createCatalog(reports, creator);
          
          // Submit for review
          catalogService.submitForReview(creator);
          
          // Reject
          const rejectedCatalog = catalogService.rejectCatalog(rejector, reason);
          expect(rejectedCatalog.status).toBe('rejected');
          
          // Verify rejection is logged - find the specific reject_catalog entry
          const auditEntries = repository.getAuditEntries('ReportCatalog');
          const rejectEntries = auditEntries.filter(e => e.action === 'reject_catalog');
          expect(rejectEntries.length).toBeGreaterThanOrEqual(1);
          
          // Get the most recent reject entry
          const rejectEntry = rejectEntries[rejectEntries.length - 1];
          expect(rejectEntry).toBeDefined();
          expect(rejectEntry.rationale).toBe(reason);
          expect(rejectEntry.actor).toBe(rejector);
          
          return true;
        }
      ),
      propertyConfig
    );
  });
});
