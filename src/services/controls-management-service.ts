/**
 * Controls Management Service
 * 
 * Handles control lifecycle management, evidence logging, and audit scheduling
 * for the Agentic Data Governance System.
 */

import { 
  Control, 
  ControlMatrix, 
  ControlEvidence,
  ControlType,
  ControlCategory,
  ControlStatus,
  AutomationStatus,
  ControlEvidenceOutcome,
  ReportFrequency
} from '../types/controls.js';
import { GovernanceRepository } from '../repository/governance-repository.js';
import { Issue } from '../types/issues.js';

export interface ControlsManagementService {
  // Control Matrix management
  createControlMatrix(reportId: string, controls: Control[]): Promise<ControlMatrix>;
  getControlMatrix(reportId: string): Promise<ControlMatrix | undefined>;
  updateControlMatrix(reportId: string, matrix: ControlMatrix): Promise<void>;
  
  // Control lifecycle management
  activateControl(controlId: string, reportId: string): Promise<void>;
  deactivateControl(controlId: string, reportId: string, reason: string): Promise<void>;
  createCompensatingControl(
    reportId: string, 
    linkedIssueId: string, 
    control: Omit<Control, 'id' | 'status' | 'evidence'>
  ): Promise<Control>;
  
  // Evidence logging
  logControlEvidence(
    controlId: string, 
    reportId: string, 
    evidence: Omit<ControlEvidence, 'id' | 'controlId'>
  ): Promise<ControlEvidence>;
  
  // Control framework ingestion
  ingestControlFramework(
    reportId: string, 
    frameworkControls: Partial<Control>[]
  ): Promise<ControlMatrix>;
  
  // Audit scheduling
  scheduleControlReview(controlId: string, reportId: string, reviewDate: Date): Promise<void>;
  getControlsForReview(reportId: string, date?: Date): Promise<Control[]>;
  
  // Compensating control management
  expireCompensatingControl(controlId: string, reportId: string): Promise<void>;
  getExpiringCompensatingControls(reportId: string, withinDays: number): Promise<Control[]>;
}

export class ControlsManagementServiceImpl implements ControlsManagementService {
  constructor(private repository: GovernanceRepository) {}

  async createControlMatrix(reportId: string, controls: Control[]): Promise<ControlMatrix> {
    // Validate control categorization
    for (const control of controls) {
      this.validateControlCategorization(control);
    }

    const matrix: ControlMatrix = {
      id: `control-matrix-${reportId}-${Date.now()}`,
      reportId,
      controls,
      version: 1,
      lastReviewed: new Date(),
      reviewedBy: 'system'
    };

    this.repository.setControlMatrix(reportId, matrix);
    return matrix;
  }

  async getControlMatrix(reportId: string): Promise<ControlMatrix | undefined> {
    return this.repository.getControlMatrix(reportId);
  }

  async updateControlMatrix(reportId: string, matrix: ControlMatrix): Promise<void> {
    // Validate all controls
    for (const control of matrix.controls) {
      this.validateControlCategorization(control);
    }

    this.repository.setControlMatrix(reportId, matrix);
  }

