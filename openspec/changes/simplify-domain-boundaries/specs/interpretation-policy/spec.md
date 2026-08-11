## MODIFIED Requirements

### Requirement: Closed semantic declaration plan
Interpretation SHALL emit one closed Draft containing an Entry identity, one ordered collection of Item, State, Automation, and Intent declarations, optional `resolutions`, and system-owned `decisions`. Item declarations SHALL contain their Component values and MAY select a registered Profile; the Draft SHALL NOT expose parallel Item or Component publication collections, product-specific workflow kinds, or interpreter-authored decisions.

#### Scenario: New domain content
- **WHEN** an Entry concerns shopping, travel, finance, health, or another domain
- **THEN** interpretation represents it by composing the same registered semantic declarations without introducing a domain request kind

#### Scenario: Descriptive Item without a Profile
- **WHEN** an Entry provides descriptive knowledge that does not require operational behavior
- **THEN** interpretation may declare one Item with its Components and without selecting a Profile

#### Scenario: Consequential reference ambiguity
- **WHEN** interpretation cannot safely identify the Item referenced by a declaration
- **THEN** it adds a generic request to `resolutions` and leaves `decisions` to the Review lifecycle

#### Scenario: Unknown declaration contract
- **WHEN** provider output references an unregistered Profile, Component, operator, trigger, or Capability
- **THEN** validation rejects the complete Draft before any declaration is published or executed

## ADDED Requirements

### Requirement: Atomic Interpretation publication
The system SHALL validate and compile a complete Interpretation Draft into one idempotent publication outcome and SHALL commit its Items, Component revisions, State, Automations, Intents, declaration outcomes, and terminal Interpretation status atomically.

#### Scenario: Declaration cannot be published
- **WHEN** any resolved declaration fails validation or persistence
- **THEN** none of the Draft's knowledge or operational effects becomes visible and the Interpretation remains recoverable

#### Scenario: Reviewed Draft completes
- **WHEN** every required Review has supplied a valid decision
- **THEN** the system recompiles and publishes the retained Draft through the same publication boundary used by an unambiguous Interpretation

#### Scenario: Publication is retried
- **WHEN** the same Interpretation publication is retried after an uncertain result
- **THEN** stable declaration identities prevent duplicate Items, revisions, State, Automations, Intents, and outcomes
