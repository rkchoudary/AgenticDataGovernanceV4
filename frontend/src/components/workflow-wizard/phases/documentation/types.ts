/**
 * Types for Documentation Phase
 * 
 * Defines data structures for artifact review, annotation resolution,
 * BCBS 239 compliance mapping, and package compilation.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

/**
 * Document artifact type
 */
export type ArtifactType = 
  | 'data_dictionary'
  | 'lineage_diagram'
  | 'quality_report'
  | 'control_evidence'
  | 'issue_summary'
  | 'regulatory_mapping'
  | 'attestation_form'
  | 'other'

/**
 * Artifact status
 */
export type ArtifactStatus = 'draft' | 'review' | 'approved' | 'rejected'

/**
 * Annotation type
 */
export type AnnotationType = 'highlight' | 'comment' | 'flag'

/**
 * Annotation status
 */
export type AnnotationStatus = 'open' | 'resolved' | 'dismissed'

/**
 * Annotation priority
 */
export type AnnotationPriority = 'low' | 'medium' | 'high' | 'critical'

/**
 * BCBS 239 Principle
 */
export type BCBS239Principle = 
  | 'governance'
  | 'data_architecture'
  | 'accuracy_integrity'
  | 'completeness'
  | 'timeliness'
  | 'adaptability'
  | 'accuracy_reporting'
  | 'comprehensiveness'
  | 'clarity_usefulness'
  | 'frequency'
  | 'distribution'

/**
 * Compliance status
 */
export type ComplianceStatus = 'compliant' | 'partial' | 'non_compliant' | 'not_assessed'

/**
 * Document artifact
 */
export interface DocumentArtifact {
  id: string
  name: string
  type: ArtifactType
  description: string
  version: string
  status: ArtifactStatus
  fileUrl?: string
  fileType: 'pdf' | 'html' | 'docx' | 'xlsx'
  fileSize?: number
  pageCount?: number
  createdAt: string
  createdBy: string
  lastModifiedAt: string
  lastModifiedBy: string
  annotations: Annotation[]
  linkedCDEs?: string[]
  linkedControls?: string[]
  isAIGenerated: boolean
  aiConfidence?: number
}

/**
 * Document annotation
 */
export interface Annotation {
  id: string
  artifactId: string
  type: AnnotationType
  status: AnnotationStatus
  priority: AnnotationPriority
  content: string
  pageNumber?: number
  position?: {
    x: number
    y: number
    width: number
    height: number
  }
  selectedText?: string
  createdAt: string
  createdBy: string
  createdByName?: string
  resolvedAt?: string
  resolvedBy?: string
  resolvedByName?: string
  resolution?: string
  replies: AnnotationReply[]
}

/**
 * Annotation reply
 */
export interface AnnotationReply {
  id: string
  annotationId: string
  content: string
  createdAt: string
  createdBy: string
  createdByName?: string
}

/**
 * BCBS 239 compliance mapping entry
 */
export interface BCBS239ComplianceEntry {
  principle: BCBS239Principle
  principleNumber: number
  principleName: string
  description: string
  status: ComplianceStatus
  evidenceLinks: EvidenceLink[]
  gaps: string[]
  remediationPlan?: string
  assessedAt?: string
  assessedBy?: string
  notes?: string
}

/**
 * Evidence link for compliance
 */
export interface EvidenceLink {
  id: string
  artifactId: string
  artifactName: string
  section?: string
  pageNumber?: number
  description: string
}

/**
 * Compiled package metadata
 */
export interface CompiledPackage {
  id: string
  name: string
  version: string
  status: 'pending' | 'compiling' | 'completed' | 'failed'
  artifacts: string[]
  tableOfContents: TOCEntry[]
  totalPages: number
  fileUrl?: string
  fileSize?: number
  compiledAt?: string
  compiledBy?: string
  error?: string
}

/**
 * Table of contents entry
 */
export interface TOCEntry {
  id: string
  title: string
  pageNumber: number
  level: number
  artifactId?: string
  children?: TOCEntry[]
}

/**
 * Documentation phase summary
 */
export interface DocumentationSummary {
  totalArtifacts: number
  approvedArtifacts: number
  pendingArtifacts: number
  rejectedArtifacts: number
  totalAnnotations: number
  openAnnotations: number
  resolvedAnnotations: number
  flaggedAnnotations: number
  bcbs239Compliance: {
    compliant: number
    partial: number
    nonCompliant: number
    notAssessed: number
  }
  packageStatus: 'not_started' | 'in_progress' | 'completed'
}

/**
 * Step IDs for Documentation phase
 */
