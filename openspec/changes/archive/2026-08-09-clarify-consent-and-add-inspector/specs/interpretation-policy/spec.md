## MODIFIED Requirements

### Requirement: Intent consent vocabulary
Interpretation SHALL use Intent `consent` only to state whether consent is absent (`none`) or explicitly required (`explicit`) and SHALL NOT copy Capability autonomy values into that field.

#### Scenario: Executable notification capability
- **WHEN** inference declares a notification Intent for a Capability whose autonomy is `execute`
- **THEN** the Intent uses `consent: none` without increasing the Capability's autonomy

#### Scenario: Consequential intent
- **WHEN** an inferred Intent requires user consent
- **THEN** it uses `consent: explicit` without changing the Capability autonomy contract
