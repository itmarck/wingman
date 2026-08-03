## Why

Wingman can pass compilation and unit tests while remaining semantically unreliable, difficult to evolve, opaque at its HTTP boundary, or unsafe under adversarial Entries. Evaluation needs stable evidence and explicit exit thresholds without making ordinary tests consume inference tokens.

## What Changes

- Extend `packages/evaluate` into one quality evaluator covering semantic quality, simplicity, observability, HTTP contracts, security, evolution, and real-model quality.
- Keep `npm test` deterministic and independent from provider configuration.
- Make `npm run evaluate` the single explicit command that uses the configured inference target, fresh memory state, bounded cases, and ephemeral telemetry.
- Produce human-readable and JSON reports with named evidence, thresholds, critical failures, model identity, usage, duration, and instability.
- Fail evaluation when a required axis is below threshold, a critical invariant fails, or the configured provider is unavailable.

## Capabilities

### New Capabilities

- `quality-gates`: Defines seven scored quality axes, a complete evaluation report, explicit exit thresholds, and separation between deterministic tests and token-consuming evaluation.

### Modified Capabilities

None.

## Impact

- Affects `packages/evaluate`, package scripts, evaluator cases, and local structural checks.
- Adds no production database schema, migration, connector, or persistent evaluation state.
- `npm run evaluate` consumes capacity from the target configured in `.env`; `npm test` does not.
