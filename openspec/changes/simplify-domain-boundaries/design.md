## Context

See `proposal.md` for motivation. Interpretation currently splits direct Items and Component revisions from a second declaration envelope, publishes the first group through `InterpretationLifecycle`, and then invokes a separate declaration publisher. That second path owns local dependency resolution and declaration outcomes, so a completed Interpretation can exist before all of its effects are applied. The same concepts are represented by overlapping registration types and memory stores.

Notification behavior is already derived from Automations, Intents, and Events, but a Notification module and worker specialize the generic execution path. Projections are code-owned builders but retain registry ports, a memory adapter, and query objects as if they were persisted plugins. Suggestion is the public model, while source composition still uses Proactivity names. Provider HTTP behavior is independent of Wingman's domain but is coupled to Interpretation parsing in `src/adapters/inference`.

The pending `implement-postgres-storage` change has not implemented domain persistence yet, but its artifacts and fresh baseline describe the current ports. This change must establish the smaller contracts before PostgreSQL adapters are built.

## Goals / Non-Goals

**Goals:**

- Give every Interpretation exactly one draft shape, compiler, publication plan, and atomic lifecycle boundary.
- Remove implementation concepts that do not own distinct state or behavior.
- Keep domain code in `src` and isolate only reusable provider transport in `packages/inference`.
- Preserve current HTTP workflows, Proposal approval, Review behavior, and semantic outcomes.
- Leave PostgreSQL with fewer ports and no Notification or Projection persistence responsibilities.

**Non-Goals:**

- Merge Proposal with Intent or Suggestion, restrict Proposal by environment, or change mutation modes.
- Change Profiles, Capability autonomy, Intent consent, Review's `referenceResolution` kind, or supported planning behavior.
- Persist projections, caches, registries, detectors, pending Proposal callbacks, or notification views.
- Add use-case declarations, an ORM, an external queue, Redis, or another deployed service.
- Preserve the old Interpretation draft field names; there is no production data or compatibility requirement.

## Decisions

### 1. Use one nested Interpretation Draft

`RegisterInterpretationInput` becomes `InterpretationDraft`. It contains `entryId`, one `declarations` array, optional `resolutions`, and optional system-owned `decisions`. The closed declaration union remains `item | state | automation | intent`; these are semantic primitives rather than product request kinds.

An Item declaration owns its Component declarations directly. Its Profile is optional so descriptive knowledge remains possible, while an operational Item selects a Profile and receives Profile-owned initial Components, lifecycle, and State templates. Component declarations retain source locators, valid time, candidate status, and supersession so nesting does not reduce evidence or conflict behavior.

Resolution vocabulary is shortened consistently:

- `referenceResolutions` becomes `resolutions`.
- `referenceDecisions` becomes `decisions`.
- `ReferenceResolutionRequest` becomes `ResolutionRequest`.
- `ReferenceDecision` becomes `ResolutionDecision`.

The inference contract may produce `resolutions` but never `decisions`; only the Review lifecycle supplies decisions. Review continues to use the single `referenceResolution` contract required by the project.

Keeping parallel arrays was rejected because it permits two representations of Items and forces two publication paths. Making Profile mandatory was rejected because descriptive knowledge intentionally needs no specialized operational contract.

### 2. Compile declarations before publishing anything

A pure compiler receives the retained Draft, current knowledge snapshot, registries, resolved decisions, stable identifiers, and publication time. It validates the entire Draft, resolves Item-local references, orders explicit dependencies, applies Profiles, and produces one immutable `InterpretationPublicationPlan` containing Items, Component revisions, State, Automations, Intents, declaration outcomes, and the publication summary.

`needsInput` and `unsupported` are successful declaration outcomes and may coexist with publishable facts. Structural invalidity, unknown registered contracts, invalid references, or failed plan persistence reject the whole publication. Identifiers are allocated deterministically for one Interpretation and local declaration reference so recompilation and persistence retries remain idempotent.

`InterpretationLifecycle.publish` and `publishReview` accept the complete plan and own atomic persistence. Review completion recompiles the stored Draft with system decisions and uses the same lifecycle method. The post-publication `EntryDeclarationPublisher`, `InterpretationDeclarationPublisher`, duplicate Item/Interpretation registration shapes, and standalone memory declaration registry are removed; declaration outcomes remain part of the plan because they are durable facts in the PostgreSQL design.

Executing declarations after marking Interpretation complete was rejected because it exposes partial success and makes durable rollback impossible. A universal repository was rejected because publication atomicity does not erase the distinct query contracts of knowledge, execution, State, and Automation.

### 3. Keep Proposal unchanged and orthogonal

Proposal remains the in-memory technical mutation preview used by approval mode. It is available in development and production composition, and its existing API and pending callback behavior remain unchanged. It does not become a declaration, persistent domain fact, Intent, or Suggestion.

Environment-gating Proposal was rejected because its purpose is to inspect and approve model-derived mutations wherever approval mode is configured, not to provide a development database sandbox.

### 4. Remove the Notification module, not notification behavior

The registered notification Capability moves beside other execution capabilities and continues to validate semantic message and priority input. A generic `ExecutionWorker` claims and executes every eligible Intent according to consent, autonomy, conditions, and Capability policy; it does not special-case notification. Runtime work evaluates due Automations and then drains eligible Intents, allowing produced notification Intents to use the same path as future Capabilities.

The launcher inbox remains a read model over Automation, Intent, and delivery/acknowledgement Events. Its query and acknowledgement operation move to the execution-facing application boundary, while the authenticated `/api/notifications` adapter remains stable. Acknowledgement still appends an immutable Event and never completes the subject Item.

