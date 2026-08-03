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
The system SHALL represent ranges or constraints without inventing exact source precision and SHALL use an explicit policy for repeated reminder occurrences.

#### Scenario: Multiple reminders
- **WHEN** policy schedules reminders seven days, two days, and the same day before a deadline
- **THEN** each occurrence is evaluated independently and respects expiration, quiet hours, and occurrence limits

### Requirement: Stale reminder prevention
The system SHALL reevaluate current State before producing or executing each notification Intent.

#### Scenario: Task completed early
- **WHEN** the related task is completed before a reminder occurrence
- **THEN** the notification is not delivered and the stopping reason is recorded

### Requirement: Provider-independent notification
Notification delivery SHALL use a registered Capability and provider-independent port and SHALL preserve Intent, Attempt, delivery Event, failure, and retry information separately.

#### Scenario: Delivery fails
- **WHEN** the notification adapter reports failure
- **THEN** no delivered State is observed and retry follows Capability idempotency policy

### Requirement: Reminder explanation and control
The system SHALL explain what is being remembered, why, which Entry or subject caused it, when it will recur, and how it can be cancelled or changed.

#### Scenario: User inspects reminder
- **WHEN** the user reads an active reminder
- **THEN** the response includes subject, schedule policy, next occurrence, stopping conditions, and evidence

### Requirement: Entry workflow idempotency
Reprocessing an Entry SHALL NOT create duplicate planning subjects, reminders, Rules, or Intent templates for the same accepted workflow draft.

#### Scenario: Retry completed workflow routing
- **WHEN** the same Entry workflow is retried after a transient processing failure
- **THEN** existing workflow artifacts are reused or the duplicate is rejected without creating a second reminder occurrence
