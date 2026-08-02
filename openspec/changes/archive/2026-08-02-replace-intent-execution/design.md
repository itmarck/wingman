## Context

The current Intent module is small enough to replace vertically. This change depends on archived Item and State capabilities and finishes with no old Intent implementation.

## Goals / Non-Goals

**Goals:** safe proposals, authorization, Attempts, Events, idempotency, and explicit outcome evidence.

**Non-Goals:** Rule scheduling, tasks, production notification adapters, or autonomous execution decisions.

## Decisions

Replace `src/modules/intent/` with `src/modules/execution/`. Stable domain contracts live under `src/core/execution/`: Intent, Capability definition, Attempt, Event, autonomy policy, and lifecycle values. Ports cover Capability resolution, execution adapters, stores, clock, and authorization; adapters remain outside core.

Capability keys and versions are immutable. Autonomy resolves from global default to Capability policy, user preference, and explicit authorization, never exceeding the Capability safety ceiling. Intent stores the resolved inputs and evidence but each Attempt is append-only. Events are immutable external or outcome observations and can reference Entry causation without becoming Entries.

A fake Capability proves lifecycle, failure, uncertain outcome, and idempotent retry. After behavior parity for proposal creation, system composition switches to execution and deletes the legacy Intent class, port, operation, memory collection, and tests.

## Risks / Trade-offs

- [Lifecycle becomes overgeneralized] -> Keep Capability-specific result contracts while standardizing only common Intent and Attempt outcomes.
- [Retry duplicates effects] -> Require a stable idempotency identity and explicit uncertain outcome.
- [Authorization is bypassed] -> Capability resolution and execution accept only an authorized Intent context.

## Migration Plan

1. Add new execution contracts, memory stores, and fake Capability.
2. Add proposal, authorization, Attempt, retry, and Event operations.
3. Map existing proposal behavior to the new Intent API.
4. Switch system composition and approval integration.
5. Delete the old Intent domain, command, store, and tests.
6. Run full verification.

Rollback before deletion switches composition back. After deletion it uses version control; no external effect adapter is introduced here.

