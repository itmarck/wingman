## Why

The existing Intent records only an action key, evidence, and optional schedule; it cannot safely authorize, attempt, retry, or observe effects. It must be replaced before Rules or proactive behavior can rely on it.

## What Changes

- Replace Intent with a conditional proposal containing a registered Capability, validated input, proposer, State conditions, expected State, authorization policy, and optional trigger.
- Add immutable Capability registration, hierarchical autonomy, Attempt records, outcome Events, and capability-specific idempotency.
- Keep Entry and Event separate while allowing shared causation for one external input.
- Reevaluate conditions immediately before every Attempt and distinguish unsupported, stale, cancelled, failed, uncertain, and successful outcomes.
- **BREAKING**: Remove the previous minimal Intent entity, store contract, command, and tests after migration in this change.

## Capabilities

### New Capabilities

- `intent-execution`: Propose, authorize, attempt, retry, and observe registered effects without conflating Intent, Attempt, Event, or State.

### Modified Capabilities

None.

## Impact

- Requires the archived composable knowledge and State changes.
- Replaces `src/modules/intent` and affects system composition, approval, storage, future adapters, and tests.
- Introduces no production side-effect Capability in this change.

