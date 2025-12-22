/**
 * Controls types for the Agentic Data Governance System
 */

import { 
  ControlType, 
  ControlCategory, 
  ControlStatus, 
  AutomationStatus,
  ControlEvidenceOutcome,
  ReportFrequency
} from './common.js';

/**
 * Evidence of control execution
 */
export interface ControlEvidence {
  id: string;
  controlId: string;
  executionDate: Date;
  outcome: ControlEvidenceOutcome;
  details: string;
  executedBy: string;
}

/**
 * Control definition
 */
export interface Control {
  id: string;
  name: string;
  description: string;
  type: ControlType;
  category: ControlCategory;
  owner: string;
  frequency: ReportFrequency | 'continuous';
  linkedCDEs: string[];
  linkedProcesses: string[];
  automationStatus: AutomationStatus;
  ruleId?: string;
  status: ControlStatus;
  expirationDate?: Date;
  linkedIssueId?: string;
  evidence: ControlEvidence[];
}

/**
 * Control Matrix for a report
 */
export interface ControlMatrix {
  id: string;
  reportId: string;
  controls: Control[];
  version: number;
  lastReviewed: Date;
  reviewedBy: string;
}
