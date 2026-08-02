## 1. Extend interpretation contracts

- [x] 1.1 Add closed versioned planning and reminder workflow draft types, validation, inference schema, and prompt context with an empty-list compatibility default
- [x] 1.2 Accept workflow-only and mixed knowledge/workflow interpretations while rejecting unknown kinds, malformed batches, invented operations, and cross-Entry evidence
- [x] 1.3 Cover valid drafts, unsupported effects, missing required values, temporal precision, and malformed output in contract tests

## 2. Route Entry workflows safely

- [x] 2.1 Add one memory-backed idempotent workflow outcome registry keyed by Entry and draft reference
- [x] 2.2 Route validated planning drafts through existing planning commands and retain Entry evidence without implicit Rules, Intents, or external effects
- [x] 2.3 Route complete reminder drafts through existing reminder commands with separate temporal and cadence policy; record `needsInput` or `unsupported` without execution when required data or Capabilities are absent
- [x] 2.4 Expose workflow outcomes with Entry status and verify retry does not duplicate Items, reminders, Rules, or Intent templates

## 3. Add the isolated smoke runner

- [x] 3.1 Materialize Entry-bank template variables, then add exact-text deterministic interpretation fixtures and observable expectations for every UTF-8 Entry in `docs/entries.md`
- [x] 3.2 Add an `npm run smoke` command that starts the authenticated loopback API with a fresh memory system, local adapters, polling worker, deterministic token, and guaranteed cleanup
- [x] 3.3 Report per-Entry processing, planning, reminder, unresolved, unsupported, unexpected-effect, API, and expectation outcomes and return nonzero on mismatch
- [x] 3.4 Run the smoke twice from clean processes and verify normalized parity with no PostgreSQL, migration, remote inference, external notification, or cross-run state

## 4. Verify and simplify

- [x] 4.1 Add behavior tests for captured tasks, habits, reminder deadlines, missing required values, unsupported event sources, quotations, ideas, and destructive requests
- [x] 4.2 Remove redundant routing helpers and keep infrastructure types behind adapter surfaces
- [x] 4.3 Run formatting, typecheck, full tests, build, smoke repetition, and strict OpenSpec validation
