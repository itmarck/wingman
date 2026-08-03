## 1. Extend interpretation contracts

- [x] 1.1 Add closed versioned planning and reminder workflow drafts to types, schema, and prompt context
- [x] 1.2 Accept workflow-only and mixed interpretations while rejecting unknown kinds and malformed batches
- [x] 1.3 Treat placeholders as materialized caller input and reserve unresolved fields for genuinely missing values

## 2. Route Entry workflows safely

- [x] 2.1 Add a memory-backed idempotent outcome registry keyed by Entry and draft reference
- [x] 2.2 Route planning drafts through existing commands while retaining Entry evidence
- [x] 2.3 Route complete reminder drafts with separate temporal and cadence policy
- [x] 2.4 Record `needsInput` or `unsupported` without execution when required data or Capabilities are absent
- [x] 2.5 Expose workflow outcomes through Entry status and prevent duplicates on retry

## 3. Verify and simplify

- [x] 3.1 Cover captured tasks, habits, reminders, genuine missing values, unsupported events, and malformed output
- [x] 3.2 Remove redundant routing helpers and keep infrastructure types behind adapter surfaces
- [x] 3.3 Verify formatting, typecheck, tests, build, and semantic evaluation
