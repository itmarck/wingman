# reminder-workflow Specification

## Purpose

Deliver a complete, safe reminder workflow that turns captured requests and planning State into scheduled notification Intents with auditable delivery outcomes.

## Requirements

### Requirement: Reminder interpretation
The system SHALL interpret an explicit reminder Entry into preserved Entry evidence, a referenced or new planning subject, a separate temporal constraint and reminder policy, a declarative Rule, and a notification Intent template. Processing SHALL NOT report successful workflow completion when a required reminder field remains invalid or unresolved.

#### Scenario: Reminder before a deadline
- **WHEN** the user asks to be reminded to complete a task before the end of the month
- **THEN** the system creates or references the task, preserves the end-of-month deadline separately from a documented reminder cadence policy, and keeps every artifact traceable to the Entry

#### Scenario: Reminder lacks a required resolved value
- **WHEN** inference cannot resolve a value required to identify the reminder subject or schedule
- **THEN** the system preserves the planning request but marks the reminder workflow as needing input and creates no executable notification Intent until resolution

#### Scenario: Event source is unavailable
- **WHEN** an Entry asks for a notification on an external Event whose source Capability is not registered
- **THEN** the request remains explainable as unsupported and no Rule, Intent, connector call, or fabricated Event is created

### Requirement: Repeated and imprecise timing policy
The system SHALL preserve source temporal precision and use explicit schedules for repeated passive reminder availability.

#### Scenario: Multiple reminders
- **WHEN** a schedule contains multiple occurrences
- **THEN** each occurrence is evaluated independently with expiration and occurrence limits but no quiet hours

### Requirement: Stale reminder prevention
The system SHALL reevaluate current State before producing or executing each notification Intent.

#### Scenario: Task completed early
- **WHEN** the related task is completed before a reminder occurrence
- **THEN** the notification is not delivered and the stopping reason is recorded

### Requirement: Provider-independent passive notification
Notification delivery SHALL create or update a passive launcher item through a registered Capability and port, preserve auditable outcomes, and SHALL NOT model sounds, vibration, banners, foreground presentation, or quiet hours.

#### Scenario: Notification becomes available
- **WHEN** a notification Intent succeeds
- **THEN** the item is available when the user opens the launcher without interrupting the user

### Requirement: Reminder explanation and control
The system SHALL explain what is being remembered, why, which Entry or subject caused it, when it will recur, and how it can be cancelled or changed.

#### Scenario: User inspects reminder
- **WHEN** the user reads an active reminder
- **THEN** the response includes subject, schedule policy, next occurrence, stopping conditions, and evidence

### Requirement: Entry workflow idempotency
Reprocessing an Entry SHALL NOT create duplicate planning subjects, reminders, Automations, or Intent templates for the same accepted workflow draft.

#### Scenario: Retry completed workflow routing
- **WHEN** an applied Entry workflow is retried
- **THEN** existing artifacts are reused or duplication is rejected
