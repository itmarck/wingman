## MODIFIED Requirements

### Requirement: Autonomy-controlled assistance
Proactive behavior SHALL resolve global, Capability and user autonomy independently from explicit Intent consent and SHALL NOT exceed the Capability safety ceiling.

#### Scenario: Suggestion and execution differ
- **WHEN** the same risk could produce a notification or a consequential external mutation
- **THEN** each Intent follows its own Capability policy and the mutation is not executed without required consent
