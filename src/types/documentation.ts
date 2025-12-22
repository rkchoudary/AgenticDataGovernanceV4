/**
 * Documentation types for the Agentic Data Governance System
 */

import { DocumentType, DocumentFormat, ArtifactStatus } from './common.js';

/**
 * Generated document
 */
export interface Document {
  id: string;
  type: DocumentType;
  title: string;
  content: string;
  format: DocumentFormat;
  generatedAt: Date;
  version: number;
}

/**
 * Compliance package for a cycle
 */
export interface CompliancePackage {
  id: string;
  cycleId: string;
  reportId: string;
  documents: Document[];
  status: ArtifactStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}
