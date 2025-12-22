# Requirements Document: Step-by-Step Workflow Wizard UI

## Introduction

This document specifies the requirements for a guided step-by-step workflow wizard UI that walks users through the complete regulatory reporting cycle. The wizard provides a linear, focused experience that guides users through each phase of the governance workflow, showing progress, handling human checkpoints, and integrating with AI agents at each step.

## Glossary

- **Workflow Wizard**: A guided, step-by-step interface that walks users through a multi-phase process
- **Phase**: A major stage in the regulatory reporting cycle (e.g., Regulatory Intelligence, Data Requirements)
- **Step**: An individual action or task within a phase
- **Checkpoint**: A human approval gate that pauses the workflow until authorized
- **Progress Indicator**: Visual element showing completion status across all phases
- **Agent Panel**: UI component showing AI agent activity and recommendations
- **Context Sidebar**: Persistent panel showing relevant information for the current step

## Requirements

### Requirement 1: Workflow Wizard Shell

**User Story:** As a compliance officer, I want a dedicated wizard interface that guides me through the entire regulatory reporting cycle, so that I can complete all required steps without missing any critical actions.

#### Acceptance Criteria

1. WHEN a user starts a new report cycle THEN the Workflow Wizard SHALL display a full-screen wizard interface with a horizontal progress stepper showing all 9 phases: Regulatory Intelligence, Data Requirements, CDE Identification, Data Quality Rules, Lineage Mapping, Issue Management, Controls Management, Documentation, and Attestation
2. WHEN viewing the wizard THEN the system SHALL display the current phase prominently with a clear title, description, and estimated time to complete
3. WHEN a phase is complete THEN the progress stepper SHALL show a checkmark icon and green color for that phase
4. WHEN a phase is blocked THEN the progress stepper SHALL show a lock icon and gray color with a tooltip explaining the blocking condition
5. WHEN the user is on any step THEN the system SHALL display a persistent context sidebar showing: current report name, cycle deadline, overall progress percentage, and quick links to related artifacts

### Requirement 2: Phase Navigation and Flow Control

**User Story:** As a data steward, I want clear navigation between workflow phases, so that I can move forward when ready and go back to review previous work if needed.

#### Acceptance Criteria

1. WHEN a user completes all steps in a phase THEN the system SHALL enable a "Continue to Next Phase" button with the next phase name displayed
2. WHEN a user clicks "Continue to Next Phase" THEN the system SHALL validate all required actions are complete before proceeding
3. WHEN validation fails THEN the system SHALL display a modal listing incomplete items with links to each item
4. WHEN a user wants to review a previous phase THEN the system SHALL allow navigation back via the progress stepper without losing current progress
5. WHEN navigating back THEN the system SHALL display a read-only view of completed phases with an "Edit" option that requires confirmation

### Requirement 3: Regulatory Intelligence Phase

**User Story:** As a compliance officer, I want the wizard to guide me through reviewing AI-detected regulatory changes, so that I can approve catalog updates with full context.

#### Acceptance Criteria

1. WHEN entering the Regulatory Intelligence phase THEN the system SHALL display a step list: Scan Results Review, Change Analysis, Catalog Updates, and Stakeholder Approval
2. WHEN viewing Scan Results THEN the system SHALL display a card for each detected change showing: source, change type, confidence score, and AI summary
3. WHEN reviewing a change THEN the system SHALL display a side-by-side diff view with current vs. proposed values
4. WHEN all changes are reviewed THEN the system SHALL enable the approval step with a summary of accepted/rejected changes
5. WHEN approving THEN the system SHALL capture digital signature and rationale before allowing progression

### Requirement 4: Data Requirements Phase

**User Story:** As a data steward, I want the wizard to guide me through validating data element mappings, so that I can ensure all regulatory requirements are properly sourced.

#### Acceptance Criteria

1. WHEN entering the Data Requirements phase THEN the system SHALL display a step list: Template Parsing Review, Source Mapping Validation, Gap Analysis, and Document Approval
2. WHEN viewing mappings THEN the system SHALL display a hierarchical tree of data elements with status indicators (Mapped/Gap/Validated)
3. WHEN a data gap exists THEN the system SHALL highlight the element and provide resolution options: Manual Map, Flag for Later, or Create Data Request
4. WHEN validating a mapping THEN the system SHALL display sample data preview from the source field
5. WHEN all elements are addressed THEN the system SHALL calculate and display a completion percentage before allowing progression

