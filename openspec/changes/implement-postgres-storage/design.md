## Context

See `proposal.md` for motivation. PostgreSQL currently owns inference telemetry, while `createSystem` selects memory Knowledge and Interpretation stores and constructs State, Automation, Execution, and Suggestion stores directly. Interpretation now compiles one complete plan and its memory lifecycle atomically persists knowledge, State, Automations, Intents, outcomes, and terminal status. `SystemStorage` does not yet describe that full durable boundary, and the database abstraction exposes queries but not transactions.

The production target remains one Railway process and one PostgreSQL 18.4 database. The real database contains no required data and will be recreated by the user before the baseline is applied, so neither schema nor migration-history compatibility is required.

## Goals / Non-Goals

**Goals:**

- Keep module operations dependent only on ports while making PostgreSQL the sole complete durable storage composition.
- Recover all committed domain facts and pending work after restart.
- Preserve atomic publication, concurrency safety, immutable history, and current API behavior.
- Keep one shared pool, one process, and a generic schema with no use-case tables.
- Exercise migrations, adapters, pooling, locking, and restart behavior against harness-owned native PostgreSQL 18.4 without a developer-managed database.

**Non-Goals:**

- Persist code-owned registries, derived projections, detectors, caches, or pending approval callbacks.
- Migrate legacy Concept/Axiom, Reminder, request-union, or unused domain data.
- Add an ORM, event broker, cache service, distributed scheduler, or automatic storage fallback.
- Require Docker, a locally installed PostgreSQL service, or an externally configured database for integration tests.
- Maintain a second complete storage implementation solely to make tests faster.
- Optimize for multiple deployed Wingman replicas; database coordination will nevertheless make overlapping workers safe.

## Decisions

### 1. Inject one complete storage bundle

`SystemStorage` will include Knowledge, Interpretation state, outcomes and queue, Reviews, lifecycle transactions, State, Automation, Execution, and Suggestions. One PostgreSQL factory will build the complete durable bundle at the composition root. `createSystem` will receive the completed port bundle and will stop selecting storage or importing concrete operational stores. `ProjectionCatalog`, detectors, Capabilities, registries, and pending Proposal callbacks remain composition-owned volatile code or state.

The current complete memory stores will not remain as an alternative application backend. Pure domain tests may use narrow test doubles defined around the port behavior needed by that test, but those doubles do not promise persistence semantics and do not participate in adapter parity suites. Any test that asserts storage behavior uses PostgreSQL.

The storage factory receives the code-owned registries needed to hydrate and validate closed contracts. This keeps adapter selection in the composition root while ensuring loaded data is checked against the same Profile, Component, operator, trigger, and Capability versions used for writes.

Alternatives rejected:

- Selecting an adapter independently inside every module spreads deployment policy throughout the system.
- One universal key-value repository hides query and transaction semantics and weakens module ports.
- Maintaining complete memory and PostgreSQL bundles duplicates infrastructure behavior and creates a parity obligation for a backend that is never deployed.

### 2. Keep one shared database owner and add transaction scopes

The process will construct one bounded `PostgresDatabase` pool and share it with telemetry and the PostgreSQL storage factory. `Runtime` remains its sole owner and closes it once. Storage adapters do not close the injected pool.

The database surface will add a callback transaction API that acquires one client, begins, commits, rolls back on error, and releases in `finally`. Transaction callbacks receive the same minimal query surface. Compound lifecycle adapters execute every participating write through that transaction context; operations will not simulate rollback with compensating writes.

A pool maximum of five connections is the compact Railway default and remains configurable. There is no automatic model or storage fallback when the pool is unavailable.

### 3. Use relational coordination columns and JSONB for closed values

Identity, foreign keys, lifecycle status, timestamps, ordering, leases, uniqueness, and indexed selectors remain relational columns. Versioned Component values, evidence, conditions, triggers, templates, results, and other closed composite values use JSONB. Adapters hydrate through domain validation and freeze returned values instead of casting driver rows into domain objects.

Immutable records—Entries, Component revisions, persisted State, Events, and Automation evaluations—are insert-only. Operational records—Interpretations, Reviews, Automations, Intents, Attempts, and Suggestions—update only through guarded lifecycle transitions. An Attempt preserves its identity, sequence, and idempotency key while one expected-state update changes `started` to exactly one terminal outcome. Declaration outcomes use Entry plus local reference as their stable idempotency key.

Storing every object as one JSON document was rejected because claims, ordering, foreign keys, conflicts, and deduplication require explicit database semantics. Fully normalizing every Component field was rejected because it would reproduce the case-specific schema the generic model avoids.

### 4. Make compound domain boundaries explicit

The PostgreSQL Interpretation lifecycle owns these transactions:

