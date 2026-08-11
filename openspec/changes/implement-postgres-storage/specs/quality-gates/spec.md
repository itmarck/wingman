## ADDED Requirements

### Requirement: Boundary-focused verification
Verification SHALL separate pure domain behavior, PostgreSQL persistence behavior, deterministic Interpretation/inference behavior, and complete HTTP integration so each behavior is tested at the narrowest boundary that provides confidence without duplicating it across storage implementations.

#### Scenario: Domain rule is verified
- **WHEN** validation, an invariant, or a deterministic lifecycle decision does not require persistence or a live model
- **THEN** a fast test verifies it without starting PostgreSQL or calling inference infrastructure

#### Scenario: Interpretation integration is verified
- **WHEN** Interpretation request construction, structured output validation, retry classification, or orchestration is tested
- **THEN** deterministic model fixtures provide reproducible results without consuming model tokens

#### Scenario: Model quality is evaluated
- **WHEN** the semantic quality of a configured model must be measured
- **THEN** an explicit evaluation runs separately from deterministic domain, persistence, and HTTP gates

### Requirement: Focused PostgreSQL adapter contracts
PostgreSQL contract tests SHALL verify the observable behavior of every durable port against native PostgreSQL 18.4 and SHALL avoid repeating domain scenarios that do not depend on persistence semantics.

#### Scenario: Adapter behavior diverges
- **WHEN** a PostgreSQL adapter changes hydration, ordering, pagination, atomicity, conflict, or immutable-history behavior
- **THEN** a focused adapter contract identifies the divergence through the domain port

### Requirement: PostgreSQL durability verification
PostgreSQL integration tests SHALL verify migrations, transaction rollback, restart recovery, lease recovery, concurrent claims, lifecycle conflicts, Automation deduplication, and Intent idempotency against a harness-owned ephemeral PostgreSQL 18.4 process.

#### Scenario: Compound write fails
- **WHEN** an injected failure interrupts a transactional publication
- **THEN** integration verification proves that no partial publication remains

#### Scenario: System is recreated
- **WHEN** one system instance writes a principal workflow and a new instance opens the same database
- **THEN** the second instance observes the committed workflow and can continue pending work

### Requirement: Self-contained PostgreSQL test target
PostgreSQL verification SHALL start and stop native PostgreSQL 18.4 through `embedded-postgres`, SHALL use harness-generated temporary storage and loopback connectivity, SHALL NOT consume the configured application `DATABASE_URL`, and SHALL keep the fast deterministic test command usable without PostgreSQL.

#### Scenario: Test database is not configured
- **WHEN** a developer runs the fast deterministic test command
- **THEN** pure domain and deterministic Interpretation/inference tests run without attempting to connect to PostgreSQL or a live model

#### Scenario: PostgreSQL suite starts
- **WHEN** a developer runs the dedicated PostgreSQL test command
- **THEN** the harness starts PostgreSQL 18.4 on a generated local target, applies repository migrations, isolates test data, and removes its temporary cluster after completion

#### Scenario: Application database is configured
- **WHEN** `DATABASE_URL` points to a development, staging, or production database while PostgreSQL tests run
- **THEN** the harness ignores it and only migrates, queries, and cleans the cluster it created

### Requirement: Minimal complete HTTP integration
A small PostgreSQL-backed HTTP suite SHALL run after migrations against the harness-owned PostgreSQL 18.4 process with deterministic inference and SHALL verify the critical cross-boundary workflows without duplicating exhaustive domain or adapter coverage.

#### Scenario: Captured Entry survives restart
- **WHEN** an authenticated client captures an Entry, deterministic Interpretation commits its publication, and the application is recreated against the same harness database
- **THEN** the API exposes the original Entry, terminal Interpretation state, and published durable knowledge without reprocessing the completed work

#### Scenario: Review completes publication
- **WHEN** deterministic Interpretation produces a pending Review and an authenticated client resolves it
- **THEN** the API exposes one completed resolution and its atomic durable publication after restart

#### Scenario: Durable execution is acknowledged
- **WHEN** an Automation produces a consented notification Intent and the worker executes it
- **THEN** the API exposes one durable Attempt and Event, allows acknowledgement through the launcher view, and does not duplicate the capability effect after restart

#### Scenario: Suggestion transition remains consistent
- **WHEN** an authenticated client accepts a Suggestion associated with an Intent
- **THEN** the API exposes consistent Suggestion feedback and Intent consent after restart without either side committing alone

#### Scenario: HTTP suite changes storage bootstrap
- **WHEN** PostgreSQL composition becomes available during the migration
- **THEN** the same storage-independent HTTP test bodies switch from the transitional characterization fixture to harness-owned PostgreSQL and the memory bootstrap is removed
