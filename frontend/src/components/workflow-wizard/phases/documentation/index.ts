/**
 * Documentation Phase Components
 * 
 * Exports all components and types for Phase 8: Documentation
 * of the workflow wizard.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

// Main phase component
export { DocumentationPhase } from './DocumentationPhase'
export { default as DocumentationPhaseDefault } from './DocumentationPhase'

// Step components
export { ArtifactReviewStep } from './ArtifactReviewStep'
export { AnnotationResolutionStep } from './AnnotationResolutionStep'
export { BCBS239MappingStep } from './BCBS239MappingStep'
export { PackageCompilationStep } from './PackageCompilationStep'

// Types
export type {
  ArtifactType,
  ArtifactStatus,
  AnnotationType,
  AnnotationStatus,
  AnnotationPriority,
  BCBS239Principle,
  ComplianceStatus,
  DocumentArtifact,
  Annotation,
  AnnotationReply,
  BCBS239ComplianceEntry,
  EvidenceLink,
  CompiledPackage,
  TOCEntry,
  DocumentationSummary,
  DocumentationStepId,
} from './types'

// Constants and utilities
export {
  DOCUMENTATION_STEPS,
  ARTIFACT_TYPE_CONFIG,
  ARTIFACT_STATUS_CONFIG,
  ANNOTATION_TYPE_CONFIG,
  ANNOTATION_STATUS_CONFIG,
  ANNOTATION_PRIORITY_CONFIG,
  BCBS239_PRINCIPLE_CONFIG,
  COMPLIANCE_STATUS_CONFIG,
  calculateDocumentationSummary,
  hasUnresolvedFlaggedAnnotations,
  getUnresolvedAnnotations,
  getBlockingAnnotations,
  allPrinciplesAssessed,
  getBCBS239CompliancePercentage,
} from './types'
