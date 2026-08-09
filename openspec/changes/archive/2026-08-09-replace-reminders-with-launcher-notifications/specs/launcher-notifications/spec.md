## Purpose

Provide the launcher with a compact, explainable inbox derived from existing execution facts rather than a separate notification record.

## ADDED Requirements

### Requirement: Derived active notification view
The system SHALL derive active notifications from notification Automations, Intents and Events and SHALL NOT persist a Notification entity.

#### Scenario: Launcher lists notifications
- **WHEN** the launcher requests active notifications
- **THEN** it receives only derived delivered notices that have not been acknowledged

### Requirement: Notification inspection
Each notification SHALL expose stable identity, subject, message, priority, occurrence, evidence and available actions.

#### Scenario: Launcher inspects a notification
- **WHEN** the launcher reads an active notification by identity
- **THEN** the system returns its derived explanation without creating new knowledge

### Requirement: Independent acknowledgement
The launcher SHALL be able to acknowledge a notification, and acknowledgement SHALL NOT complete or otherwise mutate the notification subject.

#### Scenario: User acknowledges a notice
- **WHEN** the launcher acknowledges an active notification
- **THEN** the acknowledgement is recorded as an immutable observed outcome and the notice leaves the active view

### Requirement: Compact prioritization
The active view SHALL minimize interruptions by deduplicating equivalent notices and suppressing lower-priority notices when a more important notice for the same subject is active.

#### Scenario: Redundant notices are active
- **WHEN** multiple delivered notices represent the same subject and actionable message
- **THEN** the launcher receives only the highest-priority relevant notice

#### Scenario: Protected schedule
- **WHEN** a notice represents an explicit deadline, user-selected instant or critical priority
- **THEN** the system does not defer or move its occurrence without authorization
