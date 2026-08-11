# quality-gates Specification

## Purpose

Provide repeatable evidence that Wingman remains semantically useful, simple, observable, secure, evolvable, and compatible at its HTTP and inference boundaries.

## Requirements

### Requirement: Seven-axis evaluation report
The evaluator SHALL produce named scores from 0 through 100 for semantic quality, simplicity, observability, HTTP contracts, security, evolution, and real-model quality. Every score SHALL identify its checks, evidence, configured threshold, and failures.

#### Scenario: Run complete evaluation
- **WHEN** a developer runs `npm run evaluate` with valid inference configuration
- **THEN** one report contains all seven axes plus model identity, usage, duration, inference errors, and instability without persisting prompts or Entries

### Requirement: Tests do not consume inference
The deterministic test command MUST NOT load inference credentials, contact an inference provider, or consume model tokens.

#### Scenario: Run unit tests without provider access
- **WHEN** a developer runs `npm test` without inference configuration or network access
- **THEN** the deterministic test suite runs without invoking real-model evaluation

### Requirement: Explicit exit decision
Evaluation SHALL return success only when every axis meets its declared threshold and every critical invariant passes. Provider authentication, quota, availability, timeout, schema, and semantic failures SHALL remain visible and SHALL NOT trigger automatic fallback.

#### Scenario: One required check fails
- **WHEN** an axis falls below threshold or a critical invariant fails
- **THEN** evaluation exits nonzero and identifies the failed checks and evidence

### Requirement: Isolated bounded model evaluation
Evaluation SHALL use the configured inference adapter with a fresh in-memory system per case and repetition, ephemeral telemetry, case selection, repetition limits, attempt limits, and timeouts.

#### Scenario: Evaluate a selected case
- **WHEN** a developer selects one semantic case with bounded attempts and timeout
- **THEN** only that case calls the configured model and no Entry, prompt, effect, or telemetry survives the run

### Requirement: Semantic quality measurement
Semantic quality SHALL measure observable outcomes for exact quotations, Reviews, planning, reminders, unsupported capabilities, and destructive requests rather than implementation-specific classes.

#### Scenario: Model produces a partially correct interpretation
- **WHEN** the model returns the right terminal status but loses an exact quote, creates the wrong declaration, or emits invalid structured output
- **THEN** real-model quality decreases and the report identifies the failing case

### Requirement: Structural quality measurement
The evaluator SHALL measure simplicity, observability, HTTP contracts, security, and evolution through focused checks with stable evidence and without a scripted deterministic smoke scenario.

#### Scenario: Stable contract regresses
- **WHEN** dependency direction, public declaration status, authentication, trusted origin, or generic scoring behavior regresses
- **THEN** the corresponding axis fails with actionable evidence

### Requirement: Production runtime verification
Deterministic tests SHALL cover classified retry timing, three-attempt exhaustion, terminal configuration failures and coordinated runtime shutdown.

#### Scenario: Runtime behavior regresses
- **WHEN** retry classification or lifecycle ownership changes incompatibly
- **THEN** the deterministic quality gate fails with focused evidence

### Requirement: Launcher production smoke flow
A local production smoke test SHALL authenticate as the launcher and exercise Entry creation, processing, pending Review visibility, derived notification acknowledgement and health.

#### Scenario: Complete smoke flow succeeds
- **WHEN** a developer runs the documented smoke scenario with valid local configuration
- **THEN** API responses and derived effects demonstrate the complete single-process flow

### Requirement: Real-model consent contract
Real-model evaluation SHALL reject autonomy vocabulary in Intent consent and SHALL verify an explicit notification request produces contract-valid Item and Automation declarations with the configured target.

#### Scenario: Model emits execute as consent
- **WHEN** model output contains `consent: execute`
- **THEN** schema validation fails and evaluation identifies the consent contract violation

#### Scenario: Notification declaration succeeds
- **WHEN** the configured target interprets an explicit scheduled notification request
- **THEN** Item and Automation declarations are applied without an invalid-response retry

#### Scenario: Malformed Automation envelope
- **WHEN** model output uses a string Trigger operator or omits required Intent-template fields
- **THEN** structured-output validation rejects it before publication

### Requirement: Boundary-focused verification
Verification SHALL separate pure domain behavior, PostgreSQL persistence behavior, deterministic Interpretation/inference behavior, and complete HTTP integration so each behavior is tested at the narrowest boundary that provides confidence without duplicating it across storage implementations.

