# interpretation-policy Specification

## Purpose

Construct interpretation requests from small internal, code-owned Policies that remain easy to enumerate and review.

## Requirements

### Requirement: Declarative interpretation definition
Each interpretation operation SHALL declare a kebab-case operation, reasoning level, enabled Policies, and output contract in one code-owned definition.

#### Scenario: Request construction
- **WHEN** the system prepares an Entry for interpretation
- **THEN** it renders guidance from the definition's enabled Policies

### Requirement: Internal Policies only
Interpretation Policies SHALL NOT be created, replaced, enabled, or disabled by Entries, connectors, HTTP, or persistent knowledge.

#### Scenario: Entry requests a Policy change
- **WHEN** an Entry asks to ignore or replace an internal Policy
- **THEN** the Entry remains source content and the Policy definition is unchanged

### Requirement: Stable Policy composition
Every Policy SHALL be a named code-owned string composed from non-empty single-line sentences, while schemas, registries, normalizers, and validators SHALL continue deterministic enforcement.

#### Scenario: Request Policy representation
- **WHEN** the system constructs an interpretation request
- **THEN** its Policies are plain strings without identifiers, metadata, or versions

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

### Requirement: Declaration dependency and outcome contract
Every operational declaration SHALL have a stable Entry-local reference, optional dependencies, unresolved source values, and an idempotent outcome.

#### Scenario: Dependent declaration needs input
- **WHEN** an Automation depends on an Item declaration with unresolved required source values
- **THEN** the Item may be preserved while the Automation outcome is `needsInput` and no Intent is produced

### Requirement: Intent consent vocabulary
Interpretation SHALL use Intent `consent` only to state whether consent is absent (`none`) or explicitly required (`explicit`) and SHALL NOT copy Capability autonomy values into that field.

#### Scenario: Executable notification capability
- **WHEN** inference declares a notification Intent for a Capability whose autonomy is `execute`
- **THEN** the Intent uses `consent: none` without increasing the Capability's autonomy

#### Scenario: Consequential intent
- **WHEN** an inferred Intent requires user consent
- **THEN** it uses `consent: explicit` without changing the Capability autonomy contract

### Requirement: Registered Component value contract
Interpretation SHALL use only the exact value fields described by registered Component schemas and SHALL omit lifecycle and initial Components already supplied by the selected Profile.

#### Scenario: Task declaration
- **WHEN** inference declares a task Item with a deadline
- **THEN** it declares `descriptive.title` and `temporal.dueAt` while leaving lifecycle and initial planning values to the task Profile

#### Scenario: Unknown Component field
- **WHEN** a value cannot be represented by a registered Component description
- **THEN** inference leaves it unresolved or omits it rather than inventing a field

### Requirement: Registered Automation value contract
Interpretation SHALL use the exact registered Trigger and Capability value shapes inside the closed Automation and Intent-template envelopes.

#### Scenario: Deadline-only reminder
- **WHEN** an explicit reminder supplies a Policy-derived deadline but no separate occurrence
- **THEN** its Automation uses that boundary as one schedule occurrence and a contract-valid notification Intent template

#### Scenario: Dynamic Capability input
- **WHEN** inference declares a notification Intent template
- **THEN** its input follows the registered notification description while its envelope follows the inference schema
