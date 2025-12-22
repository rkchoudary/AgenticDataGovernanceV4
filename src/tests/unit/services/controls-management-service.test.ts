/**
 * Unit tests for Controls Management Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ControlsManagementServiceImpl } from '../../../services/controls-management-service.js';
import { InMemoryGovernanceRepository } from '../../../repository/governance-repository.js';
import { Control, ControlEvidence } from '../../../types/controls.js';
import { Issue } from '../../../types/issues.js';

describe('ControlsManagementService', () => {
  let service: ControlsManagementServiceImpl;
  let repository: InMemoryGovernanceRepository;

  beforeEach(() => {
    repository = new InMemoryGovernanceRepository();
    service = new ControlsManagementServiceImpl(repository);
  });

  describe('Control Categorization', () => {
    it('should accept controls with valid type and category', async () => {
      const control: Control = {
        id: 'test-control-1',
        name: 'Test Control',
        description: 'A test control',
        type: 'process',
        category: 'preventive',
        owner: 'test-owner',
        frequency: 'monthly',
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual',
        status: 'active',
        evidence: []
      };

      const matrix = await service.createControlMatrix('report-1', [control]);
      
      expect(matrix.controls).toHaveLength(1);
      expect(matrix.controls[0].type).toBe('process');
      expect(matrix.controls[0].category).toBe('preventive');
    });

    it('should reject controls with invalid type', async () => {
      const control: Control = {
        id: 'test-control-1',
        name: 'Test Control',
        description: 'A test control',
        type: 'invalid-type' as any,
        category: 'preventive',
        owner: 'test-owner',
        frequency: 'monthly',
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual',
        status: 'active',
        evidence: []
      };

      await expect(service.createControlMatrix('report-1', [control]))
        .rejects.toThrow('Invalid control type: invalid-type');
    });

    it('should reject controls with invalid category', async () => {
      const control: Control = {
        id: 'test-control-1',
        name: 'Test Control',
        description: 'A test control',
        type: 'process',
        category: 'invalid-category' as any,
        owner: 'test-owner',
        frequency: 'monthly',
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual',
        status: 'active',
        evidence: []
      };

      await expect(service.createControlMatrix('report-1', [control]))
        .rejects.toThrow('Invalid control category: invalid-category');
    });
  });

  describe('Evidence Logging', () => {
    it('should log control evidence correctly', async () => {
      const control: Control = {
        id: 'test-control-1',
        name: 'Test Control',
        description: 'A test control',
        type: 'process',
        category: 'preventive',
        owner: 'test-owner',
        frequency: 'monthly',
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual',
        status: 'active',
        evidence: []
      };

      await service.createControlMatrix('report-1', [control]);

      const evidenceData = {
        executionDate: new Date(),
        outcome: 'pass' as const,
        details: 'Control executed successfully',
        executedBy: 'test-user'
      };

      const evidence = await service.logControlEvidence('test-control-1', 'report-1', evidenceData);

      expect(evidence.controlId).toBe('test-control-1');
      expect(evidence.outcome).toBe('pass');
      expect(evidence.details).toBe('Control executed successfully');
      expect(evidence.executedBy).toBe('test-user');

      // Verify evidence was added to the control
      const matrix = await service.getControlMatrix('report-1');
      expect(matrix?.controls[0].evidence).toHaveLength(1);
      expect(matrix?.controls[0].evidence[0].id).toBe(evidence.id);
    });

    it('should throw error when logging evidence for non-existent control', async () => {
      await expect(service.logControlEvidence('non-existent', 'report-1', {
        executionDate: new Date(),
        outcome: 'pass',
        details: 'Test',
        executedBy: 'test-user'
      })).rejects.toThrow('Control matrix not found for report: report-1');
    });
  });

  describe('Compensating Control Expiration', () => {
    it('should create compensating control with expiration date', async () => {
      // Create an issue first
      const issueData = {
        title: 'Test Issue',
        description: 'A test issue',
        source: 'test-source',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'high' as const,
        status: 'open' as const,
        createdAt: new Date()
      };
      const issue = repository.createIssue(issueData);

      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);

      const controlData = {
        name: 'Compensating Control',
        description: 'A compensating control',
        type: 'process' as const,
        category: 'detective' as const,
        owner: 'test-owner',
        frequency: 'weekly' as const,
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual' as const,
        expirationDate
      };

      // Create an empty control matrix first
      await service.createControlMatrix('report-1', []);
      
      const control = await service.createCompensatingControl('report-1', issue.id, controlData);

      expect(control.status).toBe('compensating');
      expect(control.linkedIssueId).toBe(issue.id);
      expect(control.expirationDate).toEqual(expirationDate);
      expect(control.evidence).toHaveLength(1);
      expect(control.evidence[0].details).toContain(`Compensating control created for issue: ${issue.id}`);
    });

    it('should expire compensating control and remove it from matrix', async () => {
      // Create an issue first
      const issueData = {
        title: 'Test Issue',
        description: 'A test issue',
        source: 'test-source',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'high' as const,
        status: 'open' as const,
        createdAt: new Date()
      };
      const issue = repository.createIssue(issueData);

      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);

      const controlData = {
        name: 'Compensating Control',
        description: 'A compensating control',
        type: 'process' as const,
        category: 'detective' as const,
        owner: 'test-owner',
        frequency: 'weekly' as const,
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual' as const,
        expirationDate
      };

      // Create an empty control matrix first
      await service.createControlMatrix('report-1', []);
      
      const control = await service.createCompensatingControl('report-1', issue.id, controlData);
      
      // Verify control was created
      let matrix = await service.getControlMatrix('report-1');
      expect(matrix?.controls).toHaveLength(1);

      // Expire the control
      await service.expireCompensatingControl(control.id, 'report-1');

      // Verify control was removed
      matrix = await service.getControlMatrix('report-1');
      expect(matrix?.controls).toHaveLength(0);
    });

    it('should identify expiring compensating controls', async () => {
      // Create an issue first
      const issueData = {
        title: 'Test Issue',
        description: 'A test issue',
        source: 'test-source',
        impactedReports: ['report-1'],
        impactedCDEs: [],
        severity: 'high' as const,
        status: 'open' as const,
        createdAt: new Date()
      };
      const issue = repository.createIssue(issueData);

      // Create compensating control expiring in 5 days
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 5);

      const controlData = {
        name: 'Expiring Compensating Control',
        description: 'A compensating control that expires soon',
        type: 'process' as const,
        category: 'detective' as const,
        owner: 'test-owner',
        frequency: 'weekly' as const,
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual' as const,
        expirationDate
      };

      // Create an empty control matrix first
      await service.createControlMatrix('report-1', []);
      
      await service.createCompensatingControl('report-1', issue.id, controlData);

      // Check for controls expiring within 10 days
      const expiringControls = await service.getExpiringCompensatingControls('report-1', 10);
      expect(expiringControls).toHaveLength(1);
      expect(expiringControls[0].name).toBe('Expiring Compensating Control');

      // Check for controls expiring within 3 days (should be empty)
      const notExpiringControls = await service.getExpiringCompensatingControls('report-1', 3);
      expect(notExpiringControls).toHaveLength(0);
    });

    it('should throw error when trying to expire non-compensating control', async () => {
      const control: Control = {
        id: 'test-control-1',
        name: 'Regular Control',
        description: 'A regular control',
        type: 'process',
        category: 'preventive',
        owner: 'test-owner',
        frequency: 'monthly',
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual',
        status: 'active',
        evidence: []
      };

      await service.createControlMatrix('report-1', [control]);

      await expect(service.expireCompensatingControl('test-control-1', 'report-1'))
        .rejects.toThrow('Control test-control-1 is not a compensating control');
    });
  });

  describe('Control Framework Ingestion', () => {
    it('should ingest control framework and create new matrix', async () => {
      const frameworkControls = [
        {
          name: 'Framework Control 1',
          description: 'First framework control',
          type: 'organizational' as const,
          category: 'preventive' as const,
          owner: 'framework-owner'
        },
        {
          name: 'Framework Control 2',
          description: 'Second framework control',
          type: 'access' as const,
          category: 'detective' as const,
          owner: 'framework-owner'
        }
      ];

      const matrix = await service.ingestControlFramework('report-1', frameworkControls);

      expect(matrix.controls).toHaveLength(2);
      expect(matrix.controls[0].name).toBe('Framework Control 1');
      expect(matrix.controls[0].type).toBe('organizational');
      expect(matrix.controls[1].name).toBe('Framework Control 2');
      expect(matrix.controls[1].type).toBe('access');
    });

    it('should merge with existing control matrix', async () => {
      // Create initial control
      const initialControl: Control = {
        id: 'existing-control',
        name: 'Existing Control',
        description: 'An existing control',
        type: 'process',
        category: 'preventive',
        owner: 'existing-owner',
        frequency: 'monthly',
        linkedCDEs: [],
        linkedProcesses: [],
        automationStatus: 'manual',
        status: 'active',
        evidence: []
      };

      await service.createControlMatrix('report-1', [initialControl]);

      // Ingest framework controls
      const frameworkControls = [
        {
          name: 'Framework Control',
          description: 'A framework control',
          type: 'organizational' as const,
          category: 'detective' as const,
          owner: 'framework-owner'
        }
      ];

      const matrix = await service.ingestControlFramework('report-1', frameworkControls);

      expect(matrix.controls).toHaveLength(2);
      expect(matrix.version).toBe(2); // Version should be incremented
      expect(matrix.controls.some(c => c.name === 'Existing Control')).toBe(true);
      expect(matrix.controls.some(c => c.name === 'Framework Control')).toBe(true);
    });
  });
});