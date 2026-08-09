## ADDED Requirements

### Requirement: Declared Intent boundary
Interpretation and Automations SHALL create Intents only from registered Capability contracts, and declaration publication SHALL never invoke a Capability directly.

#### Scenario: Explicit external action request
- **WHEN** an Entry requests an external effect supported by a registered Capability
- **THEN** interpretation may declare a validated Intent subject to authorization without invoking its adapter

#### Scenario: Unsupported external action request
- **WHEN** no registered Capability represents the requested effect
- **THEN** the declaration outcome is unsupported and no executable operation is invented

