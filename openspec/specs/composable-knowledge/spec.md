# composable-knowledge Specification

## Purpose

Provide one canonical, evidence-backed, composable knowledge model that replaces Concepts, Predicates, Axioms, and Links while preserving Wingman's immutable sources and uncertainty handling.

## Requirements

### Requirement: Immutable source preservation
The system SHALL preserve every captured Entry verbatim with its origin and capture time and SHALL allow derived structure to reference exact supported source locations.

#### Scenario: Interpretation changes
- **WHEN** derived knowledge from an Entry is corrected
- **THEN** the Entry remains unchanged and both the replacement structure and its evidence remain traceable

### Requirement: Stable composable Items
The system SHALL represent identifiable knowledge as stable Items composed from closed, versioned Component schemas. Component and Profile keys SHALL be globally unique unqualified names without namespace separators.

#### Scenario: Item gains information
- **WHEN** new evidence adds a valid Component to an existing Item
- **THEN** the Item retains its identity and the new Component is validated and revisioned

#### Scenario: Registration collision
- **WHEN** a different contract is registered under an existing key and version
- **THEN** registration is rejected without overwriting the existing contract

### Requirement: Validated composition
The system SHALL enforce Profile requirements for operational or relationship Items and SHALL permit registered descriptive knowledge without a specialized Profile.

#### Scenario: Invalid composition
- **WHEN** a proposed Item omits a Component required by its Profile
- **THEN** publication is rejected with a validation reason

### Requirement: Controlled Item connections
The system SHALL use typed Item references for schema-defined connections and relationship Items when a connection has participants, roles, attributes, evidence, validity, or history. Interpretation SHALL NOT create arbitrary operational predicates.

#### Scenario: Rich employment knowledge
- **WHEN** an Entry describes an employee, employer, role, and validity period
- **THEN** the system preserves those participants and details together as a relationship Item

### Requirement: Evidence-backed revision and conflict
Every derived Component revision and relationship Item SHALL retain provenance, recorded time, applicable valid time, and candidate status. Conflicting candidates SHALL be preserved and consequential ambiguity SHALL use the generic Review flow.

#### Scenario: Conflicting current values
- **WHEN** two Entries support incompatible current values
- **THEN** neither candidate is discarded or selected solely by arrival order and unresolved uncertainty is exposed for Review

### Requirement: One canonical knowledge model
After migration in this change, all supported knowledge writes and reads SHALL use Entries, Items, Components, typed references, and relationship Items without requiring Concepts, Predicates, Axioms, or Links.

#### Scenario: Migration completes
- **WHEN** semantic parity, source fidelity, and current-view tests pass
- **THEN** the system no longer exposes or writes legacy knowledge entities and retains no runtime dependency on them

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
