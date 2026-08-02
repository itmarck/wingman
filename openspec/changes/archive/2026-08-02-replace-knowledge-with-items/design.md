## Context

This is the only change that replaces the current knowledge core. Entries and generic Reviews remain valid; Concept, Predicate, Axiom, Link, their stores, interpretation output, and projections are replaced together because they depend on one another and cannot be removed safely in separate deployments.

## Goals / Non-Goals

**Goals:**

- Finish with one canonical knowledge representation and no legacy runtime dependency.
- Preserve Entry identity, exact citations, uncertainty, history, and current-view semantics.
- Keep composition closed, versioned, and provider-independent.

**Non-Goals:**

- Add State, executable Intents, Rules, tasks, or notifications.
- Introduce PostgreSQL knowledge persistence in the same change.

## Decisions

### Core structure

Replace `src/core/knowledge/` with a cohesive Item model under `src/core/item/`. The core contains Item identity, Component revision, Component schema, Profile, typed reference values, relationship Item conventions, evidence, valid time, registry invariants, and current-revision derivation. Registry keys are unqualified and registrations are immutable by key and version.

`src/modules/knowledge/` remains the feature boundary for registration, identity resolution, current views, and storage ports. Its memory adapter stores Items and revisions atomically. Interpretation Drafts emit Items and Component revisions directly; the generic Review contract continues resolving uncertain Item identity.

Simple connections live in registered Component fields. A relationship with roles or its own history is an Item whose Profile requires a participants Component plus domain detail Components. No general Predicate creation remains.

### Vertical replacement

Behavior fixtures first run against the legacy model. A temporary test-only translator produces the new representation for parity comparison; it is never a production dual writer. Once interpretation, Reviews, knowledge operations, and projections pass parity, the new representation becomes the only writer and reader in the same change. Legacy files, ports, schemas, and tests are then deleted and the full suite rerun.

Because production knowledge is currently in memory, rollback is code rollback plus process restart; immutable external Entries can be recaptured. A future persistent migration must be a separate change.

## Risks / Trade-offs

- [Relationship Items become verbose] -> Use typed Component references unless the relationship owns meaningful information.
- [Dynamic interpretation invents schemas] -> Only registered structures publish; unknown knowledge uses narrative or Review.
- [Legacy semantics are missed] -> Map every existing behavior test before deletion and add parity fixtures for citations, uncertainty, and supersession.
- [One vertical change is large] -> Keep scope strictly to knowledge and delete legacy code only after the new path is complete.

## Migration Plan

1. Freeze legacy behavior fixtures and mapping expectations.
2. Add the new core and memory store without wiring production composition.
3. Add new interpretation, Review resolution, and projections.
4. Run parity fixtures through a test-only translator.
5. Switch system composition and HTTP schemas to the new path.
6. Delete Concept, Predicate, Axiom, Link, legacy stores, and compatibility-only tests.
7. Run typecheck, full tests, build, and strict OpenSpec validation.

Rollback before step 6 uses the untouched legacy composition. Rollback after step 6 uses version control; no persistent knowledge rows are rewritten by this change.

