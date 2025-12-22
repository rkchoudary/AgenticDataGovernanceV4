/**
 * DocumentationPhase Component
 * 
 * Phase 8 of the workflow wizard - guides users through reviewing
 * generated documentation and compiling the compliance package.
 * 
 * Steps:
 * 1. Artifact Review - Review generated documents with annotation tools
 * 2. Annotation Resolution - Resolve all flagged items before progression
 * 3. BCBS 239 Mapping - Display compliance matrix with evidence links
 * 4. Package Compilation - Generate consolidated PDF with TOC
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { useState, useCallback, useMemo } from 'react'
import { useWorkflowWizardStore } from '@/stores/workflowWizardStore'
import { PhaseState } from '@/types/workflow-wizard'
import { ArtifactReviewStep } from './ArtifactReviewStep'
import { AnnotationResolutionStep } from './AnnotationResolutionStep'
import { BCBS239MappingStep } from './BCBS239MappingStep'
import { PackageCompilationStep } from './PackageCompilationStep'
import {
  DocumentArtifact,
  Annotation,
  AnnotationStatus,
  ArtifactStatus,
  BCBS239ComplianceEntry,
  CompiledPackage,
  DocumentationSummary,
  DOCUMENTATION_STEPS,
  BCBS239_PRINCIPLE_CONFIG,
  BCBS239Principle,
  calculateDocumentationSummary,
  hasUnresolvedFlaggedAnnotations,
} from './types'

// ============================================================================
// Mock Data (will be replaced with API calls)
// ============================================================================

const MOCK_ARTIFACTS: DocumentArtifact[] = [
  {
    id: 'art-001',
    name: 'Data Dictionary - Q4 2024',
    type: 'data_dictionary',
    description: 'Comprehensive data dictionary for all CDEs used in regulatory reporting',
    version: '1.2',
    status: 'review',
    fileType: 'pdf',
    fileSize: 2500000,
    pageCount: 45,
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'system',
    lastModifiedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastModifiedBy: 'user-001',
    annotations: [
      {
        id: 'ann-001',
        artifactId: 'art-001',
        type: 'comment',
        status: 'open',
        priority: 'medium',
        content: 'Please verify the definition of LTV ratio matches the regulatory guidance',
        pageNumber: 12,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: 'user-002',
        createdByName: 'Jane Doe',
        replies: [],
      },
      {
        id: 'ann-002',
        artifactId: 'art-001',
        type: 'flag',
        status: 'open',
        priority: 'high',
        content: 'Missing data source reference for Credit Score field',
        pageNumber: 18,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: 'user-003',
        createdByName: 'Bob Johnson',
        replies: [],
      },
    ],
    linkedCDEs: ['cde-001', 'cde-002', 'cde-003'],
    isAIGenerated: true,
    aiConfidence: 0.92,
  },
  {
    id: 'art-002',
    name: 'Data Lineage Documentation',
    type: 'lineage_diagram',
    description: 'End-to-end data lineage from source systems to regulatory reports',
    version: '1.0',
    status: 'approved',
    fileType: 'pdf',
    fileSize: 1800000,
    pageCount: 28,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'system',
    lastModifiedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    lastModifiedBy: 'user-001',
    annotations: [],
    linkedCDEs: ['cde-001', 'cde-002'],
    isAIGenerated: true,
    aiConfidence: 0.88,
  },
  {
    id: 'art-003',
    name: 'Data Quality Assessment Report',
    type: 'quality_report',
    description: 'Summary of data quality rule execution results and trends',
    version: '1.1',
    status: 'review',
    fileType: 'pdf',
    fileSize: 3200000,
    pageCount: 52,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'system',
    lastModifiedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastModifiedBy: 'user-002',
    annotations: [
      {
        id: 'ann-003',
        artifactId: 'art-003',
        type: 'highlight',
        status: 'resolved',
        priority: 'low',
        content: 'Good improvement in completeness scores',
        pageNumber: 8,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: 'user-001',
        createdByName: 'John Smith',
        resolvedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        resolvedBy: 'user-001',
        resolution: 'Acknowledged',
        replies: [],
      },
    ],
    linkedCDEs: ['cde-001', 'cde-002', 'cde-003'],
    isAIGenerated: true,
    aiConfidence: 0.95,
  },
  {
    id: 'art-004',
    name: 'Control Effectiveness Evidence',
    type: 'control_evidence',
    description: 'Documentation of control testing results and effectiveness ratings',
    version: '1.0',
    status: 'draft',
    fileType: 'pdf',
    fileSize: 1500000,
    pageCount: 22,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'user-002',
    lastModifiedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastModifiedBy: 'user-002',
    annotations: [],
    linkedControls: ['ctrl-001', 'ctrl-002', 'ctrl-003'],
    isAIGenerated: false,
  },
  {
    id: 'art-005',
    name: 'Issue Resolution Summary',
    type: 'issue_summary',
    description: 'Summary of all identified issues and their resolution status',
    version: '1.0',
    status: 'review',
    fileType: 'pdf',
    fileSize: 980000,
    pageCount: 15,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'system',
    lastModifiedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    lastModifiedBy: 'user-003',
    annotations: [
      {
        id: 'ann-004',
        artifactId: 'art-005',
        type: 'flag',
        status: 'open',
        priority: 'critical',
        content: 'Issue ISS-003 resolution evidence is incomplete',
        pageNumber: 7,
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        createdBy: 'user-001',
        createdByName: 'John Smith',
        replies: [],
      },
    ],
    isAIGenerated: true,
    aiConfidence: 0.90,
  },
]

const createDefaultBCBS239Entries = (): BCBS239ComplianceEntry[] => {
  const principles = Object.keys(BCBS239_PRINCIPLE_CONFIG) as BCBS239Principle[]
  return principles.map(principle => {
    const config = BCBS239_PRINCIPLE_CONFIG[principle]
    return {
      principle,
      principleNumber: config.number,
      principleName: config.name,
      description: config.description,
      status: 'not_assessed' as const,
      evidenceLinks: [],
      gaps: [],
    }
  })
}

// Pre-populate some entries with data
const MOCK_BCBS239_ENTRIES: BCBS239ComplianceEntry[] = [
  {
    principle: 'governance',
    principleNumber: 1,
    principleName: 'Governance',
    description: BCBS239_PRINCIPLE_CONFIG.governance.description,
    status: 'compliant',
    evidenceLinks: [
      {
        id: 'ev-001',
        artifactId: 'art-001',
        artifactName: 'Data Dictionary - Q4 2024',
        section: 'Governance Framework',
        pageNumber: 5,
        description: 'Data governance roles and responsibilities',
      },
    ],
    gaps: [],
    assessedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    assessedBy: 'user-001',
  },
  {
    principle: 'data_architecture',
    principleNumber: 2,
    principleName: 'Data Architecture and IT Infrastructure',
    description: BCBS239_PRINCIPLE_CONFIG.data_architecture.description,
    status: 'compliant',
    evidenceLinks: [
      {
        id: 'ev-002',
        artifactId: 'art-002',
        artifactName: 'Data Lineage Documentation',
        section: 'Architecture Overview',
        pageNumber: 3,
        description: 'System architecture and data flows',
      },
    ],
    gaps: [],
    assessedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    assessedBy: 'user-001',
  },
  {
    principle: 'accuracy_integrity',
    principleNumber: 3,
    principleName: 'Accuracy and Integrity',
    description: BCBS239_PRINCIPLE_CONFIG.accuracy_integrity.description,
    status: 'partial',
    evidenceLinks: [
      {
        id: 'ev-003',
        artifactId: 'art-003',
        artifactName: 'Data Quality Assessment Report',
        section: 'Accuracy Metrics',
        pageNumber: 12,
        description: 'Data accuracy measurement results',
      },
    ],
    gaps: ['Some CDEs have accuracy scores below 95% threshold'],
    remediationPlan: 'Implement additional validation rules for affected CDEs',
    assessedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    assessedBy: 'user-002',
  },
  ...createDefaultBCBS239Entries().slice(3),
]

// ============================================================================
// Component Props
// ============================================================================

interface DocumentationPhaseProps {
  phase: PhaseState
}

// ============================================================================
// Main Component
// ============================================================================

export function DocumentationPhase({ phase }: DocumentationPhaseProps) {
  const { currentStep, completeStep, updateStepData } = useWorkflowWizardStore()
  
  // Local state for phase data
  const [artifacts, setArtifacts] = useState<DocumentArtifact[]>(MOCK_ARTIFACTS)
  const [bcbs239Entries, setBcbs239Entries] = useState<BCBS239ComplianceEntry[]>(MOCK_BCBS239_ENTRIES)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const [compiledPackage, setCompiledPackage] = useState<CompiledPackage | null>(null)

  // Get current step info
  const currentStepData = phase.steps[currentStep]
  const currentStepId = currentStepData?.id

  // Calculate summary
  const summary = useMemo<DocumentationSummary>(() => {
    return calculateDocumentationSummary(
      artifacts,
      bcbs239Entries,
      compiledPackage?.status === 'completed' ? 'completed' : 
        compiledPackage ? 'in_progress' : 'not_started'
    )
  }, [artifacts, bcbs239Entries, compiledPackage])

  // Check for blocking conditions
  const hasBlockingAnnotations = useMemo(() => {
    return hasUnresolvedFlaggedAnnotations(artifacts)
  }, [artifacts])

  // Handle artifact status update
  const handleArtifactStatusUpdate = useCallback((
    artifactId: string,
    status: ArtifactStatus
  ) => {
    setArtifacts(prev => prev.map(artifact => {
      if (artifact.id !== artifactId) return artifact
      return {
        ...artifact,
        status,
        lastModifiedAt: new Date().toISOString(),
        lastModifiedBy: 'current-user',
      }
    }))
  }, [])

  // Handle annotation creation
  const handleAnnotationCreate = useCallback((
    artifactId: string,
    annotation: Omit<Annotation, 'id' | 'artifactId' | 'createdAt' | 'createdBy' | 'replies'>
  ) => {
    const newAnnotation: Annotation = {
      ...annotation,
      id: `ann-${Date.now()}`,
      artifactId,
      createdAt: new Date().toISOString(),
      createdBy: 'current-user',
      createdByName: 'Current User',
      replies: [],
    }

    setArtifacts(prev => prev.map(artifact => {
      if (artifact.id !== artifactId) return artifact
      return {
        ...artifact,
        annotations: [...artifact.annotations, newAnnotation],
      }
    }))
  }, [])

  // Handle annotation status update
  const handleAnnotationStatusUpdate = useCallback((
    artifactId: string,
    annotationId: string,
    status: AnnotationStatus,
    resolution?: string
  ) => {
    setArtifacts(prev => prev.map(artifact => {
      if (artifact.id !== artifactId) return artifact
      return {
        ...artifact,
        annotations: artifact.annotations.map(ann => {
          if (ann.id !== annotationId) return ann
          return {
            ...ann,
            status,
            resolution,
            resolvedAt: status === 'resolved' ? new Date().toISOString() : undefined,
            resolvedBy: status === 'resolved' ? 'current-user' : undefined,
            resolvedByName: status === 'resolved' ? 'Current User' : undefined,
          }
        }),
      }
    }))
  }, [])

  // Handle BCBS 239 entry update
  const handleBCBS239Update = useCallback((
    principle: BCBS239Principle,
    updates: Partial<BCBS239ComplianceEntry>
  ) => {
    setBcbs239Entries(prev => prev.map(entry => {
      if (entry.principle !== principle) return entry
      return {
        ...entry,
        ...updates,
        assessedAt: new Date().toISOString(),
        assessedBy: 'current-user',
      }
    }))
  }, [])

  // Handle package compilation
  const handleCompilePackage = useCallback(async () => {
    const newPackage: CompiledPackage = {
      id: `pkg-${Date.now()}`,
      name: 'Regulatory Compliance Package - Q4 2024',
      version: '1.0',
      status: 'compiling',
      artifacts: artifacts.map(a => a.id),
      tableOfContents: [
        { id: 'toc-1', title: 'Executive Summary', pageNumber: 1, level: 1 },
        { id: 'toc-2', title: 'Data Dictionary', pageNumber: 5, level: 1, artifactId: 'art-001' },
        { id: 'toc-3', title: 'Data Lineage', pageNumber: 50, level: 1, artifactId: 'art-002' },
        { id: 'toc-4', title: 'Data Quality Report', pageNumber: 78, level: 1, artifactId: 'art-003' },
        { id: 'toc-5', title: 'Control Evidence', pageNumber: 130, level: 1, artifactId: 'art-004' },
        { id: 'toc-6', title: 'Issue Summary', pageNumber: 152, level: 1, artifactId: 'art-005' },
        { id: 'toc-7', title: 'BCBS 239 Compliance Matrix', pageNumber: 167, level: 1 },
        { id: 'toc-8', title: 'Attestation', pageNumber: 180, level: 1 },
      ],
      totalPages: 185,
    }

    setCompiledPackage(newPackage)

    // Simulate compilation process
    await new Promise(resolve => setTimeout(resolve, 2000))

    setCompiledPackage(prev => prev ? {
      ...prev,
      status: 'completed',
      fileUrl: '/packages/compliance-package-q4-2024.pdf',
      fileSize: 15000000,
      compiledAt: new Date().toISOString(),
      compiledBy: 'current-user',
    } : null)
  }, [artifacts])

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
      case DOCUMENTATION_STEPS.ARTIFACT_REVIEW:
        return (
          <ArtifactReviewStep
            artifacts={artifacts}
            summary={summary}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={setSelectedArtifactId}
            onStatusUpdate={handleArtifactStatusUpdate}
            onAnnotationCreate={handleAnnotationCreate}
            onComplete={() => handleStepComplete(DOCUMENTATION_STEPS.ARTIFACT_REVIEW, {
              reviewedArtifacts: artifacts.length,
              approvedArtifacts: summary.approvedArtifacts,
            })}
          />
        )
      
      case DOCUMENTATION_STEPS.ANNOTATION_RESOLUTION:
        return (
          <AnnotationResolutionStep
            artifacts={artifacts}
            summary={summary}
            selectedArtifactId={selectedArtifactId}
            onSelectArtifact={setSelectedArtifactId}
            onAnnotationStatusUpdate={handleAnnotationStatusUpdate}
            hasBlockingAnnotations={hasBlockingAnnotations}
            onComplete={() => handleStepComplete(DOCUMENTATION_STEPS.ANNOTATION_RESOLUTION, {
              resolvedAnnotations: summary.resolvedAnnotations,
              totalAnnotations: summary.totalAnnotations,
            })}
          />
        )
      
      case DOCUMENTATION_STEPS.BCBS_MAPPING:
        return (
          <BCBS239MappingStep
            entries={bcbs239Entries}
            artifacts={artifacts}
            summary={summary}
            onEntryUpdate={handleBCBS239Update}
            onComplete={() => handleStepComplete(DOCUMENTATION_STEPS.BCBS_MAPPING, {
              compliantPrinciples: summary.bcbs239Compliance.compliant,
              totalPrinciples: bcbs239Entries.length,
            })}
          />
        )
      
      case DOCUMENTATION_STEPS.PACKAGE_COMPILATION:
        return (
          <PackageCompilationStep
            artifacts={artifacts}
            bcbs239Entries={bcbs239Entries}
            compiledPackage={compiledPackage}
            summary={summary}
            onCompile={handleCompilePackage}
            onComplete={() => handleStepComplete(DOCUMENTATION_STEPS.PACKAGE_COMPILATION, {
              packageId: compiledPackage?.id,
              totalPages: compiledPackage?.totalPages,
            })}
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

export default DocumentationPhase
