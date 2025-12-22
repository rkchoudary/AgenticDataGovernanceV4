/**
 * Workflow Engine for the Agentic Data Governance System
 * Manages task scheduling, deadline alerting, and submission checklists
 * 
 * Implements Requirements 2.1, 2.5
 */

import { v4 as uuidv4 } from 'uuid';
import { IWorkflowEngine, ChecklistItem } from '../interfaces/services.js';
import { IGovernanceRepository } from '../repository/index.js';
import { ReportFrequency } from '../types/common.js';

/**
 * Scheduled task in the workflow
 */
export interface ScheduledTask {
  id: string;
  cycleId: string;
  taskType: string;
  dueDate: Date;
  owner: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Submission checklist for a report cycle
 */
export interface SubmissionChecklist {
  id: string;
  reportId: string;
  cycleId: string;
  items: ChecklistItem[];
  createdAt: Date;
  status: 'in_progress' | 'completed';
}

/**
 * Deadline alert configuration
 */
export interface DeadlineAlertConfig {
  warningThresholdDays: number;
  criticalThresholdDays: number;
  escalationThresholdDays: number;
}

/**
 * Checklist template for different report types
 */
interface ChecklistTemplate {
  reportType: ReportFrequency;
  items: {
    description: string;
    ownerRole: string;
    daysBeforeDeadline: number;
  }[];
}


/**
 * Default checklist templates per report type
 * Implements Requirements 2.1: Generate submission checklist with all required tasks
 */
const DEFAULT_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    reportType: 'daily',
    items: [
      { description: 'Verify data extraction completion', ownerRole: 'data_steward', daysBeforeDeadline: 1 },
      { description: 'Run data quality validations', ownerRole: 'data_steward', daysBeforeDeadline: 1 },
      { description: 'Review and resolve critical issues', ownerRole: 'data_governance_lead', daysBeforeDeadline: 1 },
      { description: 'Final submission approval', ownerRole: 'regulatory_reporting_manager', daysBeforeDeadline: 0 }
    ]
  },
  {
    reportType: 'weekly',
    items: [
      { description: 'Verify data extraction completion', ownerRole: 'data_steward', daysBeforeDeadline: 3 },
      { description: 'Run data quality validations', ownerRole: 'data_steward', daysBeforeDeadline: 3 },
      { description: 'Review lineage documentation', ownerRole: 'data_architect', daysBeforeDeadline: 2 },
      { description: 'Review and resolve critical issues', ownerRole: 'data_governance_lead', daysBeforeDeadline: 2 },
      { description: 'Management review', ownerRole: 'compliance_officer', daysBeforeDeadline: 1 },
      { description: 'Final submission approval', ownerRole: 'regulatory_reporting_manager', daysBeforeDeadline: 0 }
    ]
  },
  {
    reportType: 'monthly',
    items: [
      { description: 'Verify data extraction completion', ownerRole: 'data_steward', daysBeforeDeadline: 10 },
      { description: 'Run data quality validations', ownerRole: 'data_steward', daysBeforeDeadline: 10 },
      { description: 'Review CDE inventory', ownerRole: 'data_governance_lead', daysBeforeDeadline: 7 },
      { description: 'Review lineage documentation', ownerRole: 'data_architect', daysBeforeDeadline: 7 },
      { description: 'Review and resolve critical issues', ownerRole: 'data_governance_lead', daysBeforeDeadline: 5 },
      { description: 'Control effectiveness review', ownerRole: 'risk_manager', daysBeforeDeadline: 5 },
      { description: 'Management review', ownerRole: 'compliance_officer', daysBeforeDeadline: 3 },
      { description: 'CFO attestation', ownerRole: 'cfo', daysBeforeDeadline: 2 },
      { description: 'Final submission approval', ownerRole: 'regulatory_reporting_manager', daysBeforeDeadline: 0 }
    ]
  },
  {
    reportType: 'quarterly',
    items: [
      { description: 'Verify data extraction completion', ownerRole: 'data_steward', daysBeforeDeadline: 20 },
      { description: 'Run data quality validations', ownerRole: 'data_steward', daysBeforeDeadline: 20 },
      { description: 'Review CDE inventory', ownerRole: 'data_governance_lead', daysBeforeDeadline: 15 },
      { description: 'Review lineage documentation', ownerRole: 'data_architect', daysBeforeDeadline: 15 },
      { description: 'Review and resolve critical issues', ownerRole: 'data_governance_lead', daysBeforeDeadline: 10 },
      { description: 'Control effectiveness review', ownerRole: 'risk_manager', daysBeforeDeadline: 10 },
      { description: 'BCBS 239 compliance mapping review', ownerRole: 'compliance_officer', daysBeforeDeadline: 7 },
      { description: 'Management review', ownerRole: 'compliance_officer', daysBeforeDeadline: 5 },
      { description: 'CFO attestation', ownerRole: 'cfo', daysBeforeDeadline: 3 },
      { description: 'Final submission approval', ownerRole: 'regulatory_reporting_manager', daysBeforeDeadline: 0 }
    ]
  },
  {
    reportType: 'annual',
    items: [
      { description: 'Verify data extraction completion', ownerRole: 'data_steward', daysBeforeDeadline: 30 },
      { description: 'Run data quality validations', ownerRole: 'data_steward', daysBeforeDeadline: 30 },
      { description: 'Review CDE inventory', ownerRole: 'data_governance_lead', daysBeforeDeadline: 25 },
      { description: 'Review lineage documentation', ownerRole: 'data_architect', daysBeforeDeadline: 25 },
      { description: 'Review and resolve critical issues', ownerRole: 'data_governance_lead', daysBeforeDeadline: 20 },
      { description: 'Control effectiveness review', ownerRole: 'risk_manager', daysBeforeDeadline: 20 },
      { description: 'BCBS 239 compliance mapping review', ownerRole: 'compliance_officer', daysBeforeDeadline: 15 },
      { description: 'Internal audit review', ownerRole: 'internal_auditor', daysBeforeDeadline: 10 },
      { description: 'Management review', ownerRole: 'compliance_officer', daysBeforeDeadline: 7 },
      { description: 'CFO attestation', ownerRole: 'cfo', daysBeforeDeadline: 5 },
      { description: 'Final submission approval', ownerRole: 'regulatory_reporting_manager', daysBeforeDeadline: 0 }
    ]
  }
];


