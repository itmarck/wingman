## ADDED Requirements

### Requirement: Profile-owned operational semantics
A Profile SHALL be the single versioned contract for an operational Item's required and optional Components, initial Component values, lifecycle states and transitions, and persisted State templates. Profile behavior SHALL remain declarative and SHALL NOT invoke adapters.

#### Scenario: Task declaration is initialized
- **WHEN** interpretation declares an Item using the registered task Profile with a title and no schedule
- **THEN** Profile initialization creates a valid pending Item with empty dependencies and does not invent temporal information

#### Scenario: Objective declaration derives desired State
- **WHEN** interpretation declares an objective Item
- **THEN** Profile initialization creates its initial lifecycle and progress Components and a desired State backed by the same Entry

#### Scenario: Profile contract version changes
- **WHEN** incompatible initialization or lifecycle semantics are introduced
- **THEN** they are registered under a new Profile version and existing Items retain their original contract