### Requirement 5: CDE Identification Phase

**User Story:** As a data governance lead, I want the wizard to guide me through reviewing AI-identified CDEs, so that I can approve the inventory and assign owners efficiently.

#### Acceptance Criteria

1. WHEN entering the CDE Identification phase THEN the system SHALL display a step list: Scoring Review, Inventory Approval, Ownership Assignment, and Reconciliation
2. WHEN reviewing a CDE THEN the system SHALL display a radar chart showing the four scoring factors with AI rationale
3. WHEN a CDE has no owner THEN the system SHALL block progression until an owner is assigned
4. WHEN assigning an owner THEN the system SHALL provide a searchable user directory with role filtering
5. WHEN reconciling with existing lists THEN the system SHALL display a three-column comparison view with bulk action controls

### Requirement 6: Data Quality Rules Phase

**User Story:** As a data steward, I want the wizard to guide me through configuring quality rules for each CDE, so that I can ensure appropriate validation coverage.

#### Acceptance Criteria

1. WHEN entering the Data Quality Rules phase THEN the system SHALL display a step list: Rule Review, Threshold Configuration, Coverage Validation, and Rule Activation
2. WHEN reviewing rules THEN the system SHALL display AI-generated rules as cards with dimension, logic, and suggested threshold
3. WHEN configuring thresholds THEN the system SHALL display an interactive histogram with a draggable threshold line showing impact preview
4. WHEN viewing coverage THEN the system SHALL display a heatmap matrix of CDEs vs. dimensions highlighting gaps
5. WHEN activating rules THEN the system SHALL require confirmation and display the execution schedule

### Requirement 7: Lineage Mapping Phase

**User Story:** As a data architect, I want the wizard to guide me through reviewing and enriching data lineage, so that I can ensure complete traceability from source to report.

#### Acceptance Criteria

1. WHEN entering the Lineage Mapping phase THEN the system SHALL display a step list: Pipeline Scan Review, Business Term Linking, Impact Analysis Setup, and Lineage Approval
2. WHEN viewing lineage THEN the system SHALL display an interactive graph with zoom, pan, and node expansion controls
3. WHEN linking business terms THEN the system SHALL provide a glossary search with auto-suggest based on node metadata
4. WHEN setting up impact analysis THEN the system SHALL allow configuration of notification rules for source changes
5. WHEN approving lineage THEN the system SHALL generate a lineage diagram export for documentation

### Requirement 8: Issue Management Phase

**User Story:** As a data steward, I want the wizard to guide me through resolving any open issues before proceeding, so that I can ensure data quality meets requirements.

#### Acceptance Criteria

1. WHEN entering the Issue Management phase THEN the system SHALL display a step list: Issue Triage, Root Cause Analysis, Resolution Implementation, and Verification
2. WHEN triaging issues THEN the system SHALL display issues sorted by severity with AI-suggested priorities
3. WHEN analyzing root cause THEN the system SHALL display AI suggestions with confidence scores and similar historical issues
4. WHEN implementing resolution THEN the system SHALL require documentation of the fix and evidence attachment
5. WHEN critical issues exist THEN the system SHALL block progression to the next phase until resolved or escalated

### Requirement 9: Controls Management Phase

**User Story:** As a risk manager, I want the wizard to guide me through verifying control effectiveness, so that I can ensure governance controls are operating properly.

#### Acceptance Criteria

1. WHEN entering the Controls Management phase THEN the system SHALL display a step list: Control Status Review, Evidence Collection, Compensating Control Check, and Effectiveness Sign-off
2. WHEN reviewing controls THEN the system SHALL display a status board with pass/fail indicators for each control
3. WHEN collecting evidence THEN the system SHALL provide upload functionality with metadata tagging
4. WHEN compensating controls exist THEN the system SHALL display expiration warnings and require renewal confirmation
5. WHEN signing off THEN the system SHALL capture attestation that all controls are operating effectively

### Requirement 10: Documentation Phase

