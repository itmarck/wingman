## Context

Interpretation currently has one closed output: evidence-backed Items and Components. Planning and reminder commands exist, but no application boundary connects an interpreted Entry to them. The production entrypoint also always constructs PostgreSQL telemetry and remote inference even though domain and HTTP behavior can run in memory.

## Goals / Non-Goals

**Goals:**

- Add the smallest closed contract needed to route explicit Entry requests into existing planning and reminder operations.
- Preserve validation, authorization, evidence, idempotency, and the distinction between source timing and system cadence.
- Make the entire authenticated API smoke-testable without infrastructure or network access.
- Define expectations for all entries in the current bank and report ambiguity instead of hiding it.

**Non-Goals:**

- General natural-language automation, arbitrary command execution, production email/Slack/calendar connectors, or a second knowledge ontology.
- Changing PostgreSQL schemas, migrations, or the production notification provider.
- Treating a deterministic smoke interpreter as a quality evaluation of a production model.

## Decisions

### Add workflow drafts to the existing interpretation result

Extend the interpretation draft with an optional list of closed, versioned workflow drafts. Initial registered kinds are `planningRequest` and `reminderRequest`; the supplied inference schema and prompt enumerate their fields. The interpreter cannot name a class, API route, connector, Capability, Rule operator, or arbitrary operation.

This is preferable to parsing natural language a second time after interpretation, and to encoding executable Intents as generic Items. The Entry remains the immutable source, while application commands remain responsible for operational validation.

### Route through one idempotent application operation

Add one interpretation workflow router that validates the complete batch, derives a stable identity from Entry plus draft reference, and then calls existing planning and reminder commands. It records one outcome per draft: `applied`, `needsInput`, `unsupported`, or `failed`. Reprocessing returns the recorded outcome.

The router does not call adapters and does not bypass Reminder, Rule, Intent, State, or Planning invariants. Workflow drafts with unsupported kinds fail before any write; understood but incomplete requests become non-executable outcomes.

### Keep temporal source constraints separate from reminder cadence

A workflow draft carries the source temporal range and precision independently from cadence. Explicit occurrences are honored. A deadline-only reminder uses a documented local policy supplied in system composition, not a value attributed to the Entry. Event-based requests require a registered event source; otherwise they are `unsupported`.

This avoids fabricated precision while allowing deterministic behavior. Placeholders are an explicit `unresolved` list and block reminder activation when they are required for the subject or trigger.

### Use deterministic scenario fixtures for smoke, not heuristics

Add a local interpreter adapter for the smoke runner whose fixtures are keyed by the exact materialized Entry text and contain expected structured outputs. Before API capture, the runner replaces the Entry bank's template variables with deterministic test values; Wingman never receives or interprets the placeholders. The smoke manifest pairs each resulting Entry with observable expectations. Unknown Entries fail with a missing-fixture report rather than being guessed.

The runner starts the real Fastify server on loopback with an ephemeral port, creates a `codex` token, runs the polling worker, uses only memory stores, polls terminal states, queries public APIs, prints a normalized report, and closes in `finally`. It never loads `.env`.

### Keep production runtime composition unchanged in this change

The smoke entrypoint composes the existing memory system directly. Separating production telemetry configuration is useful but not required to prove full in-memory testability and can be addressed independently if operators need `npm start` itself to run without PostgreSQL.

## Risks / Trade-offs

- [Workflow routing partially succeeds before a later draft fails] → Validate the complete batch first and persist stable per-draft outcomes; order drafts so planning subjects precede dependent reminders.
- [Fixture smoke gives false confidence about model quality] → Label it deterministic and keep semantic model evaluation separate; its purpose is contract and integration regression.
- [Default cadence surprises users] → Keep it configurable, expose it in reminder explanations, and never claim it came from the Entry.
- [More interpretation fields increase prompt complexity] → Keep two closed workflow kinds and reuse existing Component/Profile context rather than adding general action schemas.

## Migration Plan

1. Extend interpretation contracts and schemas compatibly with an empty workflow list default.
2. Add the idempotent router and outcome query, then connect it to successful interpretation processing.
3. Add deterministic fixtures, expectations, and the in-memory smoke command.
4. Run the Entry bank twice from clean systems plus the full test suite.

Rollback removes workflow drafts and routing while leaving existing knowledge, planning, and reminder APIs unchanged.

## Open Questions

- Which production model/target should be evaluated later for semantic fixture parity? This does not affect the deterministic contract or smoke implementation.
- Which locale and user-configurable cadence should production use beyond the initial documented smoke policy?
