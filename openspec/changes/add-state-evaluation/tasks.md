## 1. Add State contracts

- [ ] 1.1 Add modality, persisted State, condition AST, and immutable operator registry contracts under `src/core/state/`
- [ ] 1.2 Implement and test the initial equality, existence, temporal comparison, all, any, and not operators
- [ ] 1.3 Reject unknown operators, invalid operands, and overwritten key-version registrations

## 2. Add evaluation and persistence

- [ ] 2.1 Add `src/modules/state/` ports, memory storage, pure evaluator, and clock integration
- [ ] 2.2 Persist non-derivable modal State with author, evidence, validity, and confidence while deriving reconstructible State on demand
- [ ] 2.3 Add current, desired, required, forbidden, predicted, and unresolved projections and APIs

## 3. Verify

- [ ] 3.1 Cover persisted desire, derived overdue, composite conditions, conflicting modalities, and evidence retrieval in behavior tests
- [ ] 3.2 Measure representative evaluation paths and add indexes or dependency metadata where justified
- [ ] 3.3 Run typecheck, full tests, build, and strict OpenSpec validation

