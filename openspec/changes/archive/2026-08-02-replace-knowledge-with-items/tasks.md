## 1. Lock legacy behavior

- [x] 1.1 Add framework-neutral fixtures for identity, literal knowledge, rich relationships, exact citations, supersession, conflicting candidates, and reference Reviews
- [x] 1.2 Document the one-to-one replacement mapping for Concept, Predicate, Axiom, Link, current views, and interpretation Draft fields

## 2. Build the composable core

- [x] 2.1 Add Item, Component revision, schema registry, Profile, typed reference, evidence, and validity contracts under `src/core/item/`
- [x] 2.2 Reject namespaced or duplicate key-version registrations and require explicit versions for incompatible schema changes
- [x] 2.3 Add relationship Item and revision-selection invariants with behavior tests

## 3. Replace knowledge operations

- [x] 3.1 Replace `src/modules/knowledge/` ports and memory storage with atomic Item and Component revision operations
- [x] 3.2 Replace interpretation Draft, validation, registration, identity resolution, and generic Review publication with the new structures
- [x] 3.3 Replace current knowledge and glossary projections plus affected HTTP schemas and behavior tests

## 4. Cut over and remove legacy

- [x] 4.1 Run test-only parity translation across every locked fixture and resolve all semantic differences
- [x] 4.2 Switch system composition so every supported knowledge read and write uses the Item model
- [x] 4.3 Delete Concept, Predicate, Axiom, Link, their ports, stores, projections, schemas, and compatibility-only tests
- [x] 4.4 Run typecheck, full tests, build, and strict OpenSpec validation with no legacy runtime import remaining
