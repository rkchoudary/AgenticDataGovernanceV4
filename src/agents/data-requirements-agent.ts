/**
 * Data Requirements Agent
 * Parses regulatory templates and maps data elements to internal sources
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { v4 as uuidv4 } from 'uuid';
import {
  DataElement,
  DataMapping,
  DataGap,
  RequirementsDocument,
  ReconciliationResult,
  DataCatalog,
  DataField,
  ArtifactStatus,
  DataType,
  DataGapReason,
  ReconciliationItemStatus
} from '../types/index.js';
import { IDataRequirementsAgent } from '../interfaces/agents.js';
import { IGovernanceRepository } from '../repository/governance-repository.js';

/**
 * Configuration for the Data Requirements Agent
 */
export interface DataRequirementsAgentConfig {
  /** Minimum confidence score for automatic mapping (0-1) */
  minMappingConfidence: number;
  /** Similarity threshold for semantic matching (0-1) */
  semanticSimilarityThreshold: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: DataRequirementsAgentConfig = {
  minMappingConfidence: 0.7,
  semanticSimilarityThreshold: 0.6
};

/**
 * Represents a parsed regulatory template
 */
export interface RegulatoryTemplate {
  reportId: string;
  reportName: string;
  elements: TemplateElement[];
  version: string;
  effectiveDate: Date;
}

/**
 * Element from a regulatory template
 */
export interface TemplateElement {
  fieldId: string;
  fieldName: string;
  description: string;
  dataType: string;
  format?: string;
  calculationLogic?: string;
  unit?: string;
  required: boolean;
}


/**
 * Implementation of the Data Requirements Agent
 */
export class DataRequirementsAgent implements IDataRequirementsAgent {
  private repository: IGovernanceRepository;
  private config: DataRequirementsAgentConfig;

