# Implementation Plan: Regulatory AI Assistant

## Overview

This implementation plan covers the development of an AI Assistant (Chatbot Interface) integrated into the Data Governance Portal. The assistant leverages existing agents (Regulatory Intelligence Agent, Governance Orchestrator) with AWS Bedrock AgentCore Memory for three-tier memory (short-term, long-term, episodic) to provide conversational AI capabilities for regulatory compliance workflows.

## Tasks

- [x] 1. Set up Memory Service with AgentCore Integration
  - [x] 1.1 Create Memory Service types and interfaces
    - Define `MemoryService`, `SessionContext`, `UserPreferences`, `Episode` interfaces
    - Define `AgentCoreMemoryConfig` integration types
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 1.2 Implement Short-Term Memory (session-scoped)
    - Create `getSessionContext`, `updateSessionContext`, `clearSession` methods
    - Implement entity tracking for pronoun resolution
    - Implement context summarization when exceeding 50 message limit
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.3 Implement Long-Term Memory (user/tenant-scoped)
    - Create `getUserPreferences`, `updateUserPreferences` methods
    - Create `getLearnedKnowledge`, `storeLearnedKnowledge` methods
    - Implement tenant isolation for data scoping
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 1.4 Implement Episodic Memory (historical interactions)
    - Create `recordEpisode`, `queryEpisodes`, `getDecisionHistory` methods
    - Implement timestamp and user attribution for audit trails
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 1.5 Write property test for Memory Isolation
    - **Property 1: Memory Isolation**
    - Test that memory queries never return data from other tenants
    - Test that long-term memory is user-scoped within tenant
    - **Validates: Requirements 3.5, 10.5**

- [x] 2. Checkpoint - Ensure Memory Service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Tool Service Integration
  - [x] 3.1 Create Tool Service interface and types
    - Define `ToolService` interface with all tool methods
    - Define `ToolCall`, `ToolResult` types
    - _Requirements: 11.1, 11.5_

  - [x] 3.2 Integrate Regulatory Intelligence Agent tools
    - Implement `scanRegulatorySources`, `detectChanges`, `getReportCatalog`, `approveCatalog` wrappers
    - Connect to existing `regulatory_tools.py` via API
    - _Requirements: 16.1_

  - [x] 3.3 Integrate Governance Orchestrator tools
    - Implement `startReportCycle`, `getCycleStatus`, `triggerAgent`, `createHumanTask`, `completeHumanTask` wrappers
    - Connect to existing `orchestrator_tools.py` via API
    - _Requirements: 16.2, 8.1, 8.2, 8.3_

  - [x] 3.4 Integrate Lineage, Issue, and CDE tools
    - Implement lineage tools: `getLineageForReport`, `getLineageForCDE`, `traceImpact`
    - Implement issue tools: `getIssuesForReport`, `getIssuesForCDE`, `getIssueTrends`
    - Implement CDE tools: `getCDEDetails`, `getCDEsForReport`, `getCDEQualityScore`
    - _Requirements: 16.5, 16.6, 16.7_

  - [x] 3.5 Write property test for Tool Execution Transparency
    - **Property 3: Tool Execution Transparency**
    - Test that every tool execution is logged and displayed
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 4. Implement Assistant Service
  - [x] 4.1 Create Assistant Service core
    - Define `AssistantService` interface with `chat`, `executeTool`, `requestHumanApproval` methods
    - Implement streaming response generation
    - _Requirements: 1.1, 1.2_

  - [x] 4.2 Implement conversation context management
    - Implement `getConversationContext`, `summarizeContext` methods
    - Integrate with Memory Service for context retrieval
    - Implement pronoun resolution using session entities
    - _Requirements: 2.1, 2.3, 13.1, 13.3_

  - [x] 4.3 Implement access control enforcement
    - Filter query results based on user permissions
    - Log data access in audit trail
    - Implement tenant isolation checks
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 4.4 Write property test for Access Control Enforcement
    - **Property 4: Access Control Enforcement**
    - Test that query results are filtered by user permissions
    - Test that unauthorized access attempts are logged without data exposure
    - **Validates: Requirements 10.1, 10.2, 10.4**

- [x] 5. Checkpoint - Ensure Assistant Service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Human Gate Component
  - [x] 6.1 Create Human Gate types and service
    - Define `HumanGateAction`, `HumanGateResult` interfaces
    - Implement `requestHumanApproval` method in Assistant Service
    - Define critical action types list
    - _Requirements: 9.1, 9.5_

  - [x] 6.2 Implement Human Gate UI component
    - Create `HumanGateDialog` React component
    - Display action title, description, impact, and AI rationale
    - Implement approve/reject/defer buttons
    - _Requirements: 9.2, 9.3, 9.4_

  - [x] 6.3 Integrate Human Gate with Episodic Memory
    - Log all human gate decisions in episodic memory
    - Record decision, rationale, and outcome
    - _Requirements: 4.2, 9.3_

  - [x] 6.4 Write property test for Human Gate Enforcement
    - **Property 2: Human Gate Enforcement**
    - Test that critical actions are never executed without human approval
    - **Validates: Requirements 9.1, 9.5**

