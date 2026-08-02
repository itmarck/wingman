## Context

`packages/evaluate` already runs three real-inference acceptance cases with a new memory system and in-memory telemetry per repetition. It currently has no deterministic lane, score model, cross-axis evidence, JSON output, case filtering, or safe default that avoids environment/provider access. The first baseline passed one of three cases: exact quote preservation failed and an unknown-author case exhausted retries after invalid structured output.

The runtime already exposes most evidence through authenticated HTTP, Entry workflow outcomes, projections, Rules, planning views, Intents, Attempts, and inference telemetry. The evaluator should consume those surfaces rather than add production-only metrics or state.

## Goals / Non-Goals

**Goals:**

- Make stopping criteria explicit and reproducible across the seven requested axes.
- Reuse observable system behavior and the existing evaluator package.
- Keep deterministic checks cheap enough to run on every iteration.
- Keep remote inference deliberate, bounded, attributable, and isolated.
- Make each failed check lead to a concrete file, API response, or semantic case.

**Non-Goals:**

- Production monitoring, analytics ingestion, dashboards, or persistent score history.
- A universal software-quality score or arbitrary static-analysis framework.
- Calling a language model to grade another model.
- Database, migration, connector, or delivery testing.
- Hiding product gaps by lowering thresholds after observing failures.

## Decisions

### Use checks, axes, and gates instead of one opaque score

Each check has an axis, weight, critical flag, pass/fail result, and concise evidence. An axis score is the weighted passing percentage. Local exit requires every local axis to score at least 90 and every critical check to pass. Real-model exit requires at least 80, no critical failure, and zero unstable cases when repeated. `notRun` remains distinct and is acceptable only for the optional real-model lane during a local run.

This keeps scores useful for trend and prioritization while preventing a high aggregate from masking a security failure. A single global score was rejected because unrelated easy checks could compensate for unsafe behavior.

### Extend `packages/evaluate` around a generic registry

The package will expose a small registry and report model shared by deterministic and real-model suites. Axis-specific scenario modules register checks; the runner owns execution, scoring, ordering, JSON/human formatting, and exit decisions. This is preferred over seven bespoke scripts and directly tests evolution: adding a scenario module does not modify scoring or formatting.

### Separate `quality` and `quality:real`

`npm run quality` is deterministic and never loads `.env`. It starts real loopback HTTP servers backed by fresh memory systems and local fixtures, and it performs bounded repository inspections for architectural simplicity. `npm run quality:real` loads configured inference and runs selected semantic cases. The existing `evaluate` command remains as a compatibility alias for the real lane until the change is archived.

An automatic fallback from local to remote was rejected because it makes cost, latency, data exposure, and reproducibility surprising.

### Measure behavior through public surfaces

Semantic, observability, HTTP, and security scenarios use the authenticated HTTP API wherever the relevant evidence is public. Direct module access is reserved for confirming the absence of internal executable effects that have no read endpoint and for static dependency checks. This exposes missing public diagnostics rather than making the evaluator depend on implementation internals.

### Keep simplicity metrics few and actionable

The deterministic simplicity checks are: no inward dependency violations from `src/core`, no production import cycles, no production TypeScript file above a documented line limit, and no axis-specific conditionals in the generic runner. These are imperfect proxies, but they are stable, explainable, and difficult to improve by adding abstractions.

### Grade the real model with exact expectations

Real-model cases use deterministic code assertions, not model-as-judge scoring. The suite covers exact quotes, unknown-reference Reviews, representative planning/reminder classification, unsupported event behavior, and destructive requests. Reports include pass rate, retries, structured-output failures, token usage, latency, and cross-repetition instability.

## Risks / Trade-offs

- [Static simplicity signals can be gamed or become stale] → Keep only a few architectural invariants, document limits beside checks, and require review before thresholds change.
- [Real-model outputs are stochastic] → Report repetitions and instability separately; require deterministic local gates before remote evaluation.
- [Remote evaluation can cost money or expose fixture text] → Require an explicit command, bounded case filters/repetitions, and only synthetic Entries.
- [A broad evaluator can duplicate tests] → Quality checks aggregate representative end-to-end evidence; detailed behavior remains in Vitest suites.
- [Exact thresholds can encourage superficial fixes] → Critical invariants cannot be averaged away and every score retains individual evidence.

## Migration Plan

1. Introduce the generic report and registry while preserving the current real cases.
2. Add deterministic axis modules and package scripts.
3. Establish the baseline without changing thresholds.
4. Fix the highest-impact failed checks in separate iterations and commits.
5. Run local quality twice and the bounded real lane at least twice before declaring exit.

Rollback removes the new package modules and scripts; no persistent or production data requires migration.

## Open Questions

- Whether CI should later require the real-model lane; this change keeps it manual because credentials, cost, and provider variance differ by environment.
- Whether score history should later be stored as CI artifacts; current reports are intentionally ephemeral.
