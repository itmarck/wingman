## ADDED Requirements

### Requirement: Closed semantic declaration plan
Interpretation SHALL emit only Items with Components, persisted State declarations, Automation declarations, Intent declarations, reference resolutions, and explicit local dependencies. It SHALL NOT expose product-specific workflow kinds.

#### Scenario: New domain content
- **WHEN** an Entry concerns shopping, travel, finance, health, or another domain
- **THEN** interpretation represents it by composing the same registered semantic declarations without introducing a domain request kind

#### Scenario: Unknown declaration contract
- **WHEN** provider output references an unregistered Profile, Component, operator, trigger, or Capability
- **THEN** validation rejects the draft before any declaration is published or executed

### Requirement: Declaration dependency and outcome contract
Every operational declaration SHALL have a stable Entry-local reference, optional dependencies, unresolved source values, and an idempotent outcome.

#### Scenario: Dependent declaration needs input
- **WHEN** an Automation depends on an Item declaration with unresolved required source values
- **THEN** the Item may be preserved while the Automation outcome is `needsInput` and no Intent is produced