- [x] 7. Implement Chat Panel UI
  - [x] 7.1 Enhance existing ChatPanel component
    - Add `sessionId`, `userId`, `tenantId` props
    - Integrate with Memory Service for session persistence
    - Implement streaming text display with typing indicator
    - _Requirements: 1.1, 1.2, 13.1_

  - [x] 7.2 Implement Tool Call display
    - Create `ToolCallCard` component to show tool name, parameters, status
    - Display execution sequence for multiple tool calls
    - Show error and retry options for failed calls
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 7.3 Implement Reference Panel
    - Create `ReferencePanel` component for source citations
    - Display lineage context and data sources
    - Link to related entities (reports, CDEs, issues)
    - _Requirements: 1.4, 7.2, 11.2_

  - [x] 7.4 Implement Quick Actions
    - Enhance `QuickActions` component with contextual suggestions
    - Display up to 4 relevant actions based on context
    - Implement action execution on click
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 7.5 Write property test for Conversation Context Consistency
    - **Property 5: Conversation Context Consistency**
    - Test that follow-up questions resolve correctly using session context
    - Test that session restoration preserves message order
    - **Validates: Requirements 2.1, 2.3, 13.1**

- [x] 8. Checkpoint - Ensure UI component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Regulatory Knowledge Base
  - [x] 9.1 Create Regulatory Report data models
    - Define `RegulatoryReport` interface with all required fields
    - Create report frequency and due date types
    - _Requirements: 5.1, 5.2_

  - [x] 9.2 Populate US Federal Reserve reports
    - Add CCAR, DFAST, FR Y-14A/Q/M, FR Y-9C, FR Y-15, FR 2052a
    - Include definition, purpose, frequency, regulatory basis
    - _Requirements: 12.1_

  - [x] 9.3 Populate US liquidity and resolution reports
    - Add LCR, NSFR, Living Wills, SR 11-7, BCBS 239
    - Add Call Reports, Part 370 Certification
    - Add CTR, SAR, OFAC reports
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

  - [x] 9.4 Populate Canadian regulatory reports
    - Add OSFI reports: BCAR, LRR, LCR Return, NSFR Return, ICAAP
    - Add FINTRAC reports: LCTR, EFTR, STR, TPR
    - _Requirements: 12.6, 12.7_

  - [x] 9.5 Implement regulatory query handlers
    - Handle report definition queries
    - Handle schedule/deadline queries
    - Handle regulatory change queries
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. Implement Error Handling and Graceful Degradation
  - [x] 10.1 Create error handling infrastructure
    - Define `ErrorCategory` enum and `ErrorResponse` interface
    - Implement user-friendly error messages
    - _Requirements: 15.1, 15.4_

  - [x] 10.2 Implement retry strategy
    - Create `withRetry` utility with exponential backoff
    - Configure max 3 attempts with configurable delays
    - _Requirements: 15.5_

  - [x] 10.3 Implement graceful degradation
    - Fall back to local storage when memory service unavailable
    - Continue without personalization when long-term memory fails
    - Disable unavailable tools gracefully
    - _Requirements: 15.2, 15.3, 17.7_

- [x] 11. Implement Conversation Persistence
  - [x] 11.1 Implement browser refresh recovery
    - Restore conversation from Short_Term_Memory on refresh
    - Summarize previous context on restoration
    - _Requirements: 13.1, 13.3_

  - [x] 11.2 Implement session continuity
    - Offer to continue previous conversation within 24 hours
    - Clear Short_Term_Memory on explicit new conversation
    - _Requirements: 13.2, 13.5_

  - [x] 11.3 Implement durable storage persistence
    - Persist conversation state to AgentCore Memory
    - Handle persistence failures gracefully
    - _Requirements: 13.4, 17.4, 17.5, 17.6_

  - [x] 11.4 Write property test for Episodic Memory Audit Completeness
    - **Property 6: Episodic Memory Audit Completeness**
    - Test that critical decisions have complete audit trail
    - **Validates: Requirements 4.2, 4.5**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Integration and Wiring
  - [x] 13.1 Wire Assistant Service to frontend
    - Create `useAssistant` hook for React integration
    - Connect ChatPanel to Assistant Service
    - Implement streaming response handling
    - _Requirements: 1.1, 1.2_

  - [x] 13.2 Wire Tool Service to backend agents
    - Connect to existing Python agents via API endpoints
    - Implement request/response serialization
    - Handle authentication and authorization
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

  - [x] 13.3 Wire Memory Service to AgentCore
    - Configure AgentCore Memory connection
    - Implement session initialization with memory_id, session_id, actor_id
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 13.4 Integrate audit trail logging
    - Connect to existing `create_audit_entry` function
    - Log all assistant actions and tool executions
    - _Requirements: 10.3, 16.8_

- [x] 14. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks including property tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation leverages existing agents and tools rather than reimplementing functionality
