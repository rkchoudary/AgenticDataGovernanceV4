/**
 * Help Content Data
 * 
 * Predefined help content for each phase and step of the workflow wizard.
 * 
 * Requirements: 14.1, 14.2
 */

import { Phase } from '@/types/workflow-wizard'
import { PhaseHelpContent, StepHelpContent, FieldTooltipConfig } from './types'

// ============================================================================
// Phase Help Content
// ============================================================================

export const PHASE_HELP_CONTENT: Record<Phase, PhaseHelpContent> = {
  regulatory_intelligence: {
    phaseId: 'regulatory_intelligence',
    title: 'Regulatory Intelligence',
    overview: 'Review AI-detected regulatory changes and approve updates to your report catalog.',
    steps: [
      {
        stepId: 'scan_results',
        title: 'Scan Results Review',
        description: 'Review the regulatory changes detected by the AI scanning system.',
        requiredActions: [
          'Review each detected change card',
          'Verify the source and change type',
          'Check the AI confidence score',
        ],
        commonIssues: [
          {
            id: 'low_confidence',
            title: 'Low confidence scores',
            description: 'Some changes show low confidence scores',
            resolution: 'Review the source document manually to verify the change',
          },
        ],
        videoTutorialUrl: '/tutorials/regulatory-scan',
        documentationUrl: '/docs/regulatory-intelligence',
      },
      {
        stepId: 'change_analysis',
        title: 'Change Analysis',
        description: 'Analyze the impact of each regulatory change on your reporting.',
        requiredActions: [
          'Review side-by-side diff view',
          'Accept, reject, or modify each change',
          'Document rationale for decisions',
        ],
        commonIssues: [
          {
            id: 'unclear_impact',
            title: 'Unclear change impact',
            description: 'Cannot determine how change affects reporting',
            resolution: 'Consult with compliance team or request assistance',
          },
        ],
        videoTutorialUrl: '/tutorials/change-analysis',
      },
      {
        stepId: 'catalog_updates',
        title: 'Catalog Updates',
        description: 'Review and confirm updates to the regulatory catalog.',
        requiredActions: [
          'Review summary of accepted changes',
          'Verify catalog entries are correct',
          'Confirm updates are ready for approval',
        ],
        commonIssues: [],
      },
      {
        stepId: 'stakeholder_approval',
        title: 'Stakeholder Approval',
        description: 'Obtain stakeholder approval for catalog changes.',
        requiredActions: [
          'Review all changes one final time',
          'Provide approval rationale (min 20 characters)',
          'Capture digital signature',
        ],
        commonIssues: [
          {
            id: 'signature_failed',
            title: 'Signature capture failed',
            description: 'Digital signature could not be captured',
            resolution: 'Ensure you have a stable connection and try again',
          },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often are regulatory sources scanned?',
        answer: 'Sources are scanned daily, with critical sources checked every 4 hours.',
      },
      {
        question: 'Can I add custom regulatory sources?',
        answer: 'Yes, contact your administrator to add custom sources to the scan list.',
      },
    ],
  },
  data_requirements: {
    phaseId: 'data_requirements',
    title: 'Data Requirements',
    overview: 'Validate data element mappings and resolve any gaps in your data sources.',
    steps: [
      {
        stepId: 'template_parsing',
        title: 'Template Parsing Review',
        description: 'Review the parsed regulatory template and extracted data elements.',
        requiredActions: [
          'Verify extracted data elements',
          'Check element hierarchy',
          'Confirm element types and formats',
        ],
        commonIssues: [
          {
            id: 'missing_elements',
            title: 'Missing data elements',
            description: 'Some expected elements were not extracted',
            resolution: 'Manually add missing elements or re-run parsing',
          },
        ],
        videoTutorialUrl: '/tutorials/template-parsing',
      },
      {
        stepId: 'source_mapping',
        title: 'Source Mapping Validation',
        description: 'Validate mappings between regulatory elements and internal data sources.',
        requiredActions: [
          'Review each mapping',
          'Verify source field accuracy',
          'Check data type compatibility',
        ],
        commonIssues: [
          {
            id: 'type_mismatch',
            title: 'Data type mismatch',
            description: 'Source field type does not match required type',
            resolution: 'Apply transformation or select different source field',
          },
        ],
      },
      {
        stepId: 'gap_analysis',
        title: 'Gap Analysis',
        description: 'Identify and resolve gaps in data element mappings.',
        requiredActions: [
          'Review all identified gaps',
          'Choose resolution for each gap',
          'Document any deferred items',
        ],
        commonIssues: [],
      },
      {
        stepId: 'document_approval',
        title: 'Document Approval',
        description: 'Approve the data requirements document.',
        requiredActions: [
          'Review completion percentage',
          'Verify all critical elements are mapped',
          'Approve the requirements document',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'What happens to flagged gaps?',
        answer: 'Flagged gaps are tracked and must be resolved before attestation.',
      },
    ],
  },
  cde_identification: {
    phaseId: 'cde_identification',
    title: 'CDE Identification',
    overview: 'Review AI-identified Critical Data Elements and assign data owners.',
    steps: [
      {
        stepId: 'scoring_review',
        title: 'Scoring Review',
        description: 'Review CDE scoring based on regulatory importance factors.',
        requiredActions: [
          'Review radar chart for each CDE',
          'Verify AI rationale',
          'Adjust scores if needed',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/cde-scoring',
      },
      {
        stepId: 'inventory_approval',
        title: 'Inventory Approval',
        description: 'Approve the CDE inventory for this reporting cycle.',
        requiredActions: [
          'Review complete CDE list',
          'Verify all CDEs are correctly identified',
          'Approve the inventory',
        ],
        commonIssues: [],
      },
      {
        stepId: 'ownership_assignment',
        title: 'Ownership Assignment',
        description: 'Assign data owners to each CDE.',
        requiredActions: [
          'Assign owner to each CDE',
          'Verify owner has appropriate access',
          'All CDEs must have owners to proceed',
        ],
        commonIssues: [
          {
            id: 'no_owner',
            title: 'Cannot proceed without owners',
            description: 'All CDEs must have assigned owners',
            resolution: 'Assign owners to all CDEs before continuing',
          },
        ],
      },
      {
        stepId: 'reconciliation',
        title: 'Reconciliation',
        description: 'Reconcile CDE inventory with existing lists.',
        requiredActions: [
          'Review three-column comparison',
          'Resolve any discrepancies',
          'Apply bulk actions if needed',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'What are the four CDE scoring factors?',
        answer: 'Regulatory usage, cross-report usage, financial impact, and regulatory scrutiny.',
      },
    ],
  },
  data_quality_rules: {
    phaseId: 'data_quality_rules',
    title: 'Data Quality Rules',
    overview: 'Configure quality rules and thresholds for each CDE.',
    steps: [
      {
        stepId: 'rule_review',
        title: 'Rule Review',
        description: 'Review AI-generated data quality rules.',
        requiredActions: [
          'Review each rule card',
          'Accept, modify, or reject rules',
          'Verify rule logic is correct',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/dq-rules',
      },
      {
        stepId: 'threshold_config',
        title: 'Threshold Configuration',
        description: 'Configure quality thresholds for each rule.',
        requiredActions: [
          'Set threshold values',
          'Review impact preview',
          'Adjust based on historical data',
        ],
        commonIssues: [],
      },
      {
        stepId: 'coverage_validation',
        title: 'Coverage Validation',
        description: 'Validate rule coverage across all CDEs and dimensions.',
        requiredActions: [
          'Review coverage heatmap',
          'Address any gaps (red cells)',
          'Ensure all CDEs have adequate coverage',
        ],
        commonIssues: [],
      },
      {
        stepId: 'rule_activation',
        title: 'Rule Activation',
        description: 'Activate rules for execution.',
        requiredActions: [
          'Confirm rule activation',
          'Review execution schedule',
          'Acknowledge activation',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'What are the 7 data quality dimensions?',
        answer: 'Completeness, accuracy, validity, consistency, timeliness, uniqueness, and integrity.',
      },
    ],
  },
  lineage_mapping: {
    phaseId: 'lineage_mapping',
    title: 'Lineage Mapping',
    overview: 'Review and enrich data lineage from source to report.',
    steps: [
      {
        stepId: 'pipeline_scan',
        title: 'Pipeline Scan Review',
        description: 'Review discovered data pipelines and transformations.',
        requiredActions: [
          'Review lineage graph',
          'Verify pipeline connections',
          'Expand nodes for details',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/lineage',
      },
      {
        stepId: 'business_terms',
        title: 'Business Term Linking',
        description: 'Link business glossary terms to lineage nodes.',
        requiredActions: [
          'Search and link business terms',
          'Verify term associations',
          'Add missing terms if needed',
        ],
        commonIssues: [],
      },
      {
        stepId: 'impact_analysis',
        title: 'Impact Analysis Setup',
        description: 'Configure impact analysis notifications.',
        requiredActions: [
          'Set up notification rules',
          'Configure alert thresholds',
          'Assign notification recipients',
        ],
        commonIssues: [],
      },
      {
        stepId: 'lineage_approval',
        title: 'Lineage Approval',
        description: 'Approve the lineage mapping.',
        requiredActions: [
          'Review complete lineage',
          'Export diagram for documentation',
          'Approve the mapping',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'How is lineage discovered?',
        answer: 'Lineage is discovered by scanning ETL pipelines, SQL queries, and data transformations.',
      },
    ],
  },
  issue_management: {
    phaseId: 'issue_management',
    title: 'Issue Management',
    overview: 'Resolve open data quality issues before proceeding.',
    steps: [
      {
        stepId: 'issue_triage',
        title: 'Issue Triage',
        description: 'Triage and prioritize open issues.',
        requiredActions: [
          'Review issues by severity',
          'Verify AI-suggested priorities',
          'Assign issues to owners',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/issues',
      },
      {
        stepId: 'root_cause',
        title: 'Root Cause Analysis',
        description: 'Analyze root causes of data quality issues.',
        requiredActions: [
          'Review AI suggestions',
          'Check similar historical issues',
          'Document root cause findings',
        ],
        commonIssues: [],
      },
      {
        stepId: 'resolution',
        title: 'Resolution Implementation',
        description: 'Implement and document issue resolutions.',
        requiredActions: [
          'Document the fix',
          'Attach evidence',
          'Request four-eyes confirmation',
        ],
        commonIssues: [
          {
            id: 'critical_blocking',
            title: 'Critical issues blocking progress',
            description: 'Cannot proceed with unresolved critical issues',
            resolution: 'Resolve or escalate all critical issues',
          },
        ],
      },
      {
        stepId: 'verification',
        title: 'Verification',
        description: 'Verify issue resolutions are effective.',
        requiredActions: [
          'Verify each resolution',
          'Confirm data quality improved',
          'Close verified issues',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'What happens to unresolved critical issues?',
        answer: 'Critical issues block progression to the next phase until resolved or escalated.',
      },
    ],
  },
  controls_management: {
    phaseId: 'controls_management',
    title: 'Controls Management',
    overview: 'Verify control effectiveness and collect evidence.',
    steps: [
      {
        stepId: 'status_review',
        title: 'Control Status Review',
        description: 'Review the status of all governance controls.',
        requiredActions: [
          'Review pass/fail indicators',
          'Identify failing controls',
          'Plan remediation actions',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/controls',
      },
      {
        stepId: 'evidence_collection',
        title: 'Evidence Collection',
        description: 'Collect and upload control evidence.',
        requiredActions: [
          'Upload evidence documents',
          'Tag with metadata',
          'Link to controls',
        ],
        commonIssues: [],
      },
      {
        stepId: 'compensating_check',
        title: 'Compensating Control Check',
        description: 'Review compensating controls and expirations.',
        requiredActions: [
          'Review expiration warnings',
          'Confirm renewal plans',
          'Document compensating measures',
        ],
        commonIssues: [],
      },
      {
        stepId: 'effectiveness_signoff',
        title: 'Effectiveness Sign-off',
        description: 'Attest to control effectiveness.',
        requiredActions: [
          'Review all controls',
          'Attest to effectiveness',
          'Capture signature',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'What is a compensating control?',
        answer: 'A temporary control that mitigates risk when a primary control is not fully effective.',
      },
    ],
  },
  documentation: {
    phaseId: 'documentation',
    title: 'Documentation',
    overview: 'Review generated documentation and compile the compliance package.',
    steps: [
      {
        stepId: 'artifact_review',
        title: 'Artifact Review',
        description: 'Review all generated documentation artifacts.',
        requiredActions: [
          'Review each document',
          'Add annotations as needed',
          'Flag items for follow-up',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/documentation',
      },
      {
        stepId: 'annotation_resolution',
        title: 'Annotation Resolution',
        description: 'Resolve all document annotations.',
        requiredActions: [
          'Address each annotation',
          'Mark as resolved',
          'All annotations must be resolved to proceed',
        ],
        commonIssues: [
          {
            id: 'unresolved_annotations',
            title: 'Unresolved annotations blocking progress',
            description: 'Cannot proceed with unresolved annotations',
            resolution: 'Resolve all flagged annotations before continuing',
          },
        ],
      },
      {
        stepId: 'bcbs_mapping',
        title: 'BCBS 239 Mapping',
        description: 'Review BCBS 239 compliance mapping.',
        requiredActions: [
          'Review compliance matrix',
          'Verify evidence links',
          'Confirm compliance status',
        ],
        commonIssues: [],
      },
      {
        stepId: 'package_compilation',
        title: 'Package Compilation',
        description: 'Compile the final compliance package.',
        requiredActions: [
          'Generate consolidated PDF',
          'Verify table of contents',
          'Download package',
        ],
        commonIssues: [],
      },
    ],
    faqs: [
      {
        question: 'What is BCBS 239?',
        answer: 'Basel Committee principles for effective risk data aggregation and reporting.',
      },
    ],
  },
  attestation: {
    phaseId: 'attestation',
    title: 'Attestation',
    overview: 'Final review and executive sign-off before submission.',
    steps: [
      {
        stepId: 'executive_summary',
        title: 'Executive Summary Review',
        description: 'Review key metrics and summary information.',
        requiredActions: [
          'Review quality score',
          'Check issue resolution rate',
          'Verify control pass rate',
          'Confirm deadline status',
        ],
        commonIssues: [],
        videoTutorialUrl: '/tutorials/attestation',
      },
      {
        stepId: 'compliance_checklist',
        title: 'Compliance Checklist',
        description: 'Complete the attestation checklist.',
        requiredActions: [
          'Review each checklist item',
          'Acknowledge each item',
          'All items must be acknowledged',
        ],
        commonIssues: [],
      },
      {
        stepId: 'digital_attestation',
        title: 'Digital Attestation',
        description: 'Provide digital attestation with signature.',
        requiredActions: [
          'Verify identity',
          'Capture digital signature',
          'Confirm attestation',
        ],
        commonIssues: [],
      },
      {
        stepId: 'submission_confirmation',
        title: 'Submission Confirmation',
        description: 'Confirm and submit the regulatory report.',
        requiredActions: [
          'Review final summary',
          'Confirm submission',
          'Download receipt',
        ],
        commonIssues: [],
        tips: [
          'After submission, all artifacts are locked and cannot be modified',
          'A submission receipt will be generated for your records',
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I modify artifacts after submission?',
        answer: 'No, all artifacts are locked after submission. A new cycle must be started for changes.',
      },
    ],
  },
}

// ============================================================================
// Field Tooltip Configurations
// ============================================================================

export const FIELD_TOOLTIPS: Record<string, FieldTooltipConfig> = {
  rationale: {
    fieldId: 'rationale',
    label: 'Approval Rationale',
    description: 'Provide a clear explanation for your approval decision.',
    validationRules: [
      { type: 'required', description: 'Rationale is required' },
      { type: 'minLength', description: 'Minimum 20 characters', value: 20 },
    ],
    required: true,
  },
  signature: {
    fieldId: 'signature',
    label: 'Digital Signature',
    description: 'Your digital signature confirms your identity and approval.',
    validationRules: [
      { type: 'required', description: 'Signature is required for approval' },
    ],
    required: true,
  },
  cdeOwner: {
    fieldId: 'cdeOwner',
    label: 'CDE Owner',
    description: 'The person responsible for the quality and accuracy of this data element.',
    validationRules: [
      { type: 'required', description: 'All CDEs must have an assigned owner' },
    ],
    required: true,
  },
  threshold: {
    fieldId: 'threshold',
    label: 'Quality Threshold',
    description: 'The minimum acceptable quality score for this rule.',
    validationRules: [
      { type: 'range', description: 'Value must be between 0 and 100', value: '0-100' },
    ],
    examples: ['95% for critical fields', '90% for standard fields'],
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getStepHelp(phaseId: Phase, stepId: string): StepHelpContent | null {
  const phaseHelp = PHASE_HELP_CONTENT[phaseId]
  if (!phaseHelp) return null
  return phaseHelp.steps.find(s => s.stepId === stepId) || null
}

export function getPhaseHelp(phaseId: Phase): PhaseHelpContent | null {
  return PHASE_HELP_CONTENT[phaseId] || null
}

export function getFieldTooltip(fieldId: string): FieldTooltipConfig | null {
  return FIELD_TOOLTIPS[fieldId] || null
}
