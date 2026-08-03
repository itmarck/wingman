## MODIFIED Requirements

### Requirement: Reminder interpretation
The system SHALL interpret an explicit reminder Entry into preserved Entry evidence, a referenced or new planning subject, a separate temporal constraint and reminder policy, a declarative Rule, and a notification Intent template. Processing SHALL NOT report successful workflow completion when a required reminder field remains invalid or unresolved.

#### Scenario: Reminder before a deadline
- **WHEN** the user captures a request to be reminded to complete a task before the end of the month
- **THEN** the system creates or references the task, preserves the end-of-month deadline separately from a documented reminder cadence policy, and keeps every artifact traceable to the Entry

#### Scenario: Reminder lacks a required resolved value
- **WHEN** inference cannot resolve a value required to identify the reminder subject or schedule
- **THEN** the system preserves the planning request but marks the reminder workflow as needing input and creates no executable notification Intent until resolution

#### Scenario: Event source is unavailable
- **WHEN** an Entry asks for a notification on an external Event whose source Capability is not registered
- **THEN** the request remains explainable as unsupported and no Rule, Intent, connector call, or fabricated Event is created

## ADDED Requirements

### Requirement: Entry workflow idempotency
Reprocessing an Entry SHALL NOT create duplicate planning subjects, reminders, Rules, or Intent templates for the same accepted workflow draft.

#### Scenario: Retry completed workflow routing
- **WHEN** the same Entry workflow is retried after a transient processing failure
- **THEN** existing workflow artifacts are reused or the duplicate is rejected without creating a second reminder occurrence
