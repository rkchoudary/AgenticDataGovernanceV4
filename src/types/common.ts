/**
 * Common types and enums used across the Agentic Data Governance System
 */

// Cycle and workflow status types
export type CycleStatus = 'active' | 'paused' | 'completed' | 'failed';
export type Phase = 'data_gathering' | 'validation' | 'review' | 'approval' | 'submission';

// Data quality dimensions
export type DQDimension = 
  | 'completeness' 
  | 'accuracy' 
  | 'validity' 
  | 'consistency' 
  | 'timeliness' 
  | 'uniqueness' 
  | 'integrity';

// Jurisdiction types
export type Jurisdiction = 'US' | 'CA';

// Report frequency
export type ReportFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

// Severity levels
export type Severity = 'critical' | 'high' | 'medium' | 'low';

// Control types
export type ControlType = 'organizational' | 'process' | 'access' | 'change_management';
export type ControlCategory = 'preventive' | 'detective';
export type ControlStatus = 'active' | 'inactive' | 'compensating';
export type AutomationStatus = 'manual' | 'semi_automated' | 'fully_automated';

// Issue status
export type IssueStatus = 'open' | 'in_progress' | 'pending_verification' | 'resolved' | 'closed';

// Artifact status
export type ArtifactStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

// Task types
export type TaskType = 
  | 'catalog_review'
  | 'requirements_validation'
  | 'cde_approval'
  | 'rule_review'
  | 'lineage_validation'
  | 'issue_resolution_confirmation'
  | 'submission_approval'
  | 'attestation';

// Task status
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'escalated';

// Actor types
export type ActorType = 'agent' | 'human' | 'system';

// Document types
export type DocumentType = 
  | 'data_dictionary'
  | 'lineage_documentation'
  | 'quality_assurance_report'
  | 'control_effectiveness_report'
  | 'bcbs239_compliance_mapping';

// Document format
export type DocumentFormat = 'pdf' | 'html' | 'markdown';

// Data types for elements
export type DataType = 'string' | 'number' | 'date' | 'boolean' | 'decimal' | 'integer';

// Rule logic types
export type RuleLogicType = 
  | 'null_check' 
  | 'range_check' 
  | 'format_check' 
  | 'referential_check' 
  | 'reconciliation' 
  | 'custom';

// Lineage node types
export type LineageNodeType = 'source_table' | 'transformation' | 'staging_table' | 'report_field';

// Data gap reasons
export type DataGapReason = 'no_source' | 'partial_source' | 'calculation_needed';

// Resolution types
export type ResolutionType = 'data_correction' | 'process_change' | 'system_fix' | 'exception_approved';

// Reconciliation item status
export type ReconciliationItemStatus = 'matched' | 'added' | 'removed' | 'modified';

// Decision outcome
export type DecisionOutcome = 'approved' | 'rejected' | 'approved_with_changes';

// CDE status
export type CDEStatus = 'pending_approval' | 'approved' | 'rejected';

// Control evidence outcome
export type ControlEvidenceOutcome = 'pass' | 'fail' | 'exception';

// Workflow action types
export type WorkflowActionType = 'retry' | 'skip' | 'pause' | 'fail';

// Agent types
export type AgentType = 
  | 'regulatory_intelligence'
  | 'data_requirements'
  | 'cde_identification'
  | 'data_quality_rule'
  | 'lineage_mapping'
  | 'issue_management'
  | 'documentation';

// Agent status
export type AgentStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting';
