## Why

Wingman needs deterministic reactivity that can use time, Events, and State without embedding domain behavior in Components or allowing inference to execute arbitrary code.

## What Changes

- Add closed declarative Rules with zero or more Given conditions, one When trigger, and one or more Then Intent templates.
- Support time, Event, and State-change triggers plus explicit repetition, expiration, cooldown, stopping, priority, and deduplication policies.
- Index Rule dependencies and next evaluation time instead of scanning all knowledge.
- Restrict Then to registered Intent templates; Rules never invoke Capabilities directly.

## Capabilities

### New Capabilities

- `declarative-rules`: Register, evaluate, explain, and schedule safe Given/When/Then Rules that produce validated Intents.

### Modified Capabilities

None.

## Impact

- Requires archived State evaluation and Intent execution changes.
- Adds Rule contracts, registry, dependency projections, in-memory worker, and tests with fake Capabilities.

