## Context

This change starts only after composable knowledge is archived. It adds reasoning over Items without changing their canonical storage contract.

## Goals / Non-Goals

**Goals:** derive reconstructible State, persist non-derivable modal State, and expose deterministic views.

**Non-Goals:** executable effects, Rule scheduling, planning Profiles, or free-form expressions.

## Decisions

Add stable State value types and a closed condition AST under `src/core/state/`. Conditions reference Item IDs, Component keys and fields, relationship participants, time, and other registered operators. Operators use immutable unqualified keys and validate operand shapes before evaluation.

Add `src/modules/state/` for persisted modal State operations, evaluation against a knowledge snapshot and clock, storage ports, and projections. Derived State is computed and not appended merely because it became true. Persisted State contains modality, author, evidence, recorded time, validity, and optional confidence.

Current, desired, required, forbidden, predicted, and unresolved projections share one evaluator so APIs cannot implement divergent semantics. Evaluation is pure and has no adapter access.

## Risks / Trade-offs

- [AST grows into a programming language] -> Start with equality, existence, temporal comparison, all, any, and not.
- [Derived views become slow] -> Declare dependencies and index hot fields; measure before adding operators.
- [Persisted and derived State conflict] -> Preserve modality and evidence and expose both rather than silently merging meanings.

## Migration Plan

1. Add State and condition contracts with pure behavior tests.
2. Add persisted-State memory storage and evaluation services.
3. Add projections and APIs.
4. Test derivation against representative Items and time.
5. Verify no Axiom compatibility path is reintroduced.

Rollback removes the additive State module; canonical Items remain unchanged.