- Entry plus initial Interpretation capture.
- One complete `InterpretationPublicationPlan`, including Items, revisions, persisted State, Automations, Intents, declaration outcomes, and terminal run status.
- Review request publication.
- Review resolution publication and completion lock release.

The lifecycle receives already validated domain objects and persists the plan through transaction-bound adapters without re-running application commands or exposing PostgreSQL types. Domain tests exercise planning and validation before this boundary; PostgreSQL integration tests prove commit and rollback semantics at the boundary.

A separate `SuggestionLifecycle` owns creation of a Suggestion with its optional Intent and acceptance feedback with its optional Intent consent transition. It receives already validated domain values and commits each group atomically through one PostgreSQL transaction. This prevents an Intent without its originating Suggestion, a Suggestion that lost its intended Intent, and accepted feedback that disagrees with durable consent.

### 5. Coordinate recoverable work in PostgreSQL

Interpretation claim uses a short transaction with `FOR UPDATE SKIP LOCKED` and stores claim identifier, lease expiry, and ownership in a separate `interpretation_claims` table keyed by Interpretation. The claim is independent from the run lifecycle row because `claim()` reserves queued work before `start()` transitions it to processing. Renewal and completion require the matching active claim; expired leases become claimable whether the prior worker disappeared before or after starting, while Interpretation attempt history remains in `interpretation_runs`.

Automation processing will reserve an occurrence/deduplication identity atomically and commit produced Intents, runtime counters, and one evaluation outcome together. A unique `(automation_id, deduplication_id)` constraint is the final duplicate guard. This requires evolving the Automation store from separate read/save calls to an atomic evaluation boundary.

The generic Execution worker will atomically reserve an eligible Intent and mutable `started` Attempt before invoking any Capability. Concurrent execution receives a conflict or the existing outcome. Capability invocation remains outside a database transaction; the stable idempotency key and durable Attempt distinguish success, failure, and uncertain outcomes. Completion uses an expected `started` predicate to transition the same Attempt once, appends the result/Event, and transitions the Intent with an expected-state guard. Notification delivery uses this same worker, while the launcher inbox remains derived from Automation, Intent, and Event facts.

Review completion uses its existing unique completion-lock identity. All mutable transitions include their expected status in the update predicate and treat zero updated rows as a conflict.

### 6. Reset migration history to two current baselines

The superseded `001` through `007` files are replaced by two PostgreSQL 18.4 migrations: `001_system.sql` creates every functional table, constraint and index from current domain contracts; `002_telemetry.sql` creates only inference telemetry. The real database and its `pgmigrations` history must be recreated before running this baseline.

The system baseline uses `consent`/`consented`, current Review resolution, generic declaration outcomes, Automation definitions, and `suggestions` without Notification, Reminder, Proactivity, or planning/shopping/travel request tables. Foreign keys default to restrictive deletion because immutable evidence chains must not cascade away accidentally. Telemetry remains separate so its lifecycle and adapter stay independent from domain transactions.

Adding an `008` replacement was rejected because a fresh installation would still execute obsolete schemas only to destroy them. After this reset, every later schema change is append-only beginning at `003`.

### 7. Use PostgreSQL as the sole complete storage backend

Database configuration comes from trusted process configuration, not HTTP or Entry content. Every complete runtime composition injects the shared database into PostgreSQL storage and telemetry, then constructs the same system operations and HTTP API. There is no application storage selector or automatic memory fallback. Focused inference evaluation that does not require the complete system runs without storage; evaluation of an integrated workflow uses the embedded PostgreSQL harness.

Railway runs `npm run migrate` before starting the new version. Startup/readiness checks database connectivity and the required migration level before HTTP readiness or worker polling. Migration failure blocks deployment. Runtime connection loss makes readiness fail and remains visible; it never switches to memory.

### 8. Verify four boundaries without duplicating behavior

Verification is divided by responsibility:

- Pure domain tests cover validation, invariants, lifecycle decisions, and deterministic transformations without database or model infrastructure.
- PostgreSQL adapter tests cover each durable port, migrations, hydration, ordering, constraints, atomicity, concurrency, and restart behavior against the real driver. The suite uses the fewest representative cases needed per storage contract rather than repeating domain behavior.
- Interpretation/inference tests use deterministic model fixtures to cover request construction, schema handling, validation, retries, and orchestration. Explicit model evaluations remain separate because live model quality is variable, costly, and unsuitable as a deterministic persistence gate.
- A small HTTP integration suite composes the actual server, PostgreSQL storage, and deterministic inference to verify authentication, wiring, cross-module transactions, observable responses, and recovery across the complete critical workflows.

Vitest projects make these boundaries executable without relying on the generic `.test.ts` suffix alone:

