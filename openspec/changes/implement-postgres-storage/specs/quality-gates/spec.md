## ADDED Requirements

### Requirement: Storage adapter contract parity
Deterministic contract tests SHALL exercise shared durable-port behavior against memory and PostgreSQL without inference credentials or model calls.

#### Scenario: Adapter behavior diverges
- **WHEN** a storage implementation changes validation, ordering, pagination, conflict, or immutable-history behavior
- **THEN** the shared contract suite identifies the divergence

### Requirement: PostgreSQL durability verification
PostgreSQL integration tests SHALL verify migrations, transaction rollback, restart recovery, lease recovery, concurrent claims, lifecycle conflicts, Automation deduplication, and Intent idempotency against a dedicated test database.

#### Scenario: Compound write fails
- **WHEN** an injected failure interrupts a transactional publication
- **THEN** integration verification proves that no partial publication remains

#### Scenario: System is recreated
- **WHEN** one system instance writes a principal workflow and a new instance opens the same database
- **THEN** the second instance observes the committed workflow and can continue pending work

### Requirement: Isolated PostgreSQL test target
PostgreSQL verification SHALL require an explicit test database target, SHALL reject an unsafe production target, and SHALL keep the normal deterministic test command usable without PostgreSQL.

#### Scenario: Test database is not configured
- **WHEN** a developer runs the normal deterministic test command
- **THEN** memory tests run without attempting to connect to PostgreSQL

#### Scenario: PostgreSQL suite receives an unsafe target
- **WHEN** the configured integration target is not explicitly identified as a test database
- **THEN** the suite stops before migrations or cleanup can change it

### Requirement: Durable production smoke flow
The production smoke flow SHALL run after migrations against PostgreSQL and SHALL verify authenticated Entry processing, pending Review visibility, derived notification acknowledgement, restart persistence, and health readiness.

#### Scenario: Complete durable smoke succeeds
- **WHEN** the PostgreSQL-backed production process completes the documented smoke flow and restarts
- **THEN** API responses and persisted effects demonstrate the complete recoverable single-process workflow
