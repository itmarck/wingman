## Why

Wingman can pass compilation and behavior tests while still being semantically unreliable, difficult to evolve, opaque at its HTTP boundary, or unsafe under adversarial Entries. The iteration loop needs stable evidence and explicit exit thresholds across these qualities instead of stopping when no obvious bug is visible.

## What Changes

- Extend the existing `packages/evaluate` package into a small quality-gate runner covering semantic quality, simplicity, observability, HTTP contracts, security, evolution, and real-model quality.
- Define deterministic measurements and minimum exit thresholds for every axis, with machine-readable and human-readable reports.
- Keep the default quality gate fully local and isolated: fresh memory systems, loopback HTTP, local inference fixtures, no environment loading, database, migration, connector, delivery, or remote request.
- Keep real-model evaluation as an explicit opt-in lane that uses the configured production inference adapter but fresh memory state and in-memory telemetry.
- Add focused scenarios for ambiguous planning, mixed Entries, exact quotations, destructive text, authorization, invalid HTTP inputs, retry explanations, and adding a new workflow fixture without changing the evaluator core.
- Fail the gate when a required metric falls below its threshold, a required axis lacks evidence, or an unexpected side effect occurs.
- Use the reports to prioritize and correct the most important product or design issues, committing each completed iteration conventionally.

## Capabilities

### New Capabilities

- `quality-gates`: Defines isolated quality measurement, seven scored axes, exit thresholds, reports, and the optional real-model lane.

### Modified Capabilities

None.

## Impact

- Primarily affects `packages/evaluate`, package scripts, local test fixtures, and evaluator tests.
- May lead to small runtime, HTTP, prompt, validation, or module simplifications when a measured defect is found.
- Adds no production database schema or migration and changes no external API solely for reporting.
- Real-model evaluation may consume configured provider capacity only when explicitly requested.
