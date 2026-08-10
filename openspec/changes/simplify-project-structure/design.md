## Context

See `proposal.md` for motivation. Production code is spread across many narrow files, including one-file ports and query classes, while a smaller group of behavior files exceeds 200 lines. PostgreSQL will add adapters for most ports, so the refactor must leave clear module boundaries and avoid temporary abstractions that storage work would immediately replace.

## Goals / Non-Goals

**Goals:**

- Make each module navigable through a small number of cohesive files.
- Keep behavior-heavy files near 200 lines where a natural split exists; prefer less than 100 lines for focused logic.
- Reduce the total production TypeScript file count despite splitting oversized behavior.
- Preserve dependency direction, public types, runtime behavior, and PostgreSQL's planned port boundary.

**Non-Goals:**

- Change HTTP contracts, domain vocabulary, storage schemas, or observable behavior.
- Replace explicit module ports with a generic repository.
- Force declarative schemas, immutable data definitions, tests, or composition wiring below an arbitrary line limit.
- Complete any PostgreSQL implementation task.

## Decisions

### 1. Consolidate contracts by module

Closely related port interfaces will live in one `ports.ts` file per module instead of one directory entry per interface. Module contracts remain in `module.ts` because they are the stable public surface used by composition.

This preserves dependency inversion while reducing navigation. Moving ports into `system/` was rejected because it would invert ownership; removing interfaces was rejected because PostgreSQL needs those boundaries.

### 2. Group trivial operations by use case

Small read queries or lifecycle controls that share the same store and vocabulary will be grouped into cohesive files such as `queries.ts` or `control.ts`. Distinct complex workflows remain separate.

Grouping every operation into one service was rejected because it would create large classes and couple unrelated behavior.

### 3. Split oversized logic at domain seams

Oversized behavior will be separated only where a named responsibility already exists: state validation versus Interpretation transitions, draft resolution versus publication, and planning value/dependency rules versus orchestration. Shared helpers move only when they have a coherent owner.

Purely declarative schema files and composition roots may exceed the preferred limit when splitting would worsen discoverability.

### 4. Measure structure without enforcing a brittle line rule

The change records production file count and large-file distribution before and after. Tests, typecheck, build, formatting, and OpenSpec validation remain the correctness gates; line count is a design signal rather than a CI rule.

### 5. Keep cohesive large-file exceptions

`system/system.ts` remains composition wiring and will change with PostgreSQL storage. Inference and registry schema catalogs remain declarative. The development-only inspector stays in one file because it has no domain or business responsibility. Resource routes, detector catalogs, stores, and aggregates near 200 lines remain intact when splitting would only scatter one responsibility.

## Risks / Trade-offs

- **[Mechanical import churn causes missed references]** → Use repository-wide searches, typecheck, and the full test suite after each group.
- **[Fewer files create oversized mixed-responsibility modules]** → Consolidate only type-only contracts and very small related operations.
- **[Splitting logic merely relocates complexity]** → Name each extracted unit after an existing responsibility and avoid forwarding wrappers.
- **[Overlap with PostgreSQL planning]** → Preserve current port names and semantics so the storage change consumes the simplified layout without redesign.

## Migration Plan

Apply the refactor in independent groups: contracts and imports, small operations, then oversized logic. Verify after each group. Rollback is a normal source revert because no persisted data or external contract changes.