  constructor(
    repository: IGovernanceRepository,
    config: Partial<DataRequirementsAgentConfig> = {}
  ) {
    this.repository = repository;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Parses a regulatory template and extracts all data elements
   * Requirement 3.1: Extract all data elements with regulatory definitions, data types, formats, and calculation requirements
   * 
   * @param templateUrl - URL or identifier of the regulatory template
   * @returns Array of extracted data elements with all required fields populated
   */
  async parseRegulatoryTemplate(templateUrl: string): Promise<DataElement[]> {
    // Fetch and parse the template (simulated - in production would fetch from URL)
    const template = await this.fetchTemplate(templateUrl);
    
    const elements: DataElement[] = template.elements.map(elem => ({
      id: uuidv4(),
      name: elem.fieldName,
      regulatoryDefinition: elem.description,
      dataType: this.normalizeDataType(elem.dataType),
      format: elem.format || this.inferFormat(elem.dataType),
      calculationLogic: elem.calculationLogic,
      unit: elem.unit,
      mandatory: elem.required
    }));

    // Log the parsing action
    this.repository.createAuditEntry({
      actor: 'DataRequirementsAgent',
      actorType: 'agent',
      action: 'parse_regulatory_template',
      entityType: 'RegulatoryTemplate',
      entityId: templateUrl,
      newState: { 
        templateUrl, 
        elementsExtracted: elements.length,
        elementIds: elements.map(e => e.id)
      }
    });

    return elements;
  }

  /**
   * Maps data elements to internal data sources
   * Requirement 3.2: Cross-reference firm's data catalog and suggest source system and field mappings
   * 
   * @param elements - Data elements to map
   * @param catalog - Internal data catalog to search
   * @returns Array of data mappings with confidence scores
   */
  async mapToInternalSources(
    elements: DataElement[],
    catalog: DataCatalog
  ): Promise<DataMapping[]> {
    const mappings: DataMapping[] = [];

    for (const element of elements) {
      const bestMatch = this.findBestMatch(element, catalog);
      
      if (bestMatch && bestMatch.confidence >= this.config.minMappingConfidence) {
        mappings.push({
          elementId: element.id,
          sourceSystem: bestMatch.system,
          sourceTable: bestMatch.table,
          sourceField: bestMatch.field,
          transformationLogic: this.generateTransformationLogic(element, bestMatch),
          confidence: bestMatch.confidence
        });
      } else if (bestMatch) {
        // Low confidence match - still include but mark for review
        mappings.push({
          elementId: element.id,
          sourceSystem: bestMatch.system,
          sourceTable: bestMatch.table,
          sourceField: bestMatch.field,
          transformationLogic: this.generateTransformationLogic(element, bestMatch),
          confidence: bestMatch.confidence
        });
      }
      // Elements with no match will be identified as gaps
    }

    // Log the mapping action
    this.repository.createAuditEntry({
      actor: 'DataRequirementsAgent',
      actorType: 'agent',
      action: 'map_to_internal_sources',
      entityType: 'DataMapping',
      entityId: 'batch',
      newState: {
        elementsProcessed: elements.length,
        mappingsCreated: mappings.length,
        avgConfidence: mappings.length > 0 
          ? mappings.reduce((sum, m) => sum + m.confidence, 0) / mappings.length 
          : 0
      }
    });

    return mappings;
  }

  /**
   * Identifies data gaps where no internal source is found
   * Requirement 3.3: Flag elements as data gaps requiring resolution
   * 
   * @param mappings - Current mappings to analyze
   * @returns Array of identified data gaps
   */
  async identifyDataGaps(mappings: DataMapping[]): Promise<DataGap[]> {
    // Get all elements from the current requirements document context
    // Elements without mappings or with low confidence are gaps
    const lowConfidenceMappings = mappings.filter(
      m => m.confidence < this.config.minMappingConfidence
    );

    const gaps: DataGap[] = [];

    // Add gaps for low confidence mappings
    for (const mapping of lowConfidenceMappings) {
      gaps.push({
        elementId: mapping.elementId,
        elementName: `Element ${mapping.elementId}`, // Will be enriched later
        reason: 'partial_source' as DataGapReason,
        suggestedResolution: `Review mapping to ${mapping.sourceSystem}.${mapping.sourceTable}.${mapping.sourceField} (confidence: ${(mapping.confidence * 100).toFixed(1)}%)`
      });
    }

    // Log the gap identification
    this.repository.createAuditEntry({
      actor: 'DataRequirementsAgent',
      actorType: 'agent',
      action: 'identify_data_gaps',
      entityType: 'DataGap',
      entityId: 'batch',
      newState: {
        totalMappings: mappings.length,
        gapsIdentified: gaps.length,
        gapReasons: gaps.reduce((acc, g) => {
          acc[g.reason] = (acc[g.reason] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      }
    });

    return gaps;
  }


  /**
   * Generates a requirements document for a regulatory report
   * Requirement 3.4, 3.5: Generate and manage requirements documents
   * 
   * @param reportId - ID of the regulatory report
   * @returns Generated requirements document
   */
  async generateRequirementsDocument(reportId: string): Promise<RequirementsDocument> {
    // Get existing document if any
    const existingDoc = this.repository.getRequirementsDocument(reportId);
    const version = existingDoc ? existingDoc.version + 1 : 1;

    const doc: RequirementsDocument = {
      id: existingDoc?.id || uuidv4(),
      reportId,
      elements: existingDoc?.elements || [],
      mappings: existingDoc?.mappings || [],
      gaps: existingDoc?.gaps || [],
      version,
      status: 'draft' as ArtifactStatus,
      createdAt: existingDoc?.createdAt || new Date(),
      updatedAt: new Date()
    };

    this.repository.setRequirementsDocument(reportId, doc);

    // Log the generation
    this.repository.createAuditEntry({
      actor: 'DataRequirementsAgent',
      actorType: 'agent',
      action: 'generate_requirements_document',
      entityType: 'RequirementsDocument',
      entityId: doc.id,
      previousState: existingDoc,
      newState: doc
    });

    return doc;
  }

  /**
   * Ingests an existing requirements document and reconciles with current state
   * Requirement 3.4: Ingest and reconcile existing documents with newly parsed requirements
   * 
   * @param document - Existing requirements document to ingest
   * @returns Reconciliation result showing matched, added, removed, and modified items
   */
  async ingestExistingDocument(document: RequirementsDocument): Promise<ReconciliationResult> {
    const currentDoc = this.repository.getRequirementsDocument(document.reportId);
    
    const result: ReconciliationResult = {
      items: [],
      matchedCount: 0,
      addedCount: 0,
      removedCount: 0,
      modifiedCount: 0
    };

    if (!currentDoc) {
      // No existing document - all items are new
      for (const element of document.elements) {
        result.items.push({
          itemId: element.id,
          itemType: 'DataElement',
          status: 'added' as ReconciliationItemStatus,
          newValue: element
        });
        result.addedCount++;
      }
    } else {
      // Reconcile elements
      // Check for added and modified elements
      for (const element of document.elements) {
        const currentElement = currentDoc.elements.find(e => e.id === element.id);
        
        if (!currentElement) {
          // Try to match by name
          const matchByName = currentDoc.elements.find(
            e => e.name.toLowerCase() === element.name.toLowerCase()
          );
          
          if (matchByName) {
            const differences = this.compareElements(matchByName, element);
            if (differences.length > 0) {
              result.items.push({
                itemId: element.id,
                itemType: 'DataElement',
                status: 'modified' as ReconciliationItemStatus,
                existingValue: matchByName,
                newValue: element,
                differences
              });
              result.modifiedCount++;
            } else {
              result.items.push({
                itemId: element.id,
                itemType: 'DataElement',
                status: 'matched' as ReconciliationItemStatus,
                existingValue: matchByName,
                newValue: element
              });
              result.matchedCount++;
            }
          } else {
            result.items.push({
              itemId: element.id,
              itemType: 'DataElement',
              status: 'added' as ReconciliationItemStatus,
              newValue: element
            });
            result.addedCount++;
          }
        } else {
          const differences = this.compareElements(currentElement, element);
          if (differences.length > 0) {
            result.items.push({
              itemId: element.id,
              itemType: 'DataElement',
              status: 'modified' as ReconciliationItemStatus,
              existingValue: currentElement,
              newValue: element,
              differences
            });
            result.modifiedCount++;
          } else {
            result.items.push({
              itemId: element.id,
              itemType: 'DataElement',
              status: 'matched' as ReconciliationItemStatus,
              existingValue: currentElement,
              newValue: element
            });
            result.matchedCount++;
          }
        }
      }

      // Check for removed elements
      for (const currentElement of currentDoc.elements) {
        const stillExists = document.elements.some(
          e => e.id === currentElement.id || 
               e.name.toLowerCase() === currentElement.name.toLowerCase()
        );
        
        if (!stillExists) {
          result.items.push({
            itemId: currentElement.id,
            itemType: 'DataElement',
            status: 'removed' as ReconciliationItemStatus,
            existingValue: currentElement
          });
          result.removedCount++;
        }
      }
    }

    // Store the ingested document
    const mergedDoc = this.mergeDocuments(currentDoc, document, result);
    this.repository.setRequirementsDocument(document.reportId, mergedDoc);

    // Log the reconciliation
    this.repository.createAuditEntry({
      actor: 'DataRequirementsAgent',
      actorType: 'agent',
      action: 'ingest_existing_document',
      entityType: 'RequirementsDocument',
      entityId: document.id,
      previousState: currentDoc,
      newState: mergedDoc,
      rationale: `Reconciled: ${result.matchedCount} matched, ${result.addedCount} added, ${result.removedCount} removed, ${result.modifiedCount} modified`
    });

    return result;
  }


  // ============ Helper Methods ============

  /**
   * Fetches and parses a regulatory template
   * In production, this would fetch from the actual URL
   */
  private async fetchTemplate(templateUrl: string): Promise<RegulatoryTemplate> {
    // Simulated template fetch - in production would parse actual template
    // This returns a minimal template structure
    return {
      reportId: templateUrl,
      reportName: `Report from ${templateUrl}`,
      elements: [],
      version: '1.0',
      effectiveDate: new Date()
    };
  }

  /**
   * Normalizes data type strings to standard DataType enum values
   */
  private normalizeDataType(rawType: string): DataType {
    const normalized = rawType.toLowerCase().trim();
    
    const typeMap: Record<string, DataType> = {
      'string': 'string',
      'text': 'string',
      'varchar': 'string',
      'char': 'string',
      'number': 'number',
      'numeric': 'number',
      'float': 'number',
      'double': 'number',
      'decimal': 'decimal',
      'money': 'decimal',
      'currency': 'decimal',
      'integer': 'integer',
      'int': 'integer',
      'bigint': 'integer',
      'smallint': 'integer',
      'date': 'date',
      'datetime': 'date',
      'timestamp': 'date',
      'boolean': 'boolean',
      'bool': 'boolean',
      'bit': 'boolean'
    };

    return typeMap[normalized] || 'string';
  }

  /**
   * Infers format based on data type
   */
  private inferFormat(dataType: string): string {
    const normalized = dataType.toLowerCase();
    
    if (normalized.includes('date')) return 'YYYY-MM-DD';
    if (normalized.includes('time')) return 'YYYY-MM-DDTHH:mm:ss';
    if (normalized.includes('decimal') || normalized.includes('money')) return '#,##0.00';
    if (normalized.includes('int')) return '#,##0';
    
    return 'text';
  }

  /**
   * Match result from catalog search
   */
  private findBestMatch(
    element: DataElement,
    catalog: DataCatalog
  ): { system: string; table: string; field: string; confidence: number; fieldData: DataField } | null {
    let bestMatch: { system: string; table: string; field: string; confidence: number; fieldData: DataField } | null = null;
    let highestScore = 0;

    for (const system of catalog.systems) {
      for (const table of system.tables) {
        for (const field of table.fields) {
          const score = this.calculateMatchScore(element, field);
          
          if (score > highestScore) {
            highestScore = score;
            bestMatch = {
              system: system.name,
              table: table.name,
              field: field.name,
              confidence: score,
              fieldData: field
            };
          }
        }
      }
    }

    return bestMatch;
  }

  /**
   * Calculates match score between a data element and a catalog field
   */
  private calculateMatchScore(element: DataElement, field: DataField): number {
    let score = 0;
    
    // Name similarity (40% weight)
    const nameSimilarity = this.calculateStringSimilarity(
      element.name.toLowerCase(),
      field.name.toLowerCase()
    );
    score += nameSimilarity * 0.4;

    // Business term match (30% weight)
    if (field.businessTerm) {
      const termSimilarity = this.calculateStringSimilarity(
        element.name.toLowerCase(),
        field.businessTerm.toLowerCase()
      );
      score += termSimilarity * 0.3;
    }

    // Data type compatibility (20% weight)
    if (element.dataType === field.dataType) {
      score += 0.2;
    } else if (this.areTypesCompatible(element.dataType, field.dataType)) {
      score += 0.1;
    }

    // Description match (10% weight)
    if (field.description && element.regulatoryDefinition) {
      const descSimilarity = this.calculateStringSimilarity(
        element.regulatoryDefinition.toLowerCase(),
        field.description.toLowerCase()
      );
      score += descSimilarity * 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * Simple string similarity using Jaccard index on words
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2));
    
    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    // Also check for exact substring match
    if (str1.includes(str2) || str2.includes(str1)) {
      return Math.max(0.8, intersection.size / union.size);
    }

    return intersection.size / union.size;
  }

  /**
   * Checks if two data types are compatible
   */
  private areTypesCompatible(type1: DataType, type2: DataType): boolean {
    const numericTypes: DataType[] = ['number', 'decimal', 'integer'];
    const stringTypes: DataType[] = ['string'];
    
    if (numericTypes.includes(type1) && numericTypes.includes(type2)) return true;
    if (stringTypes.includes(type1) && stringTypes.includes(type2)) return true;
    
    return false;
  }

  /**
   * Generates transformation logic for a mapping
   */
  private generateTransformationLogic(
    element: DataElement,
    match: { system: string; table: string; field: string; fieldData: DataField }
  ): string | undefined {
    // If types match exactly, no transformation needed
    if (element.dataType === match.fieldData.dataType) {
      return undefined;
    }

    // Generate basic transformation logic
    if (element.calculationLogic) {
      return element.calculationLogic;
    }

    // Type conversion transformations
    if (element.dataType === 'string' && match.fieldData.dataType !== 'string') {
      return `CAST(${match.field} AS VARCHAR)`;
    }
    
    if (element.dataType === 'decimal' && match.fieldData.dataType === 'integer') {
      return `CAST(${match.field} AS DECIMAL(18,2))`;
    }

    return undefined;
  }

  /**
   * Compares two data elements and returns list of differences
   */
  private compareElements(existing: DataElement, incoming: DataElement): string[] {
    const differences: string[] = [];

    if (existing.name !== incoming.name) {
      differences.push(`name: '${existing.name}' -> '${incoming.name}'`);
    }
    if (existing.regulatoryDefinition !== incoming.regulatoryDefinition) {
      differences.push('regulatoryDefinition changed');
    }
    if (existing.dataType !== incoming.dataType) {
      differences.push(`dataType: '${existing.dataType}' -> '${incoming.dataType}'`);
    }
    if (existing.format !== incoming.format) {
      differences.push(`format: '${existing.format}' -> '${incoming.format}'`);
    }
    if (existing.mandatory !== incoming.mandatory) {
      differences.push(`mandatory: ${existing.mandatory} -> ${incoming.mandatory}`);
    }
    if (existing.calculationLogic !== incoming.calculationLogic) {
      differences.push('calculationLogic changed');
    }

    return differences;
  }

  /**
   * Merges current and incoming documents based on reconciliation result
   */
  private mergeDocuments(
    current: RequirementsDocument | undefined,
    incoming: RequirementsDocument,
    reconciliation: ReconciliationResult
  ): RequirementsDocument {
    const mergedElements: DataElement[] = [];
    const processedIds = new Set<string>();

    // Add all incoming elements (they take precedence)
    for (const element of incoming.elements) {
      mergedElements.push(element);
      processedIds.add(element.id);
    }

    // Add current elements that weren't in incoming (unless removed)
    if (current) {
      const removedIds = new Set(
        reconciliation.items
          .filter(i => i.status === 'removed')
          .map(i => i.itemId)
      );

      for (const element of current.elements) {
        if (!processedIds.has(element.id) && !removedIds.has(element.id)) {
          // Check if matched by name
          const matchedByName = incoming.elements.some(
            e => e.name.toLowerCase() === element.name.toLowerCase()
          );
          if (!matchedByName) {
            mergedElements.push(element);
          }
        }
      }
    }

    return {
      id: incoming.id,
      reportId: incoming.reportId,
      elements: mergedElements,
      mappings: incoming.mappings.length > 0 ? incoming.mappings : (current?.mappings || []),
      gaps: incoming.gaps.length > 0 ? incoming.gaps : (current?.gaps || []),
      version: (current?.version || 0) + 1,
      status: 'pending_review' as ArtifactStatus,
      createdAt: current?.createdAt || incoming.createdAt,
      updatedAt: new Date()
    };
  }

  // ============ Additional Public Methods ============

  /**
   * Submits a requirements document for review
   * Requirement 3.5: Present document for data steward review
   */
  async submitForReview(reportId: string, submitter: string): Promise<RequirementsDocument> {
    const doc = this.repository.getRequirementsDocument(reportId);
    if (!doc) {
      throw new Error(`No requirements document exists for report ${reportId}`);
    }

    if (doc.status !== 'draft') {
      throw new Error(`Cannot submit document with status '${doc.status}' for review`);
    }

    const updatedDoc: RequirementsDocument = {
      ...doc,
      status: 'pending_review' as ArtifactStatus,
      updatedAt: new Date()
    };

    this.repository.setRequirementsDocument(reportId, updatedDoc);

    this.repository.createAuditEntry({
      actor: submitter,
      actorType: 'human',
      action: 'submit_for_review',
      entityType: 'RequirementsDocument',
      entityId: doc.id,
      previousState: doc,
      newState: updatedDoc,
      rationale: 'Submitted requirements document for data steward review'
    });

    return updatedDoc;
  }

  /**
   * Approves a requirements document after review
   * Requirement 3.5: Validate before finalizing
   */
  async approveDocument(
    reportId: string,
    approver: string
  ): Promise<RequirementsDocument> {
    const doc = this.repository.getRequirementsDocument(reportId);
    if (!doc) {
      throw new Error(`No requirements document exists for report ${reportId}`);
    }

    if (doc.status !== 'pending_review') {
      throw new Error(`Cannot approve document with status '${doc.status}'`);
    }

    const updatedDoc: RequirementsDocument = {
      ...doc,
      status: 'approved' as ArtifactStatus,
      validatedBy: approver,
      validatedAt: new Date(),
      updatedAt: new Date()
    };

    this.repository.setRequirementsDocument(reportId, updatedDoc);

    this.repository.createAuditEntry({
      actor: approver,
      actorType: 'human',
      action: 'approve_document',
      entityType: 'RequirementsDocument',
      entityId: doc.id,
      previousState: doc,
      newState: updatedDoc,
      rationale: 'Approved requirements document after review'
    });

    return updatedDoc;
  }

  /**
   * Identifies data gaps for elements that have no mapping
   * Enhanced version that takes elements into account
   */
  async identifyDataGapsForElements(
    elements: DataElement[],
    mappings: DataMapping[]
  ): Promise<DataGap[]> {
    const mappedElementIds = new Set(mappings.map(m => m.elementId));
    const gaps: DataGap[] = [];

    // Find elements with no mapping at all
    for (const element of elements) {
      if (!mappedElementIds.has(element.id)) {
        gaps.push({
          elementId: element.id,
          elementName: element.name,
          reason: element.calculationLogic ? 'calculation_needed' : 'no_source',
          suggestedResolution: element.calculationLogic 
            ? `Implement calculation: ${element.calculationLogic}`
            : `Find source for ${element.name} (${element.dataType})`
        });
      }
    }

    // Find elements with low confidence mappings
    for (const mapping of mappings) {
      if (mapping.confidence < this.config.minMappingConfidence) {
        const element = elements.find(e => e.id === mapping.elementId);
        gaps.push({
          elementId: mapping.elementId,
          elementName: element?.name || `Element ${mapping.elementId}`,
          reason: 'partial_source' as DataGapReason,
          suggestedResolution: `Review mapping to ${mapping.sourceSystem}.${mapping.sourceTable}.${mapping.sourceField} (confidence: ${(mapping.confidence * 100).toFixed(1)}%)`
        });
      }
    }

    // Log the gap identification
    this.repository.createAuditEntry({
      actor: 'DataRequirementsAgent',
      actorType: 'agent',
      action: 'identify_data_gaps_for_elements',
      entityType: 'DataGap',
      entityId: 'batch',
      newState: {
        totalElements: elements.length,
        totalMappings: mappings.length,
        gapsIdentified: gaps.length
      }
    });

    return gaps;
  }
}
