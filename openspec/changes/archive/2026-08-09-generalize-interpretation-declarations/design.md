## Context

Interpretation currently publishes generic knowledge but routes operational meaning through a closed `planningRequest | reminderRequest` union. Planning commands then add system-owned lifecycle/default values, while Reminder duplicates schedule, subject, message, lifecycle and evidence already represented by Automations. The runtime uses memory stores for functional data, but migrations define the intended durable schema.

## Goals / Non-Goals

**Goals:**

- Make the interpretation output language stable across product domains.
- Keep provider output declarative, closed and incapable of invoking adapters.
- Make Profile the only contract needed to validate and initialize an operational Item.
- Represent one reminder with one scheduled notification Automation and derive its user-facing view.
- Preserve evidence, Reviews, idempotency, authorization and explainable outcomes.

**Non-Goals:**

- Dynamically register Profiles, Components, triggers or Capabilities from Entries.
- Turn arbitrary JSON operation names into executable commands.
- Add a production notification provider or PostgreSQL functional adapters.
- Generalize every internal implementation behind a common repository.

## Decisions

### Interpretation emits semantic declarations

Replace `workflows` with four explicit declaration collections: operational Items, persisted States, Automations and Intents. Existing knowledge Item/Component drafts remain the canonical descriptive representation. Every operational declaration owns a local `reference`, `dependsOn` references and `unresolved` source fields. A generic declaration publisher validates the whole graph, resolves local Item references, orders dependencies and records an outcome per reference.

Separate collections are preferred over an open `operation: string` envelope because they keep strict provider schemas small enough to audit and prevent domain commands from becoming an unofficial extension language. Product domains extend registries and projections, not declaration kinds.

### Profile owns composition and behavior declaratively

Extend Profile with required and optional Component requirements, initial Component templates, lifecycle configuration and persisted State templates. Templates may reference the Item being created and the publication timestamp through closed placeholders resolved by the system. Profile validation ensures every initial Component uses a declared schema and lifecycle values are internally consistent.

Profile remains data and pure validation. It does not hold callbacks, stores or adapters. Planning transition code reads lifecycle configuration from the registered Profile rather than a parallel hard-coded map. This keeps one source of truth without introducing `CompositionPolicy`.

### One scheduled Automation replaces Reminder

Add a registered `schedule` trigger containing one or more unique UTC instants. The Automation runtime cursor derives the next unconsumed occurrence; each evaluation uses the occurrence as its deduplication identity. Exhaustion stops the Automation. Add optional subject Item references so projections can query automations without parsing Capability input.

A reminder is a projection of an Automation whose Then templates target `notification`. The existing reminder HTTP paths may remain temporarily as compatibility views and controls, but they no longer expose or persist a Reminder ID distinct from the Automation ID. Creation directly registers the Automation, cancellation stops it, and rescheduling replaces its schedule using an immutable revised Automation definition or a controlled update that preserves evaluation history.

### Declaration outcomes replace workflow outcomes

Generalize outcome `kind` to the stable declaration categories and retain the `(entryId, reference)` idempotency key. `needsInput`, `unsupported`, `failed` and `applied` retain their meanings. Valid independent declarations may publish when a dependent declaration needs input; no external effect is executed during publication.

### Compatibility is temporary and one-way

The provider schema stops accepting `planningRequest` and `reminderRequest` in this change. HTTP planning commands remain because they are structured application operations, not interpretation language. Reminder read/control routes become derived compatibility surfaces and can later be renamed without retaining a Reminder aggregate.

## Risks / Trade-offs

- [Profile becomes too broad] → Keep every field declarative, versioned and limited to Item composition, lifecycle and State templates; Capability and Automation behavior stay separate.
- [Strict inference output grows] → Use separate declaration arrays with reusable schemas and eliminate duplicated workflow normalization.
- [Local references cross declaration types] → Resolve one dependency graph before publication and reject cycles or missing references.
- [Removing Reminder loses grouping] → One schedule Automation owns all occurrences, lifecycle and control, so no grouping entity is needed.
- [Automation schedule mutation damages audit] → Preserve evaluations and deduplication identities and treat consumed occurrences as immutable history.
- [Breaking provider prompt temporarily lowers semantic quality] → Add deterministic schema tests and real smoke coverage for planning, needs-input, unsupported triggers and reminders.

## Migration Plan

1. Extend Profile and Automation contracts with tests while retaining existing callers.
2. Add declaration domain types, strict provider schema, validation and outcome publication.
3. Express planning and reminder interpretation fixtures through declarations and remove workflow routing.
4. Replace Reminder storage and service behavior with scheduled Automations and derived reads/controls.
5. Add a migration that generalizes outcome kinds and removes the Reminder table; migrations remain append-only.
6. Update HTTP/OpenAPI, projections, system composition, docs and smoke expectations.
7. Run formatting, typecheck, full tests, build and strict OpenSpec validation.

Rollback uses code rollback plus process restart because functional runtime storage remains in memory. The append-only database migration requires a compensating forward migration if it has already been deployed.
