/**
 * Types for Data Requirements Phase
 * 
 * Defines data structures for template parsing, source mapping,
 * gap analysis, and document approval workflow.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

/**
 * Data element status in the mapping workflow
 */
export type DataElementStatus = 'mapped' | 'gap' | 'validated' | 'pending'

/**
 * Gap resolution action types
 */
export type GapResolutionAction = 'manual_map' | 'flag_for_later' | 'create_request'

/**
 * Data element from regulatory template with mapping status
 */
export interface DataRequirementElement {
  id: string
  name: string
  regulatoryDefinition: string
  dataType: string
  format: string
  calculationLogic?: string
  unit?: string
  mandatory: boolean
  status: DataElementStatus
  parentId?: string
  children?: DataRequirementElement[]
  level: number
  sectionName?: string
}

/**
 * Source mapping for a data element
 */
export interface SourceMapping {
  elementId: string
  sourceSystem: string
  sourceTable: string
  sourceField: string
  transformationLogic?: string
  confidence: number
  validatedBy?: string
  validatedAt?: string
  sampleData?: string[]
}

/**
 * Data gap requiring resolution
 */
export interface DataGap {
  id: string
  elementId: string
  elementName: string
  reason: 'no_source' | 'multiple_sources' | 'transformation_needed' | 'data_quality_issue'
  suggestedResolution?: string
  resolution?: GapResolution
  createdAt: string
  resolvedAt?: string
  resolvedBy?: string
}

/**
 * Resolution for a data gap
 */
export interface GapResolution {
  action: GapResolutionAction
  details: string
  manualMapping?: SourceMapping
  flagReason?: string
  requestId?: string
}

/**
 * Template parsing results
 */
export interface TemplateParsingResult {
  templateId: string
  templateName: string
  parsedAt: string
  totalElements: number
  sectionsCount: number
  elements: DataRequirementElement[]
  parsingConfidence: number
  aiNotes?: string
}

/**
 * Mapping validation result
 */
export interface MappingValidationResult {
  elementId: string
  isValid: boolean
  sampleData: string[]
  dataTypeMatch: boolean
  formatMatch: boolean
  nullPercentage: number
  validationNotes?: string
}

/**
 * Data requirements summary
 */
export interface DataRequirementsSummary {
  totalElements: number
  mappedElements: number
  validatedElements: number
  gapElements: number
  pendingElements: number
  completionPercentage: number
  lastUpdated: string
}

/**
 * Step IDs for Data Requirements phase
 */
export const DATA_REQUIREMENTS_STEPS = {
  TEMPLATE_PARSING: 'template_parsing',
  SOURCE_MAPPING: 'source_mapping',
  GAP_ANALYSIS: 'gap_analysis',
  DOCUMENT_APPROVAL: 'document_approval',
} as const

export type DataRequirementsStepId = typeof DATA_REQUIREMENTS_STEPS[keyof typeof DATA_REQUIREMENTS_STEPS]

/**
 * Status display configuration
 */
export const ELEMENT_STATUS_CONFIG: Record<DataElementStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  mapped: {
    label: 'Mapped',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'Link',
  },
  validated: {
    label: 'Validated',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  gap: {
    label: 'Gap',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'AlertCircle',
  },
  pending: {
    label: 'Pending',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'Clock',
  },
}

/**
 * Gap reason display configuration
 */
export const GAP_REASON_CONFIG: Record<DataGap['reason'], {
  label: string
  description: string
}> = {
  no_source: {
    label: 'No Source Found',
    description: 'No matching source field could be identified in the data catalog',
  },
  multiple_sources: {
    label: 'Multiple Sources',
    description: 'Multiple potential source fields were found, requiring manual selection',
  },
  transformation_needed: {
    label: 'Transformation Needed',
    description: 'Source data requires complex transformation logic',
  },
  data_quality_issue: {
    label: 'Data Quality Issue',
    description: 'Source data has quality issues that need to be addressed',
  },
}

/**
 * Gap resolution action configuration
 */
export const GAP_RESOLUTION_CONFIG: Record<GapResolutionAction, {
  label: string
  description: string
  icon: string
}> = {
  manual_map: {
    label: 'Manual Map',
    description: 'Manually specify the source field mapping',
    icon: 'Link',
  },
  flag_for_later: {
    label: 'Flag for Later',
    description: 'Mark this gap for future resolution',
    icon: 'Flag',
  },
  create_request: {
    label: 'Create Request',
    description: 'Create a data request for the source team',
    icon: 'FileText',
  },
}