**User Story:** As a regulatory reporting manager, I want the wizard to guide me through reviewing all generated documentation, so that I can ensure the compliance package is complete.

#### Acceptance Criteria

1. WHEN entering the Documentation phase THEN the system SHALL display a step list: Artifact Review, Annotation Resolution, BCBS 239 Mapping, and Package Compilation
2. WHEN reviewing artifacts THEN the system SHALL display an embedded document viewer with annotation tools
3. WHEN annotations exist THEN the system SHALL require resolution of all flagged items before progression
4. WHEN viewing BCBS 239 mapping THEN the system SHALL display a compliance matrix with evidence links
5. WHEN compiling the package THEN the system SHALL generate a consolidated PDF with table of contents

### Requirement 11: Attestation Phase

**User Story:** As a senior executive, I want the wizard to present a clear attestation interface, so that I can formally approve the submission with full understanding of what I'm attesting to.

#### Acceptance Criteria

1. WHEN entering the Attestation phase THEN the system SHALL display a step list: Executive Summary Review, Compliance Checklist, Digital Attestation, and Submission Confirmation
2. WHEN reviewing the summary THEN the system SHALL display key metrics: data quality score, issue resolution rate, control pass rate, and deadline status
3. WHEN viewing the checklist THEN the system SHALL display all required attestation items with acknowledgment checkboxes
4. WHEN capturing attestation THEN the system SHALL require digital signature with identity verification
5. WHEN confirming submission THEN the system SHALL lock all artifacts and generate a submission receipt

### Requirement 12: AI Agent Integration Panel

**User Story:** As any user, I want to see AI agent activity and interact with agents during the workflow, so that I can leverage AI assistance while maintaining oversight.

#### Acceptance Criteria

1. WHEN an AI agent is active THEN the system SHALL display an agent panel showing: agent name, current action, progress indicator, and activity log
2. WHEN an agent completes a task THEN the system SHALL display a summary of results with confidence scores
3. WHEN an agent requires input THEN the system SHALL display a prompt with clear options and context
4. WHEN viewing agent recommendations THEN the system SHALL clearly distinguish AI-generated content with visual indicators
5. WHEN an agent encounters an error THEN the system SHALL display the error with retry and manual override options

### Requirement 13: Progress Persistence and Recovery

**User Story:** As any user, I want my progress to be saved automatically, so that I can resume the workflow from where I left off if interrupted.

#### Acceptance Criteria

1. WHEN a user completes any step THEN the system SHALL automatically save progress to the server
2. WHEN a user returns to an in-progress workflow THEN the system SHALL restore their position and display a "Resume" prompt
3. WHEN a session times out THEN the system SHALL preserve all unsaved work and prompt re-authentication
4. WHEN multiple users are assigned to a workflow THEN the system SHALL display real-time collaboration indicators showing who is working on which step
5. WHEN a conflict occurs THEN the system SHALL display a resolution interface showing both versions

### Requirement 14: Help and Guidance System

**User Story:** As a new user, I want contextual help available at every step, so that I can understand what's required without leaving the workflow.

#### Acceptance Criteria

1. WHEN viewing any step THEN the system SHALL display a help icon that opens a contextual help panel
2. WHEN help is opened THEN the system SHALL display: step description, required actions, common issues, and video tutorial link
3. WHEN a user hovers over any field THEN the system SHALL display a tooltip with field description and validation rules
4. WHEN a user makes an error THEN the system SHALL display inline validation messages with correction guidance
5. WHEN a user is stuck THEN the system SHALL provide a "Request Assistance" button that creates a support ticket with context

### Requirement 15: Mobile-Responsive Wizard

**User Story:** As an approver on the go, I want to complete approval steps from my mobile device, so that I don't block the workflow when away from my desk.

#### Acceptance Criteria

1. WHEN accessing the wizard on mobile THEN the system SHALL display a simplified single-column layout optimized for touch
2. WHEN viewing the progress stepper on mobile THEN the system SHALL collapse to show only current and adjacent phases
3. WHEN approving on mobile THEN the system SHALL support touch-based signature capture
4. WHEN reviewing documents on mobile THEN the system SHALL provide pinch-to-zoom and swipe navigation
5. WHEN connectivity is limited THEN the system SHALL queue actions for sync when connection is restored
