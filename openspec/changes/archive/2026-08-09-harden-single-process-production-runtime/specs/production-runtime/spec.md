## Purpose

Define a compact production process with predictable lifecycle, provider-neutral configuration and failure-aware retry behavior suitable for Railway.

## ADDED Requirements

### Requirement: Single-process lifecycle
One process SHALL own HTTP serving, interpretation polling, Automation evaluation and Intent execution, and SHALL stop accepting work and close owned resources during shutdown.

#### Scenario: Process receives shutdown
- **WHEN** the production process receives a termination signal
- **THEN** polling, HTTP and owned resources close through one coordinated lifecycle

### Requirement: Classified inference retries
Inference processing SHALL make at most three total attempts and SHALL schedule increasing delays according to transient outage, quota or invalid-response classification.

#### Scenario: Provider is unavailable
- **WHEN** inference fails because the provider or network is temporarily unavailable
- **THEN** the system schedules the next of at most two retries with an outage-appropriate increasing delay

#### Scenario: Quota response supplies timing
- **WHEN** a quota or rate-limit response provides retry timing
- **THEN** the next attempt is not scheduled before that provider timing

#### Scenario: Model output is invalid
- **WHEN** the provider responds successfully with invalid structured output
- **THEN** the system retries with shorter increasing delays and retains the invalid-response classification

#### Scenario: Configuration is invalid
- **WHEN** authentication, target selection or configuration is invalid
- **THEN** processing fails without an automatic retry or provider fallback

### Requirement: Provider-neutral target selection
Infrastructure configuration SHALL select exactly one registered inference target and SHALL NOT expose provider-specific concepts to the domain or automatically fall back to another target.

#### Scenario: Selected target fails
- **WHEN** the selected inference target returns a terminal error
- **THEN** the failure remains visible and no other target is invoked

### Requirement: Configurable mutation boundary
Development SHALL default the system mutation policy to approval, missing HTTP mutation headers SHALL remain readonly, and production SHALL be able to select write through configuration.

#### Scenario: Mutation header is omitted
- **WHEN** an authenticated request omits its mutation mode header
- **THEN** the request is evaluated as readonly regardless of the configured system maximum

### Requirement: Railway service contract
The repository SHALL define a Railway-compatible build, start, health and restart contract for the single service.

#### Scenario: Railway starts the service
- **WHEN** the deployment platform builds and starts the configured service
- **THEN** one process exposes its health endpoint and runs background work
