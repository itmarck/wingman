# task-planning Specification

## Purpose

Provide native composable planning for commitments, objectives, plans, habits, dependencies, schedules, and progress on top of the canonical Item and State models.

## Requirements

### Requirement: Typed planning compositions
The system SHALL provide immutable unqualified Profiles and closed Components for tasks, objectives, plans, habits, assignment, temporal constraints, dependencies, and progress.

#### Scenario: Unscheduled task
- **WHEN** the user records a task without a date
- **THEN** the task remains valid and pending without an invented schedule

### Requirement: Profile-specific lifecycle
Each operational planning Profile SHALL define its allowed lifecycle values and transitions, and the system SHALL reject invalid transitions.

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

