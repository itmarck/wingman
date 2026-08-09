# intent-execution Specification

## Purpose

Provide a safe executable boundary that replaces the minimal Intent model and keeps proposals, authorization, attempts, occurrences, and observed outcomes distinct.

## Requirements

### Requirement: Conditional Intent
An Intent SHALL identify a registered Capability, validated input, proposer, applicable State conditions, expected State, and authorization policy, with an optional trigger.

#### Scenario: Condition becomes stale
- **WHEN** an authorized Intent's required State no longer holds before execution
- **THEN** no Attempt invokes the Capability and the stale outcome is recorded

### Requirement: Registered Capability boundary
The system SHALL execute effects only through immutable versioned Capabilities that define input, result, authorization, safety ceiling, and idempotency contracts.

#### Scenario: Capability unavailable
- **WHEN** an Intent references an unavailable or unknown Capability
- **THEN** the Intent is reported as unsupported without pretending the effect occurred

### Requirement: Hierarchical autonomy
The system SHALL resolve autonomy from global default through Capability policy, user preference, explicit authorization, and the Capability safety ceiling. More specific policy SHALL be allowed to narrow authority but SHALL NOT exceed the safety ceiling.

#### Scenario: Consequential effect
- **WHEN** a global policy allows execution but the Capability safety ceiling requires explicit authorization
- **THEN** the Intent remains unexecuted until that authorization exists

### Requirement: Attempts and Events remain distinct
Every execution SHALL create an immutable Attempt associated with its Intent, and external signals or outcomes SHALL be recorded as immutable Events. An Attempt SHALL NOT establish expected State without supporting outcome evidence.

#### Scenario: Adapter reports failure
- **WHEN** a Capability Attempt fails
- **THEN** the failed Attempt remains inspectable and expected State is not marked observed

### Requirement: Safe retry and idempotency
Retries SHALL create distinct Attempts under the same Intent while reusing the Capability's stable idempotency identity when required.

#### Scenario: Result is uncertain
- **WHEN** the worker retries after losing the first result
- **THEN** it avoids repeating an already completed effect and preserves every Attempt

### Requirement: Legacy Intent replacement
After migration in this change, supported action proposals SHALL use the new Intent lifecycle and SHALL NOT depend on the previous minimal Intent entity or store contract.

#### Scenario: Migration completes
- **WHEN** equivalent proposal behavior and new lifecycle tests pass
- **THEN** the previous Intent implementation is removed within this change

### Requirement: Declared Intent boundary
Interpretation and Automations SHALL create Intents only from registered Capability contracts, and declaration publication SHALL never invoke a Capability directly.

#### Scenario: Explicit external action request
- **WHEN** an Entry requests an external effect supported by a registered Capability
- **THEN** interpretation may declare a validated Intent subject to authorization without invoking its adapter

#### Scenario: Unsupported external action request
- **WHEN** no registered Capability represents the requested effect
- **THEN** the declaration outcome is unsupported and no executable operation is invented
