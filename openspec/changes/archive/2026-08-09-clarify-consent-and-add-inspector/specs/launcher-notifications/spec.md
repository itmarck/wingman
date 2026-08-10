## ADDED Requirements

### Requirement: Runtime-derived notification identity
Notification Capability input SHALL contain only semantic message and optional priority, while Automation, occurrence and subject identity SHALL be derived from runtime causation.

#### Scenario: Scheduled notification is instantiated
- **WHEN** an Automation produces a notification Intent
- **THEN** the launcher view derives its Automation, trigger occurrence and subject without requiring those identifiers in Capability input

#### Scenario: Notification lacks Automation context
- **WHEN** a delivered notification Intent has no Automation, trigger occurrence or subject
- **THEN** it is omitted from the launcher view instead of inventing identity