Keeping a Notification worker was rejected because the Capability and derived inbox already contain all distinct behavior. Moving notification views into durable storage was rejected because they are projections of existing facts.

### 5. Replace Projection infrastructure with one code-owned catalog

`ProjectionCatalog` owns the immutable map of registered projection builders and exposes list/read directly. Reading obtains the current knowledge snapshot and invokes the selected builder. Key validation and duplicate detection occur once in the catalog constructor.

The Projection domain result and metadata types remain, but registry ports, memory adapters, and one-method query classes are removed. The catalog is constructed in system composition and is never part of `SystemStorage`. A future cache may wrap reads with a local versioned TTL/LRU implementation without changing Projection semantics or adding tables.

A generic plugin registry was rejected because projection definitions are trusted code, not runtime extensions. PostgreSQL and Redis-backed projections were rejected because no current projection requires independent durability.

### 6. Make Suggestion the only assistance module vocabulary

`src/modules/proactivity` becomes `src/modules/suggestion`. Service, policy, signal, registry, HTTP adapter, OpenAPI tags, configuration, tests, and system fields use Suggestion-oriented names. Detectors remain deterministic code-owned definitions, while Suggestion records and feedback keep their existing lifecycle and storage port.

The adjective “proactive” may remain in explanatory prose, but it is not a resource, module, API tag, or exported type. Proposal remains explicitly separate.

Keeping a Proactivity shell around Suggestion was rejected because it contributes no separate lifecycle or invariant.

### 7. Isolate provider transport in a regular source folder

`packages/inference` is an organizational source folder in the root Node.js project with no imports from `src`. It owns provider request envelopes, Responses and Chat Completions response decoding, safe provider-message redaction, token usage, `Retry-After`, timeout handling, and normalized failure categories. Its `index.ts` file accepts generic instructions, input, reasoning, and a JSON schema, then returns parsed structured JSON plus provider model and usage metadata or inference-owned errors.

The Wingman adapter in `src` owns target configuration, builds Interpretation-specific instructions and input, supplies the Interpretation JSON schema, validates the returned structured value, maps package failures into Interpretation retry categories, and records domain telemetry. Prompts, Policies, Draft types, domain validators, and provider-independent retry scheduling remain in `src`.

The folder uses the root `package.json`, TypeScript configuration, dependencies, build, typecheck, and test commands. Wingman imports its `index.ts` directly by relative path, just as other internal source files are imported. `packages/evaluate` follows the same model and has no independent TypeScript project.

Moving the entire adapter was rejected because that would make generic provider transport depend on Wingman's Interpretation domain. A real npm workspace package was rejected because this code is neither published nor consumed independently and its manifest, dependency link, build ordering, and TypeScript project add maintenance without enforcing a needed deployment boundary. Leaving provider protocols in `src` was rejected because they are the clearest non-domain complexity that can be isolated physically.

### 8. Reconcile PostgreSQL planning after the contracts settle

This change runs before the remaining `implement-postgres-storage` tasks. Its proposal, design, specs, tasks, and `001_system.sql` are updated where they mention removed ports, Proactivity terminology, parallel declaration publication, or superseded draft shapes. Already completed PostgreSQL planning tasks are reopened only if their acceptance criteria are no longer true.

The database still persists declaration outcomes and Suggestions, but it does not gain Notification, Projection, detector, registry, cache, or Proposal tables. The unified Interpretation plan becomes the one compound transaction described by the PostgreSQL change.

Implementing PostgreSQL first was rejected because it would create adapters and transaction contracts that this simplification immediately removes.

## Risks / Trade-offs

- **[The unified Item declaration loses existing evidence detail]** -> Preserve every current Component field in the nested declaration and add parity tests for descriptive, operational, conflicting, and superseding knowledge.
- **[A generic ExecutionWorker executes an unintended pending Intent]** -> Reuse the existing consent, autonomy, condition, status, and Capability eligibility checks and test mixed Capabilities rather than selecting by key.
- **[Atomic publication makes recoverable outcomes look like failures]** -> Treat `needsInput` and `unsupported` as explicit plan outcomes; reserve rollback for invalid plans and persistence failures.
- **[The organizational folder drifts from the root project]** -> Compile and test `packages/**/*.ts` from the root configuration and keep one direct `index.ts` import boundary.
- **[Renames silently leave old vocabulary]** -> Add repository-wide assertions for removed field, module, route-tag, and exported-type names while allowing human prose that describes proactive behavior.
- **[The pending PostgreSQL change drifts from implemented contracts]** -> Reconcile and strictly validate both OpenSpec changes before any PostgreSQL adapter task resumes.

## Migration Plan

1. Capture the current deterministic test, typecheck, and build baseline.
2. Introduce the new Draft vocabulary and inference schema without compatibility aliases, then update Review handling and tests.
3. Add the compiler and complete publication plan, move every declaration effect into the lifecycle, and remove the second publication path.
4. Replace the Notification worker with generic execution work and retain the derived launcher inbox behavior.
5. Collapse Projection infrastructure and rename Proactivity to Suggestion.
6. Extract and integrate the inference source folder with transport parity tests.
7. Reconcile the PostgreSQL change and fresh migration baseline, then run all quality gates and strict OpenSpec validation.

Because there is no production data or public draft contract, rollback is a source rollback rather than a data migration. PostgreSQL implementation must not continue from superseded ports if this change is partially applied.
