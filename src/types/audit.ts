/**
 * Audit trail types for the Agentic Data Governance System
 */

import { ActorType } from './common.js';

/**
 * Represents an entry in the audit log
 * Validates: Requirements 1.4, 2.4, 6.2, 11.6, 12.3
 */
export interface AuditEntry {
  id: string;
  timestamp: Date;
  actor: string;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  rationale?: string;
}

/**
 * Parameters for creating an audit entry
 */
export interface CreateAuditEntryParams {
  actor: string;
  actorType: ActorType;
  action: string;
  entityType: string;
  entityId: string;
  previousState?: unknown;
  newState?: unknown;
  rationale?: string;
}