export const DOCUMENTATION_STEPS = {
  ARTIFACT_REVIEW: 'artifact_review',
  ANNOTATION_RESOLUTION: 'annotation_resolution',
  BCBS_MAPPING: 'bcbs_mapping',
  PACKAGE_COMPILATION: 'package_compilation',
} as const

export type DocumentationStepId = typeof DOCUMENTATION_STEPS[keyof typeof DOCUMENTATION_STEPS]

/**
 * Artifact type display configuration
 */
export const ARTIFACT_TYPE_CONFIG: Record<ArtifactType, {
  label: string
  description: string
  icon: string
}> = {
  data_dictionary: {
    label: 'Data Dictionary',
    description: 'Definitions and metadata for data elements',
    icon: 'Book',
  },
  lineage_diagram: {
    label: 'Lineage Diagram',
    description: 'Data flow and transformation documentation',
    icon: 'GitBranch',
  },
  quality_report: {
    label: 'Quality Report',
    description: 'Data quality assessment results',
    icon: 'BarChart',
  },
  control_evidence: {
    label: 'Control Evidence',
    description: 'Documentation of control effectiveness',
    icon: 'Shield',
  },
  issue_summary: {
    label: 'Issue Summary',
    description: 'Summary of identified and resolved issues',
    icon: 'AlertTriangle',
  },
  regulatory_mapping: {
    label: 'Regulatory Mapping',
    description: 'Mapping to regulatory requirements',
    icon: 'FileText',
  },
  attestation_form: {
    label: 'Attestation Form',
    description: 'Sign-off and attestation documents',
    icon: 'FileCheck',
  },
  other: {
    label: 'Other',
    description: 'Other supporting documentation',
    icon: 'File',
  },
}

/**
 * Artifact status display configuration
 */
export const ARTIFACT_STATUS_CONFIG: Record<ArtifactStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  draft: {
    label: 'Draft',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'FileEdit',
  },
  review: {
    label: 'In Review',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'Eye',
  },
  approved: {
    label: 'Approved',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  rejected: {
    label: 'Rejected',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
}

/**
 * Annotation type display configuration
 */
export const ANNOTATION_TYPE_CONFIG: Record<AnnotationType, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  highlight: {
    label: 'Highlight',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
    icon: 'Highlighter',
  },
  comment: {
    label: 'Comment',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: 'MessageSquare',
  },
  flag: {
    label: 'Flag',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'Flag',
  },
}

/**
 * Annotation status display configuration
 */
export const ANNOTATION_STATUS_CONFIG: Record<AnnotationStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  open: {
    label: 'Open',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'Circle',
  },
  resolved: {
    label: 'Resolved',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  dismissed: {
    label: 'Dismissed',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'XCircle',
  },
}

/**
 * Annotation priority display configuration
 */
