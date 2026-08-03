## ADDED Requirements

### Requirement: Captured planning request routing
The system SHALL route an explicitly captured task, objective, plan, or habit request through the registered planning operations after validating a closed workflow draft, while retaining the Entry as evidence.

#### Scenario: Capture an unscheduled call
- **WHEN** an Entry states “Tengo que llamar a Ana para agendar una cita” after the caller has materialized its input values
- **THEN** processing creates one pending unscheduled task backed by that Entry and does not invent a date, notification, Rule, or external effect

#### Scenario: Caller sends an unmaterialized template
- **WHEN** a caller still has a placeholder such as `{name}`
- **THEN** the caller must resolve it before capture rather than expecting Wingman to interpret template syntax

#### Scenario: Capture a daily practice
- **WHEN** an Entry requests a recurring practice without an exact clock time
- **THEN** processing creates a habit with the stated recurrence constraint and does not invent a time of day

### Requirement: Closed workflow draft selection
Interpreters SHALL select only workflow kinds and fields supplied by the system context; unsupported or malformed workflow drafts SHALL fail interpretation without partially executing an action.

#### Scenario: Interpreter invents an operation
- **WHEN** an interpreter returns an unregistered workflow kind or an external effect not present in the supplied contract
- **THEN** processing rejects the draft and creates no planning Item, Rule, Intent, or adapter call
