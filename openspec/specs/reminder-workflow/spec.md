# reminder-workflow Specification

## Purpose

Deliver a complete, safe reminder workflow that turns captured requests and planning State into scheduled notification Intents with auditable delivery outcomes.

## Requirements

### Requirement: Reminder interpretation
The system SHALL interpret an explicit reminder request into preserved Entry evidence, a referenced or new subject, temporal constraint, declarative Rule, and notification Intent template.

#### Scenario: Reminder before a deadline
- **WHEN** the user asks to be reminded to complete a task before the end of the month
- **THEN** the deadline and reminder policy remain distinct and traceable to the Entry

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

