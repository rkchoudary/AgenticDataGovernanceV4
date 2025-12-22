// Re-export types from hooks for convenience
export type { User } from '@/stores'
export type { Cycle } from '@/hooks/useCycles'
export type { CDE } from '@/hooks/useCDEs'
export type { Issue } from '@/hooks/useIssues'
export type { Notification } from '@/hooks/useNotifications'
export type { Tenant } from '@/hooks/useTenant'
export type { ChatMessage, ToolCall } from '@/stores'

// Workflow Wizard types
export * from './workflow-wizard'

// Common types
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type Status = 'active' | 'pending' | 'completed' | 'cancelled'
export type ArtifactStatus = 'draft' | 'pending_review' | 'approved' | 'rejected'

export interface AuditEntry {
  id: string
  timestamp: string
  actor: string
  actorType: 'agent' | 'human' | 'system'
  action: string
  entityType: string
  entityId: string
  previousState?: unknown
  newState?: unknown
  rationale?: string
}
