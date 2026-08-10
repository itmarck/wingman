## ADDED Requirements

### Requirement: Intent consent vocabulary
Interpretation SHALL use Intent `authorization` only to state whether consent is absent (`none`) or explicitly required (`explicit`) and SHALL NOT copy Capability autonomy values into that field.

#### Scenario: Executable notification capability
- **WHEN** inference declares a notification Intent for a Capability whose autonomy is `execute`
- **THEN** the Intent uses `authorization: none` rather than `authorization: execute`

#### Scenario: Consequential intent
- **WHEN** an inferred Intent requires user consent
- **THEN** it uses `authorization: explicit` without changing the Capability autonomy contract

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
