## Why

Wingman has accumulated fragmented one-purpose files and several oversized logic files before its persistence layer expands. Simplifying those boundaries now will make the PostgreSQL work easier to navigate without changing behavior.

## What Changes

- Consolidate closely related type-only ports and trivial operations where separate files add navigation but no isolation.
- Split oversized logic only at existing conceptual boundaries, without introducing new domain concepts or abstraction layers.
- Simplify system composition and remove local duplication where it prepares a clean storage boundary.
- Preserve public HTTP behavior, domain invariants, in-memory behavior, and the planned PostgreSQL architecture.
- Verify behavior with the existing test suite before and after the refactor, plus typecheck and build.

## Capabilities

No capability requirements change. This change is a behavior-preserving internal refactor and opts out of delta specs.

## Impact

Internal TypeScript imports and file organization under `src/` will change. No API routes, database schema, dependencies, or deployment behavior change.
