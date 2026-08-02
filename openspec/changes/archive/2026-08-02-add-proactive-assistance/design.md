## Context

This final additive change depends on the archived reminder workflow and all underlying capabilities. It generalizes safe proactivity after one vertical workflow has proven execution and user control.

## Goals / Non-Goals

**Goals:** deterministic opportunity detection, explainable suggestions, bounded autonomy, feedback, and interruption control.

**Non-Goals:** unrestricted agent loops, invented Capabilities, hidden execution, or automatic learning from rejection without explicit policy.

## Decisions

Add `src/modules/proactivity/` with detector definitions, dependency indexes, proposal queries, and feedback operations. Deterministic detectors cover missing next action, blocker duration, deadline risk, inactivity, conflict, and relevant new Event or knowledge. Each detector either instantiates a registered Rule or proposes an Intent; it never calls an adapter.

Proposals include detector, relevant State, evidence, rationale, urgency, expected effect, expiration, and autonomy resolution. Feedback is append-only and can adjust an explicit preference only through a separately validated operation.

Inference can rank or word registered proposals and can suggest a Draft detector or Rule for Review. It cannot register executable operators or exceed Capability safety ceilings.

## Risks / Trade-offs

- [Assistant becomes noisy] -> Apply cooldown, expiration, urgency, deduplication, quiet hours, and user feedback.
- [Inference invents authority] -> Resolve all effects through registered Capabilities and deterministic policy.
- [Feedback overfits one rejection] -> Preserve feedback as evidence and require explicit preference changes.

## Migration Plan

1. Add detector and proposal contracts.
2. Add dependency-driven evaluation and proposal projections.
3. Add autonomy resolution and feedback operations.
4. Test planning, deadline, blocker, inactivity, conflict, and unsupported-effect cases.
5. Run semantic-quality evaluation before enabling background processing.

Rollback disables proactive workers while leaving Rules, Intents, and feedback history readable.
