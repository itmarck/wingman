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
