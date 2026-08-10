## MODIFIED Requirements

### Requirement: Conditional Intent
An Intent SHALL identify a registered Capability, validated input, proposer, applicable State conditions, expected State, and consent requirement, with an optional trigger.

#### Scenario: Condition becomes stale
- **WHEN** a consented Intent's required State no longer holds before execution
- **THEN** no Attempt invokes the Capability and the stale outcome is recorded

### Requirement: Registered Capability boundary
The system SHALL execute effects only through immutable versioned Capabilities that define input, result, autonomy, safety ceiling, and idempotency contracts.

#### Scenario: Capability unavailable
- **WHEN** an Intent references an unavailable or unknown Capability
- **THEN** the Intent is reported as unsupported without pretending the effect occurred

### Requirement: Hierarchical autonomy
The system SHALL resolve autonomy from global default through Capability policy, user preference, granted explicit consent, and the Capability safety ceiling. Missing consent SHALL NOT increase authority, and no policy or consent SHALL exceed the safety ceiling.

#### Scenario: Consequential effect
- **WHEN** an effect is limited to proposal and its Intent has not received required explicit consent
- **THEN** the Intent remains unexecuted until that consent exists

#### Scenario: Consent is not required
- **WHEN** an Intent declares `consent: none`
- **THEN** it follows configured autonomy without treating absent consent as an authority increase

### Requirement: Declared Intent boundary
Interpretation and Automations SHALL create Intents only from registered Capability contracts, and declaration publication SHALL never invoke a Capability directly.

#### Scenario: Explicit external action request
- **WHEN** an Entry requests an external effect supported by a registered Capability
- **THEN** interpretation may declare a validated Intent subject to consent and autonomy without invoking its adapter

#### Scenario: Unsupported external action request
- **WHEN** no registered Capability represents the requested effect
- **THEN** the declaration outcome is unsupported and no executable operation is invented