/**
 * Implementation of the Workflow Engine
 */
export class WorkflowEngine implements IWorkflowEngine {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private checklists: Map<string, SubmissionChecklist> = new Map();
  private alertConfig: DeadlineAlertConfig;

  constructor(
    private repository: IGovernanceRepository,
    alertConfig?: Partial<DeadlineAlertConfig>
  ) {
    this.alertConfig = {
      warningThresholdDays: alertConfig?.warningThresholdDays ?? 7,
      criticalThresholdDays: alertConfig?.criticalThresholdDays ?? 3,
      escalationThresholdDays: alertConfig?.escalationThresholdDays ?? 1
    };
  }

  /**
   * Schedules a task for a report cycle
   * Implements Requirements 2.1: Generate submission checklist with tasks and target dates
   */
  async scheduleTask(cycleId: string, taskType: string, dueDate: Date): Promise<string> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const task: ScheduledTask = {
      id: uuidv4(),
      cycleId,
      taskType,
      dueDate,
      owner: this.getDefaultOwnerForTaskType(taskType),
      status: 'pending',
      createdAt: new Date()
    };

    this.scheduledTasks.set(task.id, task);

    // Log the task scheduling
    this.repository.createAuditEntry({
      actor: 'workflow_engine',
      actorType: 'system',
      action: 'schedule_task',
      entityType: 'ScheduledTask',
      entityId: task.id,
      newState: task
    });

