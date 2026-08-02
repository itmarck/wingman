## Purpose

Allow Wingman to reason deterministically about current, uncertain, desired, constrained, and predicted conditions over the canonical composable knowledge model.

## ADDED Requirements

### Requirement: Explicit State modality
The system SHALL distinguish observed, believed, desired, required, forbidden, and predicted State.

#### Scenario: Desired differs from observed
- **WHEN** a task is observed as pending and completion is desired
- **THEN** both States coexist without representing the task as already completed

### Requirement: Derived State by default
The system SHALL evaluate State from current Items, Components, references, relationship Items, and time when the condition can be reconstructed without information loss.

#### Scenario: Deadline passes
- **WHEN** a pending task passes its stored deadline
- **THEN** the system evaluates it as overdue without storing a duplicate overdue fact

### Requirement: Persist non-derivable State
The system SHALL persist State when its modality, evidence, author, confidence, or historical meaning cannot be reconstructed from current structure.

#### Scenario: User states a desire
- **WHEN** the user expresses a desired outcome
- **THEN** the system preserves the desired State, its author, evidence, and time independently from whether the outcome is currently observed

### Requirement: Closed condition language
State conditions SHALL use registered, versioned, unqualified operators and SHALL reject unknown operators or incompatible operands.

#### Scenario: Unsupported condition
- **WHEN** interpretation proposes a condition operator not present in the registry
- **THEN** the State is rejected from publication rather than evaluated as free-form code

### Requirement: State projections
The system SHALL expose current, desired, required, forbidden, predicted, and unresolved State views while retaining evidence for persisted State.

#### Scenario: Read desired outcomes
- **WHEN** a consumer requests active desired State
- **THEN** the response includes applicable desired conditions and evidence without mixing observed conditions into the result

