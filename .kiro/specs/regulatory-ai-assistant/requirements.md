# Requirements Document

## Introduction

This document defines the requirements for an AI Assistant (Chatbot Interface) integrated into the Data Governance Portal. The assistant leverages the existing Regulatory Intelligence Agent (Python: `agentcore-data-governance/agents/` and TypeScript: `src/agents/regulatory-intelligence-agent.ts`) with AWS Bedrock AgentCore Memory for short-term, long-term, and episodic memory to provide conversational AI capabilities for regulatory compliance workflows. It supports natural language queries about regulatory reports (CCAR, DFAST, FR Y-14, LCR, NSFR, etc.), data lineage, quality issues, and workflow automation while maintaining human-in-the-loop oversight for critical decisions.

## Glossary

- **AI_Assistant**: The conversational chatbot interface powered by Claude AI that answers user questions and guides workflow tasks
- **Regulatory_Intelligence_Agent**: The existing agent (`RegulatoryIntelligenceAgent`) that scans regulatory sources, detects changes, and manages the report catalog
- **Governance_Orchestrator**: The existing orchestrator (`governance_orchestrator.py`) that coordinates all specialized agents through the regulatory reporting lifecycle
- **Memory_Service**: The service managing short-term, long-term, and episodic memory using AWS Bedrock AgentCore Memory
- **Short_Term_Memory**: Working memory for current conversation context (session-scoped) via AgentCore Memory
- **Long_Term_Memory**: Persistent memory for user preferences, learned patterns, and regulatory knowledge via AgentCore Memory
- **Episodic_Memory**: Memory of specific past interactions, decisions, and their outcomes via AgentCore Memory
- **Regulatory_Knowledge_Base**: Repository of regulatory guidelines, report definitions, and compliance requirements (existing `ReportCatalog`)
- **Human_Gate**: Checkpoint requiring explicit user confirmation for critical decisions (existing `HumanGate` component)
- **Tool_Call**: An action the assistant executes using existing agent tools (e.g., `regulatory_tools.py`, `lineage_tools.py`, `issue_tools.py`)
- **Access_Control_Context**: User's role and permissions determining data visibility (existing tenant/RBAC system)
- **Reference_Panel**: UI component showing sources and lineage for assistant responses

## Requirements

### Requirement 1: Conversational Interface

**User Story:** As a compliance analyst, I want to interact with an AI assistant through natural language, so that I can quickly get answers about regulatory data without navigating complex interfaces.

#### Acceptance Criteria

1. WHEN a user sends a message to the assistant, THE AI_Assistant SHALL respond within 3 seconds with streaming text output
2. WHEN the assistant processes a query, THE AI_Assistant SHALL display a typing indicator during response generation
3. WHEN a user asks about regulatory reports, THE AI_Assistant SHALL provide accurate information from the Regulatory_Knowledge_Base
4. WHEN the assistant references data, THE Reference_Panel SHALL display source citations and lineage context
5. IF the assistant cannot answer a question, THEN THE AI_Assistant SHALL acknowledge the limitation and suggest alternative approaches

### Requirement 2: Short-Term Memory (Session Context)

**User Story:** As a user, I want the assistant to remember our current conversation context, so that I can have natural follow-up questions without repeating information.

#### Acceptance Criteria

1. WHEN a user asks a follow-up question, THE Memory_Service SHALL retrieve relevant context from Short_Term_Memory
2. WHEN a conversation exceeds the context window, THE Memory_Service SHALL summarize older messages while preserving key facts
3. WHEN a user references "it" or "that report", THE AI_Assistant SHALL resolve pronouns using Short_Term_Memory context
4. WHEN a session ends, THE Short_Term_Memory SHALL be cleared for that session
5. THE Short_Term_Memory SHALL maintain conversation history for the current session (up to 50 message pairs)

### Requirement 3: Long-Term Memory (Persistent Knowledge)

**User Story:** As a returning user, I want the assistant to remember my preferences and past learnings, so that interactions become more personalized over time.

#### Acceptance Criteria

