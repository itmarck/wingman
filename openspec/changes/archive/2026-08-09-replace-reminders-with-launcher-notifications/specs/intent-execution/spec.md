## ADDED Requirements

### Requirement: Notification outcomes remain independent
Notification delivery and acknowledgement SHALL be distinct immutable Events and SHALL NOT establish completion State for the subject Item.

#### Scenario: Notification is acknowledged
- **WHEN** a delivered notification is acknowledged
- **THEN** the acknowledgement Event references its notification Intent and no subject completion action is invoked
