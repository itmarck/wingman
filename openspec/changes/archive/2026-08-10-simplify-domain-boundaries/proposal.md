## Why

Wingman already uses generic Items, declarations, Intents, and Suggestions, but its implementation still preserves parallel publication paths and historical module names that make the system appear more specialized than its domain model. Simplifying these boundaries before PostgreSQL is implemented avoids persisting accidental concepts and reduces the amount of infrastructure that durable storage must reproduce.

## What Changes

- **BREAKING** Replace the parallel Interpretation input collections and post-publication declaration step with one validated draft, one compiled publication plan, and one atomic lifecycle publication boundary.
- **BREAKING** Rename Interpretation `referenceResolutions` to `resolutions` and `referenceDecisions` to `decisions`, including their related types and inference schema.
- Remove duplicate Interpretation registration, declaration registry, and publication abstractions once their behavior is owned by the unified publication lifecycle.
- Keep technical mutation `Proposal` behavior and availability unchanged; Proposal remains distinct from domain Intent and may be used in any environment to inspect pending LLM-derived mutations.
- Remove Notification as a module while retaining the notification Capability, derived launcher inbox, acknowledgement behavior, and generic Intent execution.
- Collapse generated Projection infrastructure into a code-owned in-memory catalog; projections remain derived and are not persisted.
- Replace the internal Proactivity vocabulary and module with the smaller Suggestion concept while preserving detectors, feedback, durable Suggestion facts, and `/api/suggestions` behavior.
- Move provider protocol, response parsing, usage extraction, retry metadata, and provider failure classification into `packages/inference`; keep Wingman prompts, policies, domain schemas, and Interpretation translation in `src`.
- Reconcile the pending PostgreSQL plan and baseline schema terminology with the simplified contracts before storage implementation continues.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interpretation-policy`: Interpretation produces one closed draft that is validated and published through one atomic plan, using the shortened resolution vocabulary.
- `proactive-assistance`: Suggestion becomes the sole product and implementation vocabulary for proactive findings while Proposal remains reserved for technical mutations.

## Impact

- Affects Interpretation domain inputs, inference schemas, validation, registration, Review resolution, system lifecycle composition, tests, and provider guidance.
- Removes or folds `src/modules/notification`, most Projection registry/query layering, declaration publication infrastructure, and the `proactivity` module name.
- Adds non-domain provider transport under the organizational `packages/inference` folder and narrows `src/adapters/inference` to Wingman-specific translation and composition; it remains part of the root Node.js project rather than an npm workspace package.
- Preserves authenticated HTTP behavior except for any diagnostic surface that directly exposes renamed Interpretation draft fields.
- Requires updating `implement-postgres-storage` artifacts and `001_system.sql` only where renamed or removed implementation concepts affect the planned durable boundary; it introduces no new domain tables.
