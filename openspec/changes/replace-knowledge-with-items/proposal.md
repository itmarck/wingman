## Why

Wingman's Axiom-centered knowledge model fragments cohesive information and cannot serve as the structural foundation for planning and action. The first migration must replace that model completely so later changes build on one canonical representation rather than maintain two knowledge systems.

## What Changes

- Retain immutable Entries, exact citations, interpretation provenance, and generic Reviews.
- Introduce stable Items composed from closed, versioned Components and optional Profile contracts.
- Use globally unique unqualified registry keys such as `person`, `skill`, or `task`; registrations are append-only and cannot be overwritten.
- Use typed Item references for simple connections and relationship Items for connections with roles, attributes, evidence, validity, or history.
- Preserve conflicting candidates and resolve consequential ambiguity through the existing Review flow.
- Replace knowledge interpretation, storage, validation, and projections within this change.
- **BREAKING**: Remove Concept, Predicate, Axiom, Link, their write paths, and their canonical projections after behavior and migration verification succeeds in this change.

## Capabilities

### New Capabilities

- `composable-knowledge`: Capture, structure, revise, resolve, and query evidence-backed knowledge through Entries, Items, Components, Profiles, typed references, and relationship Items.

### Modified Capabilities

None. No baseline OpenSpec capability currently describes the legacy knowledge model.

## Impact

- Replaces `src/core/knowledge` entities and corresponding interpretation, knowledge storage, validation, projections, HTTP schemas, and tests.
- Preserves Entry and the generic reference-resolution Review contract.
- Requires one-change coexistence only for comparison and rollback; the old model is removed before this change completes.

