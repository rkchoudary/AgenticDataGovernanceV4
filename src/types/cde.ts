/**
 * Critical Data Element (CDE) types for the Agentic Data Governance System
 */

import { CDEStatus, ArtifactStatus } from './common.js';

/**
 * Scoring factors for CDE identification
 */
export interface CDEScoringFactors {
  regulatoryCalculationUsage: number;
  crossReportUsage: number;
  financialImpact: number;
  regulatoryScrutiny: number;
}

/**
 * CDE score result
 */
export interface CDEScore {
  elementId: string;
  overallScore: number;
  factors: CDEScoringFactors;
  rationale: string;
}

/**
 * Critical Data Element
 */
export interface CDE {
  id: string;
  elementId: string;
  name: string;
  businessDefinition: string;
  criticalityRationale: string;
  dataOwner?: string;
  dataOwnerEmail?: string;
  status: CDEStatus;
  approvedBy?: string;
  approvedAt?: Date;
}

/**
 * Inventory of CDEs for a report
 */
export interface CDEInventory {
  id: string;
  reportId: string;
  cdes: CDE[];
  version: number;
  status: ArtifactStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Suggestion for data owner assignment
 */
export interface OwnerSuggestion {
  cdeId: string;
  suggestedOwner: string;
  suggestedOwnerEmail: string;
  confidence: number;
  rationale: string;
}

/**
 * Context for CDE scoring
 */
export interface ScoringContext {
  reportId: string;
  existingCDEs?: CDE[];
  threshold: number;
}