export const ANNOTATION_PRIORITY_CONFIG: Record<AnnotationPriority, {
  label: string
  color: string
  bgColor: string
}> = {
  low: {
    label: 'Low',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
  },
  medium: {
    label: 'Medium',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
  },
  high: {
    label: 'High',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
  },
  critical: {
    label: 'Critical',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
}

/**
 * BCBS 239 principle display configuration
 */
export const BCBS239_PRINCIPLE_CONFIG: Record<BCBS239Principle, {
  number: number
  name: string
  category: 'governance' | 'data_aggregation' | 'risk_reporting'
  description: string
}> = {
  governance: {
    number: 1,
    name: 'Governance',
    category: 'governance',
    description: 'A bank\'s board and senior management should promote the identification, assessment, and management of data quality risks.',
  },
  data_architecture: {
    number: 2,
    name: 'Data Architecture and IT Infrastructure',
    category: 'governance',
    description: 'A bank should design, build, and maintain data architecture and IT infrastructure which fully supports its risk data aggregation capabilities.',
  },
  accuracy_integrity: {
    number: 3,
    name: 'Accuracy and Integrity',
    category: 'data_aggregation',
    description: 'A bank should be able to generate accurate and reliable risk data to meet normal and stress/crisis reporting accuracy requirements.',
  },
  completeness: {
    number: 4,
    name: 'Completeness',
    category: 'data_aggregation',
    description: 'A bank should be able to capture and aggregate all material risk data across the banking group.',
  },
  timeliness: {
    number: 5,
    name: 'Timeliness',
    category: 'data_aggregation',
    description: 'A bank should be able to generate aggregate and up-to-date risk data in a timely manner.',
  },
  adaptability: {
    number: 6,
    name: 'Adaptability',
    category: 'data_aggregation',
    description: 'A bank should be able to generate aggregate risk data to meet a broad range of on-demand, ad hoc risk management reporting requests.',
  },
  accuracy_reporting: {
    number: 7,
    name: 'Accuracy (Reporting)',
    category: 'risk_reporting',
    description: 'Risk management reports should accurately and precisely convey aggregated risk data.',
  },
  comprehensiveness: {
    number: 8,
    name: 'Comprehensiveness',
    category: 'risk_reporting',
    description: 'Risk management reports should cover all material risk areas within the organisation.',
  },
  clarity_usefulness: {
    number: 9,
    name: 'Clarity and Usefulness',
    category: 'risk_reporting',
    description: 'Risk management reports should communicate information in a clear and concise manner.',
  },
  frequency: {
    number: 10,
    name: 'Frequency',
    category: 'risk_reporting',
    description: 'The board and senior management should set the frequency of risk management report production.',
  },
  distribution: {
    number: 11,
    name: 'Distribution',
    category: 'risk_reporting',
    description: 'Risk management reports should be distributed to the relevant parties while ensuring confidentiality.',
  },
}

/**
 * Compliance status display configuration
 */
export const COMPLIANCE_STATUS_CONFIG: Record<ComplianceStatus, {
  label: string
  color: string
  bgColor: string
  icon: string
}> = {
  compliant: {
    label: 'Compliant',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    icon: 'CheckCircle',
  },
  partial: {
    label: 'Partially Compliant',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: 'AlertCircle',
  },
  non_compliant: {
    label: 'Non-Compliant',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
    icon: 'XCircle',
  },
  not_assessed: {
    label: 'Not Assessed',
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    icon: 'HelpCircle',
  },
}

/**
 * Calculate documentation summary
 */
export function calculateDocumentationSummary(
  artifacts: DocumentArtifact[],
  bcbs239Entries: BCBS239ComplianceEntry[],
  packageStatus: 'not_started' | 'in_progress' | 'completed'
): DocumentationSummary {
  const allAnnotations = artifacts.flatMap(a => a.annotations)
  
  return {
    totalArtifacts: artifacts.length,
    approvedArtifacts: artifacts.filter(a => a.status === 'approved').length,
    pendingArtifacts: artifacts.filter(a => a.status === 'draft' || a.status === 'review').length,
    rejectedArtifacts: artifacts.filter(a => a.status === 'rejected').length,
    totalAnnotations: allAnnotations.length,
    openAnnotations: allAnnotations.filter(a => a.status === 'open').length,
    resolvedAnnotations: allAnnotations.filter(a => a.status === 'resolved').length,
    flaggedAnnotations: allAnnotations.filter(a => a.type === 'flag' && a.status === 'open').length,
    bcbs239Compliance: {
      compliant: bcbs239Entries.filter(e => e.status === 'compliant').length,
      partial: bcbs239Entries.filter(e => e.status === 'partial').length,
      nonCompliant: bcbs239Entries.filter(e => e.status === 'non_compliant').length,
      notAssessed: bcbs239Entries.filter(e => e.status === 'not_assessed').length,
    },
    packageStatus,
  }
}

/**
 * Check if all flagged annotations are resolved
 * This is a blocking condition for phase progression
 */
export function hasUnresolvedFlaggedAnnotations(artifacts: DocumentArtifact[]): boolean {
  return artifacts.some(artifact =>
    artifact.annotations.some(
      annotation => annotation.type === 'flag' && annotation.status === 'open'
    )
  )
}

/**
 * Get all unresolved annotations
 */
export function getUnresolvedAnnotations(artifacts: DocumentArtifact[]): Annotation[] {
  return artifacts.flatMap(artifact =>
    artifact.annotations.filter(a => a.status === 'open')
  )
}

/**
 * Get flagged annotations that block progression
 */
export function getBlockingAnnotations(artifacts: DocumentArtifact[]): Annotation[] {
  return artifacts.flatMap(artifact =>
    artifact.annotations.filter(
      a => a.type === 'flag' && a.status === 'open'
    )
  )
}

/**
 * Check if all BCBS 239 principles are assessed
 */
export function allPrinciplesAssessed(entries: BCBS239ComplianceEntry[]): boolean {
  return entries.every(e => e.status !== 'not_assessed')
}

/**
 * Get BCBS 239 compliance percentage
 */
export function getBCBS239CompliancePercentage(entries: BCBS239ComplianceEntry[]): number {
  if (entries.length === 0) return 0
  const compliantCount = entries.filter(e => e.status === 'compliant').length
  return Math.round((compliantCount / entries.length) * 100)
}
