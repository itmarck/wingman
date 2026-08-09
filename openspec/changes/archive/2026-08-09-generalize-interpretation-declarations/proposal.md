## Why

Interpretation currently encodes product cases as `planningRequest | reminderRequest`, forcing every future domain to extend the inference schema, validator, router, outcome model and persistence. Wingman needs one closed semantic output language whose primitives remain stable while Profiles, Components, Automations and Capabilities supply extensibility.

## What Changes

- Replace case-specific workflow drafts with a declaration plan containing Items/Components, persisted State, Automations and Intents linked by local references and dependencies.
- Extend Profile contracts so one registered Profile owns required and optional Components, declarative initial values, lifecycle transitions and derived persisted State; no separate `CompositionPolicy` concept is introduced.
- Materialize operational Items from their Profile contract instead of routing them through planning-specific interpretation workflows.
- **BREAKING**: Remove `Reminder` as a domain entity, store, table and API resource. Represent each reminder as one scheduled Automation that produces notification Intents.
- Extend Automation triggers to support explicit multi-occurrence schedules so grouping, cancellation, rescheduling, lifecycle, deduplication and explanation remain on the Automation itself.
- Expose reminders as a derived view of notification Automations rather than persisted reminder aggregates.
- Replace workflow-specific outcomes with declaration outcomes keyed by Entry and declaration reference.
- Preserve closed registries, reference-resolution Reviews, evidence, idempotency, mutation approval and the rule that interpretation never invokes an external adapter.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interpretation-policy`: Interpretation output becomes a closed declaration plan rather than a union of product workflows.
- `composable-knowledge`: Profiles become complete declarative composition contracts including initialization, lifecycle and derived State declarations.
- `task-planning`: Captured planning semantics materialize through Profile declarations without planning-specific workflow kinds.
- `reminder-workflow`: Reminders become derived views and controls over scheduled notification Automations, with no Reminder entity or store.
- `declarative-automations`: Automations support explicit schedules with multiple occurrences and expose enough subject metadata for derived views.
- `state-evaluation`: Interpretation and Profile initialization may declare persisted modal State through the common declaration plan.
- `intent-execution`: Interpretation and Automations may declare validated Intents through the common declaration plan without direct execution.

## Impact

- Replaces interpretation workflow types, strict inference schema branches, validation, routing, outcome storage and prompts.
- Extends Profile, Automation trigger and registry contracts plus planning initialization.
- Removes reminder domain/store/module persistence and migrates HTTP reminder reads and controls to derived Automation operations.
- Changes the functional PostgreSQL schema by removing `automation_reminders` and generalizing workflow outcomes.
- Updates projections, OpenAPI behavior, tests, smoke documentation and main OpenSpec capabilities.
