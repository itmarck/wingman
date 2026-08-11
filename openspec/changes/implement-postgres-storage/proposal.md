## Why

Wingman already exposes its principal knowledge and automation workflow, but domain state is lost on every restart because production still composes memory stores. PostgreSQL must become the durable production boundary without splitting the compact single-process architecture or changing the generic domain model.

## What Changes

- Add PostgreSQL adapters for every durable domain fact: Entries, Items and Component revisions, Interpretation runs and Reviews, persisted State, Automations and evaluations, Intents, Attempts and Events, declaration outcomes, and Suggestions.
- Keep code-owned registries, derived projections, detector definitions, and pending Proposal callbacks in process memory.
- Expand the system storage composition so PostgreSQL provides every durable port and remove memory as a complete application storage backend; narrow in-memory test doubles may remain only where persistence is not under test.
- Persist each complete `InterpretationPublicationPlan` and Review transition atomically.
- Enforce durable queue claiming, leases, idempotency, deduplication, optimistic state transitions, and immutable history under concurrent workers.
- Reset the unused migration history to `001_system.sql` and `002_telemetry.sql`, both defined from current contracts; after this baseline, migrations return to append-only evolution.
- Select PostgreSQL wherever the complete application requires durable storage, while keeping pending Proposal callbacks and other explicitly volatile code-owned state in process memory.
- Separate verification into pure domain tests, PostgreSQL adapter tests, deterministic Interpretation/inference tests, and a small authenticated HTTP integration suite that composes PostgreSQL with deterministic inference.
- Add self-contained PostgreSQL 18.4 verification through `embedded-postgres`, including restart, transaction rollback, concurrency, migration, and HTTP workflows without connecting tests to the configured application database.

## Capabilities

### New Capabilities

- `durable-postgres-storage`: Durable PostgreSQL correctness, atomicity, concurrency, schema alignment, and explicit volatile-state boundaries for the complete Wingman system.

### Modified Capabilities

- `production-runtime`: Compose PostgreSQL storage in production and require migrations, readiness, pooling, and coordinated database lifecycle suitable for Railway.
- `quality-gates`: Verify domain rules, PostgreSQL adapter behavior, deterministic Interpretation/inference contracts, and a minimal set of integrated HTTP workflows without duplicating the same behavior across storage implementations or consuming inference tokens.

## Impact

- Affects `src/system/storage.ts`, system composition, runtime startup, PostgreSQL infrastructure, existing memory store adapters, every durable module store adapter, migrations, tests, scripts, and Railway deployment configuration.
- Keeps the authenticated HTTP API, internal inference source-folder boundary, generic Item/Component model, and single-process deployment unchanged.
- Uses PostgreSQL 18.4 on Railway, retains the existing `pg` and `node-pg-migrate` production dependencies, and adds `embedded-postgres` only as development tooling; no additional deployed service is introduced.
- Requires recreating the empty real database before applying the new baseline; no legacy schema or migration-history compatibility is retained.
