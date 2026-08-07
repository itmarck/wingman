## MODIFIED Requirements

### Requirement: Repeated and imprecise timing policy
The system SHALL preserve source temporal precision and use explicit schedules for repeated passive reminder availability.

#### Scenario: Multiple reminders
- **WHEN** a schedule contains multiple occurrences
- **THEN** each occurrence is evaluated independently with expiration and occurrence limits but no quiet hours

### Requirement: Provider-independent passive notification
Notification delivery SHALL create or update a passive launcher item through a registered Capability and port, preserve auditable outcomes, and SHALL NOT model sounds, vibration, banners, foreground presentation, or quiet hours.

#### Scenario: Notification becomes available
- **WHEN** a notification Intent succeeds
- **THEN** the item is available when the user opens the launcher without interrupting the user

### Requirement: Entry workflow idempotency
Reprocessing an Entry SHALL NOT create duplicate planning subjects, reminders, Automations, or Intent templates for the same accepted workflow draft.

#### Scenario: Retry completed workflow routing
- **WHEN** an applied Entry workflow is retried
- **THEN** existing artifacts are reused or duplication is rejected