- `fast` includes colocated `src/**/tests/*.test.ts` and `packages/**/*.test.ts` domain, operation, HTTP-boundary, and deterministic inference tests while excluding infrastructure-specific suffixes.
- `postgres` includes `*.postgres.test.ts` beside each owning PostgreSQL adapter; cross-module transaction and migration cases may live under the shared PostgreSQL adapter test area.
- `http` includes `tests/http/*.http.test.ts`, because complete workflows belong to system composition rather than any one module.

The scripts expose the same separation as `npm test`, `npm run test:postgres`, and `npm run test:http`, with one aggregate verification command for CI. HTTP mapping tests that only exercise authentication, validation, or status translation remain fast colocated adapter tests; only tests that start the composed application belong to the `http` project.

The HTTP suite follows a characterization-and-switchover sequence. First, the smallest critical workflows are consolidated from current HTTP coverage behind one bootstrap fixture and run against the existing composition only to preserve observable behavior during migration. The test bodies do not select storage. After the complete PostgreSQL bundle exists, that fixture switches to harness-owned PostgreSQL, restart and durability assertions are enabled, and the transitional memory bootstrap plus redundant HTTP cases are removed. A memory result is never accepted as proof of persistence correctness.

Before PostgreSQL adapters are implemented, the repository adds `embedded-postgres` as development tooling and a dedicated test harness pinned to PostgreSQL 18.4. The harness starts one native cluster per test run on a generated loopback port and temporary data directory, applies the real `node-pg-migrate` migrations, and exposes only its generated connection string to the PostgreSQL test process. It never reads the application `DATABASE_URL`.

The harness may create isolated databases from a migrated template for suites that can run independently. Tests that verify migration-from-empty, pool concurrency, `SKIP LOCKED`, lifecycle conflicts, and restart recovery use the actual `pg` driver and multiple real connections against the embedded cluster. Global teardown closes pools, stops the child process, and removes the temporary data directory even after failures. The fast deterministic command runs domain and deterministic inference tests without PostgreSQL or live model calls. The `postgres` and `http` projects use the embedded lifecycle independently or share one harness-owned cluster when the aggregate command runs them together.

Integration coverage includes rollback injection, guarded conflicts, concurrent queue claims, expired lease recovery, occurrence deduplication, Intent execution reservation, shutdown, and close/recreate restart recovery. The HTTP acceptance expectations are executable characterization tests before adapter implementation and guide each vertical; the same suite becomes a required PostgreSQL gate when the complete bundle is available, so the repository does not carry a permanently failing project. Deterministic inference establishes orchestration behavior without requiring a real model call.

## Risks / Trade-offs

- **[The new baseline conflicts with an existing migration history]** → Apply it only to a recreated empty database with no `pgmigrations` table; the user owns that one-time reset.
- **[JSONB can admit structurally invalid historical values]** → Retain SQL shape checks where useful and validate every hydrated closed contract through current domain registries.
- **[External Capability results cannot share a database transaction]** → Reserve Attempts durably before invocation and rely on stable Capability idempotency plus explicit uncertain outcomes.
- **[Atomic Automation publication expands current ports]** → Add a narrow lifecycle operation rather than leaking transaction objects across general module APIs.
- **[Integration tests can damage the wrong database]** → Generate the only test connection inside the embedded harness, ignore `DATABASE_URL`, bind to loopback, and clean only the harness-owned temporary cluster.
- **[Embedded PostgreSQL installation is heavier than an emulator]** → Pin PostgreSQL 18.4, allow its required development postinstall, reuse downloaded binaries, and start one cluster per suite run rather than per test.
- **[Using PostgreSQL for every persistence test is slower than memory stores]** → Keep domain behavior outside the adapter suite, reuse one cluster and migrated templates, and retain only representative persistence and integrated HTTP cases.
- **[A small pool can saturate during long transactions]** → Keep transactions short, never hold one during inference or Capability calls, index worker selectors, and make the bounded pool configurable.

## Migration Plan

1. Add transaction support, the complete PostgreSQL storage composition boundary, and the embedded PostgreSQL 18.4 harness; retain only narrow test doubles for tests that do not assert persistence.
2. Validate both baseline migrations from a completely empty embedded database and assert their system/telemetry separation before implementing stores.
3. Implement PostgreSQL stores together with focused PostgreSQL contract tests by durable port, removing complete memory stores as their replacements become available.
4. Add atomic Interpretation, Automation, Execution, and Suggestion coordination and concurrency tests.
5. Complete the PostgreSQL-only runtime composition, add migration/readiness deployment configuration, and run the minimal durable HTTP integration suite.
6. Recreate the empty Railway database, apply `001_system.sql` and `002_telemetry.sql`, then deploy the PostgreSQL-backed application.

The baseline reset has no schema rollback path because it starts from an empty database. After Wingman begins writing real data, normal forward-only migrations and database backups become mandatory.
