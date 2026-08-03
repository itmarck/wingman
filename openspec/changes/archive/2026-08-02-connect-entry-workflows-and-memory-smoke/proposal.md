## Why

The HTTP capture pipeline preserved Entries but could publish only generic Items and Components; explicit tasks and reminders did not reach the planning and reminder workflows promised by their specifications.

## What Changes

- Add a closed interpretation-to-workflow contract that lets the configured interpreter select registered planning and reminder requests without inventing operations or bypassing validation.
- Route explicit task, habit, objective, plan, and reminder requests through existing application operations after preserving their Entry evidence.
- Keep genuinely missing required values non-executable and visible for later clarification.
- Treat template placeholders as caller-side input that must be materialized before an Entry reaches Wingman.
- Record explainable, idempotent outcomes for applied, incomplete, unsupported, and failed workflows.
- Remove redundant orchestration where routing can reuse existing commands and contracts directly.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-planning`: Captured explicit planning requests reach planning Items through interpretation while preserving evidence and uncertainty.
- `reminder-workflow`: Captured explicit reminders reach reminder workflows, while incomplete or unsupported requests remain safe and observable.

## Impact

- Affects interpretation contracts, inference schemas, workflow routing, Entry status, planning, reminders, and behavior tests.
- Adds no database migration, production connector, external write, or deterministic smoke facility.