1. WHEN a user expresses a preference, THE Memory_Service SHALL store it in Long_Term_Memory
2. WHEN a user returns after a session ends, THE AI_Assistant SHALL retrieve relevant Long_Term_Memory for personalization
3. WHEN the assistant learns a new regulatory mapping, THE Long_Term_Memory SHALL persist it for future queries
4. WHEN a user asks about previously discussed topics, THE AI_Assistant SHALL reference Long_Term_Memory for continuity
5. THE Long_Term_Memory SHALL be scoped to the user and tenant for data isolation

### Requirement 4: Episodic Memory (Interaction History)

**User Story:** As a compliance manager, I want the assistant to recall specific past interactions and decisions, so that I can reference historical context for audit purposes.

#### Acceptance Criteria

1. WHEN a user asks "What did we discuss about FR Y-14 last month?", THE Memory_Service SHALL retrieve relevant Episodic_Memory
2. WHEN a critical decision is made, THE Episodic_Memory SHALL record the decision, rationale, and outcome
3. WHEN the assistant provides a recommendation, THE Episodic_Memory SHALL log the recommendation and user response
4. WHEN a user requests interaction history, THE AI_Assistant SHALL retrieve and summarize relevant episodes
5. THE Episodic_Memory SHALL maintain timestamps and user attribution for audit trails

### Requirement 5: Regulatory Knowledge Queries

**User Story:** As a data steward, I want to ask questions about regulatory requirements, so that I can understand compliance obligations without reading lengthy documents.

#### Acceptance Criteria

1. WHEN a user asks about a specific report (e.g., "What is FR Y-14M?"), THE AI_Assistant SHALL provide definition, purpose, frequency, and regulatory basis
2. WHEN a user asks about report schedules, THE AI_Assistant SHALL return accurate filing deadlines from the Regulatory_Knowledge_Base
3. WHEN a user asks about data sources for a report, THE AI_Assistant SHALL query lineage data and return source mappings
4. WHEN a user asks about regulatory changes, THE AI_Assistant SHALL reference the latest updates from the Regulatory_Knowledge_Base
5. THE Regulatory_Knowledge_Base SHALL contain comprehensive information for US (FRB, OCC, FDIC, FinCEN) and Canadian (OSFI, FINTRAC) regulatory reports

### Requirement 6: Data Quality Issue Queries

**User Story:** As a data quality analyst, I want to ask about outstanding data quality issues, so that I can quickly assess the health of regulatory submissions.

#### Acceptance Criteria

1. WHEN a user asks "Are there any outstanding DQ issues for CCAR Q1?", THE AI_Assistant SHALL query the issue repository and return relevant issues
2. WHEN displaying issues, THE AI_Assistant SHALL include severity, status, owner, and due date
3. WHEN a user asks about issue trends, THE AI_Assistant SHALL aggregate and summarize issue metrics
4. WHEN a user asks about a specific CDE's quality, THE AI_Assistant SHALL return quality scores and recent test results
5. IF no issues are found, THEN THE AI_Assistant SHALL confirm the clean status with confidence level

### Requirement 7: Lineage and Source Mapping Queries

**User Story:** As a data analyst, I want to ask about data lineage, so that I can understand how data flows into regulatory reports.

#### Acceptance Criteria

1. WHEN a user asks "What data sources feed into FR Y-14M schedule?", THE AI_Assistant SHALL query lineage and return source systems
2. WHEN displaying lineage, THE Reference_Panel SHALL show a visual lineage path
3. WHEN a user asks about upstream/downstream impacts, THE AI_Assistant SHALL trace the lineage graph and summarize impacts
4. WHEN a user asks about a specific field's origin, THE AI_Assistant SHALL return the source system, table, and transformation logic
5. THE AI_Assistant SHALL support lineage queries for all CDEs in the inventory

### Requirement 8: Workflow Automation Commands

**User Story:** As a compliance officer, I want to trigger workflows through natural language commands, so that I can initiate processes without navigating multiple screens.

#### Acceptance Criteria

