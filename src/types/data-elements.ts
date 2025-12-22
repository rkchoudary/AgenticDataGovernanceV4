/**
 * Data element and requirements types for the Agentic Data Governance System
 */

import { DataType, DataGapReason, ArtifactStatus, ReconciliationItemStatus } from './common.js';

/**
 * Represents a data element from a regulatory template
 */
export interface DataElement {
  id: string;
  name: string;
  regulatoryDefinition: string;
  dataType: DataType;
  format: string;
  calculationLogic?: string;
  unit?: string;
  mandatory: boolean;
}

/**
 * Mapping of a data element to internal sources
 */
export interface DataMapping {
  elementId: string;
  sourceSystem: string;
  sourceTable: string;
  sourceField: string;
  transformationLogic?: string;
  confidence: number;
  validatedBy?: string;
}

/**
 * Represents a data gap where no internal source is found
 */
export interface DataGap {
  elementId: string;
  elementName: string;
  reason: DataGapReason;
  suggestedResolution?: string;
}

/**
 * Requirements document for a regulatory report
 */
export interface RequirementsDocument {
  id: string;
  reportId: string;
  elements: DataElement[];
  mappings: DataMapping[];
  gaps: DataGap[];
  version: number;
  status: ArtifactStatus;
  createdAt: Date;
  updatedAt: Date;
  validatedBy?: string;
  validatedAt?: Date;
}

/**
 * Result of reconciling documents
 */
export interface ReconciliationResult {
  items: ReconciliationItem[];
  matchedCount: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
}

/**
 * Individual item in reconciliation result
 */
export interface ReconciliationItem {
  itemId: string;
  itemType: string;
  status: ReconciliationItemStatus;
  existingValue?: unknown;
  newValue?: unknown;
  differences?: string[];
}

/**
 * Data catalog for internal sources
 */
export interface DataCatalog {
  id: string;
  systems: DataSystem[];
  lastUpdated: Date;
}

/**
 * Represents a data system in the catalog
 */
export interface DataSystem {
  id: string;
  name: string;
  tables: DataTable[];
}

/**
 * Represents a table in a data system
 */
export interface DataTable {
  id: string;
  name: string;
  fields: DataField[];
}

/**
 * Represents a field in a data table
 */
export interface DataField {
  id: string;
  name: string;
  dataType: DataType;
  description?: string;
  businessTerm?: string;
}
