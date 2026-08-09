## ADDED Requirements

### Requirement: Production runtime verification
Deterministic tests SHALL cover classified retry timing, three-attempt exhaustion, terminal configuration failures and coordinated runtime shutdown.

#### Scenario: Runtime behavior regresses
- **WHEN** retry classification or lifecycle ownership changes incompatibly
- **THEN** the deterministic quality gate fails with focused evidence

### Requirement: Launcher production smoke flow
A local production smoke test SHALL authenticate as the launcher and exercise Entry creation, processing, pending Review visibility, derived notification acknowledgement and health.

#### Scenario: Complete smoke flow succeeds
- **WHEN** a developer runs the documented smoke scenario with valid local configuration
- **THEN** API responses and derived effects demonstrate the complete single-process flow
