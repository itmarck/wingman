## 1. Baseline and Draft Contract

- [x] 1.1 Run and record the existing deterministic tests, typecheck, and build before changing contracts
- [x] 1.2 Replace `RegisterInterpretationInput` with one `InterpretationDraft` containing an ordered declaration union, `resolutions`, and system-owned `decisions`
- [x] 1.3 Nest complete Component declarations inside optional-Profile Item declarations while preserving evidence, valid time, candidate status, supersession, uncertainty, and local references
- [x] 1.4 Rename resolution request and decision fields and types consistently without compatibility aliases, while retaining Review kind `referenceResolution`
- [x] 1.5 Update inference schema, output parsing, Policies, examples, freezing, and validation so models can emit `resolutions` but cannot author `decisions`
- [x] 1.6 Add Draft contract tests for descriptive Items, Profile Items, nested references, ambiguity, invalid contracts, and forbidden model decisions

## 2. Unified Publication

- [x] 2.1 Implement a pure Interpretation compiler that validates the complete Draft, resolves decisions and local dependencies, and produces one immutable publication plan
- [x] 2.2 Compile Profile initialization, Items, Component revisions, State, Automations, Intents, publication summary, and declaration outcomes through the same plan
- [x] 2.3 Make generated identities stable per Interpretation and declaration reference and verify idempotent recompilation and retry behavior
- [x] 2.4 Evolve memory lifecycle publication and Review completion to commit the complete plan atomically with rollback-on-failure tests
- [x] 2.5 Treat `needsInput` and `unsupported` as committed outcomes while rejecting invalid structures and persistence failures before partial visibility
- [x] 2.6 Remove the post-publication declaration publisher, duplicate registration contracts, standalone memory declaration registry, and obsolete tests and exports
- [x] 2.7 Add end-to-end Interpretation tests for direct publication, pending Review, reviewed publication, mixed outcomes, failure rollback, and duplicate prevention

## 3. Generic Execution and Launcher Inbox

- [x] 3.1 Move the notification Capability to the generic execution capability boundary without changing its input or delivery Event contract
- [x] 3.2 Implement an `ExecutionWorker` that selects every eligible pending Intent through existing consent, autonomy, condition, status, and Capability rules
- [x] 3.3 Update runtime work to evaluate due Automations and then drain eligible Intents without notification-key branching
- [x] 3.4 Move launcher inbox list, read, compaction, and acknowledgement behavior to an execution-facing read-model operation and preserve `/api/notifications`
- [x] 3.5 Remove the Notification module and worker and verify mixed-Capability execution, delivery, acknowledgement, subject independence, and compact inbox behavior

## 4. Projection and Suggestion Simplification

- [x] 4.1 Replace Projection registry ports, memory adapter, and one-method queries with one code-owned `ProjectionCatalog` that validates, lists, and reads builders
- [x] 4.2 Compose the Projection catalog directly over the knowledge snapshot source and verify it remains outside storage and persistence contracts
- [x] 4.3 Rename `src/modules/proactivity` and all exported services, policies, signals, registries, system fields, HTTP adapter names, tags, and tests to Suggestion vocabulary
- [x] 4.4 Preserve Suggestion detector, feedback, expiration, deduplication, and store behavior and verify Proposal remains a distinct environment-agnostic technical mutation resource
- [x] 4.5 Remove obsolete Projection and Proactivity files, exports, documentation, and aliases after behavior parity tests pass

## 5. Inference Source Folder

- [x] 5.1 Keep provider transport in organizational folder `packages/inference` with a directly imported entry file, root project configuration, and no imports from `src`
- [x] 5.2 Move provider request envelopes, HTTP timeout, Responses and Chat Completions decoding, safe error redaction, token usage, `Retry-After`, and normalized provider failures into the package
- [x] 5.3 Keep Interpretation instructions, input construction, schema validation, retry mapping, target configuration, and telemetry translation in the Wingman adapter
- [x] 5.4 Update root build, typecheck, test, and runtime scripts so `src`, `packages/evaluate`, and `packages/inference` are one Node.js and TypeScript project
- [x] 5.5 Keep provider transport tests beside the inference source and add adapter boundary tests proving structured-output and failure-category parity

## 6. Composition and Contract Cleanup

- [x] 6.1 Simplify system composition, runtime module surfaces, storage bundles, inspector data, and test support around the unified publication, execution, Projection, and Suggestion boundaries
- [x] 6.2 Update authenticated HTTP schemas and OpenAPI metadata only where renamed contracts require it, preserving current launcher and Proposal workflows
- [x] 6.3 Search production source for removed draft fields, Proactivity exports, Notification module types, Projection registry layers, and declaration publisher types and remove remaining runtime dependencies
- [x] 6.4 Keep changed logic files focused and preferably below 100 lines, splitting only behavior with a distinct responsibility and allowing declarative contracts to exceed that target

## 7. PostgreSQL Plan Reconciliation

- [x] 7.1 Update `implement-postgres-storage` proposal, design, delta specs, and tasks to consume the complete publication plan, generic execution worker, Suggestion names, and reduced volatile boundaries
- [x] 7.2 Reopen any completed PostgreSQL planning task whose acceptance criteria no longer match the simplified contracts
- [x] 7.3 Review `001_system.sql` against the final domain contracts and adjust only renamed or removed schema details while retaining declaration outcomes and Suggestions
- [x] 7.4 Verify the PostgreSQL plan adds no Notification, Projection, detector, registry, cache, or Proposal persistence and strictly validate both active changes

## 8. Final Verification

- [x] 8.1 Run formatting, typecheck, deterministic tests, package tests, and build and resolve every regression
- [x] 8.2 Smoke-test the principal authenticated memory workflow through Entry interpretation, pending Review or publication, derived knowledge, due execution, launcher acknowledgement, Suggestion feedback, Projection reads, and Proposal approval
- [x] 8.3 Compare final production file and line counts with the baseline and document only durable architectural decisions that are not already clear from code or OpenSpec
- [x] 8.4 Run strict OpenSpec validation for `simplify-domain-boundaries` and confirm every task and specification is satisfied before synchronization or archive
