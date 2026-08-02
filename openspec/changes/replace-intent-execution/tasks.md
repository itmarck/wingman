## 1. Build execution contracts

- [x] 1.1 Add Intent, Capability, autonomy, Attempt, Event, lifecycle, and idempotency contracts under `src/core/execution/`
- [x] 1.2 Add immutable Capability registration and hierarchical policy resolution tests
- [x] 1.3 Add `src/modules/execution/` stores, ports, proposal, authorization, Attempt, retry, cancellation, and outcome operations

## 2. Prove execution behavior

- [x] 2.1 Add a fake Capability covering success, failure, uncertain outcome, unsupported input, and idempotent retry
- [x] 2.2 Reevaluate State conditions before every Attempt and preserve distinct immutable Attempts and outcome Events
- [x] 2.3 Integrate existing approval boundaries and prevent execution beyond Capability safety ceilings

## 3. Replace legacy Intent

- [x] 3.1 Map existing Intent proposal behavior to the new execution API and update system composition and affected tests
- [x] 3.2 Delete the previous Intent entity, command, store contract, memory collection, and legacy imports
- [x] 3.3 Run typecheck, full tests, build, and strict OpenSpec validation with no legacy Intent runtime dependency
