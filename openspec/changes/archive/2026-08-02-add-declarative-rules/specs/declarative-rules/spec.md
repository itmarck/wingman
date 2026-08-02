## Purpose

Enable deterministic reactive behavior through a small declarative language that can observe time, Events, and State while producing only validated Intents.

## ADDED Requirements

### Requirement: Given When Then contract
A Rule SHALL define zero or more Given conditions, exactly one When trigger, and one or more Then Intent templates. Then SHALL be instantiated only after When occurs and Given evaluates as satisfied.

#### Scenario: Given is false
- **WHEN** a Rule trigger occurs while one required Given condition is false
- **THEN** the Rule produces no Intent and records the evaluation reason

### Requirement: Closed trigger and condition language
Given and When SHALL use registered immutable versioned operators for State, Event, and time evaluation and SHALL reject free-form executable expressions.

#### Scenario: Unknown trigger operator
- **WHEN** a Rule contains an unregistered When operator
- **THEN** registration is rejected before the Rule can become active

### Requirement: Explicit scheduling policies
Rules SHALL represent relative schedules, repetition, expiration, cooldown, occurrence limits, stopping conditions, priority, and deduplication explicitly.

#### Scenario: Repeated schedule stops
- **WHEN** a repeated Rule reaches its stopping State or occurrence limit
- **THEN** no later occurrence produces an Intent

### Requirement: Dependency-driven evaluation
The system SHALL evaluate Rules from declared State and Event dependencies or calculated next evaluation time without scanning all knowledge.

#### Scenario: Unrelated State changes
- **WHEN** State unrelated to a Rule changes
- **THEN** the Rule is not needlessly reevaluated

### Requirement: Rules cannot execute effects
Then clauses SHALL only instantiate validated Intents and SHALL NOT invoke Capabilities, adapters, or mutate State directly.

#### Scenario: Unsupported Then effect
- **WHEN** a Rule proposes an unregistered Capability
- **THEN** no effect occurs and the unsupported Intent outcome remains explainable

