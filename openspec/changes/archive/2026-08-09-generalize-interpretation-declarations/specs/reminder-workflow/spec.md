## MODIFIED Requirements

### Requirement: Reminder interpretation
The system SHALL interpret an explicit reminder Entry into preserved Entry evidence, a referenced or new subject Item, one scheduled Automation, and a notification Intent template. Reminder semantics SHALL NOT require a persisted Reminder entity.

#### Scenario: Reminder before a deadline
- **WHEN** the user asks to be reminded to complete a task before the end of the month
- **THEN** the system creates or references the task, preserves its deadline separately, and creates one traceable scheduled notification Automation

#### Scenario: Reminder lacks a required resolved value
- **WHEN** inference cannot resolve a value required to identify the subject or schedule
- **THEN** the system preserves independent valid declarations, marks the Automation declaration as needing input, and creates no executable notification Intent

#### Scenario: Event source is unavailable
- **WHEN** an Entry asks for a notification on an external Event whose trigger or source is not registered
- **THEN** the declaration remains explainable as unsupported and no Automation, Intent, connector call, or fabricated Event is created

### Requirement: Repeated and imprecise timing policy
The system SHALL preserve source temporal precision and represent every explicit or recurring reminder occurrence in one Automation schedule.

#### Scenario: Multiple reminders
- **WHEN** a schedule contains multiple occurrences
- **THEN** one Automation evaluates each occurrence independently with expiration, stopping and deduplication controls

### Requirement: Reminder explanation and control
The system SHALL derive reminder views from notification Automations and SHALL control cancellation or rescheduling through the Automation lifecycle and schedule.

#### Scenario: User inspects reminder
- **WHEN** a consumer reads the reminder view
- **THEN** it receives the Automation identity, subject, message, schedule, next occurrence, stopping conditions, evidence and available controls

#### Scenario: Last occurrence finishes
- **WHEN** a reminder Automation exhausts its schedule
- **THEN** its lifecycle no longer reports an active reminder

### Requirement: Entry declaration idempotency
Reprocessing an Entry SHALL NOT create duplicate subjects, Automations, or Intent templates for the same accepted declaration references.

#### Scenario: Retry completed declaration publication
- **WHEN** an applied Entry is reprocessed
- **THEN** existing declaration outcomes are reused or duplication is rejected

## REMOVED Requirements

### Requirement: Provider-independent passive notification

**Reason**: Provider-independent notification behavior is owned by Intent execution and the notification Capability, while this capability now covers only the derived reminder experience.

**Migration**: Preserve the existing notification Capability requirement under `intent-execution`; reminder Automations continue to use it.

