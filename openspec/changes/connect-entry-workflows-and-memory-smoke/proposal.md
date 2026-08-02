## Why

The HTTP capture pipeline completes Entries but currently publishes only generic Items and Components; it cannot route explicit task and reminder requests into the planning and reminder workflows promised by their specifications. The production entrypoint also always composes PostgreSQL telemetry and remote inference, leaving no repeatable way to run the whole API from a clean in-memory system in an arbitrary environment.

## What Changes

- Add a closed interpretation-to-workflow contract that lets the configured interpreter select registered application commands without inventing operation names or bypassing validation.
- Route explicit task, habit, objective, and reminder requests through the existing planning and reminder operations after preserving their Entry evidence.
- Keep ambiguous reminder cadence or genuinely missing required values non-executable and visible for later clarification; Entry-bank template variables are materialized by the smoke runner before capture and are not interpreted by Wingman.
- Add a deterministic in-memory smoke runner that builds the real HTTP API, creates its own token, processes `docs/entries.md`, inspects operational status and derived effects, and exits without PostgreSQL, migrations, remote inference, or external notification delivery.
- Add semantic expectations for the entry bank so regressions distinguish durable knowledge, planning requests, reminder requests, unsupported event sources, and quotations.
- Remove redundant orchestration code where the workflow routing can reuse existing commands and contracts directly.

## Capabilities

### New Capabilities

- `memory-system-smoke`: Run and verify the complete authenticated API workflow in a fresh, isolated in-memory process with deterministic local adapters.

### Modified Capabilities

- `task-planning`: Captured explicit planning requests must reach planning Items through the interpretation workflow while preserving evidence and uncertainty.
- `reminder-workflow`: Captured explicit reminder requests must reach the reminder workflow, and imprecise or incomplete requests must remain safe instead of silently completing with no reminder.

## Impact

- Affects interpretation request/output contracts, inference schemas, post-interpretation orchestration, system composition, the HTTP smoke surface, and behavior tests.
- Adds no database migration or production connector and performs no external writes.
- The smoke runner uses memory stores and deterministic adapters only; each invocation owns and closes its process state.
