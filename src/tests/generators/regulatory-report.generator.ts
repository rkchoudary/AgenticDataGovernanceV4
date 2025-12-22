/**
 * Test generators for Regulatory Intelligence Agent property tests
 * 
 * **Feature: agentic-data-governance, Property 1: Artifact Review State Invariant**
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */

import fc from 'fast-check';
import { v4 as uuidv4 } from 'uuid';
import {
  RegulatoryReport,
  ReportCatalog,
  RegulatoryChange,
  ScanResult,
  CatalogUpdate,
  DueDateRule
} from '../../types/regulatory.js';
import { Jurisdiction, ReportFrequency, ArtifactStatus } from '../../types/common.js';
import { artifactStatusGenerator } from './common.generator.js';
import { reportFrequencyGenerator } from './control.generator.js';

/**
 * Generator for Jurisdiction
 */
export const jurisdictionGenerator = (): fc.Arbitrary<Jurisdiction> =>
  fc.constantFrom('US', 'CA');

/**
 * Generator for DueDateRule
 */
export const dueDateRuleGenerator = (): fc.Arbitrary<DueDateRule> =>
  fc.record({
    daysAfterPeriodEnd: fc.integer({ min: 1, max: 90 }),
    businessDaysOnly: fc.boolean(),
    timezone: fc.constantFrom('America/New_York', 'America/Toronto', 'America/Chicago', 'America/Los_Angeles', 'UTC')
  });

/**
 * Generator for RegulatoryReport
 */
export const regulatoryReportGenerator = (): fc.Arbitrary<RegulatoryReport> =>
  fc.record({
    id: fc.constant(uuidv4()),
    name: fc.oneof(
      fc.constantFrom(
        'FR Y-9C', 'FR Y-14A', 'FFIEC 031', 'FFIEC 041', 'Call Report',
        'OSFI E2', 'OSFI P2', 'OSFI D11', 'Basel III Disclosure', 'LCR Report'
      ),
      fc.string({ minLength: 5, maxLength: 50 })
    ),
    jurisdiction: jurisdictionGenerator(),
    regulator: fc.oneof(
      fc.constantFrom('Federal Reserve', 'OCC', 'FDIC', 'OSFI', 'SEC', 'FINRA'),
      fc.string({ minLength: 3, maxLength: 30 })
    ),
    frequency: reportFrequencyGenerator(),
    dueDate: dueDateRuleGenerator(),
    submissionFormat: fc.constantFrom('XML', 'XBRL', 'CSV', 'PDF', 'Excel'),
    submissionPlatform: fc.constantFrom('RRS', 'CDR', 'EDGAR', 'FRB Portal', 'OSFI Portal'),
    description: fc.string({ minLength: 20, maxLength: 500 }),
    templateUrl: fc.option(fc.webUrl()),
    lastUpdated: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    responsibleUnit: fc.constantFrom(
      'Finance', 'Risk Management', 'Compliance', 'Treasury', 'Operations'
    )
  });

/**
 * Generator for RegulatoryChange
 */
export const regulatoryChangeGenerator = (): fc.Arbitrary<RegulatoryChange> =>
  fc.record({
    id: fc.constant(uuidv4()),
    reportId: fc.option(fc.constant(uuidv4())),
    changeType: fc.constantFrom('new', 'updated', 'removed'),
    description: fc.string({ minLength: 20, maxLength: 300 }),
    effectiveDate: fc.date({ min: new Date(), max: new Date('2026-12-31') }),
    detectedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    source: fc.constantFrom(
      'Federal Reserve Website', 'OSFI Bulletin', 'OCC Guidance', 'FDIC Notice', 'Regulatory API'
    )
  });

/**
 * Generator for ReportCatalog
 */
export const reportCatalogGenerator = (): fc.Arbitrary<ReportCatalog> =>
  fc.record({
    reports: fc.array(regulatoryReportGenerator(), { minLength: 0, maxLength: 20 }),
    version: fc.integer({ min: 1, max: 100 }),
    lastScanned: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    status: artifactStatusGenerator(),
    approvedBy: fc.option(fc.string({ minLength: 3, maxLength: 50 })),
    approvedAt: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }))
  });

/**
 * Generator for ReportCatalog with specific status
 */
export const reportCatalogWithStatusGenerator = (status: ArtifactStatus): fc.Arbitrary<ReportCatalog> =>
  fc.record({
    reports: fc.array(regulatoryReportGenerator(), { minLength: 1, maxLength: 10 }),
    version: fc.integer({ min: 1, max: 100 }),
    lastScanned: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    status: fc.constant(status),
    approvedBy: status === 'approved' ? fc.string({ minLength: 3, maxLength: 50 }) : fc.option(fc.string({ minLength: 3, maxLength: 50 })),
    approvedAt: status === 'approved' ? fc.date({ min: new Date('2020-01-01'), max: new Date() }) : fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }))
  });

/**
 * Generator for ScanResult
 */
export const scanResultGenerator = (): fc.Arbitrary<ScanResult> =>
  fc.record({
    jurisdiction: jurisdictionGenerator(),
    scannedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    reportsFound: fc.integer({ min: 0, max: 100 }),
    changesDetected: fc.array(regulatoryChangeGenerator(), { minLength: 0, maxLength: 10 })
  });

/**
 * Generator for CatalogUpdate
 */
export const catalogUpdateGenerator = (): fc.Arbitrary<CatalogUpdate> =>
  fc.record({
    version: fc.integer({ min: 1, max: 100 }),
    addedReports: fc.array(fc.constant(uuidv4()), { minLength: 0, maxLength: 5 }),
    updatedReports: fc.array(fc.constant(uuidv4()), { minLength: 0, maxLength: 5 }),
    removedReports: fc.array(fc.constant(uuidv4()), { minLength: 0, maxLength: 3 }),
    updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
  });

/**
 * Generator for a pair of ReportCatalogs for reconciliation testing
 */
export const reportCatalogPairGenerator = (): fc.Arbitrary<{ existing: ReportCatalog; new: ReportCatalog }> =>
  fc.record({
    existing: reportCatalogGenerator(),
    new: reportCatalogGenerator()
  });