1. WHEN a user says "Start the ingestion for OSFI LCR report", THE AI_Assistant SHALL invoke the Governance_Orchestrator's `start_report_cycle` tool and request confirmation
2. WHEN a workflow is triggered, THE AI_Assistant SHALL use the `get_cycle_status` tool to report progress and completion status
3. WHEN a user asks about workflow status, THE AI_Assistant SHALL query the Governance_Orchestrator and return current state
4. WHEN a workflow fails, THE AI_Assistant SHALL notify the user with error details and remediation suggestions
5. THE AI_Assistant SHALL support workflow commands for: ingestion (`start_report_cycle`), validation (`trigger_agent`), approval routing (`create_human_task`), and report generation

### Requirement 9: Human-in-the-Loop Oversight

**User Story:** As a risk manager, I want critical AI recommendations to require my confirmation, so that I maintain control over high-stakes decisions.

#### Acceptance Criteria

1. WHEN the assistant recommends a critical action (sign-off, source mapping change), THE Human_Gate SHALL require explicit user confirmation via `complete_human_task` tool
2. WHEN displaying a recommendation, THE AI_Assistant SHALL clearly distinguish AI suggestions from confirmed actions
3. WHEN a user confirms an action, THE AI_Assistant SHALL execute it via the appropriate agent tool and log the confirmation in Episodic_Memory
4. WHEN a user rejects a recommendation, THE AI_Assistant SHALL acknowledge and offer alternatives
5. THE Human_Gate SHALL apply to: report submissions (`approve_catalog`), CDE ownership changes, control effectiveness sign-offs, and source mapping modifications

### Requirement 10: Access Control and Data Authorization

**User Story:** As a security administrator, I want the assistant to respect user permissions, so that sensitive data is only accessible to authorized users.

#### Acceptance Criteria

1. WHEN a user queries data, THE AI_Assistant SHALL filter results based on Access_Control_Context
2. WHEN a user lacks permission for requested data, THE AI_Assistant SHALL inform them without revealing restricted information
3. WHEN the assistant accesses data, THE AI_Assistant SHALL log the access in the audit trail
4. THE AI_Assistant SHALL inherit role-based permissions from the user's session
5. THE AI_Assistant SHALL NOT expose data from other tenants regardless of query

### Requirement 11: Tool Execution and Transparency

**User Story:** As a user, I want to see what actions the assistant takes on my behalf, so that I understand how answers are derived.

#### Acceptance Criteria

1. WHEN the assistant executes a tool call, THE AI_Assistant SHALL display the tool name and parameters in the UI (e.g., `scan_regulatory_sources`, `get_report_catalog`)
2. WHEN a tool returns results, THE Reference_Panel SHALL show the data source and query used
3. WHEN multiple tools are called, THE AI_Assistant SHALL show the execution sequence
4. WHEN a tool call fails, THE AI_Assistant SHALL display the error and retry options
5. THE AI_Assistant SHALL integrate with existing tools: `regulatory_tools.py` (scan, detect_changes, get_report_catalog, approve_catalog), `lineage_tools.py`, `issue_tools.py`, `cde_tools.py`, `dq_rule_tools.py`, `orchestrator_tools.py`

### Requirement 12: Regulatory Report Coverage

**User Story:** As a compliance analyst, I want the assistant to have comprehensive knowledge of US and Canadian regulatory reports, so that I can get accurate information about any submission.

#### Acceptance Criteria

1. THE Regulatory_Knowledge_Base SHALL contain US Federal Reserve reports: CCAR, DFAST, FR Y-14A/Q/M, FR Y-9C, FR Y-15, FR 2052a
2. THE Regulatory_Knowledge_Base SHALL contain US liquidity reports: LCR, NSFR
3. THE Regulatory_Knowledge_Base SHALL contain US resolution and risk reports: Living Wills, SR 11-7, BCBS 239
4. THE Regulatory_Knowledge_Base SHALL contain US OCC/FDIC reports: Call Reports, Part 370 Certification
5. THE Regulatory_Knowledge_Base SHALL contain US AML reports: CTR, SAR, OFAC reports
6. THE Regulatory_Knowledge_Base SHALL contain Canadian OSFI reports: BCAR, LRR, LCR Return, NSFR Return, ICAAP
7. THE Regulatory_Knowledge_Base SHALL contain Canadian FINTRAC reports: LCTR, EFTR, STR, TPR
8. WHEN a user asks about any covered report, THE AI_Assistant SHALL provide accurate regulatory basis, frequency, and purpose

