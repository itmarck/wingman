## 1. Storage, Database and Test Boundaries

- [ ] 1.1 Expand `SystemStorage` to cover Knowledge, Interpretations, Reviews, lifecycle, State, Execution, Automations, declaration outcomes, and Suggestions
- [ ] 1.2 Compose `System` only from injected ports, remove the complete memory storage option, and retain in-process memory only for explicitly volatile state such as pending Proposal callbacks and narrow test doubles
- [ ] 1.3 Add callback transactions to the minimal database surface with commit, rollback, release, and focused failure tests
- [ ] 1.4 Add trusted PostgreSQL configuration, bounded pool configuration, single shared database ownership, and fail-fast startup without a memory fallback
- [ ] 1.5 Add `embedded-postgres` development tooling and a `test:postgres` harness pinned to PostgreSQL 18.4 that owns a temporary cluster, generated loopback target, migrations, isolation, and cleanup without reading `DATABASE_URL`
- [ ] 1.6 Configure Vitest projects and scripts for `fast`, `postgres`, and `http`, using colocated `*.test.ts`, adapter-owned `*.postgres.test.ts`, and system-owned `tests/http/*.http.test.ts` boundaries
- [ ] 1.7 Consolidate the smallest Entry/restart, Review, execution/acknowledgement, and Suggestion HTTP characterization workflows behind one storage-independent bootstrap fixture before replacing the current memory composition

## 2. Current PostgreSQL Schema

- [x] 2.1 Replace the unused migration history with `001_system.sql` for current functional storage and `002_telemetry.sql` for inference telemetry
- [ ] 2.2 Encode PostgreSQL 18.4 constraints for current consent, Review, Profile, Component, State, Automation, Intent, mutable Attempt, declaration outcome, Suggestion, deduplication, independent Interpretation claims, and lifecycle contracts without Notification or Proactivity schema
- [ ] 2.3 Add foreign keys and query indexes for current Components, histories, independent claims, pending work, due work, generic execution history, and Suggestion status
- [ ] 2.4 Verify both baseline migrations from an empty embedded PostgreSQL 18.4 database, their strict system/telemetry separation, and the absence of legacy tables or vocabulary
- [ ] 2.5 Add shared row decoding helpers that clone, freeze, and validate hydrated closed contracts without exporting driver types

## 3. Knowledge and Interpretation Persistence

- [ ] 3.1 Implement PostgreSQL Entry, Item, Component revision, lookup, snapshot, and Interpretation-context storage while keeping ProjectionCatalog outside storage
- [ ] 3.2 Implement Interpretation history and queue storage with a separate `interpretation_claims` table, ordered `SKIP LOCKED` claims, lease renewal, expiry recovery before or after start, retry, failure, and guarded completion
- [ ] 3.3 Implement Review storage, completion locking, and Interpretation-owned declaration outcome persistence with stable idempotency identities
- [ ] 3.4 Implement atomic capture, complete `InterpretationPublicationPlan`, Review request, and Review resolution lifecycle transactions across all declared effects
- [ ] 3.5 Run focused Knowledge and Interpretation port contracts against PostgreSQL, including injected rollback and concurrent Review resolution, without duplicating domain-only scenarios

## 4. State and Execution Persistence

- [ ] 4.1 Implement insert-only PostgreSQL State storage and reconstruct equivalent modal State views after restart
- [ ] 4.2 Evolve the Execution port with atomic Intent transition, mutable Attempt reservation, and expected-`started` terminal transition operations that remain storage-agnostic
- [ ] 4.3 Implement PostgreSQL Intent, Attempt, and Event storage with consent lifecycle guards, guarded Attempt transitions, sequence uniqueness, and idempotency indexes
- [ ] 4.4 Update Intent execution to reserve before Capability invocation and durably transition the same Attempt once to success, failure, or uncertain while preserving its identity and idempotency key
- [ ] 4.5 Verify generic worker execution, cancellation and consent conflicts, retry history, duplicate prevention, and launcher acknowledgement derivation

## 5. Automation and Suggestion Persistence

- [ ] 5.1 Evolve the Automation port with an atomic occurrence boundary covering deduplication, produced Intents, runtime counters, status, and evaluation outcome
- [ ] 5.2 Implement PostgreSQL Automation queries for due time, Event dependencies, State dependencies, lifecycle control, and evaluation history
- [ ] 5.3 Update the Automation worker to use durable occurrence reservation without holding a transaction during external Capability execution
- [ ] 5.4 Add a port-driven `SuggestionLifecycle` and PostgreSQL Suggestion storage with atomic Suggestion-plus-optional-Intent creation, atomic acceptance-plus-optional-consent feedback, fingerprint uniqueness, guarded status, and restart recovery
- [ ] 5.5 Verify concurrent occurrence evaluation, expired schedules, cooldown, deduplication, rollback of both Suggestion compound transitions, feedback, and the derived launcher inbox

## 6. Production Composition and Railway

- [ ] 6.1 Build the sole complete PostgreSQL storage factory and compose application storage and inference telemetry from the one shared pool
- [ ] 6.2 Add migration-level and connectivity readiness checks before worker polling while keeping liveness distinct
- [ ] 6.3 Configure Railway PostgreSQL 18.4 to migrate before start and expose build, start, health, readiness, restart, and bounded pool settings for one service
- [ ] 6.4 Verify startup failure cleanup, coordinated shutdown, temporary database loss, and the absence of a selectable or automatic memory fallback
- [ ] 6.5 Document only the required storage, embedded PostgreSQL test lifecycle, baseline reset, migration, and Railway configuration
- [ ] 6.6 Switch the shared HTTP fixture to the complete PostgreSQL composition, enable restart and durability assertions for every prepared workflow, and remove the transitional memory bootstrap and redundant HTTP cases

## 7. Durable Verification

- [ ] 7.1 Harden the embedded PostgreSQL harness so failure paths close pools, stop the child process, remove only harness-owned temporary data, and leave the `fast` project independent from PostgreSQL
- [ ] 7.2 Run focused PostgreSQL port contracts and native PostgreSQL 18.4 migration, rollback, multi-connection concurrency, lease, idempotency, and close/recreate recovery tests without live inference
- [ ] 7.3 Run the complete `http` project against harness-owned PostgreSQL with deterministic inference and verify that each acceptance case crosses only the boundaries it is intended to prove
- [ ] 7.4 Remove obsolete complete memory stores, duplicated parity tests, and superseded HTTP cases after all final PostgreSQL and HTTP gates pass
- [ ] 7.5 Run formatting, typecheck, `fast`, `postgres`, `http`, aggregate verification, build, migration checks, and strict OpenSpec validation
