/**
 * DataRequirementsPhase Component
 * 
 * Phase 2 of the workflow wizard - guides users through validating
 * data element mappings and resolving gaps.
 * 
 * Steps:
 * 1. Template Parsing Review - View parsed data elements
 * 2. Source Mapping Validation - Validate mappings with sample data
 * 3. Gap Analysis - Resolve data gaps
 * 4. Document Approval - Approve requirements document
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { TemplateParsingStep } from './TemplateParsingStep'
import { SourceMappingStep } from './SourceMappingStep'
import { GapAnalysisStep } from './GapAnalysisStep'
import { DocumentApprovalStep } from './DocumentApprovalStep'
import {
  DataRequirementElement,
  SourceMapping,
  DataGap,
  TemplateParsingResult,
  DataRequirementsSummary,
  GapResolution,
  DATA_REQUIREMENTS_STEPS,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_ELEMENTS: DataRequirementElement[] = [
  {
    id: 'section-1',
    name: 'Schedule A.1 - Domestic First Lien',
    regulatoryDefinition: 'Domestic first lien closed-end 1-4 family residential loans',
    dataType: 'section',
    format: '',
    mandatory: true,
    status: 'pending',
    level: 0,
    sectionName: 'Schedule A.1',
    children: [
      {
        id: 'elem-001',
        name: 'Loan ID',
        regulatoryDefinition: 'Unique identifier for the loan',
        dataType: 'string',
        format: 'alphanumeric(20)',
        mandatory: true,
        status: 'validated',
        parentId: 'section-1',
        level: 1,
      },
      {
        id: 'elem-002',
        name: 'Original LTV Ratio',
        regulatoryDefinition: 'Loan-to-value ratio at origination',
        dataType: 'decimal',
        format: 'decimal(5,2)',
        mandatory: true,
        status: 'mapped',
        parentId: 'section-1',
        level: 1,
      },
      {
        id: 'elem-003',
        name: 'Combined LTV Ratio',
        regulatoryDefinition: 'Combined loan-to-value ratio including all liens',
        dataType: 'decimal',
        format: 'decimal(5,2)',
        mandatory: true,
        status: 'gap',
        parentId: 'section-1',
        level: 1,
      },
      {
        id: 'elem-004',
        name: 'Borrower Credit Score',
        regulatoryDefinition: 'Credit score of primary borrower at origination',
        dataType: 'integer',
        format: 'integer(3)',
        mandatory: true,
        status: 'validated',
        parentId: 'section-1',
        level: 1,
      },
    ],
  },
  {
    id: 'section-2',
    name: 'Schedule A.2 - Home Equity',
    regulatoryDefinition: 'Home equity lines of credit and closed-end home equity loans',
    dataType: 'section',
    format: '',
    mandatory: true,
    status: 'pending',
    level: 0,
    sectionName: 'Schedule A.2',
    children: [
      {
        id: 'elem-005',
        name: 'Account Number',
        regulatoryDefinition: 'Unique account identifier',
        dataType: 'string',
        format: 'alphanumeric(20)',
        mandatory: true,
        status: 'mapped',
        parentId: 'section-2',
        level: 1,
      },
      {
        id: 'elem-006',
        name: 'Credit Limit',
        regulatoryDefinition: 'Maximum credit limit for the account',
        dataType: 'decimal',
        format: 'decimal(15,2)',
        mandatory: true,
        status: 'gap',
        parentId: 'section-2',
        level: 1,
      },
      {
        id: 'elem-007',
        name: 'Current Balance',
        regulatoryDefinition: 'Current outstanding balance',
        dataType: 'decimal',
        format: 'decimal(15,2)',
        mandatory: true,
        status: 'validated',
        parentId: 'section-2',
        level: 1,
      },
    ],
  },
  {
    id: 'section-3',
    name: 'Schedule B - Commercial Real Estate',
    regulatoryDefinition: 'Commercial real estate loans',
    dataType: 'section',
    format: '',
    mandatory: true,
    status: 'pending',
    level: 0,
    sectionName: 'Schedule B',
    children: [
      {
        id: 'elem-008',
        name: 'Property Type',
        regulatoryDefinition: 'Type of commercial property',
        dataType: 'string',
        format: 'code(2)',
        mandatory: true,
        status: 'validated',
        parentId: 'section-3',
        level: 1,
      },
      {
        id: 'elem-009',
        name: 'Net Operating Income',
        regulatoryDefinition: 'Annual net operating income of the property',
        dataType: 'decimal',
        format: 'decimal(15,2)',
        mandatory: false,
        status: 'pending',
        parentId: 'section-3',
        level: 1,
      },
    ],
  },
]

const MOCK_MAPPINGS: SourceMapping[] = [
  {
    elementId: 'elem-001',
    sourceSystem: 'LOS',
    sourceTable: 'loans',
    sourceField: 'loan_id',
    confidence: 0.98,
    validatedBy: 'john.doe@example.com',
    validatedAt: new Date().toISOString(),
    sampleData: ['LN-2024-001234', 'LN-2024-001235', 'LN-2024-001236'],
  },
  {
    elementId: 'elem-002',
    sourceSystem: 'LOS',
    sourceTable: 'loan_details',
    sourceField: 'original_ltv',
    confidence: 0.95,
    sampleData: ['75.50', '80.00', '65.25'],
  },
  {
    elementId: 'elem-004',
    sourceSystem: 'Credit Bureau',
    sourceTable: 'borrower_scores',
    sourceField: 'fico_score',
    confidence: 0.92,
    validatedBy: 'jane.smith@example.com',
    validatedAt: new Date().toISOString(),
    sampleData: ['720', '680', '750'],
  },
  {
    elementId: 'elem-005',
    sourceSystem: 'Core Banking',
    sourceTable: 'accounts',
    sourceField: 'account_number',
    confidence: 0.99,
    sampleData: ['HE-2024-000123', 'HE-2024-000124', 'HE-2024-000125'],
  },
  {
    elementId: 'elem-007',
    sourceSystem: 'Core Banking',
    sourceTable: 'account_balances',
    sourceField: 'current_balance',
    confidence: 0.97,
    validatedBy: 'john.doe@example.com',
    validatedAt: new Date().toISOString(),
    sampleData: ['125000.00', '89500.50', '200000.00'],
  },
  {
    elementId: 'elem-008',
    sourceSystem: 'CRE System',
    sourceTable: 'properties',
    sourceField: 'property_type_code',
    confidence: 0.94,
    validatedBy: 'jane.smith@example.com',
    validatedAt: new Date().toISOString(),
    sampleData: ['OF', 'RT', 'IN'],
  },
]

const MOCK_GAPS: DataGap[] = [
  {
    id: 'gap-001',
    elementId: 'elem-003',
    elementName: 'Combined LTV Ratio',
    reason: 'transformation_needed',
    suggestedResolution: 'Calculate CLTV by combining first lien LTV with subordinate lien amounts',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'gap-002',
    elementId: 'elem-006',
    elementName: 'Credit Limit',
    reason: 'multiple_sources',
    suggestedResolution: 'Multiple credit limit fields found in Core Banking system - manual selection required',
    createdAt: new Date().toISOString(),
  },
]

const MOCK_PARSING_RESULT: TemplateParsingResult = {
  templateId: 'template-001',
  templateName: 'FR Y-14A Regulatory Template',
  parsedAt: new Date().toISOString(),
  totalElements: 9,
  sectionsCount: 3,
  elements: MOCK_ELEMENTS,
  parsingConfidence: 0.96,
  aiNotes: 'Template parsed successfully. 3 sections identified with 9 data elements. 2 elements require gap resolution.',
}

// ============================================================================
// Component Props
// ============================================================================

interface DataRequirementsPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function DataRequirementsPhase({ phase }: DataRequirementsPhaseProps) {
  const { currentStep, completeStep, updateStepData, completePhase, navigateToNextPhase } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [elements, setElements] = useState<DataRequirementElement[]>(MOCK_ELEMENTS)
  const [mappings, setMappings] = useState<SourceMapping[]>(MOCK_MAPPINGS)
  const [gaps, setGaps] = useState<DataGap[]>(MOCK_GAPS)
  const [parsingResult] = useState<TemplateParsingResult>(MOCK_PARSING_RESULT)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<DataRequirementsSummary>(() => {
    // Flatten elements to count all leaf nodes
    const flatElements: DataRequirementElement[] = []
    const flatten = (items: DataRequirementElement[]) => {
      items.forEach(item => {
        if (item.children && item.children.length > 0) {
          flatten(item.children)
        } else {
          flatElements.push(item)
        }
      })
    }
    flatten(elements)
    
    const mapped = flatElements.filter(e => e.status === 'mapped').length
    const validated = flatElements.filter(e => e.status === 'validated').length
    const gap = flatElements.filter(e => e.status === 'gap').length
    const pending = flatElements.filter(e => e.status === 'pending').length
    const total = flatElements.length
    
    const completionPercentage = total > 0 
      ? Math.round(((mapped + validated) / total) * 100)
      : 0
    
    return {
      totalElements: total,
      mappedElements: mapped,
      validatedElements: validated,
      gapElements: gap,
      pendingElements: pending,
      completionPercentage,
      lastUpdated: new Date().toISOString(),
    }
  }, [elements])

  // Handle element status update
  const handleElementStatusUpdate = useCallback((
    elementId: string,
    status: DataRequirementElement['status']
  ) => {
    const updateElementStatus = (items: DataRequirementElement[]): DataRequirementElement[] => {
      return items.map(item => {
        if (item.id === elementId) {
          return { ...item, status }
        }
        if (item.children) {
          return { ...item, children: updateElementStatus(item.children) }
        }
        return item
      })
    }
    setElements(prev => updateElementStatus(prev))
  }, [])

  // Handle mapping validation
  const handleMappingValidation = useCallback((
    elementId: string,
    isValid: boolean
  ) => {
    if (isValid) {
      handleElementStatusUpdate(elementId, 'validated')
      setMappings(prev => prev.map(m => {
        if (m.elementId !== elementId) return m
        return {
          ...m,
          validatedBy: 'current-user',
          validatedAt: new Date().toISOString(),
        }
      }))
    }
  }, [handleElementStatusUpdate])

  // Handle gap resolution
  const handleGapResolution = useCallback((
    gapId: string,
    resolution: GapResolution
  ) => {
    setGaps(prev => prev.map(gap => {
      if (gap.id !== gapId) return gap
      return {
        ...gap,
        resolution,
        resolvedAt: new Date().toISOString(),
        resolvedBy: 'current-user',
      }
    }))
    
    // Update element status based on resolution
    const gap = gaps.find(g => g.id === gapId)
    if (gap) {
      if (resolution.action === 'manual_map' && resolution.manualMapping) {
        handleElementStatusUpdate(gap.elementId, 'mapped')
        setMappings(prev => [...prev, resolution.manualMapping!])
      } else if (resolution.action === 'flag_for_later') {
        // Keep as gap but mark as addressed
        handleElementStatusUpdate(gap.elementId, 'pending')
      }
    }
  }, [gaps, handleElementStatusUpdate])

  // Handle step completion
  const handleStepComplete = useCallback((stepId: string, data?: Record<string, unknown>) => {
    if (data) {
      updateStepData(stepId, data)
    }
    completeStep(stepId)
  }, [completeStep, updateStepData])

  // Render current step content
  const renderStepContent = () => {
    switch (currentStepId) {
      case DATA_REQUIREMENTS_STEPS.TEMPLATE_PARSING:
        return (
          <TemplateParsingStep
            parsingResult={parsingResult}
            elements={elements}
            onComplete={() => handleStepComplete(DATA_REQUIREMENTS_STEPS.TEMPLATE_PARSING, {
              templateId: parsingResult.templateId,
              elementsCount: parsingResult.totalElements,
            })}
          />
        )
      
      case DATA_REQUIREMENTS_STEPS.SOURCE_MAPPING:
        return (
          <SourceMappingStep
            elements={elements}
            mappings={mappings}
            onValidateMapping={handleMappingValidation}
            onUpdateElementStatus={handleElementStatusUpdate}
            summary={summary}
            onComplete={() => handleStepComplete(DATA_REQUIREMENTS_STEPS.SOURCE_MAPPING, {
              validatedMappings: mappings.filter(m => m.validatedBy).length,
              totalMappings: mappings.length,
            })}
          />
        )
      
      case DATA_REQUIREMENTS_STEPS.GAP_ANALYSIS:
        return (
          <GapAnalysisStep
            gaps={gaps}
            elements={elements}
            onResolveGap={handleGapResolution}
            summary={summary}
            onComplete={() => handleStepComplete(DATA_REQUIREMENTS_STEPS.GAP_ANALYSIS, {
              resolvedGaps: gaps.filter(g => g.resolution).length,
              totalGaps: gaps.length,
            })}
          />
        )
      
      case DATA_REQUIREMENTS_STEPS.DOCUMENT_APPROVAL:
        return (
          <DocumentApprovalStep
            elements={elements}
            mappings={mappings}
            gaps={gaps}
            onComplete={() => {
              handleStepComplete(DATA_REQUIREMENTS_STEPS.DOCUMENT_APPROVAL, {
                summary,
                approvedAt: new Date().toISOString(),
              })
              // Complete the phase and navigate to next phase
              completePhase(phase.id)
              navigateToNextPhase()
            }}
            onUpdateElementStatus={handleElementStatusUpdate}
            onAddMapping={(newMapping) => setMappings(prev => [
              ...prev.filter(m => m.elementId !== newMapping.elementId),
              newMapping
            ])}
          />
        )
      
      default:
        return (
          <div className="text-center text-muted-foreground py-8">
            Unknown step: {currentStepId}
          </div>
        )
    }
  }

  return (
    <div className="space-y-6">
      {renderStepContent()}
    </div>
  )
}

export default DataRequirementsPhase