### Requirement 13: Conversation Persistence and Recovery

**User Story:** As a user, I want my conversation to persist across browser refreshes, so that I don't lose context during my work session.

#### Acceptance Criteria

1. WHEN a user refreshes the browser, THE AI_Assistant SHALL restore the current conversation from Short_Term_Memory
2. WHEN a user returns within 24 hours, THE AI_Assistant SHALL offer to continue the previous conversation
3. WHEN restoring a conversation, THE AI_Assistant SHALL summarize the previous context
4. THE Memory_Service SHALL persist conversation state to durable storage
5. WHEN a user explicitly starts a new conversation, THE Short_Term_Memory SHALL be cleared

### Requirement 14: Quick Actions and Suggestions

**User Story:** As a user, I want the assistant to suggest relevant actions, so that I can quickly access common tasks.

#### Acceptance Criteria

1. WHEN a conversation context suggests a relevant action, THE AI_Assistant SHALL display quick action buttons
2. WHEN displaying quick actions, THE AI_Assistant SHALL show up to 4 contextually relevant suggestions
3. WHEN a user clicks a quick action, THE AI_Assistant SHALL execute the corresponding query or command
4. THE AI_Assistant SHALL suggest actions based on: current page context, recent queries, and user role
5. WHEN no context is available, THE AI_Assistant SHALL show default quick actions for common tasks

### Requirement 15: Error Handling and Graceful Degradation

**User Story:** As a user, I want the assistant to handle errors gracefully, so that I can continue working even when issues occur.

#### Acceptance Criteria

1. IF the AI service is unavailable, THEN THE AI_Assistant SHALL display a friendly error message and retry option
2. IF a tool call times out, THEN THE AI_Assistant SHALL inform the user and suggest alternatives
3. IF memory retrieval fails, THEN THE AI_Assistant SHALL continue with available context and note the limitation
4. WHEN an error occurs, THE AI_Assistant SHALL log the error for debugging without exposing technical details to users
5. THE AI_Assistant SHALL implement exponential backoff for retries with a maximum of 3 attempts


### Requirement 16: Integration with Existing Agents

**User Story:** As a system architect, I want the AI Assistant to leverage existing agents, so that we maintain a single source of truth for regulatory intelligence.

#### Acceptance Criteria

1. THE AI_Assistant SHALL invoke the Regulatory_Intelligence_Agent for all regulatory report queries via `scan_regulatory_sources`, `detect_changes`, `get_report_catalog` tools
2. THE AI_Assistant SHALL invoke the Governance_Orchestrator for workflow management via `start_report_cycle`, `trigger_agent`, `create_human_task` tools
3. THE AI_Assistant SHALL use the existing `AgentCoreMemorySessionManager` for memory persistence
4. THE AI_Assistant SHALL use the existing `AgentCoreMemoryRepository` for data access
5. WHEN the assistant needs CDE information, THE AI_Assistant SHALL invoke the CDE_Identification_Agent tools
6. WHEN the assistant needs lineage information, THE AI_Assistant SHALL invoke the Lineage_Mapping_Agent tools
7. WHEN the assistant needs issue information, THE AI_Assistant SHALL invoke the Issue_Management_Agent tools
8. THE AI_Assistant SHALL respect the existing audit trail logging via `create_audit_entry`

### Requirement 17: AWS Bedrock AgentCore Memory Integration

**User Story:** As a developer, I want the AI Assistant to use AWS Bedrock AgentCore Memory, so that conversation context persists reliably across sessions.

#### Acceptance Criteria

1. THE Memory_Service SHALL use `AgentCoreMemoryConfig` for memory configuration
2. THE Memory_Service SHALL use `AgentCoreMemorySessionManager` for session management
3. WHEN a session starts, THE Memory_Service SHALL initialize with `memory_id`, `session_id`, and `actor_id`
4. THE Short_Term_Memory SHALL be stored in AgentCore Memory with session scope
5. THE Long_Term_Memory SHALL be stored in AgentCore Memory with user/tenant scope
6. THE Episodic_Memory SHALL be stored in AgentCore Memory with timestamps and actor attribution
7. WHEN memory retrieval fails, THE Memory_Service SHALL fall back to in-memory storage gracefully
