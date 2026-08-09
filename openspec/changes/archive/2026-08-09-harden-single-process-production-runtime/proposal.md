## Why

Wingman will run long term as one Railway service, so interpretation, scheduling and execution must share a resilient lifecycle and distinguish transient provider failures from quota, invalid output and permanent configuration errors.

## What Changes

- Keep HTTP, interpretation, Automation scheduling and Intent execution in one long-lived process.
- Limit automatic processing to three total attempts with category-aware increasing delays.
- Honor provider `Retry-After` or reset timing for quota and rate limits; avoid rapid retries during outages.
- Retry invalid model responses with short increasing delays, while authentication and configuration errors fail immediately.
- Preserve provider agnosticism: `INFERENCE_TARGET` selects one registered adapter with no automatic fallback.
- Keep the initial system mutation policy at `approval`; a missing request header remains `readonly`, and production may move to `write` through configuration.
- Add Railway-oriented lifecycle checks and an end-to-end local production smoke scenario.

## Capabilities

### New Capabilities

- `production-runtime`: Single-process lifecycle, classified retries, Railway operation and mutation/inference configuration boundaries.

### Modified Capabilities

- `quality-gates`: Add deterministic coverage for classified retries, runtime shutdown and the complete launcher flow.

## Impact

Processing errors, retry scheduling, configuration, Runtime composition, polling tests, telemetry evidence, deployment documentation and quality gates are affected. No provider-specific behavior enters the domain.
