## Context

This change depends on archived Item and State capabilities. It introduces planning semantics as registered compositions, not new kernel primitives.

## Goals / Non-Goals

**Goals:** tasks, objectives, plans, habits, dependencies, assignment, schedules, progress, and actionable projections.

**Non-Goals:** notifications, Rule creation, connector effects, or proactive suggestions.

## Decisions

Add registered Profiles with unqualified keys `task`, `objective`, `plan`, and `habit`. Reuse small Components such as `descriptive`, `lifecycle`, `temporal`, `assignment`, `planning`, and `progress`; registrations are immutable and versioned. Profile-specific lifecycle schemas prevent one universal status enum.

Add `src/modules/planning/` for commands and projections while canonical data remains in the knowledge store. Typed planning fields reference objectives, containing plans, responsible Items, and dependencies. Planning operations append Component revisions and preserve transition history.

Actionable, blocked, overdue, unscheduled, and progress views evaluate State plus planning Components. The module exposes no execution adapter and does not create reminders automatically.

## Risks / Trade-offs

- [Profiles become rigid classes] -> Share Components and allow compatible additions without changing Item identity.
- [Dependencies form cycles] -> Validate the active dependency graph before publication.
- [Progress is guessed] -> Derive only from explicit lifecycle and measurement data; keep semantic inference advisory.

## Migration Plan

1. Register planning Components and Profiles.
2. Add lifecycle and dependency validation.
3. Add create, transition, schedule, assign, and relate operations.
4. Add planning projections and APIs.
5. Verify representative task, objective, plan, and habit cases.

Rollback removes planning registrations and module operations; generic Items remain intact.

