# task-planning Specification

## Purpose

Provide native composable planning for commitments, objectives, plans, habits, dependencies, schedules, and progress on top of the canonical Item and State models.

## Requirements

### Requirement: Typed planning compositions
The system SHALL provide immutable unqualified Profiles whose contracts contain the required and optional Components, initial values, lifecycle transitions and persisted State templates for tasks, objectives, plans and habits.

#### Scenario: Unscheduled task
- **WHEN** the user records a task without a date
- **THEN** the task remains valid and pending without an invented schedule

### Requirement: Profile-specific lifecycle
Each operational planning Profile SHALL declaratively define its initial lifecycle and allowed transitions, and the system SHALL reject invalid transitions.

#### Scenario: Completed task is reopened
- **WHEN** a supported reopen operation is applied to a completed task
- **THEN** the task transitions according to its Profile while preserving the completion history

### Requirement: Objective and plan structure
Tasks and plans SHALL reference the objectives they serve through typed fields, and dependencies SHALL be represented through validated planning references.

#### Scenario: Dependency blocks next action
- **WHEN** a task depends on an incomplete task
- **THEN** it is not exposed as an actionable next step and its blocker remains identifiable

### Requirement: Planning State and progress
The system SHALL represent desired outcomes through State and SHALL derive current progress and blockers from planning Items and their history.

#### Scenario: Objective has no next step
- **WHEN** an active objective has no incomplete unblocked task
- **THEN** the planning view identifies that no actionable next step exists

### Requirement: Planning projections
The system SHALL expose pending, blocked, overdue, unscheduled, actionable, and completed planning views without losing Item identity or evidence.

#### Scenario: Read actionable work
- **WHEN** a consumer requests actionable tasks
- **THEN** the result excludes completed and blocked tasks and explains relevant deadlines and objectives

### Requirement: Captured planning declaration
The system SHALL represent an explicitly captured task, objective, plan, or habit as an Item declaration using a registered Profile while retaining the Entry as evidence.

#### Scenario: Capture an unscheduled call
- **WHEN** an Entry states “Tengo que llamar a Ana para agendar una cita” after the caller has materialized its input values
- **THEN** processing creates one pending unscheduled task backed by that Entry and does not invent a date, notification, Automation, Intent, or adapter effect

#### Scenario: Caller sends an unmaterialized template
- **WHEN** a caller still has a placeholder such as `{name}`
- **THEN** the caller must resolve it before capture rather than expecting Wingman to interpret template syntax

#### Scenario: Capture a daily practice
- **WHEN** an Entry requests a recurring practice without an exact clock time
- **THEN** processing creates a habit with the stated recurrence constraint and does not invent a time of day

### Requirement: Closed planning declaration selection
Interpreters SHALL use only registered Profile and Component contracts supplied by the system context; unsupported or malformed declarations SHALL fail interpretation without partially executing an action.

#### Scenario: Interpreter invents an operation
- **WHEN** an interpreter returns a product-specific workflow kind or an external effect outside the registered declaration contracts
- **THEN** processing rejects the draft and creates no planning Item, Automation, Intent, or adapter call