    return task.id;
  }

  /**
   * Gets deadline alerts for a cycle
   * Implements Requirements 2.5: Send escalating alerts when deadline approaches
   */
  async getDeadlineAlerts(cycleId: string): Promise<{ taskId: string; dueDate: Date; daysRemaining: number; alertLevel: 'warning' | 'critical' | 'escalation' }[]> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const alerts: { taskId: string; dueDate: Date; daysRemaining: number; alertLevel: 'warning' | 'critical' | 'escalation' }[] = [];
    const now = new Date();

    // Check scheduled tasks
    for (const task of this.scheduledTasks.values()) {
      if (task.cycleId !== cycleId || task.status === 'completed') {
        continue;
      }

      const daysRemaining = this.calculateDaysRemaining(now, task.dueDate);
      
      if (daysRemaining <= this.alertConfig.escalationThresholdDays) {
        alerts.push({
          taskId: task.id,
          dueDate: task.dueDate,
          daysRemaining,
          alertLevel: 'escalation'
        });
      } else if (daysRemaining <= this.alertConfig.criticalThresholdDays) {
        alerts.push({
          taskId: task.id,
          dueDate: task.dueDate,
          daysRemaining,
          alertLevel: 'critical'
        });
      } else if (daysRemaining <= this.alertConfig.warningThresholdDays) {
        alerts.push({
          taskId: task.id,
          dueDate: task.dueDate,
          daysRemaining,
          alertLevel: 'warning'
        });
      }
    }

    // Check checklist items
    for (const checklist of this.checklists.values()) {
      if (checklist.cycleId !== cycleId) {
        continue;
      }

      for (const item of checklist.items) {
        if (item.completed) {
          continue;
        }

        const daysRemaining = this.calculateDaysRemaining(now, item.dueDate);
        
        if (daysRemaining <= this.alertConfig.escalationThresholdDays) {
          alerts.push({
            taskId: item.id,
            dueDate: item.dueDate,
            daysRemaining,
            alertLevel: 'escalation'
          });
        } else if (daysRemaining <= this.alertConfig.criticalThresholdDays) {
          alerts.push({
            taskId: item.id,
            dueDate: item.dueDate,
            daysRemaining,
            alertLevel: 'critical'
          });
        } else if (daysRemaining <= this.alertConfig.warningThresholdDays) {
          alerts.push({
            taskId: item.id,
            dueDate: item.dueDate,
            daysRemaining,
            alertLevel: 'warning'
          });
        }
      }
    }

    // Sort by days remaining (most urgent first)
    alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return alerts;
  }


  /**
   * Generates a submission checklist for a report cycle
   * Implements Requirements 2.1: Generate submission checklist with all required tasks
   */
  async generateSubmissionChecklist(reportId: string, cycleId: string): Promise<ChecklistItem[]> {
    const cycle = this.repository.getCycleInstance(cycleId);
    if (!cycle) {
      throw new Error(`Cycle ${cycleId} not found`);
    }

    const catalog = this.repository.getReportCatalog();
    if (!catalog) {
      throw new Error('Report catalog not found');
    }

    const report = catalog.reports.find(r => r.id === reportId);
    if (!report) {
      throw new Error(`Report ${reportId} not found in catalog`);
    }

    // Get the template for this report type
    const template = this.getChecklistTemplate(report.frequency);
    
    // Calculate the submission deadline
    const submissionDeadline = this.calculateSubmissionDeadline(cycle.periodEnd, report.dueDate);

    // Generate checklist items from template
    const items: ChecklistItem[] = template.items.map(templateItem => ({
      id: uuidv4(),
      description: templateItem.description,
      owner: templateItem.ownerRole,
      dueDate: this.calculateItemDueDate(submissionDeadline, templateItem.daysBeforeDeadline),
      completed: false
    }));

    // Create and store the checklist
    const checklist: SubmissionChecklist = {
      id: uuidv4(),
      reportId,
      cycleId,
      items,
      createdAt: new Date(),
      status: 'in_progress'
    };

    this.checklists.set(checklist.id, checklist);

    // Log the checklist creation
    this.repository.createAuditEntry({
      actor: 'workflow_engine',
      actorType: 'system',
      action: 'generate_checklist',
      entityType: 'SubmissionChecklist',
      entityId: checklist.id,
      newState: checklist
    });

    return items;
  }

  /**
   * Updates the status of a checklist item
   * Implements Requirements 2.1: Track checklist status
   */
  async updateChecklistStatus(checklistId: string, itemId: string, completed: boolean): Promise<void> {
    const checklist = this.checklists.get(checklistId);
    if (!checklist) {
      throw new Error(`Checklist ${checklistId} not found`);
    }

    const item = checklist.items.find(i => i.id === itemId);
    if (!item) {
      throw new Error(`Checklist item ${itemId} not found`);
    }

    const previousState = { ...item };

    item.completed = completed;
    if (completed) {
      item.completedAt = new Date();
    } else {
      item.completedAt = undefined;
      item.completedBy = undefined;
    }

    // Check if all items are completed
    const allCompleted = checklist.items.every(i => i.completed);
    if (allCompleted) {
      checklist.status = 'completed';
    }

    // Log the status update
    this.repository.createAuditEntry({
      actor: 'workflow_engine',
      actorType: 'system',
      action: 'update_checklist_item',
      entityType: 'ChecklistItem',
      entityId: itemId,
      previousState,
      newState: item
    });
  }

  /**
   * Gets a scheduled task by ID
   */
  getScheduledTask(taskId: string): ScheduledTask | undefined {
    return this.scheduledTasks.get(taskId);
  }

  /**
   * Gets all scheduled tasks for a cycle
   */
  getScheduledTasksForCycle(cycleId: string): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values())
      .filter(task => task.cycleId === cycleId);
  }

  /**
   * Gets a checklist by ID
   */
  getChecklist(checklistId: string): SubmissionChecklist | undefined {
    return this.checklists.get(checklistId);
  }

  /**
   * Gets all checklists for a cycle
   */
  getChecklistsForCycle(cycleId: string): SubmissionChecklist[] {
    return Array.from(this.checklists.values())
      .filter(checklist => checklist.cycleId === cycleId);
  }

  /**
   * Completes a scheduled task
   */
  async completeTask(taskId: string): Promise<void> {
    const task = this.scheduledTasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const previousState = { ...task };
    task.status = 'completed';
    task.completedAt = new Date();

    this.repository.createAuditEntry({
      actor: 'workflow_engine',
      actorType: 'system',
      action: 'complete_task',
      entityType: 'ScheduledTask',
      entityId: taskId,
      previousState,
      newState: task
    });
  }

  /**
   * Marks overdue tasks
   */
  async markOverdueTasks(): Promise<string[]> {
    const now = new Date();
    const overdueTasks: string[] = [];

    for (const task of this.scheduledTasks.values()) {
      if (task.status === 'pending' || task.status === 'in_progress') {
        if (task.dueDate < now) {
          const previousState = { ...task };
          task.status = 'overdue';
          overdueTasks.push(task.id);

          this.repository.createAuditEntry({
            actor: 'workflow_engine',
            actorType: 'system',
            action: 'mark_overdue',
            entityType: 'ScheduledTask',
            entityId: task.id,
            previousState,
            newState: task
          });
        }
      }
    }

    return overdueTasks;
  }


  /**
   * Gets the checklist template for a report type
   */
  private getChecklistTemplate(frequency: ReportFrequency): ChecklistTemplate {
    const template = DEFAULT_CHECKLIST_TEMPLATES.find(t => t.reportType === frequency);
    if (!template) {
      // Return a default template for unknown frequencies
      return {
        reportType: frequency,
        items: [
          { description: 'Verify data extraction completion', ownerRole: 'data_steward', daysBeforeDeadline: 5 },
          { description: 'Run data quality validations', ownerRole: 'data_steward', daysBeforeDeadline: 5 },
          { description: 'Review and resolve critical issues', ownerRole: 'data_governance_lead', daysBeforeDeadline: 3 },
          { description: 'Management review', ownerRole: 'compliance_officer', daysBeforeDeadline: 2 },
          { description: 'Final submission approval', ownerRole: 'regulatory_reporting_manager', daysBeforeDeadline: 0 }
        ]
      };
    }
    return template;
  }

  /**
   * Calculates the submission deadline based on period end and due date rule
   */
  private calculateSubmissionDeadline(periodEnd: Date, dueDate: { daysAfterPeriodEnd: number; businessDaysOnly: boolean; timezone: string }): Date {
    const deadline = new Date(periodEnd);
    
    if (dueDate.businessDaysOnly) {
      // Add business days only
      let daysAdded = 0;
      while (daysAdded < dueDate.daysAfterPeriodEnd) {
        deadline.setDate(deadline.getDate() + 1);
        const dayOfWeek = deadline.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          daysAdded++;
        }
      }
    } else {
      deadline.setDate(deadline.getDate() + dueDate.daysAfterPeriodEnd);
    }

    return deadline;
  }

  /**
   * Calculates the due date for a checklist item
   */
  private calculateItemDueDate(submissionDeadline: Date, daysBeforeDeadline: number): Date {
    const dueDate = new Date(submissionDeadline);
    dueDate.setDate(dueDate.getDate() - daysBeforeDeadline);
    return dueDate;
  }

  /**
   * Calculates days remaining until a due date
   */
  private calculateDaysRemaining(now: Date, dueDate: Date): number {
    const diffTime = dueDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Gets the default owner for a task type
   */
  private getDefaultOwnerForTaskType(taskType: string): string {
    const ownerMap: Record<string, string> = {
      'data_extraction': 'data_steward',
      'data_validation': 'data_steward',
      'cde_review': 'data_governance_lead',
      'lineage_review': 'data_architect',
      'issue_resolution': 'data_governance_lead',
      'control_review': 'risk_manager',
      'compliance_review': 'compliance_officer',
      'attestation': 'cfo',
      'submission_approval': 'regulatory_reporting_manager'
    };

    return ownerMap[taskType] || 'data_steward';
  }
}
