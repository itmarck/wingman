## Context

Interpretation originally produced only evidence-backed Items and Components. Planning and reminder operations already existed, but no application boundary connected an interpreted Entry to them.

## Goals / Non-Goals

**Goals:**

- Route explicit Entry requests into existing planning and reminder operations through a closed contract.
- Preserve validation, evidence, idempotency, and the distinction between source timing and system reminder cadence.
- Expose applied, incomplete, unsupported, and failed outcomes through Entry status.

**Non-Goals:**

- Arbitrary natural-language automation or command execution.
- Production email, Slack, calendar, or notification connectors.
- Interpreting caller-side template placeholders.
- A deterministic smoke runner or local inference simulator.

## Decisions

### Add workflow drafts to interpretation

Interpretation may return closed, versioned `planningRequest` and `reminderRequest` drafts alongside knowledge. The supplied schema enumerates every allowed kind and field, so inference cannot select an arbitrary class, route, connector, Capability, or operation.

### Route through one idempotent operation

One workflow router validates the batch, derives stable identity from Entry and draft reference, and invokes existing planning and reminder commands. It records `applied`, `needsInput`, `unsupported`, or `failed`; retries reuse recorded outcomes rather than duplicating artifacts.

### Separate source timing from reminder policy

Workflow drafts preserve temporal range and precision separately from reminder cadence. Explicit occurrences are honored, deadline-only reminders use documented system policy, and event-based requests require a registered source Capability.

### Keep placeholders outside interpretation

Callers materialize placeholders such as `{name}` before capture. Wingman receives ordinary Entry text and uses `unresolved` only for genuinely missing required source values, not for template syntax.

## Risks / Trade-offs

- [A later draft fails after an earlier write] → Validate the complete batch before routing and record stable per-draft outcomes.
- [Reminder policy appears to be source evidence] → Store temporal evidence and system cadence separately.
- [Inference invents operations] → Keep workflow kinds and fields closed in prompt, schema, and runtime validation.
- [Retries duplicate effects] → Key outcomes by Entry and draft reference and reuse existing artifacts.

## Migration Plan

1. Extend interpretation contracts with a compatible empty workflow list.
2. Add idempotent routing and workflow outcome storage.
3. Connect successful interpretation processing to routing and Entry status.
4. Verify planning, reminders, missing values, unsupported event sources, and retry behavior.
