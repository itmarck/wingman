## Context

See `proposal.md` for motivation. PostgreSQL currently owns inference telemetry, while `createSystem` selects memory Knowledge and Interpretation stores and constructs State, Automation, Execution, and Suggestion stores directly. Interpretation now compiles one complete plan and its memory lifecycle atomically persists knowledge, State, Automations, Intents, outcomes, and terminal status. `SystemStorage` does not yet describe that full durable boundary, and the database abstraction exposes queries but not transactions.

The production target remains one Railway process and one PostgreSQL database. The real database contains no required data and will be recreated by the user before the baseline is applied, so neither schema nor migration-history compatibility is required.

## Goals / Non-Goals

**Goals:**

- Make storage selection a composition concern and keep module operations dependent only on ports.
- Recover all committed domain facts and pending work after restart.
- Preserve atomic publication, concurrency safety, immutable history, and current API behavior.
- Keep one shared pool, one process, and a generic schema with no use-case tables.

**Non-Goals:**

- Persist code-owned registries, derived projections, detectors, caches, or pending approval callbacks.
- Migrate legacy Concept/Axiom, Reminder, request-union, or unused domain data.
- Add an ORM, event broker, cache service, distributed scheduler, or automatic storage fallback.
- Optimize for multiple deployed Wingman replicas; database coordination will nevertheless make overlapping workers safe.

## Decisions

### 1. Inject one complete storage bundle

`SystemStorage` will include Knowledge, Interpretation state, outcomes and queue, Reviews, lifecycle transactions, State, Automation, Execution, and Suggestions. Memory and PostgreSQL factories will each build the complete bundle. `createSystem` will receive a storage factory or completed port bundle and will stop importing concrete operational stores. `ProjectionCatalog`, detectors, Capabilities, registries, and Proposal callbacks remain composition-owned volatile code or state.

The storage factory receives the code-owned registries needed to hydrate and validate closed contracts. This keeps adapter selection in the composition root while ensuring loaded data is checked against the same Profile, Component, operator, trigger, and Capability versions used for writes.

Alternatives rejected:

- Selecting an adapter independently inside every module spreads deployment policy throughout the system.
- One universal key-value repository hides query and transaction semantics and weakens module ports.

### 2. Keep one shared database owner and add transaction scopes

The process will construct one bounded `PostgresDatabase` pool and share it with telemetry and the PostgreSQL storage factory. `Runtime` remains its sole owner and closes it once. Storage adapters do not close the injected pool.

The database surface will add a callback transaction API that acquires one client, begins, commits, rolls back on error, and releases in `finally`. Transaction callbacks receive the same minimal query surface. Compound lifecycle adapters execute every participating write through that transaction context; operations will not simulate rollback with compensating writes.

A pool maximum of five connections is the compact Railway default and remains configurable. There is no automatic model or storage fallback when the pool is unavailable.

### 3. Use relational coordination columns and JSONB for closed values

Identity, foreign keys, lifecycle status, timestamps, ordering, leases, uniqueness, and indexed selectors remain relational columns. Versioned Component values, evidence, conditions, triggers, templates, results, and other closed composite values use JSONB. Adapters hydrate through domain validation and freeze returned values instead of casting driver rows into domain objects.

Immutable records—Entries, Component revisions, persisted State, Attempts, Events, and Automation evaluations—are insert-only. Operational records—Interpretations, Reviews, Automations, Intents, and Suggestions—update only through guarded lifecycle transitions. Declaration outcomes use Entry plus local reference as their stable idempotency key.

Storing every object as one JSON document was rejected because claims, ordering, foreign keys, conflicts, and deduplication require explicit database semantics. Fully normalizing every Component field was rejected because it would reproduce the case-specific schema the generic model avoids.

### 4. Make compound domain boundaries explicit

The PostgreSQL Interpretation lifecycle owns these transactions:

- Entry plus initial Interpretation capture.
- One complete `InterpretationPublicationPlan`, including Items, revisions, persisted State, Automations, Intents, declaration outcomes, and terminal run status.
- Review request publication.
- Review resolution publication and completion lock release.

The lifecycle receives already validated domain objects and persists the plan through transaction-bound adapters without re-running application commands or exposing PostgreSQL types. The memory lifecycle checkpoints the same stores under its lock and restores all of them on failure, so both adapters retain the same atomic contract.

### 5. Coordinate recoverable work in PostgreSQL

Interpretation claim uses a short transaction with `FOR UPDATE SKIP LOCKED`, a claim identifier, and lease expiry. Renewal and completion require the matching active claim; expired leases become claimable while attempt history remains.

