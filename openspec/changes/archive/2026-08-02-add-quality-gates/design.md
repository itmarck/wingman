## Context

`packages/evaluate` runs semantic acceptance cases with the configured inference adapter and a fresh memory system per case. Wingman also needs inexpensive structural evidence, but the public command surface should remain small and ordinary tests must not depend on credentials, quota, latency, or provider availability.

## Goals / Non-Goals

**Goals:**

- Produce one complete quality report from one explicit evaluation command.
- Keep unit tests deterministic and token-free.
- Preserve bounded real-model cases, fresh memory state, and ephemeral telemetry.
- Keep every failed score traceable to concise evidence.

**Non-Goals:**

- A scripted deterministic smoke runner or model simulator.
- Production monitoring, persistent score history, database testing, or connector delivery.
- Automatic provider fallback or hiding provider failures.

## Decisions

### Separate testing from evaluation by cost and determinism

`npm test` runs only Vitest. `npm run evaluate` explicitly loads `.env`, runs structural checks, and executes semantic cases through the configured real inference adapter. This makes token consumption intentional while ensuring authentication, quota, availability, and semantic failures remain visible through a nonzero evaluation exit.

### Use one complete report

Each check has an axis, weight, critical flag, pass/fail result, and evidence. The evaluator combines all seven axes in one report instead of exposing local and real variants. Local axes require a score of at least 90; real-model quality requires at least 80. Any critical failure fails the command.

### Keep real evaluation isolated and bounded

Every semantic case owns a fresh in-memory system and in-memory telemetry. Filters, repetition count, attempt count, and timeout bound provider usage. Evaluation never persists Entries, prompts, or telemetry and has no automatic fallback.

### Measure stable surfaces

Structural checks inspect dependency direction, cycles, file size, HTTP contracts, trusted origin, workflow observability, and evaluator extensibility. Semantic cases assert exact observable outcomes for quotations, Reviews, planning, reminders, unsupported capabilities, and destructive requests.

## Risks / Trade-offs

- [Provider variance makes evaluation non-deterministic] → Report model identity, failures, repetitions, and instability; keep it outside `npm test`.
- [Evaluation can consume quota] → Require an explicit command and bounded options.
- [Static simplicity signals are imperfect] → Keep them few, documented, and actionable.
- [Structural checks can overlap tests] → Retain only representative cross-cutting evidence rather than duplicating detailed behavior suites.

## Migration Plan

1. Consolidate quality reporting and semantic cases under `npm run evaluate`.
2. Restore `npm test` to deterministic Vitest execution.
3. Remove obsolete quality variants and deterministic smoke fixtures.
4. Verify typecheck, tests, build, and a bounded real-model case.