#### Scenario: Domain rule is verified
- **WHEN** validation, an invariant, or a deterministic lifecycle decision does not require persistence or a live model
- **THEN** a fast test verifies it without starting PostgreSQL or calling inference infrastructure

#### Scenario: Interpretation integration is verified
- **WHEN** Interpretation request construction, structured output validation, retry classification, or orchestration is tested
- **THEN** deterministic model fixtures provide reproducible results without consuming model tokens

#### Scenario: Model quality is evaluated
- **WHEN** the semantic quality of a configured model must be measured
- **THEN** an explicit evaluation runs separately from deterministic domain, persistence, and HTTP gates

### Requirement: Focused PostgreSQL adapter contracts
PostgreSQL contract tests SHALL verify the observable behavior of every durable port against native PostgreSQL 18.4 and SHALL avoid repeating domain scenarios that do not depend on persistence semantics.

#### Scenario: Adapter behavior diverges
- **WHEN** a PostgreSQL adapter changes hydration, ordering, pagination, atomicity, conflict, or immutable-history behavior
- **THEN** a focused adapter contract identifies the divergence through the domain port

### Requirement: PostgreSQL durability verification
PostgreSQL integration tests SHALL verify migrations, transaction rollback, restart recovery, lease recovery, concurrent claims, lifecycle conflicts, Automation deduplication, and Intent idempotency against a harness-owned ephemeral PostgreSQL 18.4 process.

#### Scenario: Compound write fails
- **WHEN** an injected failure interrupts a transactional publication
- **THEN** integration verification proves that no partial publication remains

#### Scenario: System is recreated
- **WHEN** one system instance writes a principal workflow and a new instance opens the same database
- **THEN** the second instance observes the committed workflow and can continue pending work

### Requirement: Self-contained PostgreSQL test target
PostgreSQL verification SHALL start and stop native PostgreSQL 18.4 through `embedded-postgres`, SHALL use harness-generated temporary storage and loopback connectivity, SHALL NOT consume the configured application `DATABASE_URL`, and SHALL keep the fast deterministic test command usable without PostgreSQL.

#### Scenario: Test database is not configured
- **WHEN** a developer runs the fast deterministic test command
- **THEN** pure domain and deterministic Interpretation/inference tests run without attempting to connect to PostgreSQL or a live model

#### Scenario: PostgreSQL suite starts
- **WHEN** a developer runs the dedicated PostgreSQL test command
- **THEN** the harness starts PostgreSQL 18.4 on a generated local target, applies repository migrations, isolates test data, and removes its temporary cluster after completion

#### Scenario: Application database is configured
- **WHEN** `DATABASE_URL` points to a development, staging, or production database while PostgreSQL tests run
- **THEN** the harness ignores it and only migrates, queries, and cleans the cluster it created

### Requirement: Minimal complete HTTP integration
A small PostgreSQL-backed HTTP suite SHALL run after migrations against the harness-owned PostgreSQL 18.4 process with deterministic inference and SHALL verify the critical cross-boundary workflows without duplicating exhaustive domain or adapter coverage.

#### Scenario: Captured Entry survives restart
- **WHEN** an authenticated client captures an Entry, deterministic Interpretation commits its publication, and the application is recreated against the same harness database
- **THEN** the API exposes the original Entry, terminal Interpretation state, and published durable knowledge without reprocessing the completed work

#### Scenario: Review completes publication
- **WHEN** deterministic Interpretation produces a pending Review and an authenticated client resolves it
- **THEN** the API exposes one completed resolution and its atomic durable publication after restart

#### Scenario: Durable execution is acknowledged
- **WHEN** an Automation produces a consented notification Intent and the worker executes it
- **THEN** the API exposes one durable Attempt and Event, allows acknowledgement through the launcher view, and does not duplicate the capability effect after restart

#### Scenario: Suggestion transition remains consistent
- **WHEN** an authenticated client accepts a Suggestion associated with an Intent
- **THEN** the API exposes consistent Suggestion feedback and Intent consent after restart without either side committing alone

#### Scenario: HTTP suite changes storage bootstrap
- **WHEN** PostgreSQL composition becomes available during the migration
- **THEN** the same storage-independent HTTP test bodies switch from the transitional characterization fixture to harness-owned PostgreSQL and the memory bootstrap is removed
