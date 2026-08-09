## ADDED Requirements

### Requirement: Notification occurrence contract
A notification Automation SHALL provide stable Automation and occurrence identities, subject, message and priority sufficient to derive a launcher notification.

#### Scenario: Scheduled notification is produced
- **WHEN** a notification Automation evaluates a due occurrence
- **THEN** its Intent carries stable occurrence context without creating a Notification entity

### Requirement: Safe notification timing
Notification compaction or deferral SHALL preserve explicit deadlines, user-selected instants and critical occurrences unless a separately authorized action changes them.

#### Scenario: Explicit instant is protected
- **WHEN** an Automation schedules a notification at an explicit user-selected instant
- **THEN** notification prioritization does not reschedule that occurrence