  async activateControl(controlId: string, reportId: string): Promise<void> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      throw new Error(`Control matrix not found for report: ${reportId}`);
    }

    const control = matrix.controls.find(c => c.id === controlId);
    if (!control) {
      throw new Error(`Control not found: ${controlId}`);
    }

    // Log activation evidence
    const evidence: ControlEvidence = {
      id: `evidence-${controlId}-${Date.now()}`,
      controlId,
      executionDate: new Date(),
      outcome: 'pass',
      details: 'Control activated',
      executedBy: 'system'
    };

    control.status = 'active';
    control.evidence.push(evidence);

    this.repository.setControlMatrix(reportId, matrix);
  }

  async deactivateControl(controlId: string, reportId: string, reason: string): Promise<void> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      throw new Error(`Control matrix not found for report: ${reportId}`);
    }

    const control = matrix.controls.find(c => c.id === controlId);
    if (!control) {
      throw new Error(`Control not found: ${controlId}`);
    }

    // Log deactivation evidence
    const evidence: ControlEvidence = {
      id: `evidence-${controlId}-${Date.now()}`,
      controlId,
      executionDate: new Date(),
      outcome: 'exception',
      details: `Control deactivated: ${reason}`,
      executedBy: 'system'
    };

    control.status = 'inactive';
    control.evidence.push(evidence);

    this.repository.setControlMatrix(reportId, matrix);
  }

  async createCompensatingControl(
    reportId: string, 
    linkedIssueId: string, 
    controlData: Omit<Control, 'id' | 'status' | 'evidence'>
  ): Promise<Control> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      throw new Error(`Control matrix not found for report: ${reportId}`);
    }

    // Validate the issue exists
    const issue = this.repository.getIssue(linkedIssueId);
    if (!issue) {
      throw new Error(`Issue not found: ${linkedIssueId}`);
    }

    const control: Control = {
      ...controlData,
      id: `compensating-control-${Date.now()}`,
      status: 'compensating',
      linkedIssueId,
      evidence: []
    };

    // Validate control categorization
    this.validateControlCategorization(control);

    // Log creation evidence
    const evidence: ControlEvidence = {
      id: `evidence-${control.id}-${Date.now()}`,
      controlId: control.id,
      executionDate: new Date(),
      outcome: 'pass',
      details: `Compensating control created for issue: ${linkedIssueId}`,
      executedBy: 'system'
    };

    control.evidence.push(evidence);
    matrix.controls.push(control);

    this.repository.setControlMatrix(reportId, matrix);
    return control;
  }

  async logControlEvidence(
    controlId: string, 
    reportId: string, 
    evidenceData: Omit<ControlEvidence, 'id' | 'controlId'>
  ): Promise<ControlEvidence> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      throw new Error(`Control matrix not found for report: ${reportId}`);
    }

    const control = matrix.controls.find(c => c.id === controlId);
    if (!control) {
      throw new Error(`Control not found: ${controlId}`);
    }

    const evidence: ControlEvidence = {
      ...evidenceData,
      id: `evidence-${controlId}-${Date.now()}`,
      controlId
    };

    control.evidence.push(evidence);
    this.repository.setControlMatrix(reportId, matrix);

    return evidence;
  }

  async ingestControlFramework(
    reportId: string, 
    frameworkControls: Partial<Control>[]
  ): Promise<ControlMatrix> {
    const existingMatrix = this.repository.getControlMatrix(reportId);
    
    const controls: Control[] = frameworkControls.map((fc, index) => {
      const control: Control = {
        id: fc.id || `framework-control-${index}-${Date.now()}`,
        name: fc.name || `Framework Control ${index + 1}`,
        description: fc.description || '',
        type: fc.type || 'process',
        category: fc.category || 'preventive',
        owner: fc.owner || 'unassigned',
        frequency: fc.frequency || 'monthly',
        linkedCDEs: fc.linkedCDEs || [],
        linkedProcesses: fc.linkedProcesses || [],
        automationStatus: fc.automationStatus || 'manual',
        ruleId: fc.ruleId,
        status: fc.status || 'active',
        expirationDate: fc.expirationDate,
        linkedIssueId: fc.linkedIssueId,
        evidence: fc.evidence || []
      };

      // Validate control categorization
      this.validateControlCategorization(control);
      return control;
    });

    if (existingMatrix) {
      // Merge with existing controls
      const mergedControls = [...existingMatrix.controls, ...controls];
      const updatedMatrix: ControlMatrix = {
        ...existingMatrix,
        controls: mergedControls,
        version: existingMatrix.version + 1,
        lastReviewed: new Date()
      };
      
      this.repository.setControlMatrix(reportId, updatedMatrix);
      return updatedMatrix;
    } else {
      return this.createControlMatrix(reportId, controls);
    }
  }

  async scheduleControlReview(controlId: string, reportId: string, reviewDate: Date): Promise<void> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      throw new Error(`Control matrix not found for report: ${reportId}`);
    }

    const control = matrix.controls.find(c => c.id === controlId);
    if (!control) {
      throw new Error(`Control not found: ${controlId}`);
    }

    // For now, we'll store the review date in the evidence
    // In a full implementation, this would integrate with a scheduling system
    const evidence: ControlEvidence = {
      id: `review-scheduled-${controlId}-${Date.now()}`,
      controlId,
      executionDate: new Date(),
      outcome: 'pass',
      details: `Review scheduled for: ${reviewDate.toISOString()}`,
      executedBy: 'system'
    };

    control.evidence.push(evidence);
    this.repository.setControlMatrix(reportId, matrix);
  }

  async getControlsForReview(reportId: string, date: Date = new Date()): Promise<Control[]> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      return [];
    }

    // Return controls that need review based on their frequency
    // This is a simplified implementation
    return matrix.controls.filter(control => {
      if (control.status !== 'active') return false;
      
      // Check if control needs review based on frequency
      const lastReview = control.evidence
        .filter(e => e.details.includes('Review'))
        .sort((a, b) => b.executionDate.getTime() - a.executionDate.getTime())[0];

      if (!lastReview) return true; // Never reviewed

      const daysSinceReview = Math.floor(
        (date.getTime() - lastReview.executionDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      switch (control.frequency) {
        case 'daily': return daysSinceReview >= 1;
        case 'weekly': return daysSinceReview >= 7;
        case 'monthly': return daysSinceReview >= 30;
        case 'quarterly': return daysSinceReview >= 90;
        case 'annual': return daysSinceReview >= 365;
        case 'continuous': return false; // Continuous controls don't need scheduled reviews
        default: return false;
      }
    });
  }

  async expireCompensatingControl(controlId: string, reportId: string): Promise<void> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      throw new Error(`Control matrix not found for report: ${reportId}`);
    }

    const controlIndex = matrix.controls.findIndex(c => c.id === controlId);
    if (controlIndex === -1) {
      throw new Error(`Control not found: ${controlId}`);
    }

    const control = matrix.controls[controlIndex];
    if (control.status !== 'compensating') {
      throw new Error(`Control ${controlId} is not a compensating control`);
    }

    // Log expiration evidence
    const evidence: ControlEvidence = {
      id: `evidence-${controlId}-${Date.now()}`,
      controlId,
      executionDate: new Date(),
      outcome: 'exception',
      details: 'Compensating control expired and removed',
      executedBy: 'system'
    };

    control.evidence.push(evidence);
    
    // Remove the control from the matrix
    matrix.controls.splice(controlIndex, 1);
    
    this.repository.setControlMatrix(reportId, matrix);
  }

  async getExpiringCompensatingControls(reportId: string, withinDays: number): Promise<Control[]> {
    const matrix = this.repository.getControlMatrix(reportId);
    if (!matrix) {
      return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() + withinDays);

    return matrix.controls.filter(control => 
      control.status === 'compensating' && 
      control.expirationDate && 
      control.expirationDate <= cutoffDate
    );
  }

  private validateControlCategorization(control: Control): void {
    const validTypes: ControlType[] = ['organizational', 'process', 'access', 'change_management'];
    const validCategories: ControlCategory[] = ['preventive', 'detective'];
    const validStatuses: ControlStatus[] = ['active', 'inactive', 'compensating'];
    const validAutomationStatuses: AutomationStatus[] = ['manual', 'semi_automated', 'fully_automated'];

    if (!validTypes.includes(control.type)) {
      throw new Error(`Invalid control type: ${control.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    if (!validCategories.includes(control.category)) {
      throw new Error(`Invalid control category: ${control.category}. Must be one of: ${validCategories.join(', ')}`);
    }

    if (!validStatuses.includes(control.status)) {
      throw new Error(`Invalid control status: ${control.status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    if (!validAutomationStatuses.includes(control.automationStatus)) {
      throw new Error(`Invalid automation status: ${control.automationStatus}. Must be one of: ${validAutomationStatuses.join(', ')}`);
    }

    // Validate compensating control requirements
    if (control.status === 'compensating') {
      if (!control.linkedIssueId) {
        throw new Error('Compensating controls must have a linkedIssueId');
      }
      if (!control.expirationDate) {
        throw new Error('Compensating controls must have an expirationDate');
      }
    }
  }
}