Automation processing will reserve an occurrence/deduplication identity atomically and commit produced Intents, runtime counters, and one evaluation outcome together. A unique `(automation_id, deduplication_id)` constraint is the final duplicate guard. This requires evolving the Automation store from separate read/save calls to an atomic evaluation boundary.

The generic Execution worker will atomically reserve an eligible Intent and started Attempt before invoking any Capability. Concurrent execution receives a conflict or the existing outcome. Capability invocation remains outside a database transaction; the stable idempotency key and durable Attempt distinguish success, failure, and uncertain outcomes. Completion appends the result/Event and transitions the Intent with an expected-state guard. Notification delivery uses this same worker, while the launcher inbox remains derived from Automation, Intent, and Event facts.

Review completion uses its existing unique completion-lock identity. All mutable transitions include their expected status in the update predicate and treat zero updated rows as a conflict.

### 6. Reset migration history to two current baselines

The superseded `001` through `007` files are replaced by two migrations: `001_system.sql` creates every functional table, constraint and index from current domain contracts; `002_telemetry.sql` creates only inference telemetry. The real database and its `pgmigrations` history must be recreated before running this baseline.

The system baseline uses `consent`/`consented`, current Review resolution, generic declaration outcomes, Automation definitions, and `suggestions` without Notification, Reminder, Proactivity, or planning/shopping/travel request tables. Foreign keys default to restrictive deletion because immutable evidence chains must not cascade away accidentally. Telemetry remains separate so its lifecycle and adapter stay independent from domain transactions.

Adding an `008` replacement was rejected because a fresh installation would still execute obsolete schemas only to destroy them. After this reset, every later schema change is append-only beginning at `003`.

### 7. Select PostgreSQL at the trusted composition root

Storage type comes from process configuration, not HTTP or Entry content. Production rejects memory storage; development, tests, and isolated evaluation may select memory. The production composition injects the shared database into PostgreSQL storage and telemetry, then constructs the same system operations and HTTP API.

Railway runs `npm run migrate` before starting the new version. Startup/readiness checks database connectivity and the required migration level before HTTP readiness or worker polling. Migration failure blocks deployment. Runtime connection loss makes readiness fail and remains visible; it never switches to memory.

### 8. Verify ports first and workflows second

Reusable adapter-contract suites will cover each storage port against memory and PostgreSQL. PostgreSQL-only tests use an explicit dedicated test database, run migrations, isolate state, and reject a target not marked for testing. `npm test` remains memory-only and needs neither PostgreSQL nor inference; a separate command runs PostgreSQL integration tests.

Integration coverage includes rollback injection, guarded conflicts, concurrent queue claims, expired lease recovery, occurrence deduplication, Intent execution reservation, shutdown, and close/recreate restart recovery. The final smoke test uses the real authenticated HTTP workflow and checks persistence after process recreation without requiring a real inference call when a deterministic adapter can establish the behavior.

## Risks / Trade-offs

- **[The new baseline conflicts with an existing migration history]** → Apply it only to a recreated empty database with no `pgmigrations` table; the user owns that one-time reset.
- **[JSONB can admit structurally invalid historical values]** → Retain SQL shape checks where useful and validate every hydrated closed contract through current domain registries.
- **[External Capability results cannot share a database transaction]** → Reserve Attempts durably before invocation and rely on stable Capability idempotency plus explicit uncertain outcomes.
- **[Atomic Automation publication expands current ports]** → Add a narrow lifecycle operation rather than leaking transaction objects across general module APIs.
- **[Integration tests can damage the wrong database]** → Require a dedicated test URL and explicit test marker before migration or cleanup.
- **[A small pool can saturate during long transactions]** → Keep transactions short, never hold one during inference or Capability calls, index worker selectors, and make the bounded pool configurable.

## Migration Plan

1. Add transaction support and the complete storage composition boundary while retaining memory as the default in development and tests.
2. Validate both baseline migrations from a completely empty database and assert their system/telemetry separation.
3. Implement PostgreSQL stores and shared contract tests by domain boundary.
4. Add atomic Interpretation, Automation, and Execution coordination and concurrency tests.
5. Switch production composition to PostgreSQL, add migration/readiness deployment configuration, and run the durable API smoke test.
6. Recreate the empty Railway database, apply `001_system.sql` and `002_telemetry.sql`, then deploy the PostgreSQL-backed application.

The baseline reset has no schema rollback path because it starts from an empty database. After Wingman begins writing real data, normal forward-only migrations and database backups become mandatory.
