## 1. Storage and Database Boundaries

- [ ] 1.1 Expand `SystemStorage` to cover Knowledge, Interpretations, Reviews, lifecycle, State, Execution, Automations, declaration outcomes, and Suggestions
- [ ] 1.2 Move memory adapter construction into one storage factory and compose `System` only from ports without changing current behavior
- [ ] 1.3 Add callback transactions to the minimal database surface with commit, rollback, release, and focused failure tests
- [ ] 1.4 Add trusted storage configuration, production-memory rejection, bounded pool configuration, and single shared database ownership

## 2. Current PostgreSQL Schema

- [x] 2.1 Replace the unused migration history with `001_system.sql` for current functional storage and `002_telemetry.sql` for inference telemetry
- [ ] 2.2 Encode current consent, Review, Profile, Component, State, Automation, Intent, declaration outcome, Suggestion, deduplication, lease, and lifecycle constraints without Notification or Proactivity schema
- [ ] 2.3 Add foreign keys and query indexes for current Components, histories, pending work, due work, generic execution history, and Suggestion status
- [ ] 2.4 Verify both baseline migrations from an empty database, their strict system/telemetry separation, and the absence of legacy tables or vocabulary
- [ ] 2.5 Add shared row decoding helpers that clone, freeze, and validate hydrated closed contracts without exporting driver types

## 3. Knowledge and Interpretation Persistence

- [ ] 3.1 Implement PostgreSQL Entry, Item, Component revision, lookup, snapshot, and Interpretation-context storage while keeping ProjectionCatalog outside storage
- [ ] 3.2 Implement Interpretation history and queue storage with ordered claims, `SKIP LOCKED`, lease renewal, expiry recovery, retry, failure, and guarded completion
- [ ] 3.3 Implement Review storage, completion locking, and Interpretation-owned declaration outcome persistence with stable idempotency identities
- [ ] 3.4 Implement atomic capture, complete `InterpretationPublicationPlan`, Review request, and Review resolution lifecycle transactions across all declared effects
- [ ] 3.5 Run shared Knowledge and Interpretation port contracts against memory and PostgreSQL, including injected rollback and concurrent Review resolution

## 4. State and Execution Persistence

- [ ] 4.1 Implement insert-only PostgreSQL State storage and reconstruct equivalent modal State views after restart
- [ ] 4.2 Evolve the Execution port with atomic Intent transition and Attempt reservation operations that remain storage-agnostic
- [ ] 4.3 Implement PostgreSQL Intent, Attempt, and Event storage with consent lifecycle guards, sequence uniqueness, and idempotency indexes
- [ ] 4.4 Update Intent execution to reserve before Capability invocation and durably finish success, failure, stale, and uncertain outcomes
- [ ] 4.5 Verify generic worker execution, cancellation and consent conflicts, retry history, duplicate prevention, and launcher acknowledgement derivation

## 5. Automation and Suggestion Persistence

- [ ] 5.1 Evolve the Automation port with an atomic occurrence boundary covering deduplication, produced Intents, runtime counters, status, and evaluation outcome
- [ ] 5.2 Implement PostgreSQL Automation queries for due time, Event dependencies, State dependencies, lifecycle control, and evaluation history
- [ ] 5.3 Update the Automation worker to use durable occurrence reservation without holding a transaction during external Capability execution
- [ ] 5.4 Implement PostgreSQL Suggestion storage with fingerprint uniqueness, feedback history, guarded status, and restart recovery
- [ ] 5.5 Verify concurrent occurrence evaluation, expired schedules, cooldown, deduplication, Suggestion feedback, and the derived launcher inbox

## 6. Production Composition and Railway

- [ ] 6.1 Build the PostgreSQL storage factory and compose production storage and inference telemetry from the one shared pool
- [ ] 6.2 Add migration-level and connectivity readiness checks before worker polling while keeping liveness distinct
- [ ] 6.3 Configure Railway to migrate before start and expose build, start, health, readiness, restart, and bounded pool settings for one service
- [ ] 6.4 Verify startup failure cleanup, coordinated shutdown, temporary database loss, and the absence of automatic memory fallback
- [ ] 6.5 Document only the required storage, test-database, baseline reset, migration, and Railway configuration

## 7. Durable Verification

- [ ] 7.1 Add a separate PostgreSQL test command that requires and validates an explicitly isolated test database without changing normal `npm test`
- [ ] 7.2 Run shared storage contracts and PostgreSQL migration, rollback, concurrency, lease, idempotency, and close/recreate recovery integration tests without inference
- [ ] 7.3 Run formatting, typecheck, deterministic tests, PostgreSQL tests, build, migration checks, and strict OpenSpec validation
- [ ] 7.4 Start the PostgreSQL-backed server and smoke-test authenticated Entry processing, pending Review visibility, notification acknowledgement, readiness, and restart persistence through the API
