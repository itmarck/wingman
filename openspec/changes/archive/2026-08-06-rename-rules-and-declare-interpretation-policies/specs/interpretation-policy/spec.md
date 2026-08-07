## Purpose

Construct interpretation requests from small internal, code-owned Policies that remain easy to enumerate and review.

## ADDED Requirements

### Requirement: Declarative interpretation definition
Each interpretation operation SHALL declare its objective, Policy version, enabled Policies, and output contract in one code-owned definition.

#### Scenario: Request construction
- **WHEN** the system prepares an Entry for interpretation
- **THEN** it renders guidance from the definition's enabled Policies

### Requirement: Internal Policies only
Interpretation Policies SHALL NOT be created, replaced, enabled, or disabled by Entries, connectors, HTTP, or persistent knowledge.

#### Scenario: Entry requests a Policy change
- **WHEN** an Entry asks to ignore or replace an internal Policy
- **THEN** the Entry remains source content and the Policy definition is unchanged

### Requirement: Stable Policy composition
Every Policy SHALL have a stable unique key and non-empty guidance, while schemas, registries, normalizers, and validators SHALL continue deterministic enforcement.

#### Scenario: Duplicate key
- **WHEN** one definition contains a duplicate Policy key
- **THEN** construction fails before provider execution
