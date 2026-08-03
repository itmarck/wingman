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
- **WHEN** the model returns the right terminal status but loses an exact quote, creates the wrong workflow, or emits invalid structured output
- **THEN** real-model quality decreases and the report identifies the failing case

### Requirement: Structural quality measurement
The evaluator SHALL measure simplicity, observability, HTTP contracts, security, and evolution through focused checks with stable evidence and without a scripted deterministic smoke workflow.

#### Scenario: Stable contract regresses
- **WHEN** dependency direction, public workflow status, authentication, trusted origin, or generic scoring behavior regresses
- **THEN** the corresponding axis fails with actionable evidence
