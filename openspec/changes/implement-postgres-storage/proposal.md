## Why

Wingman already exposes its principal knowledge and automation workflow, but domain state is lost on every restart because production still composes memory stores. PostgreSQL must become the durable production boundary without splitting the compact single-process architecture or changing the generic domain model.

## What Changes

- Add PostgreSQL adapters for every durable domain fact: Entries, Items and Component revisions, Interpretation runs and Reviews, persisted State, Automations and evaluations, Intents, Attempts and Events, declaration outcomes, and Suggestions.
- Keep code-owned registries, derived projections, detector definitions, and pending development approval callbacks in process memory.
- Expand the system storage composition so memory and PostgreSQL provide the same ports instead of constructing operational memory stores unconditionally.
- Add atomic transaction support for compound publication and Review transitions.
- Enforce durable queue claiming, leases, idempotency, deduplication, optimistic state transitions, and immutable history under concurrent workers.
- Reset the unused migration history to `001_system.sql` and `002_telemetry.sql`, both defined from current contracts; after this baseline, migrations return to append-only evolution.
- Select PostgreSQL for the production process while preserving memory storage for deterministic tests and isolated evaluation.
- Add adapter-contract and PostgreSQL integration verification, including restart, transaction rollback, concurrency, migration, and the authenticated production smoke flow.

## Capabilities

### New Capabilities

- `durable-postgres-storage`: Durable storage parity, atomicity, concurrency, schema alignment, and explicit volatile-state boundaries for the complete Wingman system.

### Modified Capabilities

- `production-runtime`: Compose PostgreSQL storage in production and require migrations, readiness, pooling, and coordinated database lifecycle suitable for Railway.
- `quality-gates`: Verify memory/PostgreSQL behavioral parity and PostgreSQL durability, transaction, concurrency, and migration behavior without consuming inference tokens.

## Impact

- Affects `src/system/storage.ts`, system composition, runtime startup, PostgreSQL infrastructure, every durable module store adapter, migrations, tests, scripts, and Railway deployment configuration.
- Keeps the authenticated HTTP API, inference provider contract, generic Item/Component model, and single-process deployment unchanged.
- Uses the existing `pg` and `node-pg-migrate` dependencies; no additional service is introduced.
- Requires recreating the empty real database before applying the new baseline; no legacy schema or migration-history compatibility is retained.
