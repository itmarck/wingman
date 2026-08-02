## 1. Add detector contracts

- [ ] 1.1 Add detector, proposal explanation, urgency, expiration, and feedback contracts under `src/modules/proactivity/`
- [ ] 1.2 Register deterministic detectors for missing next action, blocker duration, deadline risk, inactivity, conflict, and relevant new knowledge or Event
- [ ] 1.3 Add dependency indexes and deduplication so unrelated changes and repeated detections do not create noise

## 2. Add bounded proposal behavior

- [ ] 2.1 Produce explainable Rules or Intents containing detector, State, evidence, rationale, expected effect, urgency, and expiration
- [ ] 2.2 Resolve global, Capability, user, explicit authorization, and safety-ceiling policy for every proposed Intent
- [ ] 2.3 Add accept, reject, modify, postpone, expire, and complete feedback operations without implicit unrelated preference changes

## 3. Verify semantic quality and safety

- [ ] 3.1 Test objectives without next steps, blocked plans, deadlines, inactivity, conflicts, unsupported inferred effects, postponement, and deduplication
- [ ] 3.2 Run semantic-quality cases for usefulness, explanation, interruption rate, and authority boundaries before enabling a background worker
- [ ] 3.3 Run typecheck, full tests, build, and strict OpenSpec validation
