## ADDED Requirements

### Requirement: Configured storage selection
The composition root SHALL select storage from trusted process configuration, production SHALL use PostgreSQL, and memory storage SHALL remain available for development, tests, and isolated evaluation.

#### Scenario: Production starts with PostgreSQL
- **WHEN** production configuration is valid and the database is reachable
- **THEN** the system composes every durable port from the PostgreSQL storage bundle

#### Scenario: Production requests memory storage
- **WHEN** a production process is configured with memory storage
- **THEN** startup fails before accepting HTTP or background work

### Requirement: Migration and readiness gate
Production SHALL run repository migrations as a deployment step and SHALL NOT become ready when the database is unreachable or its schema is behind the application requirement.

#### Scenario: Schema is current
- **WHEN** the deployment migration succeeds and the database accepts readiness checks
- **THEN** the process may expose readiness and begin polling work

#### Scenario: Migration fails
- **WHEN** the deployment cannot apply a required migration
- **THEN** the new application version does not start against the incomplete schema

## MODIFIED Requirements

### Requirement: Single-process lifecycle
One process SHALL own HTTP serving, interpretation polling, Automation evaluation, Intent execution, and one shared PostgreSQL pool, and SHALL stop accepting work and close owned resources during shutdown.

#### Scenario: Process receives shutdown
- **WHEN** the production process receives a termination signal
- **THEN** polling, HTTP, system resources, and the shared database pool close once through one coordinated lifecycle

#### Scenario: Startup fails after database creation
- **WHEN** a later runtime component fails to start
- **THEN** every already-created resource is closed without leaking the database pool

### Requirement: Railway service contract
The repository SHALL define a Railway-compatible migration, build, start, health, readiness, and restart contract for one service with a configurable bounded database pool.

#### Scenario: Railway deploys the service
- **WHEN** Railway runs the configured deployment lifecycle
- **THEN** migrations complete before one process exposes health, readiness, HTTP, and background work

#### Scenario: Database is temporarily unavailable
- **WHEN** the running service loses its database connection
- **THEN** readiness reports unavailable, failures remain observable, and no memory fallback is activated
