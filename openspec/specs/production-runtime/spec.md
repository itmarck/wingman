# production-runtime Specification

## Purpose

Define a compact production process with predictable lifecycle, provider-neutral configuration and failure-aware retry behavior suitable for Railway.

## Requirements

### Requirement: Single-process lifecycle
One process SHALL own HTTP serving, interpretation polling, Automation evaluation, Intent execution, and one shared PostgreSQL pool, and SHALL stop accepting work and close owned resources during shutdown.

#### Scenario: Process receives shutdown
- **WHEN** the production process receives a termination signal
- **THEN** polling, HTTP, system resources, and the shared database pool close once through one coordinated lifecycle

#### Scenario: Startup fails after database creation
- **WHEN** a later runtime component fails to start
- **THEN** every already-created resource is closed without leaking the database pool

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
The repository SHALL define a Railway-compatible migration, build, start, health, readiness, and restart contract for one service using PostgreSQL 18.4 with a configurable bounded database pool.

#### Scenario: Railway deploys the service
- **WHEN** Railway runs the configured deployment lifecycle
- **THEN** migrations complete before one process exposes health, readiness, HTTP, and background work

#### Scenario: Database is temporarily unavailable
- **WHEN** the running service loses its database connection
- **THEN** readiness reports unavailable, failures remain observable, and no memory fallback is activated

### Requirement: PostgreSQL runtime storage
The composition root SHALL use PostgreSQL for every complete application runtime and SHALL NOT expose memory as an alternative complete storage backend or automatic fallback.

#### Scenario: Production starts with PostgreSQL
- **WHEN** production configuration is valid and the database is reachable
- **THEN** the system composes every durable port from the PostgreSQL storage bundle

#### Scenario: Runtime database is unavailable
- **WHEN** a complete application runtime cannot initialize PostgreSQL storage
- **THEN** startup fails before accepting HTTP or background work instead of composing volatile stores

### Requirement: Migration and readiness gate
Production SHALL run repository migrations as a deployment step and SHALL NOT become ready when the database is unreachable or its schema is behind the application requirement.

#### Scenario: Schema is current
- **WHEN** the deployment migration succeeds and the database accepts readiness checks
- **THEN** the process may expose readiness and begin polling work

#### Scenario: Migration fails
- **WHEN** the deployment cannot apply a required migration
- **THEN** the new application version does not start against the incomplete schema
