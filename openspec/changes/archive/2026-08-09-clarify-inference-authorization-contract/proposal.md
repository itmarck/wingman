## Why

The configured Gemini target confuses Intent consent with Capability autonomy and emits `authorization: "execute"`, causing otherwise valid notification declarations to exhaust retries.

## What Changes

- Define `authorization` explicitly as a consent requirement limited to `none | explicit`.
- Describe the distinction in both inference policy and the structured-output schema.
- Expose exact Component, Trigger and Capability value shapes and constrain Automation/Intent structure in the inference schema.
- Reconcile deadline derivation so an explicit reminder with only a deadline can use that boundary as its single occurrence.
- Keep strict validation; do not coerce autonomy values into authorization.
- Add deterministic contract coverage and verify the notification declaration with the real configured target.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `interpretation-policy`: Inference must distinguish Intent authorization from Capability autonomy and honor registered Component/Profile contracts.
- `quality-gates`: Real-model evaluation must detect invalid authorization vocabulary.

## Impact

Interpretation guidance, registered contract descriptions, inference JSON Schema, tests and real-model evaluation evidence change. Domain entities and HTTP contracts do not change.
