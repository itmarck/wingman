## Why

Composable knowledge describes what Wingman stores, but the assistant also needs a small language for evaluating what is observed, believed, desired, required, forbidden, or predicted. State provides that reasoning layer without duplicating every derived condition in storage.

## What Changes

- Add modality-aware State conditions over Components, typed references, relationship Items, time, and closed composite operators.
- Derive State by default and persist only State whose modality, evidence, authorship, or history cannot be reconstructed.
- Add current, desired, required, forbidden, predicted, and unresolved State projections.
- Add a closed, versioned operator registry using unqualified immutable keys.

## Capabilities

### New Capabilities

- `state-evaluation`: Persist non-derivable State and deterministically evaluate derived State over the composable knowledge snapshot.

### Modified Capabilities

None.

## Impact

- Requires the archived `replace-knowledge-with-items` capability as its knowledge substrate.
- Adds core State contracts, evaluation services, projections, storage ports, and behavior tests without restoring Axioms.

