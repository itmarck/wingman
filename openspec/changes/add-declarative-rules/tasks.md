## 1. Add Rule contracts

- [ ] 1.1 Add Given/When/Then, trigger, policy, lifecycle, and immutable registry contracts under `src/core/rule/`
- [ ] 1.2 Validate time, Event, and State-change triggers plus registered Intent templates and closed operators
- [ ] 1.3 Add policy validation for repetition, expiration, cooldown, occurrence limits, stopping, priority, and deduplication

## 2. Add Rule runtime

- [ ] 2.1 Add `src/modules/rule/` registration, dependency, due-work, evaluation-result, and lifecycle ports and memory adapters
- [ ] 2.2 Implement dependency-driven evaluator and worker that writes Intents but cannot access Capability adapters
- [ ] 2.3 Derive stable occurrence and deduplication identities from Rule and trigger context

## 3. Verify

- [ ] 3.1 Test false Given, time, Event, State change, repeated schedule, stop, expiration, cooldown, and duplicate-trigger scenarios
- [ ] 3.2 Verify unrelated State changes do not scan or evaluate unrelated Rules
- [ ] 3.3 Add Rule read/control APIs and run typecheck, full tests, build, and strict OpenSpec validation

