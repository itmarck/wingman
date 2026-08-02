## Purpose

Provide repeatable evidence that Wingman remains semantically useful, simple, observable, secure, evolvable, and compatible at its HTTP and inference boundaries.

## ADDED Requirements

### Requirement: Seven-axis quality report
The system SHALL produce named scores from 0 through 100 for semantic quality, simplicity, observability, HTTP contracts, security, evolution, and real-model quality. Every score SHALL identify its measurements, passed and failed checks, evidence, and configured threshold.

#### Scenario: Inspect a local quality run
- **WHEN** a developer runs the default quality command
- **THEN** the report contains evidence for the six locally measurable axes and marks real-model quality as not run rather than treating missing evidence as a pass

#### Scenario: Inspect a real-model run
- **WHEN** a developer explicitly enables real-model evaluation with valid inference configuration
- **THEN** the report includes semantic case pass rate, instability across requested repetitions, inference errors, model identity, usage, and duration without persisting prompts or Entries

### Requirement: Explicit exit decision
The evaluator SHALL return success only when every required executed axis meets its declared threshold and every critical invariant passes. The report SHALL distinguish `pass`, `fail`, and `notRun` so an unavailable optional lane cannot silently improve the aggregate result.

#### Scenario: One metric is below threshold
- **WHEN** any required local axis scores below its threshold
- **THEN** the command exits nonzero and lists the checks with the greatest threshold impact

#### Scenario: Local gate reaches its exit threshold
- **WHEN** all required local axes meet their thresholds and all critical invariants pass
- **THEN** the local report declares that the deterministic iteration loop may stop

### Requirement: Isolated deterministic lane
The default quality command SHALL use fresh in-memory systems, deterministic local adapters, loopback HTTP, and guaranteed cleanup. It MUST NOT read environment files, contact remote inference or connectors, deliver notifications, access PostgreSQL, or run migrations.

#### Scenario: Repeat local evaluation
- **WHEN** the local quality command runs twice against an unchanged revision
- **THEN** normalized checks and scores are identical and neither run observes state from the other

### Requirement: Semantic quality measurement
Semantic quality SHALL measure observable outcomes for knowledge, quotations, planning, habits, objectives, reminders, mixed requests, ambiguity, and unsupported capabilities rather than matching implementation-specific classes.

#### Scenario: Entry has a partially correct interpretation
- **WHEN** an Entry has the right terminal status but loses an exact quote, creates the wrong workflow profile, or silently drops an unsupported outcome
- **THEN** the semantic score decreases and the report identifies the failed expectation

### Requirement: Simplicity measurement
Simplicity SHALL use documented, deterministic repository signals that expose dependency direction violations, cycles, oversized production files, and evaluator-specific coupling. Generated output and test fixtures SHALL NOT count as production complexity.

#### Scenario: A module gains an inward dependency violation
- **WHEN** stable core code imports a module, adapter, or system dependency
- **THEN** a critical simplicity check fails with the importing file and dependency

### Requirement: Observability measurement
Observability SHALL verify that processing failures, exhausted retries, incomplete workflows, unsupported capabilities, and applied outcomes are distinguishable through public status responses with actionable reasons and stable identifiers.

#### Scenario: Workflow cannot be applied
- **WHEN** a workflow is incomplete, unsupported, or fails during routing
- **THEN** the evaluator verifies that the Entry status exposes the workflow reference, kind, status, and an explanatory reason without requiring log inspection

### Requirement: HTTP contract measurement
HTTP contract quality SHALL exercise the authenticated API and OpenAPI document for success, authentication failure, malformed input, unknown resources, mutation-mode enforcement, and stable error envelopes.

#### Scenario: Invalid authenticated request
- **WHEN** an authenticated client submits an invalid Entry payload
- **THEN** the API rejects it with the documented status and a non-sensitive structured error while the HTTP contract score records the result

### Requirement: Security measurement
Security SHALL include critical invariants for authentication, trusted connector origin, non-execution of destructive Entry text, lack of external effects in local runs, and rejection of inference output outside the closed contract. A failed critical security check SHALL fail the entire gate regardless of aggregate score.

#### Scenario: Destructive text is captured
- **WHEN** an Entry requests deletion of a concrete project directory
- **THEN** the evaluator verifies that Wingman may create an explainable planning Item but creates no executable Intent, Attempt, connector call, or observed success State

### Requirement: Evolution measurement
Evolution quality SHALL verify that new semantic scenarios and closed workflow fixtures can be registered through stable extension surfaces without editing the quality runner core or introducing feature-specific evaluator branches.

#### Scenario: Add a supported scenario fixture
- **WHEN** a new evaluation scenario is registered using the public evaluator contract
- **THEN** it participates in scoring and reporting without changing the runner, score calculation, or report formatter

### Requirement: Real-model lane is explicit and bounded
Real-model evaluation SHALL run only through an explicit command, SHALL use the configured production inference adapter with a fresh memory system per case and repetition, and SHALL support case selection and repetition limits.

#### Scenario: Default quality run has provider credentials available
- **WHEN** credentials exist but the developer runs only the default local quality command
- **THEN** no remote inference request occurs and real-model quality is reported as `notRun`

#### Scenario: Real model violates a critical semantic invariant
- **WHEN** the configured model fabricates an executable effect, corrupts an exact quotation, or repeatedly emits invalid closed-contract output
- **THEN** the real-model lane fails and reports the case, observed output category, attempts, and model identity
